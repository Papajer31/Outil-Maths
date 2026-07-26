import {
  buildActivityTreeState,
  buildVisibleActivityTree,
  normalizeTreeId
} from "./activity-tree.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";
import { openDashboardConfirmDialog } from "./confirm-dialog.js";
import { loadToolAssetsManifest } from "../../../shared/tool-assets/tool-assets.js";
import { formatToolAssetFolderName } from "../../../shared/tool-assets/labels.js";
import { resolveQuizImageSourceUrl } from "../../../shared/quiz-local-image-store.js";
import { resolveQuizAudioSourceUrl } from "../../../shared/quiz-audio-source.js";
import { openAudioRecorderDialog } from "./audio-recorder-dialog.js";

const RESOURCE_ROOT_PERSONAL = "__resource_root_personal";
const RESOURCE_ROOT_SYSTEM = "__resource_root_system";
const RESOURCE_SYSTEM_IMAGES = "__resource_system_images";
const RESOURCE_SYSTEM_AUDIO = "__resource_system_audio";
const MAX_RESOURCE_FILE_SIZE = 25 * 1024 * 1024;
const RESOURCE_STORAGE_QUOTA_BYTES = 100 * 1024 * 1024;

function normalizePath(value){
  return String(value || "")
    .replace(/\\+/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .trim();
}

function formatBytes(value){
  const bytes = Math.max(0, Number(value) || 0);
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} Mo`;
}

function formatQuotaBytes(value){
  const bytes = Math.max(0, Number(value) || 0);
  return bytes ? formatBytes(bytes) : "0 Mo";
}

function formatDuration(value){
  const seconds = Math.max(0, Math.round(Number(value) || 0));
  if (!seconds) return "";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function buildSystemCatalogue(manifest){
  const folders = [
    {
      id: RESOURCE_SYSTEM_IMAGES,
      parent_id: RESOURCE_ROOT_SYSTEM,
      name: "Images",
      display_order: 0,
      is_system: true,
      is_virtual_root: true,
      resource_type: "image"
    },
    {
      id: RESOURCE_SYSTEM_AUDIO,
      parent_id: RESOURCE_ROOT_SYSTEM,
      name: "Audio",
      display_order: 1,
      is_system: true,
      is_virtual_root: true,
      resource_type: "audio"
    }
  ];
  const folderByPath = new Map([
    ["image:", RESOURCE_SYSTEM_IMAGES],
    ["audio:", RESOURCE_SYSTEM_AUDIO]
  ]);
  const resources = [];
  const folderOrderByParent = new Map();

  for (const asset of manifest?.assets || []) {
    const type = String(asset?.type || "").toLowerCase() === "audio" ? "audio" : "image";
    const src = normalizePath(asset?.src);
    if (!src) continue;

    const parts = src.split("/").filter(Boolean);
    if (parts.length < 2) continue;
    const folderParts = parts.slice(1, -1);
    let parentId = type === "audio" ? RESOURCE_SYSTEM_AUDIO : RESOURCE_SYSTEM_IMAGES;
    let currentPath = "";

    folderParts.forEach((part) => {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const pathKey = `${type}:${currentPath}`;
      let folderId = folderByPath.get(pathKey);
      if (!folderId) {
        folderId = `__resource_system_${type}_${encodeURIComponent(currentPath).replace(/%/g, "_").toLowerCase()}`;
        folderByPath.set(pathKey, folderId);
        const nextOrder = folderOrderByParent.get(parentId) || 0;
        folderOrderByParent.set(parentId, nextOrder + 1);
        folders.push({
          id: folderId,
          parent_id: parentId,
          name: formatToolAssetFolderName(part),
          raw_name: part,
          system_path: `${type === "audio" ? "audio" : "images"}/${currentPath}`,
          display_order: nextOrder,
          is_system: true,
          resource_type: type
        });
      }
      parentId = folderId;
    });

    resources.push({
      id: String(asset.id),
      config_name: String(asset.label || asset.id || "Ressource"),
      title: String(asset.label || asset.id || "Ressource"),
      folder_id: parentId,
      display_order: resources.length,
      scope: "system",
      is_system: true,
      type,
      url: String(asset.url || ""),
      path: src,
      alt: String(asset.alt || asset.label || ""),
      category: String(asset.category || ""),
      tags: Array.isArray(asset.tags) ? asset.tags : [],
      mime_type: String(asset.mimeType || asset.mime_type || ""),
      size_bytes: Math.max(0, Number(asset.sizeBytes ?? asset.size) || 0),
      width: Math.max(0, Number(asset.width) || 0),
      height: Math.max(0, Number(asset.height) || 0),
      duration: Math.max(0, Number(asset.duration) || 0),
      source: asset
    });
  }

  return { folders, resources };
}

export function createResourcesViewController({
  view,
  list,
  createFolderButton,
  importResourcesButton,
  recordAudioButton,
  resourceFileInput,
  storageQuotaElement,
  showToast,
  getCurrentTeacherSpace,
  listResourceFoldersForSpace,
  createResourceFolderForSpace,
  ensureRecordingsResourceFolderForSpace,
  updateResourceFolder,
  deleteResourceFolder,
  listResourcesForSpace,
  uploadResourceForSpace,
  updateResource,
  deleteResource,
  createResourceSignedUrl
} = {}){
  let personalFolders = [];
  let personalResources = [];
  let databaseSystemFolders = [];
  let databaseSystemResources = [];
  let systemFolders = [];
  let systemResources = [];
  let personalLoadError = "";
  let currentOpenFolderId = null;
  let manifestLoaded = false;
  let manifestError = "";
  let isImporting = false;
  let isRecordingResource = false;
  let isMoving = false;
  let draggedNode = null;
  let resourceDropTarget = null;
  const collapsedFolderIds = new Set();
  const knownFolderIds = new Set();

  function getTeacherSpaceId(){
    const id = Number(getCurrentTeacherSpace?.()?.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error("Aucun espace enseignant actif.");
    }
    return id;
  }

  function getPersonalStorageUsage(){
    return personalResources.reduce((total, resource) => total + Math.max(0, Number(resource?.size_bytes) || 0), 0);
  }

  function updateStorageQuota(){
    if (!storageQuotaElement) return;
    const used = getPersonalStorageUsage();
    const remaining = Math.max(0, RESOURCE_STORAGE_QUOTA_BYTES - used);
    const percentage = RESOURCE_STORAGE_QUOTA_BYTES > 0
      ? Math.min(100, Math.max(0, (used / RESOURCE_STORAGE_QUOTA_BYTES) * 100))
      : 100;
    const roundedPercentage = Math.round(percentage);
    const fill = storageQuotaElement.querySelector(".dashboard-resource-storage-quota-fill");
    const label = storageQuotaElement.querySelector(".dashboard-resource-storage-quota-label");
    if (fill) fill.style.width = `${percentage}%`;
    if (label) label.textContent = `${formatQuotaBytes(used)} utilisés · ${formatQuotaBytes(remaining)} libres`;
    storageQuotaElement.classList.toggle("is-warning", percentage >= 80 && percentage < 100);
    storageQuotaElement.classList.toggle("is-full", percentage >= 100);
    storageQuotaElement.setAttribute("aria-valuenow", String(roundedPercentage));
    storageQuotaElement.setAttribute("aria-valuetext", `${formatQuotaBytes(used)} utilisés, ${formatQuotaBytes(remaining)} disponibles sur ${formatQuotaBytes(RESOURCE_STORAGE_QUOTA_BYTES)}`);
    storageQuotaElement.title = `${formatQuotaBytes(used)} utilisés · ${formatQuotaBytes(remaining)} disponibles`;
  }

  async function reloadRemoteState(){
    personalLoadError = "";
    const teacherSpaceId = getTeacherSpaceId();
    const [folderRows, resourceRows] = await Promise.all([
      listResourceFoldersForSpace?.(teacherSpaceId),
      listResourcesForSpace?.(teacherSpaceId)
    ]);
    const allFolders = Array.isArray(folderRows) ? folderRows : [];
    const allResources = Array.isArray(resourceRows) ? resourceRows : [];
    personalFolders = allFolders.filter((folder) => folder?.is_system !== true);
    databaseSystemFolders = allFolders.filter((folder) => folder?.is_system === true);

    const withUrls = await Promise.all(allResources.map(async (resource) => {
      if (!resource?.storage_path || typeof createResourceSignedUrl !== "function") return resource;
      try {
        const url = await createResourceSignedUrl(resource, 3600);
        return { ...resource, url };
      } catch (error) {
        console.warn("Impossible de signer l’URL d’une ressource.", error);
        return resource;
      }
    }));
    personalResources = withUrls.filter((resource) => resource?.is_system !== true);
    databaseSystemResources = withUrls.filter((resource) => resource?.is_system === true);
  }

  function getExplorerFolders(){
    const roots = [
      {
        id: RESOURCE_ROOT_PERSONAL,
        parent_id: null,
        name: "Ressources personnelles",
        display_order: 0,
        is_virtual_root: true,
        is_system: false
      },
      {
        id: RESOURCE_ROOT_SYSTEM,
        parent_id: null,
        name: "Ressources système",
        display_order: 1,
        is_virtual_root: true,
        is_system: true
      }
    ];

    const normalizedPersonal = personalFolders.map((folder, index) => ({
      ...folder,
      parent_id: String(folder?.parent_id ?? "").trim() || RESOURCE_ROOT_PERSONAL,
      display_order: Number.isFinite(Number(folder?.display_order)) ? Number(folder.display_order) : index,
      is_system: false
    }));

    const normalizedDatabaseSystem = databaseSystemFolders.map((folder, index) => ({
      ...folder,
      parent_id: String(folder?.parent_id ?? "").trim() || RESOURCE_ROOT_SYSTEM,
      display_order: Number.isFinite(Number(folder?.display_order)) ? Number(folder.display_order) : index,
      is_system: true
    }));

    return [...roots, ...normalizedPersonal, ...systemFolders, ...normalizedDatabaseSystem];
  }

  function getExplorerResources(){
    const normalizedPersonal = personalResources.map((resource, index) => ({
      ...resource,
      config_name: resource?.title || "Ressource sans nom",
      folder_id: String(resource?.folder_id ?? "").trim() || RESOURCE_ROOT_PERSONAL,
      display_order: Number.isFinite(Number(resource?.display_order)) ? Number(resource.display_order) : index,
      scope: "personal",
      is_system: false
    }));
    const normalizedDatabaseSystem = databaseSystemResources.map((resource, index) => ({
      ...resource,
      config_name: resource?.title || "Ressource sans nom",
      folder_id: String(resource?.folder_id ?? "").trim() || RESOURCE_ROOT_SYSTEM,
      display_order: Number.isFinite(Number(resource?.display_order)) ? Number(resource.display_order) : index,
      scope: "system",
      is_system: true
    }));
    return [...normalizedPersonal, ...systemResources, ...normalizedDatabaseSystem];
  }

  function buildTreeState(){
    return buildActivityTreeState({
      activitiesSource: getExplorerResources(),
      foldersSource: getExplorerFolders()
    });
  }

  function buildVisibleTree(){
    return buildVisibleActivityTree({
      activitiesSource: getExplorerResources(),
      foldersSource: getExplorerFolders(),
      collapsedFolderIds,
      currentActivityMode: "resources"
    });
  }

  function getFolderById(folderId, treeState = buildTreeState()){
    const safeId = normalizeTreeId(folderId);
    return safeId ? (treeState.folderById.get(safeId) || null) : null;
  }

  function isFolderInside(folderId, ancestorId, treeState = buildTreeState()){
    let cursor = getFolderById(folderId, treeState);
    while (cursor) {
      if (String(cursor.id) === String(ancestorId)) return true;
      const parentId = normalizeTreeId(cursor.parent_id);
      cursor = parentId ? (treeState.folderById.get(parentId) || null) : null;
    }
    return false;
  }

  function isPersonalLocation(folderId = currentOpenFolderId, treeState = buildTreeState()){
    return isFolderInside(folderId, RESOURCE_ROOT_PERSONAL, treeState);
  }

  function isWritablePersonalLocation(folderId = currentOpenFolderId, treeState = buildTreeState()){
    return !normalizeTreeId(folderId) || isPersonalLocation(folderId, treeState);
  }

  function getPersonalTargetFolderId(folderId = currentOpenFolderId, treeState = buildTreeState()){
    if (!isWritablePersonalLocation(folderId, treeState)) return undefined;
    const safeId = normalizeTreeId(folderId);
    if (!safeId || safeId === RESOURCE_ROOT_PERSONAL) return null;
    const folder = treeState.folderById.get(safeId);
    return folder?.is_system === true ? undefined : safeId;
  }

  function isVirtualRoot(folderId){
    const safeId = String(folderId || "");
    return safeId === RESOURCE_ROOT_PERSONAL
      || safeId === RESOURCE_ROOT_SYSTEM
      || safeId === RESOURCE_SYSTEM_IMAGES
      || safeId === RESOURCE_SYSTEM_AUDIO;
  }

  function syncKnownFolders(){
    const folders = getExplorerFolders();
    const ids = new Set(folders.map((folder) => String(folder.id)));
    for (const id of Array.from(collapsedFolderIds)) {
      if (!ids.has(id)) collapsedFolderIds.delete(id);
    }
    for (const id of Array.from(knownFolderIds)) {
      if (!ids.has(id)) knownFolderIds.delete(id);
    }

    const state = buildTreeState();
    folders.forEach((folder) => {
      const id = String(folder.id);
      if (knownFolderIds.has(id)) return;
      knownFolderIds.add(id);
      if (!folder.is_virtual_root && normalizeTreeId(folder.parent_id)) {
        collapsedFolderIds.add(id);
      }
    });

    if (currentOpenFolderId && !state.folderById.has(String(currentOpenFolderId))) currentOpenFolderId = null;
  }

  function expandFolderPath(folderId){
    const treeState = buildTreeState();
    let cursor = treeState.folderById.get(String(folderId || "")) || null;
    while (cursor) {
      collapsedFolderIds.delete(String(cursor.id));
      const parentId = normalizeTreeId(cursor.parent_id);
      cursor = parentId ? (treeState.folderById.get(parentId) || null) : null;
    }
  }

  function setCurrentFolder(folderId = null){
    currentOpenFolderId = normalizeTreeId(folderId);
    if (currentOpenFolderId) expandFolderPath(currentOpenFolderId);
    render();
  }

  function getCurrentFolderContents(treeState){
    const selectedFolder = currentOpenFolderId
      ? (treeState.folderById.get(String(currentOpenFolderId)) || null)
      : null;
    const parentId = selectedFolder ? String(selectedFolder.id) : null;
    return {
      selectedFolder,
      childFolders: treeState.folderChildren.get(parentId) || [],
      childResources: treeState.activityChildren.get(parentId) || []
    };
  }

  function countResourcesInFolder(folderId, treeState){
    let count = (treeState.activityChildren.get(String(folderId)) || []).length;
    for (const child of treeState.folderChildren.get(String(folderId)) || []) {
      count += countResourcesInFolder(child.id, treeState);
    }
    return count;
  }

  function renderTreeFolderNode(node){
    const folder = node.item;
    const folderId = String(folder.id);
    const isSelected = normalizeTreeId(currentOpenFolderId) === folderId;
    const isDraggable = folder?.is_system !== true && folder?.is_virtual_root !== true;
    const hasChildFolders = getExplorerFolders().some((candidate) => normalizeTreeId(candidate?.parent_id) === folderId);
    const isCollapsed = hasChildFolders && node.isCollapsed;
    return `
      <div
        class="dashboard-activity-tree-row dashboard-tree-node ${isSelected ? "is-selected" : ""}"
        data-node-type="folder"
        data-node-id="${escapeAttr(folderId)}"
        ${isDraggable ? 'draggable="true"' : ""}
        style="--dashboard-tree-depth:${Math.max(0, Number(node.depth) || 0)};"
      >
        <div class="dashboard-tree-indent" aria-hidden="true"></div>
        <button
          class="dashboard-folder-toggle-btn dashboard-material-icon-btn"
          type="button"
          data-action="toggle-folder"
          data-folder-id="${escapeAttr(folderId)}"
          title="${hasChildFolders ? (isCollapsed ? "Déplier le dossier" : "Replier le dossier") : "Ce dossier ne contient pas de sous-dossier"}"
          aria-label="${hasChildFolders ? (isCollapsed ? "Déplier le dossier" : "Replier le dossier") : "Ce dossier ne contient pas de sous-dossier"}"
          ${hasChildFolders ? "" : "disabled"}
        >
          <span class="dashboard-material-icon" aria-hidden="true">${isCollapsed ? "chevron_right" : "expand_more"}</span>
        </button>
        <button class="dashboard-activity-tree-main" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folderId)}">
          <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tree-node-label">${escapeHtml(folder.name || "")}</span>
        </button>
      </div>
    `;
  }

  function renderFolderTile(folder, treeState){
    const isProtected = folder?.is_system === true || folder?.is_virtual_root === true;
    const resourceCount = countResourcesInFolder(folder.id, treeState);
    const actions = !isProtected
      ? `
        <div class="dashboard-activity-tile-corner-actions dashboard-activity-tile-corner-actions--stacked">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="rename-folder" data-folder-id="${escapeAttr(folder.id)}" title="Renommer le dossier" aria-label="Renommer le dossier">
            <span class="dashboard-material-icon" aria-hidden="true">edit</span>
          </button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-folder" data-folder-id="${escapeAttr(folder.id)}" title="Supprimer le dossier" aria-label="Supprimer le dossier">
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>
        </div>
      `
      : "";

    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--folder dashboard-resource-folder-tile" data-node-type="folder" data-node-id="${escapeAttr(folder.id)}" ${!isProtected ? 'draggable="true"' : ""}>
        <button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folder.id)}">
          <span class="dashboard-resource-folder-topline">
            <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">folder</span>
            <span class="dashboard-resource-folder-count">${resourceCount} ressource${resourceCount > 1 ? "s" : ""}</span>
          </span>
          <span class="dashboard-activity-tile-title">${escapeHtml(folder.name || "")}</span>
        </button>
        ${actions}
      </article>
    `;
  }

  function renderParentTile(selectedFolder){
    if (!selectedFolder) return "";
    const parentId = normalizeTreeId(selectedFolder.parent_id);
    const targetFolderId = parentId || (isPersonalLocation(selectedFolder.id) ? RESOURCE_ROOT_PERSONAL : "");
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--folder dashboard-activity-tile--parent dashboard-resource-folder-tile" ${targetFolderId ? `data-drop-folder-id="${escapeAttr(targetFolderId)}"` : ""}>
        <button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder" type="button" data-action="${parentId ? "open-folder" : "open-root"}" ${parentId ? `data-folder-id="${escapeAttr(parentId)}"` : ""}>
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">arrow_upward</span>
          <span class="dashboard-activity-tile-title">Dossier parent</span>
        </button>
      </article>
    `;
  }

  function getResourceSubtitle(resource){
    const parts = [];
    if (resource.width && resource.height) parts.push(`${resource.width} × ${resource.height}`);
    const duration = formatDuration(resource.duration);
    if (duration) parts.push(duration);
    const size = formatBytes(resource.size_bytes);
    if (size) parts.push(size);
    return parts.join(" · ");
  }

  function renderResourceTile(resource){
    const resourceId = String(resource.id || "");
    const isImage = resource.type !== "audio";
    const typeLabel = isImage ? "Image" : "Audio";
    const isProtected = resource?.is_system === true;
    const preview = isImage
      ? `<img class="dashboard-resource-preview-image" src="${escapeAttr(resource.url || "")}" alt="${escapeAttr(resource.alt || resource.title || "Image")}" loading="lazy">`
      : `
        <span class="dashboard-resource-audio-preview" aria-hidden="true">
          <span class="dashboard-material-icon">play_arrow</span>
        </span>
      `;
    const actions = isProtected
      ? ""
      : `
        <div class="dashboard-activity-tile-corner-actions dashboard-activity-tile-corner-actions--stacked dashboard-resource-tile-actions">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="rename-resource" data-resource-id="${escapeAttr(resourceId)}" title="Renommer la ressource" aria-label="Renommer la ressource">
            <span class="dashboard-material-icon" aria-hidden="true">edit</span>
          </button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-resource" data-resource-id="${escapeAttr(resourceId)}" title="Supprimer la ressource" aria-label="Supprimer la ressource">
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>
        </div>
      `;

    return `
      <article class="dashboard-resource-tile ${isImage ? "is-image" : "is-audio"}" data-node-type="resource" data-node-id="${escapeAttr(resourceId)}" ${!isProtected ? 'draggable="true"' : ""}>
        <button class="dashboard-resource-tile-surface" type="button" data-action="open-resource" data-resource-id="${escapeAttr(resourceId)}">
          <span class="dashboard-resource-preview">
            <span class="dashboard-resource-type-pill">${typeLabel}</span>
            ${preview}
          </span>
          <span class="dashboard-resource-tile-body">
            <span class="dashboard-resource-tile-title">${escapeHtml(resource.title || "Ressource")}</span>
            <span class="dashboard-resource-tile-meta">${escapeHtml(getResourceSubtitle(resource))}</span>
          </span>
        </button>
        ${actions}
      </article>
    `;
  }

  function renderEmptyState(selectedFolder){
    if (!manifestLoaded && !selectedFolder) return `<div class="dashboard-activity-empty-state">Chargement de la bibliothèque…</div>`;
    if (manifestError && isFolderInside(selectedFolder?.id, RESOURCE_ROOT_SYSTEM)) {
      return `<div class="dashboard-activity-empty-state is-error">${escapeHtml(manifestError)}</div>`;
    }
    const name = selectedFolder?.name ? ` dans « ${selectedFolder.name} »` : "";
    return `<div class="dashboard-activity-empty-state">Aucune ressource${escapeHtml(name)}.</div>`;
  }

  function renderShell(treeState, visibleNodes){
    const { selectedFolder, childFolders, childResources } = getCurrentFolderContents(treeState);
    const treeHtml = visibleNodes
      .filter((node) => node.type === "folder")
      .map(renderTreeFolderNode)
      .join("");
    const tilesHtml = [
      renderParentTile(selectedFolder),
      ...childFolders.map((folder) => renderFolderTile(folder, treeState)),
      ...childResources.map(renderResourceTile)
    ].filter(Boolean).join("");

    return `
      <div class="dashboard-activities-explorer dashboard-resources-explorer" style="--dashboard-tree-pane-width:18%;">
        <aside class="dashboard-activity-tree-pane panel">
          <div class="dashboard-activity-tree-list">
            <div class="dashboard-activity-tree-row dashboard-activity-tree-root ${currentOpenFolderId ? "" : "is-selected"}">
              <button class="dashboard-activity-tree-main dashboard-activity-tree-main--root" type="button" data-action="open-root">
                <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">home</span>
                <span class="dashboard-activity-tree-node-label">Ressources</span>
              </button>
            </div>
            ${treeHtml || '<div class="dashboard-activity-tree-empty">Aucun dossier pour le moment.</div>'}
          </div>
        </aside>

        <div class="dashboard-activity-splitter" role="separator" aria-orientation="vertical" aria-label="Séparateur entre les panneaux"></div>

        <section class="dashboard-activity-tiles-pane panel">
          <div class="dashboard-activity-tiles-grid-wrap">
            <div class="dashboard-resource-tiles-grid">
              ${tilesHtml || renderEmptyState(selectedFolder)}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function updateActions(){
    const treeState = buildTreeState();
    const atExplorerRoot = !normalizeTreeId(currentOpenFolderId);
    const writable = !atExplorerRoot && isWritablePersonalLocation(currentOpenFolderId, treeState);
    const busy = isImporting || isRecordingResource || isMoving;
    if (createFolderButton) {
      createFolderButton.disabled = !writable || busy;
      createFolderButton.title = atExplorerRoot
        ? "Sélectionne d’abord « Ressources personnelles » ou l’un de ses dossiers."
        : writable
          ? "Créer un dossier personnel ici"
          : "Les ressources système sont protégées en écriture";
    }
    if (importResourcesButton) {
      importResourcesButton.disabled = !writable || busy;
      importResourcesButton.title = busy
        ? "Import en cours…"
        : atExplorerRoot
          ? "Sélectionne d’abord « Ressources personnelles » ou l’un de ses dossiers."
          : writable
            ? "Importer des fichiers ici"
            : "Les ressources système sont protégées en écriture";
      importResourcesButton.setAttribute("aria-busy", String(busy));
    }
    if (recordAudioButton) {
      recordAudioButton.disabled = !writable || busy;
      recordAudioButton.title = busy
        ? "Une opération est déjà en cours…"
        : atExplorerRoot
          ? "Sélectionne d’abord « Ressources personnelles » ou l’un de ses dossiers."
          : writable
            ? "Enregistrer un audio personnel ici"
            : "Les ressources système sont protégées en écriture";
      recordAudioButton.setAttribute("aria-busy", String(busy));
    }
  }

  function clearResourceDropMarkers(){
    resourceDropTarget = null;
    list?.querySelectorAll(".is-dragging, .is-drop-inside").forEach((element) => {
      element.classList.remove("is-dragging", "is-drop-inside");
    });
  }

  function markDraggedNode(){
    if (!draggedNode?.id || !draggedNode?.type) return;
    const selector = `[data-node-type="${CSS.escape(draggedNode.type)}"][data-node-id="${CSS.escape(draggedNode.id)}"]`;
    list?.querySelectorAll(selector).forEach((element) => element.classList.add("is-dragging"));
  }

  function getResourceDropTargetFromEvent(event){
    const targetElement = event.target instanceof Element ? event.target : null;
    if (!targetElement || !list?.contains(targetElement)) return null;

    const treeRoot = targetElement.closest(".dashboard-activity-tree-root");
    if (treeRoot) {
      return { rawFolderId: RESOURCE_ROOT_PERSONAL, element: treeRoot };
    }

    const explicitTarget = targetElement.closest("[data-drop-folder-id]");
    if (explicitTarget) {
      const rawFolderId = String(explicitTarget.dataset.dropFolderId || "");
      return getPersonalTargetFolderId(rawFolderId) === undefined
        ? null
        : { rawFolderId, element: explicitTarget };
    }

    const folderTarget = targetElement.closest("[data-node-type='folder'][data-node-id]");
    if (folderTarget) {
      const rawFolderId = String(folderTarget.dataset.nodeId || "");
      return getPersonalTargetFolderId(rawFolderId) === undefined
        ? null
        : { rawFolderId, element: folderTarget };
    }

    const tilesPane = targetElement.closest(".dashboard-activity-tiles-pane");
    if (tilesPane) {
      const rawFolderId = normalizeTreeId(currentOpenFolderId) || RESOURCE_ROOT_PERSONAL;
      return getPersonalTargetFolderId(rawFolderId) === undefined
        ? null
        : { rawFolderId, element: tilesPane };
    }

    return null;
  }

  function renderResourceDropTarget(dropTarget){
    list?.querySelectorAll(".is-drop-inside").forEach((element) => element.classList.remove("is-drop-inside"));
    if (dropTarget?.element instanceof Element) dropTarget.element.classList.add("is-drop-inside");
    markDraggedNode();
  }

  function getNextFolderOrder(targetFolderId, sourceFolderId){
    return personalFolders
      .filter((folder) => String(folder.id) !== String(sourceFolderId || ""))
      .filter((folder) => normalizeTreeId(folder.parent_id) === normalizeTreeId(targetFolderId))
      .reduce((maximum, folder) => Math.max(maximum, Number(folder.display_order) || 0), -1) + 1;
  }

  function getNextResourceOrder(targetFolderId, sourceResourceId){
    return personalResources
      .filter((resource) => String(resource.id) !== String(sourceResourceId || ""))
      .filter((resource) => normalizeTreeId(resource.folder_id) === normalizeTreeId(targetFolderId))
      .reduce((maximum, resource) => Math.max(maximum, Number(resource.display_order) || 0), -1) + 1;
  }

  async function moveDraggedNodeToTarget(source, dropTarget){
    if (!source?.id || !source?.type || !dropTarget || isMoving) return;
    const targetFolderId = getPersonalTargetFolderId(dropTarget.rawFolderId);
    if (targetFolderId === undefined) return;

    if (source.type === "folder") {
      const folder = personalFolders.find((item) => String(item.id) === String(source.id));
      if (!folder) return;
      if (String(folder.id) === String(targetFolderId || "") || (targetFolderId && isFolderInside(targetFolderId, folder.id))) {
        showToast?.("Un dossier ne peut pas être déplacé dans lui-même ou dans l’un de ses sous-dossiers.", { isError: true });
        clearResourceDropMarkers();
        return;
      }
      if (normalizeTreeId(folder.parent_id) === normalizeTreeId(targetFolderId)) {
        clearResourceDropMarkers();
        return;
      }

      const previousFolders = [...personalFolders];
      const displayOrder = getNextFolderOrder(targetFolderId, folder.id);
      personalFolders = personalFolders.map((item) => String(item.id) === String(folder.id)
        ? { ...item, parent_id: targetFolderId, display_order: displayOrder }
        : item);
      isMoving = true;
      if (targetFolderId) expandFolderPath(targetFolderId);
      render();
      try {
        const updated = await updateResourceFolder?.(folder.id, {
          parent_id: targetFolderId,
          display_order: displayOrder
        });
        if (updated) {
          personalFolders = personalFolders.map((item) => String(item.id) === String(updated.id) ? updated : item);
        }
        showToast?.("Dossier déplacé.");
      } catch (error) {
        personalFolders = previousFolders;
        showToast?.(error?.message || "Impossible de déplacer le dossier.", { isError: true });
      } finally {
        isMoving = false;
        draggedNode = null;
        clearResourceDropMarkers();
        render();
      }
      return;
    }

    if (source.type === "resource") {
      const resource = personalResources.find((item) => String(item.id) === String(source.id));
      if (!resource) return;
      if (normalizeTreeId(resource.folder_id) === normalizeTreeId(targetFolderId)) {
        clearResourceDropMarkers();
        return;
      }

      const previousResources = [...personalResources];
      const displayOrder = getNextResourceOrder(targetFolderId, resource.id);
      personalResources = personalResources.map((item) => String(item.id) === String(resource.id)
        ? { ...item, folder_id: targetFolderId, display_order: displayOrder }
        : item);
      isMoving = true;
      if (targetFolderId) expandFolderPath(targetFolderId);
      render();
      try {
        const updated = await updateResource?.(resource.id, {
          folder_id: targetFolderId,
          display_order: displayOrder
        });
        if (updated) {
          personalResources = personalResources.map((item) => String(item.id) === String(updated.id)
            ? { ...item, ...updated, url: item.url || updated.url }
            : item);
        }
        showToast?.("Ressource déplacée.");
      } catch (error) {
        personalResources = previousResources;
        showToast?.(error?.message || "Impossible de déplacer la ressource.", { isError: true });
      } finally {
        isMoving = false;
        draggedNode = null;
        clearResourceDropMarkers();
        render();
      }
    }
  }

  function handleResourceDragStart(event){
    const sourceElement = event.currentTarget;
    const type = String(sourceElement?.dataset?.nodeType || "");
    const id = String(sourceElement?.dataset?.nodeId || "");
    if (!id || !["folder", "resource"].includes(type) || isMoving || isImporting) {
      event.preventDefault();
      return;
    }
    if (event.target instanceof Element && event.target.closest(".dashboard-activity-tile-corner-actions")) {
      event.preventDefault();
      return;
    }
    const sourceRecord = type === "folder"
      ? personalFolders.find((item) => String(item.id) === id)
      : personalResources.find((item) => String(item.id) === id);
    if (!sourceRecord || sourceRecord.is_system === true) {
      event.preventDefault();
      return;
    }

    draggedNode = { type, id };
    sourceElement.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `${type}:${id}`);
    }
  }

  function handleResourceDragOver(event){
    if (!draggedNode || isMoving || isImporting) return;
    const dropTarget = getResourceDropTargetFromEvent(event);
    if (!dropTarget) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    resourceDropTarget = dropTarget;
    renderResourceDropTarget(dropTarget);
  }

  function handleResourceDragLeave(event){
    if (!list) return;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && list.contains(relatedTarget)) return;
    clearResourceDropMarkers();
  }

  async function handleResourceDrop(event){
    if (!draggedNode || isMoving || isImporting) return;
    const dropTarget = resourceDropTarget || getResourceDropTargetFromEvent(event);
    if (!dropTarget) return;
    event.preventDefault();
    const source = { ...draggedNode };
    await moveDraggedNodeToTarget(source, dropTarget);
  }

  function handleResourceDragEnd(){
    draggedNode = null;
    clearResourceDropMarkers();
  }

  function bindRenderedEvents(){
    list?.querySelectorAll('[data-action="open-root"]').forEach((button) => {
      button.addEventListener("click", () => setCurrentFolder(null));
    });
    list?.querySelectorAll('[data-action="open-folder"]').forEach((button) => {
      button.addEventListener("click", () => setCurrentFolder(button.dataset.folderId));
    });
    list?.querySelectorAll('[data-action="toggle-folder"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const id = String(button.dataset.folderId || "");
        if (!id) return;
        if (collapsedFolderIds.has(id)) collapsedFolderIds.delete(id);
        else collapsedFolderIds.add(id);
        render();
      });
    });
    list?.querySelectorAll('[data-action="rename-folder"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        renameFolder(button.dataset.folderId);
      });
    });
    list?.querySelectorAll('[data-action="delete-folder"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        void deleteFolder(button.dataset.folderId);
      });
    });
    list?.querySelectorAll('[data-action="rename-resource"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        renamePersonalResource(button.dataset.resourceId);
      });
    });
    list?.querySelectorAll('[data-action="delete-resource"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        void deletePersonalResource(button.dataset.resourceId);
      });
    });
    list?.querySelectorAll('[data-action="open-resource"]').forEach((button) => {
      button.addEventListener("click", () => {
        const resource = getExplorerResources().find((item) => String(item.id) === String(button.dataset.resourceId));
        if (resource) void openResourceDetails(resource);
      });
    });
    list?.querySelectorAll('[draggable="true"][data-node-type][data-node-id]').forEach((element) => {
      element.addEventListener("dragstart", handleResourceDragStart);
      element.addEventListener("dragend", handleResourceDragEnd);
    });
  }

  function render(){
    updateStorageQuota();
    if (!list) return;
    if (personalLoadError) {
      list.classList.add("dashboard-explorer-host");
      list.innerHTML = `<div class="dashboard-activity-empty-state">${escapeHtml(personalLoadError)}</div>`;
      return;
    }
    syncKnownFolders();
    const { state, visibleNodes } = buildVisibleTree();
    if (currentOpenFolderId && !state.folderById.has(String(currentOpenFolderId))) currentOpenFolderId = null;
    list.classList.add("dashboard-explorer-host");
    list.innerHTML = renderShell(state, visibleNodes);
    updateActions();
    bindRenderedEvents();
  }

  function openNameOverlay({ title, initialValue = "", placeholder = "", confirmLabel = "Enregistrer", onConfirm } = {}){
    const overlay = document.createElement("div");
    overlay.className = "modal";
    overlay.innerHTML = `
      <div class="modal-content">
        <div class="modal-title">${escapeHtml(title || "Nom")}</div>
        <input class="modal-text-input" type="text" value="${escapeAttr(initialValue)}" placeholder="${escapeAttr(placeholder)}">
        <div class="modal-actions">
          <div class="modal-message"></div>
          <button class="btn" type="button" data-action="cancel">Annuler</button>
          <button class="btn primary" type="button" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    const input = overlay.querySelector("input");
    const message = overlay.querySelector(".modal-message");
    const close = () => overlay.remove();
    const submit = async () => {
      const value = String(input?.value || "").trim();
      if (!value) {
        message.textContent = "Entre un nom.";
        message.classList.add("is-error");
        input?.focus();
        return;
      }
      try {
        await onConfirm?.(value);
        close();
      } catch (error) {
        message.textContent = error?.message || "Enregistrement impossible.";
        message.classList.add("is-error");
      }
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest('[data-action="cancel"]')) close();
      if (event.target.closest('[data-action="confirm"]')) void submit();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
      else if (event.key === "Enter") void submit();
    });
    input?.focus();
    input?.select();
  }

  function inferMimeType(file){
    const declared = String(file?.type || "").trim().toLowerCase();
    if (declared.startsWith("image/") || declared.startsWith("audio/")) return declared;
    const extension = String(file?.name || "").split(".").pop()?.toLowerCase() || "";
    const byExtension = {
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      avif: "image/avif",
      svg: "image/svg+xml",
      bmp: "image/bmp",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      oga: "audio/ogg",
      m4a: "audio/mp4",
      mp4: "audio/mp4",
      aac: "audio/aac",
      flac: "audio/flac",
      webm: "audio/webm"
    };
    return byExtension[extension] || "";
  }

  function getFileTitle(file){
    const name = String(file?.name || "Ressource").trim() || "Ressource";
    return name.replace(/\.[^.]+$/, "").trim() || name;
  }

  function readImageMetadata(file){
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const image = new Image();
      const finish = (metadata) => {
        URL.revokeObjectURL(url);
        resolve(metadata);
      };
      image.onload = () => finish({
        width: Math.max(0, Number(image.naturalWidth) || 0),
        height: Math.max(0, Number(image.naturalHeight) || 0),
        duration: 0
      });
      image.onerror = () => finish({ width: 0, height: 0, duration: 0 });
      image.src = url;
    });
  }

  function readAudioMetadata(file){
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const audio = document.createElement("audio");
      const finish = (metadata) => {
        audio.removeAttribute("src");
        audio.load();
        URL.revokeObjectURL(url);
        resolve(metadata);
      };
      audio.preload = "metadata";
      audio.onloadedmetadata = () => finish({
        width: 0,
        height: 0,
        duration: Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0
      });
      audio.onerror = () => finish({ width: 0, height: 0, duration: 0 });
      audio.src = url;
    });
  }

  async function readResourceMetadata(file, mimeType){
    if (mimeType.startsWith("image/")) return readImageMetadata(file);
    if (mimeType.startsWith("audio/")) return readAudioMetadata(file);
    return { width: 0, height: 0, duration: 0 };
  }

  function chooseResourceFiles(){
    const treeState = buildTreeState();
    if (!normalizeTreeId(currentOpenFolderId) || !isWritablePersonalLocation(currentOpenFolderId, treeState) || isImporting) return;
    resourceFileInput?.click();
  }

  async function importResourceFiles(fileList){
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length || typeof uploadResourceForSpace !== "function") return;

    const treeState = buildTreeState();
    if (!normalizeTreeId(currentOpenFolderId)) return;
    const targetFolderId = getPersonalTargetFolderId(currentOpenFolderId, treeState);
    if (targetFolderId === undefined) {
      showToast?.("Les ressources système sont protégées en écriture.", { isError: true });
      return;
    }

    const accepted = [];
    const rejected = [];
    const quotaRejected = [];
    let projectedUsage = getPersonalStorageUsage();
    files.forEach((file) => {
      const mimeType = inferMimeType(file);
      const fileSize = Math.max(0, Number(file?.size) || 0);
      const isSupported = mimeType.startsWith("image/") || mimeType.startsWith("audio/");
      const isWithinSizeLimit = fileSize <= MAX_RESOURCE_FILE_SIZE;
      if (!isSupported || !isWithinSizeLimit) {
        rejected.push(file.name || "Fichier inconnu");
        return;
      }
      if (projectedUsage + fileSize > RESOURCE_STORAGE_QUOTA_BYTES) {
        quotaRejected.push(file.name || "Fichier inconnu");
        return;
      }
      accepted.push({ file, mimeType });
      projectedUsage += fileSize;
    });

    if (!accepted.length) {
      const message = quotaRejected.length
        ? `Quota insuffisant : ${formatQuotaBytes(getPersonalStorageUsage())} utilisés sur ${formatQuotaBytes(RESOURCE_STORAGE_QUOTA_BYTES)}.`
        : "Aucun fichier compatible : image ou audio, 25 Mo maximum.";
      showToast?.(message, { isError: true });
      return;
    }

    isImporting = true;
    updateActions();
    let nextDisplayOrder = personalResources
      .filter((resource) => normalizeTreeId(resource.folder_id) === normalizeTreeId(targetFolderId))
      .reduce((max, resource) => Math.max(max, Number(resource.display_order) || 0), -1) + 1;
    const imported = [];
    const errors = [];

    for (const { file, mimeType } of accepted) {
      try {
        const metadata = await readResourceMetadata(file, mimeType);
        const uploaded = await uploadResourceForSpace(getTeacherSpaceId(), file, {
          folder_id: targetFolderId,
          title: getFileTitle(file),
          alt: getFileTitle(file),
          mime_type: mimeType,
          width: metadata.width,
          height: metadata.height,
          duration: metadata.duration,
          display_order: nextDisplayOrder
        });
        nextDisplayOrder += 1;
        if (uploaded) imported.push(uploaded);
      } catch (error) {
        console.error(`Import impossible pour ${file.name || "un fichier"}.`, error);
        errors.push(`${file.name || "Fichier"} : ${error?.message || "échec de l’import"}`);
      }
    }

    try {
      await reloadRemoteState();
    } catch (error) {
      console.error("Impossible de rafraîchir les ressources après l’import.", error);
      if (imported.length) personalResources.push(...imported);
    } finally {
      isImporting = false;
      if (resourceFileInput) resourceFileInput.value = "";
      render();
    }

    const ignoredCount = rejected.length + quotaRejected.length;
    if (imported.length && !errors.length && !ignoredCount) {
      showToast?.(`${imported.length} ressource${imported.length > 1 ? "s" : ""} importée${imported.length > 1 ? "s" : ""}.`);
      return;
    }

    const messages = [];
    if (imported.length) messages.push(`${imported.length} importée${imported.length > 1 ? "s" : ""}`);
    if (errors.length) messages.push(`${errors.length} en échec`);
    if (rejected.length) messages.push(`${rejected.length} incompatible${rejected.length > 1 ? "s" : ""}`);
    if (quotaRejected.length) messages.push(`${quotaRejected.length} hors quota`);
    showToast?.(`Import terminé : ${messages.join(", ")}.`, { isError: errors.length > 0 || ignoredCount > 0 });
  }

  async function recordAudioResource(){
    const treeState = buildTreeState();
    if (!normalizeTreeId(currentOpenFolderId) || !isWritablePersonalLocation(currentOpenFolderId, treeState) || isImporting || isRecordingResource) return;
    if (typeof uploadResourceForSpace !== "function" || typeof listResourcesForSpace !== "function") {
      showToast?.("La gestion des ressources personnelles n’est pas disponible.", { isError:true });
      return;
    }

    const targetFolderId = getPersonalTargetFolderId(currentOpenFolderId, treeState);
    if (targetFolderId === undefined) {
      showToast?.("Les ressources système sont protégées en écriture.", { isError:true });
      return;
    }

    const teacherSpaceId = getTeacherSpaceId();
    const useAutomaticRecordingsFolder = targetFolderId === null;
    if (useAutomaticRecordingsFolder && typeof ensureRecordingsResourceFolderForSpace !== "function") {
      showToast?.("Le dossier automatique des enregistrements n’est pas disponible.", { isError:true });
      return;
    }

    isRecordingResource = true;
    updateActions();
    try {
      const resource = await openAudioRecorderDialog({
        teacherSpaceId,
        destinationFolderId:useAutomaticRecordingsFolder ? null : targetFolderId,
        ensureDestinationFolder:useAutomaticRecordingsFolder
          ? () => ensureRecordingsResourceFolderForSpace(teacherSpaceId)
          : null,
        listResourcesForSpace,
        uploadResourceForSpace,
        showToast
      });
      if (!resource?.id) return;
      await reloadRemoteState();
      render();
    } catch (error) {
      console.error("Impossible d’enregistrer l’audio depuis Ressources.", error);
      showToast?.(error?.message || "Impossible d’enregistrer cet audio.", { isError:true });
    } finally {
      isRecordingResource = false;
      updateActions();
    }
  }

  function createFolder(){
    const treeState = buildTreeState();
    if (!normalizeTreeId(currentOpenFolderId)) return;
    const parentId = getPersonalTargetFolderId(currentOpenFolderId, treeState);
    if (parentId === undefined || isImporting) return;
    openNameOverlay({
      title: "Créer un dossier personnel",
      placeholder: "Nom du dossier",
      confirmLabel: "Créer",
      onConfirm: async (name) => {
        const siblings = personalFolders.filter((folder) => normalizeTreeId(folder.parent_id) === normalizeTreeId(parentId));
        const folder = await createResourceFolderForSpace?.(getTeacherSpaceId(), {
          name,
          parent_id: parentId,
          display_order: siblings.length
        });
        if (!folder) throw new Error("Création du dossier impossible.");
        personalFolders.push(folder);
        knownFolderIds.add(String(folder.id));
        collapsedFolderIds.add(String(folder.id));
        render();
        showToast?.("Dossier de ressources créé.");
      }
    });
  }

  function renameFolder(folderId){
    const folder = personalFolders.find((item) => String(item.id) === String(folderId));
    if (!folder) return;
    openNameOverlay({
      title: "Renommer le dossier",
      initialValue: folder.name || "",
      placeholder: "Nom du dossier",
      onConfirm: async (name) => {
        const updated = await updateResourceFolder?.(folder.id, { name });
        if (!updated) throw new Error("Renommage impossible.");
        personalFolders = personalFolders.map((item) => String(item.id) === String(updated.id) ? updated : item);
        render();
        showToast?.("Dossier renommé.");
      }
    });
  }

  async function deleteFolder(folderId){
    const folder = personalFolders.find((item) => String(item.id) === String(folderId));
    if (!folder) return;
    const confirmed = await openDashboardConfirmDialog({
      title:"Supprimer le dossier",
      message:`Supprimer le dossier « ${folder.name} » ?`,
      confirmLabel:"Supprimer",
      danger:true
    });
    if (!confirmed) return;
    try {
      await deleteResourceFolder?.(folder.id);
      personalFolders = personalFolders.filter((item) => String(item.id) !== String(folder.id));
      if (String(currentOpenFolderId || "") === String(folder.id)) currentOpenFolderId = RESOURCE_ROOT_PERSONAL;
      render();
      showToast?.("Dossier supprimé.");
    } catch (error) {
      window.alert(error?.message || "Suppression impossible.");
    }
  }

  function renamePersonalResource(resourceId){
    const resource = personalResources.find((item) => String(item.id) === String(resourceId));
    if (!resource || resource.is_system === true || typeof updateResource !== "function") return;
    openNameOverlay({
      title:"Renommer la ressource",
      initialValue:resource.title || "",
      placeholder:"Nom de la ressource",
      onConfirm:async (title) => {
        const updated = await updateResource(resource.id, { title });
        if (!updated) throw new Error("Renommage impossible.");
        personalResources = personalResources.map((item) => String(item.id) === String(updated.id)
          ? { ...item, ...updated, url:item.url || updated.url }
          : item);
        render();
        showToast?.("Ressource renommée.");
      }
    });
  }

  async function deletePersonalResource(resourceId){
    const resource = personalResources.find((item) => String(item.id) === String(resourceId));
    if (!resource || resource.is_system === true || typeof deleteResource !== "function") return;
    const confirmed = await openDashboardConfirmDialog({
      title:"Supprimer la ressource",
      message:`Supprimer définitivement la ressource « ${resource.title || "Ressource"} » ?`,
      confirmLabel:"Supprimer",
      danger:true
    });
    if (!confirmed) return;
    try {
      await deleteResource(resource.id);
      personalResources = personalResources.filter((item) => String(item.id) !== String(resource.id));
      render();
      showToast?.("Ressource supprimée.");
    } catch (error) {
      const message = error?.code === "23503"
        ? "Cette ressource est encore utilisée par un quiz et ne peut pas être supprimée."
        : (error?.message || "Suppression impossible.");
      showToast?.(message, { isError: true });
    }
  }

  async function resolveResourceUrl(resource){
    if (resource.url) return resource.url;
    if (resource.storage_path && typeof createResourceSignedUrl === "function") {
      return await createResourceSignedUrl(resource, 3600);
    }
    if (!resource.source) return "";
    return resource.type === "audio"
      ? resolveQuizAudioSourceUrl(resource.source)
      : resolveQuizImageSourceUrl(resource.source);
  }

  async function openResourceDetails(resource){
    const overlay = document.createElement("div");
    overlay.className = "modal dashboard-resource-detail-modal";
    let detailResource = {
      ...resource,
      tags: Array.isArray(resource.tags) ? resource.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : []
    };
    const canEditTags = detailResource.is_system !== true && typeof updateResource === "function";
    const url = await resolveResourceUrl(resource).catch(() => "");
    const preview = resource.type === "audio"
      ? (url
        ? `
          <div class="dashboard-resource-detail-audio-player">
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-resource-audio-toggle aria-label="Lire l’audio" title="Lire l’audio">
              <span class="dashboard-material-icon" aria-hidden="true" data-resource-audio-icon>play_arrow</span>
            </button>
            <input class="dashboard-resource-detail-audio-progress" type="range" min="0" max="0" value="0" step="0.01" data-resource-audio-progress aria-label="Progression de l’audio">
            <span class="dashboard-resource-detail-audio-time" data-resource-audio-time>0:00 / 0:00</span>
            <audio preload="metadata" src="${escapeAttr(url)}" data-resource-audio-player></audio>
          </div>`
        : `<div class="dashboard-resource-detail-unavailable">Audio indisponible.</div>`)
      : (url
        ? `<img class="dashboard-resource-detail-image" src="${escapeAttr(url)}" alt="${escapeAttr(resource.alt || resource.title || "Image")}">`
        : `<div class="dashboard-resource-detail-unavailable">Image indisponible.</div>`);
    const dimensions = detailResource.width && detailResource.height
      ? `${detailResource.width} × ${detailResource.height} pixels`
      : "Dimensions indisponibles";
    const durationSeconds = Math.max(0, Math.round(Number(detailResource.duration) || 0));
    const duration = durationSeconds < 60
      ? `${durationSeconds} seconde${durationSeconds === 1 ? "" : "s"}`
      : `${Math.floor(durationSeconds / 60)} min ${durationSeconds % 60} s`;
    const size = formatBytes(detailResource.size_bytes) || "Poids indisponible";
    const renderTags = () => {
      const tags = detailResource.tags.length
        ? detailResource.tags.map((tag) => canEditTags
          ? `<button class="dashboard-resource-detail-tag" type="button" data-resource-tag-remove="${escapeAttr(tag)}" title="Retirer le tag ${escapeAttr(tag)}"><span>${escapeHtml(tag)}</span><span class="dashboard-material-icon" aria-hidden="true">close</span></button>`
          : `<span class="dashboard-resource-detail-tag">${escapeHtml(tag)}</span>`
        ).join("")
        : '<span class="dashboard-resource-detail-muted">Aucun tag</span>';
      return `
        <div class="dashboard-resource-detail-tag-list">${tags}</div>
        ${canEditTags ? `
          <form class="dashboard-resource-detail-tag-form" data-resource-tag-form>
            <input type="text" name="tag" maxlength="60" placeholder="Ajouter un tag" aria-label="Ajouter un tag">
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="submit" aria-label="Ajouter le tag" title="Ajouter le tag">
              <span class="dashboard-material-icon" aria-hidden="true">add</span>
            </button>
          </form>` : ""}
      `;
    };

    overlay.innerHTML = `
      <div class="modal-content dashboard-resource-detail-card">
        <div class="dashboard-resource-detail-head">
          <div>
            <div class="modal-title">${escapeHtml(detailResource.title || "Ressource")}</div>
          </div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="close" aria-label="Fermer" title="Fermer">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </div>
        <div class="dashboard-resource-detail-preview${detailResource.type === "audio" ? " is-audio" : ""}">${preview}</div>
        <dl class="dashboard-resource-detail-properties${detailResource.is_system ? " is-system" : ""}">
          <div><dt>Type</dt><dd>${detailResource.type === "audio" ? "Audio" : "Image"}</dd></div>
          ${detailResource.is_system ? "" : `
            <div><dt>${detailResource.type === "audio" ? "Durée" : "Dimensions"}</dt><dd>${escapeHtml(detailResource.type === "audio" ? duration : dimensions)}</dd></div>
            <div><dt>Poids</dt><dd>${escapeHtml(size)}</dd></div>
          `}
        </dl>
        <section class="dashboard-resource-detail-tags-panel">
          <h3>Tags</h3>
          <div class="dashboard-resource-detail-tags" data-resource-detail-tags>${renderTags()}</div>
        </section>
      </div>
    `;
    document.body.appendChild(overlay);
    const player = overlay.querySelector("[data-resource-audio-player]");
    const playerToggle = overlay.querySelector("[data-resource-audio-toggle]");
    const playerIcon = overlay.querySelector("[data-resource-audio-icon]");
    const playerProgress = overlay.querySelector("[data-resource-audio-progress]");
    const playerTime = overlay.querySelector("[data-resource-audio-time]");
    const tagsHost = overlay.querySelector("[data-resource-detail-tags]");
    const formatPlayerTime = (value) => {
      const seconds = Math.max(0, Math.floor(Number(value) || 0));
      return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    };
    const syncPlayer = () => {
      const duration = Number.isFinite(player?.duration) ? player.duration : Number(detailResource.duration) || 0;
      const currentTime = Math.min(Math.max(0, Number(player?.currentTime) || 0), duration || 0);
      if (playerProgress) {
        playerProgress.max = String(duration || 0);
        playerProgress.value = String(currentTime);
      }
      if (playerTime) playerTime.textContent = `${formatPlayerTime(currentTime)} / ${formatPlayerTime(duration)}`;
      if (playerIcon) playerIcon.textContent = player?.paused ? "play_arrow" : "pause";
      if (playerToggle) {
        const label = player?.paused ? "Lire l’audio" : "Mettre en pause";
        playerToggle.setAttribute("aria-label", label);
        playerToggle.title = label;
      }
    };
    const close = () => {
      player?.pause();
      overlay.remove();
    };
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest('[data-action="close"]')) close();
      if (event.target.closest("[data-resource-audio-toggle]")) {
        if (player?.paused) void player.play?.();
        else player?.pause();
      }
      const removeTag = event.target.closest("[data-resource-tag-remove]");
      if (removeTag && canEditTags) {
        const tag = String(removeTag.dataset.resourceTagRemove || "");
        void saveTags(detailResource.tags.filter((currentTag) => currentTag !== tag));
      }
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") close();
    });
    player?.addEventListener("loadedmetadata", syncPlayer);
    player?.addEventListener("durationchange", syncPlayer);
    player?.addEventListener("timeupdate", syncPlayer);
    player?.addEventListener("play", syncPlayer);
    player?.addEventListener("pause", syncPlayer);
    player?.addEventListener("ended", syncPlayer);
    playerProgress?.addEventListener("input", () => {
      if (!player || !Number.isFinite(player.duration)) return;
      player.currentTime = Math.min(Math.max(0, Number(playerProgress.value) || 0), player.duration);
      syncPlayer();
    });
    const saveTags = async (nextTags) => {
      if (!canEditTags) return;
      const uniqueTags = Array.from(new Map(
        nextTags
          .map((tag) => String(tag || "").trim())
          .filter(Boolean)
          .map((tag) => [tag.toLocaleLowerCase("fr-FR"), tag])
      ).values());
      try {
        const updated = await updateResource(detailResource.id, { tags:uniqueTags });
        if (!updated) throw new Error("Mise à jour des tags impossible.");
        detailResource = { ...detailResource, ...updated, tags:Array.isArray(updated.tags) ? updated.tags : uniqueTags };
        personalResources = personalResources.map((item) => String(item.id) === String(detailResource.id)
          ? { ...item, ...updated, tags:detailResource.tags, url:item.url || updated.url }
          : item);
        if (tagsHost) tagsHost.innerHTML = renderTags();
      } catch (error) {
        console.error("Impossible de mettre à jour les tags de la ressource.", error);
        showToast?.(error?.message || "Impossible de mettre à jour les tags.", { isError:true });
      }
    };
    tagsHost?.addEventListener("submit", (event) => {
      event.preventDefault();
      const input = event.target.elements?.tag;
      const tagsToAdd = String(input?.value || "").split(",").map((tag) => tag.trim()).filter(Boolean);
      if (!tagsToAdd.length) return;
      void saveTags([...detailResource.tags, ...tagsToAdd]);
    });
    if (player) {
      syncPlayer();
      void player.play().catch(() => {});
    }
  }

  async function loadSystemResources({ force = false } = {}){
    manifestError = "";
    try {
      const manifest = await loadToolAssetsManifest({ force });
      const catalogue = buildSystemCatalogue(manifest);
      systemFolders = catalogue.folders;
      systemResources = catalogue.resources;
      manifestLoaded = true;
    } catch (error) {
      manifestLoaded = true;
      manifestError = error?.message || "Impossible de charger les ressources système.";
      systemFolders = buildSystemCatalogue({ assets: [] }).folders;
      systemResources = [];
    }
    render();
  }

  list?.addEventListener("dragover", handleResourceDragOver);
  list?.addEventListener("dragleave", handleResourceDragLeave);
  list?.addEventListener("drop", (event) => { void handleResourceDrop(event); });

  createFolderButton?.addEventListener("click", createFolder);
  importResourcesButton?.addEventListener("click", chooseResourceFiles);
  recordAudioButton?.addEventListener("click", () => { void recordAudioResource(); });
  resourceFileInput?.addEventListener("change", () => {
    void importResourceFiles(resourceFileInput.files);
  });

  return {
    async refresh({ forceRefresh = false } = {}){
      personalLoadError = "";
      try {
        await reloadRemoteState();
      } catch (error) {
        console.error("Impossible de charger les ressources Supabase.", error);
        personalLoadError = error?.message || "Impossible de charger les ressources personnelles.";
        showToast?.(personalLoadError, { isError: true });
      }
      if (!manifestLoaded || forceRefresh) await loadSystemResources({ force: forceRefresh });
      else render();
    },
    render,
    getCurrentFolderId: () => currentOpenFolderId
  };
}
