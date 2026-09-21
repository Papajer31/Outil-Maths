import {
  PDF_ZOOM_MAX,
  PDF_ZOOM_MIN,
  PDF_ZOOM_STEP,
  getCurrentPdfView,
  normalizePdfPosition,
  normalizePdfState
} from "./model.js";
import { getPdfDocument, getPdfPageInfo, renderPdfPage } from "./engine.js";
import { formatPdfZoom, preparePdfFilePayload, preparePdfUrlPayload } from "./source.js";

function escapeHtml(value){
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
const escapeAttr = escapeHtml;

function getPdfGeometry(viewport, pageInfo, view){
  const rect = viewport?.getBoundingClientRect?.();
  const viewportWidth = Math.max(1, rect?.width || 1);
  const viewportHeight = Math.max(1, rect?.height || 1);
  const pageWidth = Math.max(1, Number(pageInfo?.width) || 1);
  const pageHeight = Math.max(1, Number(pageInfo?.height) || 1);
  const pageRatio = pageWidth / pageHeight;
  const viewportRatio = viewportWidth / viewportHeight;
  const baseWidth = pageRatio >= viewportRatio ? 1 : pageRatio / viewportRatio;
  const baseHeight = pageRatio >= viewportRatio ? viewportRatio / pageRatio : 1;
  const zoom = Number(view?.zoom) || 1;
  const width = baseWidth * zoom;
  const height = baseHeight * zoom;
  const travelX = zoom < 1 ? Math.max(0, (1 - width) / 2) : Math.max(0, (width - 1) / 2);
  const travelY = zoom < 1 ? Math.max(0, (1 - height) / 2) : Math.max(0, (height - 1) / 2);
  return {
    width,
    height,
    centerX: zoom === 1 ? 0.5 : 0.5 + normalizePdfPosition(view.positionX) * travelX,
    centerY: zoom === 1 ? 0.5 : 0.5 + normalizePdfPosition(view.positionY) * travelY,
    travelX,
    travelY,
    cssWidth: width * viewportWidth,
    cssHeight: height * viewportHeight
  };
}

function setStageGeometry(stage, viewport, pageInfo, view){
  if (!stage || !viewport || !pageInfo) return null;
  const geometry = getPdfGeometry(viewport, pageInfo, view);
  stage.style.width = `${geometry.width * 100}%`;
  stage.style.height = `${geometry.height * 100}%`;
  stage.style.left = `${geometry.centerX * 100}%`;
  stage.style.top = `${geometry.centerY * 100}%`;
  stage.style.transform = "translate(-50%, -50%)";
  return geometry;
}

function syncViewerState(viewer, state){
  if (!viewer) return;
  const view = getCurrentPdfView(state);
  viewer.classList.toggle("is-thumbnail", view.zoom < 1);
  viewer.classList.toggle("is-zoomed", view.zoom > 1);
  viewer.classList.toggle("is-movable", view.zoom !== 1);
}

function renderChromeControls({ chromeHost, state, sendAction } = {}){
  if (!chromeHost) return;
  if (!state.source) { chromeHost.innerHTML = ""; return; }
  const view = getCurrentPdfView(state);
  chromeHost.innerHTML = `
    <button class="ttp-widget-icon-btn ttp-material-icon" type="button" data-pdf-action="zoom-out" title="Zoom arrière" aria-label="Zoom arrière" ${view.zoom <= PDF_ZOOM_MIN ? "disabled" : ""}>zoom_out</button>
    <button class="ttp-image-zoom-label" type="button" data-pdf-action="center" title="Revenir à 100 %" aria-label="Revenir à 100 %">${escapeHtml(formatPdfZoom(view.zoom))}</button>
    <button class="ttp-widget-icon-btn ttp-material-icon" type="button" data-pdf-action="zoom-in" title="Zoom avant" aria-label="Zoom avant" ${view.zoom >= PDF_ZOOM_MAX ? "disabled" : ""}>zoom_in</button>
    <button class="ttp-widget-icon-btn ttp-material-icon" type="button" data-pdf-action="clear" title="Retirer le PDF" aria-label="Retirer le PDF">delete</button>
  `;
  chromeHost.querySelector("[data-pdf-action='zoom-out']")?.addEventListener("click", () => sendAction?.("adjust-zoom", { delta: -PDF_ZOOM_STEP }));
  chromeHost.querySelector("[data-pdf-action='zoom-in']")?.addEventListener("click", () => sendAction?.("adjust-zoom", { delta: PDF_ZOOM_STEP }));
  chromeHost.querySelector("[data-pdf-action='center']")?.addEventListener("click", () => sendAction?.("center"));
  chromeHost.querySelector("[data-pdf-action='clear']")?.addEventListener("click", () => sendAction?.("clear-pdf"));
}

export function renderPdfQuickActions({ host, state, sendAction } = {}){
  if (!host) return;
  const safeState = normalizePdfState(state);
  if (!safeState.source) { host.innerHTML = ""; return; }
  const pageCount = Math.max(0, safeState.pageCount || 0);
  host.innerHTML = `
    <button class="ttp-quick-action-btn ttp-material-icon" type="button" data-pdf-quick="previous" title="Page précédente" aria-label="Page précédente" ${safeState.currentPage <= 1 ? "disabled" : ""}>chevron_left</button>
    <label class="ttp-quick-page-jump" data-widget-action>
      <span>Page</span>
      <input type="number" min="1" max="${pageCount || 1}" value="${safeState.currentPage}" aria-label="Numéro de page">
      <span>/ ${pageCount || "?"}</span>
    </label>
    <button class="ttp-quick-action-btn ttp-material-icon" type="button" data-pdf-quick="next" title="Page suivante" aria-label="Page suivante" ${!pageCount || safeState.currentPage >= pageCount ? "disabled" : ""}>chevron_right</button>`;
  host.querySelector("[data-pdf-quick='previous']")?.addEventListener("click", () => sendAction?.("previous-page"));
  host.querySelector("[data-pdf-quick='next']")?.addEventListener("click", () => sendAction?.("next-page"));
  host.querySelector(".ttp-quick-page-jump input")?.addEventListener("change", (event) => sendAction?.("set-page", { pageNumber: Number(event.currentTarget.value) }));
}

async function sendPdfFromFile(file, sendAction){
  if (!file) return;
  try { sendAction?.("set-pdf", await preparePdfFilePayload(file)); }
  catch (error) { sendAction?.("set-load-error", { message: error?.message || "Impossible de charger ce PDF." }); }
}

async function sendPdfFromUrl(root, sendAction){
  try { sendAction?.("set-pdf", await preparePdfUrlPayload(root?.querySelector("[data-pdf-url]")?.value)); }
  catch (error) { sendAction?.("set-load-error", { message: error?.message || "Impossible de charger cette URL PDF." }); }
}

function bindWheel(viewer){
  if (!viewer || viewer.__ttpPdfWheelBound) return;
  viewer.__ttpPdfWheelBound = true;
  viewer.addEventListener("wheel", (event) => {
    viewer.__ttpPdfSendAction?.("adjust-zoom", { delta: event.deltaY < 0 ? PDF_ZOOM_STEP : -PDF_ZOOM_STEP });
    event.preventDefault();
    event.stopPropagation();
  }, { passive: false });
}

function bindPan(viewer, stage){
  if (!viewer || !stage || viewer.__ttpPdfPanBound) return;
  viewer.__ttpPdfPanBound = true;
  viewer.addEventListener("pointerdown", (event) => {
    const state = normalizePdfState(viewer.__ttpPdfState);
    const view = getCurrentPdfView(state);
    const pageInfo = viewer.__ttpPdfPageInfo;
    if (!state.source || view.zoom === 1 || !pageInfo) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target?.closest?.("button,input,label,a,[data-widget-action]")) return;
    if (!event.target?.closest?.(".ttp-pdf-stage")) return;
    const rect = viewer.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const startPositionX = normalizePdfPosition(view.positionX);
    const startPositionY = normalizePdfPosition(view.positionY);
    const geometry = getPdfGeometry(viewer, pageInfo, view);
    let nextX = startPositionX;
    let nextY = startPositionY;
    let moved = false;

    const move = (moveEvent) => {
      const dx = (moveEvent.clientX - startX) / rect.width;
      const dy = (moveEvent.clientY - startY) / rect.height;
      nextX = geometry.travelX > 0 ? normalizePdfPosition(startPositionX + dx / geometry.travelX) : 0;
      nextY = geometry.travelY > 0 ? normalizePdfPosition(startPositionY + dy / geometry.travelY) : 0;
      moved = true;
      const previewState = {
        ...state,
        pageViews: { ...state.pageViews, [String(state.currentPage)]: { ...view, positionX: nextX, positionY: nextY } }
      };
      viewer.__ttpPdfState = previewState;
      setStageGeometry(stage, viewer, pageInfo, getCurrentPdfView(previewState));
      moveEvent.preventDefault();
    };
    const end = (endEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      try { viewer.releasePointerCapture?.(event.pointerId); } catch {}
      if (moved && endEvent.type !== "pointercancel") viewer.__ttpPdfSendAction?.("set-position", { positionX: nextX, positionY: nextY });
      else if (endEvent.type === "pointercancel") setStageGeometry(stage, viewer, pageInfo, view);
      endEvent.preventDefault();
    };
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    try { viewer.setPointerCapture?.(event.pointerId); } catch {}
    event.preventDefault();
    event.stopPropagation();
  });
}

async function renderCurrentPage(viewer, stage, canvas, state, sendAction){
  const renderToken = { id: (viewer.__ttpPdfRenderId || 0) + 1, renderTask: null };
  viewer.__ttpPdfRenderId = renderToken.id;
  viewer.__ttpPdfRenderTask?.renderTask?.cancel?.();
  viewer.__ttpPdfRenderTask = null;
  const loading = viewer.querySelector(".ttp-pdf-loading");
  if (loading) loading.hidden = false;
  try {
    const document = await getPdfDocument(state.source);
    if (viewer.__ttpPdfRenderId !== renderToken.id) return;
    if (state.pageCount !== document.numPages) sendAction?.("set-document-info", { pageCount: document.numPages });
    const pageInfo = await getPdfPageInfo(document, state.currentPage);
    if (viewer.__ttpPdfRenderId !== renderToken.id) return;
    viewer.__ttpPdfPageInfo = pageInfo;
    const view = getCurrentPdfView(state);
    const geometry = setStageGeometry(stage, viewer, pageInfo, view);
    if (!geometry) return;
    const taskHolder = {};
    viewer.__ttpPdfRenderTask = taskHolder;
    await renderPdfPage({ page: pageInfo.page, canvas, cssWidth: geometry.cssWidth, cssHeight: geometry.cssHeight, signalToken: taskHolder });
    if (viewer.__ttpPdfRenderId !== renderToken.id) return;
    if (loading) loading.hidden = true;
  } catch (error) {
    if (String(error?.name || "") === "RenderingCancelledException") return;
    if (viewer.__ttpPdfRenderId !== renderToken.id) return;
    if (loading) loading.hidden = true;
    sendAction?.("set-load-error", { message: error?.message || "Impossible de lire le PDF." });
  }
}

function bindResize(viewer, stage, canvas){
  if (!viewer || viewer.__ttpPdfResizeBound) return;
  viewer.__ttpPdfResizeBound = true;
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(() => {
      const state = normalizePdfState(viewer.__ttpPdfState);
      const pageInfo = viewer.__ttpPdfPageInfo;
      if (pageInfo) setStageGeometry(stage, viewer, pageInfo, getCurrentPdfView(state));
      window.clearTimeout(viewer.__ttpPdfResizeTimer);
      viewer.__ttpPdfResizeTimer = window.setTimeout(() => renderCurrentPage(viewer, stage, canvas, state, viewer.__ttpPdfSendAction), 80);
    });
    observer.observe(viewer);
    viewer.__ttpPdfResizeObserver = observer;
  }
}

function syncExistingViewer({ host, state, sendAction }){
  const viewer = host?.querySelector?.(".ttp-pdf-viewer");
  const stage = viewer?.querySelector?.(".ttp-pdf-stage");
  const canvas = viewer?.querySelector?.(".ttp-pdf-canvas");
  if (!viewer || !stage || !canvas || viewer.dataset.pdfSource !== state.source) return false;
  const previous = normalizePdfState(viewer.__ttpPdfState);
  viewer.__ttpPdfState = state;
  viewer.__ttpPdfSendAction = sendAction;
  syncViewerState(viewer, state);
  bindWheel(viewer);
  bindPan(viewer, stage);
  bindResize(viewer, stage, canvas);
  const pageChanged = previous.currentPage !== state.currentPage;
  const zoomChanged = getCurrentPdfView(previous).zoom !== getCurrentPdfView(state).zoom;
  if (pageChanged || zoomChanged || !viewer.__ttpPdfPageInfo) renderCurrentPage(viewer, stage, canvas, state, sendAction);
  else setStageGeometry(stage, viewer, viewer.__ttpPdfPageInfo, getCurrentPdfView(state));
  const warning = viewer.querySelector(".ttp-pdf-load-warning");
  if (warning) { warning.textContent = state.loadError; warning.hidden = !state.loadError; }
  return true;
}

export function renderPdfProjector({ host, chromeHost, state, sendAction } = {}){
  if (!host) return;
  const safeState = normalizePdfState(state);
  renderChromeControls({ chromeHost, state: safeState, sendAction });

  if (!safeState.source) {
    host.innerHTML = `
      <section class="ttp-pdf-empty">
        <div class="ttp-pdf-empty-card">
          <span class="ttp-material-icon" aria-hidden="true">text_snippet</span>
          <strong>Ajouter un PDF</strong>
          <p>Choisis un fichier PDF local ou colle l’URL directe d’un PDF.</p>
          ${safeState.loadError ? `<p class="ttp-pdf-error">${escapeHtml(safeState.loadError)}</p>` : ""}
          <div class="ttp-pdf-empty-actions">
            <label class="ttp-pdf-file-btn" data-widget-action><span class="ttp-material-icon" aria-hidden="true">upload_file</span><span>Choisir un PDF</span><input type="file" accept="application/pdf,.pdf" data-pdf-file></label>
            <div class="ttp-pdf-url-row" data-widget-action><input type="url" inputmode="url" placeholder="https://…/document.pdf" data-pdf-url><button class="ttp-widget-action-btn is-primary" type="button" data-pdf-load-url>Charger</button></div>
          </div>
        </div>
      </section>`;
    const root = host.querySelector(".ttp-pdf-empty");
    root?.querySelector("[data-pdf-file]")?.addEventListener("change", (event) => { const file = event.currentTarget.files?.[0] || null; sendPdfFromFile(file, sendAction); event.currentTarget.value = ""; });
    root?.querySelector("[data-pdf-load-url]")?.addEventListener("click", () => sendPdfFromUrl(root, sendAction));
    root?.querySelector("[data-pdf-url]")?.addEventListener("keydown", (event) => { if (event.key === "Enter") sendPdfFromUrl(root, sendAction); });
    return;
  }

  if (syncExistingViewer({ host, state: safeState, sendAction })) return;

  host.innerHTML = `
    <section class="ttp-pdf-viewer${getCurrentPdfView(safeState).zoom < 1 ? " is-thumbnail" : ""}${getCurrentPdfView(safeState).zoom > 1 ? " is-zoomed" : ""}${getCurrentPdfView(safeState).zoom !== 1 ? " is-movable" : ""}" data-pdf-source="${escapeAttr(safeState.source)}">
      <div class="ttp-pdf-stage">
        <canvas class="ttp-pdf-canvas" aria-label="Page ${safeState.currentPage} du PDF"></canvas>
        <div class="ttp-pdf-loading"><span class="ttp-material-icon" aria-hidden="true">progress_activity</span><span>Chargement…</span></div>
      </div>
      <div class="ttp-pdf-load-warning" ${safeState.loadError ? "" : "hidden"}>${escapeHtml(safeState.loadError)}</div>
    </section>`;
  const viewer = host.querySelector(".ttp-pdf-viewer");
  const stage = viewer?.querySelector(".ttp-pdf-stage");
  const canvas = viewer?.querySelector(".ttp-pdf-canvas");
  if (!viewer || !stage || !canvas) return;
  viewer.__ttpPdfState = safeState;
  viewer.__ttpPdfSendAction = sendAction;
  syncViewerState(viewer, safeState);
  bindWheel(viewer);
  bindPan(viewer, stage);
  bindResize(viewer, stage, canvas);
  renderCurrentPage(viewer, stage, canvas, safeState, sendAction);
}
