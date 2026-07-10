import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  cloneDrawingLayerState,
  createDrawingLayerProjectorState,
  createInitialDrawingLayerState,
  normalizeDrawingLayerState
} from "./model.js";
import { createDrawingLayerControlPanel } from "./control.js";
import { renderDrawingLayerProjector } from "./projector.js";

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function cycleArrowMode(mode){
  const modes = ["none", "end", "start", "both"];
  const index = modes.indexOf(String(mode || "none"));
  return modes[(index + 1 + modes.length) % modes.length];
}

function updateShape(state, shapeId, updater){
  const safeShapeId = String(shapeId || "").trim();
  if (!safeShapeId) return state;
  return normalizeDrawingLayerState({
    ...state,
    shapes: state.shapes.map((shape) => (
      shape.id === safeShapeId ? updater(shape) : shape
    ))
  });
}

function applyPointPatch(point, fallback = {}){
  return {
    x: clamp(point?.x ?? fallback.x, -100000, 100000),
    y: clamp(point?.y ?? fallback.y, -100000, 100000)
  };
}

function normalizeLayoutPatch(layout = {}){
  const x = Number(layout.x);
  const y = Number(layout.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    width: Math.max(0.0001, Math.abs(Number(layout.width) || 0.0001)),
    height: Math.max(0.0001, Math.abs(Number(layout.height) || 0.0001))
  };
}

function hasOwn(object, key){
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function applyStylePatchToState(state, stylePatch = {}){
  const hasColor = hasOwn(stylePatch, "color");
  const hasFill = hasOwn(stylePatch, "fill");
  const hasWidth = hasOwn(stylePatch, "width");
  const width = clamp(stylePatch.width, 1, 96);
  let didApply = false;

  const paths = state.paths.map((path) => {
    let nextPath = path;
    if (hasColor) {
      nextPath = { ...nextPath, color: stylePatch.color };
      didApply = true;
    }
    if (hasWidth) {
      nextPath = { ...nextPath, width };
      didApply = true;
    }
    return nextPath;
  });

  const shapes = state.shapes.map((shape) => {
    let nextShape = shape;
    if (hasColor) {
      nextShape = { ...nextShape, color: stylePatch.color };
      didApply = true;
    }
    if (hasWidth) {
      nextShape = { ...nextShape, width };
      didApply = true;
    }
    if (hasFill && shape.kind !== "line") {
      nextShape = { ...nextShape, fill: stylePatch.fill };
      didApply = true;
    }
    return nextShape;
  });

  if (!didApply) return null;
  return normalizeDrawingLayerState({
    ...state,
    paths,
    shapes
  });
}

export const drawingLayerTeacherTool = defineTeacherTool({
  id: "drawing-layer",
  label: "Dessin",
  icon: "gesture",
  description: "Calque de dessin créé depuis la drawbar.",
  hiddenFromPicker: true,

  defaultLayout: { x: 0.18, y: 0.18, width: 0.28, height: 0.18 },
  minLayout: { width: 0.03, height: 0.03 },
  interaction: {
    moveMode: "body",
    resize: true,
    canCollapse: false,
    canStage: false
  },

  createInitialState(){
    return createInitialDrawingLayerState();
  },

  createProjectorState({ state } = {}){
    return createDrawingLayerProjectorState({ state });
  },

  cloneState({ state } = {}){
    return cloneDrawingLayerState(state);
  },

  applyAction({ action, payload = {}, state } = {}){
    const safeState = normalizeDrawingLayerState(state);
    const safeAction = String(action || "").trim();

    if (safeAction === "set-rotation") {
      return {
        patch: {
          state: normalizeDrawingLayerState({
            ...safeState,
            rotation: clamp(payload.rotation, -3600, 3600)
          })
        }
      };
    }

    if (safeAction === "move-shape-point") {
      const shapeId = String(payload.shapeId || "").trim();
      const pointIndex = Math.trunc(Number(payload.pointIndex) || 0);
      const nextState = updateShape(safeState, shapeId, (shape) => {
        const points = shape.points.slice();
        if (!points[pointIndex]) return shape;
        points[pointIndex] = applyPointPatch(payload.point, points[pointIndex]);
        return { ...shape, points };
      });
      return { patch: { state: nextState } };
    }

    if (safeAction === "set-line-geometry") {
      const nextState = normalizeDrawingLayerState(payload.state);
      const hasSingleLine = nextState.paths.length === 0
        && nextState.shapes.length === 1
        && nextState.shapes[0]?.kind === "line";
      if (!hasSingleLine) return null;
      return {
        patch: {
          layout: normalizeLayoutPatch(payload.layout),
          state: nextState
        }
      };
    }

    if (safeAction === "set-drawing-geometry") {
      return {
        patch: {
          layout: normalizeLayoutPatch(payload.layout),
          state: normalizeDrawingLayerState(payload.state)
        }
      };
    }

    if (safeAction === "set-shape-points") {
      const shapeId = String(payload.shapeId || "").trim();
      const points = Array.isArray(payload.points) ? payload.points.map(applyPointPatch) : [];
      const nextState = updateShape(safeState, shapeId, (shape) => ({ ...shape, points }));
      return { patch: { state: nextState } };
    }

    if (safeAction === "apply-drawing-style") {
      const nextState = applyStylePatchToState(safeState, payload);
      return nextState ? { patch: { state: nextState } } : null;
    }

    if (safeAction === "cycle-line-arrow") {
      const shapeId = String(payload.shapeId || "").trim();
      const nextState = updateShape(safeState, shapeId, (shape) => (
        shape.kind === "line" ? { ...shape, arrowMode: cycleArrowMode(shape.arrowMode) } : shape
      ));
      return { patch: { state: nextState } };
    }

    return null;
  },

  createControlPanel: createDrawingLayerControlPanel,
  renderProjector: renderDrawingLayerProjector
});

export default drawingLayerTeacherTool;
