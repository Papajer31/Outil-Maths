import {
  MULTI_IMAGES_MAX_IMAGES,
  MULTI_IMAGES_MODE_BOARD,
  MULTI_IMAGES_MODE_GALLERY,
  normalizeMultiImagesState
} from "./model.js";
import {
  prepareImageFilePayload,
  prepareImageUrlPayload
} from "../image/source.js";

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const escapeAttr = escapeHtml;
const BOARD_TAP_MAX_DISTANCE_PX = 7;

function computeBestGrid(count, ratio){
  const safeCount = Math.max(1, Math.trunc(Number(count) || 1));
  const safeRatio = Number.isFinite(Number(ratio)) && Number(ratio) > 0 ? Number(ratio) : 16 / 9;
  let best = { columns: safeCount, rows: 1, score: Number.POSITIVE_INFINITY };

  for (let columns = 1; columns <= safeCount; columns += 1) {
    const rows = Math.ceil(safeCount / columns);
    const gridRatio = columns / rows;
    const emptyCells = (columns * rows) - safeCount;
    const score = Math.abs(Math.log(gridRatio / safeRatio)) + emptyCells * 0.055;
    if (score < best.score) best = { columns, rows, score };
  }

  return best;
}

function syncBoardGrid(root){
  const board = root?.querySelector?.(".ttp-multi-images-board");
  if (!board) return;
  const count = Number(board.dataset.count) || 1;
  const rect = board.getBoundingClientRect?.();
  const ratio = rect?.width && rect?.height ? rect.width / rect.height : 16 / 9;
  const grid = computeBestGrid(count, ratio);
  board.style.setProperty("--ttp-multi-images-columns", String(grid.columns));
  board.style.setProperty("--ttp-multi-images-rows", String(grid.rows));
}

function bindBoardResize(root){
  const board = root?.querySelector?.(".ttp-multi-images-board");
  if (!board || board.__ttpMultiImagesResizeBound) return;
  board.__ttpMultiImagesResizeBound = true;
  syncBoardGrid(root);
  if (typeof ResizeObserver !== "function") return;
  const observer = new ResizeObserver(() => syncBoardGrid(root));
  observer.observe(board);
  board.__ttpMultiImagesResizeObserver = observer;
}

function disconnectBoardResize(root){
  const board = root?.querySelector?.(".ttp-multi-images-board");
  const observer = board?.__ttpMultiImagesResizeObserver;
  if (observer && typeof observer.disconnect === "function") observer.disconnect();
}

function setEmptyWarning(root, message){
  const warning = root?.querySelector?.(".ttp-multi-images-empty-error");
  if (warning) warning.textContent = String(message || "").trim();
}

function getFileWarning({ skippedCount = 0, failures = [], payloads = [] } = {}){
  const warnings = [];
  if (skippedCount > 0) {
    warnings.push(`Limite : seules ${MULTI_IMAGES_MAX_IMAGES} images ont été préparées.`);
  }
  if (failures.length) {
    warnings.push(failures.length > 1 ? `${failures[0]} (+${failures.length - 1})` : failures[0]);
  }
  if (!payloads.length && !warnings.length) warnings.push("Aucune image à charger.");
  return warnings.join(" ");
}

async function preparePayloadsFromFiles(files, { limit = MULTI_IMAGES_MAX_IMAGES } = {}){
  const rawFiles = Array.from(files || []).filter(Boolean);
  const numericLimit = Number(limit);
  const safeLimit = Number.isFinite(numericLimit)
    ? Math.max(0, Math.trunc(numericLimit))
    : MULTI_IMAGES_MAX_IMAGES;
  const imageFiles = rawFiles.slice(0, safeLimit);
  const payloads = [];
  const failures = [];
  for (const file of imageFiles) {
    try {
      payloads.push(await prepareImageFilePayload(file));
    } catch (error) {
      failures.push(`${file?.name || "Image"} : ${error?.message || "impossible à charger"}`);
    }
  }
  return {
    payloads,
    failures,
    skippedCount: Math.max(0, rawFiles.length - imageFiles.length)
  };
}

async function sendImagesFromFiles(root, files, sendAction, action = "set-images"){
  setEmptyWarning(root, "");
  const result = await preparePayloadsFromFiles(files);
  const payloads = result.payloads;
  const warning = getFileWarning(result);
  if (warning) setEmptyWarning(root, warning);
  if (!payloads.length) return;
  sendAction?.(action, { images: payloads });
}

async function sendImageFromUrl(root, sendAction){
  const input = root?.querySelector("[data-multi-images-url]");
  setEmptyWarning(root, "");
  try {
    const payload = await prepareImageUrlPayload(input?.value);
    sendAction?.("add-images", { images: [payload] });
    if (input) input.value = "";
  } catch (error) {
    const message = error?.message || "Impossible de charger cette URL d'image.";
    setEmptyWarning(root, message);
  }
}

function getImageObjectFit(){
  return "contain";
}

function preloadGalleryImage(image){
  if (!image?.source || typeof Image !== "function") return;
  const preloader = new Image();
  preloader.decoding = "async";
  preloader.src = image.source;
}

function preloadGalleryNeighbors(state){
  if (!state?.images?.length || state.images.length <= 1) return;
  const count = state.images.length;
  const indexes = new Set([
    (state.activeIndex - 1 + count) % count,
    (state.activeIndex + 1) % count
  ]);
  indexes.forEach((index) => preloadGalleryImage(state.images[index]));
}

function setGalleryWarning(viewer, message){
  const warning = viewer?.querySelector?.(".ttp-multi-images-load-warning");
  if (!warning) return;
  const safeMessage = String(message || "").trim();
  warning.textContent = safeMessage;
  warning.hidden = !safeMessage;
}

function bindGalleryControls(viewer, state, sendAction){
  if (!viewer) return;
  const hasMultipleImages = state.images.length > 1;
  const previous = viewer.querySelector("[data-multi-images-gallery-previous]");
  const next = viewer.querySelector("[data-multi-images-gallery-next]");

  if (previous) {
    previous.disabled = !hasMultipleImages;
    previous.onclick = () => sendAction?.("previous-image");
  }
  if (next) {
    next.disabled = !hasMultipleImages;
    next.onclick = () => sendAction?.("next-image");
  }
}

function waitForGalleryLayer(layer, image, sendAction){
  if (!layer || !image?.source) return Promise.resolve(false);

  return new Promise((resolve) => {
    let settled = false;
    const finish = async (ok) => {
      if (settled) return;
      settled = true;
      layer.removeEventListener("load", onLoad);
      layer.removeEventListener("error", onError);

      if (!ok) {
        if (!image.loadError) {
          sendAction?.("set-image-error", { imageId: image.id, message: "Impossible de charger l’image." });
        }
        resolve(false);
        return;
      }

      if (typeof layer.decode === "function") {
        try { await layer.decode(); } catch {}
      }
      resolve(true);
    };
    const onLoad = () => finish(true);
    const onError = () => finish(false);

    layer.addEventListener("load", onLoad, { once: true });
    layer.addEventListener("error", onError, { once: true });
    layer.alt = image.imageName || "Image projetée";
    layer.dataset.imageId = image.id;

    if (layer.getAttribute("src") === image.source) {
      if (layer.complete) finish((layer.naturalWidth || 0) > 0);
      return;
    }

    layer.src = image.source;
  });
}

function getGalleryLayers(viewer){
  return Array.from(viewer?.querySelectorAll?.(".ttp-multi-images-gallery-layer") || []);
}

function syncGalleryImage({ viewer, state, sendAction } = {}){
  const image = state.images[state.activeIndex] || state.images[0];
  if (!viewer || !image) return;

  const layers = getGalleryLayers(viewer);
  const activeLayer = viewer.querySelector(".ttp-multi-images-gallery-layer.is-active") || layers[0];
  const nextLayer = layers.find((layer) => layer !== activeLayer) || layers[1] || activeLayer;
  const currentImageId = String(viewer.dataset.activeImageId || "");
  const token = (Number(viewer.dataset.galleryToken) || 0) + 1;
  viewer.dataset.galleryToken = String(token);

  if (currentImageId === image.id && activeLayer) {
    activeLayer.alt = image.imageName || "Image projetée";
    activeLayer.dataset.imageId = image.id;
    setGalleryWarning(viewer, image.loadError);
    return;
  }

  nextLayer.classList.remove("is-active");
  nextLayer.setAttribute("aria-hidden", "true");

  waitForGalleryLayer(nextLayer, image, sendAction).then((ok) => {
    if (viewer.dataset.galleryToken !== String(token)) return;
    activeLayer?.classList.remove("is-active");
    activeLayer?.setAttribute("aria-hidden", "true");
    nextLayer.classList.add("is-active");
    nextLayer.removeAttribute("aria-hidden");
    viewer.dataset.activeImageId = image.id;
    setGalleryWarning(viewer, image.loadError || (ok ? "" : "Impossible de charger l’image."));
  });
}

function syncExistingGallery({ host, state, sendAction } = {}){
  const viewer = host?.querySelector?.(".ttp-multi-images-viewer.mode-gallery");
  if (!viewer) return false;
  viewer.style.setProperty("--ttp-multi-images-fit", getImageObjectFit(state));
  viewer.style.setProperty("--ttp-multi-images-background", state.backgroundColor);
  bindGalleryControls(viewer, state, sendAction);
  syncGalleryImage({ viewer, state, sendAction });
  preloadGalleryNeighbors(state);
  return true;
}

function getBoardImagesSignature(state){
  return (Array.isArray(state?.images) ? state.images : [])
    .map((image) => [
      image?.id || "",
      image?.source || "",
      image?.imageName || ""
    ].map((part) => encodeURIComponent(String(part))).join(":"))
    .join("|");
}

function syncBoardLoadWarning(cell, message){
  if (!cell) return;
  const safeMessage = String(message || "").trim();
  let warning = cell.querySelector(".ttp-multi-images-load-warning");
  if (!safeMessage) {
    warning?.remove();
    return;
  }
  if (!warning) {
    warning = document.createElement("span");
    warning.className = "ttp-multi-images-load-warning";
    cell.append(warning);
  }
  warning.textContent = safeMessage;
}

function syncExistingBoard({ host, state } = {}){
  const viewer = host?.querySelector?.(".ttp-multi-images-viewer.mode-board");
  const board = viewer?.querySelector?.(".ttp-multi-images-board");
  if (!viewer || !board) return false;

  const signature = getBoardImagesSignature(state);
  if (board.dataset.imagesSignature !== signature) return false;

  viewer.style.setProperty("--ttp-multi-images-fit", getImageObjectFit(state));
  viewer.style.setProperty("--ttp-multi-images-gap", `${state.gap}px`);
  viewer.style.setProperty("--ttp-multi-images-background", state.backgroundColor);
  board.dataset.count = String(state.images.length);

  board.querySelectorAll("[data-multi-images-board-index]").forEach((cell) => {
    const index = Math.trunc(Number(cell.dataset.multiImagesBoardIndex) || 0);
    const image = state.images[index];
    if (!image) return;
    cell.classList.toggle("is-active", index === state.activeIndex);
    cell.removeAttribute("data-widget-action");
    cell.title = image.imageName || `Image ${index + 1}`;
    const imageNode = cell.querySelector(".ttp-multi-images-img");
    if (imageNode) {
      imageNode.alt = image.imageName || "Image projetée";
      imageNode.dataset.imageId = image.id;
    }
    syncBoardLoadWarning(cell, image.loadError);
  });

  syncBoardGrid(host);
  return true;
}

function bindBoardCellSelection(cell, sendAction){
  if (!cell || cell.__ttpMultiImagesSelectionBound) return;
  cell.__ttpMultiImagesSelectionBound = true;

  const selectImage = () => sendAction?.("set-active-index", {
    activeIndex: cell.dataset.multiImagesBoardIndex
  });

  cell.addEventListener("pointerdown", (event) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    const pointerId = event.pointerId;
    const startX = Number(event.clientX) || 0;
    const startY = Number(event.clientY) || 0;

    const cleanup = () => {
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
    };

    const finish = (endEvent) => {
      if (endEvent.pointerId !== pointerId) return;
      cleanup();
      if (endEvent.type === "pointercancel") return;

      const dx = (Number(endEvent.clientX) || 0) - startX;
      const dy = (Number(endEvent.clientY) || 0) - startY;
      if (Math.hypot(dx, dy) > BOARD_TAP_MAX_DISTANCE_PX) return;
      selectImage();
    };

    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }, { passive: true });

  cell.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    selectImage();
  });
}

function renderChromeControls({ chromeHost, state, sendAction } = {}){
  if (!chromeHost) return;
  const count = state.images.length;
  if (!count) {
    chromeHost.innerHTML = "";
    return;
  }

  chromeHost.innerHTML = `
    <button class="ttp-widget-icon-btn ttp-material-icon" type="button" data-widget-action data-multi-images-action="previous" title="Image précédente" aria-label="Image précédente" ${count > 1 ? "" : "disabled"}>chevron_left</button>
    <button class="ttp-multi-images-index-pill" type="button" data-widget-action data-multi-images-action="toggle-mode" title="Basculer Galerie/Tableau" aria-label="Basculer Galerie/Tableau">${escapeHtml(state.activeIndex + 1)} / ${escapeHtml(count)}</button>
    <button class="ttp-widget-icon-btn ttp-material-icon" type="button" data-widget-action data-multi-images-action="next" title="Image suivante" aria-label="Image suivante" ${count > 1 ? "" : "disabled"}>chevron_right</button>
  `;

  chromeHost.querySelector("[data-multi-images-action='previous']")?.addEventListener("click", () => sendAction?.("previous-image"));
  chromeHost.querySelector("[data-multi-images-action='next']")?.addEventListener("click", () => sendAction?.("next-image"));
  chromeHost.querySelector("[data-multi-images-action='toggle-mode']")?.addEventListener("click", () => sendAction?.("set-mode", {
    mode: state.mode === MULTI_IMAGES_MODE_BOARD ? MULTI_IMAGES_MODE_GALLERY : MULTI_IMAGES_MODE_BOARD
  }));
}

function renderEmpty({ host, state, sendAction } = {}){
  disconnectBoardResize(host);
  host.innerHTML = `
    <section class="ttp-multi-images-empty">
      <div class="ttp-multi-images-empty-card">
        <span class="ttp-material-icon" aria-hidden="true">collections</span>
        <strong>Ajouter plusieurs images</strong>
        <p>Choisis plusieurs fichiers ou ajoute des images par URL.</p>
        <p class="ttp-multi-images-empty-error" aria-live="polite"></p>
        <div class="ttp-multi-images-empty-actions">
          <label class="ttp-multi-images-file-btn" data-widget-action>
            <span class="ttp-material-icon" aria-hidden="true">upload_file</span>
            <span>Choisir des images</span>
            <input type="file" accept="image/*" multiple data-multi-images-file>
          </label>
          <div class="ttp-multi-images-url-row" data-widget-action>
            <input type="url" inputmode="url" placeholder="https://…" data-multi-images-url>
            <button class="ttp-widget-action-btn is-primary" type="button" data-multi-images-load-url>Ajouter</button>
          </div>
        </div>
      </div>
    </section>
  `;
  const root = host.querySelector(".ttp-multi-images-empty");
  root?.querySelector("[data-multi-images-file]")?.addEventListener("change", (event) => {
    sendImagesFromFiles(root, event.currentTarget.files, sendAction, "set-images");
    event.currentTarget.value = "";
  });
  root?.querySelector("[data-multi-images-load-url]")?.addEventListener("click", () => sendImageFromUrl(root, sendAction));
  root?.querySelector("[data-multi-images-url]")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendImageFromUrl(root, sendAction);
  });
}

function renderGallery({ host, state, sendAction } = {}){
  disconnectBoardResize(host);
  if (syncExistingGallery({ host, state, sendAction })) return;

  const image = state.images[state.activeIndex] || state.images[0];
  host.innerHTML = `
    <section class="ttp-multi-images-viewer mode-gallery" style="--ttp-multi-images-fit:${escapeAttr(getImageObjectFit(state))}; --ttp-multi-images-background:${escapeAttr(state.backgroundColor)};">
      <button class="ttp-multi-images-gallery-nav is-left" type="button" data-widget-action data-multi-images-gallery-previous aria-label="Image précédente" ${state.images.length > 1 ? "" : "disabled"}>
        <span class="ttp-material-icon" aria-hidden="true">chevron_left</span>
      </button>
      <figure class="ttp-multi-images-gallery-figure">
        <img class="ttp-multi-images-img ttp-multi-images-gallery-layer is-active" src="${escapeAttr(image.source)}" alt="${escapeAttr(image.imageName || "Image projetée")}" data-image-id="${escapeAttr(image.id)}">
        <img class="ttp-multi-images-img ttp-multi-images-gallery-layer" alt="" aria-hidden="true">
        <figcaption class="ttp-multi-images-load-warning" ${image.loadError ? "" : "hidden"}>${escapeHtml(image.loadError)}</figcaption>
      </figure>
      <button class="ttp-multi-images-gallery-nav is-right" type="button" data-widget-action data-multi-images-gallery-next aria-label="Image suivante" ${state.images.length > 1 ? "" : "disabled"}>
        <span class="ttp-material-icon" aria-hidden="true">chevron_right</span>
      </button>
    </section>
  `;

  const viewer = host.querySelector(".ttp-multi-images-viewer.mode-gallery");
  if (viewer) viewer.dataset.activeImageId = image.id;
  bindGalleryControls(viewer, state, sendAction);
  waitForGalleryLayer(viewer?.querySelector(".ttp-multi-images-gallery-layer.is-active"), image, sendAction);
  preloadGalleryNeighbors(state);
}

function renderBoard({ host, state, sendAction } = {}){
  if (syncExistingBoard({ host, state })) return;
  disconnectBoardResize(host);
  host.innerHTML = `
    <section class="ttp-multi-images-viewer mode-board" style="--ttp-multi-images-fit:${escapeAttr(getImageObjectFit(state))}; --ttp-multi-images-gap:${escapeAttr(state.gap)}px; --ttp-multi-images-background:${escapeAttr(state.backgroundColor)};">
      <div class="ttp-multi-images-board" data-count="${escapeAttr(state.images.length)}" data-images-signature="${escapeAttr(getBoardImagesSignature(state))}">
        ${state.images.map((image, index) => `
          <figure class="ttp-multi-images-board-cell${index === state.activeIndex ? " is-active" : ""}" role="button" tabindex="0" data-multi-images-board-index="${index}" title="${escapeAttr(image.imageName || `Image ${index + 1}`)}">
            <img class="ttp-multi-images-img" src="${escapeAttr(image.source)}" alt="${escapeAttr(image.imageName || "Image projetée")}" data-image-id="${escapeAttr(image.id)}">
            ${image.loadError ? `<span class="ttp-multi-images-load-warning">${escapeHtml(image.loadError)}</span>` : ""}
          </figure>
        `).join("")}
      </div>
    </section>
  `;

  host.querySelectorAll("[data-multi-images-board-index]").forEach((button) => {
    bindBoardCellSelection(button, sendAction);
  });
  host.querySelectorAll(".ttp-multi-images-img").forEach((imageNode) => {
    imageNode.addEventListener("error", () => {
      const imageId = imageNode.dataset.imageId;
      sendAction?.("set-image-error", { imageId, message: "Impossible de charger l’image." });
    }, { once: true });
  });

  bindBoardResize(host);
}

export function renderMultiImagesProjector({ host, chromeHost, widgetInfoHost, state, sendAction } = {}){
  if (!host) return;
  const safeState = normalizeMultiImagesState(state);
  const count = safeState.images.length;
  const hasImages = count > 0;
  host.closest?.(".ttp-widget-frame")?.classList.toggle("has-empty-multi-images", !hasImages);
  renderChromeControls({ chromeHost, state: safeState, sendAction });

  if (widgetInfoHost) {
    if (!hasImages) widgetInfoHost.textContent = "Aucune image";
    else widgetInfoHost.textContent = safeState.mode === MULTI_IMAGES_MODE_BOARD
      ? `${count} image${count > 1 ? "s" : ""} · Tableau`
      : `${safeState.activeIndex + 1} / ${count} · Galerie`;
  }

  if (!hasImages) {
    renderEmpty({ host, state: safeState, sendAction });
    return;
  }

  if (safeState.mode === MULTI_IMAGES_MODE_BOARD) {
    renderBoard({ host, state: safeState, sendAction });
    return;
  }

  renderGallery({ host, state: safeState, sendAction });
}
