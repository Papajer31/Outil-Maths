import { loadToolsRuntime } from "./tool-root-runtime.js";
import {
  DEFAULT_ACTIVITY_GLOBALS,
  clampInt,
  cloneData,
  getCommonSuccessGoalSettings,
  normalizeActivityGlobals,
  normalizeProgressMode,
  normalizeResponseUi,
  normalizeToolDraft,
  normalizeActivitySequence
} from "./activity-config.js";
import {
  DEFAULT_ACTIVITY_MODE,
  normalizeActivityMode
} from "./activity-modes.js";
import {
  createToolActivityRuntime,
  getToolRunProfile as getContractToolRunProfile,
  getToolRuntimeCapabilities
} from "./tool-contract.js";
import { getCatalogLevelConfig, normalizeCatalogDifficultyLevel } from "./catalogue.js";

export function createSessionEngine({
  els,
  accessCode,
  configName,
  moduleKey,
  globals,
  sequence,
  onExitToActivities,
  onFatalError,
  onStateChange,
  onSessionFinished,
  manualControlsEnabled = true,
  runMode = "student",
  activityMode = DEFAULT_ACTIVITY_MODE,
  responseUi = null,
  progressMode = null
}) {
  let toolsCatalog = [];
  let session = [];
  let currentToolIndex = -1;
  let currentQuestionIndex = -1;

  let activeTool = null;
  let questionTimer = null;
  let answerTimer = null;
  let transitionTimer = null;
  let gaugeRaf = null;
  let gaugeStart = 0;
  let gaugeDurationMs = 0;
  let gaugeCurrentScale = 1;
  let manualActionHandler = null;

  let paused = false;
  let engineState = "IDLE";
  let isSessionRunning = false;
  let phase = createPhase("IDLE");
  let pausedPhase = null;

  const toolModuleCache = new Map();

  let moduleRuntime = null;
  let selectedStudent = null;
  let selectedStudents = [];
  let groupScores = new Map();
  let sessionRequiresStudent = false;
  let allowedStudentIds = [];
  let sessionBlockingMessage = "";
  let activeRuntime = null;
  let activityClockStartedAt = 0;
  let activityClockElapsedBeforePauseMs = 0;
  let activityClockPaused = true;
  let toolClockStartedAt = 0;
  let toolClockElapsedBeforePauseMs = 0;
  let toolClockPaused = true;
  let finalChallengeTicker = null;
  let toolMaxTimeTicker = null;
  let toolMaxTimeAdvancePending = false;
  let sessionFinishedNotified = false;

  const GAUGE_EPSILON = 1e-6;
  const GAUGE_PROGRESS_PRECISION = 1000;

  const activityGlobals = {
    ...DEFAULT_ACTIVITY_GLOBALS,
    ...normalizeActivityGlobals(globals)
  };
  const isCatalogTestSession = isCatalogTestSequence(sequence);
  if (isCatalogTestSession) {
    activityGlobals.activityTotalTimeEnabled = false;
  }
  const sessionActivityMode = normalizeActivityMode(activityMode, DEFAULT_ACTIVITY_MODE);
  const sessionResponseUi = normalizeResponseUi(responseUi, "boxed");
  const sessionProgressMode = normalizeProgressMode(progressMode, "evaluated");
  const sessionPassationProfile = {
    activityMode: sessionActivityMode,
    responseUi: sessionResponseUi,
    progressMode: sessionProgressMode
  };

  function emitStateChange() {
    onStateChange?.(getUiState());
  }

  function wait(ms = 0) {
    return new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, Math.floor(Number(ms) || 0)));
    });
  }

  function isCatalogTestSequence(value) {
    return (Array.isArray(value) ? value : []).some((item) => (
      String(item?.catalog_context ?? item?.catalogContext ?? "").trim().toLowerCase() === "test"
    ));
  }

  function normalizeGaugeProgress(value) {
    return Math.max(
      0,
      Math.min(1, Math.round((Number(value) || 0) * GAUGE_PROGRESS_PRECISION) / GAUGE_PROGRESS_PRECISION)
    );
  }

  return {
    init,
    openStartOverlay,
    startSession,
    pauseForInterruption,
    resumeAfterPause,
    handleManualAction,
    goToPreviousTool,
    goToNextTool,
    goToToolByInstanceId,
    revealAnswerNow,
    triggerShellValidate,
    goToNextQuestionNow,
    applyLiveConfig,
    getUiState,
    getSessionSummary,
    toggleShellAnswerDisplay,
    isRunning,
    isPaused,
    stop,
    getSessionMeta,
    getGroupScores,
    setSelectedStudent,
    setSelectedStudents
  };

  async function goToPreviousTool() {
    if (paused || toolMaxTimeAdvancePending) return false;

    const item = session[currentToolIndex];
    if (item && phase.kind !== "BETWEEN_TOOLS" && isToolMaxTimeReached(item)) {
      void enforceCurrentToolMaxTime();
      return false;
    }

    return jumpToTool(currentToolIndex - 1);
  }

  async function goToNextTool() {
    if (paused || toolMaxTimeAdvancePending) return false;

    const currentItem = session[currentToolIndex];
    if (currentItem && phase.kind !== "BETWEEN_TOOLS" && isToolMaxTimeReached(currentItem)) {
      void enforceCurrentToolMaxTime();
      return false;
    }

    if (phase.kind === "BETWEEN_TOOLS") {
      const item = session[currentToolIndex];
      if (!item) return false;

      try {
        await beginTool(item);
        emitStateChange();
        return true;
      } catch (err) {
        onFatalError?.(err?.message || "Erreur pendant le chargement de l’outil.");
        return false;
      }
    }

    return jumpToTool(currentToolIndex + 1);
  }

  function revealAnswerNow() {
    if (paused || !isSessionRunning) return false;

    const item = session[currentToolIndex];
    if (!item || phase.kind !== "QUESTION" || item.hasAnswerPhase === false) {
      return false;
    }

    if (isToolMaxTimeExpiredOrAdvancing(item)) {
      void enforceCurrentToolMaxTime();
      return false;
    }

    beginAnswerPhase(item, item.infiniteAnswerTime ? Number.POSITIVE_INFINITY : item.answerTime * 1000, { showAnswerNow: true });
    emitStateChange();
    return true;
  }

  function triggerShellValidate() {
    if (paused || !isSessionRunning) return false;

    const item = session[currentToolIndex];
    if (!item || phase.kind !== "QUESTION") {
      return false;
    }

    if (isToolMaxTimeExpiredOrAdvancing(item)) {
      void enforceCurrentToolMaxTime();
      return false;
    }

    if (!shouldUseShellValidation(item)) {
      return false;
    }

    try {
      return activeRuntime?.validate?.(els.workArea, getToolContext(item)) === true;
    } catch (err) {
      onFatalError?.(err?.message || "Erreur pendant la validation.");
      return false;
    }
  }

  async function goToNextQuestionNow() {
    if (paused || !isSessionRunning) return false;

    const item = session[currentToolIndex];
    if (!item) return false;

    if (isToolMaxTimeExpiredOrAdvancing(item)) {
      await enforceCurrentToolMaxTime();
      return false;
    }

    try {
      if (phase.kind === "TRANSITION") {
        beginQuestionPhase(item, item.timePerQ * 1000, { generateQuestion: true });
        emitStateChange();
        return true;
      }

      if (phase.kind === "ANSWER" && shouldUseGroupAnswerAttribution(item)) {
        openGroupAnswerAttributionOverlay(item);
        emitStateChange();
        return true;
      }

      if (phase.kind === "QUESTION" || phase.kind === "ANSWER") {
        await nextQuestion(item, false);
        emitStateChange();
        return true;
      }
    } catch (err) {
      onFatalError?.(err?.message || "Erreur pendant la séance.");
    }

    return false;
  }

  async function jumpToTool(targetIndex) {
    const safeIndex = Math.floor(Number(targetIndex));

    if (!Number.isInteger(safeIndex)) return false;
    if (safeIndex < 0 || safeIndex >= session.length) return false;

    stopAllTimers();
    clearSessionStage();
    hideManualAction();
    hideTimer();

    paused = false;
    pausedPhase = null;
    isSessionRunning = true;

    if (activeRuntime?.unmount) {
      try {
        await activeRuntime.unmount(els.workArea, getToolContext(session[currentToolIndex]));
      } catch {}
    }

    activeTool = null;
    activeRuntime = null;
    applyWorkAreaLayout(null);
    currentToolIndex = safeIndex;
    currentQuestionIndex = -1;

    try {
      await beginTool(session[currentToolIndex]);
      emitStateChange();
      return true;
    } catch (err) {
      onFatalError?.(err?.message || "Erreur pendant le chargement de l’outil.");
      return false;
    }
  }

  async function goToToolByInstanceId(instanceId) {
    const safeInstanceId = String(instanceId || "").trim();
    if (!safeInstanceId) return false;

    const targetIndex = session.findIndex((item) => String(item.instanceId || "") === safeInstanceId);
    if (targetIndex < 0) return false;

    return jumpToTool(targetIndex);
  }

  async function applyLiveConfig({ globals: nextGlobals = {}, sequence: nextSequence = [] } = {}) {
    const safeSequence = normalizeActivitySequence(nextSequence, {
      toolsCatalog,
      fallbackGlobals: nextGlobals
    });

    if (safeSequence.length !== session.length) {
      return false;
    }

    for (let index = 0; index < safeSequence.length; index += 1) {
      const nextItem = safeSequence[index];
      const currentItem = session[index];
      if (!currentItem) return false;
      if (String(nextItem.instanceId || "") !== String(currentItem.instanceId || "")) return false;
      if (String(nextItem.toolId || "") !== String(currentItem.id || "")) return false;
    }

    Object.assign(activityGlobals, normalizeActivityGlobals(nextGlobals));
    await prepareSessionFromSequence(safeSequence);

    for (let index = 0; index < session.length; index += 1) {
      await refreshComputedSessionValues(session[index]);
    }

    emitStateChange();
    return true;
  }

  async function refreshComputedSessionValues(item) {
    if (!item) return;

    const mod = await loadToolModule(item.id);
    const tool = mod.default ?? {};
    refreshComputedSessionValuesWithTool(item, tool);
  }

  function refreshComputedSessionValuesWithTool(item, tool) {
    if (!item) return;

    const instructionMeta = getToolInstructionMeta(tool);

    item.questionCount = item.draftQuestionCount;
    item.timePerQ = item.draftTimePerQ;
    item.answerTime = item.draftAnswerTime;
    item.questionTransitionSec = item.draftQuestionTransitionSec;
    item.questionTransitionInfinite = item.draftQuestionTransitionInfinite === true;
    item.toolMaxTimeMin = item.draftToolMaxTimeMin;
    item.toolMaxTimeInfinite = item.draftToolMaxTimeInfinite === true;
    item.questionFlowMode = item.draftQuestionFlowMode || "fixed";
    item.infiniteTimePerQ = item.draftInfiniteTimePerQ === true;
    item.infiniteAnswerTime = item.draftInfiniteAnswerTime === true;
    item.defaultInstruction = instructionMeta.defaultInstruction;
    item.supportsCustomInstruction = instructionMeta.supportsCustomInstruction;

    const ctx = getToolContext(item);

    if (item.questionFlowMode === "fixed" && typeof tool.getQuestionCount === "function") {
      const nextQuestionCount = tool.getQuestionCount(ctx);

      if (nextQuestionCount === Number.POSITIVE_INFINITY) {
        item.questionFlowMode = "unlimited";
      } else {
        item.questionCount = clampInt(
          nextQuestionCount,
          1,
          999,
          item.questionCount
        );
      }
    }

    if (!item.infiniteTimePerQ && typeof tool.getQuestionTime === "function") {
      const nextQuestionTime = tool.getQuestionTime(ctx);

      if (nextQuestionTime === Number.POSITIVE_INFINITY) {
        item.infiniteTimePerQ = true;
      } else {
        item.timePerQ = clampInt(
          nextQuestionTime,
          1,
          300,
          item.timePerQ
        );
      }
    }

    applyCatalogTestRuntimeSettings(item);

    if (isFinalChallengeItem(item)) {
      item.questionFlowMode = "unlimited";
      item.evaluationGauge = null;
    }
  }

  function getSessionSummary() {
    return buildSessionSummary();
  }

  function buildSessionSummary() {
    return {
      context: String(sequence?.[0]?.catalog_context || "").trim() || "",
      durationMs: Math.max(0, Math.round(getActivityElapsedMs())),
      items: session.map((item) => {
        const stats = item?.progressSessionStats || { questions: 0, correct: 0 };
        const questionsCount = Math.max(0, Math.floor(Number(stats.questions) || 0));
        const correctCount = Math.max(0, Math.min(questionsCount, Math.floor(Number(stats.correct) || 0)));
        return {
          catalogActivityId: String(item?.catalogActivityId || "").trim(),
          context: String(item?.catalogContext || "").trim() || "exploration",
          startedLevel: normalizeCatalogDifficultyLevel(item?.catalogStartedLevel ?? 3),
          endedLevel: normalizeCatalogDifficultyLevel(item?.catalogCurrentLevel ?? item?.catalogStartedLevel ?? 3),
          questionsCount,
          correctCount,
          wrongCount: Math.max(0, questionsCount - correctCount),
          durationMs: Math.max(0, Math.round(getActivityElapsedMs()))
        };
      })
    };
  }

  function notifySessionFinishedOnce(summary) {
    if (sessionFinishedNotified) return;
    sessionFinishedNotified = true;
    if (typeof onSessionFinished !== "function") return;
    try {
      onSessionFinished(summary);
    } catch {}
  }


  function getUiState() {
    const item = session[currentToolIndex] ?? null;
    const betweenTools = phase.kind === "BETWEEN_TOOLS";
    const toolMaxTimeExpired = isToolMaxTimeExpiredOrAdvancing(item);
    const shellValidation = getShellValidationState(item);
    const shellAnswerToggle = getShellAnswerToggleState(item);
    const projectedPrimaryAction = getProjectedPrimaryActionState(item, shellValidation);

    return {
      running: isSessionRunning,
      paused,
      phase: phase.kind,
      activityMode: sessionActivityMode,
      responseUi: sessionResponseUi,
      progressMode: sessionProgressMode,
      currentToolIndex,
      totalTools: session.length,
      currentInstanceId: String(item?.instanceId || ""),
      currentQuestionNumber: currentQuestionIndex >= 0 ? currentQuestionIndex + 1 : 0,
      questionCount: item?.questionCount ?? 0,
      questionFlowMode: item?.questionFlowMode || "fixed",
      totalQuestionCountLabel: item ? (item.questionFlowMode === "fixed" ? String(item.questionCount || 0) : "∞") : "—",
      finalChallenge: getFinalChallengeUiState(item),
      toolTime: getToolTimeUiState(item),
      evaluationGauge: getEvaluationGaugeUiState(item),
      evaluationCounter: getEvaluationCounterUiState(item),
      fixedQuestionCounter: getFixedQuestionCounterUiState(item),
      canGoPrevTool: !paused && !toolMaxTimeAdvancePending && currentToolIndex > 0,
      canGoNextTool: !paused && !toolMaxTimeAdvancePending && (betweenTools ? currentToolIndex < session.length : currentToolIndex < (session.length - 1)),
      canRevealAnswer: !paused && !toolMaxTimeExpired && !!item && phase.kind === "QUESTION" && item.hasAnswerPhase !== false && shellValidation.visible !== true,
      canAdvanceQuestion: !paused && !toolMaxTimeExpired && !!item && (phase.kind === "QUESTION" || phase.kind === "ANSWER" || phase.kind === "TRANSITION"),
      shellValidateVisible: shellValidation.visible === true,
      shellValidateEnabled: shellValidation.enabled === true,
      shellAnswerToggleVisible: shellAnswerToggle.visible === true,
      shellAnswerToggleEnabled: shellAnswerToggle.enabled === true,
      shellAnswerToggleLabel: shellAnswerToggle.label,
      shellAnswerToggleIcon: shellAnswerToggle.icon,
      projectedPrimaryActionKind: projectedPrimaryAction.kind,
      projectedPrimaryActionLabel: projectedPrimaryAction.label,
      projectedPrimaryActionIcon: projectedPrimaryAction.icon,
      projectedPrimaryActionEnabled: projectedPrimaryAction.enabled === true
    };
  }


  function isBoxedResponseProfile() {
    return sessionResponseUi === "boxed";
  }

  function isEvaluatedProfile() {
    return sessionProgressMode === "evaluated";
  }

  function isBoxedEvaluatedProfile() {
    return isBoxedResponseProfile() && isEvaluatedProfile();
  }

  function runtimeSupportsShellValidation(item) {
    if (!item || !activeRuntime || session[currentToolIndex] !== item) return false;
    if (typeof activeRuntime.supportsShellValidation !== "function") return false;

    try {
      return activeRuntime.supportsShellValidation(getToolContext(item)) === true;
    } catch {
      return false;
    }
  }

  function shouldUseShellValidation(item) {
    if (!item || !isBoxedResponseProfile()) return false;
    return runtimeSupportsShellValidation(item);
  }

  function getShellValidationState(item) {
    if (!item || paused || phase.kind !== "QUESTION") {
      return { visible: false, enabled: false };
    }

    if (isToolMaxTimeExpiredOrAdvancing(item)) {
      return { visible: shouldUseShellValidation(item), enabled: false };
    }

    if (!shouldUseShellValidation(item)) {
      return { visible: false, enabled: false };
    }

    let enabled = false;
    try {
      enabled = activeRuntime?.canValidate?.(els.workArea, getToolContext(item)) === true;
    } catch {
      enabled = false;
    }

    return {
      visible: true,
      enabled
    };
  }

  function normalizeShellAnswerDisplayMode(value) {
    return String(value || "").trim().toLowerCase() === "student" ? "student" : "correction";
  }

  function getShellAnswerToggleState(item) {
    const hiddenState = {
      visible: false,
      enabled: false,
      mode: "correction",
      label: "Voir ma réponse",
      icon: "sync"
    };

    if (!item || !isBoxedResponseProfile() || !activeRuntime || session[currentToolIndex] !== item || phase.kind !== "ANSWER") {
      return hiddenState;
    }

    if (
      typeof activeRuntime.getShellAnswerDisplayState !== "function"
      || typeof activeRuntime.setShellAnswerDisplayMode !== "function"
    ) {
      return hiddenState;
    }

    try {
      const runtimeState = activeRuntime.getShellAnswerDisplayState(els.workArea, getToolContext(item));
      if (!runtimeState || typeof runtimeState.then === "function") {
        return hiddenState;
      }

      const canToggle = runtimeState.canToggle === true;
      const mode = normalizeShellAnswerDisplayMode(runtimeState.mode);

      return {
        visible: canToggle,
        enabled: canToggle && !paused,
        mode,
        label: mode === "student" ? "Voir la correction" : "Voir ma réponse",
        icon: "sync"
      };
    } catch {
      return hiddenState;
    }
  }

  async function applyShellAnswerDisplayMode(item, mode) {
    if (!item || !activeRuntime || session[currentToolIndex] !== item) {
      return false;
    }

    if (typeof activeRuntime.setShellAnswerDisplayMode !== "function") {
      return false;
    }

    try {
      const result = activeRuntime.setShellAnswerDisplayMode(
        els.workArea,
        getToolContext(item),
        normalizeShellAnswerDisplayMode(mode)
      );

      if (result && typeof result.then === "function") {
        await result;
        return true;
      }

      return result !== false;
    } catch (err) {
      onFatalError?.(err?.message || "Erreur pendant l’affichage de la réponse.");
      return false;
    }
  }

  async function toggleShellAnswerDisplay() {
    if (!isSessionRunning) {
      return false;
    }

    const item = session[currentToolIndex];
    const shellAnswerToggle = getShellAnswerToggleState(item);
    if (!item || shellAnswerToggle.visible !== true || shellAnswerToggle.enabled !== true) {
      return false;
    }

    const nextMode = shellAnswerToggle.mode === "student" ? "correction" : "student";
    const didToggle = await applyShellAnswerDisplayMode(item, nextMode);

    if (didToggle) {
      emitStateChange();
    }

    return didToggle;
  }

  function getProjectedPrimaryActionState(item, shellValidation = getShellValidationState(item)) {
    if (!item || runMode !== "projected-teacher") {
      return { kind: "answer", label: "Réponse", icon: "visibility", enabled: false };
    }

    if (isToolMaxTimeExpiredOrAdvancing(item)) {
      return { kind: "answer", label: "Réponse", icon: "visibility", enabled: false };
    }

    if (shellValidation.visible === true) {
      return {
        kind: "validate",
        label: "Valider",
        icon: "task_alt",
        enabled: shellValidation.enabled === true
      };
    }

    return {
      kind: "answer",
      label: "Réponse",
      icon: "visibility",
      enabled: !paused && phase.kind === "QUESTION" && item.hasAnswerPhase !== false
    };
  }

  async function init() {
    moduleRuntime = await loadToolsRuntime(moduleKey);
    toolsCatalog = await moduleRuntime.loadToolsCatalog();

    const safeSequence = normalizeActivitySequence(sequence, {
      toolsCatalog,
      fallbackGlobals: globals
    });

    await prepareSessionFromSequence(safeSequence);

    if (!session.length) {
      throw new Error("Cette configuration ne contient aucun outil actif.");
    }

    emitStateChange();
  }

  async function openStartOverlay(){
    await startSession();
  }

  function isRunning() {
    return isSessionRunning;
  }

  function isPaused() {
    return paused;
  }

  function stop() {
    stopAllTimers();
    stopFinalChallengeTicker();
    stopToolMaxTimeTicker();

    if (activeRuntime?.unmount) {
      try {
        void activeRuntime.unmount(els.workArea, getToolContext(session[currentToolIndex]));
      } catch {}
    }

    isSessionRunning = false;
    paused = false;
    pausedPhase = null;
    resetActivityClock();
    resetToolClock();
    engineState = "IDLE";
    phase = createPhase("IDLE");
    activeTool = null;
    activeRuntime = null;
    hideTimer();
    hideManualAction();
    clearWorkArea();
    emitStateChange();
  }

  async function startSession() {
    sessionFinishedNotified = false;
    if (sessionBlockingMessage) {
      onFatalError?.(sessionBlockingMessage);
      return;
    }

    const hasSingleSelection = !!selectedStudent;
    const hasGroupSelection = Array.isArray(selectedStudents) && selectedStudents.length >= 2;

    if (sessionRequiresStudent && !hasSingleSelection && !hasGroupSelection) {
      onFatalError?.("Aucun élève sélectionné pour cette activité.");
      return;
    }

    currentToolIndex = -1;
    currentQuestionIndex = -1;
    resetSessionGaugeStates();
    resetGroupScores();
    resetToolClock();
    startActivityClock();
    isSessionRunning = true;
    paused = false;
    pausedPhase = null;
    engineState = "IDLE";
    phase = createPhase("IDLE");
    emitStateChange();

    try {
      await nextTool(true);
    } catch (err) {
      onFatalError?.(err?.message || "Erreur pendant la séance.");
    }
  }

  async function nextTool(isFirst) {
    stopAllTimers();
    stopToolMaxTimeTicker();

    if (activeRuntime?.unmount) {
      try {
        await activeRuntime.unmount(els.workArea, getToolContext(session[currentToolIndex]));
      } catch {}
    }
    activeTool = null;
    activeRuntime = null;
    applyWorkAreaLayout(null);

    currentToolIndex += 1;
    currentQuestionIndex = -1;

    if (currentToolIndex >= session.length) {
      finishSession({ title: "Bravo, la séance est terminée." });
      return;
    }

    const item = session[currentToolIndex];
    if (isFinalChallengeItem(item) && getActivityTotalRemainingMs() <= 0) {
      finishSession({ title: "Temps écoulé — la séance est terminée." });
      return;
    }

    setStatus(`${item.title} — prêt`, "warn");

    if (!isFirst) {
      openNextToolOverlay(item);
      emitStateChange();
      return;
    }

    await beginTool(item);
    emitStateChange();
  }

  function getWorkAreaLayoutForTool(tool) {
    const raw = String(tool?.workAreaLayout ?? tool?.meta?.workAreaLayout ?? "").trim().toLowerCase();
    return raw === "stretch" ? "stretch" : "center";
  }

  function applyWorkAreaLayout(tool = null) {
    if (!els.workArea) return;

    const layout = getWorkAreaLayoutForTool(tool);
    els.workArea.dataset.layoutMode = layout;
    els.workArea.classList.toggle("session-workarea-stretch", layout === "stretch");
  }

  async function beginTool(item) {
    stopAllTimers();
    stopToolMaxTimeTicker();
    toolMaxTimeAdvancePending = false;

    const mod = await loadToolModule(item.id);
    activeTool = mod.default ?? {};
    const ctx = getToolContext(item);

    refreshComputedSessionValuesWithTool(item, activeTool);
    startToolClock();

    if (isFinalChallengeItem(item)) {
      ensureFinalChallengeStarted(item);
      if (getActivityTotalRemainingMs() <= 0) {
        finishSession({ title: "Temps écoulé — la séance est terminée." });
        return;
      }
      startFinalChallengeTicker();
    } else {
      stopFinalChallengeTicker();
    }

    const runProfile = getToolRunProfile(activeTool, item);
    if (runProfile.blockingMessage) {
      throw new Error(runProfile.blockingMessage);
    }

    activeRuntime = createToolActivityRuntime(activeTool, ctx);
    applyWorkAreaLayout(activeTool);

    await activeRuntime.mount(els.workArea, ctx);
    startToolMaxTimeTicker();

    await nextQuestion(item, true);
  }

  async function nextQuestion(item, isFirstQuestion) {
    stopAllTimers();

    if (isFinalChallengeItem(item) && getActivityTotalRemainingMs() <= 0) {
      finishSession({ title: "Temps écoulé — la séance est terminée." });
      return;
    }

    if (!isFirstQuestion) {
      const completedByGauge = commitCurrentQuestionOutcomeOnce(item);
      emitStateChange();
      if (completedByGauge) {
        await wait(700);
        hideTimer();
        hideManualAction();
        await nextTool(false);
        return;
      }

      if (isToolMaxTimeReached(item)) {
        hideTimer();
        hideManualAction();
        await nextTool(false);
        return;
      }
    }

    currentQuestionIndex += 1;

    if (item.questionFlowMode === "fixed" && currentQuestionIndex >= item.questionCount) {
      hideTimer();
      hideManualAction();
      await nextTool(false);
      return;
    }

    if (!isFirstQuestion) {
      beginQuestionTransition(item);
      emitStateChange();
      return;
    }

    beginQuestionPhase(item, item.timePerQ * 1000, { generateQuestion: true });
    emitStateChange();
  }

  function pauseForInterruption() {
    if (!isSessionRunning) return;
    if (phase.kind === "GROUP_ATTRIBUTION") return;
    if (paused) return;

    const snap = captureCurrentPhase();
    pausedPhase = snap.kind === "QUESTION"
      ? { ...snap, gaugeScale: getGaugeScale() }
      : snap;
    paused = true;
    engineState = "PAUSED";
    pauseActivityClock();
    pauseToolClock();
    stopFinalChallengeTicker();
    stopToolMaxTimeTicker();

    stopAllTimers();

    hideManualAction();

    if (snap.kind === "QUESTION" && Number.isFinite(snap.remainingMs)) {
      setTimerPhase("question");
      showTimer();
    } else if (snap.kind === "ANSWER" && Number.isFinite(snap.remainingMs)) {
      setTimerPhase("answer");
      showTimer();
    } else {
      hideTimer();
    }

    renderPauseStage();
    setStatus("PAUSE", "warn");
    emitStateChange();
  }

  function resumeAfterPause() {

    if (!paused) return;

    paused = false;

    if (!isSessionRunning) {
      pausedPhase = null;
      return;
    }

    const item = session[currentToolIndex];
    if (!item) {
      pausedPhase = null;
      return;
    }

    resumeActivityClock();
    resumeToolClock();
    startToolMaxTimeTicker();
    if (isFinalChallengeItem(item)) {
      if (getActivityTotalRemainingMs() <= 0) {
        finishSession({ title: "Temps écoulé — la séance est terminée." });
        pausedPhase = null;
        return;
      }
      startFinalChallengeTicker();
    }

    const snap = pausedPhase ?? createPhase("IDLE");
    pausedPhase = null;

    switch (snap.kind) {
      case "QUESTION":
        beginQuestionPhase(item, snap.remainingMs, {
          generateQuestion: false,
          initialGaugeScale: snap.gaugeScale
        });
        return;

      case "ANSWER":
        beginAnswerPhase(item, snap.remainingMs, { showAnswerNow: false });
        return;

      case "TRANSITION":
        beginQuestionTransition(item, snap.remainingMs);
        return;

      case "BETWEEN_TOOLS":
        openNextToolOverlay(item);
        return;

      default:
        engineState = "RUNNING_QUESTION";
        phase = createPhase("IDLE");
        emitStateChange();
        return;
    }
  }

  function beginQuestionPhase(item, durationMs, {
    generateQuestion = false,
    initialGaugeScale = null
  } = {}) {
    stopAllTimers();

    if (!activeTool || !item) return;

    clearSessionStage();
    hideManualAction();

    if (generateQuestion) {
      syncCatalogAdaptiveLevelConfig(item);
      refreshComputedSessionValuesWithTool(item, activeTool);
      durationMs = item.infiniteTimePerQ ? Number.POSITIVE_INFINITY : item.timePerQ * 1000;
    }

    const remainingMs = clampPhaseDuration(durationMs);
    const ctx = getToolContext(item);


    if (generateQuestion) {
      const runProfile = getToolRunProfile(activeTool, item);
      if (runProfile.blockingMessage) {
        onFatalError?.(runProfile.blockingMessage);
        return;
      }

      const runtimeForQuestion = activeRuntime;
      const maybePromise = runtimeForQuestion?.next?.(els.workArea, ctx);

      if (maybePromise && typeof maybePromise.then === "function") {
        engineState = "LOADING_QUESTION";
        phase = createPhase("IDLE");
        hideTimer();
        setStatus(`${item.title} — chargement…`, "warn");

        emitStateChange();

        Promise.resolve(maybePromise)
          .then(() => {
            if (!isSessionRunning || paused) return;
            if (session[currentToolIndex] !== item || activeRuntime !== runtimeForQuestion) return;
            if (isToolMaxTimeExpiredOrAdvancing(item)) {
              void enforceCurrentToolMaxTime();
              return;
            }
            beginQuestionPhase(item, remainingMs, {
              generateQuestion: false,
              initialGaugeScale
            });
          })
          .catch((err) => {
            onFatalError?.(err?.message || "Erreur pendant la séance.");
          });
        return;
      }
    }

    engineState = "RUNNING_QUESTION";
    phase = createPhase("QUESTION", item.infiniteTimePerQ ? Number.POSITIVE_INFINITY : remainingMs);
    item.currentQuestionResolvedCorrectly = false;
    item.currentQuestionOutcomeCommitted = false;
    item.lastQuestionOutcome = "pending";
    setStatus(`${item.title} — ${currentQuestionIndex + 1}/${item.questionFlowMode === "fixed" ? item.questionCount : "∞"}`);

    if (item.infiniteTimePerQ) {
      hideTimer();

      if (item.usesCustomQuestionFlow === true) {
        refreshShellManualAction(item);
        emitStateChange();
        return;
      }

      refreshShellManualAction(item);
      emitStateChange();
      return;
    }

    refreshShellManualAction(item);
    emitStateChange();
    setTimerPhase("question");
    showTimer();
    startGauge(remainingMs, { initialScale: initialGaugeScale });

    questionTimer = window.setTimeout(() => {
      questionTimer = null;

      if (item.hasAnswerPhase === false) {
        void advanceToNextQuestion(item);
        return;
      }

      beginAnswerPhase(item, item.infiniteAnswerTime ? Number.POSITIVE_INFINITY : item.answerTime * 1000, { showAnswerNow: true });
    }, remainingMs);
  }

  function beginAnswerPhase(item, durationMs, { showAnswerNow = true } = {}) {
    stopAllTimers();

    if (!activeTool || !item) return;

    clearSessionStage();
    hideManualAction();

    const remainingMs = clampPhaseDuration(durationMs);
    if (showAnswerNow) {
      const showCtx = getToolContext(item);
      const maybePromise = activeRuntime?.showAnswer?.(els.workArea, showCtx);
      if (maybePromise && typeof maybePromise.then === "function") {
        Promise.resolve(maybePromise)
          .then(() => {
            if (!isSessionRunning) return;
            emitStateChange();
          })
          .catch((err) => {
            onFatalError?.(err?.message || "Erreur pendant la séance.");
          });
      }
    }

    engineState = "RUNNING_ANSWER";
    phase = createPhase("ANSWER", item.infiniteAnswerTime ? Number.POSITIVE_INFINITY : remainingMs);

    if (!Number.isFinite(remainingMs)) {
      hideTimer();

      if (item.usesCustomQuestionFlow === true) {
        refreshShellManualAction(item);
        emitStateChange();
        return;
      }

      refreshShellManualAction(item);
      emitStateChange();
      return;
    }

    refreshShellManualAction(item);
    emitStateChange();
    setTimerPhase("answer");
    showTimer();
    startGauge(remainingMs);

    answerTimer = window.setTimeout(() => {
      answerTimer = null;
      completeAnswerPhase(item);
    }, remainingMs);
  }

  function beginQuestionTransition(item, durationMs = getQuestionTransitionDurationMs(item)) {
    stopAllTimers();
    hideManualAction();

    const infiniteQuestionTransition = item?.questionTransitionInfinite === true;
    const remainingMs = infiniteQuestionTransition
      ? Number.POSITIVE_INFINITY
      : Math.max(0, Math.floor(Number(durationMs) || 0));

    if (!infiniteQuestionTransition && remainingMs <= 0) {
      beginQuestionPhase(item, item.timePerQ * 1000, { generateQuestion: true });
      emitStateChange();
      return;
    }

    engineState = "BETWEEN_QUESTIONS";
    phase = createPhase("TRANSITION", remainingMs);
    hideTimer();

    if (infiniteQuestionTransition) {
      renderQuestionTransitionOverlay(item);
      emitStateChange();
      return;
    }

    renderSessionStage(`
      <div class="session-stage session-stage-transition">
        <div class="session-transition-title">Question suivante…</div>
        <div class="mini-timer" aria-hidden="true">
          <div class="mini-timer-bar" id="miniTimerBar"></div>
        </div>
      </div>
    `);

    animateMiniTimer(remainingMs);
    emitStateChange();

    transitionTimer = window.setTimeout(() => {
      transitionTimer = null;
      if (isToolMaxTimeExpiredOrAdvancing(item)) {
        void enforceCurrentToolMaxTime();
        return;
      }
      beginQuestionPhase(item, item.timePerQ * 1000, { generateQuestion: true });
    }, remainingMs);
  }

  function renderQuestionTransitionOverlay(item) {
    renderSessionStage(`
      <button
        class="session-stage session-stage-transition session-stage-transition-ready"
        id="btnContinueQuestionTransition"
        type="button"
      >
        <div class="session-transition-title">Prêt pour la question suivante</div>
      </button>
    `);

    document.getElementById("btnContinueQuestionTransition")?.addEventListener("click", () => {
      if (isToolMaxTimeExpiredOrAdvancing(item)) {
        void enforceCurrentToolMaxTime();
        return;
      }
      beginQuestionPhase(item, item.timePerQ * 1000, { generateQuestion: true });
    });
  }

  function getQuestionTransitionDurationMs(item) {
    return Math.max(0, Math.floor(Number(item?.questionTransitionSec) || 0) * 1000);
  }

  function openNextToolOverlay(item) {
    stopAllTimers();
    hideTimer();
    hideManualAction();
    engineState = "BETWEEN_TOOLS";
    phase = createPhase("BETWEEN_TOOLS");

    renderSessionStage(`
      <div class="session-stage">
        <button class="btn primary btn-big session-next-btn" id="btnNextActivity" type="button">Activité suivante</button>
      </div>
    `);
    emitStateChange();

    document.getElementById("btnNextActivity")?.addEventListener("click", () => {
      beginTool(item).catch((err) => {
        onFatalError?.(err?.message || "Erreur pendant le chargement de l’outil.");
      });
    });
  }

  function renderSessionStage(html) {
    if (els.stageLayer) {
      const safeHtml = html ?? "";
      els.stageLayer.innerHTML = safeHtml;
      els.stageLayer.classList.toggle("hidden", !safeHtml.trim());
      return;
    }

    if (els.workArea) {
      els.workArea.innerHTML = html ?? "";
    }
  }

  function renderPauseStage() {
    renderSessionStage(`
      <div class="session-stage session-stage-pause">
        <div class="session-pause-title">PAUSE</div>
      </div>
    `);
  }

  function clearSessionStage() {
    if (!els.stageLayer) return;
    els.stageLayer.innerHTML = "";
    els.stageLayer.classList.add("hidden");
  }

  function showSessionMessage({ title = "", body = "", bodyHtml = "", buttonLabel = "", onClick = null, cardClass = "" } = {}) {
    const safeCardClass = String(cardClass || "").trim();
    const bodyMarkup = bodyHtml
      ? String(bodyHtml)
      : (body ? `<div class="session-message-text">${escapeHtml(body)}</div>` : "");

    renderSessionStage(`
      <div class="session-stage session-stage-message">
        <div class="session-message-card ${escapeHtml(safeCardClass)}">
          ${title ? `<div class="session-message-title">${escapeHtml(title)}</div>` : ""}
          ${bodyMarkup}
          ${buttonLabel ? `<button class="btn primary btn-big" id="sessionStageActionBtn" type="button">${escapeHtml(buttonLabel)}</button>` : ""}
        </div>
      </div>
    `);

    if (buttonLabel && typeof onClick === "function") {
      document.getElementById("sessionStageActionBtn")?.addEventListener("click", onClick);
    }
  }

  function captureCurrentPhase() {
    switch (phase.kind) {
      case "QUESTION":
      case "ANSWER":
      case "TRANSITION":
        return createPhase(phase.kind, getPhaseRemainingMs());

      case "BETWEEN_TOOLS":
        return createPhase("BETWEEN_TOOLS");

      default:
        return createPhase(phase.kind);
    }
  }

  function getPhaseRemainingMs() {
    if (!phase?.remainingMs) return 0;
    const elapsed = performance.now() - phase.startedAt;
    return Math.max(0, Math.ceil(phase.remainingMs - elapsed));
  }

  function createPhase(kind, remainingMs = 0) {
    return {
      kind,
      remainingMs: Math.max(0, Math.floor(Number(remainingMs) || 0)),
      startedAt: performance.now()
    };
  }

  function clampPhaseDuration(value) {
    return Math.max(1, Math.floor(Number(value) || 0));
  }

  async function prepareSessionFromSequence(sequenceItems) {
    const nextSession = [];
    let requiresStudent = false;
    const allowedIds = new Set();
    let blockingMessage = "";

    for (const item of (Array.isArray(sequenceItems) ? sequenceItems : [])) {
      const mod = await loadToolModule(item.toolId);
      const tool = mod.default ?? {};
      const instructionMeta = getToolInstructionMeta(tool);
      const normalizedDraft = normalizeToolDraft(item.draft);
      const settings = normalizedDraft.settings == null
        ? getToolDefaultSettings(tool)
        : cloneData(normalizedDraft.settings);

      const catalogActivityId = String(item.catalog_activity_id || item.catalogActivityId || "").trim();
      const catalogContext = String(item.catalog_context || item.catalogContext || "").trim() || "exploration";
      const catalogAdaptive = item.catalog_adaptive === true
        || (
          !!catalogActivityId
          && sessionActivityMode === "individual"
          && catalogContext === "exploration"
          && runMode !== "projected-teacher"
        );

      const sessionItem = {
        id: item.toolId,
        instanceId: item.instanceId,
        title: buildSessionItemTitle(item.toolId, item.instanceId, nextSession.length),
        draftTimePerQ: normalizedDraft.timePerQ,
        draftQuestionCount: normalizedDraft.questionCount,
        draftAnswerTime: normalizedDraft.answerTime,
        draftQuestionTransitionSec: normalizedDraft.questionTransitionSec,
        draftQuestionTransitionInfinite: normalizedDraft.questionTransitionInfinite === true,
        draftToolMaxTimeMin: normalizedDraft.toolMaxTimeMin,
        draftToolMaxTimeInfinite: normalizedDraft.toolMaxTimeInfinite === true,
        draftInfiniteTimePerQ: normalizedDraft.infiniteTimePerQ === true,
        draftQuestionFlowMode: normalizedDraft.questionFlowMode,
        draftInfiniteAnswerTime: normalizedDraft.infiniteAnswerTime === true,
        timePerQ: normalizedDraft.timePerQ,
        questionCount: normalizedDraft.questionCount,
        answerTime: normalizedDraft.answerTime,
        questionTransitionSec: normalizedDraft.questionTransitionSec,
        questionTransitionInfinite: normalizedDraft.questionTransitionInfinite === true,
        toolMaxTimeMin: normalizedDraft.toolMaxTimeMin,
        toolMaxTimeInfinite: normalizedDraft.toolMaxTimeInfinite === true,
        infiniteTimePerQ: normalizedDraft.infiniteTimePerQ === true,
        questionFlowMode: normalizedDraft.questionFlowMode,
        successGoalCorrectCount: normalizedDraft.successGoalCorrectCount,
        successGoalSafetyMilestones: normalizedDraft.successGoalSafetyMilestones,
        infiniteAnswerTime: normalizedDraft.infiniteAnswerTime === true,
        evaluationGauge: null,
        evaluationCounter: { attempted: 0, correct: 0 },
        defaultInstruction: instructionMeta.defaultInstruction,
        supportsCustomInstruction: instructionMeta.supportsCustomInstruction,
        settings,
        catalogActivityId,
        catalogContext,
        catalogLevels: item.catalog_levels && typeof item.catalog_levels === "object" && !Array.isArray(item.catalog_levels) ? cloneData(item.catalog_levels) : null,
        catalogAdaptive,
        catalogStartedLevel: normalizeCatalogDifficultyLevel(item.catalog_difficulty_level ?? item.catalogDifficultyLevel ?? 3),
        catalogCurrentLevel: normalizeCatalogDifficultyLevel(item.catalog_difficulty_level ?? item.catalogDifficultyLevel ?? 3),
        catalogDefaults: item.catalog_defaults && typeof item.catalog_defaults === "object" && !Array.isArray(item.catalog_defaults) ? cloneData(item.catalog_defaults) : {},
        progressSessionStats: { questions: 0, correct: 0 },
        currentQuestionResolvedCorrectly: false,
        currentQuestionOutcomeCommitted: false,
        lastQuestionOutcome: "pending"
      };

      const baseToolContext = {
        sessionItem,
        accessCode,
        moduleKey,
        activityMode: sessionActivityMode,
        responseUi: sessionResponseUi,
        progressMode: sessionProgressMode,
        passationProfile: sessionPassationProfile,
        sessionMode: runMode,
        runMode,
        settings,
        globals: cloneData(activityGlobals),
        student: runMode === "projected-teacher" ? null : selectedStudent,
        students: runMode === "projected-teacher" ? [] : cloneData(selectedStudents),
        selectedStudents: runMode === "projected-teacher" ? [] : cloneData(selectedStudents),
        services: {}
      };

      const runtimeCapabilities = getToolRuntimeCapabilities(tool, baseToolContext);

      sessionItem.hasAnswerPhase = runtimeCapabilities.answerPhase !== "unsupported"
        && (sessionItem.infiniteAnswerTime === true || Number(sessionItem.answerTime) > 0);
      sessionItem.usesCustomQuestionFlow = runtimeCapabilities.transitionPhase !== "required";
      sessionItem.supportsCommonFlowSettings = runtimeCapabilities.supportsCommonFlowSettings !== false;
      sessionItem.runtimeCapabilities = runtimeCapabilities;
      const runProfile = getToolRunProfile(tool, baseToolContext);

      if (runProfile.requiresStudent) {
        requiresStudent = true;
      }

      runProfile.allowedStudentIds.forEach((id) => {
        const cleanId = String(id || "").trim();
        if (cleanId) allowedIds.add(cleanId);
      });

      if (!blockingMessage && runProfile.blockingMessage) {
        blockingMessage = runProfile.blockingMessage;
      }

      nextSession.push(sessionItem);
    }

    applyFinalChallengeFlags(nextSession);

    sessionRequiresStudent = requiresStudent;
    allowedStudentIds = [...allowedIds];
    sessionBlockingMessage = blockingMessage;
    session = nextSession;
    resetSessionGaugeStates();
  }

  async function loadToolModule(toolId) {
    if (!moduleRuntime) {
      throw new Error("Runtime d’outils non initialisé.");
    }

    const cacheKey = `${moduleKey}::${toolId}`;

    if (!toolModuleCache.has(cacheKey)) {
      toolModuleCache.set(cacheKey, moduleRuntime.loadToolModule(toolId));
    }

    return await toolModuleCache.get(cacheKey);
  }

  function buildSessionItemTitle(toolId) {
    const toolMeta = toolsCatalog.find((tool) => tool.id === toolId);
    return toolMeta?.label || toolMeta?.title || String(toolId || "Outil");
  }

  function getToolDefaultSettings(tool) {
    if (typeof tool?.getDefaultSettings === "function") {
      return cloneData(tool.getDefaultSettings());
    }
    return {};
  }

  function isActivityTotalTimeEnabled() {
    return !isCatalogTestSession
      && activityGlobals.activityTotalTimeEnabled === true
      && Math.floor(Number(activityGlobals.activityTotalTimeSec) || 0) > 0;
  }

  function getActivityTotalTimeMs() {
    return Math.max(0, Math.floor(Number(activityGlobals.activityTotalTimeSec) || 0) * 1000);
  }

  function resetActivityClock() {
    activityClockStartedAt = 0;
    activityClockElapsedBeforePauseMs = 0;
    activityClockPaused = true;
  }

  function startActivityClock() {
    activityClockStartedAt = performance.now();
    activityClockElapsedBeforePauseMs = 0;
    activityClockPaused = false;
  }

  function pauseActivityClock() {
    if (activityClockPaused) return;
    activityClockElapsedBeforePauseMs += Math.max(0, performance.now() - activityClockStartedAt);
    activityClockStartedAt = performance.now();
    activityClockPaused = true;
  }

  function resumeActivityClock() {
    if (!activityClockPaused) return;
    activityClockStartedAt = performance.now();
    activityClockPaused = false;
  }

  function getActivityElapsedMs() {
    if (!isSessionRunning && !activityClockStartedAt) return 0;
    const livePart = activityClockPaused
      ? 0
      : Math.max(0, performance.now() - activityClockStartedAt);
    return Math.max(0, activityClockElapsedBeforePauseMs + livePart);
  }

  function resetToolClock() {
    toolClockStartedAt = 0;
    toolClockElapsedBeforePauseMs = 0;
    toolClockPaused = true;
  }

  function startToolClock() {
    toolClockStartedAt = performance.now();
    toolClockElapsedBeforePauseMs = 0;
    toolClockPaused = false;
  }

  function pauseToolClock() {
    if (toolClockPaused) return;
    toolClockElapsedBeforePauseMs += Math.max(0, performance.now() - toolClockStartedAt);
    toolClockStartedAt = performance.now();
    toolClockPaused = true;
  }

  function resumeToolClock() {
    if (!toolClockPaused) return;
    toolClockStartedAt = performance.now();
    toolClockPaused = false;
  }

  function getToolElapsedMs() {
    if (!toolClockStartedAt) return 0;
    const livePart = toolClockPaused
      ? 0
      : Math.max(0, performance.now() - toolClockStartedAt);
    return Math.max(0, toolClockElapsedBeforePauseMs + livePart);
  }

  function getToolMaxTimeMs(item) {
    if (!item || item.toolMaxTimeInfinite === true) return Number.POSITIVE_INFINITY;

    const limitMin = Math.floor(Number(item.toolMaxTimeMin));
    if (!Number.isFinite(limitMin) || limitMin <= 0) {
      return Number.POSITIVE_INFINITY;
    }

    return limitMin * 60 * 1000;
  }

  function isToolMaxTimeReached(item) {
    const maxMs = getToolMaxTimeMs(item);
    if (!Number.isFinite(maxMs)) return false;
    return getToolElapsedMs() >= maxMs;
  }

  function isToolMaxTimeExpiredOrAdvancing(item) {
    return toolMaxTimeAdvancePending === true || isToolMaxTimeReached(item);
  }

  function shouldEnforceToolMaxTime(item) {
    if (!isSessionRunning || paused || !item || session[currentToolIndex] !== item) return false;
    if (!Number.isFinite(getToolMaxTimeMs(item))) return false;
    if (!isToolMaxTimeReached(item)) return false;
    if (phase.kind === "BETWEEN_TOOLS" || phase.kind === "DONE") return false;
    if (phase.kind === "IDLE" && engineState !== "LOADING_QUESTION") return false;
    return true;
  }

  async function enforceCurrentToolMaxTime() {
    const item = session[currentToolIndex];
    if (!shouldEnforceToolMaxTime(item) || toolMaxTimeAdvancePending) {
      return false;
    }

    toolMaxTimeAdvancePending = true;
    stopAllTimers();
    hideTimer();
    hideManualAction();
    emitStateChange();

    try {
      await nextTool(false);
      return true;
    } catch (err) {
      onFatalError?.(err?.message || "Erreur pendant le changement d’outil.");
      return false;
    } finally {
      toolMaxTimeAdvancePending = false;
    }
  }

  function startToolMaxTimeTicker() {
    stopToolMaxTimeTicker();
    const item = session[currentToolIndex];
    if (!item || !Number.isFinite(getToolMaxTimeMs(item)) || paused || !isSessionRunning) return;

    toolMaxTimeTicker = window.setInterval(() => {
      const currentItem = session[currentToolIndex];
      if (!currentItem || !isSessionRunning || phase.kind === "DONE" || phase.kind === "BETWEEN_TOOLS") {
        stopToolMaxTimeTicker();
        return;
      }

      if (paused) {
        return;
      }

      if (shouldEnforceToolMaxTime(currentItem)) {
        void enforceCurrentToolMaxTime();
        return;
      }

      emitStateChange();
    }, 250);
  }

  function stopToolMaxTimeTicker() {
    if (!toolMaxTimeTicker) return;
    window.clearInterval(toolMaxTimeTicker);
    toolMaxTimeTicker = null;
  }

  function getToolTimeUiState(item) {
    const hiddenState = {
      visible: false,
      remainingMs: Number.POSITIVE_INFINITY,
      timeLabel: "",
      expired: false
    };

    if (!isSessionRunning || !item || !toolClockStartedAt) {
      return hiddenState;
    }

    if (phase.kind === "IDLE" || phase.kind === "BETWEEN_TOOLS" || phase.kind === "DONE") {
      return hiddenState;
    }

    const maxMs = getToolMaxTimeMs(item);
    if (!Number.isFinite(maxMs)) {
      return hiddenState;
    }

    const remainingMs = Math.max(0, maxMs - getToolElapsedMs());

    return {
      visible: true,
      remainingMs,
      timeLabel: formatCountdown(remainingMs),
      expired: remainingMs <= 0
    };
  }

  function getActivityTotalRemainingMs() {
    if (!isActivityTotalTimeEnabled()) return Number.POSITIVE_INFINITY;
    return Math.max(0, getActivityTotalTimeMs() - getActivityElapsedMs());
  }

  function applyFinalChallengeFlags(items = []) {
    const enabled = isActivityTotalTimeEnabled();
    const lastIndex = Array.isArray(items) ? items.length - 1 : -1;
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      item.isFinalInfiniteSequenceItem = enabled && index === lastIndex;
      item.finalChallengeCorrectCount = 0;
      item.finalChallengeStarted = false;
      if (item.isFinalInfiniteSequenceItem) {
        item.questionFlowMode = "unlimited";
        item.evaluationGauge = null;
      }
    });
  }

  function isFinalChallengeItem(item) {
    return isActivityTotalTimeEnabled() && item?.isFinalInfiniteSequenceItem === true;
  }

  function ensureFinalChallengeStarted(item) {
    if (!isFinalChallengeItem(item)) return;
    if (item.finalChallengeStarted === true) return;
    item.finalChallengeStarted = true;
    item.finalChallengeCorrectCount = 0;
  }

  function incrementFinalChallengeCorrectCount(item) {
    if (!isFinalChallengeItem(item) || sessionProgressMode !== "evaluated") return;
    item.finalChallengeCorrectCount = Math.max(0, Math.floor(Number(item.finalChallengeCorrectCount) || 0)) + 1;
  }

  function getFinalChallengeUiState(item) {
    if (
      sessionProgressMode !== "evaluated"
      || !isSessionRunning
      || phase.kind === "DONE"
      || !isFinalChallengeItem(item)
      || item.finalChallengeStarted !== true
    ) {
      return { active: false };
    }

    const remainingMs = getActivityTotalRemainingMs();
    return {
      active: true,
      correctCount: Math.max(0, Math.floor(Number(item.finalChallengeCorrectCount) || 0)),
      remainingMs,
      timeLabel: formatCountdown(remainingMs)
    };
  }

  function formatCountdown(ms) {
    const safeSec = Math.max(0, Math.ceil(Number(ms) / 1000));
    const minutes = Math.floor(safeSec / 60);
    const seconds = safeSec % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

  function startFinalChallengeTicker() {
    stopFinalChallengeTicker();
    if (!isFinalChallengeItem(session[currentToolIndex]) || paused || !isSessionRunning) return;

    finalChallengeTicker = window.setInterval(() => {
      const item = session[currentToolIndex];
      if (!isFinalChallengeItem(item) || paused || !isSessionRunning) {
        stopFinalChallengeTicker();
        return;
      }

      if (getActivityTotalRemainingMs() <= 0) {
        finishSession({ title: "Temps écoulé — la séance est terminée." });
        return;
      }

      emitStateChange();
    }, 250);
  }

  function stopFinalChallengeTicker() {
    if (finalChallengeTicker) {
      clearInterval(finalChallengeTicker);
      finalChallengeTicker = null;
    }
  }

  function finishSession({ title = null } = {}) {
    const finalTitle = title || (sessionProgressMode === "practice" ? "Entrainement terminé." : "Bravo, la séance est terminée.");
    const finishedSummary = buildSessionSummary();
    notifySessionFinishedOnce(finishedSummary);
    stopAllTimers();
    resetToolClock();
    stopFinalChallengeTicker();
    stopToolMaxTimeTicker();
    hideTimer();
    hideManualAction();
    engineState = "DONE";
    phase = createPhase("DONE");
    isSessionRunning = false;
    setStatus("Séance terminée", "good");
    emitStateChange();
    showSessionMessage({
      title: finalTitle,
      bodyHtml: sessionProgressMode === "practice" ? "" : renderGroupSessionSummaryHtml(),
      cardClass: sessionProgressMode === "practice" ? "" : (getGroupScoreRows().length ? "session-message-card-group-summary" : ""),
      buttonLabel: "Retour aux activités",
      onClick: onExitToActivities
    });
  }


  function createEvaluationGaugeState(item) {
    if (runMode === "projected-teacher" || !isBoxedEvaluatedProfile()) {
      return null;
    }

    if (!item || isFinalChallengeItem(item)) return null;

    if (item.questionFlowMode === "successGoal") {
      const successGoalSettings = getCommonSuccessGoalSettings(item);
      const milestones = [];
      const milestoneCount = Math.max(0, Number(successGoalSettings.successGoalSafetyMilestones) || 0);
      for (let index = 1; index <= milestoneCount; index += 1) {
        milestones.push(index / (milestoneCount + 1));
      }

      return {
        mode: "infinite",
        progress: normalizeGaugeProgress(0),
        lockedFloor: normalizeGaugeProgress(0),
        milestones,
        step: Math.max(0, Math.min(1, 1 / Math.max(1, Number(successGoalSettings.successGoalCorrectCount) || 1))),
        completed: false,
        launching: false,
        rocketState: "off"
      };
    }

    if (item.questionFlowMode !== "fixed") return null;

    const segmentCount = Math.max(1, clampInt(item.questionCount, 1, 999, 1));
    return {
      mode: "finite",
      segments: Array.from({ length: segmentCount }, () => "pending"),
      completed: false,
      launching: false,
      rocketState: "off"
    };
  }

  function resetSessionGaugeStates() {
    session.forEach((item) => {
      item.evaluationGauge = createEvaluationGaugeState(item);
      item.evaluationCounter = { attempted: 0, correct: 0 };
      if (isFinalChallengeItem(item)) {
        item.finalChallengeStarted = false;
        item.finalChallengeCorrectCount = 0;
      }
      item.currentQuestionResolvedCorrectly = false;
      item.currentQuestionOutcomeCommitted = false;
      item.lastQuestionOutcome = "pending";
      item.catalogCurrentLevel = normalizeCatalogDifficultyLevel(item.catalogStartedLevel ?? item.catalogCurrentLevel ?? 3);
      item.progressSessionStats = { questions: 0, correct: 0 };
    });
  }

  function hasCompletedSuccessGoalGauge(item) {
    const gauge = item?.evaluationGauge;
    return gauge?.mode === "infinite" && gauge.completed === true;
  }

  function commitCurrentQuestionOutcomeOnce(item) {
    if (!item) return false;

    if (item.currentQuestionOutcomeCommitted === true) {
      return hasCompletedSuccessGoalGauge(item);
    }

    const completedByGauge = commitCurrentQuestionOutcome(item);
    item.currentQuestionOutcomeCommitted = true;
    return completedByGauge;
  }

  function getEvaluationGaugeUiState(item) {
    if (runMode === "projected-teacher" || !isBoxedEvaluatedProfile()) {
      return null;
    }

    if (!item?.evaluationGauge || isFinalChallengeItem(item)) return null;

    const gauge = item.evaluationGauge;
    if (gauge.mode === "infinite") {
      return {
        mode: "infinite",
        progress: normalizeGaugeProgress(gauge.progress),
        lockedFloor: normalizeGaugeProgress(gauge.lockedFloor),
        milestones: Array.isArray(gauge.milestones) ? gauge.milestones.map((value) => normalizeGaugeProgress(value)) : [],
        step: Math.max(0, Math.min(1, Number(gauge.step) || 0.1)),
        completed: gauge.completed === true,
        launching: gauge.launching === true,
        rocketState: gauge.rocketState === "on" ? "on" : "off"
      };
    }

    return {
      mode: "finite",
      segments: Array.isArray(gauge.segments) ? gauge.segments.map((value) => {
        const safe = String(value || "pending").trim();
        return safe === "correct" || safe === "incorrect" ? safe : "pending";
      }) : [],
      completed: gauge.completed === true,
      launching: false,
      rocketState: "off"
    };
  }

  function commitCurrentQuestionOutcome(item) {
    const isCorrect = item?.currentQuestionResolvedCorrectly === true;
    if (isFinalChallengeItem(item) && isCorrect) {
      incrementFinalChallengeCorrectCount(item);
    }

    recordCatalogProgressQuestionOutcome(item, isCorrect);

    if (!item || runMode === "projected-teacher" || !isBoxedEvaluatedProfile()) {
      if (item) item.currentQuestionResolvedCorrectly = false;
      return false;
    }

    if (item.questionFlowMode === "unlimited") {
      const counter = item.evaluationCounter || { attempted: 0, correct: 0 };
      counter.attempted = Math.max(0, Math.floor(Number(counter.attempted) || 0)) + 1;
      if (isCorrect) {
        counter.correct = Math.max(0, Math.floor(Number(counter.correct) || 0)) + 1;
      }
      item.evaluationCounter = counter;
      item.lastQuestionOutcome = isCorrect ? "correct" : "incorrect";
      item.currentQuestionResolvedCorrectly = false;
      return false;
    }

    const gauge = item.evaluationGauge;
    if (!gauge) {
      item.currentQuestionResolvedCorrectly = false;
      return false;
    }

    item.lastQuestionOutcome = isCorrect ? "correct" : "incorrect";
    item.currentQuestionResolvedCorrectly = false;

    if (gauge.mode === "finite") {
      if (Array.isArray(gauge.segments) && currentQuestionIndex >= 0 && currentQuestionIndex < gauge.segments.length) {
        gauge.segments[currentQuestionIndex] = isCorrect ? "correct" : "incorrect";
      }
      gauge.completed = Array.isArray(gauge.segments) && gauge.segments.every((value) => value === "correct" || value === "incorrect");
      gauge.launching = false;
      gauge.rocketState = "off";
      return false;
    }

    if (gauge.mode === "infinite") {
      if (isCorrect) {
        gauge.progress = normalizeGaugeProgress((Number(gauge.progress) || 0) + (Number(gauge.step) || 0.1));
        const milestones = Array.isArray(gauge.milestones) ? gauge.milestones : [];
        const reached = milestones.filter((value) => gauge.progress + GAUGE_EPSILON >= normalizeGaugeProgress(value));
        if (reached.length) {
          gauge.lockedFloor = normalizeGaugeProgress(Math.max(gauge.lockedFloor || 0, reached[reached.length - 1]));
        }
      } else {
        gauge.progress = normalizeGaugeProgress(gauge.lockedFloor);
      }

      gauge.progress = normalizeGaugeProgress(gauge.progress);
      gauge.lockedFloor = normalizeGaugeProgress(gauge.lockedFloor);

      if (gauge.progress + GAUGE_EPSILON >= 1) {
        gauge.progress = 1;
        gauge.completed = true;
        gauge.launching = true;
        gauge.rocketState = "on";
        return true;
      }

      gauge.completed = false;
      gauge.launching = false;
      gauge.rocketState = "off";
    }

    return false;
  }


  function recordCatalogProgressQuestionOutcome(item, isCorrect) {
    if (!item || runMode === "projected-teacher") return;
    if (!item.catalogActivityId) return;

    const stats = item.progressSessionStats || { questions: 0, correct: 0 };
    stats.questions = Math.max(0, Math.floor(Number(stats.questions) || 0)) + 1;
    if (isCorrect === true) {
      stats.correct = Math.max(0, Math.floor(Number(stats.correct) || 0)) + 1;
    }
    item.progressSessionStats = stats;

    if (item.catalogAdaptive === true) {
      applyCatalogAdaptiveLevelAfterOutcome(item, isCorrect);
    }
  }

  function applyCatalogAdaptiveLevelAfterOutcome(item, isCorrect) {
    if (!item?.catalogLevels) return;

    const currentLevel = normalizeCatalogDifficultyLevel(item.catalogCurrentLevel ?? item.catalogStartedLevel ?? 3);
    const nextLevel = normalizeCatalogDifficultyLevel(currentLevel + (isCorrect === true ? 1 : -1));

    item.catalogCurrentLevel = nextLevel;
    syncCatalogAdaptiveLevelConfig(item);
  }

  function syncCatalogAdaptiveLevelConfig(item) {
    if (!item?.catalogLevels) return;

    const currentLevel = normalizeCatalogDifficultyLevel(item.catalogCurrentLevel ?? item.catalogStartedLevel ?? 3);
    item.catalogCurrentLevel = currentLevel;

    const levelConfig = getCatalogLevelConfig(item.catalogLevels, currentLevel);
    const fallbackTimePerQ = Math.max(1, Math.trunc(Number(item.catalogDefaults?.timePerQ ?? item.draftTimePerQ ?? item.timePerQ) || 40));
    const nextSettings = levelConfig.settings && typeof levelConfig.settings === "object" && !Array.isArray(levelConfig.settings)
      ? cloneData(levelConfig.settings)
      : {};

    item.settings = nextSettings;
    item.draftTimePerQ = levelConfig.timePerQ == null ? fallbackTimePerQ : Math.max(1, Math.trunc(Number(levelConfig.timePerQ) || fallbackTimePerQ));
    item.timePerQ = item.draftTimePerQ;
    item.draftInfiniteTimePerQ = levelConfig.infiniteTimePerQ == null
      ? item.catalogDefaults?.infiniteTimePerQ === true
      : levelConfig.infiniteTimePerQ === true;
    item.infiniteTimePerQ = item.draftInfiniteTimePerQ === true;

    applyCatalogTestRuntimeSettings(item);
  }

  function applyCatalogTestRuntimeSettings(item) {
    if (!item || String(item.catalogContext || "").trim().toLowerCase() !== "test") return;

    item.draftQuestionFlowMode = "unlimited";
    item.questionFlowMode = "unlimited";
    item.draftToolMaxTimeInfinite = true;
    item.toolMaxTimeInfinite = true;
  }


  function getEvaluationCounterUiState(item) {
    if (!item || runMode === "projected-teacher" || !isBoxedEvaluatedProfile()) return null;
    if (item.questionFlowMode !== "unlimited") return null;
    const counter = item.evaluationCounter || { attempted: 0, correct: 0 };
    return {
      visible: true,
      attempted: Math.max(0, Math.floor(Number(counter.attempted) || 0)),
      correct: Math.max(0, Math.floor(Number(counter.correct) || 0))
    };
  }

  function getFixedQuestionCounterUiState(item) {
    if (!isSessionRunning || !item || runMode === "projected-teacher" || isFinalChallengeItem(item)) return null;
    if (phase.kind === "IDLE" || phase.kind === "BETWEEN_TOOLS" || phase.kind === "DONE") return null;
    if (item.questionFlowMode !== "fixed") return null;
    if (item.evaluationGauge?.mode === "finite") return null;
    if (currentQuestionIndex < 0) return null;

    return {
      visible: true,
      current: Math.max(1, currentQuestionIndex + 1),
      total: Math.max(1, Math.floor(Number(item.questionCount) || 0))
    };
  }

  function getToolRunProfile(tool, item) {
    return getContractToolRunProfile(tool, getToolContext(item));
  }

  function getToolInstructionMeta(tool) {
    const safeTool = tool && typeof tool === "object" && !Array.isArray(tool)
      ? tool
      : {};

    return {
      defaultInstruction: String(safeTool.defaultInstruction || "").trim(),
      supportsCustomInstruction: safeTool.supportsCustomInstruction !== false
    };
  }

  function getContextInstructionMeta(item = null) {
    const activeInstructionMeta = getToolInstructionMeta(activeTool);

    if (item) {
      return {
        defaultInstruction: String(item.defaultInstruction || activeInstructionMeta.defaultInstruction || "").trim(),
        supportsCustomInstruction: item.supportsCustomInstruction != null
          ? item.supportsCustomInstruction !== false
          : activeInstructionMeta.supportsCustomInstruction
      };
    }

    return activeInstructionMeta;
  }

  function getToolContext(item) {
    const instructionMeta = getContextInstructionMeta(item);

    if (!item) {
      const sessionControls = createToolSessionControls(null);
      return {
        sessionItem: null,
        accessCode,
        moduleKey,
        activityMode: sessionActivityMode,
        responseUi: sessionResponseUi,
        progressMode: sessionProgressMode,
        passationProfile: sessionPassationProfile,
        sessionMode: runMode,
        runMode,
        settings: {},
        student: runMode === "projected-teacher" ? null : selectedStudent,
        students: runMode === "projected-teacher" ? [] : cloneData(selectedStudents),
        selectedStudents: runMode === "projected-teacher" ? [] : cloneData(selectedStudents),
        studentIds: runMode === "projected-teacher" ? [] : cloneData(selectedStudents.map((item) => item?.id).filter(Boolean)),
        studentFirstName: runMode === "projected-teacher" ? "" : selectedStudent?.first_name ?? "",
        defaultInstruction: instructionMeta.defaultInstruction,
        supportsCustomInstruction: instructionMeta.supportsCustomInstruction,
        globals: cloneData(activityGlobals),
        questionFlowMode: "fixed",
        isFinalInfiniteSequenceItem: false,
        finalInfiniteSequenceItem: false,
        services: {
          sessionControls,
          requestAnswerPhase: sessionControls.requestAnswerPhase,
          requestNextQuestion: sessionControls.requestNextQuestion,
          getPhaseKind: sessionControls.getPhaseKind
        },
        sessionControls
      };
    }

    const sessionControls = createToolSessionControls(item);

    return {
      sessionItem: item,
      accessCode,
      moduleKey,
      activityMode: sessionActivityMode,
      responseUi: sessionResponseUi,
      progressMode: sessionProgressMode,
      passationProfile: sessionPassationProfile,
      sessionMode: runMode,
      runMode,
      settings: item.settings ?? {},
      student: runMode === "projected-teacher" ? null : selectedStudent,
      students: runMode === "projected-teacher" ? [] : cloneData(selectedStudents),
      selectedStudents: runMode === "projected-teacher" ? [] : cloneData(selectedStudents),
      studentIds: runMode === "projected-teacher" ? [] : cloneData(selectedStudents.map((entry) => entry?.id).filter(Boolean)),
      studentFirstName: runMode === "projected-teacher" ? "" : selectedStudent?.first_name ?? "",
      defaultInstruction: instructionMeta.defaultInstruction,
      supportsCustomInstruction: instructionMeta.supportsCustomInstruction,
      globals: cloneData(activityGlobals),
      questionFlowMode: item.questionFlowMode || "fixed",
      catalogActivityId: item.catalogActivityId || "",
      catalogContext: item.catalogContext || "",
      catalogAdaptive: item.catalogAdaptive === true,
      catalogStartedLevel: normalizeCatalogDifficultyLevel(item.catalogStartedLevel ?? 3),
      catalogCurrentLevel: normalizeCatalogDifficultyLevel(item.catalogCurrentLevel ?? item.catalogStartedLevel ?? 3),
      catalogDifficultyLevel: normalizeCatalogDifficultyLevel(item.catalogCurrentLevel ?? item.catalogStartedLevel ?? 3),
      isFinalInfiniteSequenceItem: isFinalChallengeItem(item),
      finalInfiniteSequenceItem: isFinalChallengeItem(item),
      services: {
        sessionControls,
        requestAnswerPhase: sessionControls.requestAnswerPhase,
        requestNextQuestion: sessionControls.requestNextQuestion,
        getPhaseKind: sessionControls.getPhaseKind,
        notifyValidationStateChanged: sessionControls.notifyValidationStateChanged
      },
      sessionControls
    };
  }

  function createToolSessionControls(item) {
    return {
      requestAnswerPhase({ manual = false, showAnswerNow = true, wasCorrect = false } = {}) {
        if (!item || !isSessionRunning || paused) return false;
        if (session[currentToolIndex] !== item) return false;
        if (phase.kind !== "QUESTION") return false;

        item.currentQuestionResolvedCorrectly = wasCorrect === true;

        const durationMs = manual
          ? Number.POSITIVE_INFINITY
          : (item.infiniteAnswerTime ? Number.POSITIVE_INFINITY : item.answerTime * 1000);

        beginAnswerPhase(item, durationMs, { showAnswerNow });
        emitStateChange();
        return true;
      },

      requestNextQuestion() {
        if (!item || !isSessionRunning || paused) return false;
        if (session[currentToolIndex] !== item) return false;
        if (phase.kind !== "ANSWER") return false;
        completeAnswerPhase(item);
        return true;
      },

      notifyValidationStateChanged() {
        if (!item || session[currentToolIndex] !== item) return false;
        refreshShellManualAction(item);
        emitStateChange();
        return true;
      },

      getPhaseKind() {
        return phase.kind;
      }
    };
  }

  function getSessionMeta() {
    return {
      requiresStudent: sessionRequiresStudent,
      allowedStudentIds: cloneData(allowedStudentIds),
      blockingMessage: sessionBlockingMessage,
      selectedStudent: selectedStudent ? cloneData(selectedStudent) : null,
      selectedStudents: cloneData(selectedStudents),
      selectedStudentIds: cloneData(selectedStudents.map((entry) => entry?.id).filter(Boolean)),
      groupScores: getGroupScores()
    };
  }

  function setSelectedStudent(student) {
    selectedStudent = student ? cloneData(student) : null;
    selectedStudents = selectedStudent ? [cloneData(selectedStudent)] : [];
    resetGroupScores();
  }

  function setSelectedStudents(students) {
    selectedStudents = Array.isArray(students)
      ? students.map((student) => cloneData(student)).filter(Boolean)
      : [];
    selectedStudent = selectedStudents.length === 1 ? cloneData(selectedStudents[0]) : null;
    resetGroupScores();
  }

  function getStudentId(student) {
    return String(student?.id ?? student?.student_id ?? "").trim();
  }

  function getStudentFirstName(student) {
    return String(student?.first_name ?? student?.firstname ?? student?.name ?? "Élève").trim() || "Élève";
  }

  function getGroupScoreRows() {
    if (sessionActivityMode !== "group" || sessionProgressMode !== "evaluated" || sessionResponseUi !== "free" || runMode === "projected-teacher") {
      return [];
    }

    return selectedStudents
      .map((student) => {
        const id = getStudentId(student);
        if (!id) return null;
        const score = groupScores.get(id) || { correct: 0, total: 0 };
        return {
          id,
          firstName: getStudentFirstName(student),
          correct: Math.max(0, Math.floor(Number(score.correct) || 0)),
          total: Math.max(0, Math.floor(Number(score.total) || 0))
        };
      })
      .filter(Boolean);
  }

  function getGroupScores() {
    return cloneData(getGroupScoreRows());
  }

  function resetGroupScores() {
    groupScores = new Map();
    if (sessionActivityMode !== "group" || sessionProgressMode !== "evaluated" || sessionResponseUi !== "free" || runMode === "projected-teacher") return;

    selectedStudents.forEach((student) => {
      const id = getStudentId(student);
      if (!id) return;
      groupScores.set(id, { correct: 0, total: 0 });
    });
  }

  function ensureGroupScoreEntry(student) {
    const id = getStudentId(student);
    if (!id) return null;

    if (!groupScores.has(id)) {
      groupScores.set(id, { correct: 0, total: 0 });
    }

    return groupScores.get(id);
  }

  function commitGroupAnswerAttribution(correctStudentIds = []) {
    if (sessionActivityMode !== "group" || sessionProgressMode !== "evaluated" || sessionResponseUi !== "free" || runMode === "projected-teacher") return;

    const correctIds = new Set(
      (Array.isArray(correctStudentIds) ? correctStudentIds : [])
        .map((id) => String(id || "").trim())
        .filter(Boolean)
    );

    if (isFinalChallengeItem(session[currentToolIndex]) && correctIds.size > 0) {
      incrementFinalChallengeCorrectCount(session[currentToolIndex]);
    }

    selectedStudents.forEach((student) => {
      const id = getStudentId(student);
      if (!id) return;
      const entry = ensureGroupScoreEntry(student);
      if (!entry) return;
      entry.total = Math.max(0, Math.floor(Number(entry.total) || 0)) + 1;
      if (correctIds.has(id)) {
        entry.correct = Math.max(0, Math.floor(Number(entry.correct) || 0)) + 1;
      }
    });
  }

  function shouldUseGroupAnswerAttribution(item) {
    return sessionActivityMode === "group"
      && sessionResponseUi === "free"
      && sessionProgressMode === "evaluated"
      && runMode !== "projected-teacher"
      && !!item
      && phase.kind === "ANSWER"
      && item.hasAnswerPhase !== false
      && Array.isArray(selectedStudents)
      && selectedStudents.length >= 2;
  }

  function completeAnswerPhase(item) {
    if (shouldUseGroupAnswerAttribution(item)) {
      openGroupAnswerAttributionOverlay(item);
      return;
    }

    void advanceToNextQuestion(item);
  }

  function openGroupAnswerAttributionOverlay(item) {
    if (!shouldUseGroupAnswerAttribution(item)) {
      void advanceToNextQuestion(item);
      return;
    }

    stopAllTimers();
    hideTimer();
    hideManualAction();
    engineState = "GROUP_ATTRIBUTION";
    phase = createPhase("GROUP_ATTRIBUTION");

    const studentRows = getGroupAnswerRows(selectedStudents).map((row) => `
      <div class="session-group-answer-student-row">
        ${row.map(renderGroupAnswerStudentButton).join("")}
      </div>
    `).join("");

    renderSessionStage(`
      <div class="session-stage session-stage-group-attribution" data-skip-autofs="true">
        <div class="session-group-attribution-title">Qui a la bonne réponse&nbsp;?</div>
        <div class="session-group-attribution-grid session-group-answer-student-rows" role="group" aria-label="Élèves ayant donné la bonne réponse">
          ${studentRows}
        </div>
        <button class="btn primary btn-big session-group-attribution-submit" id="btnGroupAttributionSubmit" type="button">
          Valider
        </button>
      </div>
    `);

    const root = els.stageLayer?.querySelector(".session-stage-group-attribution");
    const submitButton = root?.querySelector("#btnGroupAttributionSubmit");
    let submitted = false;

    root?.querySelectorAll(".session-group-student-btn").forEach((button) => {
      button.addEventListener("click", () => {
        const nextState = !button.classList.contains("is-lit");
        button.classList.toggle("is-lit", nextState);
        button.setAttribute("aria-pressed", nextState ? "true" : "false");
      });
    });

    submitButton?.addEventListener("click", async () => {
      if (submitted) return;
      if (isToolMaxTimeExpiredOrAdvancing(item)) {
        void enforceCurrentToolMaxTime();
        return;
      }
      submitted = true;
      submitButton.disabled = true;

      const correctIds = [...(root?.querySelectorAll(".session-group-student-btn.is-lit") || [])]
        .map((button) => String(button.getAttribute("data-student-id") || "").trim())
        .filter(Boolean);

      commitGroupAnswerAttribution(correctIds);
      await advanceToNextQuestion(item);
    });

    emitStateChange();
  }

  function getGroupAnswerRows(students = []) {
    const safeStudents = (Array.isArray(students) ? students : [])
      .filter((student) => !!getStudentId(student));
    const count = safeStudents.length;

    if (count <= 0) return [];
    if (count <= 3) return [safeStudents];
    if (count === 4) return [safeStudents.slice(0, 2), safeStudents.slice(2, 4)];
    if (count === 5) return [safeStudents.slice(0, 3), safeStudents.slice(3, 5)];
    if (count === 6) return [safeStudents.slice(0, 3), safeStudents.slice(3, 6)];

    const rows = [];
    for (let i = 0; i < count; i += 4) {
      rows.push(safeStudents.slice(i, i + 4));
    }
    return rows;
  }

  function renderGroupAnswerStudentButton(student) {
    const id = getStudentId(student);
    const firstName = getStudentFirstName(student);
    return `
      <button
        class="session-group-student-btn"
        type="button"
        data-student-id="${escapeHtml(id)}"
        aria-pressed="false"
      >${escapeHtml(firstName)}</button>
    `;
  }

  function renderGroupSessionSummaryHtml() {
    const rows = getGroupScoreRows();
    if (!rows.length) return "";

    return `
      <div class="session-group-summary-line" aria-label="Bilan discret du groupe">
        ${rows.map((row) => `
          <span class="session-group-summary-item">
            <span class="session-group-summary-name">${escapeHtml(row.firstName)}&nbsp;:</span>
            ${renderGroupProgressDisc(row.correct, row.total, row.firstName)}
          </span>
        `).join("")}
      </div>
    `;
  }

  function renderGroupProgressDisc(correct, total, firstName = "") {
    const safeTotal = Math.max(0, Math.floor(Number(total) || 0));
    const safeCorrect = Math.max(0, Math.min(safeTotal, Math.floor(Number(correct) || 0)));
    const ratio = safeTotal > 0 ? Math.max(0, Math.min(1, safeCorrect / safeTotal)) : 0;
    const label = `${firstName || "Élève"} : ${safeCorrect} sur ${safeTotal}`;

    if (ratio <= 0) {
      return `
        <svg class="session-group-progress-disc" viewBox="0 0 32 32" role="img" aria-label="${escapeHtml(label)}">
          <circle class="session-group-progress-disc-bg" cx="16" cy="16" r="14"></circle>
        </svg>
      `;
    }

    if (ratio >= 1) {
      return `
        <svg class="session-group-progress-disc" viewBox="0 0 32 32" role="img" aria-label="${escapeHtml(label)}">
          <circle class="session-group-progress-disc-bg" cx="16" cy="16" r="14"></circle>
          <circle class="session-group-progress-disc-fill" cx="16" cy="16" r="14"></circle>
        </svg>
      `;
    }

    const angle = (ratio * Math.PI * 2) - (Math.PI / 2);
    const endX = 16 + (14 * Math.cos(angle));
    const endY = 16 + (14 * Math.sin(angle));
    const largeArc = ratio > 0.5 ? 1 : 0;
    const path = `M 16 16 L 16 2 A 14 14 0 ${largeArc} 1 ${endX.toFixed(3)} ${endY.toFixed(3)} Z`;

    return `
      <svg class="session-group-progress-disc" viewBox="0 0 32 32" role="img" aria-label="${escapeHtml(label)}">
        <circle class="session-group-progress-disc-bg" cx="16" cy="16" r="14"></circle>
        <path class="session-group-progress-disc-fill" d="${path}"></path>
      </svg>
    `;
  }

  function startGauge(durationMs, { initialScale = null } = {}) {
    stopGauge();

    gaugeStart = performance.now();
    gaugeDurationMs = Math.max(1, durationMs);

    const startScale = Number.isFinite(initialScale)
      ? Math.max(0, Math.min(1, Number(initialScale)))
      : 1;

    gaugeCurrentScale = startScale;

    if (els.timerBar) {
      els.timerBar.style.transform = `scaleX(${startScale})`;
    }

    const tick = (now) => {
      const t = (now - gaugeStart) / gaugeDurationMs;
      const remainingFactor = Math.max(0, 1 - t);
      gaugeCurrentScale = startScale * remainingFactor;

      if (els.timerBar) {
        els.timerBar.style.transform = `scaleX(${gaugeCurrentScale})`;
      }

      if (t < 1) {
        gaugeRaf = requestAnimationFrame(tick);
      } else {
        gaugeRaf = null;
      }
    };

    gaugeRaf = requestAnimationFrame(tick);
  }

  function animateMiniTimer(durationMs) {
    const bar = document.getElementById("miniTimerBar");
    if (!bar) return;

    bar.style.animation = "none";
    bar.offsetHeight;
    bar.style.animation = `miniDrain ${Math.max(0, durationMs) / 1000}s linear forwards`;
  }

  function stopGauge() {
    if (gaugeRaf) {
      cancelAnimationFrame(gaugeRaf);
      gaugeRaf = null;
    }
  }

  function getGaugeScale() {
    if (!els.timerBar) return gaugeCurrentScale;

    const transform = els.timerBar.style.transform || "";
    const match = transform.match(/scaleX\(([^)]+)\)/);

    if (match) {
      const parsed = Number(match[1]);
      if (Number.isFinite(parsed)) {
        gaugeCurrentScale = Math.max(0, Math.min(1, parsed));
      }
    }

    return gaugeCurrentScale;
  }

  function stopAllTimers() {
    if (questionTimer) {
      clearTimeout(questionTimer);
      questionTimer = null;
    }
    if (answerTimer) {
      clearTimeout(answerTimer);
      answerTimer = null;
    }
    if (transitionTimer) {
      clearTimeout(transitionTimer);
      transitionTimer = null;
    }
    stopGauge();
  }

  function handleManualAction() {
    const item = session[currentToolIndex];
    if (item && isToolMaxTimeExpiredOrAdvancing(item)) {
      void enforceCurrentToolMaxTime();
      return;
    }

    manualActionHandler?.();
  }

  async function advanceToNextQuestion(item) {
    try {
      await nextQuestion(item, false);
    } catch (err) {
      onFatalError?.(err?.message || "Erreur pendant la séance.");
    }
  }

  function refreshShellManualAction(item) {
    if (runMode === "projected-teacher") {
      hideManualAction();
      return;
    }

    if (!item || !isSessionRunning || paused || isToolMaxTimeExpiredOrAdvancing(item)) {
      hideManualAction();
      return;
    }

    const shellValidation = getShellValidationState(item);
    if (shellValidation.visible === true) {
      showManualAction("Valider", () => {
        triggerShellValidate();
      }, {
        enabled: shellValidation.enabled === true
      });
      return;
    }

    if (phase.kind === "QUESTION" && item.infiniteTimePerQ && item.usesCustomQuestionFlow !== true) {
      showManualAction(item.hasAnswerPhase === false ? "Question suivante" : "Afficher la réponse", async () => {
        hideManualAction();

        if (item.hasAnswerPhase === false) {
          await advanceToNextQuestion(item);
          return;
        }

        beginAnswerPhase(item, item.infiniteAnswerTime ? Number.POSITIVE_INFINITY : item.answerTime * 1000, { showAnswerNow: true });
      });
      return;
    }

    if (phase.kind === "ANSWER" && item.infiniteAnswerTime && item.usesCustomQuestionFlow !== true) {
      if (shouldUseGroupAnswerAttribution(item)) {
        showManualAction("Qui a la bonne réponse ?", () => {
          openGroupAnswerAttributionOverlay(item);
        });
        return;
      }

      showManualAction("Question suivante", async () => {
        hideManualAction();
        await advanceToNextQuestion(item);
      });
      return;
    }

    hideManualAction();
  }

  function showManualAction(label, onClick, { enabled = true } = {}) {
    if (!manualControlsEnabled) {
      hideManualAction();
      return;
    }

    manualActionHandler = typeof onClick === "function" ? onClick : null;
    if (!els.manualActionBtn) return;
    els.manualActionBtn.textContent = String(label || "");
    els.manualActionBtn.classList.remove("hidden");
    els.manualActionBtn.disabled = !manualActionHandler || paused || enabled !== true;
  }

  function hideManualAction() {
    manualActionHandler = null;
    if (!els.manualActionBtn) return;
    els.manualActionBtn.textContent = "";
    els.manualActionBtn.disabled = true;
    els.manualActionBtn.classList.add("hidden");
  }

  function setStatus(text, mood) {
    if (els.pillStatus) {
      els.pillStatus.textContent = text;
      els.pillStatus.classList.remove("good", "warn", "bad");

      if (mood === "good") els.pillStatus.classList.add("good");
      else if (mood === "warn") els.pillStatus.classList.add("warn");
      else if (mood === "bad") els.pillStatus.classList.add("bad");
    }

    if (els.headerTitle) {
      els.headerTitle.textContent = text;
    }
  }

  function showTimer() {
    els.timer?.classList.remove("hidden");
  }

  function hideTimer() {
    els.timer?.classList.add("hidden");
  }

  function setTimerPhase(kind) {
    if (!els.timerBar) return;
    els.timerBar.classList.remove("is-question", "is-answer");

    if (kind === "answer") {
      els.timerBar.classList.add("is-answer");
      return;
    }

    els.timerBar.classList.add("is-question");
  }

  function clearWorkArea() {
    clearSessionStage();
    applyWorkAreaLayout(null);

    if (els.workArea) {
      els.workArea.innerHTML = "";
    }
  }

  function openOverlay({ title, body, actions, hint, opaque = false, transparent = false, bareCard = false }) {
    if (els.overlayTitle) els.overlayTitle.textContent = title ?? "";
    if (els.overlayBody) els.overlayBody.innerHTML = body ?? "";
    if (els.overlayHint) els.overlayHint.innerHTML = hint ?? "";

    if (els.overlayActions) {
      els.overlayActions.innerHTML = "";

      for (const a of (actions ?? [])) {
        const btn = document.createElement("button");
        btn.className = `btn ${a.primary ? "primary" : ""}`.trim();
        btn.textContent = a.label;
        btn.addEventListener("click", a.onClick);
        els.overlayActions.appendChild(btn);
      }
    }

    const overlayCard = els.overlay?.querySelector(".overlay-card");

    els.overlay?.classList.toggle("opaque", !!opaque);
    els.overlay?.classList.toggle("overlay-transparent", !!transparent);
    overlayCard?.classList.toggle("overlay-card-bare", !!bareCard);

    els.overlay?.classList.remove("hidden");
  }

  function closeOverlay() {
    const overlayCard = els.overlay?.querySelector(".overlay-card");

    els.overlay?.classList.add("hidden");
    els.overlay?.classList.remove("opaque");
    els.overlay?.classList.remove("overlay-transparent");
    overlayCard?.classList.remove("overlay-card-bare");

    if (els.overlayActions) els.overlayActions.innerHTML = "";
  }
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
