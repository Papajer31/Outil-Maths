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
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, "-")
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_]+|[-_]+$/g, "")
    .slice(0, 120);
}

function slugFromFile(file){
  const name = String(file?.name || "").replace(/\.[^.]+$/, "");
  return normalizeSlug(name);
}

function humanizeSlug(slug){
  const label = String(slug || "").replace(/[_-]+/g, " ").trim();
  return label ? label.charAt(0).toUpperCase() + label.slice(1) : "Image";
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
    || message.includes("bucket not found")
    || message.includes("row-level security")
    || message.includes("violates row-level security")
    || message.includes("schema cache");
}

export function createSystemImagesImportDialog({
  openButton,
  getIsSuperAdmin,
  listImageAssetsAsAdmin,
  importSystemImageAssetAsAdmin,
  showToast,
  onImported
} = {}){
  let overlay = null;
  let filesInput = null;
  let folderInput = null;
  let reportHost = null;
  let importButton = null;
  let selectedFiles = [];
  let analysisRows = [];
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

        <div class="system-images-import-hint">
          Le nom du fichier devient l’identifiant de l’image : <strong>chat.webp → chat</strong>. Les sous-dossiers deviennent des tags. Les nouvelles images apparaissent dans <strong>Ressources système → Images → À classer</strong>, puis peuvent être rangées par glisser-déposer. Un fichier portant le même identifiant remplace proprement l’ancienne version sans perdre son classement.
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

    overlay.querySelectorAll("[data-close-system-images-import]").forEach((element) => element.addEventListener("click", close));
    overlay.querySelector("[data-action='choose-system-image-files']")?.addEventListener("click", () => filesInput?.click());
    overlay.querySelector("[data-action='choose-system-image-folder']")?.addEventListener("click", () => folderInput?.click());
    overlay.querySelector("[data-action='analyze-system-images']")?.addEventListener("click", () => void analyze());
    importButton?.addEventListener("click", () => void importImages());
    filesInput?.addEventListener("change", () => setSelectedFiles(filesInput.files));
    folderInput?.addEventListener("change", () => setSelectedFiles(folderInput.files));
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

  function setSelectedFiles(fileList){
    selectedFiles = Array.from(fileList || []).filter(Boolean);
    analysisRows = [];
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
      const existingRows = await listImageAssetsAsAdmin?.();
      const existingBySlug = new Map((Array.isArray(existingRows) ? existingRows : []).map((row) => [String(row?.slug || "").trim().toLowerCase(), row]));
      const rows = [];
      const slugCounts = new Map();

      for (const file of selectedFiles) {
        const mimeType = inferMimeType(file);
        const slug = slugFromFile(file);
        const sourcePath = relativeSourcePath(file);
        const row = {
          file,
          slug,
          sourcePath,
          mimeType,
          tags: deriveTags(file),
          title: humanizeSlug(slug),
          sizeBytes: Math.max(0, Number(file.size) || 0),
          width: 0,
          height: 0,
          hash: "",
          storagePath: "",
          previous: existingBySlug.get(slug) || null,
          status: "error",
          error: ""
        };

        if (!slug || !/^[a-z0-9][a-z0-9_-]{0,119}$/.test(slug)) {
          row.error = "Nom de fichier inutilisable comme identifiant.";
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
        rows.push(row);
      }

      rows.forEach((row) => {
        if (row.slug && slugCounts.get(row.slug) > 1) {
          row.status = "error";
          row.error = "Identifiant présent plusieurs fois dans la sélection.";
        }
      });
      analysisRows = rows;
      renderAnalysis();
    } catch (error) {
      console.error(error);
      const message = isMigrationMissingError(error)
        ? "Les migrations 22 puis 23 doivent être exécutées dans Supabase avant le premier import."
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
          <td><strong>${escapeHtml(row.slug || "—")}</strong><div class="system-images-import-path" title="${escapeAttr(row.sourcePath)}">${escapeHtml(row.sourcePath)}</div></td>
          <td>${escapeHtml(row.mimeType || "—")}</td>
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
          <thead><tr><th>Aperçu</th><th>Identifiant</th><th>Format</th><th>Taille</th><th>Tags</th><th>État</th></tr></thead>
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
    const confirmed = await openDashboardConfirmDialog({
      title: "Importer la banque d’images",
      message: `${rows.length} image${rows.length > 1 ? "s" : ""} seront envoyée${rows.length > 1 ? "s" : ""} dans le bucket public « images ». Les anciennes versions remplacées seront supprimées après mise à jour de la base.`,
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
          storage_path: row.storagePath,
          tags: row.tags,
          notes: row.title,
          metadata: {
            content_hash: row.hash,
            original_name: String(row.file?.name || ""),
            original_path: row.sourcePath,
            mime_type: row.mimeType,
            size_bytes: row.sizeBytes,
            width: row.width,
            height: row.height,
            imported_at: new Date().toISOString()
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
