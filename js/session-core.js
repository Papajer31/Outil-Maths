import { loadModuleRuntime } from "./module-registry.js";

const STORAGE_PREFIX = "outil-maths-session-v2";

const DEFAULT_TOOL_ROW = Object.freeze({
  enabled: false,
  timePerQ: 40,
  questionCount: 10,
  answerTime: 5,
  settings: null
});

const DEFAULT_ACTIVITY_GLOBALS = Object.freeze({
  questionTransitionSec: 5
});

export function createSessionEngine({
  els,
  classCode,
  configName,
  moduleKey,
  globals,
  drafts,
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
  let gaugeRaf = null;
  let gaugeStart = 0;
  let gaugeDurationMs = 0;

  let paused = false;
  let engineState = "IDLE";
  let isSessionRunning = false;

  const toolModuleCache = new Map();
  const configDrafts = new Map();

  let moduleRuntime = null;

    const activityGlobals = {
    questionTransitionSec: clampInt(
      globals?.questionTransitionSec,
      0,
      30
    )
  };

  if (!Number.isFinite(activityGlobals.questionTransitionSec)) {
    activityGlobals.questionTransitionSec = DEFAULT_ACTIVITY_GLOBALS.questionTransitionSec;
  }

  activityGlobals.questionTransitionSec = clampInt(
    activityGlobals.questionTransitionSec || DEFAULT_ACTIVITY_GLOBALS.questionTransitionSec,
    0,
    30
  );

  return {
    init,
    openStartOverlay,
    pauseForInterruption,
    resumeAfterPause,
    isRunning,
    stop
  };

  async function init() {
    moduleRuntime = loadModuleRuntime(moduleKey);
    toolsCatalog = await moduleRuntime.loadToolsCatalog();
    ensureConfigDrafts();
    applyRemoteDrafts(drafts);
    await prepareSessionFromDrafts();

    if (!session.length) {
      throw new Error("Cette configuration ne contient aucun outil actif.");
    }
  }

  async function openStartOverlay() {
    const saved = loadSavedSession();

    if (saved?.session?.length) {
      openOverlay({
        title: "Séance interrompue",
        body: `
          <div style="display:flex;flex-direction:column;gap:14px;justify-content:center;align-items:center;min-height:220px;">
            <div class="panel">Classe : <strong>${escapeHtml(classCode)}</strong></div>
            <div class="panel">Activité : <strong>${escapeHtml(configName)}</strong></div>
            <div class="panel">Une reprise est disponible.</div>
          </div>
        `,
        actions: [
          {
            label: "Retour aux activités",
            primary: false,
            onClick: () => {
              clearSavedSession();
              onExitToActivities?.();
            }
          },
          {
            label: "Reprendre",
            primary: true,
            onClick: () => resumeFromSaved(saved)
          }
        ],
        hint: ""
      });
      return;
    }

    openOverlay({
      title: "",
      body: `
        <div style="display:flex;flex-direction:column;gap:14px;justify-content:center;align-items:center;min-height:220px;">
          <div class="panel">Classe : <strong>${escapeHtml(classCode)}</strong></div>
          <div class="panel">Activité : <strong>${escapeHtml(configName)}</strong></div>
          <button class="btn primary btn-big" id="btnStartSession" type="button">Démarrer</button>
        </div>
      `,
      actions: [
        {
          label: "Retour aux activités",
          primary: false,
          onClick: onExitToActivities
        }
      ],
      hint: ""
    });

    document.getElementById("btnStartSession")?.addEventListener("click", startSession);
  }

  function isRunning() {
    return isSessionRunning;
  }

  function stop() {
    stopQuestionLoop();
    isSessionRunning = false;
    paused = false;
    activeTool = null;
    clearSavedSession();
    hideTimer();
    clearWorkArea();
  }

  async function startSession() {
    closeOverlay();
    currentToolIndex = -1;
    currentQuestionIndex = -1;
    isSessionRunning = true;
    paused = false;
    await nextTool(true);
  }

  async function nextTool(isFirst) {
    stopQuestionLoop();

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
      isSessionRunning = false;
      clearSavedSession();
      setStatus("Séance terminée", "good");

      openOverlay({
        title: "Séance terminée",
        body: `
          <div class="panel" style="text-align:center;">
            Bravo, la séance est terminée.
          </div>
        `,
        actions: [
          {
            label: "Retour aux activités",
            primary: true,
            onClick: onExitToActivities
          }
        ],
        hint: ""
      });
      return;
    }

    const item = session[currentToolIndex];
    setStatus(`${item.title} — prêt`, "warn");
    saveSessionSnapshot();

    if (!isFirst) {
      engineState = "BETWEEN_TOOLS";

      openOverlay({
        title: "",
        body: `
          <div style="display:flex;justify-content:center;align-items:center;min-height:220px;">
            <button class="btn primary btn-big" id="btnNextActivity" type="button">Activité suivante</button>
          </div>
        `,
        actions: [],
        hint: ""
      });

      document.getElementById("btnNextActivity")?.addEventListener("click", () => {
        beginTool(item).catch((err) => {
          onFatalError?.(err?.message || "Erreur pendant le chargement de l’outil.");
        });
      });
      return;
    }

    await beginTool(item);
  }

  async function beginTool(item) {
    closeOverlay();

    const mod = await loadToolModule(item.id);
    activeTool = mod.default ?? {};

    const ctx = getToolContext(item);
    activeTool.mount?.(els.workArea, ctx);

    engineState = "RUNNING";
    showTimer();

    await nextQuestion(item, true);
  }

  async function nextQuestion(item, isFirstQuestion) {
    stopQuestionLoop();

    currentQuestionIndex += 1;

    if (currentQuestionIndex >= item.questionCount) {
      hideTimer();
      await nextTool(false);
      return;
    }

    setStatus(`${item.title} — ${currentQuestionIndex + 1}/${item.questionCount}`, "pill");
    saveSessionSnapshot();

    if (!isFirstQuestion) {
      engineState = "BETWEEN_QUESTIONS";

      openOverlay({
        title: "Nouvelle question",
        body: `
          <div class="mini-timer" aria-hidden="true">
            <div class="mini-timer-bar" id="miniTimerBar"></div>
          </div>
        `,
        actions: [],
        hint: "",
        opaque: true
      });

      const bar = document.getElementById("miniTimerBar");
      const transitionMs = activityGlobals.questionTransitionSec * 1000;

      if (bar) {
        bar.style.animation = `miniDrain ${activityGlobals.questionTransitionSec}s linear forwards`;
      }

      await waitMs(transitionMs);
      closeOverlay();
      engineState = "RUNNING";
    }

    const ctx = getToolContext(item);
    activeTool.nextQuestion?.(els.workArea, ctx);

    startGauge(item.timePerQ * 1000);

    questionTimer = setTimeout(() => {
      const showCtx = getToolContext(item);
      activeTool.showAnswer?.(els.workArea, showCtx);

      answerTimer = setTimeout(() => {
        answerTimer = null;
        nextQuestion(item, false).catch((err) => {
          onFatalError?.(err?.message || "Erreur pendant la séance.");
        });
      }, item.answerTime * 1000);
    }, item.timePerQ * 1000);
  }

  function pauseForInterruption() {
    if (!isSessionRunning) return;
    if (paused) return;

    paused = true;

    stopQuestionLoop();
    hideTimer();

    openOverlay({
      title: "",
      body: `
        <div style="display:flex;justify-content:center;align-items:center;min-height:220px;">
          <button class="btn primary btn-big" id="btnResume" type="button">Reprendre</button>
        </div>
      `,
      actions: [],
      hint: ""
    });

    document.getElementById("btnResume")?.addEventListener("click", resumeAfterPause);
  }

  function resumeAfterPause() {
    closeOverlay();
    paused = false;

    if (!isSessionRunning) return;
    const item = session?.[currentToolIndex];
    if (!item) return;

    startCurrentQuestion(item, { regenerate: false });
  }

  function startCurrentQuestion(item, { regenerate = false } = {}) {
    stopQuestionLoop();

    if (!activeTool || !item) return;

    const ctx = getToolContext(item);

    if (regenerate) {
      activeTool.nextQuestion?.(els.workArea, ctx);
    }

    engineState = "RUNNING";
    showTimer();

    startGauge(item.timePerQ * 1000);

    questionTimer = setTimeout(() => {
      const showCtx = getToolContext(item);
      activeTool.showAnswer?.(els.workArea, showCtx);

      answerTimer = setTimeout(() => {
        answerTimer = null;
        nextQuestion(item, false).catch((err) => {
          onFatalError?.(err?.message || "Erreur pendant la séance.");
        });
      }, item.answerTime * 1000);
    }, item.timePerQ * 1000);

    setStatus(`${item.title} — ${currentQuestionIndex + 1}/${item.questionCount}`, "pill");
    saveSessionSnapshot();
  }

  async function resumeFromSaved(saved) {
    closeOverlay();

    session = saved.session ?? [];
    currentToolIndex = saved.currentToolIndex ?? 0;
    currentQuestionIndex = saved.currentQuestionIndex ?? -1;

    if (currentToolIndex < 0) currentToolIndex = 0;
    if (currentToolIndex >= session.length) currentToolIndex = 0;
    if (currentQuestionIndex < -1) currentQuestionIndex = -1;

    isSessionRunning = true;
    paused = false;

    const item = session[currentToolIndex];
    setStatus(`${item.title}`, "warn");

    await remountAndResume(item);
  }

  async function remountAndResume(item) {
    closeOverlay();
    stopQuestionLoop();

    const mod = await loadToolModule(item.id);
    activeTool = mod.default ?? {};

    const ctx = getToolContext(item);
    activeTool.mount?.(els.workArea, ctx);
    activeTool.nextQuestion?.(els.workArea, ctx);

    engineState = "RUNNING";
    showTimer();

    startCurrentQuestion(item, { regenerate: false });
  }

  function ensureConfigDrafts() {
    for (const t of toolsCatalog) {
      if (!configDrafts.has(t.id)) {
        configDrafts.set(t.id, {
          enabled: DEFAULT_TOOL_ROW.enabled,
          timePerQ: DEFAULT_TOOL_ROW.timePerQ,
          questionCount: DEFAULT_TOOL_ROW.questionCount,
          answerTime: DEFAULT_TOOL_ROW.answerTime,
          settings: null
        });
      }
    }
  }

  function getToolDraft(id) {
    if (!configDrafts.has(id)) {
      configDrafts.set(id, {
        enabled: DEFAULT_TOOL_ROW.enabled,
        timePerQ: DEFAULT_TOOL_ROW.timePerQ,
        questionCount: DEFAULT_TOOL_ROW.questionCount,
        answerTime: DEFAULT_TOOL_ROW.answerTime,
        settings: null
      });
    }
    return configDrafts.get(id);
  }

  function applyRemoteDrafts(remoteDrafts) {
    ensureConfigDrafts();

    for (const t of toolsCatalog) {
      const incoming = remoteDrafts?.[t.id];
      const draft = getToolDraft(t.id);

      if (!incoming) {
        draft.enabled = DEFAULT_TOOL_ROW.enabled;
        draft.timePerQ = DEFAULT_TOOL_ROW.timePerQ;
        draft.questionCount = DEFAULT_TOOL_ROW.questionCount;
        draft.answerTime = DEFAULT_TOOL_ROW.answerTime;
        draft.settings = null;
        continue;
      }

      draft.enabled = !!incoming.enabled;
      draft.timePerQ = clampInt(incoming.timePerQ, 5, 999);
      draft.questionCount = clampInt(incoming.questionCount, 1, 200);
      draft.answerTime = clampInt(incoming.answerTime, 1, 30);
      draft.settings = incoming.settings == null ? null : cloneData(incoming.settings);
    }
  }

  async function prepareSessionFromDrafts() {
    const nextSession = [];

    for (const t of toolsCatalog) {
      const draft = getToolDraft(t.id);
      if (!draft.enabled) continue;

      const mod = await loadToolModule(t.id);
      const tool = mod.default ?? {};

      const timePerQ = clampInt(draft.timePerQ, 5, 999);
      const questionCount = clampInt(draft.questionCount, 1, 200);
      const answerTime = clampInt(draft.answerTime, 1, 30);
      const settings = draft.settings == null
        ? getToolDefaultSettings(tool)
        : cloneData(draft.settings);

      nextSession.push({
        id: t.id,
        title: t.title,
        timePerQ,
        questionCount,
        answerTime,
        settings
      });
    }

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

  function getToolDefaultSettings(tool) {
    if (typeof tool?.getDefaultSettings === "function") {
      return cloneData(tool.getDefaultSettings());
    }
    return {};
  }

  function getToolContext(item) {
    if (!item) return { sessionItem: null, settings: {} };
    return {
      sessionItem: item,
      settings: item.settings ?? {}
    };
  }

  function startGauge(durationMs) {
    stopGauge();
    gaugeStart = performance.now();
    gaugeDurationMs = durationMs;

    const tick = (now) => {
      const t = (now - gaugeStart) / gaugeDurationMs;
      const remaining = Math.max(0, 1 - t);

      if (els.timerBar) {
        els.timerBar.style.transform = `scaleX(${remaining})`;
      }

      if (t < 1) {
        gaugeRaf = requestAnimationFrame(tick);
      }
    };

    if (els.timerBar) {
      els.timerBar.style.transform = "scaleX(1)";
    }
    gaugeRaf = requestAnimationFrame(tick);
  }

  function stopGauge() {
    if (gaugeRaf) {
      cancelAnimationFrame(gaugeRaf);
      gaugeRaf = null;
    }
    if (els.timerBar) {
      els.timerBar.style.transform = "scaleX(1)";
    }
  }

  function stopQuestionLoop() {
    if (questionTimer) {
      clearTimeout(questionTimer);
      questionTimer = null;
    }
    if (answerTimer) {
      clearTimeout(answerTimer);
      answerTimer = null;
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

  function clearWorkArea() {
    if (els.workArea) {
      els.workArea.innerHTML = "";
    }
  }

  function openOverlay({ title, body, actions, hint, opaque = false }) {
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

    els.overlay?.classList.toggle("opaque", !!opaque);
    els.overlay?.classList.remove("hidden");
  }

  function closeOverlay() {
    els.overlay?.classList.add("hidden");
    els.overlay?.classList.remove("opaque");
    if (els.overlayActions) els.overlayActions.innerHTML = "";
  }

  function saveSessionSnapshot() {
    const snap = {
      classCode,
      configName,
      session,
      currentToolIndex,
      currentQuestionIndex,
      engineState,
      savedAt: Date.now()
    };

    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(snap));
    } catch {}
  }

  function loadSavedSession() {
    try {
      const raw = localStorage.getItem(getStorageKey());
      if (!raw) return null;

      const parsed = JSON.parse(raw);

      if (parsed?.classCode !== classCode) return null;
      if (parsed?.configName !== configName) return null;

      return parsed;
    } catch {
      return null;
    }
  }

  function clearSavedSession() {
    try {
      localStorage.removeItem(getStorageKey());
    } catch {}
  }

  function getStorageKey() {
    return `${STORAGE_PREFIX}:${classCode}:${normalizeStoragePart(configName)}`;
  }
}

/* =========================
   HELPERS
   ========================= */

function normalizeStoragePart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

async function fetchJSON(path) {
  const r = await fetch(path, { cache: "no-store" });
  if (!r.ok) {
    throw new Error(`Impossible de charger ${path} (${r.status})`);
  }
  return await r.json();
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function cloneData(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}