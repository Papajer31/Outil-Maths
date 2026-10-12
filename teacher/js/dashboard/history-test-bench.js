// TEMPORARY HISTORY TEST BENCH — REMOVE AFTER HISTORY MIGRATION.
// Ce module ne persiste rien : il affiche uniquement les snapshots capturés en mémoire
// par la fenêtre de test/projection.
import { fitHistorySequenceGlyphs, renderActivityHistoryTable } from "./history-table-renderer.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";
import { createDecimalHistoryPreviewUrl } from "./decimal-history-preview.js";
import { createNumberLineHistoryPreviewUrl } from "./number-line-history-preview.js";
import { createCollectionTracePreviewUrl } from "./collection-history-preview.js";
import { createMillimetreHistoryPreviewUrl, getMillimetreHistoryDialogSize } from "./millimetre-history-preview.js";
import { createPointsAlignedHistoryPreviewUrl } from "./points-aligned-history-preview.js";
import { createMotCacheHistoryPreviewUrl, getMotCacheHistoryDialogSize } from "./mot-cache-history-preview.js";

const STYLE_ID = "temporaryHistoryTestBenchStyles";

function ensureTemporaryStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    /* TEMPORARY HISTORY TEST BENCH — REMOVE AFTER HISTORY MIGRATION. */
    .temporary-history-test-bench{
      margin:14px 18px 24px;
      flex:0 0 clamp(320px, 45%, 520px);
      min-height:320px;
      max-height:520px;
      display:flex;
      flex-direction:column;
      border:1px dashed rgba(124,152,255,.38);
      border-radius:12px;
      background:rgba(15,23,42,.34);
      overflow:hidden;
    }
    .temporary-history-test-bench[hidden]{display:none!important;}
    .temporary-history-test-bench-head{
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:14px;
      padding:10px 12px;
      border-bottom:1px solid rgba(148,163,184,.12);
      background:rgba(124,152,255,.055);
    }
    .temporary-history-test-bench-title{
      display:flex;
      align-items:baseline;
      flex-wrap:wrap;
      gap:8px;
      min-width:0;
    }
    .temporary-history-test-bench-title strong{font-size:13px;}
    .temporary-history-test-bench-title span{font-size:11px;color:var(--muted);}
    .temporary-history-test-bench-actions{display:flex;align-items:center;gap:7px;}
    .temporary-history-test-bench-actions .btn{min-height:30px;padding:5px 9px;font-size:11px;}
    .temporary-history-test-bench-body{
      flex:1 1 auto;
      min-width:0;
      min-height:0;
      padding:0 12px 12px;
      overflow-y:auto;
      overflow-x:hidden;
      overscroll-behavior:contain;
      scrollbar-gutter:stable;
    }
    .temporary-history-test-bench-empty{
      padding:14px 2px 2px;
      color:var(--muted);
      font-size:12px;
    }
    .temporary-history-test-bench-meta{
      display:flex;
      align-items:center;
      gap:10px;
      padding:9px 0 0;
      color:var(--muted);
      font-size:11px;
    }
    .temporary-history-test-bench-meta strong{color:var(--text);font-size:12px;}
    .temporary-history-test-bench .dashboard-history-table-wrap{padding-top:8px;}
  `;
  document.head.append(style);
}

function formatDuration(value) {
  const milliseconds = Math.max(0, Math.trunc(Number(value) || 0));
  if (!milliseconds) return "—";
  const totalSeconds = Math.max(1, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (!minutes) return `${seconds} s`;
  return `${minutes} min ${String(seconds).padStart(2, "0")}`;
}

export function createHistoryTestBench({ host, title = "Activité", showLevel = false } = {}) {
  if (!(host instanceof HTMLElement)) return null;
  ensureTemporaryStyles();

  const section = document.createElement("section");
  section.className = "temporary-history-test-bench";
  section.dataset.temporaryHistoryTestBench = "true";
  section.innerHTML = `
    <div class="temporary-history-test-bench-head">
      <div class="temporary-history-test-bench-title">
        <strong>Banc de test historique</strong>
        <span>Temporaire · aucune donnée n’est enregistrée</span>
      </div>
      <div class="temporary-history-test-bench-actions">
        <button class="btn" type="button" data-history-test-reset>Réinitialiser</button>
        <button class="btn" type="button" data-history-test-hide>Masquer</button>
      </div>
    </div>
    <div class="temporary-history-test-bench-body" data-history-test-body></div>
    <dialog class="dashboard-history-image-dialog" data-history-test-image-dialog aria-label="Aperçu de l’image">
      <img data-history-test-image alt="" />
    </dialog>
  `;
  host.append(section);

  const body = section.querySelector("[data-history-test-body]");
  const imageDialog = section.querySelector("[data-history-test-image-dialog]");
  const imageDialogImage = section.querySelector("[data-history-test-image]");
  let currentDecimalPreviewUrl = "";
  let currentNumberLinePreviewUrl = "";
  let currentCollectionTracePreviewUrl = "";
  let currentMillimetrePreviewUrl = "";
  let currentPointsAlignedPreviewUrl = "";
  let currentMotCachePreviewUrl = "";
  let currentAttempt = null;
  let visible = true;

  const releaseGeneratedPreviewUrls = () => {
    if (currentDecimalPreviewUrl) URL.revokeObjectURL(currentDecimalPreviewUrl);
    if (currentNumberLinePreviewUrl) URL.revokeObjectURL(currentNumberLinePreviewUrl);
    if (currentCollectionTracePreviewUrl) URL.revokeObjectURL(currentCollectionTracePreviewUrl);
    if (currentMillimetrePreviewUrl) URL.revokeObjectURL(currentMillimetrePreviewUrl);
    if (currentPointsAlignedPreviewUrl) URL.revokeObjectURL(currentPointsAlignedPreviewUrl);
    if (currentMotCachePreviewUrl) URL.revokeObjectURL(currentMotCachePreviewUrl);
    currentDecimalPreviewUrl = "";
    currentNumberLinePreviewUrl = "";
    currentCollectionTracePreviewUrl = "";
    currentMillimetrePreviewUrl = "";
    currentPointsAlignedPreviewUrl = "";
    currentMotCachePreviewUrl = "";
  };

  const closeImage = () => {
    if (imageDialog instanceof HTMLDialogElement && imageDialog.open) imageDialog.close();
  };

  imageDialog?.addEventListener("click", (event) => {
    if (event.target === imageDialog) closeImage();
  });
  imageDialog?.addEventListener("close", () => {
    if (!(imageDialogImage instanceof HTMLImageElement)) return;
    imageDialogImage.removeAttribute("src");
    imageDialogImage.alt = "";
    releaseGeneratedPreviewUrls();
    imageDialog?.style.removeProperty("background");
    imageDialog?.style.removeProperty("width");
    imageDialog?.style.removeProperty("height");
    imageDialog?.style.removeProperty("padding");
  });

  section.addEventListener("click", async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const imageTrigger = target?.closest("[data-history-image-preview]");
    const decimalTrigger = target?.closest("[data-history-decimal-preview]");
    const numberLineTrigger = target?.closest("[data-history-number-line-preview]");
    const collectionTraceTrigger = target?.closest("[data-history-collection-trace-preview]");
    const millimetreTrigger = target?.closest("[data-history-mm-preview]");
    const pointsAlignedTrigger = target?.closest("[data-history-points-preview]");
    const motCacheTrigger = target?.closest("[data-history-mot-cache-preview]");
    const trigger = motCacheTrigger || pointsAlignedTrigger || millimetreTrigger || collectionTraceTrigger || numberLineTrigger || decimalTrigger || imageTrigger;
    if (!trigger || !section.contains(trigger)) return;
    if (!(imageDialog instanceof HTMLDialogElement) || !(imageDialogImage instanceof HTMLImageElement)) return;
    event.preventDefault();

    let src = "";
    let alt = "Image proposée";
    imageDialog.style.removeProperty("background");
    imageDialog.style.removeProperty("width");
    imageDialog.style.removeProperty("height");
    imageDialog.style.removeProperty("padding");
    if (motCacheTrigger) {
      let preview = null;
      try { preview = JSON.parse(String(motCacheTrigger.dataset.historyMotCachePreview || "")); } catch { preview = null; }
      releaseGeneratedPreviewUrls();
      try {
        currentMotCachePreviewUrl = createMotCacheHistoryPreviewUrl(preview);
      } catch (error) {
        console.warn("Aperçu Mot caché indisponible.", error);
        currentMotCachePreviewUrl = "";
      }
      src = currentMotCachePreviewUrl;
      alt = preview?.view === "selection" ? "Sélection de l’élève et correction" : "Grille proposée à l’élève";
      const dialogSize = getMotCacheHistoryDialogSize(preview, {
        maxWidth: window.innerWidth - 40, maxHeight: window.innerHeight - 40
      });
      imageDialog.style.width = `${dialogSize.width}px`;
      imageDialog.style.height = `${dialogSize.height}px`;
      imageDialog.style.padding = "0";
    } else if (pointsAlignedTrigger) {
      let preview = null;
      try { preview = JSON.parse(String(pointsAlignedTrigger.dataset.historyPointsPreview || "")); } catch { preview = null; }
      releaseGeneratedPreviewUrls();
      try {
        currentPointsAlignedPreviewUrl = createPointsAlignedHistoryPreviewUrl(preview);
      } catch (error) {
        console.warn("Aperçu Points alignés indisponible.", error);
        currentPointsAlignedPreviewUrl = "";
      }
      src = currentPointsAlignedPreviewUrl;
      alt = preview?.view === "selection" ? "Sélection de l’élève et correction" : "Figure présentée à l’élève";
      imageDialog.style.width = "min(940px, calc(100vw - 40px))";
      imageDialog.style.height = "min(540px, calc(100vh - 40px))";
      imageDialog.style.padding = "10px";
    } else if (millimetreTrigger) {
      let preview = null;
      try { preview = JSON.parse(String(millimetreTrigger.dataset.historyMmPreview || "")); } catch { preview = null; }
      releaseGeneratedPreviewUrls();
      try {
        currentMillimetrePreviewUrl = await createMillimetreHistoryPreviewUrl(preview);
      } catch (error) {
        console.warn("Aperçu M. Millimètre indisponible.", error);
        currentMillimetrePreviewUrl = "";
      }
      src = currentMillimetrePreviewUrl;
      alt = preview?.mode === "build" ? "Construction de l’élève" : "Mesure de l’énoncé";
      const dialogSize = getMillimetreHistoryDialogSize(preview, {
        maxWidth: window.innerWidth - 40, maxHeight: window.innerHeight - 40
      });
      imageDialog.style.width = `${dialogSize.width}px`;
      imageDialog.style.height = `${dialogSize.height}px`;
      imageDialog.style.padding = "0";
    } else if (collectionTraceTrigger) {
      let preview = null;
      try { preview = JSON.parse(String(collectionTraceTrigger.dataset.historyCollectionTracePreview || "")); } catch { preview = null; }
      releaseGeneratedPreviewUrls();
      try {
        currentCollectionTracePreviewUrl = await createCollectionTracePreviewUrl(preview);
      } catch (error) {
        console.warn("Aperçu du tracé de l’élève indisponible.", error);
        currentCollectionTracePreviewUrl = "";
      }
      src = currentCollectionTracePreviewUrl;
      alt = "Tracé de l’élève sur les collections";
      imageDialog.style.background = "#0c0e13";
      imageDialog.style.width = "min(720px, calc(100vw - 40px))";
      imageDialog.style.height = "min(440px, calc(100vh - 40px))";
      imageDialog.style.padding = "10px";
    } else if (numberLineTrigger) {
      let preview = null;
      try { preview = JSON.parse(String(numberLineTrigger.dataset.historyNumberLinePreview || "")); } catch { preview = null; }
      releaseGeneratedPreviewUrls();
      try {
        currentNumberLinePreviewUrl = await createNumberLineHistoryPreviewUrl(preview);
      } catch (error) {
        console.warn("Aperçu de droite numérique indisponible.", error);
        currentNumberLinePreviewUrl = "";
      }
      src = currentNumberLinePreviewUrl;
      alt = "Droite numérique de la question";
    } else if (decimalTrigger) {
      let preview = null;
      try { preview = JSON.parse(String(decimalTrigger.dataset.historyDecimalPreview || "")); } catch { preview = null; }
      releaseGeneratedPreviewUrls();
      try {
        currentDecimalPreviewUrl = await createDecimalHistoryPreviewUrl(preview);
      } catch (error) {
        console.warn("Aperçu de représentation indisponible.", error);
        currentDecimalPreviewUrl = "";
      }
      src = currentDecimalPreviewUrl;
      alt = "Représentation de la question";
    } else {
      src = String(imageTrigger?.dataset.historyImageSrc || "").trim();
      alt = String(imageTrigger?.dataset.historyImageAlt || "Image proposée").trim() || "Image proposée";
    }

    if (!src) return;
    imageDialogImage.src = src;
    imageDialogImage.alt = alt;
    if (!imageDialog.open) imageDialog.showModal();
  });

  function render() {
    if (!body) return;
    const questions = Array.isArray(currentAttempt?.questions) ? currentAttempt.questions : [];
    const table = renderActivityHistoryTable(questions, { formatDuration, showLevel:showLevel === true });
    if (!questions.length) {
      body.innerHTML = `
        <div class="temporary-history-test-bench-empty">
          Lance « Historique », fais quelques questions puis ferme la fenêtre de test. Le tableau apparaîtra ici sans créer de tentative élève.
        </div>
      `;
      return;
    }
    const correct = questions.filter((question) => String(question?.outcome || "") === "correct").length;
    body.innerHTML = `
      <div class="temporary-history-test-bench-meta">
        <strong>${escapeHtml(title || "Activité")}</strong>
        <span>${questions.length} question${questions.length > 1 ? "s" : ""}</span>
        <span>${correct}/${questions.length} réussie${correct > 1 ? "s" : ""}</span>
      </div>
      ${table || '<div class="temporary-history-test-bench-empty">Historique détaillé non disponible pour cet outil.</div>'}
    `;
    fitHistorySequenceGlyphs(body);
  }

  section.querySelector("[data-history-test-reset]")?.addEventListener("click", () => {
    currentAttempt = null;
    render();
  });
  section.querySelector("[data-history-test-hide]")?.addEventListener("click", () => {
    visible = false;
    section.hidden = true;
  });

  render();
  section.scrollIntoView?.({ block:"nearest", behavior:"smooth" });

  return {
    updateAttempt(attempt) {
      currentAttempt = attempt && typeof attempt === "object" ? structuredCloneSafe(attempt) : null;
      if (!visible) {
        visible = true;
        section.hidden = false;
      }
      render();
    },
    reset() {
      currentAttempt = null;
      if (!visible) {
        visible = true;
        section.hidden = false;
      }
      render();
    },
    show() {
      visible = true;
      section.hidden = false;
      render();
    },
    destroy() {
      closeImage();
      section.remove();
    }
  };
}

function structuredCloneSafe(value) {
  if (typeof structuredClone === "function") {
    try { return structuredClone(value); } catch {}
  }
  try { return JSON.parse(JSON.stringify(value)); } catch { return value; }
}
