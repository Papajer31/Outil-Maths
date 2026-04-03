import { loadModuleRuntime } from "./module-registry.js";
import {
  TOOL_LIMITS,
  DEFAULT_ACTIVITY_GLOBALS,
  clampInt,
  cloneData,
  normalizeActivityGlobals,
  normalizeToolDraft,
  normalizeActivitySequence
} from "./activity-config.js";

export function createSessionEngine({
  els,
  accessCode,
  configName,
  moduleKey,
  globals,
  drafts,
  sequence,
  onExitToActivities,
  onFatalError
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

  let paused = false;
  let engineState = "IDLE";
  let isSessionRunning = false;
  let phase = createPhase("IDLE");
  let pausedPhase = null;

  const toolModuleCache = new Map();

  let moduleRuntime = null;
  let selectedStudent = null;
  let sessionRequiresStudent = false;
  let allowedStudentIds = [];

  const activityGlobals = {
    ...DEFAULT_ACTIVITY_GLOBALS,
    ...normalizeActivityGlobals(globals)
  };

  return {
    init,
    openStartOverlay,
    startSession,
    pauseForInterruption,
    resumeAfterPause,
    isRunning,
    isPaused,
    stop,
    getSessionMeta,
    setSelectedStudent
  };

  async function init() {
    moduleRuntime = loadModuleRuntime(moduleKey);
    toolsCatalog = await moduleRuntime.loadToolsCatalog();

    const safeSequence = normalizeActivitySequence(sequence, {
      toolsCatalog,
      legacyDrafts: drafts
    });

    await prepareSessionFromSequence(safeSequence);

    if (!session.length) {
      throw new Error("Cette configuration ne contient aucun outil actif.");
    }
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
    isSessionRunning = false;
    paused = false;
    pausedPhase = null;
    engineState = "IDLE";
    phase = createPhase("IDLE");
    activeTool = null;
    hideTimer();
    clearWorkArea();
  }

  async function startSession() {
    if (sessionRequiresStudent && !selectedStudent) {
      onFatalError?.("Aucun élève sélectionné pour cette activité.");
      return;
    }

    currentToolIndex = -1;
    currentQuestionIndex = -1;
    isSessionRunning = true;
    paused = false;
    pausedPhase = null;
    engineState = "IDLE";
    phase = createPhase("IDLE");

    try {
      await nextTool(true);
    } catch (err) {
      onFatalError?.(err?.message || "Erreur pendant la séance.");
    }
  }

  async function nextTool(isFirst) {
    stopAllTimers();

    if (activeTool?.unmount) {
      try {
        activeTool.unmount(els.workArea, getToolContext(session[currentToolIndex]));
      } catch {}
    }
    activeTool = null;

    currentToolIndex += 1;
    currentQuestionIndex = -1;

    if (currentToolIndex >= session.length) {
      hideTimer();
      engineState = "DONE";
      phase = createPhase("DONE");
      isSessionRunning = false;
      setStatus("Séance terminée", "good");
      showSessionMessage({
        title: "Bravo, la séance est terminée.",
        buttonLabel: "Retour aux activités",
        onClick: onExitToActivities
      });
      return;
    }

    const item = session[currentToolIndex];
    setStatus(`${item.title} — prêt`, "warn");

    if (!isFirst) {
      openNextToolOverlay(item);
      return;
    }

    await beginTool(item);
  }

  async function beginTool(item) {
    stopAllTimers();

    const mod = await loadToolModule(item.id);
    activeTool = mod.default ?? {};

    const ctx = getToolContext(item);

    if (typeof activeTool.getQuestionCount === "function") {
      item.questionCount = clampInt(
        activeTool.getQuestionCount(ctx),
        1,
        999,
        item.questionCount
      );
    }

    if (typeof activeTool.getQuestionTime === "function") {
      item.timePerQ = clampInt(
        activeTool.getQuestionTime(ctx),
        1,
        300,
        item.timePerQ
      );
    }

    activeTool.mount?.(els.workArea, ctx);

    await nextQuestion(item, true);
  }

  async function nextQuestion(item, isFirstQuestion) {
    stopAllTimers();

    currentQuestionIndex += 1;

    if (currentQuestionIndex >= item.questionCount) {
      hideTimer();
      await nextTool(false);
      return;
    }

    if (!isFirstQuestion) {
      beginQuestionTransition(item);
      return;
    }

    beginQuestionPhase(item, item.timePerQ * 1000, { generateQuestion: true });
  }

  function pauseForInterruption() {
    if (!isSessionRunning) return;
    if (paused) return;

    const snap = captureCurrentPhase();
    pausedPhase = snap.kind === "QUESTION"
      ? { ...snap, gaugeScale: getGaugeScale() }
      : snap;
    paused = true;
    engineState = "PAUSED";

    stopAllTimers();

    if (snap.kind === "QUESTION") {
      setTimerPhase("question");
      showTimer();
    } else if (snap.kind === "ANSWER") {
      setTimerPhase("answer");
      showTimer();
    } else {
      hideTimer();
    }

    renderPauseStage();
    setStatus("PAUSE", "warn");
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

    const remainingMs = clampPhaseDuration(durationMs);
    const ctx = getToolContext(item);

    if (generateQuestion) {
      const maybePromise = activeTool.nextQuestion?.(els.workArea, ctx);

      if (maybePromise && typeof maybePromise.then === "function") {
        engineState = "LOADING_QUESTION";
        phase = createPhase("IDLE");
        hideTimer();
        setStatus(`${item.title} — chargement…`, "warn");

        Promise.resolve(maybePromise)
          .then(() => {
            if (!isSessionRunning || paused) return;
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
    phase = createPhase("QUESTION", remainingMs);
    setStatus(`${item.title} — ${currentQuestionIndex + 1}/${item.questionCount}`);
    setTimerPhase("question");
    showTimer();
    startGauge(remainingMs, { initialScale: initialGaugeScale });

    questionTimer = window.setTimeout(() => {
      questionTimer = null;

      if (item.hasAnswerPhase === false) {
        nextQuestion(item, false).catch((err) => {
          onFatalError?.(err?.message || "Erreur pendant la séance.");
        });
        return;
      }

      beginAnswerPhase(item, item.answerTime * 1000, { showAnswerNow: true });
    }, remainingMs);
  }

  function beginAnswerPhase(item, durationMs, { showAnswerNow = true } = {}) {
    stopAllTimers();

    if (!activeTool || !item) return;

    clearSessionStage();

    const remainingMs = clampPhaseDuration(durationMs);

    if (showAnswerNow) {
      const showCtx = getToolContext(item);
      activeTool.showAnswer?.(els.workArea, showCtx);
    }

    engineState = "RUNNING_ANSWER";
    phase = createPhase("ANSWER", remainingMs);
    setTimerPhase("answer");
    showTimer();
    startGauge(remainingMs);

    answerTimer = window.setTimeout(() => {
      answerTimer = null;
      nextQuestion(item, false).catch((err) => {
        onFatalError?.(err?.message || "Erreur pendant la séance.");
      });
    }, remainingMs);
  }

  function beginQuestionTransition(item, durationMs = activityGlobals.questionTransitionSec * 1000) {
    stopAllTimers();

    const remainingMs = Math.max(0, Math.floor(Number(durationMs) || 0));

    if (remainingMs <= 0) {
      beginQuestionPhase(item, item.timePerQ * 1000, { generateQuestion: true });
      return;
    }

    engineState = "BETWEEN_QUESTIONS";
    phase = createPhase("TRANSITION", remainingMs);
    hideTimer();

    renderSessionStage(`
      <div class="session-stage session-stage-transition">
        <div class="session-transition-title">Question suivante…</div>
        <div class="mini-timer" aria-hidden="true">
          <div class="mini-timer-bar" id="miniTimerBar"></div>
        </div>
      </div>
    `);

    animateMiniTimer(remainingMs);

    transitionTimer = window.setTimeout(() => {
      transitionTimer = null;
      beginQuestionPhase(item, item.timePerQ * 1000, { generateQuestion: true });
    }, remainingMs);
  }

  function openNextToolOverlay(item) {
    stopAllTimers();
    hideTimer();
    engineState = "BETWEEN_TOOLS";
    phase = createPhase("BETWEEN_TOOLS");

    renderSessionStage(`
      <div class="session-stage">
        <button class="btn primary btn-big session-next-btn" id="btnNextActivity" type="button">Activité suivante</button>
      </div>
    `);

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

  function showSessionMessage({ title = "", body = "", buttonLabel = "", onClick = null } = {}) {
    renderSessionStage(`
      <div class="session-stage">
        <div class="session-message-card">
          ${title ? `<div class="session-message-title">${escapeHtml(title)}</div>` : ""}
          ${body ? `<div class="session-message-text">${escapeHtml(body)}</div>` : ""}
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

    for (const item of (Array.isArray(sequenceItems) ? sequenceItems : [])) {
      const mod = await loadToolModule(item.toolId);
      const tool = mod.default ?? {};
      const normalizedDraft = normalizeToolDraft(item.draft);
      const settings = normalizedDraft.settings == null
        ? getToolDefaultSettings(tool)
        : cloneData(normalizedDraft.settings);

      const toolRequiresStudent = typeof tool.requiresStudent === "function"
        ? !!tool.requiresStudent(settings)
        : tool.requiresStudent === true;

      if (toolRequiresStudent) {
        requiresStudent = true;
      }

      const selectedIds = Array.isArray(settings?.selectionOrder) && settings.selectionOrder.length
        ? settings.selectionOrder
        : Array.isArray(settings?.selectedStudentIds)
          ? settings.selectedStudentIds
          : [];

      selectedIds.forEach((id) => {
        const cleanId = String(id || "").trim();
        if (cleanId) allowedIds.add(cleanId);
      });

      nextSession.push({
        id: item.toolId,
        instanceId: item.instanceId,
        title: buildSessionItemTitle(item.toolId, item.instanceId, nextSession.length),
        timePerQ: normalizedDraft.timePerQ,
        questionCount: normalizedDraft.questionCount,
        answerTime: normalizedDraft.answerTime,
        hasAnswerPhase: tool.hasAnswerPhase !== false,
        settings
      });
    }

    sessionRequiresStudent = requiresStudent;
    allowedStudentIds = [...allowedIds];
    session = nextSession;
  }

  async function loadToolModule(toolId) {
    if (!moduleRuntime) {
      throw new Error("Runtime de module non initialisé.");
    }

    const cacheKey = `${moduleKey}::${toolId}`;

    if (!toolModuleCache.has(cacheKey)) {
      toolModuleCache.set(cacheKey, moduleRuntime.loadToolModule(toolId));
    }

    return await toolModuleCache.get(cacheKey);
  }

  function buildSessionItemTitle(toolId) {
    const toolMeta = toolsCatalog.find((tool) => tool.id === toolId);
    return toolMeta?.title || String(toolId || "Outil");
  }

  function getToolDefaultSettings(tool) {
    if (typeof tool?.getDefaultSettings === "function") {
      return cloneData(tool.getDefaultSettings());
    }
    return {};
  }

  function getToolContext(item) {
    if (!item) {
      return {
        sessionItem: null,
        accessCode,
        moduleKey,
        settings: {},
        student: selectedStudent,
        studentFirstName: selectedStudent?.first_name ?? ""
      };
    }

    return {
      sessionItem: item,
      accessCode,
      moduleKey,
      settings: item.settings ?? {},
      student: selectedStudent,
      studentFirstName: selectedStudent?.first_name ?? ""
    };
  }

  function getSessionMeta() {
    return {
      requiresStudent: sessionRequiresStudent,
      allowedStudentIds: cloneData(allowedStudentIds),
      selectedStudent: selectedStudent ? cloneData(selectedStudent) : null
    };
  }

  function setSelectedStudent(student) {
    selectedStudent = student ? cloneData(student) : null;
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
