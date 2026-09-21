export const SEYES_SCALE_MIN = 0.65;
export const SEYES_SCALE_MAX = 1.65;
export const SEYES_SCALE_STEP = 0.05;
export const SEYES_CONTENT_MAX_LENGTH = 180000;

export const SEYES_DEFAULT_TEXT_COLOR = "#427ebe";
export const SEYES_DEFAULT_HIGHLIGHT_COLOR = "#fff2a8";

export const SEYES_FONTS = Object.freeze([
  { id: "belle-gs", label: "Belle Allure GS", family: "SeyesBelleAllureGS" },
  { id: "belle-c", label: "Belle Allure C", family: "SeyesBelleAllureC" },
  { id: "andika", label: "Andika", family: "Andika" },
  { id: "segoe", label: "Segoe UI", family: "Segoe UI" }
]);

export const SEYES_RULINGS = Object.freeze([
  { id: "seyes", label: "Seyès" },
  { id: "double", label: "Double ligne" },
  { id: "single", label: "Ligne simple" },
  { id: "large", label: "Grand lignage" },
  { id: "earth", label: "Terre / herbe / ciel" }
]);

export const SEYES_ALIGNMENTS = Object.freeze(["left", "center", "right"]);

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, digits = 2){
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function normalizeOneOf(value, items, fallback){
  const safe = String(value || "").trim();
  return items.some((item) => (typeof item === "string" ? item : item.id) === safe) ? safe : fallback;
}

function normalizeColor(value, fallback){
  const safe = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(safe) ? safe.toLowerCase() : fallback;
}

function normalizeContentHtml(value){
  return String(value ?? "").slice(0, SEYES_CONTENT_MAX_LENGTH);
}

export function normalizeSeyesState(rawState = {}){
  return {
    version: 2,
    title: String(rawState.title || "Document Seyès").trim().slice(0, 120) || "Document Seyès",
    contentHtml: normalizeContentHtml(rawState.contentHtml),
    fontId: normalizeOneOf(rawState.fontId, SEYES_FONTS, "belle-gs"),
    ruling: normalizeOneOf(rawState.ruling, SEYES_RULINGS, "seyes"),
    scale: round(clamp(rawState.scale ?? 1, SEYES_SCALE_MIN, SEYES_SCALE_MAX), 2),
    alignment: normalizeOneOf(rawState.alignment, SEYES_ALIGNMENTS, "left"),
    letterSpacing: round(clamp(rawState.letterSpacing ?? 0, -0.04, 0.24), 3),
    wordSpacing: round(clamp(rawState.wordSpacing ?? 0, -0.04, 0.7), 3),
    formatColor: normalizeColor(rawState.formatColor, SEYES_DEFAULT_TEXT_COLOR),
    highlightColor: normalizeColor(rawState.highlightColor, SEYES_DEFAULT_HIGHLIGHT_COLOR),
    formatThickness: Math.round(clamp(rawState.formatThickness ?? 2, 1, 5))
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
  const current = normalizeSeyesState(state);
  const safeAction = String(action || "").trim();

  if (safeAction === "set-content") {
    return { patch: { state: normalizeSeyesState({ ...current, contentHtml: payload.contentHtml }) } };
  }

  if (safeAction === "set-settings") {
    return { patch: { state: normalizeSeyesState({ ...current, ...(payload || {}) }) } };
  }

  if (safeAction === "load-document") {
    return { patch: { state: normalizeSeyesState(payload?.state || payload || {}) } };
  }

  if (safeAction === "reset-document") {
    return {
      patch: {
        state: normalizeSeyesState({
          ...current,
          contentHtml: "",
          alignment: "left",
          letterSpacing: 0,
          wordSpacing: 0,
          formatColor: SEYES_DEFAULT_TEXT_COLOR,
          highlightColor: SEYES_DEFAULT_HIGHLIGHT_COLOR,
          formatThickness: 2
        })
      },
      message: "Document Seyès réinitialisé."
    };
  }

  return null;
}

export function getSeyesFont(fontId){
  return SEYES_FONTS.find((item) => item.id === String(fontId || "")) || SEYES_FONTS[0];
}
