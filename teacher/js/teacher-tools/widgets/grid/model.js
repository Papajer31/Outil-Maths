import {
  normalizeColorPickerValue,
  parseColorPickerValue
} from "../../../../../shared/color-picker.js";

export const GRID_ROWS_MIN = 1;
export const GRID_ROWS_MAX = 30;
export const GRID_COLUMNS_MIN = 1;
export const GRID_COLUMNS_MAX = 30;
export const GRID_LINE_WIDTH_MIN = 1;
export const GRID_LINE_WIDTH_MAX = 10;
export const GRID_BACKGROUND_TRANSPARENT = "transparent";
export const GRID_BACKGROUND_COLOR = "color";
export const GRID_DEFAULT_LINE_COLOR = "rgba(255,255,255,.92)";
export const GRID_DEFAULT_BACKGROUND_COLOR = "#ffffff";

const GRID_LEGACY_LINE_COLORS = Object.freeze({
  white: "rgba(255,255,255,.92)",
  black: "rgba(15,23,42,.92)",
  gray: "rgba(148,163,184,.88)",
  blue: "rgba(59,130,246,.92)",
  red: "rgba(239,68,68,.92)",
  green: "rgba(34,197,94,.92)"
});

const GRID_LEGACY_BACKGROUNDS = Object.freeze({
  white: "rgba(255,255,255,.86)",
  paper: "rgba(255,253,248,.88)",
  dark: "rgba(15,23,42,.62)",
  green: "rgba(20,57,35,.58)",
  blue: "rgba(15,35,73,.58)"
});

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function normalizeInteger(value, min, max, fallback){
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return clamp(number, min, max);
}

function hasOwn(object, property){
  return Object.prototype.hasOwnProperty.call(object || {}, property);
}

function getLegacyGridLineColor(value){
  const safeValue = String(value || "").trim();
  return GRID_LEGACY_LINE_COLORS[safeValue] || "";
}

function getLegacyGridBackground(value){
  const safeValue = String(value || "").trim();
  return GRID_LEGACY_BACKGROUNDS[safeValue] || "";
}

function normalizeGridLineColor(value){
  const safeValue = String(value || "").trim();
  return normalizeColorPickerValue(
    getLegacyGridLineColor(safeValue) || safeValue,
    GRID_DEFAULT_LINE_COLOR
  );
}

function normalizeGridBackgroundColor(value){
  const safeValue = String(value || "").trim();
  return normalizeColorPickerValue(
    getLegacyGridBackground(safeValue) || safeValue,
    GRID_DEFAULT_BACKGROUND_COLOR
  );
}

function normalizeGridBackgroundMode(rawState = {}){
  const rawBackground = String(rawState.background || "").trim();
  if (rawBackground === GRID_BACKGROUND_TRANSPARENT) return GRID_BACKGROUND_TRANSPARENT;
  if (
    rawBackground === GRID_BACKGROUND_COLOR
    || hasOwn(rawState, "backgroundColor")
    || Boolean(getLegacyGridBackground(rawBackground))
    || Boolean(parseColorPickerValue(rawBackground))
  ) {
    return GRID_BACKGROUND_COLOR;
  }
  return GRID_BACKGROUND_TRANSPARENT;
}

export function getGridLineColor(id){
  return normalizeGridLineColor(id);
}

export function getGridBackground(stateOrValue){
  const safeState = stateOrValue && typeof stateOrValue === "object"
    ? normalizeGridState(stateOrValue)
    : normalizeGridState({ background: stateOrValue });
  return safeState.background === GRID_BACKGROUND_TRANSPARENT
    ? "transparent"
    : safeState.backgroundColor;
}

export function normalizeGridState(rawState = {}){
  const background = normalizeGridBackgroundMode(rawState);
  const backgroundColorSource = hasOwn(rawState, "backgroundColor")
    ? rawState.backgroundColor
    : rawState.background;

  return {
    rows: normalizeInteger(rawState.rows, GRID_ROWS_MIN, GRID_ROWS_MAX, 4),
    columns: normalizeInteger(rawState.columns, GRID_COLUMNS_MIN, GRID_COLUMNS_MAX, 5),
    lineColor: normalizeGridLineColor(rawState.lineColor),
    lineWidth: normalizeInteger(rawState.lineWidth, GRID_LINE_WIDTH_MIN, GRID_LINE_WIDTH_MAX, 3),
    background,
    backgroundColor: normalizeGridBackgroundColor(backgroundColorSource)
  };
}

export function createInitialGridState(){
  return normalizeGridState();
}

export function createGridProjectorState({ state } = {}){
  return normalizeGridState(state);
}

export function cloneGridState(rawState = {}){
  return normalizeGridState(rawState);
}

export function applyGridAction({ action, payload = {}, state } = {}){
  const safeAction = String(action || "").trim();
  const currentState = normalizeGridState(state);

  if (safeAction === "set-grid") {
    const hasBackground = hasOwn(payload, "background");
    const hasBackgroundColor = hasOwn(payload, "backgroundColor");
    return {
      patch: {
        state: normalizeGridState({
          ...currentState,
          rows: payload?.rows ?? currentState.rows,
          columns: payload?.columns ?? currentState.columns,
          lineColor: payload?.lineColor ?? currentState.lineColor,
          lineWidth: payload?.lineWidth ?? currentState.lineWidth,
          background: hasBackground
            ? payload.background
            : (hasBackgroundColor ? GRID_BACKGROUND_COLOR : currentState.background),
          backgroundColor: hasBackgroundColor ? payload.backgroundColor : currentState.backgroundColor
        })
      }
    };
  }

  return null;
}
