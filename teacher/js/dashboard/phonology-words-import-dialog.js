import {
  buildPhonologyWordsSeedSql,
  parsePhonologyWordsText
} from "../../../shared/phonology-words-format.js";
import { openDashboardConfirmDialog } from "./confirm-dialog.js";
import { renderMaterialIcon } from "../../../shared/material-icons-svg.js";
import { escapeHtml } from "./text-utils.js";

function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8"){
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function formatSyncResult(result){
  const inserted = Number(result?.inserted_count) || 0;
  const modified = Number(result?.modified_count) || 0;
  const reactivated = Number(result?.reactivated_count) || 0;
  const unchanged = Number(result?.unchanged_count) || 0;
  const deactivated = Number(result?.deactivated_count) || 0;
  const active = Number(result?.active_count) || 0;
  return `Synchronisation terminée : ${inserted} ajouté${inserted > 1 ? "s" : ""}, ${modified} modifié${modified > 1 ? "s" : ""}, ${reactivated} réactivé${reactivated > 1 ? "s" : ""}, ${unchanged} inchangé${unchanged > 1 ? "s" : ""}, ${deactivated} désactivé${deactivated > 1 ? "s" : ""}. ${active} mots actifs en base.`;
}

function isMigrationMissingError(error){
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("sync_phonology_words_as_admin")
    || message.includes("could not find the function")
    || message.includes("schema cache");
}

export function createPhonologyWordsImportDialog({
  openButton,
  getIsSuperAdmin,
  syncPhonologyWordsAsAdmin,
  showToast
} = {}){
  let overlay = null;
  let fileInput = null;
  let sourceTextarea = null;
  let reportHost = null;
  let syncButton = null;
  let exportButton = null;
  let deactivateMissingInput = null;
  let currentAnalysis = null;
  let isSyncing = false;

  function ensureOverlay(){
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.className = "cfg-modal phonology-import-modal hidden";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="cfg-modal-backdrop" data-close-phonology-import="true"></div>
      <section class="panel cfg-modal-card phonology-import-card" role="dialog" aria-modal="true" aria-labelledby="phonologyImportTitle">
        <header class="cfg-modal-header phonology-import-header">
          <div>
            <div id="phonologyImportTitle" class="cfg-modal-title">Banque phonologique</div>
            <div class="cfg-modal-subtitle">Charge le fichier texte, vérifie chaque segmentation, puis synchronise Supabase.</div>
          </div>
          <button class="btn cfg-modal-close" type="button" data-close-phonology-import="true" aria-label="Fermer">✕</button>
        </header>

        <div class="phonology-import-toolbar">
          <button class="btn primary dashboard-btn-with-icon" type="button" data-action="choose-phonology-file">
            ${renderMaterialIcon("upload_file", { className: "dashboard-material-icon" })}
            <span>Choisir le fichier texte</span>
          </button>
          <button class="btn dashboard-btn-with-icon" type="button" data-action="analyze-phonology-source">
            ${renderMaterialIcon("fact_check", { className: "dashboard-material-icon" })}
            <span>Analyser</span>
          </button>
          <input type="file" accept=".txt,text/plain" data-phonology-file hidden>
          <span class="phonology-import-file-name" data-phonology-file-name>Aucun fichier chargé</span>
        </div>

        <div class="phonology-import-layout">
          <label class="phonology-import-source-panel">
            <span class="phonology-import-panel-title">Contenu du fichier</span>
            <small class="phonology-import-format-hint">Codes canoniques obligatoires : <strong>c_k</strong>, <strong>s_z</strong>, <strong>y_i</strong>… Aucun ancien code ni valeur automatique.</small>
            <small class="phonology-import-format-hint">Syntaxe : code explicite pour une graphie ambiguë (<strong>c_k</strong>, <strong>s_z</strong>…), graphie directe lorsqu’elle est unique (<strong>ss</strong>, <strong>ll</strong>, <strong>rr</strong>), <strong>code=graphie</strong> pour une variante (<strong>a=â</strong>) et <strong>*lettres</strong> pour les lettres muettes.</small>
            <small class="phonology-import-format-hint">Les compositions d’encodage comme <strong>ec_cons</strong> ou <strong>ette</strong> sont déduites automatiquement : elles ne doivent pas apparaître dans la segmentation fine.</small>
            <textarea class="modal-text-input phonology-import-source" spellcheck="false" placeholder="couronne|c_k/ou/r/o/nn/*e"></textarea>
          </label>

          <section class="phonology-import-report-panel" aria-live="polite">
            <div class="phonology-import-panel-title">Contrôle</div>
            <div class="phonology-import-report">
              <div class="dashboard-activity-empty-state">Charge un fichier <strong>.txt</strong> pour commencer.</div>
            </div>
          </section>
        </div>

        <label class="phonology-import-sync-option">
          <input type="checkbox" data-deactivate-missing checked>
          <span>
            <strong>Synchronisation exacte</strong>
            <small>Les mots absents du fichier seront désactivés dans Supabase, jamais supprimés.</small>
          </span>
        </label>

        <footer class="phonology-import-actions">
          <button class="btn" type="button" data-action="export-phonology-seed" disabled>Exporter la seed SQL</button>
          <div class="phonology-import-actions-spacer"></div>
          <button class="btn" type="button" data-close-phonology-import="true">Fermer</button>
          <button class="btn primary dashboard-btn-with-icon" type="button" data-action="sync-phonology-words" disabled>
            ${renderMaterialIcon("cloud_sync", { className: "dashboard-material-icon" })}
            <span>Synchroniser Supabase</span>
          </button>
        </footer>
      </section>
    `;

    document.body.appendChild(overlay);
    fileInput = overlay.querySelector("[data-phonology-file]");
    sourceTextarea = overlay.querySelector(".phonology-import-source");
    reportHost = overlay.querySelector(".phonology-import-report");
    syncButton = overlay.querySelector("[data-action='sync-phonology-words']");
    exportButton = overlay.querySelector("[data-action='export-phonology-seed']");
    deactivateMissingInput = overlay.querySelector("[data-deactivate-missing]");

    overlay.querySelectorAll("[data-close-phonology-import]").forEach((element) => {
      element.addEventListener("click", close);
    });
    overlay.querySelector("[data-action='choose-phonology-file']")?.addEventListener("click", () => fileInput?.click());
    overlay.querySelector("[data-action='analyze-phonology-source']")?.addEventListener("click", analyze);
    overlay.querySelector("[data-action='sync-phonology-words']")?.addEventListener("click", synchronize);
    overlay.querySelector("[data-action='export-phonology-seed']")?.addEventListener("click", exportSeed);
    fileInput?.addEventListener("change", loadSelectedFile);
    sourceTextarea?.addEventListener("input", () => {
      currentAnalysis = null;
      syncButton.disabled = true;
      exportButton.disabled = true;
      reportHost.innerHTML = '<div class="phonology-import-pending">Le contenu a changé. Clique sur <strong>Analyser</strong>.</div>';
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
  }

  function open(){
    if (getIsSuperAdmin?.() !== true) {
      showToast?.("Cette banque est réservée au super-admin.", { isError: true });
      return;
    }
    ensureOverlay();
    overlay.classList.remove("hidden");
    overlay.setAttribute("aria-hidden", "false");
    window.requestAnimationFrame(() => overlay.querySelector("[data-action='choose-phonology-file']")?.focus());
  }

  function close(){
    if (!overlay || isSyncing) return;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }

  async function loadSelectedFile(){
    const file = fileInput?.files?.[0];
    if (!file) return;
    if (!String(file.name || "").toLowerCase().endsWith(".txt")) {
      showToast?.("Choisis un fichier texte .txt.", { isError: true });
      fileInput.value = "";
      return;
    }

    try {
      const text = await file.text();
      sourceTextarea.value = text;
      const name = overlay.querySelector("[data-phonology-file-name]");
      if (name) name.textContent = `${file.name} · ${Math.max(1, Math.ceil(file.size / 1024))} Ko`;
      analyze();
    } catch (error) {
      console.error(error);
      showToast?.("Impossible de lire ce fichier.", { isError: true });
    }
  }

  function analyze(){
    currentAnalysis = parsePhonologyWordsText(sourceTextarea?.value || "");
    renderAnalysis();
  }

  function renderAnalysis(){
    const analysis = currentAnalysis;
    if (!analysis) return;
    syncButton.disabled = !analysis.isValid || isSyncing;
    exportButton.disabled = !analysis.isValid || isSyncing;

    const stats = analysis.stats;
    const summaryClass = analysis.isValid ? "is-valid" : "is-invalid";
    const issues = analysis.issues.slice(0, 50);
    const warnings = analysis.warnings.slice(0, 30);
    const coverage = analysis.coverage.slice(0, 20);

    const issueHtml = issues.length
      ? `<div class="phonology-import-issue-section">
          <h3>Erreurs à corriger</h3>
          <ul>${issues.map((issue) => `<li><strong>${issue.line ? `Ligne ${issue.line}` : "Fichier"}</strong> — ${escapeHtml(issue.message)}</li>`).join("")}</ul>
          ${analysis.issues.length > issues.length ? `<p>… et ${analysis.issues.length - issues.length} autre(s) erreur(s).</p>` : ""}
        </div>`
      : "";

    const warningHtml = warnings.length
      ? `<details class="phonology-import-warning-section">
          <summary>${analysis.warnings.length} alerte${analysis.warnings.length > 1 ? "s" : ""} à examiner</summary>
          <ul>${warnings.map((warning) => `<li>${warning.line ? `<strong>Ligne ${warning.line}</strong> — ` : ""}${escapeHtml(warning.message)}</li>`).join("")}</ul>
          ${analysis.warnings.length > warnings.length ? `<p>… et ${analysis.warnings.length - warnings.length} autre(s) alerte(s).</p>` : ""}
        </details>`
      : "";

    const coverageHtml = coverage.length
      ? `<div class="phonology-import-coverage">
          <h3>Graphèmes les plus représentés</h3>
          <div class="phonology-import-coverage-grid">
            ${coverage.map((entry) => `<span><strong>${escapeHtml(entry.label)}</strong><small>${entry.wordCount} mot${entry.wordCount > 1 ? "s" : ""}</small></span>`).join("")}
          </div>
        </div>`
      : "";

    reportHost.innerHTML = `
      <div class="phonology-import-summary ${summaryClass}">
        <div><strong>${stats.wordCount}</strong><span>mots prêts</span></div>
        <div><strong>${stats.graphCount}</strong><span>graphèmes utilisés</span></div>
        <div><strong>${stats.errorCount}</strong><span>erreur${stats.errorCount > 1 ? "s" : ""}</span></div>
        <div><strong>${stats.warningCount}</strong><span>alerte${stats.warningCount > 1 ? "s" : ""}</span></div>
      </div>
      ${analysis.isValid ? `<div class="phonology-import-valid-message">${renderMaterialIcon("check_circle", { className: "dashboard-material-icon" })}<span>Le fichier est valide et peut être synchronisé.</span></div>` : ""}
      ${issueHtml}
      ${warningHtml}
      ${coverageHtml}
    `;
  }

  async function synchronize(){
    if (!currentAnalysis?.isValid || isSyncing) return;
    const deactivateMissing = deactivateMissingInput?.checked === true;
    const confirmed = await openDashboardConfirmDialog({
      title: "Synchroniser la banque phonologique",
      message: deactivateMissing
        ? `${currentAnalysis.rows.length} mots seront envoyés. Tous les mots actuellement en base mais absents de ce fichier seront désactivés.`
        : `${currentAnalysis.rows.length} mots seront ajoutés ou mis à jour. Les autres mots déjà présents resteront actifs.`,
      confirmLabel: "Synchroniser"
    });
    if (!confirmed) return;

    isSyncing = true;
    syncButton.disabled = true;
    exportButton.disabled = true;
    syncButton.classList.add("is-loading");

    try {
      const result = await syncPhonologyWordsAsAdmin(currentAnalysis.rows, { deactivateMissing });
      const message = formatSyncResult(result);
      reportHost.insertAdjacentHTML("afterbegin", `<div class="phonology-import-sync-result">${renderMaterialIcon("check_circle", { className: "dashboard-material-icon" })}<span>${escapeHtml(message)}</span></div>`);
      showToast?.(message);
    } catch (error) {
      console.error(error);
      const message = isMigrationMissingError(error)
        ? "La migration 21_phonology_words_import.sql doit être exécutée une seule fois dans Supabase avant le premier import."
        : String(error?.message || "La synchronisation Supabase a échoué.");
      reportHost.insertAdjacentHTML("afterbegin", `<div class="phonology-import-sync-error"><strong>Synchronisation impossible.</strong><span>${escapeHtml(message)}</span></div>`);
      showToast?.(message, { isError: true, duration: 7000 });
    } finally {
      isSyncing = false;
      syncButton.classList.remove("is-loading");
      syncButton.disabled = !currentAnalysis?.isValid;
      exportButton.disabled = !currentAnalysis?.isValid;
    }
  }

  function exportSeed(){
    if (!currentAnalysis?.isValid) return;
    const sql = buildPhonologyWordsSeedSql(currentAnalysis.rows, {
      deactivateMissing: deactivateMissingInput?.checked === true
    });
    downloadTextFile("seed_phonology_words.sql", sql, "application/sql;charset=utf-8");
    showToast?.("Seed SQL générée.");
  }

  openButton?.addEventListener("click", open);

  return {
    open,
    close,
    setVisible(visible){
      openButton?.classList.toggle("hidden", visible !== true);
    }
  };
}
