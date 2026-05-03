import { getToolRootLabel } from "../../../shared/tool-root-runtime.js";
import {
  ACTIVITY_MODE_VALUES,
  DEFAULT_ACTIVITY_MODE,
  getActivityModeLabel,
  isProjectionActivityMode,
  isStudentFacingActivityMode,
  normalizeActivityMode
} from "../../../shared/activity-modes.js";
import { normalizeAccessCode } from "../../../shared/api-common.js";
import {
  ACTIVITY_SHARE_DISABLED_TITLE,
  isActivityShareable
} from "../activity-share.js";
import {
  buildActivityTreeState as buildDashboardActivityTreeState,
  buildVisibleActivityTree as buildDashboardVisibleActivityTree,
  normalizeTreeId
} from "./activity-tree.js";
import {
  escapeAttr,
  escapeHtml
} from "./text-utils.js";

export function createActivitiesViewController({
  configHeader,
  configsList,
  closeDashboardSharePopup,
  getCurrentTeacherSpace,
  getCachedActivities,
  setCachedActivities,
  getCachedActivityFolders,
  setCachedActivityFolders,
  getCollapsedActivityFolderIds,
  getKnownActivityFolderIds,
  getCurrentActivityModeFilter,
  setCurrentActivityModeFilter,
  getActivityById,
  getMyActivitiesForSpace,
  getMyActivityFoldersForSpace,
  saveActivityConfig,
  updateActivityDashboardMeta,
  setHighlightedActivityForTeacherSpace,
  openRenameFolderOverlay,
  openRenameActivityOverlay,
  openDeleteFolderOverlay,
  openDeleteActivityModal,
  openCreateVersionOverlay,
  toggleDashboardSharePopup,
  openEmbeddedConfigEditor,
  showDashboardShareToast,
  openCreateFolderOverlay,
  getNextActivityOrderForFolder,
  buildDuplicateActivityName,
  buildClonedActivityConfigJson,
  handleActivityDragStart,
  handleActivityDragEnd
} = {}){
  let currentOpenFolderId = null;
  let treePaneWidthPercent = 14;

  function getActivitiesForCurrentMode(
    activities = getCachedActivities(),
    mode = getCurrentActivityModeFilter()
  ){
    const safeMode = normalizeActivityMode(mode, DEFAULT_ACTIVITY_MODE);
    return (activities || []).filter((activity) => (
      normalizeActivityMode(activity?.activity_mode, DEFAULT_ACTIVITY_MODE) === safeMode
    ));
  }

  function syncCollapsedActivityFolders(){
    const cachedActivityFolders = getCachedActivityFolders();
    const collapsedActivityFolderIds = getCollapsedActivityFolderIds();
    const knownActivityFolderIds = getKnownActivityFolderIds();
    const ids = new Set((cachedActivityFolders || []).map((folder) => String(folder.id)));

    for (const folderId of Array.from(collapsedActivityFolderIds)) {
      if (!ids.has(folderId)) {
        collapsedActivityFolderIds.delete(folderId);
      }
    }

    for (const folderId of Array.from(knownActivityFolderIds)) {
      if (!ids.has(folderId)) {
        knownActivityFolderIds.delete(folderId);
      }
    }

    ids.forEach((folderId) => {
      if (!knownActivityFolderIds.has(folderId)) {
        knownActivityFolderIds.add(folderId);
        collapsedActivityFolderIds.add(folderId);
      }
    });
  }

  function buildActivityTreeState({
    activitiesSource = getCachedActivities(),
    foldersSource = getCachedActivityFolders()
  } = {}){
    return buildDashboardActivityTreeState({ activitiesSource, foldersSource });
  }

  function buildVisibleActivityTree(){
    return buildDashboardVisibleActivityTree({
      activitiesSource: getActivitiesForCurrentMode(),
      foldersSource: getCachedActivityFolders(),
      collapsedFolderIds: getCollapsedActivityFolderIds(),
      currentActivityMode: getCurrentActivityModeFilter()
    });
  }

  function openProjectedSessionPopup({ accessCode, configName }){
    const cleanAccessCode = normalizeAccessCode(accessCode);
    const cleanConfigName = String(configName || "").trim();

    if (!cleanAccessCode || !cleanConfigName) return null;

    const hashParams = new URLSearchParams();
    hashParams.set("projected", "1");
    hashParams.set("classCode", cleanAccessCode);
    hashParams.set("configName", cleanConfigName);

    const popupUrl = `../index.html#/sessionstart?${hashParams.toString()}`;
    const popupFeatures = [
      "popup=yes",
      "width=1400",
      "height=900",
      "menubar=no",
      "toolbar=no",
      "location=no",
      "status=no",
      "resizable=yes",
      "scrollbars=yes"
    ].join(",");

    const popup = window.open(popupUrl, "projectedTeacherSession", popupFeatures);

    if (!popup) {
      alert("La fenêtre de projection a été bloquée par le navigateur.");
      return null;
    }

    try {
      popup.focus();
    } catch {}

    return popup;
  }

  function sanitizeCurrentFolderSelection(treeState){
    const safeCurrentFolderId = normalizeTreeId(currentOpenFolderId);
    if (!safeCurrentFolderId) {
      currentOpenFolderId = null;
      return;
    }

    if (!treeState?.folderById?.has(safeCurrentFolderId)) {
      currentOpenFolderId = null;
    }
  }

  function getSelectedFolder(treeState){
    const safeCurrentFolderId = normalizeTreeId(currentOpenFolderId);
    if (!safeCurrentFolderId) return null;
    return treeState?.folderById?.get(safeCurrentFolderId) || null;
  }

  function getFolderBreadcrumb(treeState, folderId = currentOpenFolderId){
    const safeFolderId = normalizeTreeId(folderId);
    if (!safeFolderId || !treeState?.folderById?.has(safeFolderId)) return [];

    const path = [];
    let cursor = treeState.folderById.get(safeFolderId) || null;

    while (cursor) {
      path.unshift(cursor);
      const parentId = normalizeTreeId(cursor.parent_id);
      cursor = parentId ? (treeState.folderById.get(parentId) || null) : null;
    }

    return path;
  }

  function expandFolderPath(folderId){
    const collapsedActivityFolderIds = getCollapsedActivityFolderIds();
    const treeState = buildActivityTreeState();
    const safeFolderId = normalizeTreeId(folderId);
    if (!safeFolderId || !treeState.folderById.has(safeFolderId)) return;

    let cursor = treeState.folderById.get(safeFolderId) || null;
    while (cursor) {
      collapsedActivityFolderIds.delete(String(cursor.id));
      const parentId = normalizeTreeId(cursor.parent_id);
      cursor = parentId ? (treeState.folderById.get(parentId) || null) : null;
    }
  }

  function openFolder(folderId = null, { expandPath = true } = {}){
    const safeFolderId = normalizeTreeId(folderId);
    currentOpenFolderId = safeFolderId;
    if (safeFolderId && expandPath) {
      expandFolderPath(safeFolderId);
    }
    void renderActivitiesForSpace();
  }

  function getCurrentFolderContents(treeState){
    const selectedFolder = getSelectedFolder(treeState);
    const parentId = selectedFolder ? String(selectedFolder.id) : null;
    const childFolders = treeState.folderChildren.get(parentId) || [];
    const childActivities = treeState.activityChildren.get(parentId) || [];

    return {
      selectedFolder,
      childFolders,
      childActivities
    };
  }

  function renderConfigHeader(treeState){
    if (!configHeader) return;

    const currentModeLabel = getActivityModeLabel(getCurrentActivityModeFilter());
    const breadcrumb = getFolderBreadcrumb(treeState);
    const breadcrumbHtml = [
      `<button class="dashboard-breadcrumb-btn${breadcrumb.length === 0 ? " is-current" : ""}" type="button" data-action="open-root">Activités</button>`,
      ...breadcrumb.map((folder, index) => {
        const isCurrent = index === breadcrumb.length - 1;
        return `
          <span class="dashboard-breadcrumb-separator" aria-hidden="true">/</span>
          <button
            class="dashboard-breadcrumb-btn${isCurrent ? " is-current" : ""}"
            type="button"
            data-action="open-folder"
            data-folder-id="${escapeAttr(folder.id)}"
          >
            ${escapeHtml(folder.name || "")}
          </button>
        `;
      })
    ].join("");

    configHeader.innerHTML = `
      <div class="dashboard-config-header-main">
        <div class="dashboard-section-title">Activités</div>

        <div class="dashboard-mode-pill" role="tablist" aria-label="Mode d’activité courant">
          ${ACTIVITY_MODE_VALUES.map((value) => {
            const optionLabel = getActivityModeLabel(value);
            const isActive = value === getCurrentActivityModeFilter();
            return `
              <button
                class="dashboard-mode-pill-btn${isActive ? " is-active" : ""}"
                type="button"
                role="tab"
                data-activity-mode="${escapeAttr(value)}"
                aria-selected="${isActive ? "true" : "false"}"
                title="Afficher les activités ${escapeAttr(optionLabel.toLowerCase())}"
              >
                ${escapeHtml(optionLabel)}
              </button>
            `;
          }).join("")}
        </div>
      </div>

      <div class="dashboard-config-header-center">
        <nav class="dashboard-breadcrumb" aria-label="Fil d’Ariane des activités">
          ${breadcrumbHtml}
        </nav>
      </div>

      <div class="dashboard-config-header-actions">
        <button
          class="dashboard-icon-btn dashboard-material-icon-btn"
          id="btnNewFolder"
          type="button"
          title="Créer un dossier"
          aria-label="Créer un dossier"
        >
          <span class="dashboard-material-icon" aria-hidden="true">create_new_folder</span>
        </button>

        <button class="btn primary" id="btnNewConfig" type="button" title="Créer une activité ${escapeAttr(currentModeLabel.toLowerCase())}">
          Créer une activité
        </button>
      </div>
    `;

    configHeader.querySelectorAll("[data-activity-mode]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const nextMode = normalizeActivityMode(btn.dataset.activityMode, DEFAULT_ACTIVITY_MODE);
        if (nextMode === getCurrentActivityModeFilter()) return;
        setCurrentActivityModeFilter(nextMode);
        closeDashboardSharePopup?.();
        await renderRightPanel({ forceRefresh: false });
      });
    });

    configHeader.querySelectorAll("[data-action='open-root']").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentOpenFolderId = null;
        void renderActivitiesForSpace();
      });
    });

    configHeader.querySelectorAll(".dashboard-breadcrumb [data-action='open-folder']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const folderId = normalizeTreeId(btn.dataset.folderId);
        currentOpenFolderId = folderId;
        expandFolderPath(folderId);
        void renderActivitiesForSpace();
      });
    });

    document.getElementById("btnNewConfig")?.addEventListener("click", () => {
      const currentTeacherSpace = getCurrentTeacherSpace();
      if (!currentTeacherSpace?.access_code) return;

      void openEmbeddedConfigEditor({
        accessCode: currentTeacherSpace.access_code,
        activityMode: getCurrentActivityModeFilter(),
        folderId: currentOpenFolderId
      });
    });

    document.getElementById("btnNewFolder")?.addEventListener("click", () => {
      if (!getCurrentTeacherSpace()?.id) return;
      openCreateFolderOverlay?.(currentOpenFolderId);
    });
  }

  async function renderRightPanel({ forceRefresh = false } = {}){
    await renderActivitiesForSpace({ forceRefresh });
  }

  function renderTreeFolderNode(node){
    const folder = node.item;
    const folderId = String(folder.id);
    const chevronIcon = node.isCollapsed ? "chevron_right" : "expand_more";
    const isSelected = normalizeTreeId(currentOpenFolderId) === folderId;

    return `
      <div
        class="dashboard-activity-tree-row dashboard-tree-node ${isSelected ? "is-selected" : ""}"
        data-node-type="folder"
        data-node-id="${escapeAttr(folderId)}"
        data-parent-id="${escapeAttr(node.parentId || "")}"
        data-tree-path="${escapeAttr(node.treePath)}"
        style="--dashboard-tree-depth:${Math.max(0, Number(node.depth) || 0)};"
        draggable="true"
      >
        <div class="dashboard-tree-indent" aria-hidden="true"></div>

        <button
          class="dashboard-folder-toggle-btn dashboard-material-icon-btn"
          type="button"
          data-action="toggle-folder"
          data-folder-id="${escapeAttr(folderId)}"
          title="${node.isCollapsed ? "Déplier le dossier" : "Replier le dossier"}"
          aria-label="${node.isCollapsed ? "Déplier le dossier" : "Replier le dossier"}"
          draggable="false"
        >
          <span class="dashboard-material-icon" aria-hidden="true">${chevronIcon}</span>
        </button>

        <button
          class="dashboard-activity-tree-main"
          type="button"
          data-action="open-folder"
          data-folder-id="${escapeAttr(folderId)}"
          draggable="false"
        >
          <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tree-node-label">${escapeHtml(folder.name || "")}</span>
        </button>
      </div>
    `;
  }

  function renderTreeActivityNode(node){
    const cfg = node.item;
    const activityId = String(cfg.id || "");

    return `
      <div
        class="dashboard-activity-tree-row dashboard-tree-node dashboard-activity-tree-row--activity"
        data-node-type="activity"
        data-node-id="${escapeAttr(activityId)}"
        data-parent-id="${escapeAttr(node.parentId || "")}"
        data-tree-path="${escapeAttr(node.treePath)}"
        style="--dashboard-tree-depth:${Math.max(0, Number(node.depth) || 0)};"
        draggable="true"
      >
        <div class="dashboard-tree-indent" aria-hidden="true"></div>
        <span class="dashboard-tree-toggle-placeholder" aria-hidden="true"></span>

        <button
          class="dashboard-activity-tree-main"
          type="button"
          data-action="open"
          data-config-name="${escapeAttr(cfg.config_name)}"
          draggable="false"
        >
          <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">description</span>
          <span class="dashboard-activity-tree-node-label">${escapeHtml(cfg.config_name)}</span>
        </button>
      </div>
    `;
  }

  function renderActivityTreeNode(node){
    if (node.type === "folder") return renderTreeFolderNode(node);
    if (node.type === "activity") return renderTreeActivityNode(node);
    return "";
  }

  function renderExplorerFolderTile(folder){
    return `
      <article
        class="dashboard-activity-tile dashboard-activity-tile--folder"
        data-node-type="folder"
        data-node-id="${escapeAttr(folder.id)}"
        draggable="true"
      >
        <button
          class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder"
          type="button"
          data-action="open-folder"
          data-folder-id="${escapeAttr(folder.id)}"
        >
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tile-title">${escapeHtml(folder.name || "")}</span>
        </button>

        <div class="dashboard-activity-tile-corner-actions dashboard-activity-tile-corner-actions--stacked">
          <button
            class="dashboard-icon-btn dashboard-material-icon-btn"
            type="button"
            data-action="rename-folder"
            data-folder-id="${escapeAttr(folder.id)}"
            title="Renommer le dossier"
            aria-label="Renommer le dossier"
          >
            <span class="dashboard-material-icon" aria-hidden="true">edit</span>
          </button>

          <button
            class="dashboard-icon-btn dashboard-material-icon-btn is-danger"
            type="button"
            data-action="delete-folder"
            data-folder-id="${escapeAttr(folder.id)}"
            title="Supprimer le dossier"
            aria-label="Supprimer le dossier"
          >
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>
        </div>
      </article>
    `;
  }

  function renderExplorerParentTile(selectedFolder){
  if (!selectedFolder) return "";

  const parentId = normalizeTreeId(selectedFolder.parent_id);

  return `
    <article class="dashboard-activity-tile dashboard-activity-tile--folder dashboard-activity-tile--parent">
      <button
        class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder"
        type="button"
        data-action="${parentId ? "open-folder" : "open-root"}"
        ${parentId ? `data-folder-id="${escapeAttr(parentId)}"` : ""}
      >
        <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">arrow_upward</span>
        <span class="dashboard-activity-tile-title">Dossier parent</span>
      </button>
    </article>
  `;
}

  function renderExplorerActivityTile(cfg){
    const currentTeacherSpace = getCurrentTeacherSpace();
    const activityId = String(cfg.id || "");
    const activityMode = normalizeActivityMode(cfg.activity_mode, DEFAULT_ACTIVITY_MODE);
    const canProject = isProjectionActivityMode(activityMode);
    const canToggleStudentVisibility = isStudentFacingActivityMode(activityMode);
    const canShare = isActivityShareable({
      accessCode: currentTeacherSpace?.access_code,
      configName: cfg.config_name
    });
    const visibilityIcon = cfg.is_visible === false ? "visibility_off" : "visibility";
    const visibilityLabel = cfg.is_visible === false ? "Afficher dans la vue élève" : "Masquer dans la vue élève";
    const highlightIcon = cfg.is_highlighted ? "rocket_launch" : "rocket";
    const highlightLabel = cfg.is_highlighted ? "Retirer la mise en avant" : "Mettre en avant dans la vue élève";
    const shareTitle = canShare
      ? isProjectionActivityMode(activityMode)
        ? "Partager l’activité Projection"
        : "Partager l’activité"
      : ACTIVITY_SHARE_DISABLED_TITLE;

    return `
      <article
        class="dashboard-activity-tile dashboard-activity-tile--activity ${canToggleStudentVisibility && cfg.is_highlighted ? "is-highlighted" : ""} ${canToggleStudentVisibility && cfg.is_visible === false ? "is-hidden" : ""}"
        data-node-type="activity"
        data-node-id="${escapeAttr(activityId)}"
        draggable="true"
      >
        <button
          class="dashboard-activity-tile-surface dashboard-activity-tile-surface--activity"
          type="button"
          data-action="open"
          data-config-name="${escapeAttr(cfg.config_name)}"
        >
          <span class="dashboard-activity-tile-topline">
            <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">description</span>
            <span class="dashboard-activity-tile-subtitle">${escapeHtml(getToolRootLabel(cfg.module_key || ""))}</span>
          </span>
          <span class="dashboard-activity-tile-title">${escapeHtml(cfg.config_name)}</span>
        </button>

        <div class="dashboard-activity-tile-actions dashboard-activity-tile-actions--activity">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="rename-activity" data-activity-id="${escapeAttr(activityId)}" title="Renommer l’activité" aria-label="Renommer l’activité">
            <span class="dashboard-material-icon" aria-hidden="true">edit</span>
          </button>

          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete" data-activity-id="${escapeAttr(activityId)}" data-config-name="${escapeAttr(cfg.config_name)}" title="Supprimer l’activité" aria-label="Supprimer l’activité">
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>

          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="duplicate" data-activity-id="${escapeAttr(activityId)}" title="Dupliquer l’activité" aria-label="Dupliquer l’activité">
            <span class="dashboard-material-icon" aria-hidden="true">content_copy</span>
          </button>

          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="create-version" data-activity-id="${escapeAttr(activityId)}" title="Créer une version dans un autre mode" aria-label="Créer une version dans un autre mode">
            <span class="dashboard-material-icon" aria-hidden="true">difference</span>
          </button>

          <button class="dashboard-icon-btn dashboard-material-icon-btn dashboard-share-btn" type="button" data-action="share" data-config-name="${escapeAttr(cfg.config_name)}" title="${escapeAttr(shareTitle)}" aria-label="${escapeAttr(shareTitle)}" aria-haspopup="menu" aria-expanded="false"${canShare ? "" : " disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">share</span>
          </button>

          ${canProject ? `
            <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="project" data-config-name="${escapeAttr(cfg.config_name)}" title="Projeter l’activité" aria-label="Projeter l’activité">
              <span class="dashboard-material-icon" aria-hidden="true">slideshow</span>
            </button>
          ` : ""}

          ${canToggleStudentVisibility ? `
            <button class="dashboard-icon-btn dashboard-material-icon-btn ${cfg.is_visible === false ? "is-muted" : ""}" type="button" data-action="toggle-visible" data-activity-id="${escapeAttr(activityId)}" title="${escapeAttr(visibilityLabel)}" aria-label="${escapeAttr(visibilityLabel)}">
              <span class="dashboard-material-icon" aria-hidden="true">${visibilityIcon}</span>
            </button>
          ` : ""}

          ${canToggleStudentVisibility ? `
            <button class="dashboard-icon-btn dashboard-material-icon-btn ${cfg.is_highlighted ? "is-accent" : ""}" type="button" data-action="toggle-highlight" data-activity-id="${escapeAttr(activityId)}" title="${escapeAttr(highlightLabel)}" aria-label="${escapeAttr(highlightLabel)}">
              <span class="dashboard-material-icon" aria-hidden="true">${highlightIcon}</span>
            </button>
          ` : ""}
        </div>
      </article>
    `;
  }

  function renderEmptyTilesState(){
    const selectedFolder = buildActivityTreeState({
      activitiesSource: getActivitiesForCurrentMode(),
      foldersSource: getCachedActivityFolders()
    }).folderById.get(normalizeTreeId(currentOpenFolderId));
    const modeLabel = getActivityModeLabel(getCurrentActivityModeFilter()).toLowerCase();
    const contextLabel = selectedFolder ? `dans « ${selectedFolder.name} »` : "à la racine";

    return `
      <div class="dashboard-activity-empty-state">
        Aucune activité en mode ${escapeHtml(modeLabel)} ${escapeHtml(contextLabel)}.
      </div>
    `;
  }

  function renderExplorerShell(treeState, visibleNodes){
    const { childFolders, childActivities, selectedFolder } = getCurrentFolderContents(treeState);
    const treeHtml = visibleNodes
      .filter((node) => node.type === "folder")
      .map(renderTreeFolderNode)
      .join("");

    const tilesHtml = [
      renderExplorerParentTile(selectedFolder),
      ...childFolders.map(renderExplorerFolderTile),
      ...childActivities.map(renderExplorerActivityTile)
    ].filter(Boolean).join("");

    return `
      <div class="dashboard-activities-explorer" style="--dashboard-tree-pane-width:${treePaneWidthPercent}%;">
        <aside class="dashboard-activity-tree-pane panel">
          <div class="dashboard-activity-tree-list">
            <div class="dashboard-activity-tree-row dashboard-activity-tree-root ${normalizeTreeId(currentOpenFolderId) ? "" : "is-selected"}">
              <button class="dashboard-activity-tree-main dashboard-activity-tree-main--root" type="button" data-action="open-root">
                <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">home</span>
                <span class="dashboard-activity-tree-node-label">Activités</span>
              </button>
            </div>
            ${treeHtml || '<div class="dashboard-activity-tree-empty">Aucun dossier pour le moment.</div>'}
          </div>
        </aside>

        <div class="dashboard-activity-splitter" role="separator" aria-orientation="vertical" aria-label="Séparateur entre les panneaux"></div>

        <section class="dashboard-activity-tiles-pane panel">
          <div class="dashboard-activity-tiles-grid-wrap">
            <div class="dashboard-activity-tiles-grid">
              ${tilesHtml || renderEmptyTilesState()}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  async function duplicateActivityFromTile(activityId){
    const sourceActivity = getActivityById(activityId);
    const currentTeacherSpace = getCurrentTeacherSpace();
    const cachedActivities = getCachedActivities();
    if (!sourceActivity || !currentTeacherSpace?.access_code || !currentTeacherSpace?.id) return;

    const nextName = buildDuplicateActivityName(sourceActivity.config_name, cachedActivities);
    const nextDisplayOrder = getNextActivityOrderForFolder(sourceActivity.folder_id);
    const clonedConfigJson = buildClonedActivityConfigJson(sourceActivity, {
      targetMode: sourceActivity.activity_mode,
      nextDisplayOrder,
      preserveVisibilityFlag: true,
      preserveHighlightFlag: false
    });

    try {
      await saveActivityConfig({
        accessCode: currentTeacherSpace.access_code,
        moduleKey: sourceActivity.module_key,
        configName: nextName,
        configJson: clonedConfigJson
      });

      setCachedActivities(await getMyActivitiesForSpace(currentTeacherSpace.id));
      setCurrentActivityModeFilter(normalizeActivityMode(sourceActivity.activity_mode, DEFAULT_ACTIVITY_MODE));
      await renderRightPanel({ forceRefresh: false });
      showDashboardShareToast(`Copie créée : ${nextName}`);
    } catch (err) {
      alert(err?.message || "Impossible de dupliquer l’activité.");
    }
  }

  function bindActivityTreeEvents(){
    configsList?.querySelectorAll("[data-action='toggle-folder']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        toggleFolderExpanded(btn.dataset.folderId);
      });
    });

    configsList?.querySelectorAll("[data-action='open-root']").forEach((btn) => {
      btn.addEventListener("click", () => {
        currentOpenFolderId = null;
        void renderActivitiesForSpace();
      });
    });

    configsList?.querySelectorAll("[data-action='open-folder']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const folderId = normalizeTreeId(btn.dataset.folderId);
        currentOpenFolderId = folderId;
        expandFolderPath(folderId);
        void renderActivitiesForSpace();
      });
    });

    configsList?.querySelectorAll("[data-action='rename-folder']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        void openRenameFolderOverlay(btn.dataset.folderId);
      });
    });

    configsList?.querySelectorAll("[data-action='rename-activity']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        void openRenameActivityOverlay(btn.dataset.activityId);
      });
    });

    configsList?.querySelectorAll("[data-action='delete-folder']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        void openDeleteFolderOverlay(btn.dataset.folderId);
      });
    });

    configsList?.querySelectorAll("[data-action='open']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const currentTeacherSpace = getCurrentTeacherSpace();
        const configName = btn.dataset.configName ?? "";
        if (!configName || !currentTeacherSpace?.access_code) return;

        void openEmbeddedConfigEditor({
          accessCode: currentTeacherSpace.access_code,
          configName
        });
      });
    });

    configsList?.querySelectorAll("[data-action='project']").forEach((btn) => {
      btn.addEventListener("click", () => {
        const currentTeacherSpace = getCurrentTeacherSpace();
        const configName = btn.dataset.configName ?? "";
        if (!configName || !currentTeacherSpace?.access_code) return;

        const popup = openProjectedSessionPopup({
          accessCode: currentTeacherSpace.access_code,
          configName
        });

        void openEmbeddedConfigEditor({
          accessCode: currentTeacherSpace.access_code,
          configName,
          projected: !!popup
        });
      });
    });

    configsList?.querySelectorAll("[data-action='share']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (btn.disabled) return;
        toggleDashboardSharePopup(btn);
      });
    });

    configsList?.querySelectorAll("[data-action='delete']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const activityId = String(btn.dataset.activityId || "");
        const activity = activityId ? getActivityById(activityId) : null;
        if (!activity) return;
        openDeleteActivityModal(activity);
      });
    });

    configsList?.querySelectorAll("[data-action='duplicate']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const activityId = String(btn.dataset.activityId || "");
        if (!activityId) return;
        void duplicateActivityFromTile(activityId);
      });
    });

    configsList?.querySelectorAll("[data-action='create-version']").forEach((btn) => {
      btn.addEventListener("click", (event) => {
        event.stopPropagation();
        const activityId = String(btn.dataset.activityId || "");
        if (!activityId) return;
        void openCreateVersionOverlay(activityId);
      });
    });

    configsList?.querySelectorAll("[data-action='toggle-visible']").forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const activityId = String(btn.dataset.activityId || "");
        const cachedActivities = getCachedActivities();
        const activity = cachedActivities?.find((item) => String(item.id) === activityId);
        if (!activity) return;

        const previousActivities = cachedActivities ? [...cachedActivities] : [];
        setCachedActivities(previousActivities.map((item) => (
          String(item.id) === activityId
            ? {
                ...item,
                is_visible: item.is_visible === false,
                is_highlighted: item.is_visible === false ? item.is_highlighted : false
              }
            : item
        )));
        await renderActivitiesForSpace();

        try {
          const updated = await updateActivityDashboardMeta(activityId, { is_visible: activity.is_visible === false });
          setCachedActivities((getCachedActivities() || []).map((item) => (
            String(item.id) === activityId ? { ...item, ...updated } : item
          )));
          await renderActivitiesForSpace();
        } catch (err) {
          setCachedActivities(previousActivities);
          await renderActivitiesForSpace();
          alert(err?.message || "Impossible de modifier la visibilité.");
        }
      });
    });

    configsList?.querySelectorAll("[data-action='toggle-highlight']").forEach((btn) => {
      btn.addEventListener("click", async (event) => {
        event.stopPropagation();
        const currentTeacherSpace = getCurrentTeacherSpace();
        const activityId = String(btn.dataset.activityId || "");
        if (!activityId || !currentTeacherSpace?.id) return;

        const cachedActivities = getCachedActivities();
        const activity = cachedActivities?.find((item) => String(item.id) === activityId);
        if (!activity) return;

        const nextHighlightedId = activity.is_highlighted ? null : activityId;
        const activityMode = normalizeActivityMode(activity.activity_mode, DEFAULT_ACTIVITY_MODE);
        const previousActivities = cachedActivities ? [...cachedActivities] : [];
        setCachedActivities(previousActivities.map((item) => ({
          ...item,
          is_highlighted: normalizeActivityMode(item.activity_mode, DEFAULT_ACTIVITY_MODE) === activityMode
            ? (nextHighlightedId !== null && String(item.id) === nextHighlightedId)
            : item.is_highlighted
        })));
        await renderActivitiesForSpace();

        try {
          await setHighlightedActivityForTeacherSpace(currentTeacherSpace.id, nextHighlightedId, activityMode);
          setCachedActivities(await getMyActivitiesForSpace(currentTeacherSpace.id));
          await renderActivitiesForSpace();
        } catch (err) {
          setCachedActivities(previousActivities);
          await renderActivitiesForSpace();
          alert(err?.message || "Impossible de modifier la mise en avant.");
        }
      });
    });

    configsList?.querySelectorAll(".dashboard-tree-node[data-node-type][data-node-id], .dashboard-activity-tile[data-node-type][data-node-id]").forEach((card) => {
      card.addEventListener("dragstart", handleActivityDragStart);
      card.addEventListener("dragend", handleActivityDragEnd);
    });
  }

  async function renderActivitiesForSpace({ forceRefresh = false } = {}){
    if (!configsList) return;
    closeDashboardSharePopup();

    const currentTeacherSpace = getCurrentTeacherSpace();
    let cachedActivities = getCachedActivities();
    let cachedActivityFolders = getCachedActivityFolders();

    if (!currentTeacherSpace?.id){
      renderConfigHeader(buildActivityTreeState({ activitiesSource: [], foldersSource: [] }));
      configsList.classList.add("dashboard-explorer-host");
      configsList.innerHTML = `<div class="dashboard-activity-empty-state">Crée d’abord ton code de connexion.</div>`;
      return;
    }

    const hasExistingNodes = Boolean(configsList.querySelector(".dashboard-tree-node"));

    if ((!cachedActivities || !cachedActivityFolders) && !hasExistingNodes){
      configsList.classList.add("dashboard-explorer-host");
      configsList.innerHTML = `<div class="dashboard-activity-empty-state">Chargement…</div>`;
    }

    try {
      if (forceRefresh || !cachedActivities || !cachedActivityFolders) {
        const [activities, folders] = await Promise.all([
          getMyActivitiesForSpace(currentTeacherSpace.id),
          getMyActivityFoldersForSpace(currentTeacherSpace.id)
        ]);

        cachedActivities = Array.isArray(activities) ? [...activities] : [];
        cachedActivityFolders = Array.isArray(folders) ? [...folders] : [];
        setCachedActivities(cachedActivities);
        setCachedActivityFolders(cachedActivityFolders);
        syncCollapsedActivityFolders();
      }

      const modeActivities = getActivitiesForCurrentMode(cachedActivities, getCurrentActivityModeFilter());
      const treeState = buildActivityTreeState({
        activitiesSource: modeActivities,
        foldersSource: cachedActivityFolders
      });
      sanitizeCurrentFolderSelection(treeState);
      const { visibleNodes } = buildDashboardVisibleActivityTree({
        activitiesSource: modeActivities,
        foldersSource: cachedActivityFolders,
        collapsedFolderIds: getCollapsedActivityFolderIds(),
        currentActivityMode: getCurrentActivityModeFilter()
      });

      renderConfigHeader(treeState);
      configsList.classList.add("dashboard-explorer-host");
      configsList.innerHTML = renderExplorerShell(treeState, visibleNodes);
      bindActivityTreeEvents();
    } catch (err) {
      renderConfigHeader(buildActivityTreeState({ activitiesSource: [], foldersSource: [] }));
      configsList.classList.add("dashboard-explorer-host");
      configsList.innerHTML = `<div class="dashboard-activity-empty-state is-error">${escapeHtml(err?.message || "Impossible de charger les activités.")}</div>`;
    }
  }

  function toggleFolderExpanded(folderId){
    const collapsedActivityFolderIds = getCollapsedActivityFolderIds();
    const safeFolderId = normalizeTreeId(folderId);
    if (!safeFolderId) return;

    if (collapsedActivityFolderIds.has(safeFolderId)) {
      collapsedActivityFolderIds.delete(safeFolderId);
    } else {
      collapsedActivityFolderIds.add(safeFolderId);
    }

    void renderActivitiesForSpace();
  }

  return {
    buildActivityTreeState,
    buildVisibleActivityTree,
    openProjectedSessionPopup,
    renderRightPanel,
    renderActivitiesForSpace,
    syncCollapsedActivityFolders,
    toggleFolderExpanded
  };
}
