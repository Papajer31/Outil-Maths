import {
  IMAGE_ZOOM_MAX,
  IMAGE_ZOOM_MIN,
  IMAGE_ZOOM_STEP,
  applyImageAction,
  normalizeImageState
} from "./model.js";
import {
  formatImageZoom,
  prepareImageFilePayload,
  prepareImageUrlPayload
} from "./source.js";
import { escapeAttr, escapeHtml } from "../../../dashboard/text-utils.js";

export function createImageControlPanel({ host, getWidget, updateWidget, showToast } = {}){
  function getCurrentState(){
    return normalizeImageState(getWidget?.()?.state);
  }

  function commitAction(action, payload = {}, { renderAfter = true } = {}){
    const result = applyImageAction({
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

  async function setImageFromFile(file){
    if (!file) return;
    try {
      const payload = await prepareImageFilePayload(file);
      commitAction("set-image", payload);
    } catch (error) {
      showToast?.(error?.message || "Impossible de charger cette image.", { isError: true });
    }
  }

  async function setImageFromUrl(){
    const input = host?.querySelector("#ttImageUrlInput");
    try {
      const payload = await prepareImageUrlPayload(input?.value);
      commitAction("set-image", payload);
    } catch (error) {
      showToast?.(error?.message || "Impossible de charger cette URL d'image.", { isError: true });
    }
  }

  function render(){
    if (!host) return;
    const state = getCurrentState();
    const hasImage = Boolean(state.source);
    const canZoomOut = state.zoom > IMAGE_ZOOM_MIN;
    const canZoomIn = state.zoom < IMAGE_ZOOM_MAX;
    const dimensions = state.naturalWidth && state.naturalHeight
      ? `${state.naturalWidth} × ${state.naturalHeight}`
      : "dimensions inconnues";

    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-image-control" aria-label="Contrôles du widget Image">
        <div class="tt-control-panel-head">
          <div>
            <h3>Image projetée</h3>
          </div>
        </div>

        <div class="tt-widget-action-bar" aria-label="Actions du widget">
          <label class="tt-widget-action-btn is-primary tt-image-file-btn">
            <span class="dashboard-material-icon" aria-hidden="true">upload_file</span>
            <span>Choisir une image</span>
            <input id="ttImageFileInput" type="file" accept="image/*">
          </label>
          <label class="tt-widget-action-toggle tt-image-proportions-toggle">
            <input id="ttImagePreserveProportions" type="checkbox" ${state.preserveProportions ? "checked" : ""}>
            <span class="tt-widget-action-toggle-track" aria-hidden="true"></span>
            <span>Proportions</span>
          </label>
          <button id="ttImageZoomOut" class="tt-widget-action-btn" type="button" ${hasImage && canZoomOut ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">zoom_out</span><span>Zoom -</span>
          </button>
          <button id="ttImageCenter" class="tt-widget-action-btn" type="button" ${hasImage ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">fit_screen</span><span>100 %</span>
          </button>
          <button id="ttImageZoomIn" class="tt-widget-action-btn" type="button" ${hasImage && canZoomIn ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">zoom_in</span><span>Zoom +</span>
          </button>
          ${hasImage ? `
            <button id="ttImageClear" class="tt-widget-action-btn is-danger" type="button">
              <span class="dashboard-material-icon" aria-hidden="true">delete</span>
              <span>Retirer</span>
            </button>
          ` : ""}
        </div>

        <div class="tt-image-source-grid">
          <div class="tt-image-url-row">
            <input id="ttImageUrlInput" type="url" inputmode="url" placeholder="https://…" value="${hasImage && state.sourceKind === "url" ? escapeAttr(state.source) : ""}">
            <button id="ttImageLoadUrl" class="tt-widget-action-btn is-primary" type="button">Charger</button>
          </div>
        </div>

        ${hasImage ? `
          <div class="tt-image-preview-card">
            <div class="tt-image-preview-thumb" aria-hidden="true"><img src="${escapeAttr(state.source)}" alt=""></div>
            <div class="tt-image-preview-meta">
              <strong>${escapeHtml(state.imageName || "Image")}</strong>
              <span>${escapeHtml(dimensions)} · ${escapeHtml(formatImageZoom(state.zoom))}</span>
            </div>
          </div>
        ` : `
          <div class="tt-image-empty-card">
            <strong>Aucune image sélectionnée.</strong>
            <span>Choisis une image locale ou colle l’URL directe d’une image.</span>
          </div>
        `}
      </section>
    `;

    host.querySelector("#ttImageFileInput")?.addEventListener("change", (event) => {
      const file = event.currentTarget.files?.[0] || null;
      setImageFromFile(file);
      event.currentTarget.value = "";
    });
    host.querySelector("#ttImageLoadUrl")?.addEventListener("click", setImageFromUrl);
    host.querySelector("#ttImageUrlInput")?.addEventListener("keydown", (event) => {
      if (event.key === "Enter") setImageFromUrl();
    });
    host.querySelector("#ttImagePreserveProportions")?.addEventListener("change", (event) => {
      commitAction("set-preserve-proportions", {
        preserveProportions: event.currentTarget.checked === true
      });
    });
    host.querySelector("#ttImageClear")?.addEventListener("click", () => commitAction("clear-image"));
    host.querySelector("#ttImageZoomOut")?.addEventListener("click", () => commitAction("adjust-zoom", { delta: -IMAGE_ZOOM_STEP }));
    host.querySelector("#ttImageZoomIn")?.addEventListener("click", () => commitAction("adjust-zoom", { delta: IMAGE_ZOOM_STEP }));
    host.querySelector("#ttImageCenter")?.addEventListener("click", () => commitAction("center"));
  }

  render();
  return {
    render,
    destroy(){
      if (host) host.innerHTML = "";
    }
  };
}
