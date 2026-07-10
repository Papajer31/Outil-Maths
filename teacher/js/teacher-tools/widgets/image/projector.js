import {
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  IMAGE_ZOOM_STEP,
  getMaxImageOffset,
  normalizeImageState
} from "./model.js";
import {
  formatImageZoom,
  prepareImageFilePayload,
  prepareImageUrlPayload
} from "./source.js";

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const escapeAttr = escapeHtml;

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, digits = 3){
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function getImagePanBounds(viewport, state = {}){
  const zoom = Number(state.zoom) || 1;
  if (!viewport || zoom <= 1) return { x: 0, y: 0 };

  const rect = viewport.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) return { x: getMaxImageOffset(zoom), y: getMaxImageOffset(zoom) };

  const naturalWidth = Math.max(0, Number(state.naturalWidth) || 0);
  const naturalHeight = Math.max(0, Number(state.naturalHeight) || 0);
  let imageWidth = rect.width;
  let imageHeight = rect.height;

  if (state.preserveProportions !== false && naturalWidth > 0 && naturalHeight > 0) {
    const imageRatio = naturalWidth / naturalHeight;
    const viewportRatio = rect.width / rect.height;
    if (imageRatio >= viewportRatio) {
      imageWidth = rect.width;
      imageHeight = rect.width / imageRatio;
    } else {
      imageHeight = rect.height;
      imageWidth = rect.height * imageRatio;
    }
  }

  return {
    x: round(Math.max(0, ((imageWidth * zoom) - rect.width) / (2 * rect.width)), 3),
    y: round(Math.max(0, ((imageHeight * zoom) - rect.height) / (2 * rect.height)), 3)
  };
}

function clampImageOffset(value, max){
  return round(clamp(value, -max, max), 3);
}

function getBoundedImageState(viewport, state){
  const safeState = normalizeImageState(state);
  const bounds = getImagePanBounds(viewport, safeState);
  return {
    ...safeState,
    offsetX: clampImageOffset(safeState.offsetX, bounds.x),
    offsetY: clampImageOffset(safeState.offsetY, bounds.y)
  };
}

function setImageStageTransform(stage, offsetX, offsetY, zoom){
  if (!stage) return;
  const image = stage.querySelector?.(".ttp-image-img");
  stage.style.transform = `translate3d(${Number(offsetX || 0) * 100}%, ${Number(offsetY || 0) * 100}%, 0)`;
  if (image) image.style.transform = `scale(${Number(zoom) || 1})`;
}

function syncViewerDragState(viewer, state){
  if (!viewer) return;
  viewer.classList.toggle("is-zoomed", state.zoom > 1);
  viewer.classList.toggle("is-stretched", state.preserveProportions === false);
  if (state.zoom > 1) {
    viewer.setAttribute("data-no-widget-drag", "");
  } else {
    viewer.removeAttribute("data-no-widget-drag");
  }
}

function syncLoadWarning(viewer, message){
  if (!viewer) return;
  const safeMessage = String(message || "").trim();
  let warning = viewer.querySelector(".ttp-image-load-warning");
  if (!safeMessage) {
    warning?.remove();
    return;
  }
  if (!warning) {
    warning = document.createElement("div");
    warning.className = "ttp-image-load-warning";
    viewer.append(warning);
  }
  warning.textContent = safeMessage;
}

function bindImageWheel(viewer){
  if (!viewer || viewer.__ttpImageWheelBound) return;
  viewer.__ttpImageWheelBound = true;
  viewer.addEventListener("wheel", (event) => {
    const delta = event.deltaY < 0 ? IMAGE_ZOOM_STEP : -IMAGE_ZOOM_STEP;
    viewer.__ttpImageSendAction?.("adjust-zoom", { delta });
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
}

function bindImagePan({ viewport, imageStage } = {}){
  if (!viewport || !imageStage || viewport.__ttpImagePanBound) return;
  viewport.__ttpImagePanBound = true;
  viewport.addEventListener("pointerdown", (event) => {
    const state = getBoundedImageState(viewport, viewport.__ttpImageState);
    if (!state.source || state.zoom <= 1) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target?.closest?.("button, input, label, a, [data-widget-action]")) return;

    const rect = viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startOffsetX = Number(state.offsetX) || 0;
    const startOffsetY = Number(state.offsetY) || 0;
    const zoom = Number(state.zoom) || 1;
    const bounds = getImagePanBounds(viewport, state);
    let nextOffsetX = startOffsetX;
    let nextOffsetY = startOffsetY;
    let didMove = false;

    const move = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) / rect.width;
      const dy = (moveEvent.clientY - startY) / rect.height;
      nextOffsetX = clampImageOffset(startOffsetX + dx, bounds.x);
      nextOffsetY = clampImageOffset(startOffsetY + dy, bounds.y);
      didMove = true;
      setImageStageTransform(imageStage, nextOffsetX, nextOffsetY, zoom);
      moveEvent.preventDefault();
    };

    const end = (endEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      try { viewport.releasePointerCapture?.(event.pointerId); } catch {}
      if (didMove && endEvent.type !== "pointercancel") {
        viewport.__ttpImageSendAction?.("set-offset", { offsetX: nextOffsetX, offsetY: nextOffsetY });
      }
      endEvent.preventDefault();
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    try { viewport.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
    event.stopPropagation();
  });
}

function syncExistingImageViewer({ host, state, sendAction } = {}){
  const viewer = host?.querySelector?.(".ttp-image-viewer");
  const imageStage = viewer?.querySelector?.(".ttp-image-stage");
  const image = viewer?.querySelector?.(".ttp-image-img");
  if (!viewer || !imageStage || !image) return false;
  if (image.getAttribute("src") !== state.source) return false;

  const boundedState = getBoundedImageState(viewer, state);
  viewer.__ttpImageState = boundedState;
  viewer.__ttpImageSendAction = sendAction;
  syncViewerDragState(viewer, boundedState);
  syncLoadWarning(viewer, boundedState.loadError);
  image.alt = boundedState.imageName || "Image projetée";
  setImageStageTransform(imageStage, boundedState.offsetX, boundedState.offsetY, boundedState.zoom);
  bindImageWheel(viewer);
  bindImagePan({ viewport: viewer, imageStage });
  return true;
}

async function sendImageFromFile(file, sendAction){
  if (!file) return;
  try {
    const payload = await prepareImageFilePayload(file);
    sendAction?.("set-image", payload);
  } catch (error) {
    sendAction?.("set-load-error", { message: error?.message || "Impossible de charger cette image." });
  }
}

async function sendImageFromUrl(root, sendAction){
  const input = root?.querySelector("[data-image-url]");
  try {
    const payload = await prepareImageUrlPayload(input?.value);
    sendAction?.("set-image", payload);
  } catch (error) {
    sendAction?.("set-load-error", { message: error?.message || "Impossible de charger cette URL d'image." });
  }
}

function renderChromeControls({ chromeHost, state, sendAction } = {}){
  if (!chromeHost) return;
  if (!state.source) {
    chromeHost.innerHTML = "";
    return;
  }

  chromeHost.innerHTML = `
    <button class="ttp-widget-icon-btn ttp-material-icon" type="button" data-widget-action data-image-action="zoom-out" title="Zoom arrière" aria-label="Zoom arrière" ${state.zoom <= IMAGE_ZOOM_MIN ? "disabled" : ""}>zoom_out</button>
    <button class="ttp-image-zoom-label" type="button" data-widget-action data-image-action="center" title="Revenir à 100 %" aria-label="Revenir à 100 %">${escapeHtml(formatImageZoom(state.zoom))}</button>
    <button class="ttp-widget-icon-btn ttp-material-icon" type="button" data-widget-action data-image-action="zoom-in" title="Zoom avant" aria-label="Zoom avant" ${state.zoom >= IMAGE_ZOOM_MAX ? "disabled" : ""}>zoom_in</button>
    <label class="ttp-image-proportions-toggle" data-widget-action>
      <input type="checkbox" data-image-preserve-proportions ${state.preserveProportions ? "checked" : ""}>
      <span>Proportions</span>
    </label>
    <button class="ttp-widget-icon-btn ttp-material-icon" type="button" data-widget-action data-image-action="clear" title="Retirer l’image" aria-label="Retirer l’image">delete</button>
  `;
  chromeHost.querySelector("[data-image-action='zoom-out']")?.addEventListener("click", () => sendAction?.("adjust-zoom", { delta: -IMAGE_ZOOM_STEP }));
  chromeHost.querySelector("[data-image-action='zoom-in']")?.addEventListener("click", () => sendAction?.("adjust-zoom", { delta: IMAGE_ZOOM_STEP }));
  chromeHost.querySelector("[data-image-action='center']")?.addEventListener("click", () => sendAction?.("center"));
  chromeHost.querySelector("[data-image-action='clear']")?.addEventListener("click", () => sendAction?.("clear-image"));
  chromeHost.querySelector("[data-image-preserve-proportions]")?.addEventListener("change", (event) => {
    sendAction?.("set-preserve-proportions", {
      preserveProportions: event.currentTarget.checked === true
    });
  });
}

export function renderImageProjector({ host, chromeHost, widgetInfoHost, state, sendAction } = {}){
  if (!host) return;
  const safeState = normalizeImageState(state);
  const hasImage = Boolean(safeState.source);
  host.closest?.(".ttp-widget-frame")?.classList.toggle("has-empty-image", !hasImage);
  const maxOffset = getMaxImageOffset(safeState.zoom);
  renderChromeControls({ chromeHost, state: safeState, sendAction });

  if (widgetInfoHost) {
    widgetInfoHost.textContent = hasImage
      ? `${formatImageZoom(safeState.zoom)}${maxOffset > 0 ? " · image déplaçable" : ""}`
      : "Aucune image";
  }

  if (!hasImage) {
    host.innerHTML = `
      <section class="ttp-image-empty">
        <div class="ttp-image-empty-card">
          <span class="ttp-material-icon" aria-hidden="true">image</span>
          <strong>Ajouter une image</strong>
          <p>Choisis une image locale ou colle l’URL directe d’une image.</p>
          ${safeState.loadError ? `<p class="ttp-image-error">${escapeHtml(safeState.loadError)}</p>` : ""}
          <div class="ttp-image-empty-actions">
            <label class="ttp-image-file-btn" data-widget-action>
              <span class="ttp-material-icon" aria-hidden="true">upload_file</span>
              <span>Choisir une image</span>
              <input type="file" accept="image/*" data-image-file>
            </label>
            <div class="ttp-image-url-row" data-widget-action>
              <input type="url" inputmode="url" placeholder="https://…" data-image-url>
              <button class="ttp-widget-action-btn is-primary" type="button" data-image-load-url>Charger</button>
            </div>
          </div>
        </div>
      </section>
    `;
    const root = host.querySelector(".ttp-image-empty");
    root?.querySelector("[data-image-file]")?.addEventListener("change", (event) => {
      const file = event.currentTarget.files?.[0] || null;
      sendImageFromFile(file, sendAction);
      event.currentTarget.value = "";
    });
    root?.querySelector("[data-image-load-url]")?.addEventListener("click", () => sendImageFromUrl(root, sendAction));
    root?.querySelector("[data-image-url]")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") sendImageFromUrl(root, sendAction);
    });
    return;
  }

  if (syncExistingImageViewer({ host, state: safeState, sendAction })) {
    return;
  }

  host.innerHTML = `
    <section class="ttp-image-viewer ${safeState.zoom > 1 ? "is-zoomed" : ""}${safeState.preserveProportions ? "" : " is-stretched"}" ${safeState.zoom > 1 ? "data-no-widget-drag" : ""}>
      <div class="ttp-image-stage" aria-hidden="true">
        <img class="ttp-image-img" src="${escapeAttr(safeState.source)}" alt="${escapeAttr(safeState.imageName || "Image projetée")}">
      </div>
      ${safeState.loadError ? `<div class="ttp-image-load-warning">${escapeHtml(safeState.loadError)}</div>` : ""}
    </section>
  `;
  const viewer = host.querySelector(".ttp-image-viewer");
  const imageStage = host.querySelector(".ttp-image-stage");
  const image = host.querySelector(".ttp-image-img");
  const boundedState = getBoundedImageState(viewer, safeState);
  if (viewer) {
    viewer.__ttpImageState = boundedState;
    viewer.__ttpImageSendAction = sendAction;
  }
  setImageStageTransform(imageStage, boundedState.offsetX, boundedState.offsetY, boundedState.zoom);

  bindImageWheel(viewer);

  image?.addEventListener("error", () => {
    if (!safeState.loadError) sendAction?.("set-load-error", { message: "Impossible de charger l’image." });
  }, { once: true });
  bindImagePan({ viewport: viewer, imageStage });
}
