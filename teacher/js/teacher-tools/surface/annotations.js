export const ANNOTATION_COLORS = Object.freeze([
  { id: "blue", label: "Bleu", value: "#427ebe" },
  { id: "red", label: "Rouge", value: "#c00000" },
  { id: "green", label: "Vert", value: "#70ad47" },
  { id: "orange", label: "Orange", value: "#ed7d31" },
  { id: "yellow", label: "Jaune", value: "#ffc000" },
  { id: "violet", label: "Violet", value: "#7030a0" },
  { id: "pink", label: "Rose", value: "#ff66cc" },
  { id: "black", label: "Noir", value: "#000000" }
]);

export const DEFAULT_ANNOTATION_COLOR = "#c00000";
export const DEFAULT_ANNOTATION_WIDTH = 0.0045;
export const DEFAULT_ANNOTATION_ERASER_WIDTH = 0.038;
export const MIN_ANNOTATION_WIDTH = 0.002;
export const MAX_ANNOTATION_WIDTH = 0.018;
export const MIN_ANNOTATION_ERASER_WIDTH = 0.012;
export const MAX_ANNOTATION_ERASER_WIDTH = 0.09;
const MAX_HISTORY = 100;
const MAX_POINTS_PER_STROKE = 4000;
const MAX_STROKES = 700;
const DRAWING_TOOLS = new Set(["pen", "line"]);
const ALL_TOOLS = new Set(["pen", "line", "eraser"]);

function clamp01(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function clamp(value, min, max, fallback){
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function normalizeColor(value){
  const safe = String(value || "").trim().toLowerCase();
  return ANNOTATION_COLORS.some((item) => item.value === safe) ? safe : DEFAULT_ANNOTATION_COLOR;
}

function normalizeTool(value, fallback = "pen"){
  const safe = String(value || "").trim();
  return ALL_TOOLS.has(safe) ? safe : fallback;
}

function normalizeDrawingTool(value){
  const safe = String(value || "").trim();
  return DRAWING_TOOLS.has(safe) ? safe : "pen";
}

function normalizePoint(point = {}){
  return { x: clamp01(point.x), y: clamp01(point.y) };
}

function normalizeStroke(raw = {}){
  const tool = normalizeTool(raw.tool || raw.mode || "pen");
  const points = (Array.isArray(raw.points) ? raw.points : [])
    .slice(0, MAX_POINTS_PER_STROKE)
    .map(normalizePoint);
  const fallbackWidth = tool === "eraser" ? DEFAULT_ANNOTATION_ERASER_WIDTH : DEFAULT_ANNOTATION_WIDTH;
  const width = tool === "eraser"
    ? clamp(raw.width, MIN_ANNOTATION_ERASER_WIDTH, MAX_ANNOTATION_ERASER_WIDTH, fallbackWidth)
    : clamp(raw.width, MIN_ANNOTATION_WIDTH, MAX_ANNOTATION_WIDTH, fallbackWidth);
  return {
    id: String(raw.id || `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
    tool,
    color: normalizeColor(raw.color),
    width,
    points
  };
}

function normalizeHistoryEntry(entry = {}){
  const type = String(entry.type || "");
  if (type === "add") return { type, strokeId: String(entry.strokeId || "") };
  // Compatibilité avec les premières versions de la gomme qui supprimaient
  // des tracés entiers.
  if (type === "erase") {
    return {
      type,
      strokes: (Array.isArray(entry.strokes) ? entry.strokes : []).map((item) => ({
        index: Math.max(0, Math.trunc(Number(item?.index) || 0)),
        stroke: normalizeStroke(item?.stroke)
      }))
    };
  }
  if (type === "clear") {
    return { type, strokes: (Array.isArray(entry.strokes) ? entry.strokes : []).map(normalizeStroke) };
  }
  return null;
}

export function createInitialAnnotationState(){
  return {
    enabled: false,
    tool: "pen",
    lastDrawingTool: "pen",
    color: DEFAULT_ANNOTATION_COLOR,
    width: DEFAULT_ANNOTATION_WIDTH,
    eraserWidth: DEFAULT_ANNOTATION_ERASER_WIDTH,
    strokes: [],
    history: []
  };
}

export function normalizeAnnotationState(raw = {}){
  const lastDrawingTool = normalizeDrawingTool(raw.lastDrawingTool || (DRAWING_TOOLS.has(String(raw.tool || "")) ? raw.tool : "pen"));
  const tool = normalizeTool(raw.tool || lastDrawingTool, lastDrawingTool);
  return {
    enabled: raw.enabled === true,
    tool,
    lastDrawingTool: DRAWING_TOOLS.has(tool) ? tool : lastDrawingTool,
    color: normalizeColor(raw.color),
    width: clamp(raw.width, MIN_ANNOTATION_WIDTH, MAX_ANNOTATION_WIDTH, DEFAULT_ANNOTATION_WIDTH),
    eraserWidth: clamp(raw.eraserWidth, MIN_ANNOTATION_ERASER_WIDTH, MAX_ANNOTATION_ERASER_WIDTH, DEFAULT_ANNOTATION_ERASER_WIDTH),
    strokes: (Array.isArray(raw.strokes) ? raw.strokes : []).slice(-MAX_STROKES).map(normalizeStroke),
    history: (Array.isArray(raw.history) ? raw.history : [])
      .map(normalizeHistoryEntry)
      .filter(Boolean)
      .slice(-MAX_HISTORY)
  };
}

function withHistory(state, entry){
  return [...state.history, entry].slice(-MAX_HISTORY);
}

export function applyAnnotationAction(rawState, action, payload = {}){
  const state = normalizeAnnotationState(rawState);
  const safeAction = String(action || "").trim();

  if (safeAction === "set-enabled") return normalizeAnnotationState({ ...state, enabled: payload.enabled === true });
  if (safeAction === "set-tool") {
    const requested = normalizeTool(payload.tool, state.lastDrawingTool);
    return normalizeAnnotationState({
      ...state,
      tool: requested,
      lastDrawingTool: DRAWING_TOOLS.has(requested) ? requested : state.lastDrawingTool
    });
  }
  if (safeAction === "set-color") {
    const drawingTool = state.tool === "eraser" ? state.lastDrawingTool : state.tool;
    return normalizeAnnotationState({ ...state, color: payload.color, tool: drawingTool, lastDrawingTool: drawingTool });
  }
  if (safeAction === "set-width") {
    const drawingTool = state.tool === "eraser" ? state.lastDrawingTool : state.tool;
    return normalizeAnnotationState({ ...state, width: payload.width, tool: drawingTool, lastDrawingTool: drawingTool });
  }
  if (safeAction === "set-eraser-width") return normalizeAnnotationState({ ...state, eraserWidth: payload.width, tool: "eraser" });

  if (safeAction === "add-stroke") {
    const requestedTool = normalizeTool(payload.stroke?.tool || state.tool, state.tool);
    const stroke = normalizeStroke({
      ...payload.stroke,
      tool: requestedTool,
      color: payload.stroke?.color || state.color,
      width: payload.stroke?.width || (requestedTool === "eraser" ? state.eraserWidth : state.width)
    });
    if (!stroke.points.length) return state;
    return normalizeAnnotationState({
      ...state,
      strokes: [...state.strokes, stroke].slice(-MAX_STROKES),
      history: withHistory(state, { type: "add", strokeId: stroke.id })
    });
  }

  // Ancien comportement conservé pour pouvoir relire un état V2 déjà ouvert.
  if (safeAction === "erase-strokes") {
    const ids = new Set((Array.isArray(payload.strokeIds) ? payload.strokeIds : []).map(String));
    if (!ids.size) return state;
    const removed = [];
    const strokes = state.strokes.filter((stroke, index) => {
      if (!ids.has(stroke.id)) return true;
      removed.push({ index, stroke });
      return false;
    });
    if (!removed.length) return state;
    return normalizeAnnotationState({ ...state, strokes, history: withHistory(state, { type: "erase", strokes: removed }) });
  }

  if (safeAction === "clear") {
    if (!state.strokes.length) return state;
    return normalizeAnnotationState({ ...state, strokes: [], history: withHistory(state, { type: "clear", strokes: state.strokes }) });
  }

  if (safeAction === "undo") {
    if (!state.history.length) return state;
    const history = state.history.slice();
    const entry = history.pop();
    let strokes = state.strokes.slice();
    if (entry.type === "add") {
      strokes = strokes.filter((stroke) => stroke.id !== entry.strokeId);
    } else if (entry.type === "erase") {
      entry.strokes
        .slice()
        .sort((a, b) => a.index - b.index)
        .forEach(({ index, stroke }) => strokes.splice(Math.min(index, strokes.length), 0, stroke));
    } else if (entry.type === "clear") {
      strokes = entry.strokes.slice();
    }
    return normalizeAnnotationState({ ...state, strokes, history });
  }

  return state;
}
