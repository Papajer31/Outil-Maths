import {
  CATALOG_ROOT_LABEL,
  getPedagogicalNodes
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
  listPedagogicalNodesForTeacher,
  listPedagogicalNodesForAdmin,
  createPedagogicalNodeAsAdmin,
  updatePedagogicalNodeAsAdmin,
  deletePedagogicalNodeAsAdmin,
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
  let folders = getPedagogicalNodes();
  let cachedTeacherCatalogFolders = null;
  let cachedAdminCatalogFolders = null;
  const collapsedFolderIds = new Set();
  const knownFolderIds = new Set();

  const catalogAdminViewController = createCatalogAdminViewController({
    header: configHeader,
    list: configsList,
    getCurrentTeacherSpace,
    listCatalogActivitiesForAdmin,
    saveCatalogActivityAsAdmin,
    deleteCatalogActivityAsAdmin,
    getCatalogActivityUsageAsAdmin,
    listPedagogicalNodesForAdmin,
    createPedagogicalNodeAsAdmin,
    updatePedagogicalNodeAsAdmin,
    deletePedagogicalNodeAsAdmin,
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

  function syncKnownFolders(){
    const folderIds = new Set(folders.map((folder) => String(folder.id || "")).filter(Boolean));
    for (const id of Array.from(collapsedFolderIds)) {
      if (!folderIds.has(id)) collapsedFolderIds.delete(id);
    }
    for (const id of Array.from(knownFolderIds)) {
      if (!folderIds.has(id)) knownFolderIds.delete(id);
    }

    folders.forEach((folder) => {
      const id = String(folder.id || "").trim();
      if (!id || knownFolderIds.has(id)) return;
      knownFolderIds.add(id);
      // À l'ouverture, seuls les dossiers racine sont dépliés : on révèle un
      // unique niveau de sous-dossiers sans encombrer l'arborescence.
      if (String(folder.parent_id || "").trim()) collapsedFolderIds.add(id);
    });
  }

  function openFolder(folderId = null){
    const safeFolderId = String(folderId || "").trim();
    currentOpenFolderId = safeFolderId || null;
    let cursor = safeFolderId ? getFolderById(safeFolderId) : null;
    while (cursor) {
      collapsedFolderIds.delete(String(cursor.id));
      cursor = getFolderById(cursor.parent_id);
    }
  }

  function renderConfigHeader({ isSuperAdmin = false } = {}){
    if (!configHeader) return;
    const breadcrumb = getBreadcrumb();
    const renderRootCrumb = ({ current = false } = {}) => `
      <button class="dashboard-breadcrumb-btn${current ? " is-current" : ""}" type="button" data-action="open-root">Exploration</button>
    `;
    const renderFolderCrumb = (folder, { current = false } = {}) => `
      <button class="dashboard-breadcrumb-btn${current ? " is-current" : ""}" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folder.id)}">
        ${escapeHtml(folder.name)}
      </button>
    `;
    const renderSeparator = () => '<span class="dashboard-breadcrumb-separator" aria-hidden="true">›</span>';
    const breadcrumbHtml = breadcrumb.length > 2
      ? [
          `<details class="dashboard-breadcrumb-overflow">
            <summary class="dashboard-breadcrumb-btn dashboard-breadcrumb-overflow-trigger" aria-label="Afficher le chemin complet" title="Afficher le chemin complet">…</summary>
            <div class="dashboard-breadcrumb-overflow-menu">
              ${renderRootCrumb()}
              ${breadcrumb.map((folder, index) => renderFolderCrumb(folder, { current:index === breadcrumb.length - 1 })).join("")}
            </div>
          </details>`,
          renderSeparator(),
          renderFolderCrumb(breadcrumb[breadcrumb.length - 2]),
          renderSeparator(),
          renderFolderCrumb(breadcrumb[breadcrumb.length - 1], { current:true })
        ].join(" ")
      : [
          renderRootCrumb({ current:!breadcrumb.length }),
          ...breadcrumb.flatMap((folder, index) => [
            renderSeparator(),
            renderFolderCrumb(folder, { current:index === breadcrumb.length - 1 })
          ])
        ].join(" ");

    configHeader.innerHTML = `
      <div class="dashboard-config-header-main">
        <div class="dashboard-section-title">Exploration</div>
      </div>
      <div class="dashboard-config-header-center">
        <nav class="dashboard-breadcrumb" aria-label="Fil d’Ariane d’Exploration">
          ${breadcrumbHtml}
        </nav>
      </div>
      <div class="dashboard-config-header-actions">
        ${isSuperAdmin ? catalogAdminViewController.renderHeaderActions() : ""}
      </div>
    `;

    configHeader.querySelectorAll("[data-action='open-root']").forEach((btn) => {
      btn.addEventListener("click", () => {
        openFolder();
        void renderActivitiesForSpace();
      });
    });

    configHeader.querySelectorAll("[data-action='open-folder']").forEach((btn) => {
      btn.addEventListener("click", () => {
        openFolder(btn.dataset.folderId);
        void renderActivitiesForSpace();
      });
    });

    if (isSuperAdmin) {
      catalogAdminViewController.bindHeaderActions();
    }
  }

  function renderTreeFolder(folder, visibleFolderIds, usefulFolderIds, depth = 0){
    const selected = String(currentOpenFolderId || "") === String(folder.id);
    const isEmptyPath = currentRenderIsSuperAdmin && !usefulFolderIds.has(String(folder.id));
    const childFolders = getVisibleChildFolders(folder.id, visibleFolderIds).sort(compareByOrderAndName);
    const hasChildFolders = childFolders.length > 0;
    const isCollapsed = hasChildFolders && collapsedFolderIds.has(String(folder.id));
    return `
      <div class="dashboard-activity-tree-row dashboard-tree-node ${selected ? "is-selected" : ""} ${isEmptyPath ? "is-catalog-empty-path" : ""}" style="--dashboard-tree-depth:${depth};" ${currentRenderIsSuperAdmin ? catalogAdminViewController.getFolderDropTargetAttributes(folder.id) : ""}>
        <div class="dashboard-tree-indent" aria-hidden="true"></div>
        ${hasChildFolders ? `
          <button
            class="dashboard-folder-toggle-btn dashboard-material-icon-btn"
            type="button"
            data-action="toggle-folder"
            data-folder-id="${escapeAttr(folder.id)}"
            title="${isCollapsed ? "Déplier le dossier" : "Replier le dossier"}"
            aria-label="${isCollapsed ? "Déplier le dossier" : "Replier le dossier"}"
          ><span class="dashboard-material-icon" aria-hidden="true">${isCollapsed ? "chevron_right" : "expand_more"}</span></button>
        ` : '<span class="dashboard-tree-toggle-placeholder" aria-hidden="true"></span>'}
        <button class="dashboard-activity-tree-main" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folder.id)}">
          <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tree-node-label">${escapeHtml(folder.name)}</span>
        </button>
      </div>
      ${isCollapsed ? "" : childFolders.map((child) => renderTreeFolder(child, visibleFolderIds, usefulFolderIds, depth + 1)).join("")}
    `;
  }

  function renderFolderTile(folder, usefulFolderIds){
    const isEmptyPath = currentRenderIsSuperAdmin && !usefulFolderIds.has(String(folder.id));
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--folder dashboard-activity-tile--catalog-folder ${isEmptyPath ? "is-catalog-empty-path" : ""}" ${currentRenderIsSuperAdmin ? catalogAdminViewController.getFolderDropTargetAttributes(folder.id) : ""}>
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
        ${adminEnhancement?.dragHandleHtml || ""}
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

  function renderActivityRow(activity, rank, { isSuperAdmin = false } = {}){
    const isPublished = String(activity?.status || "published") === "published";
    const visible = isPublished && activity?.is_visible !== false;
    const adminEnhancement = isSuperAdmin
      ? catalogAdminViewController.getActivityTileEnhancement(activity)
      : null;
    const rowClasses = [
      "dashboard-activity-row",
      "dashboard-activity-row--catalog",
      visible || !isPublished ? "" : "is-hidden",
      adminEnhancement?.className || ""
    ].filter(Boolean).join(" ");
    const description = String(activity?.description || "").trim();
    const meta = isSuperAdmin
      ? `${escapeHtml(adminEnhancement?.toolLabel || activity?.tool_id || "Outil")} · ${escapeHtml(adminEnhancement?.statusLabel || (isPublished ? "Publié" : "Brouillon"))}`
      : (description ? escapeHtml(description) : "Activité");

    return `
      <article class="${rowClasses}" ${adminEnhancement?.attributes || ""}>
        <span class="dashboard-activity-row-rank" aria-label="Rang ${rank}">${rank}</span>
        ${adminEnhancement?.dragHandleHtml || ""}
        <span class="dashboard-material-icon dashboard-activity-row-icon" aria-hidden="true">extension</span>
        <div class="dashboard-activity-row-main">
          <span class="dashboard-activity-row-title">${escapeHtml(activity?.config_name || activity?.title || "Activité")}</span>
          <span class="dashboard-activity-row-meta">${meta}</span>
        </div>
        <div class="dashboard-activity-row-actions">
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

  function renderActivityTiers(activities, folderId, { isSuperAdmin = false } = {}){
    const rows = [...(Array.isArray(activities) ? activities : [])].sort(compareByOrderAndName);
    const highestOccupiedTier = rows.reduce(
      (max, activity) => Math.max(max, getActivityTier(activity)),
      0
    );
    const renderedTierCount = isSuperAdmin
      ? Math.max(1, highestOccupiedTier + 1)
      : Math.max(1, highestOccupiedTier);
    const panels = [];

    for (let tier = 1; tier <= renderedTierCount; tier += 1) {
      const tierRows = rows
        .filter((activity) => getActivityTier(activity) === tier)
        .sort(compareByOrderAndName);
      if (!isSuperAdmin && !tierRows.length) continue;
      const isNextTier = isSuperAdmin && highestOccupiedTier > 0 && tier === highestOccupiedTier + 1;
      const dropzoneAttributes = isSuperAdmin
        ? catalogAdminViewController.getTierDropzoneAttributes(folderId, tier)
        : "";
      panels.push(`
        <section class="dashboard-activity-tier-panel${tierRows.length ? "" : " is-empty"}${isNextTier ? " is-next-tier" : ""}" ${dropzoneAttributes}>
          <header class="dashboard-activity-tier-header">
            <div class="dashboard-activity-tier-heading">
              <span class="dashboard-activity-tier-title">Palier ${tier}</span>
              ${isNextTier ? '<span class="dashboard-activity-tier-next-label">Prochain palier</span>' : ""}
            </div>
            <span class="dashboard-activity-tier-count">${tierRows.length} activité${tierRows.length > 1 ? "s" : ""}</span>
          </header>
          <div class="dashboard-activity-tier-list">
            ${tierRows.length
              ? tierRows.map((activity, index) => renderActivityRow(activity, index + 1, { isSuperAdmin })).join("")
              : `<div class="dashboard-activity-tier-empty">${isSuperAdmin ? "Dépose une activité ici." : "Aucune activité disponible."}</div>`}
          </div>
        </section>
      `);
    }

    return `
      <div class="dashboard-activity-tiers-wrap">
        <div class="dashboard-activity-tiers">
          ${panels.join("")}
        </div>
      </div>
    `;
  }

  function renderShell(activities, { isSuperAdmin = false } = {}){
    const usefulFolderIds = getFolderIdsLeadingToActivities(activities);
    const visibleFolderIds = isSuperAdmin
      ? getFolderIdsLeadingToActivities(activities, { includeAllFolders: true })
      : usefulFolderIds;
    const selectedFolder = getFolderById(currentOpenFolderId);
    const parentId = selectedFolder ? String(selectedFolder.id) : null;
    const childFolders = getVisibleChildFolders(parentId, visibleFolderIds).sort(compareByOrderAndName);
    const folderLevelLabel = childFolders.length
      ? getFolderNodeTypeLabel(childFolders[0])
      : "";
    const childActivities = (activities || [])
      .filter((activity) => getActivityFolderId(activity) === String(parentId || ""))
      .sort(compareByOrderAndName);
    const rootFolders = getVisibleChildFolders(null, visibleFolderIds).sort(compareByOrderAndName);
    const treeHtml = rootFolders.map((folder) => renderTreeFolder(folder, visibleFolderIds, usefulFolderIds, 0)).join("");
    const isActivityHost = selectedFolder?.node_type === "grade_level";

    let rightPaneHtml = "";
    if (isActivityHost) {
      rightPaneHtml = `
        <div class="dashboard-activity-tiles-pane-header dashboard-activity-tier-pane-header">
          <span class="dashboard-activity-tiles-pane-level">Activités par paliers</span>
        </div>
        ${renderActivityTiers(childActivities, parentId, { isSuperAdmin })}
      `;
    } else {
      const tilesHtml = [
        renderParentTile(selectedFolder),
        ...childFolders.map((folder) => renderFolderTile(folder, usefulFolderIds)),
        ...childActivities.map((activity) => renderActivityTile(activity, { isSuperAdmin }))
      ].filter(Boolean).join("");
      const adminGridClass = isSuperAdmin ? " dashboard-admin-catalogue-grid" : "";
      const adminDropzoneAttributes = isSuperAdmin
        ? catalogAdminViewController.getDropzoneAttributes(parentId)
        : "";
      rightPaneHtml = `
        ${currentRenderIsSuperAdmin && folderLevelLabel ? `
          <div class="dashboard-activity-tiles-pane-header">
            <span class="dashboard-activity-tiles-pane-level">${escapeHtml(folderLevelLabel)}</span>
          </div>
        ` : ""}
        <div class="dashboard-activity-tiles-grid-wrap">
          <div class="dashboard-activity-tiles-grid${adminGridClass}" ${adminDropzoneAttributes}>
            ${tilesHtml || `<div class="dashboard-activity-empty-state">Aucun contenu dans ce nœud.</div>`}
          </div>
        </div>
      `;
    }

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
        openFolder();
        void renderActivitiesForSpace();
      });
    });

    configsList?.querySelectorAll("[data-action='open-folder']").forEach((btn) => {
      btn.addEventListener("click", () => {
        openFolder(btn.dataset.folderId);
        void renderActivitiesForSpace();
      });
    });

    configsList?.querySelectorAll("[data-action='toggle-folder']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const folderId = String(btn.dataset.folderId || "").trim();
        if (!folderId || btn.disabled) return;
        if (collapsedFolderIds.has(folderId)) collapsedFolderIds.delete(folderId);
        else collapsedFolderIds.add(folderId);
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
      showToast?.("Activité d’Exploration introuvable.", { isError: true });
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

    const previousScroll = {
      host: configsList.scrollTop,
      tree: configsList.querySelector(".dashboard-activity-tree-list")?.scrollTop || 0,
      tiles: (configsList.querySelector(".dashboard-activity-tiles-grid-wrap") || configsList.querySelector(".dashboard-activity-tiers-wrap"))?.scrollTop || 0
    };

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
    const needsTeacherFolders = !isSuperAdmin && (forceRefresh || !cachedTeacherCatalogFolders);
    const needsAdminFolders = isSuperAdmin && (forceRefresh || !cachedAdminCatalogFolders);

    if (needsTeacherActivities || needsAdminActivities || needsTeacherFolders || needsAdminFolders) {
      configsList.classList.add("dashboard-explorer-host");
      configsList.classList.remove("super-admin-editor-scroll");
      cleanupActiveCatalogTestController();
      configsList.innerHTML = `<div class="dashboard-activity-empty-state">Chargement d’Exploration…</div>`;

      const [teacherActivities, adminActivities, teacherFolders, adminFolders] = await Promise.all([
        needsTeacherActivities
          ? listCatalogActivitiesForTeacherSpace?.(currentTeacherSpace.id)
          : Promise.resolve(cachedTeacherCatalogActivities || []),
        needsAdminActivities
          ? listCatalogActivitiesForAdmin?.()
          : Promise.resolve(cachedAdminCatalogActivities || []),
        needsTeacherFolders
          ? listPedagogicalNodesForTeacher?.()
          : Promise.resolve(cachedTeacherCatalogFolders || []),
        needsAdminFolders
          ? listPedagogicalNodesForAdmin?.()
          : Promise.resolve(cachedAdminCatalogFolders || [])
      ]);

      if (needsTeacherActivities) cachedTeacherCatalogActivities = teacherActivities || [];
      if (needsAdminActivities) cachedAdminCatalogActivities = adminActivities || [];
      if (needsTeacherFolders) cachedTeacherCatalogFolders = teacherFolders || [];
      if (needsAdminFolders) cachedAdminCatalogFolders = adminFolders || [];
    }

    if (!currentTeacherSpace?.id) {
      cachedTeacherCatalogActivities = [];
    }

    folders = isSuperAdmin
      ? (cachedAdminCatalogFolders || getPedagogicalNodes())
      : (cachedTeacherCatalogFolders || getPedagogicalNodes());
    syncKnownFolders();

    const activities = isSuperAdmin
      ? mergeAdminAndTeacherActivities(cachedAdminCatalogActivities || [], cachedTeacherCatalogActivities || [])
      : (cachedTeacherCatalogActivities || []);

    cachedRenderedCatalogActivities = activities;
    syncCurrentOpenFolderWithActivities(activities, { includeAllFolders: isSuperAdmin });
    catalogAdminViewController.setCatalogueState({
      activities: cachedAdminCatalogActivities || [],
      folders,
      currentFolderId: currentOpenFolderId
    });

    configsList.classList.add("dashboard-explorer-host");
    configsList.classList.remove("super-admin-editor-scroll");
    cleanupActiveCatalogTestController();
    renderConfigHeader({ isSuperAdmin });
    configsList.innerHTML = renderShell(activities, { isSuperAdmin });
    bindEvents({ isSuperAdmin });
    requestAnimationFrame(() => {
      if (!configsList?.isConnected) return;
      configsList.scrollTop = previousScroll.host;
      const tree = configsList.querySelector(".dashboard-activity-tree-list");
      const tiles = configsList.querySelector(".dashboard-activity-tiles-grid-wrap") || configsList.querySelector(".dashboard-activity-tiers-wrap");
      if (tree) tree.scrollTop = previousScroll.tree;
      if (tiles) tiles.scrollTop = previousScroll.tiles;
    });
  }

  function attachCatalogueChangeListener(){
    if (catalogueChangeListenerAttached) return;
    catalogueChangeListenerAttached = true;
    window.addEventListener("catalogue:changed", () => {
      cachedTeacherCatalogActivities = null;
      cachedAdminCatalogActivities = null;
      cachedRenderedCatalogActivities = null;
      cachedTeacherCatalogFolders = null;
      cachedAdminCatalogFolders = null;
      void renderActivitiesForSpace({ forceRefresh: true });
    });
  }

  function getFolderNodeTypeLabel(folder = {}){
    const typeLabels = {
      discipline: "Discipline",
      domain: "Domaine",
      theme: "Thème",
      learning_objective: "Objectif d’apprentissage",
      grade_level: "Dossier de niveau"
    };
    return typeLabels[folder?.node_type] || "Dossier";
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
  const tierA = getActivityTier(a);
  const tierB = getActivityTier(b);
  if (tierA !== tierB) return tierA - tierB;
  const orderA = Number(a?.display_order) || 0;
  const orderB = Number(b?.display_order) || 0;
  if (orderA !== orderB) return orderA - orderB;
  return String(a?.name || a?.config_name || a?.title || "").localeCompare(
    String(b?.name || b?.config_name || b?.title || ""),
    "fr",
    { sensitivity: "base" }
  );
}

function getActivityTier(activity){
  const tier = Math.trunc(Number(activity?.adventure_tier));
  return Number.isFinite(tier) && tier >= 1 ? tier : 1;
}

function getActivityFolderId(activity){
  return String(activity?.folder_id ?? activity?.pedagogical_node_id ?? "").trim();
}
