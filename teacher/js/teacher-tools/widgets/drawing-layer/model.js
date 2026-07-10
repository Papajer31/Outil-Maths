import { normalizeColorPickerValue } from "../../../../../shared/color-picker.js";

const DEFAULT_DRAWING_LAYER_STATE = Object.freeze({
  width: 320,
  height: 180,
  rotation: 0,
  paths: [],
  shapes: []
});

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function normalizeColor(value, fallback = "#111827"){
  return normalizeColorPickerValue(value, fallback);
}

function normalizeFillColor(value){
  const raw = String(value ?? "").trim();
  if (!raw || raw === "none" || raw === "transparent") return raw === "transparent" ? "transparent" : "none";
  return normalizeColor(raw, "transparent");
}

function normalizePoint(point = {}){
  return {
    x: clamp(point.x, -100000, 100000),
    y: clamp(point.y, -100000, 100000)
  };
}

function normalizePath(path = {}){
  const points = Array.isArray(path.points) ? path.points.map(normalizePoint) : [];
  return {
    id: String(path.id || `path-${Math.random().toString(36).slice(2, 8)}`),
    tool: String(path.tool || "pencil"),
    color: normalizeColor(path.color),
    width: clamp(path.width, 1, 96),
    opacity: clamp(path.opacity, 0.05, 1),
    points: points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  };
}

function normalizeArrowMode(value){
  const safe = String(value || "none").trim();
  return ["none", "end", "start", "both"].includes(safe) ? safe : "none";
}

function normalizeShapeKind(value){
  const safe = String(value || "polygon").trim();
  return ["line", "polygon", "ellipse"].includes(safe) ? safe : "polygon";
}

function normalizeShapeVariant(value, kind){
  const safe = String(value || "").trim();
  if (kind === "line") return "line";
  if (kind === "ellipse") return ["circle", "ellipse"].includes(safe) ? safe : "ellipse";
  return [
    "rectangle",
    "square",
    "diamond",
    "parallelogram",
    "trapezoid",
    "triangle-free",
    "triangle-isosceles",
    "triangle-equilateral",
    "triangle-right",
    "triangle-right-isosceles"
  ].includes(safe) ? safe : "rectangle";
}

function normalizeShape(shape = {}){
  const kind = normalizeShapeKind(shape.kind);
  const points = Array.isArray(shape.points) ? shape.points.map(normalizePoint) : [];
  const normalized = {
    id: String(shape.id || `shape-${Math.random().toString(36).slice(2, 8)}`),
    kind,
    variant: normalizeShapeVariant(shape.variant, kind),
    color: normalizeColor(shape.color),
    width: clamp(shape.width, 1, 96),
    opacity: clamp(shape.opacity, 0.05, 1),
    fill: normalizeFillColor(shape.fill),
    arrowMode: normalizeArrowMode(shape.arrowMode),
    points: points.filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
  };

  if (kind === "line") normalized.points = normalized.points.slice(0, 2);
  if (kind === "ellipse") normalized.points = normalized.points.slice(0, 2);
  return normalized;
}

export function normalizeDrawingLayerState(state = {}){
  const width = clamp(state.width, 1, 10000);
  const height = clamp(state.height, 1, 10000);
  return {
    width,
    height,
    rotation: clamp(state.rotation, -3600, 3600),
    paths: (Array.isArray(state.paths) ? state.paths : [])
      .map(normalizePath)
      .filter((path) => path.points.length > 0),
    shapes: (Array.isArray(state.shapes) ? state.shapes : [])
      .map(normalizeShape)
      .filter((shape) => {
        if (shape.kind === "line" || shape.kind === "ellipse") return shape.points.length >= 2;
        return shape.points.length >= 3;
      })
  };
}

export function createInitialDrawingLayerState(){
  return normalizeDrawingLayerState(DEFAULT_DRAWING_LAYER_STATE);
}

export function createDrawingLayerProjectorState({ state } = {}){
  return normalizeDrawingLayerState(state);
}

export function cloneDrawingLayerState(state = {}){
  return normalizeDrawingLayerState(JSON.parse(JSON.stringify(normalizeDrawingLayerState(state))));
}
