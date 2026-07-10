import {
  LABELS_FONT_BELLEALLURE,
  getLabelsFontFamilyCss,
  normalizeLabelsState
} from "./model.js";
import { escapeAttr } from "../../../dashboard/text-utils.js";
import { renderSimpleMarkupToHtml } from "../../../../../shared/simple-markup.js";

const LABEL_DRAG_THRESHOLD_PX = 3;
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

function isPointInsideRect(clientX, clientY, rect){
  if (!rect) return false;
  return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function capHandledPlacementRequests(){
  while (handledPlacementRequestIds.size > 40) {
    const first = handledPlacementRequestIds.values().next().value;
    handledPlacementRequestIds.delete(first);
  }
}

function getTrashZone(){
  return document.getElementById("teacherToolsTrashZone");
}

function getTopbar(){
  return document.getElementById("teacherToolsTopbar");
}

function setTrashActive(active, hot = false){
  const trash = getTrashZone();
  getTopbar()?.classList.toggle("is-delete-target-visible", active === true);
  if (!trash) return;
  trash.classList.toggle("is-delete-ready", active === true);
  trash.classList.toggle("is-delete-hot", hot === true);
  trash.setAttribute("aria-pressed", hot ? "true" : "false");
}

function getStageElement(host){
  return host?.closest?.(".ttp-stage") || document.getElementById("teacherToolsProjectorStage") || null;
}

function getNormalizedPositionFromPointer({ event, stage, label, offsetX, offsetY } = {}){
  const stageRect = stage?.getBoundingClientRect?.();
  const labelRect = label?.getBoundingClientRect?.();
  if (!stageRect?.width || !stageRect?.height) return { x: 0, y: 0 };
  const labelWidth = Math.max(0, labelRect?.width || 0);
  const labelHeight = Math.max(0, labelRect?.height || 0);
  const maxX = Math.max(0, 1 - (labelWidth / stageRect.width));
  const maxY = Math.max(0, 1 - (labelHeight / stageRect.height));
  return {
    x: clamp((event.clientX - stageRect.left - offsetX) / stageRect.width, 0, maxX),
    y: clamp((event.clientY - stageRect.top - offsetY) / stageRect.height, 0, maxY)
  };
}

function applyLabelPosition(label, x, y){
  if (!label) return;
  label.style.left = formatPercent(x);
  label.style.top = formatPercent(y);
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

function isLabelsInteractionLocked({ widget, scene } = {}){
  return widget?.locked === true || scene?.locked === true || scene?.scene?.locked === true;
}

function startLabelDrag(event, { host, label, item, sendAction, locked = false } = {}){
  if (!label || !item) return;
  if (event.button !== undefined && event.button !== 0) return;
  if (locked) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const stage = getStageElement(host);
  const labelRect = label.getBoundingClientRect();
  const offsetX = event.clientX - labelRect.left;
  const offsetY = event.clientY - labelRect.top;
  let latestPosition = { x: item.x, y: item.y };
  let isOverTrash = false;
  let didMove = false;

  label.classList.add("is-dragging");

  const move = (moveEvent) => {
    const movedEnough = Math.hypot(moveEvent.clientX - event.clientX, moveEvent.clientY - event.clientY) >= LABEL_DRAG_THRESHOLD_PX;
    if (!didMove && !movedEnough) {
      moveEvent.preventDefault();
      return;
    }
    if (!didMove) {
      didMove = true;
      setTrashActive(true, false);
    }
    latestPosition = getNormalizedPositionFromPointer({
      event: moveEvent,
      stage,
      label,
      offsetX,
      offsetY
    });
    applyLabelPosition(label, latestPosition.x, latestPosition.y);

    const trashRect = getTrashZone()?.getBoundingClientRect?.();
    isOverTrash = isPointInsideRect(moveEvent.clientX, moveEvent.clientY, trashRect);
    setTrashActive(true, isOverTrash);
    moveEvent.preventDefault();
  };

  const end = (endEvent) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    try { label.releasePointerCapture?.(event.pointerId); } catch {}
    label.classList.remove("is-dragging");
    setTrashActive(false, false);

    if (endEvent.type === "pointercancel") {
      applyLabelPosition(label, item.x, item.y);
      endEvent.preventDefault();
      return;
    }

    if (!didMove) {
      endEvent.preventDefault();
      return;
    }

    if (isOverTrash) {
      sendAction?.("delete-label", { labelId: item.id });
      endEvent.preventDefault();
      return;
    }

    sendAction?.("move-label", {
      labelId: item.id,
      x: latestPosition.x,
      y: latestPosition.y
    });
    endEvent.preventDefault();
  };

  window.addEventListener("pointermove", move, { passive: false });
  window.addEventListener("pointerup", end);
  window.addEventListener("pointercancel", end);
  try { label.setPointerCapture?.(event.pointerId); } catch {}
  event.preventDefault();
  event.stopPropagation();
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

export function renderLabelsProjector({ host, widgetInfoHost, state, sendAction, widget, scene } = {}){
  if (!host) return;
  const safeState = normalizeLabelsState(state);
  const labelStyle = renderLabelStyle(safeState.style);
  const locked = isLabelsInteractionLocked({ widget, scene });

  host.innerHTML = `
    <section class="ttp-labels-layer" data-no-widget-drag aria-label="Étiquettes projetées">
      ${safeState.items.map((item) => `
        <button
          class="ttp-label-item${locked ? " is-locked" : ""}"
          type="button"
          data-label-id="${escapeAttr(item.id)}"
          aria-disabled="${locked ? "true" : "false"}"
          style="left:${formatPercent(item.x)};top:${formatPercent(item.y)};${escapeAttr(labelStyle)}"
        ><span class="ttp-label-content">${renderLabelText(item.text)}</span></button>
      `).join("")}
    </section>
  `;

  if (widgetInfoHost) {
    const count = safeState.items.length;
    widgetInfoHost.textContent = `${count} étiquette${count > 1 ? "s" : ""}`;
  }

  host.querySelectorAll("[data-label-id]").forEach((label) => {
    const item = safeState.items.find((entry) => entry.id === label.dataset.labelId);
    label.addEventListener("pointerdown", (event) => {
      startLabelDrag(event, { host, label, item, sendAction, locked });
    });
  });

  scheduleMeasuredPlacement({ host, state: safeState, sendAction });
}
