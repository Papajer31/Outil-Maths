import {
  CATALOG_ROOT_LABEL,
  getCatalogFolders
} from "../../../shared/catalogue.js";
import {
  escapeAttr,
  escapeHtml
} from "./text-utils.js";
import { openCatalogTestRunner } from "./catalog-test-runner.js";
import { createCatalogAdminViewController } from "./catalog-admin-view.js";

export function createActivitiesViewController({
  configHeader,
  configsList,
  getCurrentTeacherSpace,
  getIsSuperAdmin,
  listCatalogActivitiesForTeacherSpace,
  setCatalogActivityVisibility,
  listCatalogActivitiesForAdmin,
  saveCatalogActivityAsAdmin,
  deleteCatalogActivityAsAdmin,
  getCatalogActivityUsageAsAdmin,
  showToast
} = {}){
  let currentOpenFolderId = null;
  let cachedTeacherCatalogActivities = null;
  let cachedAdminCatalogActivities = null;
  let cachedRenderedCatalogActivities = null;
  let currentRenderIsSuperAdmin = false;
  let catalogueChangeListenerAttached = false;
  let activeCatalogTestController = null;
  const folders = getCatalogFolders();

  const catalogAdminViewController = createCatalogAdminViewController({
    header: configHeader,
    list: configsList,
    getCurrentTeacherSpace,
    listCatalogActivitiesForAdmin,
    saveCatalogActivityAsAdmin,
    deleteCatalogActivityAsAdmin,
    getCatalogActivityUsageAsAdmin,
    showToast,
    onReturnToCatalogue: ({ forceRefresh = false } = {}) => renderActivitiesForSpace({ forceRefresh })
  });

  function getFolderById(id){
    const safeId = String(id || "").trim();
    return folders.find((folder) => String(folder.id) === safeId) || null;
  }

  function getBreadcrumb(){
    const trail = [];
    let cursor = getFolderById(currentOpenFolderId);
    while (cursor) {
      trail.unshift(cursor);
      cursor = getFolderById(cursor.parent_id);
    }
    return trail;
  }

  function getFolderIdsLeadingToActivities(activities = [], { includeAllFolders = false } = {}){
    if (includeAllFolders) {
      return new Set(folders.map((folder) => String(folder.id)));
    }

    const usefulFolderIds = new Set();
    const folderById = new Map(folders.map((folder) => [String(folder.id), folder]));

    (Array.isArray(activities) ? activities : []).forEach((activity) => {
      let folderId = getActivityFolderId(activity);
      const seen = new Set();

      while (folderId && folderById.has(folderId) && !seen.has(folderId)) {
        usefulFolderIds.add(folderId);
        seen.add(folderId);
        folderId = String(folderById.get(folderId)?.parent_id || "").trim();
      }
    });

    return usefulFolderIds;
  }

  function syncCurrentOpenFolderWithActivities(activities = [], { includeAllFolders = false } = {}){
    if (!currentOpenFolderId) return;
    const usefulFolderIds = getFolderIdsLeadingToActivities(activities, { includeAllFolders });
    let cursor = getFolderById(currentOpenFolderId);

    while (cursor && !usefulFolderIds.has(String(cursor.id))) {
      cursor = getFolderById(cursor.parent_id);
    }

    currentOpenFolderId = cursor ? String(cursor.id) : null;
  }

  function getVisibleChildFolders(parentId, usefulFolderIds){
    const normalizedParentId = String(parentId || "");
    return folders.filter((folder) => (
      usefulFolderIds.has(String(folder.id))
      && String(folder.parent_id || "") === normalizedParentId
    ));
  }

  function renderConfigHeader({ isSuperAdmin = false } = {}){
    if (!configHeader) return;
    const breadcrumb = getBreadcrumb();
    const breadcrumbHtml = [
      `<button class="dashboard-breadcrumb-btn${breadcrumb.length ? "" : " is-current"}" type="button" data-action="open-root">Catalogue</button>`,
      ...breadcrumb.map((folder, index) => `
        <span class="dashboard-breadcrumb-separator" aria-hidden="true">/</span>
        <button class="dashboard-breadcrumb-btn${index === breadcrumb.length - 1 ? " is-current" : ""}" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folder.id)}">
          ${escapeHtml(folder.name)}
        </button>
      `)
    ].join("");

    configHeader.innerHTML = `
      <div class="dashboard-config-header-main">
        <div class="dashboard-section-title">Catalogue</div>
      </div>
      <div class="dashboard-config-header-center">
        <nav class="dashboard-breadcrumb" aria-label="Fil d’Ariane du catalogue">
          ${breadcrumbHtml}
        </nav>
      </div>
      <div class="dashboard-config-header-actions">
        ${isSuperAdmin ? catalogAdminViewController.renderHeaderActions() : ""}
      </div>
    `;

    configHeader.querySelectorAll("[data-action='open-root']").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentOpenFolderId = null;
        void renderActivitiesForSpace();
      });
    });

    configHeader.querySelectorAll("[data-action='open-folder']").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentOpenFolderId = String(btn.dataset.folderId || "").trim() || null;
        void renderActivitiesForSpace();
      });
    });

    if (isSuperAdmin) {
      catalogAdminViewController.bindHeaderActions();
    }
  }

  function renderTreeFolder(folder, usefulFolderIds, depth = 0){
    const selected = String(currentOpenFolderId || "") === String(folder.id);
    return `
      <div class="dashboard-activity-tree-row dashboard-tree-node ${selected ? "is-selected" : ""}" style="--dashboard-tree-depth:${depth};">
        <div class="dashboard-tree-indent" aria-hidden="true"></div>
        <span class="dashboard-tree-toggle-placeholder" aria-hidden="true"></span>
        <button class="dashboard-activity-tree-main" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folder.id)}">
          <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tree-node-label">${escapeHtml(folder.name)}</span>
        </button>
      </div>
      ${getVisibleChildFolders(folder.id, usefulFolderIds)
        .sort(compareByOrderAndName)
        .map((child) => renderTreeFolder(child, usefulFolderIds, depth + 1))
        .join("")}
    `;
  }

  function renderFolderTile(folder){
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--folder dashboard-activity-tile--catalog-folder">
        <button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folder.id)}">
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tile-labelbox">
            <span class="dashboard-activity-tile-title">${escapeHtml(folder.name)}</span>
          </span>
        </button>
      </article>
    `;
  }

  function renderParentTile(selectedFolder){
    if (!selectedFolder) return "";
    const parentId = String(selectedFolder.parent_id || "").trim();
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--folder dashboard-activity-tile--catalog-folder dashboard-activity-tile--parent">
        <button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder" type="button" data-action="${parentId ? "open-folder" : "open-root"}" ${parentId ? `data-folder-id="${escapeAttr(parentId)}"` : ""}>
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">arrow_upward</span>
          <span class="dashboard-activity-tile-labelbox">
            <span class="dashboard-activity-tile-title">Dossier parent</span>
          </span>
        </button>
      </article>
    `;
  }

  function renderActivityTile(activity, { isSuperAdmin = false } = {}){
    const isPublished = String(activity?.status || "published") === "published";
    const visible = isPublished && activity?.is_visible !== false;
    const adminEnhancement = isSuperAdmin
      ? catalogAdminViewController.getActivityTileEnhancement(activity)
      : null;
    const tileClasses = [
      "dashboard-activity-tile",
      "dashboard-activity-tile--activity",
      "dashboard-activity-tile--catalog-activity",
      visible || !isPublished ? "" : "is-hidden",
      adminEnhancement?.className || ""
    ].filter(Boolean).join(" ");

    return `
      <article class="${tileClasses}" ${adminEnhancement?.attributes || ""}>
        <div class="dashboard-activity-tile-surface dashboard-activity-tile-surface--activity" style="cursor:default;">
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">extension</span>
          <span class="dashboard-activity-tile-labelbox dashboard-activity-tile-labelbox--activity">
            <span class="dashboard-activity-tile-title">${escapeHtml(activity?.config_name || activity?.title || "Activité")}</span>
            ${activity?.description ? `<span class="dashboard-activity-tile-subtitle">${escapeHtml(activity.description)}</span>` : ""}
            ${adminEnhancement?.subtitleHtml || ""}
          </span>
        </div>
        <div class="dashboard-activity-tile-actions dashboard-activity-tile-actions--activity">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="test-catalog-activity" data-catalog-activity-id="${escapeAttr(activity.id)}" title="Tester" aria-label="Tester">
            <span class="dashboard-material-icon" aria-hidden="true">play_arrow</span>
          </button>
          ${isPublished ? `
            <button class="dashboard-icon-btn dashboard-material-icon-btn ${visible ? "" : "is-muted"}" type="button" data-action="toggle-catalog-visible" data-catalog-activity-id="${escapeAttr(activity.id)}" title="${visible ? "Masquer dans Exploration" : "Afficher dans Exploration"}" aria-label="${visible ? "Masquer dans Exploration" : "Afficher dans Exploration"}">
              <span class="dashboard-material-icon" aria-hidden="true">${visible ? "visibility" : "visibility_off"}</span>
            </button>
          ` : ""}
          ${adminEnhancement?.actionsHtml || ""}
        </div>
      </article>
    `;
  }

  function renderShell(activities, { isSuperAdmin = false } = {}){
    const usefulFolderIds = getFolderIdsLeadingToActivities(activities, { includeAllFolders: isSuperAdmin });
    const selectedFolder = getFolderById(currentOpenFolderId);
    const parentId = selectedFolder ? String(selectedFolder.id) : null;
    const childFolders = getVisibleChildFolders(parentId, usefulFolderIds).sort(compareByOrderAndName);
    const childActivities = (activities || [])
      .filter((activity) => getActivityFolderId(activity) === String(parentId || ""))
      .sort(compareByOrderAndName);
    const rootFolders = getVisibleChildFolders(null, usefulFolderIds).sort(compareByOrderAndName);
    const treeHtml = rootFolders.map((folder) => renderTreeFolder(folder, usefulFolderIds, 0)).join("");
    const tilesHtml = [
      renderParentTile(selectedFolder),
      ...childFolders.map(renderFolderTile),
      ...childActivities.map((activity) => renderActivityTile(activity, { isSuperAdmin }))
    ].filter(Boolean).join("");
    const adminGridClass = isSuperAdmin ? " dashboard-admin-catalogue-grid" : "";
    const adminDropzoneAttributes = isSuperAdmin
      ? catalogAdminViewController.getDropzoneAttributes(parentId)
      : "";
    const rightPaneHtml = `
      <div class="dashboard-activity-tiles-grid-wrap">
        <div class="dashboard-activity-tiles-grid${adminGridClass}" ${adminDropzoneAttributes}>
          ${tilesHtml || `<div class="dashboard-activity-empty-state">Aucune activité dans cette catégorie.</div>`}
        </div>
      </div>
    `;

    return `
      <div class="dashboard-activities-explorer" style="--dashboard-tree-pane-width:18%;">
        <aside class="dashboard-activity-tree-pane panel">
          <div class="dashboard-activity-tree-list">
            <div class="dashboard-activity-tree-row dashboard-activity-tree-root ${currentOpenFolderId ? "" : "is-selected"}">
              <button class="dashboard-activity-tree-main dashboard-activity-tree-main--root" type="button" data-action="open-root">
                <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">travel_explore</span>
                <span class="dashboard-activity-tree-node-label">${escapeHtml(CATALOG_ROOT_LABEL)}</span>
              </button>
            </div>
            ${treeHtml}
          </div>
        </aside>
        <div class="dashboard-activity-splitter" role="separator" aria-orientation="vertical" aria-label="Séparateur entre les panneaux"></div>
        <section class="dashboard-activity-tiles-pane panel">
          ${rightPaneHtml}
        </section>
      </div>
    `;
  }

  function bindEvents({ isSuperAdmin = false } = {}){
    configsList?.querySelectorAll("[data-action='open-root']").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentOpenFolderId = null;
        void renderActivitiesForSpace();
      });
    });

    configsList?.querySelectorAll("[data-action='open-folder']").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentOpenFolderId = String(btn.dataset.folderId || "").trim() || null;
        void renderActivitiesForSpace();
      });
    });

    configsList?.querySelectorAll("[data-action='toggle-catalog-visible']").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const currentTeacherSpace = getCurrentTeacherSpace?.();
        if (!currentTeacherSpace?.id) {
          showToast?.("Crée d’abord ton code de connexion pour gérer la visibilité.", { isError: true });
          return;
        }
        const activityId = String(btn.dataset.catalogActivityId || "").trim();
        const activity = (cachedRenderedCatalogActivities || []).find((item) => String(item?.id || "") === activityId);
        if (!activity || String(activity?.status || "published") !== "published") return;
        try {
          cachedTeacherCatalogActivities = await setCatalogActivityVisibility?.(
            currentTeacherSpace.id,
            activityId,
            activity.is_visible === false
          );
          await renderActivitiesForSpace();
        } catch (err) {
          showToast?.(err?.message || "Impossible de modifier la visibilité.", { isError: true });
        }
      });
    });

    configsList?.querySelectorAll("[data-action='test-catalog-activity']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const activityId = String(btn.dataset.catalogActivityId || "").trim();
        if (!activityId) return;
        openCatalogTestPanel(activityId);
      });
    });

    if (isSuperAdmin) {
      catalogAdminViewController.bindCatalogueEvents({ root: configsList });
    }
  }

  function openCatalogTestPanel(catalogActivityId){
    const activityId = String(catalogActivityId || "").trim();
    const activity = (cachedRenderedCatalogActivities || []).find((item) => String(item?.id || "") === activityId);
    const currentTeacherSpace = getCurrentTeacherSpace?.();

    if (!activity) {
      showToast?.("Activité de catalogue introuvable.", { isError: true });
      return;
    }

    const accessCode = String(currentTeacherSpace?.access_code || (currentRenderIsSuperAdmin ? "ADMINTEST" : "")).trim().toUpperCase();
    if (!accessCode) {
      showToast?.("Impossible d’ouvrir le test : code de classe manquant.", { isError: true });
      return;
    }

    cleanupActiveCatalogTestController();
    activeCatalogTestController = openCatalogTestRunner({
      accessCode,
      activity,
      catalogActivities: cachedRenderedCatalogActivities || [],
      onClose: () => {
        activeCatalogTestController = null;
      },
      showToast
    });
  }

  function cleanupActiveCatalogTestController(){
    if (activeCatalogTestController?.destroy) {
      try {
        activeCatalogTestController.destroy();
      } catch {}
    }
    activeCatalogTestController = null;
  }

  async function renderActivitiesForSpace({ forceRefresh = false } = {}){
    attachCatalogueChangeListener();
    if (!configsList) return;

    const isSuperAdmin = await getIsSuperAdmin?.() === true;
    const currentTeacherSpace = getCurrentTeacherSpace?.();
    currentRenderIsSuperAdmin = isSuperAdmin;

    if (!currentTeacherSpace?.id && !isSuperAdmin) {
      renderConfigHeader({ isSuperAdmin: false });
      configsList.classList.add("dashboard-explorer-host");
      configsList.classList.remove("super-admin-editor-scroll");
      configsList.innerHTML = `<div class="dashboard-activity-empty-state">Crée d’abord ton code de connexion.</div>`;
      return;
    }

    const needsTeacherActivities = Boolean(currentTeacherSpace?.id)
      && (forceRefresh || !cachedTeacherCatalogActivities);
    const needsAdminActivities = isSuperAdmin
      && (forceRefresh || !cachedAdminCatalogActivities);

    if (needsTeacherActivities || needsAdminActivities) {
      configsList.classList.add("dashboard-explorer-host");
      configsList.classList.remove("super-admin-editor-scroll");
      cleanupActiveCatalogTestController();
      configsList.innerHTML = `<div class="dashboard-activity-empty-state">Chargement du catalogue…</div>`;

      const [teacherActivities, adminActivities] = await Promise.all([
        needsTeacherActivities
          ? listCatalogActivitiesForTeacherSpace?.(currentTeacherSpace.id)
          : Promise.resolve(cachedTeacherCatalogActivities || []),
        needsAdminActivities
          ? listCatalogActivitiesForAdmin?.()
          : Promise.resolve(cachedAdminCatalogActivities || [])
      ]);

      if (needsTeacherActivities) cachedTeacherCatalogActivities = teacherActivities || [];
      if (needsAdminActivities) cachedAdminCatalogActivities = adminActivities || [];
    }

    if (!currentTeacherSpace?.id) {
      cachedTeacherCatalogActivities = [];
    }

    const activities = isSuperAdmin
      ? mergeAdminAndTeacherActivities(cachedAdminCatalogActivities || [], cachedTeacherCatalogActivities || [])
      : (cachedTeacherCatalogActivities || []);

    cachedRenderedCatalogActivities = activities;
    syncCurrentOpenFolderWithActivities(activities, { includeAllFolders: isSuperAdmin });
    catalogAdminViewController.setCatalogueState({
      activities: cachedAdminCatalogActivities || [],
      currentFolderId: currentOpenFolderId
    });

    configsList.classList.add("dashboard-explorer-host");
    configsList.classList.remove("super-admin-editor-scroll");
    cleanupActiveCatalogTestController();
    renderConfigHeader({ isSuperAdmin });
    configsList.innerHTML = renderShell(activities, { isSuperAdmin });
    bindEvents({ isSuperAdmin });
  }

  function attachCatalogueChangeListener(){
    if (catalogueChangeListenerAttached) return;
    catalogueChangeListenerAttached = true;
    window.addEventListener("catalogue:changed", () => {
      cachedTeacherCatalogActivities = null;
      cachedAdminCatalogActivities = null;
      cachedRenderedCatalogActivities = null;
      void renderActivitiesForSpace({ forceRefresh: true });
    });
  }

  return {
    renderRightPanel: renderActivitiesForSpace,
    renderActivitiesForSpace,
    buildActivityTreeState: () => ({ folderById: new Map(), folderChildren: new Map(), activityChildren: new Map() }),
    buildVisibleActivityTree: () => ({ visibleNodes: [] }),
    syncCollapsedActivityFolders: () => {},
    toggleFolderExpanded: () => {}
  };
}

function mergeAdminAndTeacherActivities(adminActivities = [], teacherActivities = []){
  const teacherById = new Map(
    (Array.isArray(teacherActivities) ? teacherActivities : [])
      .map((activity) => [String(activity?.id || ""), activity])
      .filter(([id]) => id)
  );
  const adminIds = new Set();
  const merged = (Array.isArray(adminActivities) ? adminActivities : []).map((activity) => {
    const id = String(activity?.id || "");
    adminIds.add(id);
    const teacherActivity = teacherById.get(id) || null;
    const isPublished = String(activity?.status || "draft") === "published";
    return {
      ...activity,
      is_visible: isPublished
        ? (teacherActivity?.is_visible ?? activity?.default_visible !== false)
        : false
    };
  });

  teacherById.forEach((activity, id) => {
    if (!adminIds.has(id)) merged.push(activity);
  });

  return merged.sort(compareByOrderAndName);
}

function compareByOrderAndName(a, b){
  const folderA = getActivityFolderId(a);
  const folderB = getActivityFolderId(b);
  if (folderA !== folderB) {
    return folderA.localeCompare(folderB, "fr", { sensitivity: "base" });
  }
  const orderA = Number(a?.display_order) || 0;
  const orderB = Number(b?.display_order) || 0;
  if (orderA !== orderB) return orderA - orderB;
  return String(a?.name || a?.config_name || a?.title || "").localeCompare(
    String(b?.name || b?.config_name || b?.title || ""),
    "fr",
    { sensitivity: "base" }
  );
}

function getActivityFolderId(activity){
  return String(activity?.folder_id ?? activity?.category_id ?? "").trim();
}
