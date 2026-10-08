import { escapeAttr } from "../../../dashboard/text-utils.js";
import { bindFreeObjectInteractions, clampFreeObjectValue, escapeFreeObjectCssIdentifier, formatFreeObjectPercent, getFreeObjectGroupBounds } from "../../free-objects/projector-interactions.js";
import { IMAGE_LABELS_MIN_PIXEL_SIZE, expandImageLabelSelection, findImageLabelGroupForSelection, normalizeImageLabelsState } from "./model.js";
import { getImageLabelRendition } from "./renditions.js";

const projectionSessions = new WeakMap();

function createRoot(host){
  host.innerHTML = `
    <div class="ttp-image-labels-root" data-image-labels-root>
      <div class="ttp-image-labels-drop-zones" aria-hidden="true">
        <div class="ttp-image-labels-drop-target is-duplicate" data-free-drop-zone="duplicate" hidden>
          <span class="ttp-material-icon" aria-hidden="true">content_copy</span><strong>Dupliquer</strong>
        </div>
        <div class="ttp-image-labels-drop-target is-group" data-free-drop-zone="group" hidden>
          <span class="ttp-material-icon" aria-hidden="true" data-image-labels-group-zone-icon>layers</span><strong data-image-labels-group-zone-label>Grouper</strong>
        </div>
        <div class="ttp-image-labels-drop-target is-delete" data-free-drop-zone="delete" hidden>
          <span class="ttp-material-icon" aria-hidden="true">delete</span><strong>Supprimer</strong>
        </div>
      </div>
      <section class="ttp-image-labels-layer" data-image-labels-layer aria-label="Étiquettes images">
        <div class="ttp-image-labels-selection-box" data-free-selection-box hidden aria-hidden="true"></div>
        <div class="ttp-image-labels-group-box" data-image-labels-group-box hidden aria-hidden="true">
          <button class="ttp-image-labels-resize-handle is-nw" type="button" data-free-resize-handle="nw" aria-label="Redimensionner"></button>
          <button class="ttp-image-labels-resize-handle is-ne" type="button" data-free-resize-handle="ne" aria-label="Redimensionner"></button>
          <button class="ttp-image-labels-resize-handle is-sw" type="button" data-free-resize-handle="sw" aria-label="Redimensionner"></button>
          <button class="ttp-image-labels-resize-handle is-se" type="button" data-free-resize-handle="se" aria-label="Redimensionner"></button>
        </div>
      </section>
    </div>`;
  return host.querySelector("[data-image-labels-root]");
}

function getOrCreateSession(host){
  let session = projectionSessions.get(host);
  if (session?.root?.isConnected) return session;
  session?.interaction?.destroy?.();
  session?.resizeCleanup?.();
  const root = createRoot(host);
  session = { root, interaction:null, resizeCleanup:null, renditionTokens:new Map() };
  projectionSessions.set(host, session);
  return session;
}

function syncItemElement(element, item, selectionMode){
  const selected = selectionMode === "single";
  element.dataset.freeObjectId = item.id;
  element.className = `ttp-image-label-item${selected ? " is-selected" : ""}`;
  element.setAttribute("aria-pressed", selectionMode !== "none" ? "true" : "false");
  element.setAttribute("aria-label", item.imageName || "Image");
  element.style.left = formatFreeObjectPercent(item.x);
  element.style.top = formatFreeObjectPercent(item.y);
  element.style.width = formatFreeObjectPercent(item.width);
  element.style.height = formatFreeObjectPercent(item.height);
  element.style.zIndex = String(Math.max(1, Number(item.z) || 1));
  const image = element.querySelector("img");
  if (image) image.alt = item.imageName || "";
}

function createItemElement(item){
  const element = document.createElement("button");
  element.type = "button";
  element.className = "ttp-image-label-item";
  element.innerHTML = `<img alt="${escapeAttr(item.imageName || "")}" draggable="false" decoding="async">`;
  return element;
}

function syncItems(session, state){
  const layer = session.root.querySelector("[data-image-labels-layer]");
  const selected = new Set(state.selectedIds);
  const singleSelectedId = state.selectedIds.length === 1 ? String(state.selectedIds[0] || "") : "";
  const wanted = new Set(state.items.filter((item) => item.visible !== false).map((item) => item.id));
  layer.querySelectorAll("[data-free-object-id]").forEach((element) => {
    const id = String(element.dataset.freeObjectId || "");
    if (!wanted.has(id)) element.remove();
  });

  const selectionBox = layer.querySelector("[data-free-selection-box]");
  for (const item of state.items) {
    if (item.visible === false) continue;
    let element = layer.querySelector(`[data-free-object-id="${escapeFreeObjectCssIdentifier(item.id)}"]`);
    if (!element) {
      element = createItemElement(item);
      layer.insertBefore(element, selectionBox);
    }
    const mode = selected.has(item.id) ? (singleSelectedId && singleSelectedId === item.id ? "single" : "multi") : "none";
    syncItemElement(element, item, mode);
    const rect = element.getBoundingClientRect?.();
    const token = `${item.source}|${Math.round(rect?.width || 0)}|${Math.round(rect?.height || 0)}|${item.naturalWidth}x${item.naturalHeight}`;
    if (session.renditionTokens.get(item.id) !== token) {
      session.renditionTokens.set(item.id, token);
      const image = element.querySelector("img");
      void getImageLabelRendition(item, rect?.width || 180, rect?.height || 180).then((rendition) => {
        if (!element.isConnected || session.renditionTokens.get(item.id) !== token) return;
        const target = element.querySelector("img");
        if (target && rendition) target.src = rendition;
      });
    }
  }
  for (const id of [...session.renditionTokens.keys()]) if (!wanted.has(id)) session.renditionTokens.delete(id);
}

function positionGroupBox(session, state){
  const layer = session.root.querySelector("[data-image-labels-layer]");
  const box = session.root.querySelector("[data-image-labels-group-box]");
  if (!layer || !box) return;
  const selected = new Set(state.selectedIds);
  const layerRect = layer.getBoundingClientRect?.();
  const entries = Array.from(layer.querySelectorAll("[data-free-object-id]")).map((element) => {
    const id = String(element.dataset.freeObjectId || "");
    if (!selected.has(id)) return null;
    const rect = element.getBoundingClientRect?.();
    if (!rect?.width || !rect?.height) return null;
    return { id, element, left:rect.left-layerRect.left, top:rect.top-layerRect.top, width:rect.width, height:rect.height };
  }).filter(Boolean);
  const bounds = getFreeObjectGroupBounds(entries);
  if (!bounds || !entries.length) {
    box.hidden = true;
    box.classList.remove("is-single");
    layer.classList.remove("has-multi-selection");
    return;
  }
  const isSingle = entries.length === 1;
  box.hidden = false;
  box.classList.toggle("is-single", isSingle);
  layer.classList.toggle("has-multi-selection", !isSingle);
  box.style.left = `${bounds.left}px`;
  box.style.top = `${bounds.top}px`;
  box.style.width = `${bounds.width}px`;
  box.style.height = `${bounds.height}px`;
}

function syncSelectionVisual(session, ids = []){
  const layer = session.root.querySelector("[data-image-labels-layer]");
  if (!layer) return;
  const selectedIds = (Array.isArray(ids) ? ids : []).map(String);
  const selected = new Set(selectedIds);
  const singleId = selectedIds.length === 1 ? selectedIds[0] : "";
  layer.querySelectorAll("[data-free-object-id]").forEach((element) => {
    const id = String(element.dataset.freeObjectId || "");
    element.classList.toggle("is-selected", Boolean(singleId) && id === singleId);
    element.setAttribute("aria-pressed", selected.has(id) ? "true" : "false");
  });
  positionGroupBox(session, { selectedIds });
}


function getGroupDropDescriptor(state, ids = []){
  const expanded = expandImageLabelSelection(state, ids, { visibleOnly:true });
  const group = findImageLabelGroupForSelection(state, expanded);
  if (group) return { label:"Dégrouper", icon:"layers_clear", action:"ungroup", ids:expanded };
  if (expanded.length >= 2) return { label:"Grouper", icon:"layers", action:"group", ids:expanded };
  return { label:"Grouper", icon:"layers", action:"group", ids:expanded };
}

function updateGroupDropZone(session, state, ids = []){
  const descriptor = getGroupDropDescriptor(state, ids);
  const label = session.root.querySelector('[data-image-labels-group-zone-label]');
  const icon = session.root.querySelector('[data-image-labels-group-zone-icon]');
  const zone = session.root.querySelector('[data-free-drop-zone="group"]');
  if (label) label.textContent = descriptor.label;
  if (icon) icon.textContent = descriptor.icon;
  if (zone) zone.dataset.imageLabelsGroupAction = descriptor.action;
  return descriptor;
}

function bindResize(session, state, sendAction){
  session.resizeCleanup?.();
  session.resizeCleanup = null;
  const layer = session.root.querySelector("[data-image-labels-layer]");
  const box = session.root.querySelector("[data-image-labels-group-box]");
  if (!layer || !box || !state.selectedIds.length) return;

  const listeners = [];
  const listen = (node, type, fn) => { node.addEventListener(type, fn); listeners.push(() => node.removeEventListener(type, fn)); };

  box.querySelectorAll("[data-free-resize-handle]").forEach((handle) => {
    listen(handle, "pointerdown", (event) => {
      if (event.button !== undefined && event.button !== 0) return;
      const direction = String(handle.dataset.freeResizeHandle || "se");
      const layerRect = layer.getBoundingClientRect?.();
      if (!layerRect?.width || !layerRect?.height) return;
      const selected = new Set(state.selectedIds);
      const entries = Array.from(layer.querySelectorAll("[data-free-object-id]")).map((element) => {
        const id = String(element.dataset.freeObjectId || "");
        if (!selected.has(id)) return null;
        const rect = element.getBoundingClientRect?.();
        if (!rect?.width || !rect?.height) return null;
        return { id, element, left:rect.left-layerRect.left, top:rect.top-layerRect.top, width:rect.width, height:rect.height };
      }).filter(Boolean);
      const bounds = getFreeObjectGroupBounds(entries);
      if (!bounds) return;
      const anchorX = direction.includes("w") ? bounds.right : bounds.left;
      const anchorY = direction.includes("n") ? bounds.bottom : bounds.top;
      const startX = direction.includes("w") ? bounds.left : bounds.right;
      const startY = direction.includes("n") ? bounds.top : bounds.bottom;
      const startDistance = Math.max(1, Math.hypot(startX-anchorX, startY-anchorY));
      const minScale = Math.max(...entries.map((entry) => Math.max(IMAGE_LABELS_MIN_PIXEL_SIZE/entry.width, IMAGE_LABELS_MIN_PIXEL_SIZE/entry.height)));
      let latest = entries.map((entry) => ({ id:entry.id }));

      const maxScaleX = direction.includes("w")
        ? (anchorX / Math.max(1, anchorX-bounds.left))
        : ((layerRect.width-anchorX) / Math.max(1, bounds.right-anchorX));
      const maxScaleY = direction.includes("n")
        ? (anchorY / Math.max(1, anchorY-bounds.top))
        : ((layerRect.height-anchorY) / Math.max(1, bounds.bottom-anchorY));
      const maxScale = Math.max(minScale, Math.min(maxScaleX, maxScaleY, 8));

      const move = (moveEvent) => {
        const px = clampFreeObjectValue(moveEvent.clientX-layerRect.left, 0, layerRect.width);
        const py = clampFreeObjectValue(moveEvent.clientY-layerRect.top, 0, layerRect.height);
        let scale = Math.hypot(px-anchorX, py-anchorY) / startDistance;
        scale = clampFreeObjectValue(scale, minScale, maxScale);
        latest = entries.map((entry) => {
          const left = anchorX + (entry.left-anchorX)*scale;
          const top = anchorY + (entry.top-anchorY)*scale;
          const width = entry.width*scale;
          const height = entry.height*scale;
          entry.element.style.left = `${(left/layerRect.width)*100}%`;
          entry.element.style.top = `${(top/layerRect.height)*100}%`;
          entry.element.style.width = `${(width/layerRect.width)*100}%`;
          entry.element.style.height = `${(height/layerRect.height)*100}%`;
          return { id:entry.id, x:left/layerRect.width, y:top/layerRect.height, width:width/layerRect.width, height:height/layerRect.height };
        });
        positionGroupBox(session, { ...state, selectedIds:[...selected] });
        moveEvent.preventDefault();
      };
      const end = (endEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
        window.removeEventListener("pointercancel", end);
        if (endEvent.type !== "pointercancel") sendAction?.("set-geometries", { items:latest, selectedIds:[...selected] });
        endEvent.preventDefault();
      };
      window.addEventListener("pointermove", move, { passive:false });
      window.addEventListener("pointerup", end);
      window.addEventListener("pointercancel", end);
      try { handle.setPointerCapture?.(event.pointerId); } catch {}
      event.preventDefault();
      event.stopPropagation();
    });
  });
  session.resizeCleanup = () => listeners.splice(0).forEach((fn) => { try { fn(); } catch {} });
}

export function renderImageLabelsProjector({ host, state, sendAction } = {}){
  if (!host) return;
  const safeState = normalizeImageLabelsState(state);
  const session = getOrCreateSession(host);
  syncItems(session, safeState);
  positionGroupBox(session, safeState);
  updateGroupDropZone(session, safeState, safeState.selectedIds);
  session.interaction?.destroy?.();
  const layer = session.root.querySelector("[data-image-labels-layer]");
  session.interaction = bindFreeObjectInteractions({
    host:session.root,
    layer,
    items:safeState.items,
    selectedIds:safeState.selectedIds,
    snapEnabled:safeState.snapEnabled,
    dropZones:[
      { id:"duplicate", selector:'[data-free-drop-zone="duplicate"]' },
      { id:"group", selector:'[data-free-drop-zone="group"]' },
      { id:"delete", selector:'[data-free-drop-zone="delete"]' }
    ],
    normalizeSelectionIds:(ids) => expandImageLabelSelection(safeState, ids, { visibleOnly:true }),
    onDragContextChange:({ dragIds = [] } = {}) => {
      updateGroupDropZone(session, safeState, dragIds);
      if (dragIds.length) syncSelectionVisual(session, dragIds);
    },
    onSelection:(ids) => {
      syncSelectionVisual(session, ids);
      sendAction?.("set-selection", { itemIds:ids });
    },
    onPositions:(positions, selectedIds) => sendAction?.("set-positions", { positions, selectedIds }),
    onDrop:(zoneId, ids) => {
      if (zoneId === "duplicate") sendAction?.("duplicate-items", { itemIds:ids });
      if (zoneId === "delete") sendAction?.("delete-items", { itemIds:ids });
      if (zoneId === "group") {
        const descriptor = getGroupDropDescriptor(safeState, ids);
        if (descriptor.action === "ungroup") sendAction?.("ungroup-items", { itemIds:ids });
        else if (descriptor.ids.length >= 2) sendAction?.("group-items", { itemIds:descriptor.ids });
      }
    }
  });
  bindResize(session, safeState, sendAction);
}

export function disposeImageLabelsProjector({ host } = {}){
  const session = host ? projectionSessions.get(host) : null;
  if (!session) return;
  session.interaction?.destroy?.();
  session.resizeCleanup?.();
  projectionSessions.delete(host);
}
