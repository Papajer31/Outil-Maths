import {
  LABELS_FONT_BELLEALLURE,
  getLabelsFontFamilyCss,
  normalizeLabelsState
} from "./model.js";
import { escapeAttr } from "../../../dashboard/text-utils.js";
import { renderSimpleMarkupToHtml } from "../../../../../shared/simple-markup.js";
import { bindFreeObjectInteractions } from "../../free-objects/projector-interactions.js";

const LABEL_LAYOUT_GAP_PX = 20;
const LABEL_LAYOUT_ATTEMPTS = 120;
const handledPlacementRequestIds = new Set();

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function formatPercent(value){
  return `${Number((Number(value) || 0) * 100).toFixed(4)}%`;
}

function capHandledPlacementRequests(){
  while (handledPlacementRequestIds.size > 40) {
    const first = handledPlacementRequestIds.values().next().value;
    handledPlacementRequestIds.delete(first);
  }
}

function normalizeMeasuredPosition(value, size, total){
  const safeTotal = Math.max(1, Number(total) || 1);
  const safeSize = Math.max(0, Number(size) || 0);
  const maxValue = Math.max(0, safeTotal - safeSize);
  return clamp(value, 0, maxValue) / safeTotal;
}

function escapeCssIdentifier(value){
  try {
    if (typeof CSS?.escape === "function") return CSS.escape(String(value || ""));
  } catch {}
  return String(value || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

function renderLabelStyle(style){
  const isBelleAllure = style.fontFamily === LABELS_FONT_BELLEALLURE;
  const paddingX = Math.max(0, Number(style.paddingX) || 0) + (isBelleAllure ? 8 : 0);
  const paddingY = Math.max(0, Number(style.paddingY) || 0) + (isBelleAllure ? 7 : 0);
  const lineHeight = isBelleAllure ? 2 : 1.1;
  return [
    `font-family:${getLabelsFontFamilyCss(style.fontFamily)}`,
    `font-size:${Math.max(1, Number(style.fontSize) || 34)}px`,
    `color:${style.textColor}`,
    `--tt-labels-colored-text-color:${style.coloredTextColor}`,
    `background:${style.backgroundColor}`,
    `border:${Math.max(0, Number(style.borderWidth) || 0)}px solid ${style.borderColor}`,
    `border-radius:${Math.max(0, Number(style.borderRadius) || 0)}px`,
    `padding:${paddingY}px ${paddingX}px`,
    `line-height:${lineHeight}`,
    style.shadow ? "box-shadow:4px 5px 8px rgba(15,23,42,.28)" : "box-shadow:none"
  ].join(";");
}

function renderLabelText(text){
  return renderSimpleMarkupToHtml(text);
}

function getMeasuredLabels(layer, items = []){
  const layerRect = layer?.getBoundingClientRect?.();
  if (!layerRect?.width || !layerRect?.height) return null;
  return items.map((item) => {
    const label = layer.querySelector(`[data-label-id="${escapeCssIdentifier(item.id)}"]`);
    const rect = label?.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return null;
    return {
      id: item.id,
      text: item.text,
      width: rect.width,
      height: rect.height,
      x: rect.left - layerRect.left,
      y: rect.top - layerRect.top
    };
  }).filter(Boolean);
}

function rectsOverlapPx(a, b, gap = LABEL_LAYOUT_GAP_PX){
  if (!a || !b) return false;
  return (
    a.x < b.x + b.width + gap
    && a.x + a.width + gap > b.x
    && a.y < b.y + b.height + gap
    && a.y + a.height + gap > b.y
  );
}

function getFirstCollisionPx(candidate, occupiedRects){
  return (Array.isArray(occupiedRects) ? occupiedRects : [])
    .filter((rect) => rectsOverlapPx(candidate, rect))
    .sort((a, b) => ((a.x + a.width) - (b.x + b.width)) || (a.y - b.y))[0] || null;
}

function clampMeasuredRect(rect, containerWidth, containerHeight){
  return {
    ...rect,
    x: clamp(rect.x, 0, Math.max(0, containerWidth - rect.width)),
    y: clamp(rect.y, 0, Math.max(0, containerHeight - rect.height))
  };
}

function findFirstMeasuredSlot(label, occupiedRects, containerWidth, containerHeight){
  const maxX = Math.max(0, containerWidth - label.width);
  const maxY = Math.max(0, containerHeight - label.height);
  const yCandidates = [
    LABEL_LAYOUT_GAP_PX,
    ...(Array.isArray(occupiedRects) ? occupiedRects : []).map((rect) => rect.y + rect.height + LABEL_LAYOUT_GAP_PX)
  ]
    .filter((value) => Number.isFinite(value) && value <= maxY)
    .sort((a, b) => a - b);
  const uniqueY = yCandidates.filter((value, index, values) => index === 0 || Math.abs(value - values[index - 1]) > 0.5);

  for (const y of uniqueY) {
    let x = LABEL_LAYOUT_GAP_PX;
    let guard = 0;
    while (x <= maxX && guard < 200) {
      const candidate = { x, y, width: label.width, height: label.height };
      const collision = getFirstCollisionPx(candidate, occupiedRects);
      if (!collision) return clampMeasuredRect(candidate, containerWidth, containerHeight);
      x = collision.x + collision.width + LABEL_LAYOUT_GAP_PX;
      guard += 1;
    }
  }

  return clampMeasuredRect({
    x: LABEL_LAYOUT_GAP_PX,
    y: uniqueY.at(-1) || LABEL_LAYOUT_GAP_PX,
    width: label.width,
    height: label.height
  }, containerWidth, containerHeight);
}

function findRandomMeasuredSlot(label, occupiedRects, containerWidth, containerHeight){
  const maxX = Math.max(0, containerWidth - label.width);
  const maxY = Math.max(0, containerHeight - label.height);
  for (let attempt = 0; attempt < LABEL_LAYOUT_ATTEMPTS; attempt += 1) {
    const candidate = {
      x: Math.random() * maxX,
      y: Math.random() * maxY,
      width: label.width,
      height: label.height
    };
    if (!getFirstCollisionPx(candidate, occupiedRects)) {
      return clampMeasuredRect(candidate, containerWidth, containerHeight);
    }
  }
  return findFirstMeasuredSlot(label, occupiedRects, containerWidth, containerHeight);
}

function computeMeasuredFlowPositions(labels, containerWidth, containerHeight){
  const positions = [];
  let x = LABEL_LAYOUT_GAP_PX;
  let y = LABEL_LAYOUT_GAP_PX;
  let rowHeight = 0;

  labels.forEach((label) => {
    if (x > LABEL_LAYOUT_GAP_PX && x + label.width > containerWidth - LABEL_LAYOUT_GAP_PX) {
      x = LABEL_LAYOUT_GAP_PX;
      y += rowHeight + LABEL_LAYOUT_GAP_PX;
      rowHeight = 0;
    }
    const rect = clampMeasuredRect({ x, y, width: label.width, height: label.height }, containerWidth, containerHeight);
    positions.push({
      labelId: label.id,
      x: normalizeMeasuredPosition(rect.x, label.width, containerWidth),
      y: normalizeMeasuredPosition(rect.y, label.height, containerHeight)
    });
    x = rect.x + label.width + LABEL_LAYOUT_GAP_PX;
    rowHeight = Math.max(rowHeight, label.height);
  });

  return positions;
}

function computeMeasuredLayoutPositions(labels, containerWidth, containerHeight, command){
  if (!Array.isArray(labels) || !labels.length) return [];
  const positions = new Map(labels.map((label) => [label.id, { x:label.x, y:label.y }]));
  const left = Math.min(...labels.map((label) => label.x));
  const right = Math.max(...labels.map((label) => label.x + label.width));
  const top = Math.min(...labels.map((label) => label.y));
  const bottom = Math.max(...labels.map((label) => label.y + label.height));
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;

  if (command === "align-left") {
    labels.forEach((label) => positions.set(label.id, { x:left, y:label.y }));
  } else if (command === "align-right") {
    labels.forEach((label) => positions.set(label.id, { x:right - label.width, y:label.y }));
  } else if (command === "align-top") {
    labels.forEach((label) => positions.set(label.id, { x:label.x, y:top }));
  } else if (command === "align-bottom") {
    labels.forEach((label) => positions.set(label.id, { x:label.x, y:bottom - label.height }));
  } else if (command === "align-center-x") {
    labels.forEach((label) => positions.set(label.id, { x:centerX - (label.width / 2), y:label.y }));
  } else if (command === "align-center-y") {
    labels.forEach((label) => positions.set(label.id, { x:label.x, y:centerY - (label.height / 2) }));
  } else if (command === "distribute-x" && labels.length >= 3) {
    const sorted = [...labels].sort((a, b) => a.x - b.x || a.y - b.y);
    const spanLeft = sorted[0].x;
    const spanRight = sorted.at(-1).x + sorted.at(-1).width;
    const totalWidth = sorted.reduce((sum, label) => sum + label.width, 0);
    const gap = (spanRight - spanLeft - totalWidth) / Math.max(1, sorted.length - 1);
    let cursor = spanLeft;
    sorted.forEach((label) => {
      positions.set(label.id, { x:cursor, y:label.y });
      cursor += label.width + gap;
    });
  } else if (command === "distribute-y" && labels.length >= 3) {
    const sorted = [...labels].sort((a, b) => a.y - b.y || a.x - b.x);
    const spanTop = sorted[0].y;
    const spanBottom = sorted.at(-1).y + sorted.at(-1).height;
    const totalHeight = sorted.reduce((sum, label) => sum + label.height, 0);
    const gap = (spanBottom - spanTop - totalHeight) / Math.max(1, sorted.length - 1);
    let cursor = spanTop;
    sorted.forEach((label) => {
      positions.set(label.id, { x:label.x, y:cursor });
      cursor += label.height + gap;
    });
  }

  return labels.map((label) => {
    const position = positions.get(label.id) || { x:label.x, y:label.y };
    const rect = clampMeasuredRect({
      x:position.x,
      y:position.y,
      width:label.width,
      height:label.height
    }, containerWidth, containerHeight);
    return {
      labelId:label.id,
      x:normalizeMeasuredPosition(rect.x, label.width, containerWidth),
      y:normalizeMeasuredPosition(rect.y, label.height, containerHeight)
    };
  });
}

function computeMeasuredPlacement({ layer, state } = {}){
  const request = state?.placementRequest;
  const layerRect = layer?.getBoundingClientRect?.();
  const labels = getMeasuredLabels(layer, state?.items);
  if (!request?.id || !layerRect?.width || !layerRect?.height || !labels?.length) return [];

  const requestIds = new Set(Array.isArray(request.labelIds) ? request.labelIds : []);
  const targetLabels = request.type === "place-new"
    ? labels.filter((label) => requestIds.has(label.id))
    : labels.filter((label) => !requestIds.size || requestIds.has(label.id));

  if (!targetLabels.length) return [];

  if (request.type === "align") {
    return computeMeasuredFlowPositions(targetLabels, layerRect.width, layerRect.height);
  }

  if (request.type === "layout") {
    return computeMeasuredLayoutPositions(targetLabels, layerRect.width, layerRect.height, request.command);
  }

  const occupiedRects = labels
    .filter((label) => !targetLabels.some((target) => target.id === label.id))
    .map((label) => ({
      x: label.x,
      y: label.y,
      width: label.width,
      height: label.height
    }));

  const positions = [];
  targetLabels.forEach((label) => {
    const rect = request.type === "random"
      ? findRandomMeasuredSlot(label, occupiedRects, layerRect.width, layerRect.height)
      : findFirstMeasuredSlot(label, occupiedRects, layerRect.width, layerRect.height);
    occupiedRects.push(rect);
    positions.push({
      labelId: label.id,
      x: normalizeMeasuredPosition(rect.x, label.width, layerRect.width),
      y: normalizeMeasuredPosition(rect.y, label.height, layerRect.height)
    });
  });
  return positions;
}

function scheduleMeasuredPlacement({ host, state, sendAction } = {}){
  const request = state?.placementRequest;
  if (!request?.id || typeof sendAction !== "function") return;
  if (handledPlacementRequestIds.has(request.id)) return;
  handledPlacementRequestIds.add(request.id);
  capHandledPlacementRequests();

  const measureAndSend = () => {
    const layer = host?.querySelector?.(".ttp-labels-layer");
    const positions = computeMeasuredPlacement({ layer, state });
    if (!positions.length) return;
    sendAction("set-label-positions", {
      requestId: request.id,
      positions
    });
  };

  const schedule = () => {
    const raf = typeof requestAnimationFrame === "function"
      ? requestAnimationFrame
      : (callback) => setTimeout(callback, 0);
    raf(() => measureAndSend());
  };
  if (typeof document !== "undefined" && document.fonts?.ready?.then) {
    document.fonts.ready.then(schedule).catch(schedule);
    return;
  }
  schedule();
}

export function renderLabelsProjector({ host, state, sendAction } = {}){
  if (!host) return;
  const safeState = normalizeLabelsState(state);
  const labelStyle = renderLabelStyle(safeState.style);
  const locked = false;

  const selected = new Set(safeState.selectedIds);
  const visibleItems = safeState.items.filter((item) => item.visible !== false);

  host.innerHTML = `
    <div class="ttp-labels-delete-target" data-labels-delete-target aria-hidden="true" hidden>
      <span class="ttp-material-icon" aria-hidden="true">delete</span>
      <strong>Supprimer</strong>
    </div>
    <section class="ttp-labels-layer" data-labels-layer aria-label="Étiquettes projetées">
      <div class="ttp-labels-selection-box" data-labels-selection-box data-free-selection-box aria-hidden="true" hidden></div>
      ${visibleItems.map((item) => `
        <button
          class="ttp-label-item${locked ? " is-locked" : ""}${selected.has(item.id) ? " is-selected" : ""}"
          type="button"
          data-label-id="${escapeAttr(item.id)}" data-free-object-id="${escapeAttr(item.id)}"
          aria-disabled="${locked ? "true" : "false"}"
          aria-pressed="${selected.has(item.id) ? "true" : "false"}"
          style="left:${formatPercent(item.x)};top:${formatPercent(item.y)};${escapeAttr(labelStyle)}"
        ><span class="ttp-label-content">${renderLabelText(item.text)}</span></button>
      `).join("")}
    </section>
  `;

  const layer = host.querySelector("[data-labels-layer]");
  bindFreeObjectInteractions({
    host,
    layer,
    items:safeState.items,
    selectedIds:safeState.selectedIds,
    snapEnabled:safeState.snapEnabled,
    objectSelector:"[data-label-id]",
    selectionBoxSelector:"[data-labels-selection-box]",
    getId:(element) => String(element?.dataset?.labelId || ""),
    dropZones:[{
      id:"delete",
      selector:"[data-labels-delete-target]",
      readyClass:"is-delete-ready",
      nearClass:"is-delete-near",
      hotClass:"is-delete-hot"
    }],
    onSelection:(ids) => sendAction?.("set-selection", { labelIds:ids }),
    onPositions:(positions, selectedIds) => sendAction?.("set-label-positions", {
      positions:positions.map((position) => ({ labelId:position.id, x:position.x, y:position.y })),
      selectedIds
    }),
    onDrop:(zoneId, ids) => {
      if (zoneId === "delete") sendAction?.("delete-labels", { labelIds:ids });
    }
  });

  scheduleMeasuredPlacement({ host, state: safeState, sendAction });
}
