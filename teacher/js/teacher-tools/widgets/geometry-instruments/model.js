export const GEOMETRY_INSTRUMENT_RULER_CLASSIC = "classic";
export const GEOMETRY_INSTRUMENT_RULER_SIMPLE = "simple";
export const GEOMETRY_INSTRUMENT_RULER_GRID = "grid";

export const GEOMETRY_INSTRUMENT_SET_SQUARE_PLASTIC = "plastic";
export const GEOMETRY_INSTRUMENT_SET_SQUARE_METAL = "metal";

export const RULER_UNIT_SIZE_MIN = 5;
export const RULER_UNIT_SIZE_MAX = 200;
export const RULER_LENGTH_UNITS_MIN = 2;
export const RULER_LENGTH_UNITS_MAX = 100;
export const RULER_NUDGE_PX = 1;
export const RULER_BIG_NUDGE_PX = 10;
export const SET_SQUARE_SIDE_MIN = 80;
export const SET_SQUARE_SIDE_MAX = 2000;
export const SET_SQUARE_NUDGE_PX = 1;
export const SET_SQUARE_BIG_NUDGE_PX = 10;

const DEFAULT_RULER = Object.freeze({
  enabled: true,
  type: GEOMETRY_INSTRUMENT_RULER_CLASSIC,
  x: 0.16,
  y: 0.62,
  rotation: 0,
  unitSize: 46,
  lengthUnits: 12,
  showAnglePill: false
});

const DEFAULT_SET_SQUARE = Object.freeze({
  enabled: false,
  type: GEOMETRY_INSTRUMENT_SET_SQUARE_PLASTIC,
  x: 0.28,
  y: 0.25,
  rotation: 0,
  horizontalLength: 460,
  verticalLength: 290,
  showAnglePill: false,
  showRightAngleMark: false
});

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, digits = 4){
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function normalizeBoolean(value, fallback = false){
  if (value === true) return true;
  if (value === false) return false;
  return fallback;
}

function normalizeRulerType(value){
  const safeValue = String(value || "").trim();
  if (safeValue === GEOMETRY_INSTRUMENT_RULER_SIMPLE) return GEOMETRY_INSTRUMENT_RULER_SIMPLE;
  if (safeValue === GEOMETRY_INSTRUMENT_RULER_GRID) return GEOMETRY_INSTRUMENT_RULER_GRID;
  return GEOMETRY_INSTRUMENT_RULER_CLASSIC;
}

function normalizePosition(value, fallback = 0){
  const number = Number(value);
  return round(clamp(Number.isFinite(number) ? number : fallback, -0.5, 1.5), 5);
}

function normalizeRotation(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return round(((number % 360) + 360) % 360, 3);
}


function normalizeSetSquareType(value){
  const safeValue = String(value || "").trim();
  if (safeValue === GEOMETRY_INSTRUMENT_SET_SQUARE_METAL) return GEOMETRY_INSTRUMENT_SET_SQUARE_METAL;
  return GEOMETRY_INSTRUMENT_SET_SQUARE_PLASTIC;
}

function normalizeSetSquareSide(value, fallback){
  const number = Number(value);
  return Math.round(clamp(Number.isFinite(number) ? number : fallback, SET_SQUARE_SIDE_MIN, SET_SQUARE_SIDE_MAX));
}

function normalizeUnitSize(value, fallback = DEFAULT_RULER.unitSize){
  const number = Number(value);
  return Math.round(clamp(Number.isFinite(number) ? number : fallback, RULER_UNIT_SIZE_MIN, RULER_UNIT_SIZE_MAX));
}

function normalizeLengthUnits(value, fallback = DEFAULT_RULER.lengthUnits){
  const number = Number(value);
  return round(clamp(Number.isFinite(number) ? number : fallback, RULER_LENGTH_UNITS_MIN, RULER_LENGTH_UNITS_MAX), 2);
}

export function normalizeRulerState(rawRuler = {}){
  const ruler = rawRuler && typeof rawRuler === "object" ? rawRuler : {};
  return {
    enabled: normalizeBoolean(ruler.enabled, DEFAULT_RULER.enabled),
    type: normalizeRulerType(ruler.type),
    x: normalizePosition(ruler.x, DEFAULT_RULER.x),
    y: normalizePosition(ruler.y, DEFAULT_RULER.y),
    rotation: normalizeRotation(ruler.rotation),
    unitSize: normalizeUnitSize(ruler.unitSize),
    lengthUnits: normalizeLengthUnits(ruler.lengthUnits),
    showAnglePill: normalizeBoolean(ruler.showAnglePill, DEFAULT_RULER.showAnglePill)
  };
}

export function normalizeSetSquareState(rawSetSquare = {}){
  const setSquare = rawSetSquare && typeof rawSetSquare === "object" ? rawSetSquare : {};
  return {
    enabled: normalizeBoolean(setSquare.enabled, DEFAULT_SET_SQUARE.enabled),
    type: normalizeSetSquareType(setSquare.type),
    x: normalizePosition(setSquare.x, DEFAULT_SET_SQUARE.x),
    y: normalizePosition(setSquare.y, DEFAULT_SET_SQUARE.y),
    rotation: normalizeRotation(setSquare.rotation),
    horizontalLength: normalizeSetSquareSide(setSquare.horizontalLength, DEFAULT_SET_SQUARE.horizontalLength),
    verticalLength: normalizeSetSquareSide(setSquare.verticalLength, DEFAULT_SET_SQUARE.verticalLength),
    showAnglePill: normalizeBoolean(setSquare.showAnglePill, DEFAULT_SET_SQUARE.showAnglePill),
    showRightAngleMark: normalizeBoolean(setSquare.showRightAngleMark, DEFAULT_SET_SQUARE.showRightAngleMark)
  };
}

export function normalizeGeometryInstrumentsState(rawState = {}){
  const state = rawState && typeof rawState === "object" ? rawState : {};
  return {
    ruler: normalizeRulerState(state.ruler),
    setSquare: normalizeSetSquareState(state.setSquare),
    compass: { enabled: false },
    protractor: { enabled: false }
  };
}

export function createInitialGeometryInstrumentsState(){
  return normalizeGeometryInstrumentsState();
}

export function createGeometryInstrumentsProjectorState({ state } = {}){
  return normalizeGeometryInstrumentsState(state);
}

export function cloneGeometryInstrumentsState(rawState = {}){
  return normalizeGeometryInstrumentsState(JSON.parse(JSON.stringify(normalizeGeometryInstrumentsState(rawState))));
}

function hasOwn(object, key){
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function hasFiniteNumber(object, key){
  return hasOwn(object, key) && Number.isFinite(Number(object?.[key]));
}

function patchRuler(state, patch = {}){
  const current = normalizeGeometryInstrumentsState(state);
  const ruler = current.ruler;
  const nextRuler = normalizeRulerState({
    ...ruler,
    ...(hasOwn(patch, "enabled") ? { enabled: patch.enabled === true } : null),
    ...(hasOwn(patch, "type") ? { type: patch.type } : null),
    ...(hasFiniteNumber(patch, "x") ? { x: patch.x } : null),
    ...(hasFiniteNumber(patch, "y") ? { y: patch.y } : null),
    ...(hasFiniteNumber(patch, "rotation") ? { rotation: patch.rotation } : null),
    ...(hasFiniteNumber(patch, "unitSize") ? { unitSize: patch.unitSize } : null),
    ...(hasFiniteNumber(patch, "lengthUnits") ? { lengthUnits: patch.lengthUnits } : null),
    ...(hasOwn(patch, "showAnglePill") ? { showAnglePill: patch.showAnglePill === true } : null)
  });
  return normalizeGeometryInstrumentsState({
    ...current,
    ruler: nextRuler
  });
}

function patchRulerUnitSizePreservingLength(state, unitSize){
  const current = normalizeGeometryInstrumentsState(state);
  const nextUnitSize = normalizeUnitSize(unitSize, current.ruler.unitSize);
  const measureLengthPx = current.ruler.unitSize * current.ruler.lengthUnits;
  return patchRuler(current, {
    unitSize: nextUnitSize,
    lengthUnits: measureLengthPx / Math.max(1, nextUnitSize)
  });
}

function patchSetSquare(state, patch = {}){
  const current = normalizeGeometryInstrumentsState(state);
  const setSquare = current.setSquare;
  const nextSetSquare = normalizeSetSquareState({
    ...setSquare,
    ...(hasOwn(patch, "enabled") ? { enabled: patch.enabled === true } : null),
    ...(hasOwn(patch, "type") ? { type: patch.type } : null),
    ...(hasFiniteNumber(patch, "x") ? { x: patch.x } : null),
    ...(hasFiniteNumber(patch, "y") ? { y: patch.y } : null),
    ...(hasFiniteNumber(patch, "rotation") ? { rotation: patch.rotation } : null),
    ...(hasFiniteNumber(patch, "horizontalLength") ? { horizontalLength: patch.horizontalLength } : null),
    ...(hasFiniteNumber(patch, "verticalLength") ? { verticalLength: patch.verticalLength } : null),
    ...(hasOwn(patch, "showAnglePill") ? { showAnglePill: patch.showAnglePill === true } : null),
    ...(hasOwn(patch, "showRightAngleMark") ? { showRightAngleMark: patch.showRightAngleMark === true } : null)
  });
  return normalizeGeometryInstrumentsState({
    ...current,
    setSquare: nextSetSquare
  });
}

export function applyGeometryInstrumentsAction({ action, payload = {}, state } = {}){
  const safeAction = String(action || "").trim();
  const current = normalizeGeometryInstrumentsState(state);

  if (safeAction === "set-ruler") {
    return { patch: { state: patchRuler(current, payload) } };
  }

  if (safeAction === "toggle-ruler") {
    return { patch: { state: patchRuler(current, { enabled: payload?.enabled ?? !current.ruler.enabled }) } };
  }

  if (safeAction === "move-ruler") {
    return { patch: { state: patchRuler(current, { x: payload?.x, y: payload?.y }) } };
  }

  if (safeAction === "nudge-ruler") {
    const sceneWidth = Math.max(1, Number(payload?.sceneWidth) || 1);
    const sceneHeight = Math.max(1, Number(payload?.sceneHeight) || 1);
    const dx = Number(payload?.dxPx) || 0;
    const dy = Number(payload?.dyPx) || 0;
    return {
      patch: {
        state: patchRuler(current, {
          x: current.ruler.x + dx / sceneWidth,
          y: current.ruler.y + dy / sceneHeight
        })
      }
    };
  }

  if (safeAction === "rotate-ruler") {
    return { patch: { state: patchRuler(current, { rotation: payload?.rotation }) } };
  }

  if (safeAction === "resize-ruler") {
    return { patch: { state: patchRuler(current, { lengthUnits: payload?.lengthUnits }) } };
  }

  if (safeAction === "set-ruler-unit-size") {
    return { patch: { state: patchRulerUnitSizePreservingLength(current, payload?.unitSize) } };
  }

  if (safeAction === "set-set-square") {
    return { patch: { state: patchSetSquare(current, payload) } };
  }

  if (safeAction === "toggle-set-square") {
    return { patch: { state: patchSetSquare(current, { enabled: payload?.enabled ?? !current.setSquare.enabled }) } };
  }

  if (safeAction === "move-set-square") {
    return { patch: { state: patchSetSquare(current, { x: payload?.x, y: payload?.y }) } };
  }

  if (safeAction === "nudge-set-square") {
    const sceneWidth = Math.max(1, Number(payload?.sceneWidth) || 1);
    const sceneHeight = Math.max(1, Number(payload?.sceneHeight) || 1);
    const dx = Number(payload?.dxPx) || 0;
    const dy = Number(payload?.dyPx) || 0;
    return {
      patch: {
        state: patchSetSquare(current, {
          x: current.setSquare.x + dx / sceneWidth,
          y: current.setSquare.y + dy / sceneHeight
        })
      }
    };
  }

  if (safeAction === "rotate-set-square") {
    return { patch: { state: patchSetSquare(current, { rotation: payload?.rotation }) } };
  }

  if (safeAction === "resize-set-square") {
    return {
      patch: {
        state: patchSetSquare(current, {
          horizontalLength: payload?.horizontalLength,
          verticalLength: payload?.verticalLength
        })
      }
    };
  }

  return null;
}
