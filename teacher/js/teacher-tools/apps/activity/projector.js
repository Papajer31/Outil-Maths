import { studentState } from "../../../../../student/student-state.js";
import { buildCatalogActivityConfig } from "../../../../../shared/catalogue.js";
import { createProjectedSessionLink } from "../../../../../shared/projected-session-link.js";
import { escapeHtml } from "../../../dashboard/text-utils.js";
import {
  ACTIVITY_PROJECTION_MODE_SLIDESHOW,
  ACTIVITY_SLIDESHOW_ADVANCE_AUTO,
  normalizeActivityLevel,
  normalizeProjectedActivityState
} from "./model.js";

const sessions = new Map();
const pendingMounts = new Map();
const inactivePages = new Set();
const chromeVisibilityByPage = new Map();
let supabaseLoaderPromise = null;

async function ensureSupabaseRuntime(){
  if (window.supabase?.createClient) return true;
  try {
    if (window.opener?.supabase?.createClient) {
      window.supabase = window.opener.supabase;
      return true;
    }
  } catch {}
  if (!supabaseLoaderPromise) {
    supabaseLoaderPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ttp-supabase-runtime="true"]');
      if (existing) {
        existing.addEventListener("load", () => resolve(true), { once: true });
        existing.addEventListener("error", () => reject(new Error("Supabase runtime unavailable")), { once: true });
        return;
      }
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
      script.async = true;
      script.dataset.ttpSupabaseRuntime = "true";
      script.addEventListener("load", () => resolve(true), { once: true });
      script.addEventListener("error", () => reject(new Error("Supabase runtime unavailable")), { once: true });
      document.head.appendChild(script);
    }).catch((error) => {
      supabaseLoaderPromise = null;
      throw error;
    });
  }
  await supabaseLoaderPromise;
  return Boolean(window.supabase?.createClient);
}

function getWidgetId(widget = {}, host){
  return String(widget?.id || host?.closest?.(".ttp-widget-frame")?.dataset?.widgetId || "").trim();
}

function captureStudentState(){
  return {
    accessCode: studentState.accessCode,
    homeCode: studentState.homeCode,
    activities: studentState.activities,
    activityFolders: studentState.activityFolders,
    activityEntry: studentState.activityEntry,
    activitiesMode: studentState.activitiesMode,
    hasChosenActivitiesMode: studentState.hasChosenActivitiesMode,
    selectedConfig: studentState.selectedConfig,
    selectedConfigMeta: studentState.selectedConfigMeta,
    selectedMission: studentState.selectedMission,
    selectedStudent: studentState.selectedStudent,
    selectedStudents: studentState.selectedStudents,
    sharedSessionEntry: studentState.sharedSessionEntry,
    sessionMode: studentState.sessionMode,
    projectedSession: studentState.projectedSession
  };
}

function restoreStudentState(snapshot){
  if (!snapshot) return;
  Object.assign(studentState, snapshot);
}

function cleanupSession(widgetId){
  const safeId = String(widgetId || "").trim();
  pendingMounts.delete(safeId);
  const session = sessions.get(safeId);
  if (!session) return;
  sessions.delete(safeId);
  try { session.slideshowController?.destroy?.(); } catch {}
  try { session.link?.close?.(); } catch {}
  try { session.cleanup?.(); } catch {}
  restoreStudentState(session.snapshot);
  try { session.host?.replaceChildren?.(); } catch {}
}

function sanitizeInstancePart(value){
  return String(value || "item").trim().replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "item";
}

function getRuntimeInstanceId(item){
  return `projected_${sanitizeInstancePart(item?.id)}`;
}

function getSessionSignature(state){
  const structure = state.playlist.map((item) => [
    item.id,
    item.activityId,
    String(item.activity?.updated_at || item.activity?.updatedAt || item.activity?.version || "")
  ].join("@"));
  return [state.launchRevision, state.accessCode, state.projectionMode, ...structure].join("::");
}

function buildProjectedPlaylistRuntimeConfig(state, playlistMeta = null){
  const playlist = Array.isArray(state?.playlist) ? state.playlist : [];
  if (!playlist.length) return null;

  const isSlideshow = state?.projectionMode === ACTIVITY_PROJECTION_MODE_SLIDESHOW;
  const responseUi = isSlideshow ? "free" : "boxed";
  const overrideLevels = new Map(
    (Array.isArray(playlistMeta) ? playlistMeta : [])
      .map((item) => [String(item?.id || "").trim(), normalizeActivityLevel(item?.level)])
      .filter(([id]) => id)
  );
  const catalogActivities = playlist.map((item) => item.activity).filter(Boolean);
  const sequence = [];
  let globals = null;

  for (const item of playlist) {
    const level = overrideLevels.get(item.id) ?? item.level;
    const config = buildCatalogActivityConfig(item.activity, {
      difficultyLevel: level,
      context: "test",
      activityMode: "individual",
      responseUi,
      progressMode: "practice",
      adaptive: false,
      catalogActivities
    });
    const sequenceItem = Array.isArray(config?.sequence) ? config.sequence[0] : null;
    if (!sequenceItem) return null;
    if (!globals) globals = { ...(config.globals || {}) };

    const projectedItem = {
      ...sequenceItem,
      instanceId: getRuntimeInstanceId(item),
      catalog_activity_id: item.activityId,
      catalog_activity_title: item.activityLabel,
      catalog_difficulty_level: normalizeActivityLevel(level),
      projected_playlist_item_id: item.id
    };

    if (isSlideshow) {
      projectedItem.draft = {
        ...(sequenceItem.draft || {}),
        infiniteTimePerQ: true,
        infiniteAnswerTime: true,
        questionTransitionSec: 0,
        questionTransitionInfinite: false,
        toolMaxTimeInfinite: true
      };
    }

    sequence.push(projectedItem);
  }

  return {
    version: 1,
    type: "projected_activity_playlist_runtime",
    catalog_activity_id: playlist[0]?.activityId || "",
    catalog_difficulty_level: normalizeActivityLevel(overrideLevels.get(playlist[0]?.id) ?? playlist[0]?.level),
    catalog_context: "test",
    activity_mode: "individual",
    response_ui: responseUi,
    progress_mode: "practice",
    globals: {
      ...(globals || {}),
      activityTotalTimeEnabled: false
    },
    sequence
  };
}

function getProjectedPlaylistMeta(state){
  return state.playlist.map((item) => ({
    id: item.id,
    activityId: item.activityId,
    activityLabel: item.activityLabel,
    level: item.level,
    adaptiveAvailable: item.adaptiveAvailable === true,
    instanceId: getRuntimeInstanceId(item)
  }));
}


function createSlideshowController({ root, state, accessCode, configName, sendAction } = {}){
  if (!root || state?.projectionMode !== ACTIVITY_PROJECTION_MODE_SLIDESHOW) return null;

  root.classList.add("is-slideshow");

  const dock = root.querySelector("#projectedTeacherDock");
  if (!dock) return null;

  const dockToggle = document.createElement("button");
  dockToggle.className = "projected-teacher-dock-btn ttp-activity-dock-toggle";
  dockToggle.type = "button";
  dockToggle.dataset.slideshowDockToggle = "";
  dockToggle.innerHTML = `
    <span class="ttp-material-icon" data-slideshow-dock-toggle-icon aria-hidden="true">chevron_left</span>
    <span class="ttp-activity-dock-toggle-label" data-slideshow-dock-toggle-label>Replier</span>
  `;
  dock.prepend(dockToggle);

  const block = document.createElement("div");
  block.className = "ttp-activity-slideshow-dock";
  block.innerHTML = `
    <button class="projected-teacher-dock-btn ttp-activity-slideshow-next" type="button" data-slideshow-next disabled>
      <span class="ttp-material-icon" aria-hidden="true">arrow_forward</span>
      <span>Question suivante</span>
    </button>
    <div class="ttp-activity-slideshow-countdown" data-slideshow-countdown hidden aria-live="polite"></div>
  `;
  dock.appendChild(block);

  const startMask = document.createElement("div");
  startMask.className = "ttp-activity-slideshow-start-mask";
  startMask.innerHTML = `
    <div class="ttp-activity-slideshow-start-card">
      <button class="ttp-activity-slideshow-start-btn" type="button" data-slideshow-start>
        <span class="ttp-material-icon" aria-hidden="true">play_arrow</span>
        <span>Démarrer</span>
      </button>
    </div>
  `;
  root.appendChild(startMask);

  const nextButton = block.querySelector("[data-slideshow-next]");
  const countdown = block.querySelector("[data-slideshow-countdown]");
  const startButton = startMask.querySelector("[data-slideshow-start]");
  const dockToggleIcon = dockToggle.querySelector("[data-slideshow-dock-toggle-icon]");
  const dockToggleLabel = dockToggle.querySelector("[data-slideshow-dock-toggle-label]");
  let currentState = normalizeProjectedActivityState(state);
  let currentStatus = null;
  let currentQuestionKey = "";
  let deadline = 0;
  let intervalId = null;
  let advancePending = false;
  let destroyed = false;

  const link = createProjectedSessionLink({
    accessCode,
    configName,
    onMessage(message){
      if (message?.type !== "status") return;
      currentStatus = message;
      syncFromStatus();
    }
  });

  function isAuto(){
    return currentState.slideshowAdvanceMode === ACTIVITY_SLIDESHOW_ADVANCE_AUTO;
  }

  function isStarted(){
    return currentState.slideshowStarted === true;
  }

  function syncSlideshowChrome(){
    const started = isStarted();
    const collapsed = currentState.slideshowDockCollapsed === true;
    root.classList.toggle("is-slideshow-waiting", !started);
    root.classList.toggle("is-slideshow-dock-collapsed", collapsed);
    if (startMask) startMask.hidden = started;
    if (dockToggleIcon) dockToggleIcon.textContent = collapsed ? "chevron_right" : "chevron_left";
    if (dockToggleLabel) dockToggleLabel.textContent = collapsed ? "Afficher" : "Replier";
    dockToggle.title = collapsed ? "Afficher la console" : "Replier la console";
    dockToggle.setAttribute("aria-label", dockToggle.title);
  }

  function stopTimer(){
    if (intervalId) {
      window.clearInterval(intervalId);
      intervalId = null;
    }
    deadline = 0;
  }

  function renderCountdown(){
    if (!countdown) return;
    if (!isStarted() || !isAuto()) {
      countdown.hidden = true;
      countdown.textContent = "";
      return;
    }

    countdown.hidden = false;
    if (!deadline) {
      countdown.textContent = `${currentState.slideshowSeconds} s`;
      return;
    }

    const remainingMs = Math.max(0, deadline - Date.now());
    countdown.textContent = `${Math.max(0, Math.ceil(remainingMs / 1000))} s`;

    if (remainingMs <= 0) {
      stopTimer();
      advanceQuestion();
    }
  }

  function startTimer(){
    stopTimer();
    if (!isStarted() || !isAuto() || currentStatus?.running !== true || String(currentStatus?.phase || "") !== "QUESTION") {
      renderCountdown();
      return;
    }

    deadline = Date.now() + currentState.slideshowSeconds * 1000;
    renderCountdown();
    intervalId = window.setInterval(renderCountdown, 200);
  }

  function syncFromStatus(){
    if (destroyed) return;

    const runningQuestion = currentStatus?.running === true
      && String(currentStatus?.phase || "") === "QUESTION";
    const nextQuestionKey = runningQuestion
      ? `${Number(currentStatus?.currentToolIndex) || 0}:${Number(currentStatus?.currentQuestionNumber) || 0}`
      : "";

    if (nextButton) nextButton.disabled = !isStarted() || !runningQuestion || advancePending;

    if (!isStarted()) {
      stopTimer();
      renderCountdown();
      syncSlideshowChrome();
      return;
    }

    if (!runningQuestion) {
      stopTimer();
      renderCountdown();
      return;
    }

    if (nextQuestionKey !== currentQuestionKey) {
      currentQuestionKey = nextQuestionKey;
      advancePending = false;
      if (nextButton) nextButton.disabled = false;
      startTimer();
      return;
    }

    if (isAuto() && !deadline && !advancePending) startTimer();
    renderCountdown();
  }

  function advanceQuestion(){
    if (destroyed || advancePending || !isStarted()) return;
    if (currentStatus?.running !== true || String(currentStatus?.phase || "") !== "QUESTION") return;

    advancePending = true;
    stopTimer();
    if (nextButton) nextButton.disabled = true;
    if (countdown && isAuto()) countdown.textContent = "…";
    link?.send?.("command", { command: "next-question" });

    // Filet de sécurité : si le runtime ne renvoie pas immédiatement son nouvel état,
    // on autorise une nouvelle tentative sans créer de boucle automatique.
    window.setTimeout(() => {
      if (destroyed || !advancePending) return;
      advancePending = false;
      syncFromStatus();
    }, 1500);
  }

  function blockPrematureNavigation(event){
    if (isStarted()) return;
    const key = String(event?.key || "").toLowerCase();
    if (key !== " " && key !== "arrowright" && key !== "arrowleft") return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  window.addEventListener("keydown", blockPrematureNavigation, true);
  nextButton?.addEventListener("click", advanceQuestion);
  startButton?.addEventListener("click", () => {
    if (isStarted()) return;
    sendAction?.("start-slideshow", {});
  });
  dockToggle?.addEventListener("click", () => {
    sendAction?.("set-slideshow-dock-collapsed", { collapsed: !currentState.slideshowDockCollapsed });
  });
  syncSlideshowChrome();
  link?.send?.("request-status");

  return {
    update(nextState){
      const previousState = currentState;
      currentState = normalizeProjectedActivityState(nextState);
      const timingChanged = previousState.slideshowStarted !== currentState.slideshowStarted
        || previousState.slideshowAdvanceMode !== currentState.slideshowAdvanceMode
        || previousState.slideshowSeconds !== currentState.slideshowSeconds;
      if (!isAuto() || !isStarted()) stopTimer();
      if (timingChanged) {
        currentQuestionKey = "";
        advancePending = false;
      }
      syncSlideshowChrome();
      syncFromStatus();
    },
    destroy(){
      destroyed = true;
      stopTimer();
      window.removeEventListener("keydown", blockPrematureNavigation, true);
      try { link?.close?.(); } catch {}
      block.remove();
      dockToggle.remove();
      startMask.remove();
      root.classList.remove("is-slideshow", "is-slideshow-waiting", "is-slideshow-dock-collapsed");
    }
  };
}

function renderReady(host, page, state, sendAction, { setProjectionChromeVisible, requestFullscreen } = {}){
  const pageId = String(page?.id || "").trim();
  const count = state.playlist.length;
  const title = count === 1
    ? state.playlist[0].activityLabel
    : (count > 1 ? `${count} activités prêtes` : "Activité");
  host.innerHTML = `
    <div class="ttp-activity-waiting ttp-activity-ready">
      <span class="ttp-material-icon" aria-hidden="true">play_lesson</span>
      <strong>${escapeHtml(title)}</strong>
      ${count ? `
        <button class="start-floating-btn" type="button" data-activity-start aria-label="Démarrer l’activité">
          <span class="start-rocket-visual" aria-hidden="true">
            <img class="start-rocket-img start-rocket-img-off" src="../shared/ui-assets/rocket-off.svg" alt="" draggable="false">
            <img class="start-rocket-img start-rocket-img-on" src="../shared/ui-assets/rocket-on.svg" alt="" draggable="false">
          </span>
        </button>` : `<span>Ajoute une activité depuis la configuration du Tableau.</span>`}
    </div>`;
  host.querySelector("[data-activity-start]")?.addEventListener("click", (event) => {
    if (!pageId) return;
    const startButton = event.currentTarget;
    if (!(startButton instanceof HTMLElement) || startButton.classList.contains("is-launching")) return;

    // Même geste que l’écran de démarrage Projection : la demande de plein écran
    // reste directement rattachée au clic utilisateur, puis la fusée effectue son
    // petit départ avant de laisser place au runtime.
    try {
      const fullscreenRequest = requestFullscreen?.();
      if (fullscreenRequest && typeof fullscreenRequest.catch === "function") {
        fullscreenRequest.catch(() => {});
      }
    } catch {}

    chromeVisibilityByPage.set(pageId, false);
    setProjectionChromeVisible?.(false);
    inactivePages.delete(pageId);
    startButton.classList.add("is-launching");

    window.setTimeout(() => {
      if (!startButton.isConnected) return;
      void mountActivity({ host, page, state, sendAction, setProjectionChromeVisible, requestFullscreen });
    }, 360);
  });
}

function renderLaunchError(host, title, text){
  host.innerHTML = `
    <div class="ttp-activity-waiting is-error">
      <span class="ttp-material-icon" aria-hidden="true">warning</span>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>`;
}

function setPauseGate(session, visible, { pending = false } = {}){
  if (!session?.root) return;
  let gate = session.root.querySelector("[data-activity-pause-gate]");
  if (!gate) {
    gate = document.createElement("div");
    gate.className = "ttp-activity-pause-gate";
    gate.dataset.activityPauseGate = "";
    gate.innerHTML = `
      <div class="ttp-activity-pause-card">
        <span class="ttp-material-icon" aria-hidden="true">pause_circle</span>
        <strong>Activité en pause</strong>
        <span>La page a été quittée. Rien ne repart sans ton accord.</span>
        <button class="ttp-activity-gate-btn" type="button" data-activity-resume><span class="ttp-material-icon" aria-hidden="true">play_arrow</span><span>Reprendre</span></button>
      </div>`;
    session.root.appendChild(gate);
    gate.querySelector("[data-activity-resume]")?.addEventListener("click", () => requestResume(session));
  }
  gate.hidden = !visible;
  const button = gate.querySelector("[data-activity-resume]");
  if (button) {
    button.disabled = pending;
    const label = button.querySelector("span:last-child");
    if (label) label.textContent = pending ? "Reprise…" : "Reprendre";
  }
}

function syncRuntimeControlsVisibility(session, visible){
  if (!session) return;
  session.runtimeControlsVisible = visible !== false;
  session.link?.send?.("command", { command:"set-controls-visible", visible:session.runtimeControlsVisible });
}

function completeActivitySession(session){
  if (!session || session.completionHandled === true) return;
  session.completionHandled = true;
  window.setTimeout(() => {
    if (sessions.get(session.pageId) !== session) return;
    const { pageId, host, page, state, sendAction, setProjectionChromeVisible, requestFullscreen } = session;
    inactivePages.delete(pageId);
    chromeVisibilityByPage.set(pageId, true);
    setProjectionChromeVisible?.(true);
    cleanupSession(pageId);
    if (host?.isConnected) {
      renderReady(host, page, state, sendAction, { setProjectionChromeVisible, requestFullscreen });
    }
  }, 0);
}

function requestPause(session){
  if (!session) return;
  session.pausedByTableau = true;
  session.resumeRequested = false;
  setPauseGate(session, true);
  session.link?.send?.("command", { command:"pause", force:true });
  session.link?.send?.("request-status");
}

function requestResume(session){
  if (!session) return;
  session.resumeRequested = true;
  setPauseGate(session, true, { pending:true });
  if (session.lastStatus?.paused === true || session.lastStatus?.running === false) {
    session.link?.send?.("command", { command:"resume" });
    session.pausedByTableau = false;
    session.resumeRequested = false;
    setPauseGate(session, false);
    return;
  }
  session.link?.send?.("command", { command:"pause", force:true });
  session.link?.send?.("request-status");
}

function handleSessionLinkMessage(session, message){
  if (!session || message?.type !== "status") return;
  session.lastStatus = message;
  if (String(message?.phase || "").trim().toUpperCase() === "DONE") {
    completeActivitySession(session);
    return;
  }
  if (!session.pausedByTableau) return;

  if (session.resumeRequested) {
    if (message.paused === true || message.running === false) {
      session.link?.send?.("command", { command:"resume" });
      session.pausedByTableau = false;
      session.resumeRequested = false;
      setPauseGate(session, false);
    } else {
      session.link?.send?.("command", { command:"pause", force:true });
    }
    return;
  }

  if (message.paused !== true && message.running === true) {
    session.link?.send?.("command", { command:"pause", force:true });
  }
}

async function mountActivity({ host, page, state, sendAction, setProjectionChromeVisible, requestFullscreen }){
  const pageId = String(page?.id || "").trim();
  if (!pageId || inactivePages.has(pageId)) return;
  const signature = getSessionSignature(state);
  const current = sessions.get(pageId);
  if (current && current.signature === signature) {
    current.host = host;
    current.page = page;
    current.state = state;
    current.sendAction = sendAction;
    current.setProjectionChromeVisible = setProjectionChromeVisible;
    current.requestFullscreen = requestFullscreen;
    host.replaceChildren(current.root);
    current.slideshowController?.update?.(state);
    syncRuntimeControlsVisibility(current, chromeVisibilityByPage.get(pageId) !== false);
    setPauseGate(current, current.pausedByTableau === true, { pending:current.resumeRequested === true });
    return;
  }
  if (pendingMounts.get(pageId) === signature) return;

  cleanupSession(pageId);
  pendingMounts.set(pageId, signature);

  if (!state.playlist.length || !state.accessCode) {
    pendingMounts.delete(pageId);
    renderLaunchError(host, "Impossible de lancer l’activité", !state.accessCode ? "Le code classe est introuvable." : "Aucune activité n’est configurée.");
    return;
  }

  const runtimeConfig = buildProjectedPlaylistRuntimeConfig(state);
  if (!runtimeConfig || !Array.isArray(runtimeConfig.sequence) || runtimeConfig.sequence.length !== state.playlist.length) {
    pendingMounts.delete(pageId);
    renderLaunchError(host, "Configuration invalide", "Une des activités ne peut pas être projetée pour le moment.");
    return;
  }

  host.innerHTML = `
    <div class="ttp-activity-waiting is-loading">
      <span class="ttp-material-icon" aria-hidden="true">progress_activity</span>
      <strong>Chargement de l’activité…</strong>
      <span>Préparation du runtime de projection.</span>
    </div>`;

  let renderSessionView = null;
  try {
    await ensureSupabaseRuntime();
    const sessionModule = await import("../../../../../student/views/session-view.js");
    renderSessionView = sessionModule?.renderSessionView;
  } catch (error) {
    console.error(error);
  }

  if (pendingMounts.get(pageId) !== signature || inactivePages.has(pageId) || !host.isConnected) {
    pendingMounts.delete(pageId);
    return;
  }
  pendingMounts.delete(pageId);

  if (typeof renderSessionView !== "function") {
    renderLaunchError(host, "Runtime indisponible", "Impossible de charger les composants nécessaires à l’activité.");
    return;
  }

  const snapshot = captureStudentState();
  const root = document.createElement("div");
  root.className = `ttp-activity-runtime-root${state.projectionMode === ACTIVITY_PROJECTION_MODE_SLIDESHOW ? " is-slideshow" : ""}`;
  host.replaceChildren(root);

  const playlistMeta = getProjectedPlaylistMeta(state);
  const configName = `projected-playlist-${sanitizeInstancePart(pageId)}`;

  studentState.accessCode = state.accessCode;
  studentState.homeCode = state.accessCode;
  studentState.activities = state.playlist.map((item) => item.activity);
  studentState.activityFolders = [];
  studentState.activityEntry = "projected-teacher";
  studentState.activitiesMode = "individual";
  studentState.hasChosenActivitiesMode = true;
  studentState.selectedConfig = {
    config_name: configName,
    catalog_activity_id: state.playlist[0]?.activityId || "",
    config_json: runtimeConfig,
    module_key: "tools",
    catalog_context: "test",
    catalog_difficulty_level: state.playlist[0]?.level || 3
  };
  studentState.selectedConfigMeta = null;
  studentState.selectedMission = null;
  studentState.selectedStudent = null;
  studentState.selectedStudents = [];
  studentState.sharedSessionEntry = true;
  studentState.sessionMode = "projected-teacher";
  studentState.projectedSession = {
    catalogDifficultyLevel: state.playlist[0]?.level || 3,
    catalogRuntimeContext: "test",
    playlist: playlistMeta,
    buildRuntimeConfig: (nextPlaylistMeta) => buildProjectedPlaylistRuntimeConfig(state, nextPlaylistMeta),
    sendTeacherAction: (action, payload = {}) => sendAction?.(action, payload)
  };

  let cleanup = null;
  try {
    cleanup = renderSessionView(root);
  } catch (error) {
    console.error(error);
    restoreStudentState(snapshot);
    renderLaunchError(host, "Erreur de lancement", "Le runtime de l’activité n’a pas pu démarrer.");
    return;
  }

  const session = {
    pageId,
    host,
    page,
    state,
    sendAction,
    setProjectionChromeVisible,
    requestFullscreen,
    root,
    cleanup,
    snapshot,
    signature,
    slideshowController:null,
    link:null,
    lastStatus:null,
    pausedByTableau:false,
    resumeRequested:false,
    runtimeControlsVisible:chromeVisibilityByPage.get(pageId) !== false,
    completionHandled:false
  };
  session.link = createProjectedSessionLink({
    accessCode:state.accessCode,
    configName,
    onMessage:(message) => handleSessionLinkMessage(session, message)
  });
  session.slideshowController = state.projectionMode === ACTIVITY_PROJECTION_MODE_SLIDESHOW
    ? createSlideshowController({ root, state, accessCode:state.accessCode, configName, sendAction })
    : null;
  sessions.set(pageId, session);
  syncRuntimeControlsVisibility(session, chromeVisibilityByPage.get(pageId) !== false);
  session.link?.send?.("request-status");

  if (inactivePages.has(pageId)) requestPause(session);
}

export function renderActivityProjector({
  host,
  state,
  page,
  sendAction,
  chromeVisible = true,
  setProjectionChromeVisible,
  requestFullscreen
} = {}){
  if (!host) return;
  const pageId = String(page?.id || "").trim();
  if (!pageId) return;
  inactivePages.delete(pageId);
  chromeVisibilityByPage.set(pageId, chromeVisible !== false);
  const safeState = normalizeProjectedActivityState(state);
  const current = sessions.get(pageId);
  const signature = getSessionSignature(safeState);

  if (current && current.signature !== signature) cleanupSession(pageId);
  const session = sessions.get(pageId);
  if (session) {
    session.host = host;
    session.page = page;
    session.state = safeState;
    session.sendAction = sendAction;
    session.setProjectionChromeVisible = setProjectionChromeVisible;
    session.requestFullscreen = requestFullscreen;
    host.replaceChildren(session.root);
    session.slideshowController?.update?.(safeState);
    syncRuntimeControlsVisibility(session, chromeVisible !== false);
    setPauseGate(session, session.pausedByTableau === true, { pending:session.resumeRequested === true });
    return;
  }

  renderReady(host, page, safeState, sendAction, { setProjectionChromeVisible, requestFullscreen });
}

export function setActivityProjectorChromeVisibility({ page, pageId, visible } = {}){
  const id = String(pageId || page?.id || "").trim();
  if (!id) return;
  const controlsVisible = visible !== false;
  chromeVisibilityByPage.set(id, controlsVisible);
  const session = sessions.get(id);
  if (session) syncRuntimeControlsVisibility(session, controlsVisible);
}

export function pauseActivityProjector({ page, pageId } = {}){
  const id = String(pageId || page?.id || "").trim();
  if (!id) return;
  inactivePages.add(id);
  pendingMounts.delete(id);
  const session = sessions.get(id);
  if (session) requestPause(session);
}

export function disposeActivityProjector({ page, pageId } = {}){
  const id = String(pageId || page?.id || "").trim();
  if (!id) return;
  inactivePages.delete(id);
  chromeVisibilityByPage.delete(id);
  cleanupSession(id);
}

export function disposeAllActivityProjectors(){
  Array.from(sessions.keys()).forEach(cleanupSession);
  inactivePages.clear();
  pendingMounts.clear();
  chromeVisibilityByPage.clear();
}

window.addEventListener("beforeunload", disposeAllActivityProjectors);
