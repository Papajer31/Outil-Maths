function clone(value){ return value == null ? null : JSON.parse(JSON.stringify(value)); }

export function normalizeFuseeState(state = {}){
  return {
    initialized: state.initialized === true,
    config: clone(state.config),
    saved: state.saved?.version === 2 && state.saved?.snapshot ? clone(state.saved) : null,
    launchId: String(state.launchId || "")
  };
}

export function applyFuseeAction({ state, action, payload = {} } = {}){
  const next = normalizeFuseeState(state);
  if (action === "runtime:save") {
    // A message from the previous mission must not replace a new game's state.
    if (!next.launchId || payload.launchId !== next.launchId || !payload.saved?.snapshot) return null;
    next.saved = clone(payload.saved);
  } else if (action === "runtime:stop") {
    if (payload.launchId !== next.launchId) return null;
    next.launchId = "";
  } else if (action === "runtime:settings") {
    if (payload.launchId !== next.launchId || !next.config) return null;
    next.config.automaticControlEnabled = payload.settings?.automaticControlEnabled !== false;
    const seconds = Number(payload.settings?.inactivitySeconds);
    next.config.inactivitySeconds = Number.isFinite(seconds) ? Math.max(1, Math.min(120, Math.round(seconds))) : 4;
  } else return null;
  return { patch: { state:next }, renderPanel:false };
}
