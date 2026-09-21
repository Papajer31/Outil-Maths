import { normalizeSceneBackgroundState } from "../widgets/background/tool.js";
import { applyAnnotationAction, createInitialAnnotationState, normalizeAnnotationState } from "./annotations.js";

export const SURFACE_BACKGROUND_SCOPE_PAGE = "page";
export const SURFACE_BACKGROUND_SCOPE_SHARED = "shared";

function normalizeBackgroundScope(value){
  return String(value || "") === SURFACE_BACKGROUND_SCOPE_SHARED
    ? SURFACE_BACKGROUND_SCOPE_SHARED
    : SURFACE_BACKGROUND_SCOPE_PAGE;
}

export function createInitialSurfaceState(){
  return {
    backgroundScope: SURFACE_BACKGROUND_SCOPE_PAGE,
    background: normalizeSceneBackgroundState({ background: "white" }),
    snap: { enabled: false },
    annotations: createInitialAnnotationState()
  };
}

export function normalizeSurfaceState(raw = {}){
  return {
    backgroundScope: normalizeBackgroundScope(raw.backgroundScope),
    background: normalizeSceneBackgroundState(raw.background || raw.scene || {}),
    snap: { enabled: raw?.snap?.enabled === true },
    annotations: normalizeAnnotationState(raw.annotations)
  };
}

export function resolveSurfaceBackground(rawSurface = {}, sharedBackground = {}){
  const surface = normalizeSurfaceState(rawSurface);
  return surface.backgroundScope === SURFACE_BACKGROUND_SCOPE_SHARED
    ? normalizeSceneBackgroundState(sharedBackground)
    : surface.background;
}

export function applySurfaceAction(rawSurface, action, payload = {}){
  const surface = normalizeSurfaceState(rawSurface);
  const safeAction = String(action || "").trim();

  if (safeAction === "set-background") {
    return normalizeSurfaceState({
      ...surface,
      background: normalizeSceneBackgroundState({ ...surface.background, ...(payload.patch || {}) })
    });
  }
  if (safeAction === "set-background-scope") {
    return normalizeSurfaceState({ ...surface, backgroundScope: normalizeBackgroundScope(payload.scope) });
  }
  if (safeAction === "set-snap-enabled") {
    return normalizeSurfaceState({ ...surface, snap: { enabled: payload.enabled === true } });
  }
  if (safeAction.startsWith("annotations:")) {
    return normalizeSurfaceState({
      ...surface,
      annotations: applyAnnotationAction(surface.annotations, safeAction.slice("annotations:".length), payload)
    });
  }
  return surface;
}
