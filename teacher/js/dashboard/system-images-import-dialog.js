import { openDashboardConfirmDialog } from "./confirm-dialog.js";
import { renderMaterialIcon } from "../../../shared/material-icons-svg.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";

const MAX_SYSTEM_IMAGE_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/svg+xml"
]);

function formatBytes(value){
  const bytes = Math.max(0, Number(value) || 0);
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} Mo`;
}

function inferMimeType(file){
  const declared = String(file?.type || "").trim().toLowerCase();
  if (ACCEPTED_MIME_TYPES.has(declared)) return declared;
  const extension = String(file?.name || "").split(".").pop()?.toLowerCase() || "";
  return {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    avif: "image/avif",
    svg: "image/svg+xml"
  }[extension] || "";
}

function normalizeSlug(value){
  return String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 120);
}

function normalizeAssociatedWordSlug(value){
  return String(value || "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR")
    .replace(/[’']/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fileNameWithoutExtension(file){
  return String(file?.name || "").replace(/\.[^.]+$/, "").trim().normalize("NFC");
}

function buildUniqueTechnicalSlug(baseSlug, blockedSlugs){
  const normalizedBase = normalizeSlug(baseSlug);
  if (!normalizedBase) return "";
  if (!(blockedSlugs instanceof Set) || !blockedSlugs.has(normalizedBase)) return normalizedBase;

  for (let index = 2; index < 10000; index += 1) {
    const suffix = `-${index}`;
    const trimmedBase = normalizedBase.slice(0, Math.max(1, 120 - suffix.length)).replace(/[-_]+$/g, "");
    const candidate = `${trimmedBase}${suffix}`;
    if (!blockedSlugs.has(candidate)) return candidate;
  }

  return "";
}

function normalizeBatchPrefix(value){
  const normalized = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "-")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/-+/g, "-")
    .replace(/^[-_]+/, "");
  if (!normalized) return "";
  return /[-_]$/.test(normalized) ? normalized : `${normalized}_`;
}

function slugFromFile(file, prefix = ""){
  return normalizeSlug(`${prefix}${fileNameWithoutExtension(file)}`);
}

function associatedWordSlugFromFile(file){
  return normalizeAssociatedWordSlug(fileNameWithoutExtension(file));
}

function displayNameFromFile(file){
  return fileNameWithoutExtension(file) || "Image";
}

function normalizeDestinationPath(value){
  return String(value || "")
    .replace(/\\+/g, "/")
    .replace(/>+/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part && part !== "." && part !== "..")
    .join("/")
    .slice(0, 500);
}

function normalizedExtension(file, mimeType){
  const fromName = String(file?.name || "").split(".").pop()?.toLowerCase() || "";
  if (["png", "jpg", "jpeg", "webp", "gif", "avif", "svg"].includes(fromName)) {
    return fromName === "jpeg" ? "jpg" : fromName;
  }
  return {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
    "image/gif": "gif",
    "image/avif": "avif",
    "image/svg+xml": "svg"
  }[mimeType] || "bin";
}

function relativeSourcePath(file){
  return String(file?.webkitRelativePath || file?.name || "").replace(/\\+/g, "/").replace(/^\/+/, "");
}

function relativeSourceFolderPath(file){
  const path = relativeSourcePath(file);
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return "";
  return parts.slice(1, -1).join("/");
}

function joinDestinationPath(basePath, relativeFolderPath, preserveSubfolders){
  const base = normalizeDestinationPath(basePath);
  const relative = preserveSubfolders ? normalizeDestinationPath(relativeFolderPath) : "";
  if (!relative) return base;
  return normalizeDestinationPath(`${base || "À classer"}/${relative}`);
}

function deriveTags(file){
  const path = relativeSourcePath(file);
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 1) return [];
  const folders = parts.slice(0, -1);
  if (folders.length > 1) folders.shift();
  const seen = new Set();
  return folders
    .map((part) => String(part || "").trim())
    .filter((part) => {
      const key = part.toLowerCase();
      if (!part || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function sha256Hex(file){
  if (!globalThis.crypto?.subtle) throw new Error("Le navigateur ne permet pas de calculer l’empreinte des fichiers.");
  const buffer = await file.arrayBuffer();
  const digest = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function readImageDimensions(file){
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    const finish = (width = 0, height = 0) => {
      URL.revokeObjectURL(url);
      resolve({ width: Math.max(0, Number(width) || 0), height: Math.max(0, Number(height) || 0) });
    };
    image.onload = () => finish(image.naturalWidth, image.naturalHeight);
    image.onerror = () => finish();
    image.src = url;
  });
}

function existingHash(asset){
  const metadataHash = String(asset?.metadata?.content_hash || "").trim().toLowerCase();
  if (metadataHash) return metadataHash;
  const match = String(asset?.storage_path || "").match(/\/([a-f0-9]{12,64})\.[a-z0-9]+$/i);
  return String(match?.[1] || "").toLowerCase();
}

function isMigrationMissingError(error){
  const message = String(error?.message || error || "").toLowerCase();
  return message.includes("metadata")
    || message.includes("word_slug")
    || message.includes("upsert_system_image_asset_as_admin")
    || message.includes("could not find the function")
    || message.includes("bucket not found")
    || message.includes("row-level security")
    || message.includes("violates row-level security")
    || message.includes("schema cache");
}

export function createSystemImagesImportDialog({
  openButton,
  getIsSuperAdmin,
  listImageAssetsAsAdmin,
  listPhonologyWordLexiconAsAdmin,
  importSystemImageAssetAsAdmin,
  showToast,
  onImported
} = {}){
  let overlay = null;
  let filesInput = null;
  let folderInput = null;
  let reportHost = null;
  let importButton = null;
  let prefixInput = null;
  let destinationInput = null;
  let preserveSubfoldersInput = null;
  let selectedFiles = [];
  let analysisRows = [];
  let analyzedOptions = null;
  let isAnalyzing = false;
  let isImporting = false;

  function ensureOverlay(){
    if (overlay) return;
    overlay = document.createElement("div");
    overlay.className = "cfg-modal system-images-import-modal hidden";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="cfg-modal-backdrop" data-close-system-images-import="true"></div>
      <section class="panel cfg-modal-card system-images-import-card" role="dialog" aria-modal="true" aria-labelledby="systemImagesImportTitle">
        <header class="cfg-modal-header">
          <div>
            <div id="systemImagesImportTitle" class="cfg-modal-title">Banque d’images système</div>
            <div class="cfg-modal-subtitle">Importe en masse les illustrations publiques utilisées par les activités.</div>
          </div>
          <button class="btn cfg-modal-close" type="button" data-close-system-images-import="true" aria-label="Fermer">✕</button>
        </header>

        <div class="system-images-import-toolbar">
          <button class="btn primary dashboard-btn-with-icon" type="button" data-action="choose-system-image-files">
            ${renderMaterialIcon("upload_file", { className: "dashboard-material-icon" })}
            <span>Choisir des images</span>
          </button>
          <button class="btn dashboard-btn-with-icon" type="button" data-action="choose-system-image-folder">
            ${renderMaterialIcon("folder_open", { className: "dashboard-material-icon" })}
            <span>Choisir un dossier</span>
          </button>
          <button class="btn dashboard-btn-with-icon" type="button" data-action="analyze-system-images" disabled>
            ${renderMaterialIcon("fact_check", { className: "dashboard-material-icon" })}
            <span>Analyser</span>
          </button>
          <input type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.avif,.svg,image/*" multiple data-system-image-files hidden>
          <input type="file" accept=".png,.jpg,.jpeg,.webp,.gif,.avif,.svg,image/*" multiple webkitdirectory directory data-system-image-folder hidden>
          <span class="system-images-import-selection" data-system-images-selection>Aucune image sélectionnée</span>
        </div>

        <div class="system-images-import-options">
          <label class="system-images-import-option">
            <span>Préfixe technique facultatif</span>
            <input type="text" maxlength="60" placeholder="Ex. grapheme_" data-system-image-prefix>
            <small>Ajouté devant l’identifiant de tout le lot, sans modifier le nom affiché.</small>
          </label>
          <label class="system-images-import-option">
            <span>Dossier de destination</span>
            <input type="text" maxlength="500" placeholder="Ex. Cartons graphèmes" data-system-image-destination>
            <small>Créé sous Ressources système → Images s’il n’existe pas. Vide : À classer.</small>
          </label>
          <label class="system-images-import-option system-images-import-option--checkbox">
            <span>Arborescence du dossier sélectionné</span>
            <span class="system-images-import-checkbox-row">
              <input type="checkbox" data-system-image-preserve-subfolders checked>
              <span>Recréer les sous-dossiers</span>
            </span>
            <small>Ex. « animaux/chat.webp » sera importé dans « destination/animaux ».</small>
          </label>
        </div>

        <div class="system-images-import-hint">
          Le nom affiché reprend exactement le nom du fichier sans extension. L’identifiant est normalisé et peut recevoir le préfixe du lot : <strong>ail.webp + grapheme_ → grapheme_ail</strong>. Les sous-dossiers sont recréés et restent aussi enregistrés comme tags. Un remplacement conserve le classement et le nom visible déjà choisis, sauf si un dossier de destination est explicitement indiqué.
        </div>

        <div class="system-images-import-report" aria-live="polite">
          <div class="dashboard-activity-empty-state">Choisis plusieurs images ou un dossier complet.</div>
        </div>

        <footer class="system-images-import-actions">
          <span>Formats : PNG, JPEG, WebP, GIF, AVIF, SVG · 10 Mo maximum par image</span>
          <div class="system-images-import-actions-spacer"></div>
          <button class="btn" type="button" data-close-system-images-import="true">Fermer</button>
          <button class="btn primary dashboard-btn-with-icon" type="button" data-action="import-system-images" disabled>
            ${renderMaterialIcon("cloud_upload", { className: "dashboard-material-icon" })}
            <span>Importer dans Supabase</span>
          </button>
        </footer>
      </section>
    `;
    document.body.appendChild(overlay);
    filesInput = overlay.querySelector("[data-system-image-files]");
    folderInput = overlay.querySelector("[data-system-image-folder]");
    reportHost = overlay.querySelector(".system-images-import-report");
    importButton = overlay.querySelector("[data-action='import-system-images']");
    prefixInput = overlay.querySelector("[data-system-image-prefix]");
    destinationInput = overlay.querySelector("[data-system-image-destination]");

    overlay.querySelectorAll("[data-close-system-images-import]").forEach((element) => element.addEventListener("click", close));
    overlay.querySelector("[data-action='choose-system-image-files']")?.addEventListener("click", () => filesInput?.click());
    overlay.querySelector("[data-action='choose-system-image-folder']")?.addEventListener("click", () => folderInput?.click());
    overlay.querySelector("[data-action='analyze-system-images']")?.addEventListener("click", () => void analyze());
    importButton?.addEventListener("click", () => void importImages());
    filesInput?.addEventListener("change", () => setSelectedFiles(filesInput.files));
    folderInput?.addEventListener("change", () => setSelectedFiles(folderInput.files));
    prefixInput?.addEventListener("input", invalidateAnalysis);
    destinationInput?.addEventListener("input", invalidateAnalysis);
    preserveSubfoldersInput?.addEventListener("change", invalidateAnalysis);
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
    window.requestAnimationFrame(() => overlay.querySelector("[data-action='choose-system-image-files']")?.focus());
  }

  function close(){
    if (!overlay || isAnalyzing || isImporting) return;
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }

  function getImportOptions(){
    const rawPrefix = String(prefixInput?.value || "").trim();
    const prefix = normalizeBatchPrefix(rawPrefix);
    return {
      rawPrefix,
      prefix,
      prefixIsValid: !rawPrefix || Boolean(prefix),
      destinationPath: normalizeDestinationPath(destinationInput?.value || ""),
      preserveSubfolders: preserveSubfoldersInput?.checked !== false
    };
  }

  function invalidateAnalysis(){
    if (!analysisRows.length && !analyzedOptions) return;
    analysisRows = [];
    analyzedOptions = null;
    if (importButton) importButton.disabled = true;
    if (reportHost) {
      reportHost.innerHTML = selectedFiles.length
        ? '<div class="dashboard-activity-empty-state">Les options ont changé. Clique de nouveau sur <strong>Analyser</strong>.</div>'
        : '<div class="dashboard-activity-empty-state">Choisis plusieurs images ou un dossier complet.</div>';
    }
  }

  function setSelectedFiles(fileList){
    selectedFiles = Array.from(fileList || []).filter(Boolean);
    analysisRows = [];
    analyzedOptions = null;
    const label = overlay.querySelector("[data-system-images-selection]");
    const analyzeButton = overlay.querySelector("[data-action='analyze-system-images']");
    if (label) {
      const totalSize = selectedFiles.reduce((sum, file) => sum + Math.max(0, Number(file.size) || 0), 0);
      label.textContent = selectedFiles.length
        ? `${selectedFiles.length} image${selectedFiles.length > 1 ? "s" : ""} · ${formatBytes(totalSize)}`
        : "Aucune image sélectionnée";
    }
    if (analyzeButton) analyzeButton.disabled = selectedFiles.length === 0;
    if (importButton) importButton.disabled = true;
    reportHost.innerHTML = selectedFiles.length
      ? '<div class="dashboard-activity-empty-state">Clique sur <strong>Analyser</strong> pour vérifier les noms, doublons et versions existantes.</div>'
      : '<div class="dashboard-activity-empty-state">Choisis plusieurs images ou un dossier complet.</div>';
  }

  async function analyze(){
    if (!selectedFiles.length || isAnalyzing || isImporting) return;
    isAnalyzing = true;
    importButton.disabled = true;
    reportHost.innerHTML = '<div class="dashboard-activity-empty-state">Analyse des fichiers et comparaison avec Supabase…</div>';
    try {
      const options = getImportOptions();
      if (!options.prefixIsValid) throw new Error("Le préfixe technique ne contient aucun caractère utilisable.");
      analyzedOptions = options;
      const [existingRowsRaw, phonologyLexiconRaw] = await Promise.all([
        listImageAssetsAsAdmin?.(),
        listPhonologyWordLexiconAsAdmin?.()
      ]);
      const existingRows = Array.isArray(existingRowsRaw) ? existingRowsRaw : [];
      const phonologyLexicon = Array.isArray(phonologyLexiconRaw) ? phonologyLexiconRaw : [];
      const existingByWordSlug = new Map();
      const occupiedSlugs = new Set();
      for (const row of existingRows) {
        const slug = String(row?.slug || "").trim().toLowerCase();
        const wordSlug = String(row?.word_slug || "").trim().normalize("NFC").toLocaleLowerCase("fr-FR");
        if (slug) occupiedSlugs.add(slug);
        if (wordSlug && !existingByWordSlug.has(wordSlug)) existingByWordSlug.set(wordSlug, row);
      }
      const knownWordsBySlug = new Map(
        phonologyLexicon
          .map((row) => [
            String(row?.slug || "").trim().normalize("NFC").toLocaleLowerCase("fr-FR"),
            String(row?.word || "").trim().normalize("NFC")
          ])
          .filter(([slug, word]) => slug && word)
      );
      const rows = [];
      const slugCounts = new Map();
      const wordSlugCounts = new Map();
      const assignedSlugs = new Set();

      for (const file of selectedFiles) {
        const mimeType = inferMimeType(file);
        const sourcePath = relativeSourcePath(file);
        const title = displayNameFromFile(file);
        const wordSlug = associatedWordSlugFromFile(file);
        const associatedWord = knownWordsBySlug.get(wordSlug) || "";
        const previous = wordSlug ? (existingByWordSlug.get(wordSlug) || null) : null;
        let slug = String(previous?.slug || "").trim().toLowerCase();
        if (!slug) {
          slug = buildUniqueTechnicalSlug(
            slugFromFile(file, options.prefix),
            new Set([...occupiedSlugs, ...assignedSlugs])
          );
        }
        if (slug) assignedSlugs.add(slug);

        const row = {
          file,
          slug,
          wordSlug,
          associatedWord,
          sourcePath,
          mimeType,
          tags: deriveTags(file),
          title,
          destinationPath: joinDestinationPath(
            options.destinationPath,
            relativeSourceFolderPath(file),
            options.preserveSubfolders
          ),
          sizeBytes: Math.max(0, Number(file.size) || 0),
          width: 0,
          height: 0,
          hash: "",
          storagePath: "",
          previous,
          status: "error",
          error: ""
        };

        if (!wordSlug) {
          row.error = "Nom de fichier inutilisable comme mot associé.";
        } else if (!associatedWord) {
          row.error = `Aucun mot de la banque ne correspond à « ${title || wordSlug} ».`;
        } else if (!slug || !/^[a-z0-9][a-z0-9_-]{0,119}$/.test(slug)) {
          row.error = "Impossible de générer un identifiant technique unique.";
        } else if (!ACCEPTED_MIME_TYPES.has(mimeType)) {
          row.error = "Format non accepté.";
        } else if (row.sizeBytes <= 0) {
          row.error = "Fichier vide.";
        } else if (row.sizeBytes > MAX_SYSTEM_IMAGE_FILE_SIZE) {
          row.error = "Image supérieure à 10 Mo.";
        } else {
          const [hash, dimensions] = await Promise.all([sha256Hex(file), readImageDimensions(file)]);
          row.hash = hash;
          row.width = dimensions.width;
          row.height = dimensions.height;
          row.storagePath = `bank/${slug}/${hash.slice(0, 20)}.${normalizedExtension(file, mimeType)}`;
          row.status = row.previous
            ? (existingHash(row.previous) && hash.startsWith(existingHash(row.previous)) ? "unchanged" : "update")
            : "new";
        }
        slugCounts.set(slug, (slugCounts.get(slug) || 0) + 1);
        wordSlugCounts.set(wordSlug, (wordSlugCounts.get(wordSlug) || 0) + 1);
        rows.push(row);
      }

      rows.forEach((row) => {
        if (row.wordSlug && wordSlugCounts.get(row.wordSlug) > 1) {
          row.status = "error";
          row.error = "Mot associé présent plusieurs fois dans la sélection.";
        } else if (row.slug && slugCounts.get(row.slug) > 1) {
          row.status = "error";
          row.error = "Identifiant technique présent plusieurs fois dans la sélection.";
        }
      });
      analysisRows = rows;
      renderAnalysis();
    } catch (error) {
      console.error(error);
      analyzedOptions = null;
      const message = isMigrationMissingError(error)
        ? "Les migrations 22, 23, 24 puis 30 doivent être exécutées dans Supabase avant cet import."
        : String(error?.message || "Analyse impossible.");
      reportHost.innerHTML = `<div class="system-images-import-error"><strong>Analyse impossible.</strong><span>${escapeHtml(message)}</span></div>`;
      showToast?.(message, { isError: true, duration: 7000 });
    } finally {
      isAnalyzing = false;
    }
  }

  function renderAnalysis(extraMessage = ""){
    const counts = analysisRows.reduce((result, row) => {
      result[row.status] = (result[row.status] || 0) + 1;
      return result;
    }, {});
    const errors = counts.error || 0;
    const importable = (counts.new || 0) + (counts.update || 0);
    importButton.disabled = isImporting || errors > 0 || importable === 0;

    const rowsHtml = analysisRows.map((row) => {
      const previewUrl = URL.createObjectURL(row.file);
      window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60000);
      const status = row.status === "new" ? "Nouvelle"
        : row.status === "update" ? "Remplacement"
          : row.status === "unchanged" ? "Identique"
            : row.error || "Erreur";
      return `
        <tr>
          <td><img class="system-images-import-preview" src="${escapeAttr(previewUrl)}" alt=""></td>
          <td><strong>${escapeHtml(row.title || "Image")}</strong><div class="system-images-import-path" title="${escapeAttr(row.sourcePath)}">${escapeHtml(row.sourcePath)}</div></td>
          <td><strong>${escapeHtml(row.associatedWord || row.wordSlug || "—")}</strong><div class="system-images-import-path">${escapeHtml(row.wordSlug || "")}</div></td>
          <td><strong>${escapeHtml(row.slug || "—")}</strong></td>
          <td>${escapeHtml(row.destinationPath || "À classer")}</td>
          <td>${escapeHtml(formatBytes(row.sizeBytes))}${row.width && row.height ? `<div>${row.width} × ${row.height}</div>` : ""}</td>
          <td>${escapeHtml(row.tags.join(", ") || "—")}</td>
          <td><span class="system-images-import-status is-${escapeAttr(row.status)}">${escapeHtml(status)}</span></td>
        </tr>`;
    }).join("");

    reportHost.innerHTML = `
      ${extraMessage}
      <div class="system-images-import-summary">
        <div><strong>${analysisRows.length}</strong><span>fichiers</span></div>
        <div><strong>${counts.new || 0}</strong><span>nouveaux</span></div>
        <div><strong>${counts.update || 0}</strong><span>remplacements</span></div>
        <div><strong>${counts.unchanged || 0}</strong><span>identiques</span></div>
        <div><strong>${errors}</strong><span>erreurs</span></div>
      </div>
      <div class="system-images-import-table-wrap">
        <table class="system-images-import-table">
          <thead><tr><th>Aperçu</th><th>Nom affiché</th><th>Mot associé</th><th>Identifiant</th><th>Destination</th><th>Taille</th><th>Tags</th><th>État</th></tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>`;
  }

  function renderProgress(done, total, currentName){
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;
    const previous = reportHost.querySelector(".system-images-import-progress");
    const html = `
      <div class="system-images-import-progress">
        <strong>${escapeHtml(currentName || "Import en cours")}</strong>
        <div class="system-images-import-progress-track"><span class="system-images-import-progress-fill" style="width:${percentage}%"></span></div>
        <span>${done} / ${total} · ${percentage}%</span>
      </div>`;
    if (previous) previous.outerHTML = html;
    else reportHost.insertAdjacentHTML("afterbegin", html);
  }

  async function importImages(){
    const rows = analysisRows.filter((row) => row.status === "new" || row.status === "update");
    if (!rows.length || isImporting || analysisRows.some((row) => row.status === "error")) return;
    const destinationLabel = analyzedOptions?.destinationPath || "À classer";
    const folderDetail = analyzedOptions?.preserveSubfolders
      ? " Les sous-dossiers du dossier sélectionné seront recréés."
      : "";
    const confirmed = await openDashboardConfirmDialog({
      title: "Importer la banque d’images",
      message: `${rows.length} image${rows.length > 1 ? "s" : ""} seront envoyée${rows.length > 1 ? "s" : ""} dans le bucket public « images », à partir du dossier « ${destinationLabel} ».${folderDetail} Les anciennes versions remplacées seront supprimées après mise à jour de la base.`,
      confirmLabel: "Importer"
    });
    if (!confirmed) return;

    isImporting = true;
    importButton.disabled = true;
    importButton.classList.add("is-loading");
    const failures = [];
    let importedCount = 0;

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      renderProgress(index, rows.length, `Import de ${row.sourcePath}`);
      try {
        const saved = await importSystemImageAssetAsAdmin(row.file, {
          slug: row.slug,
          word_slug: row.wordSlug,
          storage_path: row.storagePath,
          tags: row.tags,
          notes: row.title,
          folder_path: row.destinationPath || "",
          metadata: {
            content_hash: row.hash,
            original_name: String(row.file?.name || ""),
            original_path: row.sourcePath,
            mime_type: row.mimeType,
            size_bytes: row.sizeBytes,
            width: row.width,
            height: row.height,
            imported_at: new Date().toISOString(),
            import_prefix: analyzedOptions?.prefix || "",
            import_destination: row.destinationPath || "",
            preserve_subfolders: analyzedOptions?.preserveSubfolders === true,
            image_word_slug: row.wordSlug,
            image_word: row.associatedWord || row.wordSlug
          },
          previous_storage_path: String(row.previous?.storage_path || "")
        });
        row.previous = saved;
        row.status = "unchanged";
        importedCount += 1;
      } catch (error) {
        console.error(`Import impossible pour ${row.sourcePath}.`, error);
        row.status = "error";
        row.error = String(error?.message || "Échec de l’import.");
        failures.push(`${row.sourcePath} : ${row.error}`);
      }
      renderProgress(index + 1, rows.length, `Import de ${row.sourcePath}`);
    }

    isImporting = false;
    importButton.classList.remove("is-loading");
    const message = failures.length
      ? `<div class="system-images-import-error"><strong>Import terminé avec des erreurs.</strong><span>${importedCount} image${importedCount > 1 ? "s" : ""} importée${importedCount > 1 ? "s" : ""}, ${failures.length} échec${failures.length > 1 ? "s" : ""}.</span></div>`
      : `<div class="system-images-import-message">${renderMaterialIcon("check_circle", { className: "dashboard-material-icon" })}<span>${importedCount} image${importedCount > 1 ? "s" : ""} importée${importedCount > 1 ? "s" : ""} dans Supabase.</span></div>`;
    renderAnalysis(message);
    if (importedCount > 0) {
      try {
        await onImported?.({ importedCount, failures:[...failures] });
      } catch (error) {
        console.warn("Impossible de rafraîchir l’explorateur après l’import.", error);
      }
    }
    showToast?.(failures.length
      ? `Import terminé : ${importedCount} réussie${importedCount > 1 ? "s" : ""}, ${failures.length} en échec.`
      : `${importedCount} image${importedCount > 1 ? "s" : ""} importée${importedCount > 1 ? "s" : ""}.`, { isError: failures.length > 0, duration: 7000 });
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
