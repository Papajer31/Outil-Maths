import {
  ACTIVITY_MODE_VALUES,
  DEFAULT_ACTIVITY_MODE,
  getActivityModeLabel,
  isStudentFacingActivityMode,
  normalizeActivityMode
} from "../../../shared/activity-modes.js";

import {
  normalizeAccessCode,
  normalizeConfigName
} from "../../../shared/api-common.js";
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

const ACTIVITY_MODE_FILTER_ALL = "all";
const ACTIVITY_MODE_FILTER_VALUES = Object.freeze([
  ACTIVITY_MODE_FILTER_ALL,
  ...ACTIVITY_MODE_VALUES
]);

function normalizeActivityModeFilter(value){
  const safeValue = String(value || "").trim().toLowerCase();
  return ACTIVITY_MODE_FILTER_VALUES.includes(safeValue)
    ? safeValue
    : ACTIVITY_MODE_FILTER_ALL;
}

function isAllActivityModeFilter(value){
  return normalizeActivityModeFilter(value) === ACTIVITY_MODE_FILTER_ALL;
}

function getActivityModeFilterLabel(value){
  return isAllActivityModeFilter(value)
    ? "Tous"
    : getActivityModeLabel(value);
}

function getActivityCreationModeFromFilter(value){
  return isAllActivityModeFilter(value)
    ? DEFAULT_ACTIVITY_MODE
    : normalizeActivityMode(value, DEFAULT_ACTIVITY_MODE);
}

function getInitialActivityCreationModeFromFilter(value){
  return isAllActivityModeFilter(value)
    ? ""
    : normalizeActivityMode(value, DEFAULT_ACTIVITY_MODE);
}

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
    const safeFilter = normalizeActivityModeFilter(mode);
    if (safeFilter === ACTIVITY_MODE_FILTER_ALL) {
      return Array.isArray(activities) ? [...activities] : [];
    }

    return (activities || []).filter((activity) => (
      normalizeActivityMode(activity?.activity_mode, DEFAULT_ACTIVITY_MODE) === safeFilter
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


  function activityNameAlreadyExists(name){
    const normalizedName = normalizeConfigName(name);
    if (!normalizedName) return false;

    return (getCachedActivities() || []).some((activity) => (
      normalizeConfigName(activity?.config_name) === normalizedName
    ));
  }

  function openCreateActivityOverlay(){
    const currentTeacherSpace = getCurrentTeacherSpace();
    if (!currentTeacherSpace?.access_code) return;

    const currentFilter = normalizeActivityModeFilter(getCurrentActivityModeFilter());
    let selectedMode = getInitialActivityCreationModeFromFilter(currentFilter);

    const overlay = document.createElement("div");
    overlay.className = "modal dashboard-create-activity-modal";
    overlay.innerHTML = `
      <div class="modal-content modal-content-wide">
        <div class="modal-title">Créer une activité</div>

        <div class="dashboard-create-activity-section">
          <div class="dashboard-create-activity-label">Mode de l’activité</div>
          <div class="dashboard-mode-choice-grid" role="radiogroup" aria-label="Mode de la nouvelle activité">
            ${ACTIVITY_MODE_VALUES.map((mode) => {
              const isSelected = selectedMode === mode;
              return `
                <button
                  class="btn dashboard-mode-choice-btn dashboard-create-activity-mode-btn${isSelected ? " is-selected" : ""}"
                  type="button"
                  role="radio"
                  aria-checked="${isSelected ? "true" : "false"}"
                  data-create-activity-mode="${escapeAttr(mode)}"
                >
                  ${escapeHtml(getActivityModeLabel(mode))}
                </button>
              `;
            }).join("")}
          </div>
        </div>

        <label class="dashboard-create-activity-section" for="activityCreationNameInput">
          <span class="dashboard-create-activity-label">Nom de l’activité</span>
          <input
            id="activityCreationNameInput"
            class="modal-text-input"
            type="text"
            placeholder="Nom de l’activité"
            autocomplete="off"
          >
        </label>

        <div class="modal-actions">
          <div id="activityCreationMessage" class="modal-message"></div>
          <button class="btn" id="activityCreationCancel" type="button">Annuler</button>
          <button class="btn primary" id="activityCreationConfirm" type="button" disabled>Créer</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector("#activityCreationNameInput");
    const message = overlay.querySelector("#activityCreationMessage");
    const confirmButton = overlay.querySelector("#activityCreationConfirm");
    const cancelButton = overlay.querySelector("#activityCreationCancel");
    const modeButtons = Array.from(overlay.querySelectorAll("[data-create-activity-mode]"));

    function setMessageText(text = "", isError = false){
      if (!message) return;
      message.textContent = text;
      message.classList.toggle("is-error", !!isError);
    }

    function updateModeButtons(){
      modeButtons.forEach((btn) => {
        const mode = normalizeActivityMode(btn.dataset.createActivityMode, DEFAULT_ACTIVITY_MODE);
        const isSelected = selectedMode === mode;
        btn.classList.toggle("is-selected", isSelected);
        btn.setAttribute("aria-checked", isSelected ? "true" : "false");
      });
    }

    function updateConfirmState(){
      const name = String(input?.value || "").trim();
      const nameExists = Boolean(name && activityNameAlreadyExists(name));
      const canCreate = Boolean(selectedMode && name && !nameExists);
      if (confirmButton) {
        confirmButton.disabled = !canCreate;
      }

      if (nameExists) {
        setMessageText("Une activité porte déjà ce nom.", true);
      } else if (message?.textContent === "Une activité porte déjà ce nom.") {
        setMessageText("");
      }
    }

    function setBusy(isBusy){
      modeButtons.forEach((btn) => {
        btn.disabled = isBusy;
      });
      if (input) input.disabled = isBusy;
      if (cancelButton) cancelButton.disabled = isBusy;
      if (confirmButton) confirmButton.disabled = isBusy || !selectedMode || !String(input?.value || "").trim();
    }

    function close(){
      overlay.remove();
    }

    async function submit(){
      const name = String(input?.value || "").trim();

      if (!selectedMode) {
        setMessageText("Choisis un mode d’activité.", true);
        return;
      }

      if (!name) {
        setMessageText("Entre un nom d’activité.", true);
        input?.focus();
        return;
      }

      if (activityNameAlreadyExists(name)) {
        setMessageText("Une activité porte déjà ce nom.", true);
        input?.focus();
        input?.select?.();
        return;
      }

      setBusy(true);
      setMessageText("Ouverture de l’éditeur…");

      try {
        const opened = await openEmbeddedConfigEditor({
          accessCode: currentTeacherSpace.access_code,
          configName: name,
          activityMode: selectedMode,
          folderId: currentOpenFolderId
        });

        if (opened === false) {
          setMessageText("Impossible d’ouvrir l’éditeur.", true);
          setBusy(false);
          updateConfirmState();
          return;
        }

        close();
      } catch (err) {
        setMessageText(err?.message || "Impossible de créer l’activité.", true);
        setBusy(false);
        updateConfirmState();
      }
    }

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close();
      }
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    });

    modeButtons.forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedMode = normalizeActivityMode(btn.dataset.createActivityMode, DEFAULT_ACTIVITY_MODE);
        setMessageText("");
        updateModeButtons();
        updateConfirmState();
        input?.focus();
      });
    });

    input?.addEventListener("input", () => {
      setMessageText("");
      updateConfirmState();
    });

    cancelButton?.addEventListener("click", close);
    confirmButton?.addEventListener("click", () => {
      void submit();
    });

    updateModeButtons();
    updateConfirmState();
    input?.focus();
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

    const currentModeFilter = normalizeActivityModeFilter(getCurrentActivityModeFilter());
    const creationMode = getActivityCreationModeFromFilter(currentModeFilter);
    const currentModeLabel = getActivityModeLabel(creationMode);
    const createButtonTitle = isAllActivityModeFilter(currentModeFilter)
      ? "Créer une activité"
      : `Créer une activité ${currentModeLabel.toLowerCase()}`;
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
          ${ACTIVITY_MODE_FILTER_VALUES.map((value) => {
            const optionLabel = getActivityModeFilterLabel(value);
            const isActive = value === currentModeFilter;
            const filterTitle = isAllActivityModeFilter(value)
              ? "Afficher toutes les activités"
              : `Afficher les activités ${optionLabel.toLowerCase()}`;
            return `
              <button
                class="dashboard-mode-pill-btn${isActive ? " is-active" : ""}"
                type="button"
                role="tab"
                data-activity-mode="${escapeAttr(value)}"
                aria-selected="${isActive ? "true" : "false"}"
                title="${escapeAttr(filterTitle)}"
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

        <button class="btn primary" id="btnNewConfig" type="button" title="${escapeAttr(createButtonTitle)}">
          <span class="dashboard-material-icon" aria-hidden="true">add</span>
          <span>Créer une activité</span>
        </button>
      </div>
    `;

    configHeader.querySelectorAll("[data-activity-mode]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const nextMode = normalizeActivityModeFilter(btn.dataset.activityMode);
        if (nextMode === normalizeActivityModeFilter(getCurrentActivityModeFilter())) return;
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
      openCreateActivityOverlay();
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
    const canProject = isStudentFacingActivityMode(activityMode);
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
      ? "Partager l’activité"
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
            <span
              class="dashboard-activity-tile-subtitle dashboard-mini-pill dashboard-mini-pill-mode dashboard-activity-tile-mode-badge"
              data-activity-mode="${escapeAttr(activityMode)}"
            >
              ${escapeHtml(getActivityModeLabel(activityMode))}
            </span>
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
    const currentFilter = normalizeActivityModeFilter(getCurrentActivityModeFilter());
    const selectedFolder = buildActivityTreeState({
      activitiesSource: getActivitiesForCurrentMode(),
      foldersSource: getCachedActivityFolders()
    }).folderById.get(normalizeTreeId(currentOpenFolderId));
    const contextLabel = selectedFolder ? `dans « ${selectedFolder.name} »` : "à la racine";
    const message = isAllActivityModeFilter(currentFilter)
      ? `Aucune activité ${contextLabel}.`
      : `Aucune activité en mode ${getActivityModeLabel(currentFilter).toLowerCase()} ${contextLabel}.`;

    return `
      <div class="dashboard-activity-empty-state">
        ${escapeHtml(message)}
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
