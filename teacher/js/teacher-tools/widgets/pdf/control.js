import {
  PDF_ZOOM_MAX,
  PDF_ZOOM_MIN,
  PDF_ZOOM_STEP,
  applyPdfAction,
  getCurrentPdfView,
  normalizePdfState
} from "./model.js";
import { inspectPdfDocument } from "./engine.js";
import { formatPdfZoom, preparePdfFilePayload, preparePdfUrlPayload } from "./source.js";
import { escapeAttr, escapeHtml } from "../../../dashboard/text-utils.js";
import { renderActionButton } from "../../ui/controls.js";

export function createPdfControlPanel({ host, getWidget, updateWidget, showToast } = {}){
  let inspectToken = 0;

  function getCurrentPage(){ return getWidget?.() || null; }
  function getCurrentState(){ return normalizePdfState(getCurrentPage()?.state); }

  function commitAction(action, payload = {}, { renderAfter = true } = {}){
    const page = getCurrentPage();
    const result = applyPdfAction({ action, payload, state: page?.state, page });
    if (!result) return null;
    if (result.error) {
      showToast?.(String(result.error), { isError: true });
      return result;
    }
    if (result.patch) updateWidget?.(result.patch, { renderPanel: renderAfter, sync: true });
    if (result.message) showToast?.(String(result.message), { isError: result.isError === true });
    return result;
  }

  async function inspectCurrentPdf(){
    const state = getCurrentState();
    if (!state.source) return;
    const token = ++inspectToken;
    try {
      const info = await inspectPdfDocument(state.source);
      if (token !== inspectToken) return;
      commitAction("set-document-info", info);
    } catch (error) {
      if (token !== inspectToken) return;
      commitAction("set-load-error", { message: error?.message || "Impossible de lire ce PDF." });
    }
  }

  async function setPdfFromFile(file){
    if (!file) return;
    try {
      const payload = await preparePdfFilePayload(file);
      const result = commitAction("set-pdf", payload, { renderAfter: false });
      if (!result?.error) inspectCurrentPdf();
    } catch (error) {
      showToast?.(error?.message || "Impossible de charger ce PDF.", { isError: true });
    }
  }

  async function setPdfFromUrl(){
    const input = host?.querySelector("#ttPdfUrlInput");
    try {
      const payload = await preparePdfUrlPayload(input?.value);
      const result = commitAction("set-pdf", payload, { renderAfter: false });
      if (!result?.error) inspectCurrentPdf();
    } catch (error) {
      showToast?.(error?.message || "Impossible de charger cette URL PDF.", { isError: true });
    }
  }

  function render(){
    if (!host) return;
    const state = getCurrentState();
    const view = getCurrentPdfView(state);
    const hasPdf = Boolean(state.source);
    const pageCount = Math.max(0, state.pageCount || 0);
    const canPrevious = hasPdf && state.currentPage > 1;
    const canNext = hasPdf && pageCount > 0 && state.currentPage < pageCount;

    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-pdf-control" aria-label="Contrôles de l’application PDF">
        <div class="tt-control-panel-head"><div><h3>PDF</h3></div></div>

        <div class="tt-widget-action-bar" aria-label="Actions PDF">
          <label class="tt-widget-action-btn is-primary tt-pdf-file-btn">
            <span class="dashboard-material-icon" aria-hidden="true">upload_file</span>
            <span>Choisir un PDF</span>
            <input id="ttPdfFileInput" type="file" accept="application/pdf,.pdf">
          </label>
          ${renderActionButton({ id: "ttPdfPrevious", label: "Page précédente", icon: "chevron_left", className: "tt-widget-action-btn", disabled: !canPrevious })}
          <div class="tt-pdf-page-control">
            <label for="ttPdfPageInput">Page</label>
            <input id="ttPdfPageInput" type="number" min="1" max="${pageCount || 1}" value="${state.currentPage}" ${hasPdf ? "" : "disabled"}>
            <span>/ ${pageCount || "?"}</span>
          </div>
          ${renderActionButton({ id: "ttPdfNext", label: "Page suivante", icon: "chevron_right", className: "tt-widget-action-btn", disabled: !canNext })}
          ${renderActionButton({ id: "ttPdfZoomOut", label: "Zoom -", icon: "zoom_out", className: "tt-widget-action-btn", disabled: !(hasPdf && view.zoom > PDF_ZOOM_MIN) })}
          ${renderActionButton({ id: "ttPdfCenter", label: "100 %", icon: "fit_screen", className: "tt-widget-action-btn", disabled: !hasPdf })}
          ${renderActionButton({ id: "ttPdfZoomIn", label: "Zoom +", icon: "zoom_in", className: "tt-widget-action-btn", disabled: !(hasPdf && view.zoom < PDF_ZOOM_MAX) })}
          ${hasPdf ? renderActionButton({ id: "ttPdfClear", label: "Retirer", icon: "delete", className: "tt-widget-action-btn is-danger" }) : ""}
        </div>

        <div class="tt-pdf-source-grid">
          <div class="tt-pdf-url-row">
            <input id="ttPdfUrlInput" type="url" inputmode="url" placeholder="https://…/document.pdf" value="${hasPdf && state.sourceKind === "url" ? escapeAttr(state.source) : ""}">
            <button id="ttPdfLoadUrl" class="tt-widget-action-btn is-primary" type="button">Charger</button>
          </div>
        </div>

        ${hasPdf ? `
          <div class="tt-pdf-preview-card">
            <span class="dashboard-material-icon tt-pdf-preview-icon" aria-hidden="true">text_snippet</span>
            <div class="tt-pdf-preview-meta">
              <strong>${escapeHtml(state.title || state.pdfName || "PDF")}</strong>
              <span>Page ${state.currentPage}${pageCount ? ` / ${pageCount}` : ""} · ${escapeHtml(formatPdfZoom(view.zoom))}</span>
            </div>
          </div>
          ${state.loadError ? `<div class="tt-pdf-error">${escapeHtml(state.loadError)}</div>` : ""}
        ` : `
          <div class="tt-pdf-empty-card"><strong>Aucun PDF sélectionné.</strong><span>Choisis un fichier PDF local ou colle une URL directe.</span></div>
        `}
      </section>`;

    host.querySelector("#ttPdfFileInput")?.addEventListener("change", (event) => {
      const file = event.currentTarget.files?.[0] || null;
      setPdfFromFile(file);
      event.currentTarget.value = "";
    });
    host.querySelector("#ttPdfLoadUrl")?.addEventListener("click", setPdfFromUrl);
    host.querySelector("#ttPdfUrlInput")?.addEventListener("keydown", (event) => { if (event.key === "Enter") setPdfFromUrl(); });
    host.querySelector("#ttPdfPrevious")?.addEventListener("click", () => commitAction("previous-page"));
    host.querySelector("#ttPdfNext")?.addEventListener("click", () => commitAction("next-page"));
    host.querySelector("#ttPdfPageInput")?.addEventListener("change", (event) => commitAction("set-page", { pageNumber: Number(event.currentTarget.value) }));
    host.querySelector("#ttPdfZoomOut")?.addEventListener("click", () => commitAction("adjust-zoom", { delta: -PDF_ZOOM_STEP }));
    host.querySelector("#ttPdfZoomIn")?.addEventListener("click", () => commitAction("adjust-zoom", { delta: PDF_ZOOM_STEP }));
    host.querySelector("#ttPdfCenter")?.addEventListener("click", () => commitAction("center"));
    host.querySelector("#ttPdfClear")?.addEventListener("click", () => { inspectToken += 1; commitAction("clear-pdf"); });
  }

  render();
  return {
    render,
    destroy(){ inspectToken += 1; if (host) host.innerHTML = ""; }
  };
}
