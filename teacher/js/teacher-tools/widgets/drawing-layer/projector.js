import { normalizeDrawingLayerState } from "./model.js";

function escapeAttr(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getPathD(points = []){
  if (!points.length) return "";
  const [first, ...rest] = points;
  if (!rest.length) return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} l 0.1 0`;
  return [
    `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`,
    ...rest.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
  ].join(" ");
}

function getPolygonPoints(points = []){
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function getHitStrokeWidth(width){
  return (Number(width) || 1) + 14;
}

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function isTransparentSvgColor(value){
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "none" || raw === "transparent") return true;
  const rgba = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(/[,\s/]+/).filter(Boolean);
    return parts.length >= 4 && Number(parts[3]) <= 0.001;
  }
  const hex = raw.match(/^#([0-9a-f]{8})$/i);
  return Boolean(hex && parseInt(hex[1].slice(6, 8), 16) <= 0);
}

function getSvgFill(value){
  return isTransparentSvgColor(value) ? "none" : String(value);
}

const LINE_ARROW_LENGTH_STROKE_FACTOR = 5.2;
const LINE_ARROW_HEIGHT_STROKE_FACTOR = 4.2;
const LINE_ARROW_RETURN_RATIO = 0.7;
const LINE_ARROW_MIN_LENGTH = 14;
const LINE_ARROW_MIN_HEIGHT = 10;
const LINE_ARROW_MAX_LENGTH = 156;
const LINE_ARROW_MAX_HEIGHT = 114;

function getArrowMetrics(width){
  const strokeWidth = Math.max(1, Number(width) || 1);
  return {
    length: clamp(strokeWidth * LINE_ARROW_LENGTH_STROKE_FACTOR, LINE_ARROW_MIN_LENGTH, LINE_ARROW_MAX_LENGTH),
    height: clamp(strokeWidth * LINE_ARROW_HEIGHT_STROKE_FACTOR, LINE_ARROW_MIN_HEIGHT, LINE_ARROW_MAX_HEIGHT)
  };
}

function getLineVector(a, b){
  const dx = Number(b.x) - Number(a.x);
  const dy = Number(b.y) - Number(a.y);
  const length = Math.hypot(dx, dy);
  if (!Number.isFinite(length) || length <= 0.001) {
    return { length: 0, ux: 1, uy: 0, nx: 0, ny: 1 };
  }
  const ux = dx / length;
  const uy = dy / length;
  return {
    length,
    ux,
    uy,
    nx: -uy,
    ny: ux
  };
}

function offsetPoint(point, ux, uy, distance){
  return {
    x: Number(point.x) + ux * distance,
    y: Number(point.y) + uy * distance
  };
}

function formatSvgPoint(point){
  return `${point.x.toFixed(1)},${point.y.toFixed(1)}`;
}

function getArrowPolygonPoints(tip, direction, metrics){
  const halfHeight = metrics.height / 2;
  const base = offsetPoint(tip, -direction.ux, -direction.uy, metrics.length);
  const notch = offsetPoint(tip, -direction.ux, -direction.uy, metrics.length * LINE_ARROW_RETURN_RATIO);
  const normal = { x: -direction.uy, y: direction.ux };
  return [
    offsetPoint(base, normal.x, normal.y, halfHeight),
    tip,
    offsetPoint(base, -normal.x, -normal.y, halfHeight),
    notch
  ];
}

function renderLineArrow(tip, direction, metrics, shape){
  const points = getArrowPolygonPoints(tip, direction, metrics)
    .map(formatSvgPoint)
    .join(" ");
  return `
    <polygon
      class="ttp-drawing-layer-shape ttp-drawing-layer-line-arrow"
      points="${escapeAttr(points)}"
      fill="${escapeAttr(shape.color)}"
      opacity="${escapeAttr(shape.opacity)}"
    ></polygon>
  `;
}

function renderLineShape(shape){
  const [a, b] = shape.points;
  if (!a || !b) return "";
  const arrowStart = shape.arrowMode === "start" || shape.arrowMode === "both";
  const arrowEnd = shape.arrowMode === "end" || shape.arrowMode === "both";
  const vector = getLineVector(a, b);
  const arrow = getArrowMetrics(shape.width);
  const hasArrow = arrowStart || arrowEnd;
  const maxInset = Math.max(0, vector.length / (arrowStart && arrowEnd ? 2 : 1) - 0.5);
  const arrowInset = Math.min(arrow.length * LINE_ARROW_RETURN_RATIO, maxInset);
  const visibleStart = arrowStart ? offsetPoint(a, vector.ux, vector.uy, arrowInset) : a;
  const visibleEnd = arrowEnd ? offsetPoint(b, -vector.ux, -vector.uy, arrowInset) : b;
  const lineCap = hasArrow ? "butt" : "round";
  const radius = Math.max(0.5, (Number(shape.width) || 1) / 2);
  return `
    <line
      class="ttp-drawing-layer-hit-path"
      x1="${escapeAttr(a.x.toFixed(1))}"
      y1="${escapeAttr(a.y.toFixed(1))}"
      x2="${escapeAttr(b.x.toFixed(1))}"
      y2="${escapeAttr(b.y.toFixed(1))}"
      stroke-width="${escapeAttr(getHitStrokeWidth(shape.width))}"
    ></line>
    <line
      class="ttp-drawing-layer-shape ttp-drawing-layer-line"
      x1="${escapeAttr(visibleStart.x.toFixed(1))}"
      y1="${escapeAttr(visibleStart.y.toFixed(1))}"
      x2="${escapeAttr(visibleEnd.x.toFixed(1))}"
      y2="${escapeAttr(visibleEnd.y.toFixed(1))}"
      stroke="${escapeAttr(shape.color)}"
      stroke-width="${escapeAttr(shape.width)}"
      stroke-linecap="${escapeAttr(lineCap)}"
      opacity="${escapeAttr(shape.opacity)}"
    ></line>
    ${hasArrow && !arrowStart ? `
      <circle class="ttp-drawing-layer-shape" cx="${escapeAttr(a.x.toFixed(1))}" cy="${escapeAttr(a.y.toFixed(1))}" r="${escapeAttr(radius.toFixed(1))}" fill="${escapeAttr(shape.color)}" opacity="${escapeAttr(shape.opacity)}"></circle>
    ` : ""}
    ${hasArrow && !arrowEnd ? `
      <circle class="ttp-drawing-layer-shape" cx="${escapeAttr(b.x.toFixed(1))}" cy="${escapeAttr(b.y.toFixed(1))}" r="${escapeAttr(radius.toFixed(1))}" fill="${escapeAttr(shape.color)}" opacity="${escapeAttr(shape.opacity)}"></circle>
    ` : ""}
    ${arrowStart ? renderLineArrow(a, { ux: -vector.ux, uy: -vector.uy }, arrow, shape) : ""}
    ${arrowEnd ? renderLineArrow(b, { ux: vector.ux, uy: vector.uy }, arrow, shape) : ""}
  `;
}

function renderEllipseShape(shape){
  const [a, b] = shape.points;
  if (!a || !b) return "";
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const w = Math.abs(b.x - a.x);
  const h = Math.abs(b.y - a.y);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const rx = Math.max(0.5, w / 2);
  const ry = Math.max(0.5, h / 2);
  return `
    <ellipse
      class="ttp-drawing-layer-hit-path"
      cx="${escapeAttr(cx.toFixed(1))}"
      cy="${escapeAttr(cy.toFixed(1))}"
      rx="${escapeAttr(rx.toFixed(1))}"
      ry="${escapeAttr(ry.toFixed(1))}"
      stroke-width="${escapeAttr(getHitStrokeWidth(shape.width))}"
    ></ellipse>
    <ellipse
      class="ttp-drawing-layer-shape"
      cx="${escapeAttr(cx.toFixed(1))}"
      cy="${escapeAttr(cy.toFixed(1))}"
      rx="${escapeAttr(rx.toFixed(1))}"
      ry="${escapeAttr(ry.toFixed(1))}"
      fill="${escapeAttr(getSvgFill(shape.fill))}"
      stroke="${escapeAttr(shape.color)}"
      stroke-width="${escapeAttr(shape.width)}"
      opacity="${escapeAttr(shape.opacity)}"
    ></ellipse>
  `;
}

function renderPolygonShape(shape){
  const points = getPolygonPoints(shape.points);
  if (!points) return "";
  return `
    <polygon
      class="ttp-drawing-layer-hit-path"
      points="${escapeAttr(points)}"
      stroke-width="${escapeAttr(getHitStrokeWidth(shape.width))}"
    ></polygon>
    <polygon
      class="ttp-drawing-layer-shape"
      points="${escapeAttr(points)}"
      fill="${escapeAttr(getSvgFill(shape.fill))}"
      stroke="${escapeAttr(shape.color)}"
      stroke-width="${escapeAttr(shape.width)}"
      stroke-linejoin="round"
      opacity="${escapeAttr(shape.opacity)}"
    ></polygon>
  `;
}

function renderShape(shape){
  if (shape.kind === "line") return renderLineShape(shape);
  if (shape.kind === "ellipse") return renderEllipseShape(shape);
  return renderPolygonShape(shape);
}

export function renderDrawingLayerProjector({ host, state } = {}){
  if (!host) return;
  const safeState = normalizeDrawingLayerState(state);
  const width = Math.max(1, safeState.width);
  const height = Math.max(1, safeState.height);
  host.innerHTML = `
    <svg
      class="ttp-drawing-layer-svg"
      viewBox="0 0 ${escapeAttr(width)} ${escapeAttr(height)}"
      preserveAspectRatio="none"
      aria-label="Calque de dessin"
    >
      <g>
        ${safeState.paths.map((path) => `
          <path
            class="ttp-drawing-layer-hit-path"
            d="${escapeAttr(getPathD(path.points))}"
            stroke-width="${escapeAttr(getHitStrokeWidth(path.width))}"
          ></path>
          <path
            class="ttp-drawing-layer-path ${path.tool === "highlighter" ? "is-highlighter" : ""}"
            d="${escapeAttr(getPathD(path.points))}"
            fill="none"
            stroke="${escapeAttr(path.color)}"
            stroke-width="${escapeAttr(path.width)}"
            stroke-linecap="round"
            stroke-linejoin="round"
            opacity="${escapeAttr(path.opacity)}"
          ></path>
        `).join("")}
        ${safeState.shapes.map(renderShape).join("")}
      </g>
    </svg>
  `;
}
