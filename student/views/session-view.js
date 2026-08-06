import { studentState } from "../student-state.js";
import {
  goBackToActivities,
  getSelectedParticipantsForCurrentMode,
  getSelectedParticipantsValidationIssue,
  applyExplorationProgressLevelToSelectedConfig
} from "../student-actions.js";
import {
  normalizeAccessCode,
  loadPublicActivityConfig,
  startPublicStudentActivityAttempt,
  recordPublicStudentActivityAttemptQuestion,
  finishPublicStudentActivityAttempt
} from "../student-api.js";
import { DEFAULT_ACTIVITY_MODE, normalizeActivityMode } from "../../shared/activity-modes.js";
import { normalizePassationProfile } from "../../shared/activity-config.js";
import {
  buildCatalogActivityConfig,
  findCatalogActivity,
  normalizeCatalogRuntimeContext,
  normalizeCatalogDifficultyLevel
} from "../../shared/catalogue.js";
import { createSessionEngine } from "../../shared/student-core.js";
import { createProjectedSessionLink } from "../../shared/projected-session-link.js";
import { setMaterialIcon } from "../../shared/material-icons-svg.js";
import { requestAppFullscreen } from "../../shared/dom-helpers.js";
import { createSessionShell } from "./session-shell.js";
const GAUGE_EPSILON = 1e-6;

function getFirstSequenceItem(configJson) {
  return Array.isArray(configJson?.sequence) && configJson.sequence.length
    ? configJson.sequence[0]
    : null;
}

function getCatalogActivityIdCandidate(remote, configJson, configName) {
  const firstItem = getFirstSequenceItem(configJson);
  return String(
    studentState.selectedConfig?.catalog_activity_id
    || studentState.selectedConfig?.catalogActivityId
    || studentState.selectedConfig?.progression_context?.catalogActivityId
    || remote?.catalog_activity_id
    || remote?.catalogActivityId
    || remote?.config_name_normalized
    || configJson?.catalog_activity_id
    || configJson?.catalogActivityId
    || firstItem?.catalog_activity_id
    || firstItem?.catalogActivityId
    || configName
    || ""
  ).trim();
}

function shouldUseExplorationAdaptiveCatalog(passationProfile, isProjectedTeacherMode = false, catalogContext = "exploration") {
  if (normalizeCatalogRuntimeContext(catalogContext) !== "exploration") return false;

  const entry = String(
    studentState.activityEntry
    || studentState.selectedConfig?.progression_context?.context
    || ""
  ).trim().toLowerCase();

  return !isProjectedTeacherMode
    && passationProfile?.activityMode === "individual"
    && entry === "exploration";
}

function rebuildExplorationCatalogRuntimeConfig(remote, passationProfile, configName, isProjectedTeacherMode = false, catalogContext = "exploration") {
  const configJson = remote?.config_json;
  if (!configJson || typeof configJson !== "object" || !Array.isArray(configJson.sequence)) {
    return configJson;
  }

  const runtimeContext = normalizeCatalogRuntimeContext(catalogContext ?? configJson.catalog_context);

  // Un test catalogue reçoit déjà une configuration complète, parfois construite
  // à partir de données temporaires qui n’existent pas dans le catalogue persistant
  // (par exemple le snapshot courant de l’Atelier Quiz). La reconstruction prévue
  // pour l’Exploration remplacerait alors ces réglages par ceux du catalogue et
  // ferait disparaître les données temporaires avant le chargement de l’outil.
  if (runtimeContext !== "exploration") {
    return configJson;
  }

  const activityIdCandidate = getCatalogActivityIdCandidate(remote, configJson, configName);
  const catalogActivity = findCatalogActivity(activityIdCandidate, studentState.activities)
    || findCatalogActivity(configName, studentState.activities);

  if (!catalogActivity) {
    return configJson;
  }

  const firstItem = getFirstSequenceItem(configJson);
  const progressionContext = studentState.selectedConfig?.progression_context || {};
  const difficultyLevel = normalizeCatalogDifficultyLevel(
    studentState.selectedConfig?.catalog_difficulty_level
    ?? studentState.selectedConfig?.catalogDifficultyLevel
    ?? firstItem?.catalog_difficulty_level
    ?? firstItem?.catalogDifficultyLevel
    ?? configJson?.catalog_difficulty_level
    ?? configJson?.catalogDifficultyLevel
    ?? progressionContext.startedLevel
    ?? 3
  );

  const rebuilt = buildCatalogActivityConfig(catalogActivity, {
    activityMode: passationProfile.activityMode,
    responseUi: passationProfile.responseUi,
    progressMode: passationProfile.progressMode,
    difficultyLevel,
    context: runtimeContext,
    adaptive: shouldUseExplorationAdaptiveCatalog(passationProfile, isProjectedTeacherMode, runtimeContext),
    catalogActivities: studentState.activities
  });

  const rebuiltFirstItem = getFirstSequenceItem(rebuilt);
  if (!rebuiltFirstItem) {
    return configJson;
  }


  return {
    ...configJson,
    catalog_activity_id: catalogActivity.id,
    catalog_difficulty_level: rebuilt.catalog_difficulty_level,
    catalog_context: rebuilt.catalog_context,
    activity_mode: rebuilt.activity_mode,
    response_ui: rebuilt.response_ui,
    progress_mode: rebuilt.progress_mode,
    globals: rebuilt.globals ?? configJson.globals ?? {},
    sequence: rebuilt.sequence
  };
}

export function renderSessionView(root){
  const isProjectedTeacherMode = studentState.sessionMode === "projected-teacher";
  const isSharedSessionEntry = studentState.sharedSessionEntry === true;
  const currentMode = normalizeActivityMode(studentState.activitiesMode, DEFAULT_ACTIVITY_MODE);
  const selectedConfigJson = studentState.selectedConfig?.config_json;
  const selectedFirstItem = getFirstSequenceItem(selectedConfigJson);
  const catalogRuntimeContext = normalizeCatalogRuntimeContext(
    studentState.selectedConfig?.catalog_context
      || studentState.selectedConfig?.catalogContext
      || selectedConfigJson?.catalog_context
      || selectedConfigJson?.catalogContext
      || selectedFirstItem?.catalog_context
      || selectedFirstItem?.catalogContext
      || studentState.projectedSession?.catalogRuntimeContext
      || ""
  );
  const catalogDifficultyLevel = normalizeCatalogDifficultyLevel(
    studentState.selectedConfig?.catalog_difficulty_level
      ?? studentState.selectedConfig?.catalogDifficultyLevel
      ?? studentState.projectedSession?.catalogDifficultyLevel
      ?? 3
  );
  const isCatalogTestMode = catalogRuntimeContext === "test";
  const catalogTestCloseHandler = typeof studentState.selectedConfig?.catalogTestClose === "function"
    ? studentState.selectedConfig.catalogTestClose
    : null;
  const hasIndividualSidebar = !isProjectedTeacherMode && !isCatalogTestMode && currentMode === "individual";

  const { els } = createSessionShell(root, {
    currentMode,
    hasIndividualSidebar,
    isCatalogTestMode,
    isProjectedTeacherMode,
    isSharedSessionEntry
  });

  const controller = new AbortController();
  const { signal } = controller;

  let engine = null;
  let disposed = false;
  let exitConfirmOpen = false;
  let allowProjectedUnload = false;
  let projectedControlsVisible = true;
  let projectedSessionLink = null;
  let fitResizeObserver = null;
  let toolCountdownTicker = null;
  let attemptStopStatus = "interrupted";
  const detailedHistoryIdentityByAttempt = new Map();

  const SESSION_SCENE_WIDTH = 1920;
  const SESSION_SCENE_BASE_HEIGHT = 1080;
  const SESSION_SCENE_MAX_HEIGHT = 1536;
  const SESSION_CHROME_BASE_TOP = 70;
  const SESSION_CHROME_MAX_TOP = 120;
  const SESSION_CHROME_BASE_BOTTOM = 80;
  const SESSION_CHROME_MAX_BOTTOM = 120;
  const SESSION_CONTENT_BASE_HEIGHT = 930;
  const SESSION_CONTENT_MAX_HEIGHT = 1296;
  const supportsCssZoom = typeof document?.documentElement?.style?.zoom !== "undefined";
  const shouldUseCssZoomForFit = supportsCssZoom && !isCatalogTestMode;

  allowProjectedUnload = window.__allowProjectedUnload === true;

  const accessCode = normalizeAccessCode(studentState.accessCode);
  const configName = String(studentState.selectedConfig?.config_name || "").trim();

  if (isProjectedTeacherMode) {
    projectedSessionLink = createProjectedSessionLink({
      accessCode,
      configName,
      onMessage: handleProjectedMessage
    });
  }

  bindStaticEvents();
  startFitLayoutObserver();
  updateSessionFitLayout();
  syncFinalChallengePanel();
  syncIndividualGauge();
  syncEvaluationCounter();
  syncFixedQuestionCounter();
  void boot();

  return cleanup;

  async function boot(){
    if (!accessCode || !configName){
      showFatalError("Paramètres invalides. Retourne à la liste des activités.");
      return;
    }

    try {
      const localConfigJson = studentState.selectedConfig?.config_json;
      const remote = localConfigJson && typeof localConfigJson === "object" && Array.isArray(localConfigJson.sequence)
        ? {
          module_key: studentState.selectedConfig?.module_key || "tools",
          config_json: localConfigJson,
          activity_mode: localConfigJson.activity_mode
        }
        : await loadPublicActivityConfig(accessCode, configName, {
          context: catalogRuntimeContext,
          difficultyLevel: catalogDifficultyLevel
        });
      if (disposed) return;

      if (!Array.isArray(remote?.config_json?.sequence)){
        showFatalError("Configuration introuvable ou invalide.");
        return;
      }

      const moduleKey = String(
        remote.module_key ??
        remote.module ??
        "tools"
      ).trim();

      if (!moduleKey){
        showFatalError("Module d’activité introuvable.");
        return;
      }

      const loadedActivityMode = normalizeActivityMode(
        remote.config_json?.activity_mode ?? remote.activity_mode ?? studentState.activitiesMode,
        DEFAULT_ACTIVITY_MODE
      );
      const loadedPassationProfile = normalizePassationProfile({
        activityMode: loadedActivityMode,
        responseUi: remote.config_json?.response_ui,
        progressMode: remote.config_json?.progress_mode
      });

      if (remote.config_json && remote.config_json.response_ui == null) {
        remote.config_json.response_ui = loadedPassationProfile.responseUi;
      }

      const runtimeConfigJson = rebuildExplorationCatalogRuntimeConfig(
        remote,
        loadedPassationProfile,
        configName,
        isProjectedTeacherMode,
        catalogRuntimeContext
      );

      engine = createSessionEngine({
        els,
        accessCode,
        configName,
        moduleKey,
        globals: runtimeConfigJson.globals ?? {},
        sequence: runtimeConfigJson.sequence,
        activityMode: loadedPassationProfile.activityMode,
        responseUi: loadedPassationProfile.responseUi,
        progressMode: loadedPassationProfile.progressMode,
        onExitToActivities: () => {
          if (isProjectedTeacherMode) {
            closeProjectedWindow();
            return;
          }

          if (isCatalogTestMode && catalogTestCloseHandler) {
            catalogTestCloseHandler();
            return;
          }

          goBackToActivities();
        },
        onFatalError: (message) => {
          showFatalError(message);
        },
        onSessionFinished: (summary) => {
          syncFinishedExplorationLevel(summary);
        },
        onActivityAttemptStarted: shouldRecordDetailedHistory()
          ? (payload) => startDetailedActivityAttempt(payload)
          : undefined,
        onActivityQuestionRecorded: shouldRecordDetailedHistory()
          ? (payload) => recordDetailedActivityQuestion(payload)
          : undefined,
        onActivityAttemptFinished: shouldRecordDetailedHistory()
          ? (payload) => finishDetailedActivityAttempt(payload)
          : undefined,
        onStateChange: () => {
          syncPauseButton();
          syncProjectedControls();
          syncFinalChallengePanel();
          syncIndividualGauge();
          syncEvaluationCounter();
          syncFixedQuestionCounter();
          syncToolCountdownPill();
          updateSessionFitLayout();
          sendProjectedStatus();
        },
        runMode: studentState.sessionMode
      });

      await engine.init();

      if (disposed){
        engine.stop?.();
        return;
      }

      const meta = engine.getSessionMeta?.() ?? { requiresStudent: false, allowedStudentIds: [] };

      if (meta.requiresStudent && !isProjectedTeacherMode && !isCatalogTestMode) {
        const selectionIssue = getSelectedParticipantsValidationIssue(meta);
        if (selectionIssue) {
          showFatalError(selectionIssue);
          return;
        }
      }

      const selectedParticipants = getSelectedParticipantsForCurrentMode();

      if (loadedActivityMode === "group" && selectedParticipants.length >= 2) {
        engine.setSelectedStudents?.(selectedParticipants);
      } else if (loadedActivityMode === "individual" && selectedParticipants.length >= 1) {
        engine.setSelectedStudent?.(selectedParticipants[0]);
      }

      await engine.startSession?.();

      if (isProjectedTeacherMode) {
        forceHideStudentManualButton();
      }

      syncPauseButton();
      syncProjectedControls();
      syncFinalChallengePanel();
      syncIndividualGauge();
      syncEvaluationCounter();
      syncFixedQuestionCounter();
      syncToolCountdownPill();
      sendProjectedStatus();
    } catch (err) {
      if (disposed) return;
      showFatalError(err?.message || "Impossible de charger cette activité.");
    }
  }

  function cleanup(){
    if (disposed) return;
    disposed = true;

    closeExitConfirm();
    controller.abort();
    stopToolCountdownTicker();
    stopFitLayoutObserver();

    try {
      engine?.stop?.({ attemptStatus: attemptStopStatus });
    } catch {}

    try {
      projectedSessionLink?.close?.();
    } catch {}
  }

  function bindStaticEvents(){
    els.btnBackToActivities?.addEventListener("click", () => {
      if (!engine?.isRunning?.()) {
        leaveSessionImmediately();
        return;
      }

      openExitConfirm();
    }, { signal });

    els.btnPause?.addEventListener("click", () => {
      if (!engine || exitConfirmOpen) return;

      if (engine.isPaused?.()) {
        engine.resumeAfterPause?.();
      } else {
        engine.pauseForInterruption?.();
      }

      syncPauseButton();
      syncProjectedControls();
      syncFinalChallengePanel();
      syncIndividualGauge();
      syncEvaluationCounter();
      syncFixedQuestionCounter();
      syncToolCountdownPill();
    }, { signal });

    els.btnPrevTool?.addEventListener("click", async () => {
      if (!engine || exitConfirmOpen) return;
      await engine.goToPreviousTool?.();
      syncProjectedControls();
    }, { signal });

    els.btnShowAnswer?.addEventListener("click", () => {
      if (!engine || exitConfirmOpen) return;
      const ui = engine.getUiState?.() ?? {};
      if (ui.projectedPrimaryActionKind === "validate") {
        engine.triggerShellValidate?.();
      } else {
        engine.revealAnswerNow?.();
      }
      syncProjectedControls();
    }, { signal });

    els.btnNextQuestion?.addEventListener("click", async () => {
      if (!engine || exitConfirmOpen) return;
      await engine.goToNextQuestionNow?.();
      syncProjectedControls();
    }, { signal });

    els.btnNextTool?.addEventListener("click", async () => {
      if (!engine || exitConfirmOpen) return;
      await engine.goToNextTool?.();
      syncProjectedControls();
    }, { signal });

    els.manualActionBtn?.addEventListener("click", () => {
      if (!engine || exitConfirmOpen) return;
      engine.handleManualAction?.();
      syncProjectedControls();
    }, { signal });

    els.answerDisplayToggleBtn?.addEventListener("click", async () => {
      if (!engine || exitConfirmOpen) return;
      await engine.toggleShellAnswerDisplay?.();
      syncProjectedControls();
    }, { signal });

    root.addEventListener("click", (event) => {
      if (event.target.closest("[data-skip-autofs='true']")) return;
      if (isCatalogTestMode) return;
      enterFullscreenIfPossible();
    }, { signal });

    window.addEventListener("beforeunload", (e) => {
      if (isProjectedTeacherMode && allowProjectedUnload) return;
      if (isProjectedTeacherMode) return;
      if (isSharedSessionEntry) return;
      if (!engine?.isRunning?.()) return;
      e.preventDefault();
      e.returnValue = "";
    }, { signal });

    window.addEventListener("unload", () => {
      notifyProjectionClosed();
    }, { signal });

    window.addEventListener("keydown", (e) => {
      const key = String(e.key || "").toLowerCase();
      const isRefresh = (e.key === "F5") || (e.ctrlKey && key === "r");
      if (isRefresh) {
        if (!engine?.isRunning?.()) return;
        e.preventDefault();
        openExitConfirm();
        return;
      }

      if (exitConfirmOpen || !engine?.isRunning?.()) return;

      if (isNextQuestionShortcutEvent(e) && triggerVisibleNextQuestionAction()) {
        e.preventDefault();
        return;
      }

      if (!isProjectedTeacherMode) return;

      if (key === " ") {
        if (isEditableEventTarget(e.target)) return;
        e.preventDefault();
        if (engine.isPaused?.()) {
          engine.resumeAfterPause?.();
        } else {
          engine.pauseForInterruption?.();
        }
        return;
      }

      if (key === "arrowleft") {
        e.preventDefault();
        void engine.goToPreviousTool?.();
        return;
      }

      if (key === "arrowright") {
        e.preventDefault();
        void engine.goToNextQuestionNow?.();
        return;
      }
    }, { signal });
  }

  function isNextQuestionShortcutEvent(event){
    if (!event) return false;
    if (event.repeat) return false;
    if (event.altKey || event.ctrlKey || event.metaKey) return false;
    if (String(event.key || "").toLowerCase() !== " ") return false;
    return !isEditableEventTarget(event.target);
  }

  function isEditableEventTarget(target){
    const el = target instanceof Element ? target : null;
    if (!el) return false;
    if (el.closest("input:not([readonly]):not([type='button']):not([type='submit']):not([type='reset']):not([type='checkbox']):not([type='radio'])")) return true;
    if (el.closest("textarea")) return true;
    if (el.closest("select")) return true;
    if (el.closest("[contenteditable=''], [contenteditable='true']")) return true;
    return false;
  }

  function getVisibleNextQuestionButton(){
    if (isProjectedTeacherMode) {
      if (projectedControlsVisible !== true) return null;
      if (!els.btnNextQuestion || els.btnNextQuestion.disabled) return null;
      return els.btnNextQuestion;
    }

    const btn = els.manualActionBtn;
    if (!btn || btn.disabled) return null;
    if (btn.classList.contains("hidden")) return null;
    if (String(btn.textContent || "").trim().toLowerCase() !== "question suivante") return null;
    return btn;
  }

  function triggerVisibleNextQuestionAction(){
    const button = getVisibleNextQuestionButton();
    if (!button) return false;
    button.click();
    return true;
  }

  function handleProjectedMessage(message){
    const type = String(message?.type || "").trim();

    if (type === "request-status") {
      sendProjectedStatus();
      return;
    }

    if (type === "apply-config") {
      void applyProjectedConfig(message);
      return;
    }

    if (type !== "command") return;

    void handleProjectedCommand(message);
  }

  async function applyProjectedConfig(message){
    if (!engine) return;

    try {
      await engine.applyLiveConfig?.({
        globals: message.globals,
        sequence: message.sequence
      });
      sendProjectedStatus();
    } catch {}
  }

  async function handleProjectedCommand(message){
    if (!isProjectedTeacherMode) return;

    const command = String(message?.command || "").trim();
    if (!command) return;

    if (command === "close") {
      closeProjectedWindow();
      return;
    }

    if (!engine || exitConfirmOpen) return;

    if (command === "pause") {
      if (!engine.isPaused?.()) {
        engine.pauseForInterruption?.();
      }
      sendProjectedStatus();
      return;
    }

    if (command === "resume") {
      if (engine.isPaused?.()) {
        engine.resumeAfterPause?.();
      }
      sendProjectedStatus();
      return;
    }

    if (command === "set-controls-visible") {
      projectedControlsVisible = message.visible !== false;
      syncProjectedControlsVisibility();
      sendProjectedStatus();
      return;
    }

    if (command === "go-prev-tool") {
      await engine.goToPreviousTool?.();
      sendProjectedStatus();
      return;
    }

    if (command === "go-next-tool") {
      await engine.goToNextTool?.();
      sendProjectedStatus();
      return;
    }

    if (command === "show-answer") {
      engine.revealAnswerNow?.();
      sendProjectedStatus();
      return;
    }

    if (command === "validate") {
      engine.triggerShellValidate?.();
      sendProjectedStatus();
      return;
    }

    if (command === "next-question") {
      await engine.goToNextQuestionNow?.();
      sendProjectedStatus();
      return;
    }

    if (command === "go-to-instance") {
      await engine.goToToolByInstanceId?.(message.instanceId);
      sendProjectedStatus();
    }
  }

  function sendProjectedStatus(){
    if (!isProjectedTeacherMode || !projectedSessionLink) return;

    const ui = engine?.getUiState?.() ?? {};
    projectedSessionLink.send("status", {
      active: true,
      route: "session",
      running: ui.running === true,
      paused: ui.paused === true,
      phase: String(ui.phase || "IDLE"),
      currentToolIndex: Number.isInteger(ui.currentToolIndex) ? ui.currentToolIndex : -1,
      totalTools: Number.isInteger(ui.totalTools) ? ui.totalTools : 0,
      currentInstanceId: String(ui.currentInstanceId || ""),
      currentQuestionNumber: Math.max(0, Number(ui.currentQuestionNumber) || 0),
      totalQuestionCountLabel: String(ui.totalQuestionCountLabel || "—"),
      canGoPrevTool: ui.canGoPrevTool === true,
      canGoNextTool: ui.canGoNextTool === true,
      canRevealAnswer: ui.canRevealAnswer === true,
      canAdvanceQuestion: ui.canAdvanceQuestion === true,
      projectedPrimaryActionKind: String(ui.projectedPrimaryActionKind || "answer"),
      projectedPrimaryActionLabel: String(ui.projectedPrimaryActionLabel || "Réponse"),
      projectedPrimaryActionIcon: String(ui.projectedPrimaryActionIcon || "visibility"),
      projectedPrimaryActionEnabled: ui.projectedPrimaryActionEnabled === true,
      controlsHidden: projectedControlsVisible !== true
    });
  }

  function notifyProjectionClosed(){
    if (!isProjectedTeacherMode || !projectedSessionLink) return;
    projectedSessionLink.send("projection-closed", { active: false });
  }

  function closeProjectedWindow(){
    notifyProjectionClosed();
    studentState.sessionMode = "student";
    studentState.projectedSession = null;

    try {
      window.__allowProjectedUnload = true;
      window.close();
    } catch {}

    if (!window.closed) {
      window.location.hash = "#/home";
    }
  }

  function shouldRecordDetailedHistory(){
    if (isProjectedTeacherMode || isCatalogTestMode || isSharedSessionEntry) return false;
    if (normalizeActivityMode(studentState.activitiesMode, DEFAULT_ACTIVITY_MODE) !== "individual") return false;
    const participant = getSelectedParticipantsForCurrentMode()[0] || null;
    return !!participant?.id && !!String(studentState.studentCode || "").trim();
  }

  function getDetailedHistoryParticipant(){
    return getSelectedParticipantsForCurrentMode()[0] || null;
  }

  async function startDetailedActivityAttempt(payload = {}){
    const participant = getDetailedHistoryParticipant();
    const identity = {
      accessCode: String(studentState.accessCode || ""),
      studentId: Number(participant?.id),
      studentCode: String(studentState.studentCode || "")
    };
    if (!Number.isFinite(identity.studentId) || identity.studentId <= 0 || !identity.studentCode.trim()) return null;

    try {
      const attemptId = await startPublicStudentActivityAttempt({
        accessCode: identity.accessCode,
        studentId: identity.studentId,
        studentCode: identity.studentCode,
        catalogActivityId: payload.catalogActivityId,
        context: payload.context,
        missionId: payload.missionId || studentState.selectedMission?.id || studentState.selectedConfig?.mission_id || null,
        missionStepId: payload.missionStepId || null,
        clientAttemptId: payload.clientAttemptId,
        toolId: payload.toolId,
        toolInstanceId: payload.toolInstanceId,
        activityTitle: payload.activityTitle,
        startedLevel: payload.startedLevel,
        metadata: payload.metadata,
        configSnapshot: payload.configSnapshot
      });
      if (attemptId) detailedHistoryIdentityByAttempt.set(String(attemptId), identity);
      return attemptId ? { attemptId } : null;
    } catch (error) {
      console.warn("Impossible d’ouvrir l’historique détaillé de l’activité.", error);
      return null;
    }
  }

  async function recordDetailedActivityQuestion(payload = {}){
    const attemptId = String(payload.attemptId || "").trim();
    const identity = detailedHistoryIdentityByAttempt.get(attemptId);
    if (!identity || !attemptId) return null;

    try {
      return await recordPublicStudentActivityAttemptQuestion({
        accessCode: identity.accessCode,
        studentId: identity.studentId,
        studentCode: identity.studentCode,
        attemptId,
        questionIndex: payload.questionIndex,
        toolId: payload.toolId,
        toolInstanceId: payload.toolInstanceId,
        levelPresented: payload.levelPresented,
        levelAfter: payload.levelAfter,
        outcome: payload.outcome,
        pointsAwarded: payload.pointsAwarded,
        durationMs: payload.durationMs,
        questionSnapshot: payload.questionSnapshot,
        answerSnapshot: payload.answerSnapshot,
        correctionSnapshot: payload.correctionSnapshot
      });
    } catch (error) {
      console.warn("Impossible d’enregistrer le détail de la question.", error);
      return null;
    }
  }

  async function finishDetailedActivityAttempt(payload = {}){
    const attemptId = String(payload.attemptId || "").trim();
    const identity = detailedHistoryIdentityByAttempt.get(attemptId);
    if (!identity || !attemptId) return null;

    try {
      const result = await finishPublicStudentActivityAttempt({
        accessCode: identity.accessCode,
        studentId: identity.studentId,
        studentCode: identity.studentCode,
        attemptId,
        status: payload.status,
        endedLevel: payload.endedLevel,
        durationMs: payload.durationMs
      });

      if (payload.context === "exploration" && result?.ended_level != null) {
        void applyExplorationProgressLevelToSelectedConfig(result.ended_level);
      }

      detailedHistoryIdentityByAttempt.delete(attemptId);
      return result;
    } catch (error) {
      console.warn("Impossible de finaliser l’historique détaillé de l’activité.", error);
      return null;
    }
  }

  function syncFinishedExplorationLevel(summary){
    const context = studentState.selectedConfig?.progression_context;
    if (!context || String(context.context || "").trim() !== "exploration") return;

    const item = (Array.isArray(summary?.items) ? summary.items : [])
      .find((entry) => String(entry?.catalogActivityId || "") === String(context.catalogActivityId || ""));
    if (!item) return;

    void applyExplorationProgressLevelToSelectedConfig(item.endedLevel ?? item.startedLevel ?? context.startedLevel ?? 3);
  }


  function syncPauseButton(){
    const paused = !!engine?.isPaused?.();
    const running = !!engine?.isRunning?.();

    els.page?.classList.toggle("session-page-paused", paused);

    if (els.btnPause) {
      els.btnPause.disabled = !running && !paused;
      els.btnPause.title = paused ? "Reprendre" : "Pause";
      els.btnPause.setAttribute("aria-label", paused ? "Reprendre" : "Pause");
    }

    if (els.btnPauseIcon) {
      setMaterialIcon(els.btnPauseIcon, paused ? "play_arrow" : "pause");
    }
  }

  function syncProjectedControls(){
    syncShellAnswerToggle();

    if (isProjectedTeacherMode) {
      forceHideStudentManualButton();
      syncProjectedControlsVisibility();
    }

    if (!isProjectedTeacherMode || !engine) return;

    const ui = engine.getUiState?.() ?? {};
    if (els.btnPrevTool) els.btnPrevTool.disabled = !ui.canGoPrevTool;
    if (els.btnShowAnswer) {
      els.btnShowAnswer.disabled = !ui.projectedPrimaryActionEnabled;
      const label = String(ui.projectedPrimaryActionLabel || "Réponse");
      const icon = String(ui.projectedPrimaryActionIcon || "visibility");
      const title = label;
      els.btnShowAnswer.title = title;
      els.btnShowAnswer.setAttribute('aria-label', title);
      const iconEl = els.btnShowAnswer.querySelector('.projected-session-btn-icon');
      const labelEl = els.btnShowAnswer.querySelector('.projected-session-btn-label');
      if (iconEl) setMaterialIcon(iconEl, icon);
      if (labelEl) labelEl.textContent = label;
    }
    if (els.btnNextQuestion) els.btnNextQuestion.disabled = !ui.canAdvanceQuestion;
    if (els.btnNextTool) els.btnNextTool.disabled = !ui.canGoNextTool;
  }

  function syncShellAnswerToggle(){
    const btn = els.answerDisplayToggleBtn;
    if (!btn) return;

    const ui = engine?.getUiState?.() ?? {};
    const visible = ui.shellAnswerToggleVisible === true;
    const enabled = ui.shellAnswerToggleEnabled === true;
    const label = String(ui.shellAnswerToggleLabel || "Voir ma réponse");
    const icon = String(ui.shellAnswerToggleIcon || "sync_alt");
    const iconEl = btn.querySelector(".projected-session-btn-icon, .session-shell-btn-icon");
    const labelEl = btn.querySelector(".projected-session-btn-label, .session-shell-btn-label");

    btn.classList.toggle("hidden", !visible);
    btn.disabled = !visible || !enabled;
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.setAttribute("aria-hidden", visible ? "false" : "true");

    if (iconEl) setMaterialIcon(iconEl, icon);
    if (labelEl) labelEl.textContent = label;
  }

  function forceHideStudentManualButton(){
    const btn = els.manualActionBtn;
    if (!btn) return;

    btn.classList.add("hidden");
    btn.disabled = true;
    btn.setAttribute("aria-hidden", "true");
    btn.textContent = "";
  }

  function syncProjectedControlsVisibility(){
    if (!isProjectedTeacherMode) return;

    const shouldHide = projectedControlsVisible !== true;
    const page = root.querySelector("#sessionPage");
    page?.classList.toggle("projected-ui-controls-hidden", shouldHide);
    updateSessionFitLayout();
  }

  function openExitConfirm(){
    if (!engine?.isRunning?.()) {
      leaveSessionImmediately();
      return;
    }

    if (!engine.isPaused?.()) {
      engine.pauseForInterruption?.();
    }

    exitConfirmOpen = true;
    renderExitConfirm();
    syncPauseButton();
    syncProjectedControls();
  }

  function closeExitConfirm(){
    exitConfirmOpen = false;

    if (els.confirmLayer) {
      els.confirmLayer.innerHTML = "";
      els.confirmLayer.classList.add("hidden");
    }
  }

  function resumeFromExitConfirm(){
    closeExitConfirm();
    engine?.resumeAfterPause?.();
    syncPauseButton();
    syncProjectedControls();
  }

  function leaveSessionFromExitConfirm(){
    attemptStopStatus = "abandoned";
    try {
      engine?.stop?.({ attemptStatus: "abandoned" });
    } catch {}
    leaveSessionImmediately();
  }

  function leaveSessionImmediately(){
    if (isProjectedTeacherMode) {
      closeProjectedWindow();
      return;
    }

    if (isCatalogTestMode && catalogTestCloseHandler) {
      catalogTestCloseHandler();
      return;
    }

    goBackToActivities();
  }

  function renderExitConfirm(){
    if (!els.confirmLayer) return;

    const title = isProjectedTeacherMode ? "Fermer la projection ?" : "Quitter la séance ?";
    const text = isProjectedTeacherMode
      ? "La fenêtre de projection va être fermée."
      : "La séance en cours va être interrompue.";
    const confirmLabel = isProjectedTeacherMode ? "Fermer" : "Oui";

    els.confirmLayer.innerHTML = `
      <div class="session-confirm-backdrop"></div>
      <div class="session-confirm-dialog">
        <div class="session-confirm-title">${escapeHtml(title)}</div>
        <div class="session-confirm-text">${escapeHtml(text)}</div>
        <div class="session-confirm-actions">
          <button class="btn session-confirm-btn" id="sessionConfirmStayBtn" type="button" data-skip-autofs="true">Non</button>
          <button class="btn primary session-confirm-btn" id="sessionConfirmLeaveBtn" type="button" data-skip-autofs="true">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;

    els.confirmLayer.classList.remove("hidden");

    els.confirmLayer.querySelector("#sessionConfirmStayBtn")
      ?.addEventListener("click", resumeFromExitConfirm, { signal });

    els.confirmLayer.querySelector("#sessionConfirmLeaveBtn")
      ?.addEventListener("click", leaveSessionFromExitConfirm, { signal });
  }

  function startFitLayoutObserver(){
    if (!els.viewport) return;

    if (fitResizeObserver) {
      fitResizeObserver.disconnect();
      fitResizeObserver = null;
    }

    if (typeof ResizeObserver === "function") {
      fitResizeObserver = new ResizeObserver(() => {
        updateSessionFitLayout();
      });

      fitResizeObserver.observe(els.viewport);
      if (els.manualActionBtn) fitResizeObserver.observe(els.manualActionBtn);
      if (els.answerDisplayToggleBtn) fitResizeObserver.observe(els.answerDisplayToggleBtn);
      if (els.timer) fitResizeObserver.observe(els.timer);
      if (els.btnPause) fitResizeObserver.observe(els.btnPause);
      if (els.btnBackToActivities) fitResizeObserver.observe(els.btnBackToActivities);
      if (els.btnPrevTool) fitResizeObserver.observe(els.btnPrevTool);
      if (els.btnShowAnswer) fitResizeObserver.observe(els.btnShowAnswer);
      if (els.btnNextQuestion) fitResizeObserver.observe(els.btnNextQuestion);
      if (els.btnNextTool) fitResizeObserver.observe(els.btnNextTool);
    }

    window.addEventListener("resize", updateSessionFitLayout, { signal, passive: true });
    window.addEventListener("orientationchange", updateSessionFitLayout, { signal, passive: true });
    document.addEventListener("fullscreenchange", updateSessionFitLayout, { signal });
  }

  function stopFitLayoutObserver(){
    if (fitResizeObserver) {
      fitResizeObserver.disconnect();
      fitResizeObserver = null;
    }
  }

  function updateSessionFitLayout(){
    const viewport = els.viewport;
    const fitHost = els.fitHost;
    const sceneFrame = els.sceneFrame;
    const scene = els.scene;
    const page = root.querySelector("#sessionPage");

    if (!viewport || !fitHost || !sceneFrame || !scene) return;

    const viewportRect = viewport.getBoundingClientRect();
    const viewportWidth = Math.max(0, viewportRect.width || viewport.clientWidth || 0);
    const viewportHeight = Math.max(0, viewportRect.height || viewport.clientHeight || 0);

    if (viewportWidth <= 0 || viewportHeight <= 0) return;

    const scale = Math.min(
      viewportWidth / SESSION_SCENE_WIDTH,
      viewportHeight / SESSION_SCENE_BASE_HEIGHT,
      1
    );

    const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
    const wantedLogicalHeight = viewportHeight / safeScale;
    const adaptiveSceneHeight = clampNumber(
      wantedLogicalHeight,
      SESSION_SCENE_BASE_HEIGHT,
      SESSION_SCENE_MAX_HEIGHT
    );

    const heightRatio = (adaptiveSceneHeight - SESSION_SCENE_BASE_HEIGHT)
      / (SESSION_SCENE_MAX_HEIGHT - SESSION_SCENE_BASE_HEIGHT);

    const chromeTop = Math.round(lerp(SESSION_CHROME_BASE_TOP, SESSION_CHROME_MAX_TOP, heightRatio));
    const chromeBottom = Math.round(lerp(SESSION_CHROME_BASE_BOTTOM, SESSION_CHROME_MAX_BOTTOM, heightRatio));
    const contentHeight = Math.round(lerp(
      SESSION_CONTENT_BASE_HEIGHT,
      SESSION_CONTENT_MAX_HEIGHT,
      heightRatio
    ));
    const sceneHeight = chromeTop + contentHeight + chromeBottom;

    const scaledWidth = Math.max(1, Math.round(SESSION_SCENE_WIDTH * safeScale));
    const scaledHeight = Math.max(1, Math.round(sceneHeight * safeScale));

    fitHost.style.setProperty("--session-fit-width", `${scaledWidth}px`);
    fitHost.style.setProperty("--session-fit-height", `${scaledHeight}px`);
    fitHost.style.setProperty("--session-fit-scale", String(safeScale));
    page?.style.setProperty("--session-fit-scale", String(safeScale));
    page?.style.setProperty("--session-scene-height", `${sceneHeight}px`);
    page?.style.setProperty("--session-chrome-top", `${chromeTop}px`);
    page?.style.setProperty("--session-content-height", `${contentHeight}px`);
    page?.style.setProperty("--session-chrome-bottom", `${chromeBottom}px`);

    sceneFrame.style.width = `${scaledWidth}px`;
    sceneFrame.style.height = `${scaledHeight}px`;

    scene.style.width = `${SESSION_SCENE_WIDTH}px`;
    scene.style.height = `${sceneHeight}px`;
    scene.style.transformOrigin = "top left";

    if (shouldUseCssZoomForFit) {
      scene.style.zoom = String(safeScale);
      scene.style.transform = "";
    } else {
      scene.style.zoom = "";
      scene.style.transform = safeScale === 1 ? "" : `scale(${safeScale})`;
    }

    page?.classList.toggle("session-page-fit-active", safeScale < 0.999);
    page?.classList.toggle("session-page-fit-fallback", !shouldUseCssZoomForFit);
    page?.classList.toggle("session-page-transform-fit", !shouldUseCssZoomForFit);
  }

  function clampNumber(value, min, max){
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return min;
    return Math.min(max, Math.max(min, numeric));
  }

  function lerp(min, max, ratio){
    const t = clampNumber(ratio, 0, 1);
    return min + ((max - min) * t);
  }


  function syncFinalChallengePanel(){
    const ui = engine?.getUiState?.() ?? {};
    const finalChallenge = ui.finalChallenge || {};
    const visible = finalChallenge.active === true;

    syncRightReserveMode(visible);

    if (visible) {
      if (els.finalChallengeTime) {
        els.finalChallengeTime.textContent = String(finalChallenge.timeLabel || "00:00");
      }
      if (els.finalChallengeScore) {
        els.finalChallengeScore.textContent = String(Math.max(0, Math.floor(Number(finalChallenge.correctCount) || 0)));
      }
    }
  }

  function syncRightReserveMode(finalChallengeVisible){
    const visible = finalChallengeVisible === true;
    const gaugeVisible = !visible && shouldShowEvaluationGaugeShell();
    const counterVisible = !visible && !gaugeVisible && shouldShowEvaluationCounterShell();
    const fixedQuestionCounterVisible = !visible && !gaugeVisible && !counterVisible && shouldShowFixedQuestionCounterShell();

    els.rightReserve?.classList.toggle("is-final-challenge", visible);
    els.rightReserve?.setAttribute(
      "data-reserve-mode",
      visible
        ? "final-challenge"
        : (gaugeVisible ? "gauge" : (counterVisible ? "counter" : (fixedQuestionCounterVisible ? "fixed-question-counter" : "empty")))
    );

    els.finalChallengePanel?.classList.toggle("hidden", !visible);
    els.finalChallengePanel?.setAttribute("aria-hidden", visible ? "false" : "true");

    if (els.progressShell) {
      els.progressShell.hidden = !gaugeVisible;
      els.progressShell.classList.toggle("hidden", !gaugeVisible);
      els.progressShell.setAttribute("aria-hidden", gaugeVisible ? "false" : "true");
    }

    if (els.evaluationCounterShell) {
      els.evaluationCounterShell.hidden = !counterVisible;
      els.evaluationCounterShell.classList.toggle("hidden", !counterVisible);
      els.evaluationCounterShell.setAttribute("aria-hidden", counterVisible ? "false" : "true");
    }

    if (els.fixedQuestionCounterShell) {
      els.fixedQuestionCounterShell.hidden = !fixedQuestionCounterVisible;
      els.fixedQuestionCounterShell.classList.toggle("hidden", !fixedQuestionCounterVisible);
      els.fixedQuestionCounterShell.setAttribute("aria-hidden", fixedQuestionCounterVisible ? "false" : "true");
    }
  }

  function shouldShowEvaluationGaugeShell(){
    if (!engine || isProjectedTeacherMode) return false;
    const ui = engine?.getUiState?.() ?? {};
    return !!ui.evaluationGauge;
  }

  function shouldShowEvaluationCounterShell(){
    if (!engine || isProjectedTeacherMode) return false;
    const ui = engine?.getUiState?.() ?? {};
    return !!ui.evaluationCounter;
  }

  function shouldShowFixedQuestionCounterShell(){
    if (!engine || isProjectedTeacherMode) return false;
    const ui = engine?.getUiState?.() ?? {};
    return !!ui.fixedQuestionCounter;
  }

  function syncIndividualGauge(){
    const ui = engine?.getUiState?.() ?? {};
    if (ui.finalChallenge?.active === true) {
      syncRightReserveMode(true);
      return;
    }
    if (!shouldShowEvaluationGaugeShell()) {
      syncRightReserveMode(false);
      return;
    }
    syncRightReserveMode(false);
    if (!els.progressGauge || !els.progressTrack || !els.progressRocketWrap) return;

    const gauge = ui.evaluationGauge;
    const gaugeKey = String(ui.currentInstanceId || "");

    if ((els.progressTrack.dataset.gaugeKey || "") !== gaugeKey) {
      els.progressTrack.dataset.gaugeKey = gaugeKey;
      els.progressTrack.dataset.renderMode = "";
    }

    if (!gauge) {
      els.progressGauge.dataset.mode = "pending";
      els.progressGauge.classList.remove("is-launching", "is-complete");
      els.progressRocketWrap.classList.remove("is-on", "is-armed");
      els.progressTrack.dataset.renderMode = "pending";
      els.progressTrack.innerHTML = '<div class="session-progress-fill"></div>';
      return;
    }

    const mode = String(gauge.mode || "pending").trim().toLowerCase();
    const progress = Math.max(0, Math.min(1, Number(gauge.progress) || 0));
    const finiteLastQuestionArmed = mode === "finite"
      && gauge.completed !== true
      && Number(ui.questionCount) > 0
      && Number(ui.currentQuestionNumber) === Number(ui.questionCount);
    const infiniteWarningArmed = mode === "infinite"
      && gauge.completed !== true
      && progress + GAUGE_EPSILON >= 0.9
      && progress < 1 - GAUGE_EPSILON;
    const visualLaunching = gauge.launching === true || gauge.completed === true;
    const visualRocketOn = gauge.rocketState === "on" || visualLaunching;
    const visualArmed = !visualLaunching && (infiniteWarningArmed || finiteLastQuestionArmed);

    els.progressGauge.dataset.mode = mode;
    els.progressGauge.classList.toggle("is-launching", visualLaunching);
    els.progressGauge.classList.toggle("is-complete", gauge.completed === true);
    els.progressRocketWrap.classList.toggle("is-on", visualRocketOn);
    els.progressRocketWrap.classList.toggle("is-armed", visualArmed);

    if (mode === "finite") {
      renderFiniteGauge(gauge);
      return;
    }

    renderInfiniteGauge(gauge);
  }

  function renderInfiniteGauge(gauge){
    const milestones = Array.isArray(gauge?.milestones) ? gauge.milestones : [];
    const progressScale = Math.max(0, Math.min(1, Number(gauge?.progress) || 0));
    let fillEl = els.progressTrack.querySelector(".session-progress-fill");
    let milestoneEls = [...els.progressTrack.querySelectorAll(".session-progress-milestone")];
    const needsRerender = els.progressTrack.dataset.renderMode !== "infinite"
      || !fillEl
      || milestoneEls.length !== milestones.length;

    if (needsRerender) {
      els.progressTrack.innerHTML = `
        <div class="session-progress-fill"></div>
        ${milestones.map((value) => {
          const percent = Math.max(0, Math.min(100, Number(value || 0) * 100));
          return `<div class="session-progress-milestone" style="bottom:${percent}%"></div>`;
        }).join("")}
      `;
      els.progressTrack.dataset.renderMode = "infinite";
      fillEl = els.progressTrack.querySelector(".session-progress-fill");
      milestoneEls = [...els.progressTrack.querySelectorAll(".session-progress-milestone")];
    }

    milestoneEls.forEach((node, index) => {
      const percent = Math.max(0, Math.min(100, Number(milestones[index] || 0) * 100));
      node.style.bottom = `${percent}%`;
    });

    fillEl?.style.setProperty("transform", `scaleY(${progressScale})`);
  }

  function renderFiniteGauge(gauge){
    const segments = Array.isArray(gauge?.segments) ? gauge.segments : [];
    const orderedSegments = [...segments].reverse();
    els.progressTrack.dataset.renderMode = "finite";
    els.progressTrack.innerHTML = `
      <div class="session-progress-segments">
        ${orderedSegments.map((state) => {
          const safe = String(state || "pending").trim();
          const cls = safe === "correct"
            ? "is-correct"
            : (safe === "incorrect" ? "is-incorrect" : "is-pending");
          return `<div class="session-progress-segment ${cls}"></div>`;
        }).join("")}
      </div>
    `;
  }


  function syncEvaluationCounter(){
    const ui = engine?.getUiState?.() ?? {};
    if (ui.finalChallenge?.active === true) {
      syncRightReserveMode(true);
      return;
    }

    const counter = ui.evaluationCounter || null;
    if (!counter || !shouldShowEvaluationCounterShell()) {
      syncRightReserveMode(false);
      return;
    }

    syncRightReserveMode(false);
    if (els.evaluationCounterQuestions) {
      els.evaluationCounterQuestions.textContent = String(Math.max(0, Math.floor(Number(counter.attempted) || 0)));
    }
    if (els.evaluationCounterCorrect) {
      els.evaluationCounterCorrect.textContent = String(Math.max(0, Math.floor(Number(counter.correct) || 0)));
    }
  }

  function syncFixedQuestionCounter(){
    const ui = engine?.getUiState?.() ?? {};
    if (ui.finalChallenge?.active === true) {
      syncRightReserveMode(true);
      return;
    }

    const counter = ui.fixedQuestionCounter || null;
    if (!counter || !shouldShowFixedQuestionCounterShell()) {
      syncRightReserveMode(false);
      return;
    }

    syncRightReserveMode(false);
    if (els.fixedQuestionCounterValue) {
      const current = Math.max(1, Math.floor(Number(counter.current) || 1));
      const total = Math.max(1, Math.floor(Number(counter.total) || 1));
      els.fixedQuestionCounterValue.textContent = `${current} / ${total}`;
    }
  }

  function syncToolCountdownPill(){
    const pill = els.toolCountdownPill;
    if (!pill) return;

    const ui = engine?.getUiState?.() ?? {};
    const toolTime = ui.toolTime || {};
    const visible = toolTime.visible === true;

    pill.classList.toggle("hidden", !visible);
    pill.setAttribute("aria-hidden", visible ? "false" : "true");

    if (!visible) {
      hideToolCountdownPill();
      return;
    }

    const label = String(toolTime.timeLabel || "00:00");
    if (pill.textContent !== label) {
      pill.textContent = label;
    }

    pill.classList.toggle("is-expired", toolTime.expired === true);
    ensureToolCountdownTicker();
  }

  function ensureToolCountdownTicker(){
    if (toolCountdownTicker || disposed) return;

    toolCountdownTicker = window.setInterval(() => {
      if (disposed) {
        stopToolCountdownTicker();
        return;
      }

      syncToolCountdownPill();
    }, 250);
  }

  function stopToolCountdownTicker(){
    if (!toolCountdownTicker) return;

    window.clearInterval(toolCountdownTicker);
    toolCountdownTicker = null;
  }

  function hideToolCountdownPill(){
    const pill = els.toolCountdownPill;
    if (pill) {
      pill.textContent = "";
      pill.classList.add("hidden");
      pill.classList.remove("is-expired");
      pill.setAttribute("aria-hidden", "true");
    }

    stopToolCountdownTicker();
  }

  function showFatalError(message){
    const buttonLabel = isProjectedTeacherMode
      ? "Fermer la projection"
      : (isCatalogTestMode ? "Fermer le test" : "Retour aux activités");
    hideToolCountdownPill();

    els.workArea.innerHTML = `
      <div class="session-stage">
        <div class="session-message-card session-message-card-error">
          <div class="session-message-title">Impossible d’ouvrir la séance</div>
          <div class="session-message-text">${escapeHtml(message)}</div>
          <button class="btn primary btn-big" id="sessionFatalBackBtn" type="button">${escapeHtml(buttonLabel)}</button>
        </div>
      </div>
    `;

    document.getElementById("sessionFatalBackBtn")
      ?.addEventListener("click", leaveSessionImmediately, { signal });

    if (isProjectedTeacherMode) {
      forceHideStudentManualButton();
    }

    syncPauseButton();
    syncProjectedControls();
  }
}

function enterFullscreenIfPossible(){
  try {
    requestAppFullscreen();
  } catch {}
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
