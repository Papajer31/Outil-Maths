import {
  MULTI_IMAGES_BOARD_DIMENSION_MAX,
  MULTI_IMAGES_BOARD_DIMENSION_MIN,
  MULTI_IMAGES_BOARD_LAYOUT_AUTO,
  MULTI_IMAGES_BOARD_LAYOUT_CUSTOM,
  MULTI_IMAGES_MAX_IMAGES,
  MULTI_IMAGES_MODE_BOARD,
  MULTI_IMAGES_MODE_GALLERY,
  applyMultiImagesAction,
  normalizeMultiImagesState
} from "./model.js";
import {
  prepareImageFilePayload,
  prepareImageResourcePayload,
  prepareImageUrlPayload
} from "../image/source.js";
import { escapeAttr, escapeHtml } from "../../../dashboard/text-utils.js";
import { createColorPicker } from "../../../../../shared/color-picker.js";
import { openToolAssetPicker } from "../../../../../shared/tool-assets/asset-picker.js";
import { loadTeacherResourceAssets } from "../../../../../shared/tool-assets/resource-assets.js";

function getDimensionsLabel(image){
  return image?.naturalWidth && image?.naturalHeight
    ? `${image.naturalWidth} × ${image.naturalHeight}`
    : "dimensions inconnues";
}

function renderBoardDimensionStepper({ id, label, value } = {}){
  const safeId = String(id || "").trim();
  const safeValue = Math.max(
    MULTI_IMAGES_BOARD_DIMENSION_MIN,
    Math.min(MULTI_IMAGES_BOARD_DIMENSION_MAX, Math.trunc(Number(value) || MULTI_IMAGES_BOARD_DIMENSION_MIN))
  );
  const action = safeId === "rows" ? "set-board-rows" : "set-board-columns";
  const payloadKey = safeId === "rows" ? "boardRows" : "boardColumns";
  const inputId = `ttMultiImagesBoard${safeId.charAt(0).toUpperCase()}${safeId.slice(1)}`;

  return `
    <div class="tt-multi-images-grid-stepper-field">
      <span class="tt-multi-images-grid-stepper-label">${escapeHtml(label)}</span>
      <div class="tv-stepper tv-stepper-no-inline-label tt-multi-images-grid-stepper">
        <button class="tv-stepper-btn" type="button" data-multi-images-grid-action="${escapeAttr(action)}" data-multi-images-grid-key="${escapeAttr(payloadKey)}" data-multi-images-grid-value="${safeValue - 1}" aria-label="Diminuer ${escapeAttr(label)}" ${safeValue <= MULTI_IMAGES_BOARD_DIMENSION_MIN ? "disabled" : ""}>
          <span class="tv-stepper-icon" aria-hidden="true">remove</span>
        </button>
        <input id="${escapeAttr(inputId)}" class="tv-input tv-input-stepper" type="number" min="${MULTI_IMAGES_BOARD_DIMENSION_MIN}" max="${MULTI_IMAGES_BOARD_DIMENSION_MAX}" step="1" value="${safeValue}" inputmode="numeric" data-multi-images-grid-input="${escapeAttr(action)}" data-multi-images-grid-key="${escapeAttr(payloadKey)}" aria-label="${escapeAttr(label)}">
        <button class="tv-stepper-btn" type="button" data-multi-images-grid-action="${escapeAttr(action)}" data-multi-images-grid-key="${escapeAttr(payloadKey)}" data-multi-images-grid-value="${safeValue + 1}" aria-label="Augmenter ${escapeAttr(label)}" ${safeValue >= MULTI_IMAGES_BOARD_DIMENSION_MAX ? "disabled" : ""}>
          <span class="tv-stepper-icon" aria-hidden="true">add</span>
        </button>
      </div>
    </div>
  `;
}

function renderThumb(image, index, state){
  const isActive = state.activeIndex >= 0 && index === state.activeIndex;
  return `
    <button class="tt-multi-images-thumb${isActive ? " is-active" : ""}" type="button" draggable="true" data-multi-images-active-index="${index}" title="${escapeAttr(image.imageName || "Image")}">
      <span class="tt-multi-images-thumb-img"><img src="${escapeAttr(image.source)}" alt=""></span>
      <span class="tt-multi-images-thumb-meta">
        <strong>${escapeHtml(image.imageName || `Image ${index + 1}`)}</strong>
        <small>${escapeHtml(getDimensionsLabel(image))}</small>
      </span>
    </button>
  `;
}

export function createMultiImagesControlPanel({
  host,
  getWidget,
  updateWidget,
  showToast,
  getTeacherSpace,
  listResourcesForSpace,
  listResourceFoldersForSpace,
  createResourceSignedUrl
} = {}){
  function getCurrentState(){
    return normalizeMultiImagesState(getWidget?.()?.state);
  }

  function commitAction(action, payload = {}, { renderAfter = true } = {}){
    const result = applyMultiImagesAction({
      action,
      payload,
      state: getCurrentState()
    });
    if (!result) return;
    if (result.error) {
      showToast?.(String(result.error), { isError: true });
      return;
    }
    const patch = result.patch && typeof result.patch === "object" ? result.patch : null;
    if (patch) updateWidget?.(patch, { renderPanel: renderAfter, sync: true });
    if (result.message) showToast?.(String(result.message), { isError: result.isError === true });
  }

  async function prepareFiles(files, { limit = MULTI_IMAGES_MAX_IMAGES } = {}){
    const rawFiles = Array.from(files || []).filter(Boolean);
    const numericLimit = Number(limit);
    const safeLimit = Number.isFinite(numericLimit)
      ? Math.max(0, Math.trunc(numericLimit))
      : MULTI_IMAGES_MAX_IMAGES;
    if (safeLimit <= 0) return [];
    const imageFiles = rawFiles.slice(0, safeLimit);
    if (rawFiles.length > safeLimit) {
      showToast?.(`Certaines images n’ont pas été préparées : limite à ${MULTI_IMAGES_MAX_IMAGES}.`);
    }
    if (!imageFiles.length) return [];
    const payloads = [];
    for (const file of imageFiles) {
      try {
        payloads.push(await prepareImageFilePayload(file));
      } catch (error) {
        showToast?.(`${file?.name || "Image"} : ${error?.message || "impossible à charger"}`, { isError: true });
      }
    }
    return payloads;
  }

  async function setImagesFromFiles(files){
    const payloads = await prepareFiles(files, { limit: MULTI_IMAGES_MAX_IMAGES });
    if (!payloads.length) return;
    commitAction("set-images", { images: payloads });
  }

  async function addImagesFromFiles(files){
    const state = getCurrentState();
    const availableSlots = Math.max(0, MULTI_IMAGES_MAX_IMAGES - state.images.length);
    if (availableSlots <= 0) {
      showToast?.(`Limite : ${MULTI_IMAGES_MAX_IMAGES} images.`, { isError: true });
      return;
    }
    const payloads = await prepareFiles(files, { limit: availableSlots });
    if (!payloads.length) return;
    commitAction("add-images", { images: payloads });
  }

  async function addImageFromUrl(){
    const input = host?.querySelector("#ttMultiImagesUrlInput");
    if (getCurrentState().images.length >= MULTI_IMAGES_MAX_IMAGES) {
      showToast?.(`Limite : ${MULTI_IMAGES_MAX_IMAGES} images.`, { isError: true });
      return;
    }
    try {
      const payload = await prepareImageUrlPayload(input?.value);
      commitAction("add-images", { images: [payload] });
      if (input) input.value = "";
    } catch (error) {
      showToast?.(error?.message || "Impossible de charger cette URL d'image.", { isError: true });
    }
  }


  async function addImagesFromResources(){
    const state = getCurrentState();
    const availableSlots = Math.max(0, MULTI_IMAGES_MAX_IMAGES - state.images.length);
    if (availableSlots <= 0) {
      showToast?.(`Limite : ${MULTI_IMAGES_MAX_IMAGES} images.`, { isError: true });
      return;
    }
    const teacherSpaceId = Number(getTeacherSpace?.()?.id);
    if (!Number.isSafeInteger(teacherSpaceId) || teacherSpaceId <= 0) {
      showToast?.("Les ressources sont indisponibles pour cet espace.", { isError:true });
      return;
    }
    try {
      const selection = await openToolAssetPicker({
        type:"image",
        title:"Ajouter des images",
        multiple:true,
        confirmLabel:"Ajouter",
        loadAssets:() => loadTeacherResourceAssets({
          teacherSpaceId,
          type:"image",
          listResourcesForSpace,
          listResourceFoldersForSpace,
          createResourceSignedUrl
        }),
        emptyMessage:"Aucune image disponible dans ce dossier."
      });
      const assets = Array.isArray(selection) ? selection.slice(0, availableSlots) : [];
      if (!assets.length) return;
      if (selection.length > availableSlots) {
        showToast?.(`Certaines images n’ont pas été ajoutées : limite à ${MULTI_IMAGES_MAX_IMAGES}.`);
      }
      const payloads = await Promise.all(assets.map((asset) => prepareImageResourcePayload(asset)));
      commitAction("add-images", { images: payloads });
    } catch (error) {
      showToast?.(error?.message || "Impossible d’importer ces images.", { isError:true });
    }
  }


  function bindThumbDragAndDrop(){
    const thumbs = Array.from(host?.querySelectorAll?.("[data-multi-images-active-index]") || []);
    if (thumbs.length < 2) return;

    const container = host?.querySelector?.(".tt-multi-images-thumbs");
    if (!container) return;

    const marker = document.createElement("span");
    marker.className = "tt-multi-images-drop-marker";
    marker.hidden = true;
    marker.setAttribute("aria-hidden", "true");
    container.appendChild(marker);

    let dragFromIndex = null;
    let dropToIndex = null;

    const clearDragState = () => {
      thumbs.forEach((thumb) => thumb.classList.remove("is-dragging"));
      marker.hidden = true;
      marker.style.removeProperty("left");
      marker.style.removeProperty("top");
      marker.style.removeProperty("height");
    };

    const remainingThumbs = () => thumbs.filter((thumb) =>
      Math.trunc(Number(thumb.dataset.multiImagesActiveIndex)) !== dragFromIndex
    );

    // Une frontière logique entre deux images ne possède qu'un seul repère.
    // Après retrait de l'image déplacée, chaque index d'insertion correspond
    // à la gauche d'une vignette restante (ou à la droite de la dernière).
    const insertionCandidates = () => {
      const remaining = remainingThumbs();
      if (!remaining.length) return [];
      const candidates = remaining.map((thumb, finalIndex) => {
        const rect = thumb.getBoundingClientRect();
        return { finalIndex, x:rect.left, top:rect.top, bottom:rect.bottom, height:rect.height };
      });
      const lastRect = remaining[remaining.length - 1].getBoundingClientRect();
      candidates.push({
        finalIndex: remaining.length,
        x:lastRect.right,
        top:lastRect.top,
        bottom:lastRect.bottom,
        height:lastRect.height
      });
      return candidates;
    };

    const nearestInsertion = (event) => {
      let best = null;
      for (const candidate of insertionCandidates()) {
        const dx = Math.abs(event.clientX - candidate.x);
        const dy = event.clientY < candidate.top
          ? candidate.top - event.clientY
          : (event.clientY > candidate.bottom ? event.clientY - candidate.bottom : 0);
        const distance = Math.hypot(dx, dy);
        if (!best || distance < best.distance) best = { ...candidate, distance };
      }
      return best;
    };

    const showInsertionMarker = (candidate) => {
      if (!candidate) { marker.hidden = true; return; }
      const containerRect = container.getBoundingClientRect();
      marker.style.left = `${Math.round(candidate.x - containerRect.left)}px`;
      marker.style.top = `${Math.round(candidate.top - containerRect.top)}px`;
      marker.style.height = `${Math.round(candidate.height)}px`;
      marker.hidden = false;
    };

    thumbs.forEach((thumb) => {
      thumb.addEventListener("dragstart", (event) => {
        dragFromIndex = Math.trunc(Number(thumb.dataset.multiImagesActiveIndex));
        dropToIndex = dragFromIndex;
        thumb.classList.add("is-dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          try { event.dataTransfer.setData("text/plain", String(dragFromIndex)); } catch {}
        }
      });

      thumb.addEventListener("dragend", () => {
        clearDragState();
        dragFromIndex = null;
        dropToIndex = null;
      });
    });

    container.addEventListener("dragover", (event) => {
      if (!Number.isInteger(dragFromIndex)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      const candidate = nearestInsertion(event);
      if (!candidate) return;
      dropToIndex = candidate.finalIndex;
      showInsertionMarker(candidate);
    });

    container.addEventListener("drop", (event) => {
      if (!Number.isInteger(dragFromIndex)) return;
      event.preventDefault();
      const fromIndex = dragFromIndex;
      const toIndex = Number.isInteger(dropToIndex) ? dropToIndex : fromIndex;
      clearDragState();
      dragFromIndex = null;
      dropToIndex = null;
      if (fromIndex !== toIndex) commitAction("move-image", { fromIndex, toIndex });
    });
  }

  function render(){
    if (!host) return;
    const state = getCurrentState();
    const count = state.images.length;
    const activeImage = state.images[state.activeIndex] || null;

    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-multi-images-control" aria-label="Contrôles du widget Multimages">
        <div class="tt-control-panel-head">
          <div class="tt-multi-images-heading-row">
            <h3>Multimages</h3>
            <span class="tt-multi-images-count">${count} / ${MULTI_IMAGES_MAX_IMAGES} image${count > 1 ? "s" : ""}</span>
          </div>
        </div>

        <div class="tt-widget-action-bar" aria-label="Actions du widget">
          <label class="tt-widget-action-btn is-primary tt-multi-images-file-btn">
            <span class="dashboard-material-icon" aria-hidden="true">collections</span>
            <span>Choisir des images</span>
            <input id="ttMultiImagesReplaceInput" type="file" accept="image/*" multiple>
          </label>
          <label class="tt-widget-action-btn tt-multi-images-file-btn">
            <span class="dashboard-material-icon" aria-hidden="true">add_photo_alternate</span>
            <span>Ajouter</span>
            <input id="ttMultiImagesAddInput" type="file" accept="image/*" multiple>
          </label>
          <button id="ttMultiImagesPickResources" class="tt-widget-action-btn" type="button">
            <span class="dashboard-material-icon" aria-hidden="true">photo_library</span>
            <span>Ressources</span>
          </button>
          <div class="tt-multi-images-color-control">
            <div id="ttMultiImagesBackgroundColorPicker" class="tt-multi-images-color-picker-slot"></div>
          </div>
          ${state.mode === MULTI_IMAGES_MODE_BOARD ? `
            <div class="tt-multi-images-color-control" title="Couleur de la grille du tableau">
              <div id="ttMultiImagesGridColorPicker" class="tt-multi-images-color-picker-slot"></div>
            </div>
          ` : ""}
          <button id="ttMultiImagesShuffle" class="tt-widget-action-btn" type="button" ${count > 1 ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">shuffle</span>
            <span>Mélanger</span>
          </button>
          <button id="ttMultiImagesRemoveActive" class="tt-widget-action-btn is-danger" type="button" ${activeImage ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
            <span>Retirer l’image</span>
          </button>
          <button id="ttMultiImagesClear" class="tt-widget-action-btn is-danger" type="button" ${count ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">delete_sweep</span>
            <span>Tout vider</span>
          </button>
        </div>

        <div class="tt-multi-images-source-grid">
          <div class="tt-multi-images-url-row">
            <input id="ttMultiImagesUrlInput" type="url" inputmode="url" placeholder="https://…">
            <button id="ttMultiImagesLoadUrl" class="tt-widget-action-btn is-primary" type="button">Ajouter l’URL</button>
          </div>
        </div>

        <div class="tt-multi-images-settings-card">
          <span class="tt-multi-images-settings-label">Affichage</span>
          <div class="tt-multi-images-mode-group" role="group" aria-label="Mode d’affichage">
            <button class="tt-widget-action-btn tt-multi-images-mode-btn${state.mode === MULTI_IMAGES_MODE_GALLERY ? " is-active" : ""}" type="button" data-multi-images-mode="${MULTI_IMAGES_MODE_GALLERY}" aria-pressed="${state.mode === MULTI_IMAGES_MODE_GALLERY ? "true" : "false"}">
              <span class="dashboard-material-icon" aria-hidden="true">view_carousel</span>
              <span>Galerie</span>
            </button>
            <button class="tt-widget-action-btn tt-multi-images-mode-btn${state.mode === MULTI_IMAGES_MODE_BOARD ? " is-active" : ""}" type="button" data-multi-images-mode="${MULTI_IMAGES_MODE_BOARD}" aria-pressed="${state.mode === MULTI_IMAGES_MODE_BOARD ? "true" : "false"}">
              <span class="dashboard-material-icon" aria-hidden="true">grid_view</span>
              <span>Tableau</span>
            </button>
          </div>
          ${state.mode === MULTI_IMAGES_MODE_BOARD ? `
            <div class="tt-multi-images-layout-row">
              <span class="tt-multi-images-settings-label">Disposition</span>
              <div class="tt-multi-images-layout-group" role="group" aria-label="Disposition du tableau">
                <button class="tt-widget-action-btn tt-multi-images-layout-btn${state.boardLayout === MULTI_IMAGES_BOARD_LAYOUT_AUTO ? " is-active" : ""}" type="button" data-multi-images-board-layout="${MULTI_IMAGES_BOARD_LAYOUT_AUTO}" aria-pressed="${state.boardLayout === MULTI_IMAGES_BOARD_LAYOUT_AUTO ? "true" : "false"}">Automatique</button>
                <button class="tt-widget-action-btn tt-multi-images-layout-btn${state.boardLayout === MULTI_IMAGES_BOARD_LAYOUT_CUSTOM ? " is-active" : ""}" type="button" data-multi-images-board-layout="${MULTI_IMAGES_BOARD_LAYOUT_CUSTOM}" aria-pressed="${state.boardLayout === MULTI_IMAGES_BOARD_LAYOUT_CUSTOM ? "true" : "false"}">Personnalisée</button>
              </div>
              ${state.boardLayout === MULTI_IMAGES_BOARD_LAYOUT_CUSTOM ? `
                <div class="tt-multi-images-grid-controls" aria-label="Dimensions du tableau">
                  ${renderBoardDimensionStepper({ id:"rows", label:"Lignes", value:state.boardRows })}
                  ${renderBoardDimensionStepper({ id:"columns", label:"Colonnes", value:state.boardColumns })}
                </div>
              ` : ""}
            </div>
          ` : ""}
        </div>

        ${activeImage ? `
          <div class="tt-multi-images-active-card">
            <div class="tt-multi-images-active-thumb" aria-hidden="true"><img src="${escapeAttr(activeImage.source)}" alt=""></div>
            <div class="tt-multi-images-active-meta">
              <strong>${escapeHtml(activeImage.imageName || "Image")}</strong>
              <span>${escapeHtml(state.activeIndex + 1)} / ${escapeHtml(count)} · ${escapeHtml(getDimensionsLabel(activeImage))}</span>
            </div>
          </div>
        ` : `
          <div class="tt-multi-images-empty-card">
            <strong>Aucune image sélectionnée.</strong>
            <span>Choisis plusieurs images locales, ajoute des ressources du site ou des URL une par une.</span>
          </div>
        `}

        ${count ? `
          <div class="tt-multi-images-thumbs" aria-label="Images du widget">
            ${state.images.map((image, index) => renderThumb(image, index, state)).join("")}
          </div>
        ` : ""}
      </section>
    `;

    host.querySelector("#ttMultiImagesReplaceInput")?.addEventListener("change", (event) => {
      setImagesFromFiles(event.currentTarget.files);
      event.currentTarget.value = "";
    });
    host.querySelector("#ttMultiImagesAddInput")?.addEventListener("change", (event) => {
      addImagesFromFiles(event.currentTarget.files);
      event.currentTarget.value = "";
    });
    host.querySelector("#ttMultiImagesPickResources")?.addEventListener("click", () => { void addImagesFromResources(); });
    host.querySelector("#ttMultiImagesLoadUrl")?.addEventListener("click", addImageFromUrl);
    host.querySelector("#ttMultiImagesUrlInput")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") addImageFromUrl();
    });
    host.querySelectorAll("[data-multi-images-mode]").forEach((button) => {
      button.addEventListener("click", () => commitAction("set-mode", {
        mode: button.dataset.multiImagesMode
      }));
    });
    host.querySelectorAll("[data-multi-images-board-layout]").forEach((button) => {
      button.addEventListener("click", () => commitAction("set-board-layout", {
        boardLayout: button.dataset.multiImagesBoardLayout
      }));
    });
    host.querySelectorAll("[data-multi-images-grid-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const action = button.dataset.multiImagesGridAction;
        const key = button.dataset.multiImagesGridKey;
        const value = Math.max(
          MULTI_IMAGES_BOARD_DIMENSION_MIN,
          Math.min(MULTI_IMAGES_BOARD_DIMENSION_MAX, Math.trunc(Number(button.dataset.multiImagesGridValue) || MULTI_IMAGES_BOARD_DIMENSION_MIN))
        );
        commitAction(action, { [key]: value });
      });
    });
    host.querySelectorAll("[data-multi-images-grid-input]").forEach((input) => {
      input.addEventListener("change", () => {
        const action = input.dataset.multiImagesGridInput;
        const key = input.dataset.multiImagesGridKey;
        const value = Math.max(
          MULTI_IMAGES_BOARD_DIMENSION_MIN,
          Math.min(MULTI_IMAGES_BOARD_DIMENSION_MAX, Math.trunc(Number(input.value) || MULTI_IMAGES_BOARD_DIMENSION_MIN))
        );
        commitAction(action, { [key]: value });
      });
    });
    createColorPicker({
      host: host.querySelector("#ttMultiImagesBackgroundColorPicker"),
      value: state.backgroundColor,
      label: "Fond",
      headerLabel: "",
      popup: true,
      onChange(value){
        commitAction("set-background-color", { backgroundColor: value }, { renderAfter: false });
      }
    });
    createColorPicker({
      host: host.querySelector("#ttMultiImagesGridColorPicker"),
      value: state.gridColor,
      label: "Grille",
      headerLabel: "",
      popup: true,
      onChange(value){
        commitAction("set-grid-color", { gridColor: value }, { renderAfter: false });
      }
    });
    host.querySelector("#ttMultiImagesShuffle")?.addEventListener("click", () => commitAction("shuffle-images"));
    host.querySelector("#ttMultiImagesRemoveActive")?.addEventListener("click", () => commitAction("remove-active"));
    host.querySelector("#ttMultiImagesClear")?.addEventListener("click", () => commitAction("clear-images"));
    host.querySelectorAll("[data-multi-images-active-index]").forEach((button) => {
      button.addEventListener("click", () => commitAction("toggle-active-index", {
        activeIndex: button.dataset.multiImagesActiveIndex
      }));
    });
    bindThumbDragAndDrop();
  }

  render();
  return {
    render,
    destroy(){
      if (host) host.innerHTML = "";
    }
  };
}
