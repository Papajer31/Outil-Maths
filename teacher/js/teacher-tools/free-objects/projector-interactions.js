const DEFAULT_DRAG_THRESHOLD_PX = 3;
const DEFAULT_SNAP_THRESHOLD_PX = 12;
const DEFAULT_DROP_NEAR_DISTANCE_PX = 150;

export function clampFreeObjectValue(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

export function formatFreeObjectPercent(value){
  return `${Number((Number(value) || 0) * 100).toFixed(4)}%`;
}

export function escapeFreeObjectCssIdentifier(value){
  try {
    if (typeof CSS?.escape === "function") return CSS.escape(String(value || ""));
  } catch {}
  return String(value || "").replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export function getFreeObjectGroupBounds(entries = []){
  if (!entries.length) return null;
  const left = Math.min(...entries.map((entry) => entry.left));
  const top = Math.min(...entries.map((entry) => entry.top));
  const right = Math.max(...entries.map((entry) => entry.left + entry.width));
  const bottom = Math.max(...entries.map((entry) => entry.top + entry.height));
  return { left, top, right, bottom, width:right - left, height:bottom - top };
}

function pointInside(clientX, clientY, rect){
  return Boolean(rect) && clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
}

function distanceToRect(clientX, clientY, rect){
  if (!rect) return Number.POSITIVE_INFINITY;
  const dx = clientX < rect.left ? rect.left - clientX : (clientX > rect.right ? clientX - rect.right : 0);
  const dy = clientY < rect.top ? rect.top - clientY : (clientY > rect.bottom ? clientY - rect.bottom : 0);
  return Math.hypot(dx, dy);
}

function rectsIntersect(a, b){
  if (!a || !b) return false;
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
}

function getContainerRect(layer){
  return layer?.getBoundingClientRect?.() || null;
}

function clampGroupDelta(bounds, dx, dy, containerRect){
  if (!bounds || !containerRect?.width || !containerRect?.height) return { dx:0, dy:0 };
  return {
    dx:clampFreeObjectValue(dx, -bounds.left, containerRect.width - bounds.right),
    dy:clampFreeObjectValue(dy, -bounds.top, containerRect.height - bounds.bottom)
  };
}

function normalizeDropZones(host, dropZones = []){
  return (Array.isArray(dropZones) ? dropZones : []).map((zone) => {
    const id = String(zone?.id || "").trim();
    const selector = String(zone?.selector || "").trim();
    const element = selector ? host?.querySelector?.(selector) : null;
    return id && element ? {
      id,
      element,
      nearDistance:Number.isFinite(Number(zone.nearDistance)) ? Math.max(0, Number(zone.nearDistance)) : DEFAULT_DROP_NEAR_DISTANCE_PX,
      readyClass:String(zone.readyClass || "is-drop-ready"),
      nearClass:String(zone.nearClass || "is-drop-near"),
      hotClass:String(zone.hotClass || "is-drop-hot")
    } : null;
  }).filter(Boolean);
}

function setDropZoneState(zones, { active = false, clientX = 0, clientY = 0 } = {}){
  let hotZoneId = "";
  for (const zone of zones) {
    const rect = zone.element.getBoundingClientRect?.();
    const hot = active && pointInside(clientX, clientY, rect);
    const near = active && (hot || distanceToRect(clientX, clientY, rect) <= zone.nearDistance);
    zone.element.hidden = !active;
    zone.element.classList.toggle(zone.readyClass, active);
    zone.element.classList.toggle(zone.nearClass, active && near && !hot);
    zone.element.classList.toggle(zone.hotClass, active && hot);
    zone.element.setAttribute("aria-hidden", active ? "false" : "true");
    if (hot) hotZoneId = zone.id;
  }
  return hotZoneId;
}

function getEntries({ layer, itemsById, ids, objectSelector, getId } = {}){
  const rect = getContainerRect(layer);
  if (!rect?.width || !rect?.height) return [];
  const wanted = new Set(ids || []);
  return Array.from(layer.querySelectorAll(objectSelector)).map((element) => {
    const id = getId(element);
    if (!id || !wanted.has(id)) return null;
    const item = itemsById.get(id);
    const objectRect = element.getBoundingClientRect?.();
    if (!item || !objectRect?.width || !objectRect?.height) return null;
    return {
      id,
      item,
      element,
      left:objectRect.left - rect.left,
      top:objectRect.top - rect.top,
      width:objectRect.width,
      height:objectRect.height
    };
  }).filter(Boolean);
}

function setLocalSelection({ layer, objectSelector, getId, selectedIds } = {}){
  const selected = new Set(selectedIds || []);
  layer?.querySelectorAll?.(objectSelector).forEach((element) => {
    const active = selected.has(getId(element));
    element.classList.toggle("is-selected", active);
    element.setAttribute("aria-pressed", active ? "true" : "false");
  });
}

function snapDelta({ layer, objectSelector, getId, movingIds, bounds, delta, threshold } = {}){
  const containerRect = getContainerRect(layer);
  if (!containerRect?.width || !containerRect?.height || !bounds) return delta;
  let dx = Number(delta?.dx) || 0;
  let dy = Number(delta?.dy) || 0;
  const moving = movingIds instanceof Set ? movingIds : new Set(movingIds || []);
  const targetX = [];
  const targetY = [];

  layer.querySelectorAll(objectSelector).forEach((element) => {
    const id = getId(element);
    if (!id || moving.has(id)) return;
    const rect = element.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return;
    targetX.push(rect.left - containerRect.left, rect.right - containerRect.left);
    targetY.push(rect.top - containerRect.top, rect.bottom - containerRect.top);
  });

  let bestX = null;
  for (const own of [bounds.left + dx, bounds.right + dx]) {
    for (const target of targetX) {
      const correction = target - own;
      if (Math.abs(correction) <= threshold && (bestX == null || Math.abs(correction) < Math.abs(bestX))) bestX = correction;
    }
  }
  if (bestX != null) dx += bestX;

  let bestY = null;
  for (const own of [bounds.top + dy, bounds.bottom + dy]) {
    for (const target of targetY) {
      const correction = target - own;
      if (Math.abs(correction) <= threshold && (bestY == null || Math.abs(correction) < Math.abs(bestY))) bestY = correction;
    }
  }
  if (bestY != null) dy += bestY;
  return clampGroupDelta(bounds, dx, dy, containerRect);
}

function applyPosition(element, x, y){
  if (!element) return;
  element.style.left = formatFreeObjectPercent(x);
  element.style.top = formatFreeObjectPercent(y);
}

export function bindFreeObjectInteractions({
  host,
  layer,
  items = [],
  selectedIds = [],
  snapEnabled = true,
  objectSelector = "[data-free-object-id]",
  selectionBoxSelector = "[data-free-selection-box]",
  getId = (element) => String(element?.dataset?.freeObjectId || ""),
  dragThreshold = DEFAULT_DRAG_THRESHOLD_PX,
  snapThreshold = DEFAULT_SNAP_THRESHOLD_PX,
  dropZones = [],
  onSelection,
  onPositions,
  onDrop,
  normalizeSelectionIds,
  onDragContextChange
} = {}){
  if (!host || !layer) return { destroy(){} };
  const itemsById = new Map((Array.isArray(items) ? items : []).map((item) => [String(item?.id || ""), item]));
  const safeSelectedIds = (Array.isArray(selectedIds) ? selectedIds : []).map(String).filter(Boolean);
  const zones = normalizeDropZones(host, dropZones);
  const cleanup = [];

  function listen(target, type, handler, options){
    target?.addEventListener?.(type, handler, options);
    cleanup.push(() => target?.removeEventListener?.(type, handler, options));
  }

  const startObjectDrag = (event, element) => {
    if (event.button !== undefined && event.button !== 0) return;
    if (event.target?.closest?.("[data-free-resize-handle]")) return;
    const itemId = getId(element);
    const item = itemsById.get(itemId);
    if (!item) return;
    const containerRect = getContainerRect(layer);
    if (!containerRect?.width || !containerRect?.height) return;

    const selectedSet = new Set(safeSelectedIds);
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    const wasSelected = selectedSet.has(itemId);
    const baseDragIds = wasSelected && safeSelectedIds.length
      ? safeSelectedIds.slice()
      : (additive ? [...new Set([...safeSelectedIds, itemId])] : [itemId]);
    const dragIds = typeof normalizeSelectionIds === "function"
      ? (normalizeSelectionIds(baseDragIds.slice(), { trigger:"drag-start", sourceId:itemId, selectedIds:safeSelectedIds.slice(), additive }) || []).map(String)
      : baseDragIds.slice();
    const moving = new Set(dragIds);
    const entries = getEntries({ layer, itemsById, ids:dragIds, objectSelector, getId });
    const anchor = entries.find((entry) => entry.id === itemId) || entries[0];
    const bounds = getFreeObjectGroupBounds(entries);
    if (!anchor || !bounds) return;

    const offsetX = event.clientX - (containerRect.left + anchor.left);
    const offsetY = event.clientY - (containerRect.top + anchor.top);
    let latest = entries.map((entry) => ({ id:entry.id, x:Number(entry.item.x) || 0, y:Number(entry.item.y) || 0 }));
    let didMove = false;
    let hotZoneId = "";

    entries.forEach((entry) => entry.element.classList.add("is-dragging"));
    if (!wasSelected) setLocalSelection({ layer, objectSelector, getId, selectedIds:dragIds });
    onDragContextChange?.({ active:false, dragIds:dragIds.slice(), hotZoneId:"" });

    const move = (moveEvent) => {
      if (!didMove && Math.hypot(moveEvent.clientX - event.clientX, moveEvent.clientY - event.clientY) < dragThreshold) {
        moveEvent.preventDefault();
        return;
      }
      if (!didMove) didMove = true;

      const desiredLeft = moveEvent.clientX - containerRect.left - offsetX;
      const desiredTop = moveEvent.clientY - containerRect.top - offsetY;
      let delta = clampGroupDelta(bounds, desiredLeft - anchor.left, desiredTop - anchor.top, containerRect);
      if (snapEnabled) delta = snapDelta({ layer, objectSelector, getId, movingIds:moving, bounds, delta, threshold:snapThreshold });

      latest = entries.map((entry) => {
        const x = clampFreeObjectValue((entry.left + delta.dx) / containerRect.width, 0, Math.max(0, 1 - (entry.width / containerRect.width)));
        const y = clampFreeObjectValue((entry.top + delta.dy) / containerRect.height, 0, Math.max(0, 1 - (entry.height / containerRect.height)));
        applyPosition(entry.element, x, y);
        return { id:entry.id, x, y };
      });
      hotZoneId = setDropZoneState(zones, { active:true, clientX:moveEvent.clientX, clientY:moveEvent.clientY });
      onDragContextChange?.({ active:true, dragIds:dragIds.slice(), hotZoneId });
      moveEvent.preventDefault();
    };

    const end = (endEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      try { element.releasePointerCapture?.(event.pointerId); } catch {}
      entries.forEach((entry) => entry.element.classList.remove("is-dragging"));
      setDropZoneState(zones, { active:false });
      onDragContextChange?.({ active:false, dragIds:dragIds.slice(), hotZoneId:"" });

      if (endEvent.type === "pointercancel") {
        entries.forEach((entry) => applyPosition(entry.element, entry.item.x, entry.item.y));
        setLocalSelection({ layer, objectSelector, getId, selectedIds:safeSelectedIds });
      } else if (!didMove) {
        let nextSelection;
        if (additive) {
          const next = new Set(safeSelectedIds);
          if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
          nextSelection = [...next];
        } else nextSelection = [itemId];
        if (typeof normalizeSelectionIds === "function") nextSelection = (normalizeSelectionIds(nextSelection, { trigger:"selection", sourceId:itemId, selectedIds:safeSelectedIds.slice(), additive }) || []).map(String);
        onSelection?.(nextSelection);
      } else if (hotZoneId) {
        entries.forEach((entry) => applyPosition(entry.element, entry.item.x, entry.item.y));
        onDrop?.(hotZoneId, dragIds.slice());
      } else {
        onPositions?.(latest, dragIds.slice());
      }
      endEvent.preventDefault();
    };

    window.addEventListener("pointermove", move, { passive:false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    try { element.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
    event.stopPropagation();
  };

  layer.querySelectorAll(objectSelector).forEach((element) => {
    const handler = (event) => startObjectDrag(event, element);
    listen(element, "pointerdown", handler);
  });

  const startMarquee = (event) => {
    if (event.target !== layer || (event.button !== undefined && event.button !== 0)) return;
    const rect = getContainerRect(layer);
    if (!rect?.width || !rect?.height) return;
    const box = layer.querySelector(selectionBoxSelector);
    const additive = event.ctrlKey || event.metaKey || event.shiftKey;
    const base = additive ? new Set(safeSelectedIds) : new Set();
    let current = new Set(base);
    let didMove = false;
    const startX = clampFreeObjectValue(event.clientX - rect.left, 0, rect.width);
    const startY = clampFreeObjectValue(event.clientY - rect.top, 0, rect.height);

    const move = (moveEvent) => {
      if (!didMove && Math.hypot(moveEvent.clientX - event.clientX, moveEvent.clientY - event.clientY) < dragThreshold) {
        moveEvent.preventDefault();
        return;
      }
      didMove = true;
      const x = clampFreeObjectValue(moveEvent.clientX - rect.left, 0, rect.width);
      const y = clampFreeObjectValue(moveEvent.clientY - rect.top, 0, rect.height);
      const left = Math.min(startX, x), top = Math.min(startY, y), right = Math.max(startX, x), bottom = Math.max(startY, y);
      if (box) {
        box.hidden = false;
        box.style.left = `${left}px`; box.style.top = `${top}px`; box.style.width = `${right-left}px`; box.style.height = `${bottom-top}px`;
      }
      const selectionRect = { left:rect.left+left, top:rect.top+top, right:rect.left+right, bottom:rect.top+bottom };
      current = new Set(base);
      layer.querySelectorAll(objectSelector).forEach((element) => {
        if (rectsIntersect(selectionRect, element.getBoundingClientRect?.())) current.add(getId(element));
      });
      let localSelection = [...current];
      if (typeof normalizeSelectionIds === "function") localSelection = (normalizeSelectionIds(localSelection, { trigger:"marquee-preview", selectedIds:safeSelectedIds.slice(), additive }) || []).map(String);
      setLocalSelection({ layer, objectSelector, getId, selectedIds:localSelection });
      moveEvent.preventDefault();
    };

    const end = (endEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      try { layer.releasePointerCapture?.(event.pointerId); } catch {}
      if (box) box.hidden = true;
      if (endEvent.type === "pointercancel") setLocalSelection({ layer, objectSelector, getId, selectedIds:safeSelectedIds });
      else if (didMove) {
        let finalSelection = [...current];
        if (typeof normalizeSelectionIds === "function") finalSelection = (normalizeSelectionIds(finalSelection, { trigger:"marquee", selectedIds:safeSelectedIds.slice(), additive }) || []).map(String);
        onSelection?.(finalSelection);
      } else if (!additive) onSelection?.([]);
      endEvent.preventDefault();
    };

    window.addEventListener("pointermove", move, { passive:false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    try { layer.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
  };
  listen(layer, "pointerdown", startMarquee);

  return { destroy(){ cleanup.splice(0).forEach((fn) => { try { fn(); } catch {} }); } };
}
