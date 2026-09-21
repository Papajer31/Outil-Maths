import {
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  IMAGE_ZOOM_STEP,
  normalizeImagePosition,
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

function getBaseImageSize(viewport, state = {}){
  if (state.preserveProportions === false) return { width: 1, height: 1 };
  const naturalWidth = Math.max(0, Number(state.naturalWidth) || 0);
  const naturalHeight = Math.max(0, Number(state.naturalHeight) || 0);
  const rect = viewport?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height || !naturalWidth || !naturalHeight) return { width: 1, height: 1 };

  const imageRatio = naturalWidth / naturalHeight;
  const viewportRatio = rect.width / rect.height;
  if (imageRatio >= viewportRatio) {
    return { width: 1, height: viewportRatio / imageRatio };
  }
  return { width: imageRatio / viewportRatio, height: 1 };
}

/**
 * Convertit la position logique (-1..1) en géométrie relative à la page.
 * Aucune coordonnée persistée ne dépend des pixels ou de la résolution.
 */
function getImageGeometry(viewport, rawState = {}){
  const state = normalizeImageState(rawState);
  const base = getBaseImageSize(viewport, state);
  const zoom = Number(state.zoom) || 1;
  const width = base.width * zoom;
  const height = base.height * zoom;

  if (zoom === 1) {
    return { width, height, centerX: 0.5, centerY: 0.5, travelX: 0, travelY: 0 };
  }

  // Sous 100 % : déplacement dans tout l'espace libre, image toujours entièrement visible.
  // Au-dessus : déplacement uniquement sur les axes où l'image déborde réellement.
  const travelX = zoom < 1 ? Math.max(0, (1 - width) / 2) : Math.max(0, (width - 1) / 2);
  const travelY = zoom < 1 ? Math.max(0, (1 - height) / 2) : Math.max(0, (height - 1) / 2);
  return {
    width,
    height,
    centerX: 0.5 + normalizeImagePosition(state.positionX) * travelX,
    centerY: 0.5 + normalizeImagePosition(state.positionY) * travelY,
    travelX,
    travelY
  };
}

function setImageStageGeometry(stage, viewport, state){
  if (!stage || !viewport) return;
  const geometry = getImageGeometry(viewport, state);
  stage.style.width = `${geometry.width * 100}%`;
  stage.style.height = `${geometry.height * 100}%`;
  stage.style.left = `${geometry.centerX * 100}%`;
  stage.style.top = `${geometry.centerY * 100}%`;
  stage.style.transform = "translate(-50%, -50%)";
}

function syncViewerDragState(viewer, state){
  if (!viewer) return;
  const movable = Boolean(state.source && state.zoom !== 1);
  viewer.classList.toggle("is-zoomed", state.zoom > 1);
  viewer.classList.toggle("is-thumbnail", state.zoom < 1);
  viewer.classList.toggle("is-movable", movable);
  viewer.classList.toggle("is-stretched", state.preserveProportions === false);
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

function bindImageResize(viewer, imageStage){
  if (!viewer || !imageStage || viewer.__ttpImageResizeBound) return;
  viewer.__ttpImageResizeBound = true;
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      setImageStageGeometry(imageStage, viewer, viewer.__ttpImageState);
    });
    observer.observe(viewer);
    viewer.__ttpImageResizeObserver = observer;
  } else {
    const resize = () => setImageStageGeometry(imageStage, viewer, viewer.__ttpImageState);
    window.addEventListener("resize", resize);
    viewer.__ttpImageResizeFallback = resize;
  }
}

function bindImagePan({ viewport, imageStage } = {}){
  if (!viewport || !imageStage || viewport.__ttpImagePanBound) return;
  viewport.__ttpImagePanBound = true;
  viewport.addEventListener("pointerdown", (event) => {
    const state = normalizeImageState(viewport.__ttpImageState);
    if (!state.source || state.zoom === 1) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target?.closest?.("button, input, label, a, [data-widget-action]")) return;
    // Sous 100 %, on doit réellement attraper la vignette et non une zone vide de la page.
    if (!event.target?.closest?.(".ttp-image-stage")) return;

    const rect = viewport.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const startPositionX = normalizeImagePosition(state.positionX);
    const startPositionY = normalizeImagePosition(state.positionY);
    const geometry = getImageGeometry(viewport, state);
    let nextPositionX = startPositionX;
    let nextPositionY = startPositionY;
    let didMove = false;

    const move = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) / rect.width;
      const dy = (moveEvent.clientY - startY) / rect.height;
      nextPositionX = geometry.travelX > 0
        ? normalizeImagePosition(startPositionX + (dx / geometry.travelX))
        : 0;
      nextPositionY = geometry.travelY > 0
        ? normalizeImagePosition(startPositionY + (dy / geometry.travelY))
        : 0;
      didMove = true;
      const previewState = { ...state, positionX: nextPositionX, positionY: nextPositionY };
      viewport.__ttpImageState = previewState;
      setImageStageGeometry(imageStage, viewport, previewState);
      moveEvent.preventDefault();
    };

    const end = (endEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      try { viewport.releasePointerCapture?.(event.pointerId); } catch {}
      if (didMove && endEvent.type !== "pointercancel") {
        viewport.__ttpImageSendAction?.("set-position", { positionX: nextPositionX, positionY: nextPositionY });
      } else if (endEvent.type === "pointercancel") {
        viewport.__ttpImageState = state;
        setImageStageGeometry(imageStage, viewport, state);
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

  const safeState = normalizeImageState(state);
  viewer.__ttpImageState = safeState;
  viewer.__ttpImageSendAction = sendAction;
  syncViewerDragState(viewer, safeState);
  syncLoadWarning(viewer, safeState.loadError);
  image.alt = safeState.imageName || "Image projetée";
  setImageStageGeometry(imageStage, viewer, safeState);
  bindImageWheel(viewer);
  bindImagePan({ viewport: viewer, imageStage });
  bindImageResize(viewer, imageStage);
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
  renderChromeControls({ chromeHost, state: safeState, sendAction });

  if (widgetInfoHost) {
    widgetInfoHost.textContent = hasImage
      ? `${formatImageZoom(safeState.zoom)}${safeState.zoom !== 1 ? " · image déplaçable" : ""}`
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

  if (syncExistingImageViewer({ host, state: safeState, sendAction })) return;

  host.innerHTML = `
    <section class="ttp-image-viewer${safeState.zoom > 1 ? " is-zoomed" : ""}${safeState.zoom < 1 ? " is-thumbnail" : ""}${safeState.zoom !== 1 ? " is-movable" : ""}${safeState.preserveProportions ? "" : " is-stretched"}">
      <div class="ttp-image-stage">
        <img class="ttp-image-img" src="${escapeAttr(safeState.source)}" alt="${escapeAttr(safeState.imageName || "Image projetée")}">
      </div>
      ${safeState.loadError ? `<div class="ttp-image-load-warning">${escapeHtml(safeState.loadError)}</div>` : ""}
    </section>
  `;
  const viewer = host.querySelector(".ttp-image-viewer");
  const imageStage = host.querySelector(".ttp-image-stage");
  const image = host.querySelector(".ttp-image-img");
  if (viewer) {
    viewer.__ttpImageState = safeState;
    viewer.__ttpImageSendAction = sendAction;
  }
  setImageStageGeometry(imageStage, viewer, safeState);
  bindImageWheel(viewer);
  bindImagePan({ viewport: viewer, imageStage });
  bindImageResize(viewer, imageStage);

  image?.addEventListener("error", () => {
    if (!safeState.loadError) sendAction?.("set-load-error", { message: "Impossible de charger l’image." });
  }, { once: true });
}
