export const ACTIVITY_DEFAULT_LEVEL = 3;
export const ACTIVITY_PROJECTION_MODE_INTERACTIVE = "interactive";
export const ACTIVITY_PROJECTION_MODE_SLIDESHOW = "slideshow";
export const ACTIVITY_SLIDESHOW_ADVANCE_MANUAL = "manual";
export const ACTIVITY_SLIDESHOW_ADVANCE_AUTO = "auto";
export const ACTIVITY_SLIDESHOW_DEFAULT_SECONDS = 10;

function cloneValue(value){
  if (value == null) return value;
  try {
    if (typeof structuredClone === "function") return structuredClone(value);
  } catch {}
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

function createPlaylistItemId(){
  try {
    if (typeof crypto?.randomUUID === "function") return `activity-${crypto.randomUUID()}`;
  } catch {}
  return `activity-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function normalizeActivityLevel(value){
  const level = Math.trunc(Number(value));
  return Number.isFinite(level) ? Math.max(1, Math.min(5, level)) : ACTIVITY_DEFAULT_LEVEL;
}

export function normalizeActivityProjectionMode(value){
  return String(value || "").trim().toLowerCase() === ACTIVITY_PROJECTION_MODE_SLIDESHOW
    ? ACTIVITY_PROJECTION_MODE_SLIDESHOW
    : ACTIVITY_PROJECTION_MODE_INTERACTIVE;
}

export function normalizeActivitySlideshowAdvanceMode(value){
  return String(value || "").trim().toLowerCase() === ACTIVITY_SLIDESHOW_ADVANCE_AUTO
    ? ACTIVITY_SLIDESHOW_ADVANCE_AUTO
    : ACTIVITY_SLIDESHOW_ADVANCE_MANUAL;
}

export function normalizeActivitySlideshowSeconds(value){
  const seconds = Math.trunc(Number(value));
  return Number.isFinite(seconds)
    ? Math.max(2, Math.min(300, seconds))
    : ACTIVITY_SLIDESHOW_DEFAULT_SECONDS;
}

function normalizePlaylistItem(rawItem = {}, index = 0){
  const activity = rawItem?.activity && typeof rawItem.activity === "object" && !Array.isArray(rawItem.activity)
    ? cloneValue(rawItem.activity)
    : null;
  const activityId = String(activity?.id || rawItem?.activityId || "").trim();
  if (!activity || !activityId) return null;

  return {
    id: String(rawItem?.id || rawItem?.itemId || `activity-${activityId}-${index + 1}`).trim() || `activity-${activityId}-${index + 1}`,
    activityId,
    activityLabel: String(activity?.config_name || activity?.name || activity?.title || rawItem?.activityLabel || activityId).trim(),
    activity,
    level: normalizeActivityLevel(rawItem?.level)
  };
}

function normalizePlaylist(rawState = {}){
  let source = Array.isArray(rawState?.playlist) ? rawState.playlist : [];

  // Migration transparente depuis la première version du widget (une seule activité).
  if (!source.length && rawState?.activity && typeof rawState.activity === "object") {
    source = [{
      id: rawState?.playlistItemId || "activity-legacy-1",
      activity: rawState.activity,
      activityId: rawState.activityId,
      activityLabel: rawState.activityLabel,
      level: rawState.level
    }];
  }

  const usedIds = new Set();
  return source.map((item, index) => normalizePlaylistItem(item, index)).filter(Boolean).map((item, index) => {
    let id = item.id;
    if (usedIds.has(id)) id = `${id}-${index + 1}`;
    usedIds.add(id);
    return { ...item, id };
  });
}

export function normalizeProjectedActivityState(rawState = {}){
  return {
    playlist: normalizePlaylist(rawState),
    projectionMode: normalizeActivityProjectionMode(rawState?.projectionMode),
    slideshowAdvanceMode: normalizeActivitySlideshowAdvanceMode(rawState?.slideshowAdvanceMode),
    slideshowSeconds: normalizeActivitySlideshowSeconds(rawState?.slideshowSeconds),
    slideshowStarted: rawState?.slideshowStarted === true,
    slideshowDockCollapsed: rawState?.slideshowDockCollapsed === true,
    launchRevision: Math.max(0, Math.trunc(Number(rawState?.launchRevision) || 0)),
    accessCode: String(rawState?.accessCode || "").trim().toUpperCase()
  };
}

export function createInitialProjectedActivityState(){
  return normalizeProjectedActivityState({ launchRevision: 0 });
}

export function createProjectedActivityProjectorState({ state, teacherSpace } = {}){
  return normalizeProjectedActivityState({
    ...state,
    accessCode: String(teacherSpace?.access_code || state?.accessCode || "").trim().toUpperCase()
  });
}

function withRestart(current, playlist){
  return normalizeProjectedActivityState({
    ...current,
    playlist,
    slideshowStarted: current.projectionMode === ACTIVITY_PROJECTION_MODE_SLIDESHOW ? false : current.slideshowStarted,
    launchRevision: current.launchRevision + 1
  });
}

function updateItemLevel(current, itemId, level, { restart = true } = {}){
  const safeItemId = String(itemId || "").trim();
  if (!safeItemId) return null;
  let changed = false;
  const playlist = current.playlist.map((item) => {
    if (item.id !== safeItemId) return item;
    const nextLevel = normalizeActivityLevel(level);
    if (nextLevel === item.level) return item;
    changed = true;
    return { ...item, level: nextLevel };
  });
  if (!changed) return null;
  return restart
    ? withRestart(current, playlist)
    : normalizeProjectedActivityState({ ...current, playlist });
}

export function applyProjectedActivityAction({ action, payload = {}, state } = {}){
  const safeAction = String(action || "").trim();
  const current = normalizeProjectedActivityState(state);

  if (safeAction === "add-activity") {
    const activity = payload?.activity && typeof payload.activity === "object" ? cloneValue(payload.activity) : null;
    if (!activity?.id) return null;
    const item = normalizePlaylistItem({
      id: createPlaylistItemId(),
      activity,
      level: normalizeActivityLevel(payload?.level)
    }, current.playlist.length);
    if (!item) return null;
    return { patch: { state: withRestart(current, [...current.playlist, item]) } };
  }

  // Compatibilité avec le premier patch : "set-activity" remplace la liste par une activité.
  if (safeAction === "set-activity") {
    const activity = payload?.activity && typeof payload.activity === "object" ? cloneValue(payload.activity) : null;
    if (!activity?.id) return null;
    const item = normalizePlaylistItem({ id: createPlaylistItemId(), activity, level: payload?.level }, 0);
    if (!item) return null;
    return { patch: { state: withRestart(current, [item]) } };
  }

  if (safeAction === "remove-activity") {
    const itemId = String(payload?.itemId || "").trim();
    const playlist = current.playlist.filter((item) => item.id !== itemId);
    if (playlist.length === current.playlist.length) return null;
    return { patch: { state: withRestart(current, playlist) } };
  }

  if (safeAction === "clear-activity") {
    if (!current.playlist.length) return null;
    return { patch: { state: withRestart(current, []) } };
  }

  if (safeAction === "set-item-level") {
    const next = updateItemLevel(current, payload?.itemId, payload?.level, { restart: true });
    return next ? { patch: { state: next } } : null;
  }

  // Utilisé depuis le pupitre projeté : l'état persistant est synchronisé,
  // mais le runtime courant se met à jour lui-même sans être remonté par le projecteur.
  if (safeAction === "set-item-level-live") {
    const next = updateItemLevel(current, payload?.itemId, payload?.level, { restart: false });
    return next ? { patch: { state: next } } : null;
  }


  if (safeAction === "set-projection-mode") {
    const projectionMode = normalizeActivityProjectionMode(payload?.mode);
    if (projectionMode === current.projectionMode) return null;
    return {
      patch: {
        state: normalizeProjectedActivityState({
          ...current,
          projectionMode,
          slideshowStarted: false,
          slideshowDockCollapsed: false,
          launchRevision: current.launchRevision + 1
        })
      }
    };
  }

  if (safeAction === "set-slideshow-advance-mode") {
    const slideshowAdvanceMode = normalizeActivitySlideshowAdvanceMode(payload?.mode);
    if (slideshowAdvanceMode === current.slideshowAdvanceMode) return null;
    return {
      patch: {
        state: normalizeProjectedActivityState({
          ...current,
          slideshowAdvanceMode
        })
      }
    };
  }

  if (safeAction === "set-slideshow-seconds") {
    const slideshowSeconds = normalizeActivitySlideshowSeconds(payload?.seconds);
    if (slideshowSeconds === current.slideshowSeconds) return null;
    return {
      patch: {
        state: normalizeProjectedActivityState({
          ...current,
          slideshowSeconds
        })
      }
    };
  }

  if (safeAction === "prepare-slideshow") {
    if (current.projectionMode !== ACTIVITY_PROJECTION_MODE_SLIDESHOW) return null;
    return {
      patch: {
        state: normalizeProjectedActivityState({
          ...current,
          slideshowStarted: false,
          slideshowDockCollapsed: false,
          launchRevision: current.launchRevision + 1
        })
      }
    };
  }

  if (safeAction === "start-slideshow") {
    if (current.projectionMode !== ACTIVITY_PROJECTION_MODE_SLIDESHOW || current.slideshowStarted) return null;
    return {
      patch: {
        state: normalizeProjectedActivityState({
          ...current,
          slideshowStarted: true
        })
      }
    };
  }

  if (safeAction === "set-slideshow-dock-collapsed") {
    if (current.projectionMode !== ACTIVITY_PROJECTION_MODE_SLIDESHOW) return null;
    const slideshowDockCollapsed = payload?.collapsed === true;
    if (slideshowDockCollapsed === current.slideshowDockCollapsed) return null;
    return {
      patch: {
        state: normalizeProjectedActivityState({
          ...current,
          slideshowDockCollapsed
        })
      }
    };
  }

  if (safeAction === "reorder-activity") {
    const itemId = String(payload?.itemId || "").trim();
    const targetIndex = Math.max(0, Math.min(current.playlist.length - 1, Math.trunc(Number(payload?.targetIndex) || 0)));
    const fromIndex = current.playlist.findIndex((item) => item.id === itemId);
    if (fromIndex < 0 || fromIndex === targetIndex) return null;
    const playlist = current.playlist.slice();
    const [moved] = playlist.splice(fromIndex, 1);
    playlist.splice(targetIndex, 0, moved);
    return { patch: { state: withRestart(current, playlist) } };
  }

  if (safeAction === "restart") {
    return {
      patch: {
        state: normalizeProjectedActivityState({
          ...current,
          slideshowStarted: current.projectionMode === ACTIVITY_PROJECTION_MODE_SLIDESHOW ? false : current.slideshowStarted,
          launchRevision: current.launchRevision + 1
        })
      }
    };
  }

  return null;
}
