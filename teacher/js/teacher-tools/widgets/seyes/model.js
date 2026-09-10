export const SEYES_FONT_GS = "GS";
export const SEYES_FONT_CM = "CM";
export const SEYES_ZOOM_MIN = 0.5;
export const SEYES_ZOOM_MAX = 2;
export const SEYES_ZOOM_STEP = 0.1;
export const SEYES_DEFAULT_COLOR = "#427ebe";
export const SEYES_CONTENT_MAX_LENGTH = 120000;

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, digits = 2){
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function normalizeFontSet(value){
  return String(value || "").trim().toUpperCase() === SEYES_FONT_CM
    ? SEYES_FONT_CM
    : SEYES_FONT_GS;
}

function normalizeZoom(value){
  const safe = clamp(value, SEYES_ZOOM_MIN, SEYES_ZOOM_MAX);
  return round(Math.round(safe / SEYES_ZOOM_STEP) * SEYES_ZOOM_STEP, 1);
}

function normalizeContentHtml(value){
  return String(value ?? "").slice(0, SEYES_CONTENT_MAX_LENGTH);
}

export function normalizeSeyesState(rawState = {}){
  return {
    version: 1,
    contentHtml: normalizeContentHtml(rawState.contentHtml),
    fontSet: normalizeFontSet(rawState.fontSet),
    zoom: normalizeZoom(rawState.zoom ?? 1)
  };
}

export function createInitialSeyesState(){
  return normalizeSeyesState();
}

export function createSeyesProjectorState({ state } = {}){
  return normalizeSeyesState(state);
}

export function cloneSeyesState(rawState = {}){
  return normalizeSeyesState(rawState);
}

export function applySeyesAction({ action, payload = {}, state } = {}){
  const safeAction = String(action || "").trim();
  const currentState = normalizeSeyesState(state);

  if (safeAction === "set-content") {
    return {
      patch: {
        state: normalizeSeyesState({
          ...currentState,
          contentHtml: payload?.contentHtml
        })
      }
    };
  }

  if (safeAction === "set-settings") {
    return {
      patch: {
        state: normalizeSeyesState({
          ...currentState,
          fontSet: payload?.fontSet ?? currentState.fontSet,
          zoom: payload?.zoom ?? currentState.zoom
        })
      }
    };
  }

  return null;
}
