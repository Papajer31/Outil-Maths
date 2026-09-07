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

function renderWaiting(host, state){
  cleanupSession(getWidgetId({}, host));
  const count = state.playlist.length;
  const title = count === 1
    ? state.playlist[0].activityLabel
    : (count > 1 ? `${count} activités prêtes à être projetées` : "Activités prêtes à être projetées");
  host.innerHTML = `
    <div class="ttp-activity-waiting">
      <span class="ttp-material-icon" aria-hidden="true">cast</span>
      <strong>${escapeHtml(title)}</strong>
      <span>${count ? "Passe en Scène complète pour lancer la liste de lecture." : "Ajoute une activité depuis l’onglet Tableau."}</span>
    </div>
  `;
}

function renderLaunchError(host, title, text){
  host.innerHTML = `
    <div class="ttp-activity-waiting is-error">
      <span class="ttp-material-icon" aria-hidden="true">warning</span>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(text)}</span>
    </div>
  `;
}

async function mountActivity({ host, widget, state, sendAction }){
  const widgetId = getWidgetId(widget, host);
  if (!widgetId) return;
  const signature = getSessionSignature(state);
  const current = sessions.get(widgetId);
  if (current && current.signature === signature && current.host === host && host.contains(current.root)) {
    current.slideshowController?.update?.(state);
    return;
  }
  if (pendingMounts.get(widgetId) === signature) return;

  cleanupSession(widgetId);
  pendingMounts.set(widgetId, signature);

  if (!state.playlist.length || !state.accessCode) {
    pendingMounts.delete(widgetId);
    renderLaunchError(
      host,
      "Impossible de lancer la projection",
      !state.accessCode ? "Le code classe est introuvable." : "La liste de lecture est vide."
    );
    return;
  }

  const runtimeConfig = buildProjectedPlaylistRuntimeConfig(state);
  if (!runtimeConfig || !Array.isArray(runtimeConfig.sequence) || runtimeConfig.sequence.length !== state.playlist.length) {
    pendingMounts.delete(widgetId);
    renderLaunchError(host, "Configuration invalide", "Une des activités ne peut pas être projetée pour le moment.");
    return;
  }

  host.innerHTML = `
    <div class="ttp-activity-waiting is-loading">
      <span class="ttp-material-icon" aria-hidden="true">progress_activity</span>
      <strong>Chargement des activités…</strong>
      <span>Préparation du runtime de projection.</span>
    </div>
  `;

  let renderSessionView = null;
  try {
    await ensureSupabaseRuntime();
    const sessionModule = await import("../../../../../student/views/session-view.js");
    renderSessionView = sessionModule?.renderSessionView;
  } catch (error) {
    console.error(error);
  }

  if (pendingMounts.get(widgetId) !== signature || !host.isConnected) return;
  pendingMounts.delete(widgetId);

  if (typeof renderSessionView !== "function") {
    renderLaunchError(host, "Runtime indisponible", "Impossible de charger les composants nécessaires aux activités.");
    return;
  }

  const snapshot = captureStudentState();
  const root = document.createElement("div");
  root.className = `ttp-activity-runtime-root${state.projectionMode === ACTIVITY_PROJECTION_MODE_SLIDESHOW ? " is-slideshow" : ""}`;
  host.replaceChildren(root);

  const playlistMeta = getProjectedPlaylistMeta(state);
  const configName = `projected-playlist-${sanitizeInstancePart(widgetId)}`;

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
    renderLaunchError(host, "Erreur de lancement", "Le runtime des activités n’a pas pu démarrer.");
    return;
  }

  const slideshowController = state.projectionMode === ACTIVITY_PROJECTION_MODE_SLIDESHOW
    ? createSlideshowController({
      root,
      state,
      accessCode: state.accessCode,
      configName,
      sendAction
    })
    : null;

  sessions.set(widgetId, {
    widgetId,
    host,
    root,
    cleanup,
    snapshot,
    signature,
    slideshowController
  });
}

export function renderActivityProjector({ host, state, widget, sendAction } = {}){
  if (!host) return;
  const safeState = normalizeProjectedActivityState(state);
  const isStage = String(widget?.viewMode || "normal") === "stage";

  if (!isStage) {
    renderWaiting(host, safeState);
    return;
  }

  void mountActivity({ host, widget, state: safeState, sendAction });
}

export function disposeActivityProjector({ widget, widgetId, host } = {}){
  cleanupSession(String(widgetId || widget?.id || getWidgetId(widget, host) || "").trim());
}

export function disposeAllActivityProjectors(){
  Array.from(sessions.keys()).forEach(cleanupSession);
}

window.addEventListener("beforeunload", disposeAllActivityProjectors);
