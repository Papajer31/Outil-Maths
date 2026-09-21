import { EDITABLE_BACKGROUND_RENDER_BASE_SCALE } from "../widgets/background/tool.js";
import { normalizeSurfaceState } from "./state.js";

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

export function getSurfaceSnapDescriptor(rawSurface = {}){
  const surface = normalizeSurfaceState(rawSurface);
  if (!surface.snap.enabled) return null;
  const bg = surface.background;
  if (bg.backgroundMode !== "preset") return null;
  const scaleFor = (value) => (Number(value) || 1) * EDITABLE_BACKGROUND_RENDER_BASE_SCALE;

  if (bg.background === "small-grid") {
    const step = 20 * scaleFor(bg.smallGridScale);
    return { type: "rect", stepX: step, stepY: step, offsetX: 0, offsetY: 0 };
  }
  if (bg.background === "dotted") {
    const step = 20 * scaleFor(bg.dottedScale);
    return { type: "rect", stepX: step, stepY: step, offsetX: step / 2, offsetY: step / 2 };
  }
  if (bg.background === "lines") {
    const step = 32 * scaleFor(bg.linesScale);
    return { type: "lines", stepY: step, offsetY: 0 };
  }
  if (bg.background === "seyes") {
    const scale = scaleFor(bg.seyesScale);
    return { type: "rect", stepX: 32 * scale, stepY: 8 * scale, offsetX: 0, offsetY: 0 };
  }
  if (bg.background === "dotted-60") {
    const x = 20 * scaleFor(bg.dotted60Scale);
    const y = x * 0.8660254;
    return { type: "triangular", stepX: x, stepY: y };
  }
  return null;
}

export function snapSurfacePoint(point = {}, rawSurface = {}){
  const descriptor = getSurfaceSnapDescriptor(rawSurface);
  const x = Number(point.x) || 0;
  const y = Number(point.y) || 0;
  if (!descriptor) return { x, y };

  if (descriptor.type === "lines") {
    return { x, y: Math.round((y - descriptor.offsetY) / descriptor.stepY) * descriptor.stepY + descriptor.offsetY };
  }
  if (descriptor.type === "rect") {
    return {
      x: Math.round((x - descriptor.offsetX) / descriptor.stepX) * descriptor.stepX + descriptor.offsetX,
      y: Math.round((y - descriptor.offsetY) / descriptor.stepY) * descriptor.stepY + descriptor.offsetY
    };
  }
  if (descriptor.type === "triangular") {
    const row = Math.round(y / descriptor.stepY);
    const rowOffset = Math.abs(row % 2) ? descriptor.stepX / 2 : 0;
    return {
      x: Math.round((x - rowOffset) / descriptor.stepX) * descriptor.stepX + rowOffset,
      y: row * descriptor.stepY
    };
  }
  return { x: clamp(x, -1e9, 1e9), y: clamp(y, -1e9, 1e9) };
}
