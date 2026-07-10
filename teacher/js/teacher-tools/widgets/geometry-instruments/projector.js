import {
  GEOMETRY_INSTRUMENT_RULER_CLASSIC,
  GEOMETRY_INSTRUMENT_RULER_SIMPLE,
  GEOMETRY_INSTRUMENT_RULER_GRID,
  GEOMETRY_INSTRUMENT_SET_SQUARE_METAL,
  GEOMETRY_INSTRUMENT_SET_SQUARE_PLASTIC,
  RULER_BIG_NUDGE_PX,
  RULER_LENGTH_UNITS_MAX,
  RULER_LENGTH_UNITS_MIN,
  RULER_NUDGE_PX,
  RULER_UNIT_SIZE_MAX,
  RULER_UNIT_SIZE_MIN,
  SET_SQUARE_BIG_NUDGE_PX,
  SET_SQUARE_NUDGE_PX,
  SET_SQUARE_SIDE_MAX,
  SET_SQUARE_SIDE_MIN,
  normalizeGeometryInstrumentsState
} from "./model.js";

const RULER_ZERO_OFFSET_PX = 21;
const RULER_END_PADDING_PX = 18;
const RULER_WIDTH_MIN_PX = 300;
const RULER_TOP_EDGE_Y = 0;
const RULER_SLIDER_WIDTH_MIN = 90;
const RULER_SLIDER_WIDTH_MAX = 230;
const RULER_GRID_HEIGHT_PX = 132;
const SET_SQUARE_METAL_THICKNESS_PX = 84;
const SET_SQUARE_METAL_ROTATE_HANDLE_EDGE_INSET_PX = 28;
const SET_SQUARE_METAL_ANGLE_PILL_OFFSET_X = -32;
const SET_SQUARE_METAL_ANGLE_PILL_OFFSET_Y = -32;
const SET_SQUARE_PLASTIC_FRAME_PX = 64;
const SET_SQUARE_PLASTIC_ANGLE_MARK_STROKE_WIDTH = 2.4;
const SET_SQUARE_PLASTIC_ANGLE_MARK_EDGE_GAP_PX = 1.2;
const SET_SQUARE_PLASTIC_ROTATE_HANDLE_X_RATIO = 0.78;
const SET_SQUARE_PLASTIC_ROTATE_HANDLE_Y_RATIO = 0.46;
const SET_SQUARE_PLASTIC_ROTATE_HANDLE_MIN_INSET_PX = 28;
const SET_SQUARE_PLASTIC_ROTATE_HANDLE_RIGHT_INSET_RATIO = 0.80;

function escapeAttr(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function clampBetween(value, a, b){
  return clamp(value, Math.min(a, b), Math.max(a, b));
}

function normalizeDegrees(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return ((number % 360) + 360) % 360;
}

function getSignedAngleDelta(from, to){
  let delta = normalizeDegrees(to) - normalizeDegrees(from);
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  return delta;
}

function formatPercent(value){
  return `${(Number(value || 0) * 100).toFixed(4)}%`;
}

function parseCssPercent(value){
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (raw.endsWith("%")) {
    const number = Number(raw.slice(0, -1));
    return Number.isFinite(number) ? number / 100 : null;
  }
  const number = Number(raw);
  return Number.isFinite(number) ? number : null;
}

function hasOwn(object, key){
  return Object.prototype.hasOwnProperty.call(object || {}, key);
}

function isLocked({ widget, scene } = {}){
  return widget?.locked === true || scene?.scene?.locked === true || scene?.locked === true;
}

function getRulerHeight(ruler){
  if (ruler.type === GEOMETRY_INSTRUMENT_RULER_GRID) {
    return RULER_GRID_HEIGHT_PX;
  }
  return ruler.type === GEOMETRY_INSTRUMENT_RULER_SIMPLE ? 102 : 110;
}

function getRulerMeasureLengthPx(ruler){
  const unitSize = Math.max(1, Number(ruler.unitSize) || 1);
  const lengthUnits = clampRulerLengthUnits(ruler.lengthUnits, unitSize);
  return Math.max(1, unitSize * lengthUnits);
}

function getRulerWidthPx(ruler){
  return RULER_ZERO_OFFSET_PX + getRulerMeasureLengthPx(ruler) + RULER_END_PADDING_PX;
}

function getRulerLengthUnitsMin(unitSize){
  const measureMinPx = Math.max(1, RULER_WIDTH_MIN_PX - RULER_ZERO_OFFSET_PX - RULER_END_PADDING_PX);
  return Math.max(RULER_LENGTH_UNITS_MIN, measureMinPx / Math.max(1, Number(unitSize) || 1));
}

function clampRulerLengthUnits(value, unitSize, fallback = RULER_LENGTH_UNITS_MIN){
  const minLengthUnits = getRulerLengthUnitsMin(unitSize);
  const number = Number(value);
  const safeValue = Number.isFinite(number) ? number : fallback;
  return clamp(safeValue, minLengthUnits, RULER_LENGTH_UNITS_MAX);
}

function getRulerRenderState(ruler){
  const unitSize = clamp(Number(ruler.unitSize), RULER_UNIT_SIZE_MIN, RULER_UNIT_SIZE_MAX);
  return {
    ...ruler,
    unitSize,
    lengthUnits: clampRulerLengthUnits(ruler.lengthUnits, unitSize)
  };
}

function getRulerSliderWidthPx(widthPx){
  return clamp(Number(widthPx) - RULER_ZERO_OFFSET_PX - 128, RULER_SLIDER_WIDTH_MIN, RULER_SLIDER_WIDTH_MAX);
}

function getRulerLabel(type){
  if (type === GEOMETRY_INSTRUMENT_RULER_SIMPLE) return "Règle simple";
  if (type === GEOMETRY_INSTRUMENT_RULER_GRID) return "Règle quadrillée";
  return "Règle classique";
}

function getRulerOriginPoint(rulerElement){
  const layer = rulerElement?.closest?.(".ttp-geometry-layer");
  const layerRect = layer?.getBoundingClientRect?.();
  const rulerX = parseCssPercent(rulerElement?.style?.getPropertyValue?.("--ruler-x"));
  const rulerY = parseCssPercent(rulerElement?.style?.getPropertyValue?.("--ruler-y"));
  if (layerRect && Number.isFinite(rulerX) && Number.isFinite(rulerY)) {
    return {
      x: layerRect.left + layerRect.width * rulerX,
      y: layerRect.top + layerRect.height * rulerY
    };
  }

  const rect = rulerElement?.getBoundingClientRect?.();
  if (!rect) return null;
  const width = Number(rulerElement?.dataset?.rulerLength) || rect.width;
  const zeroOffset = Number(rulerElement?.dataset?.rulerZeroOffset) || RULER_ZERO_OFFSET_PX;
  const scaleX = rect.width / Math.max(1, width);
  return {
    x: rect.left + zeroOffset * scaleX,
    y: rect.top
  };
}

function getPointAngleFromOrigin(event, origin){
  if (!origin) return 0;
  const dx = (Number(event.clientX) || 0) - origin.x;
  const dy = (Number(event.clientY) || 0) - origin.y;
  return normalizeDegrees(Math.atan2(dy, dx) * 180 / Math.PI);
}

function getLayerMetrics(host){
  const layer = host?.querySelector?.(".ttp-geometry-layer");
  const rect = layer?.getBoundingClientRect?.();
  const scaleX = rect?.width && layer?.offsetWidth ? rect.width / Math.max(1, layer.offsetWidth) : 1;
  const scaleY = rect?.height && layer?.offsetHeight ? rect.height / Math.max(1, layer.offsetHeight) : scaleX;
  const scale = Number.isFinite(scaleX) && scaleX > 0
    ? scaleX
    : (Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1);
  return {
    layer,
    rect,
    width: Math.max(1, Number(rect?.width) || 1),
    height: Math.max(1, Number(rect?.height) || 1),
    scale
  };
}

function getRulerAxis(rotation){
  const radians = normalizeDegrees(rotation) * Math.PI / 180;
  return { x: Math.cos(radians), y: Math.sin(radians) };
}

function getRulerTypeFromElement(rulerElement){
  const type = rulerElement?.dataset?.rulerType;
  if (type === GEOMETRY_INSTRUMENT_RULER_SIMPLE) return GEOMETRY_INSTRUMENT_RULER_SIMPLE;
  if (type === GEOMETRY_INSTRUMENT_RULER_GRID) return GEOMETRY_INSTRUMENT_RULER_GRID;
  return GEOMETRY_INSTRUMENT_RULER_CLASSIC;
}

function getRulerHeightFromElement(rulerElement){
  const height = Number(rulerElement?.dataset?.rulerHeight);
  if (Number.isFinite(height) && height > 0) return height;
  return getRulerHeight({ type: getRulerTypeFromElement(rulerElement) });
}

function syncRulerScaleDom(rulerElement, patch = {}){
  if (!rulerElement) return;
  const currentUnitSize = clamp(
    Number(rulerElement.dataset.rulerUnitSize),
    RULER_UNIT_SIZE_MIN,
    RULER_UNIT_SIZE_MAX
  );
  const currentLengthUnits = clamp(
    Number(rulerElement.dataset.rulerLengthUnits),
    getRulerLengthUnitsMin(currentUnitSize),
    RULER_LENGTH_UNITS_MAX
  );
  const nextUnitSize = clamp(
    Number(patch.unitSize ?? currentUnitSize),
    RULER_UNIT_SIZE_MIN,
    RULER_UNIT_SIZE_MAX
  );
  const nextLengthUnits = hasOwn(patch, "lengthUnits")
    ? clampRulerLengthUnits(patch.lengthUnits, nextUnitSize, currentLengthUnits)
    : hasOwn(patch, "unitSize")
      ? clampRulerLengthUnits((currentUnitSize * currentLengthUnits) / Math.max(1, nextUnitSize), nextUnitSize, currentLengthUnits)
      : currentLengthUnits;
  const ruler = {
    type: getRulerTypeFromElement(rulerElement),
    unitSize: nextUnitSize,
    lengthUnits: nextLengthUnits
  };
  const height = getRulerHeight(ruler);
  const measureLengthPx = getRulerMeasureLengthPx(ruler);
  const widthPx = getRulerWidthPx(ruler);
  const sliderWidthPx = getRulerSliderWidthPx(widthPx);
  rulerElement.dataset.rulerHeight = String(height);
  rulerElement.dataset.rulerUnitSize = String(ruler.unitSize);
  rulerElement.dataset.rulerLengthUnits = String(ruler.lengthUnits);
  rulerElement.dataset.rulerMeasureLength = String(measureLengthPx);
  rulerElement.dataset.rulerLength = String(widthPx);
  rulerElement.style.setProperty("--ruler-width", `${widthPx}px`);
  rulerElement.style.setProperty("--ruler-height", `${height}px`);
  rulerElement.style.setProperty("--ruler-zero-offset", `${RULER_ZERO_OFFSET_PX}px`);
  rulerElement.style.setProperty("--ruler-slider-width", `${sliderWidthPx}px`);

  const svg = rulerElement.querySelector(".ttp-geo-ruler-svg");
  if (!svg) return;
  const template = document.createElement("template");
  template.innerHTML = renderRulerSvg(ruler, widthPx, height).trim();
  const nextSvg = template.content.firstElementChild;
  if (nextSvg) svg.replaceWith(nextSvg);
}

function renderClassicRulerSvg(ruler, widthPx, height){
  const unit = Math.max(1, Number(ruler.unitSize) || 1);
  const measureLengthPx = getRulerMeasureLengthPx(ruler);
  const totalTicks = Math.floor((measureLengthPx / unit) * 10 + 0.0001);
  const edgeY = RULER_TOP_EDGE_Y;
  const zeroX = RULER_ZERO_OFFSET_PX;
  const bodyWidth = Math.max(1, widthPx - 1);
  const bodyHeight = Math.max(1, height - 1);
  const lines = [];
  const labels = [];

  for (let tick = 0; tick <= totalTicks; tick += 1) {
    const x = zeroX + tick * unit / 10;
    if (x > zeroX + measureLengthPx + 0.001) continue;
    const isCm = tick % 10 === 0;
    const isHalf = tick % 5 === 0;
    const tickHeight = isCm ? 34 : (isHalf ? 24 : 14);
    lines.push(`<line class="ttp-geo-ruler-tick${isCm ? " is-major" : isHalf ? " is-medium" : " is-minor"}" x1="${x.toFixed(2)}" y1="${edgeY}" x2="${x.toFixed(2)}" y2="${(edgeY + tickHeight).toFixed(2)}"></line>`);
    if (isCm) {
      const label = String(tick / 10);
      labels.push(`<text class="ttp-geo-ruler-number" x="${x.toFixed(2)}" y="${(edgeY + 48).toFixed(2)}">${escapeAttr(label)}</text>`);
    }
  }

  return `
    <svg class="ttp-geo-ruler-svg is-classic" viewBox="0 0 ${escapeAttr(widthPx.toFixed(2))} ${escapeAttr(height)}" preserveAspectRatio="none" aria-hidden="true">
      <rect class="ttp-geo-ruler-body" x="0.5" y="0.5" width="${escapeAttr(bodyWidth.toFixed(2))}" height="${escapeAttr(bodyHeight.toFixed(2))}" rx="5.5" ry="5.5"></rect>
      <g class="ttp-geo-ruler-ticks">${lines.join("")}</g>
      <g class="ttp-geo-ruler-numbers">${labels.join("")}</g>
    </svg>
  `;
}

function renderSimpleRulerSvg(ruler, widthPx, height){
  const unit = Math.max(1, Number(ruler.unitSize) || 1);
  const measureLengthPx = getRulerMeasureLengthPx(ruler);
  const unitCount = Math.ceil(measureLengthPx / unit);
  const edgeY = RULER_TOP_EDGE_Y;
  const zeroX = RULER_ZERO_OFFSET_PX;
  const blockTop = edgeY;
  const blockHeight = 15;
  const bodyWidth = Math.max(1, widthPx - 1);
  const bodyHeight = Math.max(1, height - 1);
  const blocks = [];
  const lines = [];

  for (let index = 0; index < unitCount; index += 1) {
    const measureX = index * unit;
    const x = zeroX + measureX;
    const width = Math.max(0, Math.min(unit, measureLengthPx - measureX));
    if (width <= 0) continue;
    blocks.push(`<rect class="ttp-geo-ruler-simple-unit ${index % 2 === 0 ? "is-green" : "is-blue"}" x="${x.toFixed(2)}" y="${blockTop}" width="${width.toFixed(2)}" height="${blockHeight}"></rect>`);
  }

  for (let tick = 0; tick <= Math.floor(measureLengthPx / unit + 0.0001); tick += 1) {
    const x = zeroX + tick * unit;
    if (x > zeroX + measureLengthPx + 0.001) continue;
    const isMajor = tick === 0 || tick % 10 === 0;
    const isMedium = !isMajor && tick % 5 === 0;
    const tickHeight = isMajor ? 38 : (isMedium ? 26 : 15);
    lines.push(`<line class="ttp-geo-ruler-tick${isMajor ? " is-major" : isMedium ? " is-medium" : " is-minor"}" x1="${x.toFixed(2)}" y1="${edgeY}" x2="${x.toFixed(2)}" y2="${(edgeY + tickHeight).toFixed(2)}"></line>`);
  }

  return `
    <svg class="ttp-geo-ruler-svg is-simple" viewBox="0 0 ${escapeAttr(widthPx.toFixed(2))} ${escapeAttr(height)}" preserveAspectRatio="none" aria-hidden="true">
      <rect class="ttp-geo-ruler-simple-back" x="0.5" y="0.5" width="${escapeAttr(bodyWidth.toFixed(2))}" height="${escapeAttr(bodyHeight.toFixed(2))}" rx="4.5" ry="4.5"></rect>
      <g class="ttp-geo-ruler-simple-units">${blocks.join("")}</g>
      <g class="ttp-geo-ruler-ticks">${lines.join("")}</g>
    </svg>
  `;
}

function renderGridRulerSvg(ruler, widthPx, height){
  const unit = Math.max(1, Number(ruler.unitSize) || 1);
  const halfUnit = unit / 2;
  const measureLengthPx = getRulerMeasureLengthPx(ruler);
  const edgeY = RULER_TOP_EDGE_Y;
  const zeroX = RULER_ZERO_OFFSET_PX;
  const bodyWidth = Math.max(1, widthPx - 1);
  const bodyHeight = Math.max(1, height - 1);
  const maxX = zeroX + measureLengthPx;
  const verticals = [];
  const horizontals = [];
  const labels = [];
  const columns = Math.floor(measureLengthPx / halfUnit + 0.0001);
  const rows = Math.floor(height / halfUnit + 0.0001);

  for (let index = 0; index <= columns; index += 1) {
    const x = zeroX + index * halfUnit;
    if (x > maxX + 0.001) continue;
    const isUnit = index % 2 === 0;
    verticals.push(`<line class="ttp-geo-ruler-grid-line${isUnit ? " is-unit" : " is-half"}" x1="${x.toFixed(2)}" y1="0" x2="${x.toFixed(2)}" y2="${height.toFixed(2)}"></line>`);
    if (isUnit) {
      const label = String(index / 2);
      labels.push(`<text class="ttp-geo-ruler-grid-number" x="${x.toFixed(2)}" y="${(edgeY + 18).toFixed(2)}">${escapeAttr(label)}</text>`);
    }
  }

  for (let index = 0; index <= rows; index += 1) {
    const y = index * halfUnit;
    if (y > height + 0.001) continue;
    const isUnit = index % 2 === 0;
    horizontals.push(`<line class="ttp-geo-ruler-grid-line${isUnit ? " is-unit" : " is-half"}" x1="${zeroX.toFixed(2)}" y1="${y.toFixed(2)}" x2="${maxX.toFixed(2)}" y2="${y.toFixed(2)}"></line>`);
  }

  return `
    <svg class="ttp-geo-ruler-svg is-grid" viewBox="0 0 ${escapeAttr(widthPx.toFixed(2))} ${escapeAttr(height.toFixed(2))}" preserveAspectRatio="none" aria-hidden="true">
      <rect class="ttp-geo-ruler-grid-body" x="0.5" y="0.5" width="${escapeAttr(bodyWidth.toFixed(2))}" height="${escapeAttr(bodyHeight.toFixed(2))}" rx="3.5" ry="3.5"></rect>
      <g class="ttp-geo-ruler-grid-lines">${horizontals.join("")}${verticals.join("")}</g>
      <g class="ttp-geo-ruler-grid-numbers">${labels.join("")}</g>
    </svg>
  `;
}

function renderRulerSvg(ruler, widthPx, height){
  if (ruler.type === GEOMETRY_INSTRUMENT_RULER_SIMPLE) return renderSimpleRulerSvg(ruler, widthPx, height);
  if (ruler.type === GEOMETRY_INSTRUMENT_RULER_GRID) return renderGridRulerSvg(ruler, widthPx, height);
  return renderClassicRulerSvg(ruler, widthPx, height);
}


function getSetSquareLabel(type){
  if (type === GEOMETRY_INSTRUMENT_SET_SQUARE_METAL) return "Équerre métal";
  return "Équerre plastique";
}

function getSetSquareFrame(setSquare){
  const horizontal = clamp(Number(setSquare.horizontalLength) || 0, SET_SQUARE_SIDE_MIN, SET_SQUARE_SIDE_MAX);
  const vertical = clamp(Number(setSquare.verticalLength) || 0, SET_SQUARE_SIDE_MIN, SET_SQUARE_SIDE_MAX);
  const type = setSquare.type === GEOMETRY_INSTRUMENT_SET_SQUARE_METAL
    ? GEOMETRY_INSTRUMENT_SET_SQUARE_METAL
    : GEOMETRY_INSTRUMENT_SET_SQUARE_PLASTIC;

  if (type === GEOMETRY_INSTRUMENT_SET_SQUARE_METAL) {
    const thickness = SET_SQUARE_METAL_THICKNESS_PX;
    return {
      type,
      horizontal,
      vertical,
      thickness,
      width: horizontal + thickness,
      height: vertical + thickness,
      pivotX: thickness,
      pivotY: thickness,
      rotationHandleX: thickness + Math.max(20, horizontal - SET_SQUARE_METAL_ROTATE_HANDLE_EDGE_INSET_PX),
      rotationHandleY: thickness / 2,
      anglePillX: thickness + SET_SQUARE_METAL_ANGLE_PILL_OFFSET_X,
      anglePillY: thickness + SET_SQUARE_METAL_ANGLE_PILL_OFFSET_Y,
      nudgeX: thickness + Math.min(84, Math.max(54, horizontal * 0.30)),
      nudgeY: thickness + Math.min(84, Math.max(54, vertical * 0.30)),
      horizontalHandleX: thickness + horizontal,
      horizontalHandleY: thickness / 2,
      verticalHandleX: thickness / 2,
      verticalHandleY: thickness + vertical
    };
  }

  const frame = SET_SQUARE_PLASTIC_FRAME_PX;
  const preferredRotationX = clampBetween(
    horizontal * SET_SQUARE_PLASTIC_ROTATE_HANDLE_X_RATIO,
    frame + SET_SQUARE_PLASTIC_ROTATE_HANDLE_MIN_INSET_PX,
    horizontal - frame * SET_SQUARE_PLASTIC_ROTATE_HANDLE_RIGHT_INSET_RATIO
  );
  return {
    type,
    horizontal,
    vertical,
    frame,
    width: horizontal,
    height: vertical,
    pivotX: 0,
    pivotY: 0,
    rotationHandleX: clamp(preferredRotationX, 16, Math.max(16, horizontal - 16)),
    rotationHandleY: frame * SET_SQUARE_PLASTIC_ROTATE_HANDLE_Y_RATIO,
    anglePillX: frame,
    anglePillY: frame,
    nudgeX: Math.max(58, horizontal * 0.34),
    nudgeY: Math.max(58, vertical * 0.34),
    horizontalHandleX: horizontal,
    horizontalHandleY: 0,
    verticalHandleX: 0,
    verticalHandleY: vertical
  };
}

function getSetSquarePositionStyle(setSquare){
  return `--set-square-x:${formatPercent(setSquare.x)};--set-square-y:${formatPercent(setSquare.y)};`;
}

function renderPlasticSetSquareSvg(setSquare, frame){
  const w = frame.horizontal;
  const h = frame.vertical;
  const border = frame.frame;
  const diagonal = Math.hypot(w, h);
  const hypotenuseOffset = border * 1.05;
  const rawInnerRight = w - (hypotenuseOffset * diagonal) / Math.max(1, h) - (w * border) / Math.max(1, h);
  const rawInnerBottom = h - (hypotenuseOffset * diagonal) / Math.max(1, w) - (h * border) / Math.max(1, w);
  const innerRight = Math.max(border, rawInnerRight);
  const innerBottom = Math.max(border, rawInnerBottom);
  const hasHole = innerRight > border + 0.75 && innerBottom > border + 0.75;
  const angleMark = Math.min(34, Math.max(20, Math.min(w, h) * 0.12));
  const angleMarkInset = SET_SQUARE_PLASTIC_ANGLE_MARK_STROKE_WIDTH / 2 + SET_SQUARE_PLASTIC_ANGLE_MARK_EDGE_GAP_PX;
  const angleMarkPath = setSquare.showRightAngleMark
    ? `<path class="ttp-geo-set-square-angle-mark" d="M ${angleMark.toFixed(2)} ${angleMarkInset.toFixed(2)} L ${angleMark.toFixed(2)} ${angleMark.toFixed(2)} L ${angleMarkInset.toFixed(2)} ${angleMark.toFixed(2)}"></path>`
    : "";
  const outerPath = `M 0 0 L ${w.toFixed(2)} 0 L 0 ${h.toFixed(2)} Z`;
  const innerPath = hasHole
    ? `M ${border.toFixed(2)} ${border.toFixed(2)} L ${innerRight.toFixed(2)} ${border.toFixed(2)} L ${border.toFixed(2)} ${innerBottom.toFixed(2)} Z`
    : "";
  const bodyPath = hasHole ? `${outerPath} ${innerPath}` : outerPath;
  return `
    <svg class="ttp-geo-set-square-svg is-plastic" viewBox="0 0 ${escapeAttr(w.toFixed(2))} ${escapeAttr(h.toFixed(2))}" preserveAspectRatio="none" aria-hidden="true">
      <path class="ttp-geo-set-square-plastic-body" data-set-square-move-hit d="${escapeAttr(bodyPath)}" fill-rule="evenodd"></path>
      <path class="ttp-geo-set-square-plastic-outline" d="${escapeAttr(outerPath)}"></path>
      ${hasHole ? `<path class="ttp-geo-set-square-plastic-hole" d="${escapeAttr(innerPath)}"></path>` : ""}
      <path class="ttp-geo-set-square-hypotenuse" d="M ${w.toFixed(2)} 0 L 0 ${h.toFixed(2)}"></path>
      ${angleMarkPath}
    </svg>
  `;
}

function renderMetalSetSquareSvg(setSquare, frame){
  const t = frame.thickness;
  const w = frame.width;
  const h = frame.height;
  const horizontal = frame.horizontal;
  const vertical = frame.vertical;
  const bodyPath = `M 0 0 H ${(t + horizontal).toFixed(2)} V ${t.toFixed(2)} H ${t.toFixed(2)} V ${(t + vertical).toFixed(2)} H 0 Z`;
  const angleMark = Math.min(34, Math.max(20, Math.min(horizontal, vertical) * 0.12));
  const angleMarkInset = SET_SQUARE_PLASTIC_ANGLE_MARK_STROKE_WIDTH / 2 + SET_SQUARE_PLASTIC_ANGLE_MARK_EDGE_GAP_PX;
  const angleMarkPath = setSquare.showRightAngleMark
    ? `<path class="ttp-geo-set-square-angle-mark" d="M ${(t + angleMark).toFixed(2)} ${(t + angleMarkInset).toFixed(2)} L ${(t + angleMark).toFixed(2)} ${(t + angleMark).toFixed(2)} L ${(t + angleMarkInset).toFixed(2)} ${(t + angleMark).toFixed(2)}"></path>`
    : "";
  return `
    <svg class="ttp-geo-set-square-svg is-metal" viewBox="0 0 ${escapeAttr(w.toFixed(2))} ${escapeAttr(h.toFixed(2))}" preserveAspectRatio="none" aria-hidden="true">
      <path class="ttp-geo-set-square-metal-body" data-set-square-move-hit d="${escapeAttr(bodyPath)}"></path>
      ${angleMarkPath}
    </svg>
  `;
}

function renderSetSquareSvg(setSquare, frame){
  if (frame.type === GEOMETRY_INSTRUMENT_SET_SQUARE_METAL) return renderMetalSetSquareSvg(setSquare, frame);
  return renderPlasticSetSquareSvg(setSquare, frame);
}

function syncSetSquareDom(setSquareElement, patch = {}){
  if (!setSquareElement) return;
  const current = {
    type: setSquareElement.dataset.setSquareType === GEOMETRY_INSTRUMENT_SET_SQUARE_METAL
      ? GEOMETRY_INSTRUMENT_SET_SQUARE_METAL
      : GEOMETRY_INSTRUMENT_SET_SQUARE_PLASTIC,
    horizontalLength: clamp(Number(setSquareElement.dataset.setSquareHorizontal), SET_SQUARE_SIDE_MIN, SET_SQUARE_SIDE_MAX),
    verticalLength: clamp(Number(setSquareElement.dataset.setSquareVertical), SET_SQUARE_SIDE_MIN, SET_SQUARE_SIDE_MAX),
    showRightAngleMark: setSquareElement.dataset.setSquareRightAngleMark === "true"
  };
  const next = {
    ...current,
    ...(hasOwn(patch, "horizontalLength") ? { horizontalLength: clamp(Number(patch.horizontalLength), SET_SQUARE_SIDE_MIN, SET_SQUARE_SIDE_MAX) } : null),
    ...(hasOwn(patch, "verticalLength") ? { verticalLength: clamp(Number(patch.verticalLength), SET_SQUARE_SIDE_MIN, SET_SQUARE_SIDE_MAX) } : null)
  };
  const frame = getSetSquareFrame(next);
  setSquareElement.dataset.setSquareHorizontal = String(frame.horizontal);
  setSquareElement.dataset.setSquareVertical = String(frame.vertical);
  setSquareElement.dataset.setSquareWidth = String(frame.width);
  setSquareElement.dataset.setSquareHeight = String(frame.height);
  setSquareElement.dataset.setSquarePivotX = String(frame.pivotX);
  setSquareElement.dataset.setSquarePivotY = String(frame.pivotY);
  setSquareElement.style.setProperty("--set-square-width", `${frame.width}px`);
  setSquareElement.style.setProperty("--set-square-height", `${frame.height}px`);
  setSquareElement.style.setProperty("--set-square-pivot-x", `${frame.pivotX}px`);
  setSquareElement.style.setProperty("--set-square-pivot-y", `${frame.pivotY}px`);
  setSquareElement.style.setProperty("--set-square-metal-thickness", `${frame.thickness || 0}px`);
  setSquareElement.style.setProperty("--set-square-rotate-x", `${frame.rotationHandleX}px`);
  setSquareElement.style.setProperty("--set-square-rotate-y", `${frame.rotationHandleY}px`);
  setSquareElement.style.setProperty("--set-square-angle-pill-x", `${frame.anglePillX}px`);
  setSquareElement.style.setProperty("--set-square-angle-pill-y", `${frame.anglePillY}px`);
  setSquareElement.style.setProperty("--set-square-nudge-x", `${frame.nudgeX}px`);
  setSquareElement.style.setProperty("--set-square-nudge-y", `${frame.nudgeY}px`);
  setSquareElement.style.setProperty("--set-square-handle-horizontal-x", `${frame.horizontalHandleX}px`);
  setSquareElement.style.setProperty("--set-square-handle-horizontal-y", `${frame.horizontalHandleY}px`);
  setSquareElement.style.setProperty("--set-square-handle-vertical-x", `${frame.verticalHandleX}px`);
  setSquareElement.style.setProperty("--set-square-handle-vertical-y", `${frame.verticalHandleY}px`);
  const svg = setSquareElement.querySelector(".ttp-geo-set-square-svg");
  if (!svg) return;
  const template = document.createElement("template");
  template.innerHTML = renderSetSquareSvg(next, frame).trim();
  const nextSvg = template.content.firstElementChild;
  if (nextSvg) svg.replaceWith(nextSvg);
}

function getSetSquarePivotPoint(setSquareElement){
  const layer = setSquareElement?.closest?.(".ttp-geometry-layer");
  const layerRect = layer?.getBoundingClientRect?.();
  const setSquareX = parseCssPercent(setSquareElement?.style?.getPropertyValue?.("--set-square-x"));
  const setSquareY = parseCssPercent(setSquareElement?.style?.getPropertyValue?.("--set-square-y"));
  if (layerRect && Number.isFinite(setSquareX) && Number.isFinite(setSquareY)) {
    return {
      x: layerRect.left + layerRect.width * setSquareX,
      y: layerRect.top + layerRect.height * setSquareY
    };
  }
  const rect = setSquareElement?.getBoundingClientRect?.();
  if (!rect) return null;
  const width = Number(setSquareElement?.dataset?.setSquareWidth) || rect.width;
  const height = Number(setSquareElement?.dataset?.setSquareHeight) || rect.height;
  const pivotX = Number(setSquareElement?.dataset?.setSquarePivotX) || 0;
  const pivotY = Number(setSquareElement?.dataset?.setSquarePivotY) || 0;
  return {
    x: rect.left + pivotX * rect.width / Math.max(1, width),
    y: rect.top + pivotY * rect.height / Math.max(1, height)
  };
}

function getPointLocalFromSetSquarePivot(event, setSquareElement, origin){
  const layer = setSquareElement?.closest?.(".ttp-geometry-layer");
  const layerRect = layer?.getBoundingClientRect?.();
  const scale = layerRect?.width && layer?.offsetWidth
    ? layerRect.width / Math.max(1, layer.offsetWidth)
    : 1;
  const screenScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const rotation = normalizeDegrees(Number(setSquareElement?.dataset?.setSquareRotation) || 0) * Math.PI / 180;
  const dx = ((Number(event.clientX) || 0) - origin.x) / screenScale;
  const dy = ((Number(event.clientY) || 0) - origin.y) / screenScale;
  return {
    x: dx * Math.cos(rotation) + dy * Math.sin(rotation),
    y: -dx * Math.sin(rotation) + dy * Math.cos(rotation)
  };
}

function renderSetSquareNudgePad({ setSquare, locked } = {}){
  if (!setSquare?.enabled) return "";
  return `
    <div class="ttp-geo-set-square-nudge-pad" data-set-square-nudge-pad ${locked ? "hidden" : ""}>
      ${getSetSquareNudgeButton(0, -SET_SQUARE_NUDGE_PX, "keyboard_arrow_up", "Monter l’équerre")}
      ${getSetSquareNudgeButton(-SET_SQUARE_NUDGE_PX, 0, "keyboard_arrow_left", "Déplacer l’équerre à gauche")}
      ${getSetSquareNudgeButton(SET_SQUARE_NUDGE_PX, 0, "keyboard_arrow_right", "Déplacer l’équerre à droite")}
      ${getSetSquareNudgeButton(0, SET_SQUARE_NUDGE_PX, "keyboard_arrow_down", "Descendre l’équerre")}
    </div>
  `;
}

function renderSetSquare({ setSquare, selected, locked } = {}){
  if (!setSquare.enabled) return "";
  const frame = getSetSquareFrame(setSquare);
  const controlsHidden = locked;
  return `
    <div
      class="ttp-geo-set-square ttp-geo-set-square-${escapeAttr(frame.type)}${selected ? " is-selected" : ""}${locked ? " is-locked" : ""}"
      data-geometry-set-square
      data-set-square-type="${escapeAttr(frame.type)}"
      data-set-square-horizontal="${escapeAttr(frame.horizontal)}"
      data-set-square-vertical="${escapeAttr(frame.vertical)}"
      data-set-square-width="${escapeAttr(frame.width)}"
      data-set-square-height="${escapeAttr(frame.height)}"
      data-set-square-pivot-x="${escapeAttr(frame.pivotX)}"
      data-set-square-pivot-y="${escapeAttr(frame.pivotY)}"
      data-set-square-rotation="${escapeAttr(setSquare.rotation)}"
      data-set-square-right-angle-mark="${setSquare.showRightAngleMark ? "true" : "false"}"
      style="${getSetSquarePositionStyle(setSquare)}--set-square-width:${frame.width}px;--set-square-height:${frame.height}px;--set-square-pivot-x:${frame.pivotX}px;--set-square-pivot-y:${frame.pivotY}px;--set-square-metal-thickness:${frame.thickness || 0}px;--set-square-rotation:${setSquare.rotation}deg;--set-square-counter-rotation:${-normalizeDegrees(setSquare.rotation)}deg;--set-square-rotate-x:${frame.rotationHandleX}px;--set-square-rotate-y:${frame.rotationHandleY}px;--set-square-angle-pill-x:${frame.anglePillX}px;--set-square-angle-pill-y:${frame.anglePillY}px;--set-square-nudge-x:${frame.nudgeX}px;--set-square-nudge-y:${frame.nudgeY}px;--set-square-handle-horizontal-x:${frame.horizontalHandleX}px;--set-square-handle-horizontal-y:${frame.horizontalHandleY}px;--set-square-handle-vertical-x:${frame.verticalHandleX}px;--set-square-handle-vertical-y:${frame.verticalHandleY}px;"
      aria-label="${escapeAttr(getSetSquareLabel(frame.type))}"
    >
      ${renderSetSquareSvg(setSquare, frame)}
      ${setSquare.showAnglePill ? `<div class="ttp-geo-set-square-degree-pill" aria-hidden="${selected && !controlsHidden ? "false" : "true"}" ${controlsHidden ? "hidden" : ""}>${escapeAttr(Math.round(setSquare.rotation))}°</div>` : ""}
      <button class="ttp-geo-set-square-size-handle is-horizontal" type="button" data-set-square-size-handle="horizontal" aria-label="Régler le côté horizontal" ${controlsHidden ? "hidden" : ""}></button>
      <button class="ttp-geo-set-square-size-handle is-vertical" type="button" data-set-square-size-handle="vertical" aria-label="Régler le côté vertical" ${controlsHidden ? "hidden" : ""}></button>
      <button class="ttp-geo-set-square-rotate-handle ttp-material-icon" type="button" data-set-square-rotate-handle aria-label="Tourner l’équerre" ${controlsHidden ? "hidden" : ""}>rotate_right</button>
    </div>
  `;
}

function getNudgeButton(dx, dy, icon, label, big = false){
  return `
    <button
      class="ttp-geometry-nudge-btn ttp-material-icon"
      type="button"
      data-ruler-nudge-dx="${escapeAttr(dx)}"
      data-ruler-nudge-dy="${escapeAttr(dy)}"
      data-ruler-nudge-big="${big ? "true" : "false"}"
      title="${escapeAttr(label)}"
      aria-label="${escapeAttr(label)}"
    >${escapeAttr(icon)}</button>
  `;
}

function getSetSquareNudgeButton(dx, dy, icon, label){
  return `
    <button
      class="ttp-geometry-nudge-btn ttp-material-icon"
      type="button"
      data-set-square-nudge-dx="${escapeAttr(dx)}"
      data-set-square-nudge-dy="${escapeAttr(dy)}"
      title="${escapeAttr(label)}"
      aria-label="${escapeAttr(label)}"
    >${escapeAttr(icon)}</button>
  `;
}

function getRulerPositionStyle(ruler){
  return `--ruler-x:${formatPercent(ruler.x)};--ruler-y:${formatPercent(ruler.y)};`;
}

function renderRulerNudgePad({ ruler, locked } = {}){
  if (!ruler?.enabled) return "";
  return `
    <div
      class="ttp-geo-ruler-nudge-pad"
      data-ruler-nudge-pad
      ${locked ? "hidden" : ""}
    >
      ${getNudgeButton(0, -RULER_NUDGE_PX, "keyboard_arrow_up", "Monter la règle")}
      ${getNudgeButton(-RULER_NUDGE_PX, 0, "keyboard_arrow_left", "Déplacer la règle à gauche")}
      ${getNudgeButton(RULER_NUDGE_PX, 0, "keyboard_arrow_right", "Déplacer la règle à droite")}
      ${getNudgeButton(0, RULER_NUDGE_PX, "keyboard_arrow_down", "Descendre la règle")}
    </div>
  `;
}

function renderRuler({ ruler, selected, locked } = {}){
  if (!ruler.enabled) return "";
  const renderRulerState = getRulerRenderState(ruler);
  const height = getRulerHeight(renderRulerState);
  const measureLengthPx = getRulerMeasureLengthPx(renderRulerState);
  const widthPx = getRulerWidthPx(renderRulerState);
  const sliderWidthPx = getRulerSliderWidthPx(widthPx);
  const controlsHidden = locked;
  return `
    <div
      class="ttp-geo-ruler ttp-geo-ruler-${escapeAttr(ruler.type)}${selected ? " is-selected" : ""}${locked ? " is-locked" : ""}"
      data-geometry-ruler
      data-ruler-type="${escapeAttr(renderRulerState.type)}"
      data-ruler-height="${escapeAttr(height)}"
      data-ruler-length="${escapeAttr(widthPx.toFixed(2))}"
      data-ruler-measure-length="${escapeAttr(measureLengthPx.toFixed(2))}"
      data-ruler-zero-offset="${escapeAttr(RULER_ZERO_OFFSET_PX)}"
      data-ruler-end-padding="${escapeAttr(RULER_END_PADDING_PX)}"
      data-ruler-unit-size="${escapeAttr(renderRulerState.unitSize)}"
      data-ruler-length-units="${escapeAttr(renderRulerState.lengthUnits)}"
      data-ruler-rotation="${escapeAttr(renderRulerState.rotation)}"
      data-ruler-angle-pill="${renderRulerState.showAnglePill ? "true" : "false"}"
      style="${getRulerPositionStyle(renderRulerState)}--ruler-width:${widthPx.toFixed(2)}px;--ruler-height:${height}px;--ruler-zero-offset:${RULER_ZERO_OFFSET_PX}px;--ruler-slider-width:${sliderWidthPx}px;--ruler-rotation:${renderRulerState.rotation}deg;"
      aria-label="${escapeAttr(getRulerLabel(renderRulerState.type))}"
    >
      ${renderRulerSvg(renderRulerState, widthPx, height)}
      <div class="ttp-geo-ruler-move-hit" data-ruler-move-hit aria-hidden="true"></div>
      ${renderRulerState.showAnglePill ? `<div class="ttp-geo-ruler-degree-pill" aria-hidden="${selected && !controlsHidden ? "false" : "true"}" ${controlsHidden ? "hidden" : ""}>${escapeAttr(Math.round(renderRulerState.rotation))}°</div>` : ""}
      <input
        class="ttp-geo-ruler-unit-slider"
        type="range"
        min="${RULER_UNIT_SIZE_MIN}"
        max="${RULER_UNIT_SIZE_MAX}"
        step="1"
        value="${escapeAttr(renderRulerState.unitSize)}"
        aria-label="Régler l’écart entre 0 et 1"
        data-ruler-unit-slider
        ${controlsHidden ? "hidden" : ""}
      >
      <button class="ttp-geo-ruler-length-handle" type="button" data-ruler-length-handle aria-label="Allonger ou raccourcir la règle" ${controlsHidden ? "hidden" : ""}></button>
      <button class="ttp-geo-ruler-rotate-handle ttp-material-icon" type="button" data-ruler-rotate-handle aria-label="Tourner la règle" ${controlsHidden ? "hidden" : ""}>rotate_right</button>
    </div>
  `;
}

function startRulerMove(event, { host, sendAction, selectWidget, locked } = {}){
  const rulerElement = event.currentTarget?.closest?.("[data-geometry-ruler]");
  if (!rulerElement) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (event.target?.closest?.("button, input, select, textarea, label, a, [data-widget-action]")) return;
  if (locked) {
    selectWidget?.();
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const metrics = getLayerMetrics(host);
  if (!metrics.rect) return;
  selectWidget?.();

  const startX = Number(rulerElement.style.getPropertyValue("--ruler-x").replace("%", "")) / 100 || 0;
  const startY = Number(rulerElement.style.getPropertyValue("--ruler-y").replace("%", "")) / 100 || 0;
  const startClientX = event.clientX;
  const startClientY = event.clientY;
  let latest = { x: startX, y: startY };
  let didMove = false;

  const move = (moveEvent) => {
    const dx = ((Number(moveEvent.clientX) || 0) - startClientX) / metrics.width;
    const dy = ((Number(moveEvent.clientY) || 0) - startClientY) / metrics.height;
    latest = {
      x: clamp(startX + dx, -0.5, 1.5),
      y: clamp(startY + dy, -0.5, 1.5)
    };
    rulerElement.style.setProperty("--ruler-x", formatPercent(latest.x));
    rulerElement.style.setProperty("--ruler-y", formatPercent(latest.y));
    didMove = true;
    moveEvent.preventDefault();
  };

  const end = (endEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    try { rulerElement.releasePointerCapture?.(event.pointerId); } catch {}
    rulerElement.classList.remove("is-dragging");
    if (endEvent.type !== "pointercancel" && didMove) sendAction?.("move-ruler", latest);
    endEvent.preventDefault();
  };

  rulerElement.classList.add("is-dragging");
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  try { rulerElement.setPointerCapture?.(event.pointerId); } catch {}
  event.preventDefault();
  event.stopPropagation();
}

function startRulerRotation(event, { sendAction, selectWidget, locked } = {}){
  const rulerElement = event.currentTarget?.closest?.("[data-geometry-ruler]");
  if (!rulerElement || locked) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const origin = getRulerOriginPoint(rulerElement);
  if (!origin) return;
  selectWidget?.();

  const startRotation = normalizeDegrees(Number(rulerElement.dataset.rulerRotation) || 0);
  const startAngle = getPointAngleFromOrigin(event, origin);
  let latestRotation = startRotation;

  const move = (moveEvent) => {
    const currentAngle = getPointAngleFromOrigin(moveEvent, origin);
    latestRotation = normalizeDegrees(startRotation + getSignedAngleDelta(startAngle, currentAngle));
    rulerElement.dataset.rulerRotation = String(latestRotation);
    rulerElement.style.setProperty("--ruler-rotation", `${latestRotation}deg`);
    const pill = rulerElement.querySelector(".ttp-geo-ruler-degree-pill");
    if (pill) pill.textContent = `${Math.round(latestRotation)}°`;
    moveEvent.preventDefault();
  };

  const end = (endEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    try { rulerElement.releasePointerCapture?.(event.pointerId); } catch {}
    rulerElement.classList.remove("is-rotating");
    if (endEvent.type !== "pointercancel") sendAction?.("rotate-ruler", { rotation: latestRotation });
    endEvent.preventDefault();
  };

  rulerElement.classList.add("is-rotating");
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  try { rulerElement.setPointerCapture?.(event.pointerId); } catch {}
  event.preventDefault();
  event.stopPropagation();
}

function startRulerLengthDrag(event, { sendAction, selectWidget, locked } = {}){
  const rulerElement = event.currentTarget?.closest?.("[data-geometry-ruler]");
  if (!rulerElement || locked) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const origin = getRulerOriginPoint(rulerElement);
  if (!origin) return;
  selectWidget?.();

  const layer = rulerElement.closest?.(".ttp-geometry-layer");
  const layerRect = layer?.getBoundingClientRect?.();
  const layerScale = layerRect?.width && layer?.offsetWidth
    ? layerRect.width / Math.max(1, layer.offsetWidth)
    : 1;
  const screenScale = Number.isFinite(layerScale) && layerScale > 0 ? layerScale : 1;
  const unitSize = Math.max(1, Number(rulerElement.dataset.rulerUnitSize) || 1);
  const rotation = normalizeDegrees(Number(rulerElement.dataset.rulerRotation) || 0);
  const axis = getRulerAxis(rotation);
  let latestLengthUnits = clampRulerLengthUnits(Number(rulerElement.dataset.rulerLengthUnits), unitSize);
  const currentMeasureLengthPx = getRulerMeasureLengthPx({ unitSize, lengthUnits: latestLengthUnits });
  const currentEdgeDistancePx = currentMeasureLengthPx + RULER_END_PADDING_PX;
  const startVx = (Number(event.clientX) || 0) - origin.x;
  const startVy = (Number(event.clientY) || 0) - origin.y;
  const startProjectedLengthPx = ((startVx * axis.x) + (startVy * axis.y)) / screenScale;
  const pointerToEdgeOffsetPx = currentEdgeDistancePx - startProjectedLengthPx;

  const move = (moveEvent) => {
    const vx = (Number(moveEvent.clientX) || 0) - origin.x;
    const vy = (Number(moveEvent.clientY) || 0) - origin.y;
    const projectedLength = (vx * axis.x) + (vy * axis.y);
    const edgeDistancePx = (projectedLength / screenScale) + pointerToEdgeOffsetPx;
    latestLengthUnits = clampRulerLengthUnits((edgeDistancePx - RULER_END_PADDING_PX) / unitSize, unitSize, latestLengthUnits);
    syncRulerScaleDom(rulerElement, { lengthUnits: latestLengthUnits });
    moveEvent.preventDefault();
  };

  const end = (endEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    try { rulerElement.releasePointerCapture?.(event.pointerId); } catch {}
    rulerElement.classList.remove("is-resizing-length");
    if (endEvent.type !== "pointercancel") sendAction?.("resize-ruler", { lengthUnits: latestLengthUnits });
    endEvent.preventDefault();
  };

  rulerElement.classList.add("is-resizing-length");
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  try { rulerElement.setPointerCapture?.(event.pointerId); } catch {}
  event.preventDefault();
  event.stopPropagation();
}


function startSetSquareMove(event, { host, sendAction, selectWidget, locked } = {}){
  const setSquareElement = event.currentTarget?.closest?.("[data-geometry-set-square]");
  if (!setSquareElement) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (event.target?.closest?.("button, input, select, textarea, label, a, [data-widget-action]")) return;
  if (locked) {
    selectWidget?.();
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  const metrics = getLayerMetrics(host);
  if (!metrics.rect) return;
  selectWidget?.();

  const startX = Number(setSquareElement.style.getPropertyValue("--set-square-x").replace("%", "")) / 100 || 0;
  const startY = Number(setSquareElement.style.getPropertyValue("--set-square-y").replace("%", "")) / 100 || 0;
  const startClientX = event.clientX;
  const startClientY = event.clientY;
  let latest = { x: startX, y: startY };
  let didMove = false;

  const move = (moveEvent) => {
    const dx = ((Number(moveEvent.clientX) || 0) - startClientX) / metrics.width;
    const dy = ((Number(moveEvent.clientY) || 0) - startClientY) / metrics.height;
    latest = {
      x: clamp(startX + dx, -0.5, 1.5),
      y: clamp(startY + dy, -0.5, 1.5)
    };
    setSquareElement.style.setProperty("--set-square-x", formatPercent(latest.x));
    setSquareElement.style.setProperty("--set-square-y", formatPercent(latest.y));
    didMove = true;
    moveEvent.preventDefault();
  };

  const end = (endEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    try { setSquareElement.releasePointerCapture?.(event.pointerId); } catch {}
    setSquareElement.classList.remove("is-dragging");
    if (endEvent.type !== "pointercancel" && didMove) sendAction?.("move-set-square", latest);
    endEvent.preventDefault();
  };

  setSquareElement.classList.add("is-dragging");
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  try { setSquareElement.setPointerCapture?.(event.pointerId); } catch {}
  event.preventDefault();
  event.stopPropagation();
}

function startSetSquareRotation(event, { sendAction, selectWidget, locked } = {}){
  const setSquareElement = event.currentTarget?.closest?.("[data-geometry-set-square]");
  if (!setSquareElement || locked) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const origin = getSetSquarePivotPoint(setSquareElement);
  if (!origin) return;
  selectWidget?.();

  const startRotation = normalizeDegrees(Number(setSquareElement.dataset.setSquareRotation) || 0);
  const startAngle = getPointAngleFromOrigin(event, origin);
  let latestRotation = startRotation;

  const move = (moveEvent) => {
    const currentAngle = getPointAngleFromOrigin(moveEvent, origin);
    latestRotation = normalizeDegrees(startRotation + getSignedAngleDelta(startAngle, currentAngle));
    setSquareElement.dataset.setSquareRotation = String(latestRotation);
    setSquareElement.style.setProperty("--set-square-rotation", `${latestRotation}deg`);
    setSquareElement.style.setProperty("--set-square-counter-rotation", `${-latestRotation}deg`);
    const pill = setSquareElement.querySelector(".ttp-geo-set-square-degree-pill");
    if (pill) pill.textContent = `${Math.round(latestRotation)}°`;
    moveEvent.preventDefault();
  };

  const end = (endEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    try { setSquareElement.releasePointerCapture?.(event.pointerId); } catch {}
    setSquareElement.classList.remove("is-rotating");
    if (endEvent.type !== "pointercancel") sendAction?.("rotate-set-square", { rotation: latestRotation });
    endEvent.preventDefault();
  };

  setSquareElement.classList.add("is-rotating");
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  try { setSquareElement.setPointerCapture?.(event.pointerId); } catch {}
  event.preventDefault();
  event.stopPropagation();
}

function startSetSquareSizeDrag(event, { sendAction, selectWidget, locked } = {}){
  const setSquareElement = event.currentTarget?.closest?.("[data-geometry-set-square]");
  if (!setSquareElement || locked) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const handleType = event.currentTarget?.dataset?.setSquareSizeHandle;
  const activeHandle = event.currentTarget;
  const origin = getSetSquarePivotPoint(setSquareElement);
  if (!origin || !handleType) return;
  selectWidget?.();

  let latestHorizontal = clamp(Number(setSquareElement.dataset.setSquareHorizontal), SET_SQUARE_SIDE_MIN, SET_SQUARE_SIDE_MAX);
  let latestVertical = clamp(Number(setSquareElement.dataset.setSquareVertical), SET_SQUARE_SIDE_MIN, SET_SQUARE_SIDE_MAX);
  const startLocal = getPointLocalFromSetSquarePivot(event, setSquareElement, origin);
  const pointerToHorizontalEdgeOffset = latestHorizontal - startLocal.x;
  const pointerToVerticalEdgeOffset = latestVertical - startLocal.y;

  const move = (moveEvent) => {
    const local = getPointLocalFromSetSquarePivot(moveEvent, setSquareElement, origin);
    if (handleType === "horizontal") {
      latestHorizontal = clamp(local.x + pointerToHorizontalEdgeOffset, SET_SQUARE_SIDE_MIN, SET_SQUARE_SIDE_MAX);
    } else {
      latestVertical = clamp(local.y + pointerToVerticalEdgeOffset, SET_SQUARE_SIDE_MIN, SET_SQUARE_SIDE_MAX);
    }
    syncSetSquareDom(setSquareElement, {
      horizontalLength: latestHorizontal,
      verticalLength: latestVertical
    });
    moveEvent.preventDefault();
  };

  const end = (endEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    try { setSquareElement.releasePointerCapture?.(event.pointerId); } catch {}
    setSquareElement.classList.remove("is-resizing-side");
    activeHandle?.classList?.remove?.("is-active-resize");
    if (endEvent.type !== "pointercancel") {
      sendAction?.("resize-set-square", {
        horizontalLength: latestHorizontal,
        verticalLength: latestVertical
      });
    }
    endEvent.preventDefault();
  };

  setSquareElement.classList.add("is-resizing-side");
  activeHandle?.classList?.add?.("is-active-resize");
  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  try { setSquareElement.setPointerCapture?.(event.pointerId); } catch {}
  event.preventDefault();
  event.stopPropagation();
}

function bindSetSquareControls({ host, sendAction, selectWidget, locked } = {}){
  const setSquareElement = host?.querySelector?.("[data-geometry-set-square]");
  if (!setSquareElement) return;

  setSquareElement.addEventListener("pointerdown", (event) => startSetSquareMove(event, { host, sendAction, selectWidget, locked }));
  setSquareElement.querySelector("[data-set-square-rotate-handle]")?.addEventListener("pointerdown", (event) => startSetSquareRotation(event, { sendAction, selectWidget, locked }));
  setSquareElement.querySelectorAll("[data-set-square-size-handle]").forEach((handle) => {
    handle.addEventListener("pointerdown", (event) => startSetSquareSizeDrag(event, { sendAction, selectWidget, locked }));
  });
  host?.querySelectorAll?.("[data-set-square-nudge-dx][data-set-square-nudge-dy]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      selectWidget?.();
      const metrics = getLayerMetrics(host);
      const factor = event.shiftKey ? SET_SQUARE_BIG_NUDGE_PX : 1;
      sendAction?.("nudge-set-square", {
        dxPx: (Number(button.dataset.setSquareNudgeDx) || 0) * factor,
        dyPx: (Number(button.dataset.setSquareNudgeDy) || 0) * factor,
        sceneWidth: metrics.width,
        sceneHeight: metrics.height
      });
    });
  });
}

function bindRulerControls({ host, sendAction, selectWidget, locked } = {}){
  const rulerElement = host?.querySelector?.("[data-geometry-ruler]");
  if (!rulerElement) return;

  rulerElement.addEventListener("pointerdown", (event) => startRulerMove(event, { host, sendAction, selectWidget, locked }));
  rulerElement.querySelector("[data-ruler-rotate-handle]")?.addEventListener("pointerdown", (event) => startRulerRotation(event, { sendAction, selectWidget, locked }));
  rulerElement.querySelector("[data-ruler-length-handle]")?.addEventListener("pointerdown", (event) => startRulerLengthDrag(event, { sendAction, selectWidget, locked }));
  const unitSlider = rulerElement.querySelector("[data-ruler-unit-slider]");
  unitSlider?.addEventListener("pointerdown", (event) => {
    selectWidget?.();
    event.stopPropagation();
  });
  unitSlider?.addEventListener("input", (event) => {
    syncRulerScaleDom(rulerElement, { unitSize: event.currentTarget.value });
  });
  unitSlider?.addEventListener("change", (event) => {
    syncRulerScaleDom(rulerElement, { unitSize: event.currentTarget.value });
    sendAction?.("set-ruler-unit-size", { unitSize: event.currentTarget.value });
  });
  host?.querySelectorAll?.("[data-ruler-nudge-dx][data-ruler-nudge-dy]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      selectWidget?.();
      const metrics = getLayerMetrics(host);
      const factor = event.shiftKey || button.dataset.rulerNudgeBig === "true" ? RULER_BIG_NUDGE_PX : 1;
      sendAction?.("nudge-ruler", {
        dxPx: (Number(button.dataset.rulerNudgeDx) || 0) * factor,
        dyPx: (Number(button.dataset.rulerNudgeDy) || 0) * factor,
        sceneWidth: metrics.width,
        sceneHeight: metrics.height
      });
    });
  });
}

export function renderGeometryInstrumentsProjector({ host, widgetInfoHost, state, widget, scene, sendAction, selectWidget } = {}){
  if (!host) return;
  const safeState = normalizeGeometryInstrumentsState(state);
  const selected = scene?.selectedWidgetId === widget?.id;
  const locked = isLocked({ widget, scene });
  const ruler = safeState.ruler;
  const setSquare = safeState.setSquare;

  host.innerHTML = `
    <section class="ttp-geometry-layer" data-no-widget-drag aria-label="Instruments de géométrie">
      ${renderRuler({ ruler, selected, locked })}
      ${renderSetSquare({ setSquare, selected, locked })}
      ${renderRulerNudgePad({ ruler, locked })}
      ${renderSetSquareNudgePad({ setSquare, locked })}
    </section>
  `;

  if (widgetInfoHost) {
    const activeLabels = [];
    if (ruler.enabled) activeLabels.push(getRulerLabel(ruler.type));
    if (setSquare.enabled) activeLabels.push(getSetSquareLabel(setSquare.type));
    widgetInfoHost.textContent = activeLabels.length ? activeLabels.join(" · ") : "Aucun instrument actif";
  }

  bindRulerControls({ host, sendAction, selectWidget, locked });
  bindSetSquareControls({ host, sendAction, selectWidget, locked });
}
