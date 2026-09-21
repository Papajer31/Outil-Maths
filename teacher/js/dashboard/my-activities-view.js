import { escapeAttr, escapeHtml } from "./text-utils.js";
import { openDashboardConfirmDialog } from "./confirm-dialog.js";
import { openDashboardNameDialog } from "./name-overlay.js";

export function createMyActivitiesViewController({
  view,
  header,
  list,
  getCurrentTeacherSpace,
  listTeacherActivityFoldersForSpace,
  createTeacherActivityFolderForSpace,
  updateTeacherActivityFolder,
  deleteTeacherActivityFolder,
  listTeacherActivitiesForSpace,
  updateTeacherActivityPlacement,
  deleteTeacherActivity,
  onBack,
  onCreateActivity,
  onOpenActivity,
  onTestActivity,
  onAssignActivity,
  onDirectLaunch,
  showToast
} = {}) {
  let currentFolderId = null;
  let folders = [];
  let activities = [];
  let isMovingExplorerNode = false;
  let draggedExplorerNode = null;
  let explorerDropTarget = null;
  let creationDialog = null;
  let creationDialogContext = null;

  async function render({ forceRefresh = false } = {}) {
    const space = getCurrentTeacherSpace?.();
    renderHeader();
    if (!list) return;
    if (!space?.id) {
      list.innerHTML = `<div class="dashboard-activity-empty-state">Crée d’abord ton code de connexion.</div>`;
      return;
    }
    if (forceRefresh || (!folders.length && !activities.length)) {
      list.innerHTML = `<div class="dashboard-activity-empty-state">Chargement de vos activités…</div>`;
      try {
        await refreshData();
      } catch (error) {
        list.innerHTML = `
          <div class="dashboard-activity-empty-state">
            Impossible de charger « Mes activités ».<br>
            <span style="color:var(--muted);">${escapeHtml(error?.message || "Vérifie que la migration SQL 48_teacher_activities.sql a bien été appliquée.")}</span>
          </div>
        `;
        return;
      }
    }
    renderExplorer();
  }

  async function refreshData() {
    const space = getCurrentTeacherSpace?.();
    if (!space?.id) return;
    const [nextFolders, nextActivities] = await Promise.all([
      listTeacherActivityFoldersForSpace?.(space.id),
      listTeacherActivitiesForSpace?.(space.id)
    ]);
    folders = Array.isArray(nextFolders) ? nextFolders : [];
    activities = Array.isArray(nextActivities) ? nextActivities : [];
    if (currentFolderId && !folders.some((folder) => String(folder.id) === String(currentFolderId))) {
      currentFolderId = null;
    }
  }

  function getFolder(id) {
    const safeId = String(id || "").trim();
    return folders.find((folder) => String(folder.id) === safeId) || null;
  }

  function getBreadcrumb() {
    const trail = [];
    const seen = new Set();
    let cursor = getFolder(currentFolderId);
    while (cursor && !seen.has(String(cursor.id))) {
      trail.unshift(cursor);
      seen.add(String(cursor.id));
      cursor = getFolder(cursor.parent_id);
    }
    return trail;
  }

  function renderHeader() {
    if (!header) return;
    const breadcrumb = getBreadcrumb();
    const breadcrumbHtml = [
      `<button class="dashboard-breadcrumb-btn${breadcrumb.length ? "" : " is-current"}" type="button" data-action="open-root">Mes activités</button>`,
      ...breadcrumb.flatMap((folder, index) => [
        `<span class="dashboard-breadcrumb-separator" aria-hidden="true">›</span>`,
        `<button class="dashboard-breadcrumb-btn${index === breadcrumb.length - 1 ? " is-current" : ""}" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folder.id)}">${escapeHtml(folder.name)}</button>`
      ])
    ].join("");

    header.innerHTML = `
      <div class="dashboard-config-header-main">
        <button class="dashboard-back-btn dashboard-material-icon-btn" type="button" data-action="back-activity-hub" title="Retour aux activités" aria-label="Retour aux activités">
          <span class="dashboard-material-icon" aria-hidden="true">arrow_back</span>
        </button>
        <div class="dashboard-section-title">Mes activités</div>
      </div>
      <div class="dashboard-config-header-center">
        <nav class="dashboard-breadcrumb" aria-label="Fil d’Ariane de Mes activités">${breadcrumbHtml}</nav>
      </div>
      <div class="dashboard-config-header-actions">
        <button class="btn dashboard-btn-with-icon dashboard-header-action-btn" type="button" data-action="create-folder" title="Créer un nouveau dossier" aria-label="Créer un nouveau dossier">
          <span class="dashboard-material-icon" aria-hidden="true">create_new_folder</span>
          <span>Créer un nouveau dossier</span>
        </button>
        <button class="btn primary dashboard-btn-with-icon dashboard-header-action-btn" type="button" data-action="create-activity">
          <span class="dashboard-material-icon" aria-hidden="true">add</span>
          <span>Créer une activité</span>
        </button>
      </div>
    `;

    header.querySelector("[data-action='back-activity-hub']")?.addEventListener("click", () => onBack?.());
    header.querySelectorAll("[data-action='open-root']").forEach((button) => button.addEventListener("click", () => openFolder(null)));
    header.querySelectorAll("[data-action='open-folder']").forEach((button) => button.addEventListener("click", () => openFolder(button.dataset.folderId)));
    header.querySelector("[data-action='create-folder']")?.addEventListener("click", () => createFolder());
    header.querySelector("[data-action='create-activity']")?.addEventListener("click", openCreationDialog);
  }

  function renderExplorer() {
    if (!list) return;
    list.classList.add("dashboard-explorer-host");
    const selectedFolder = getFolder(currentFolderId);
    const selectedId = String(selectedFolder?.id || "");
    const childFolders = folders
      .filter((folder) => String(folder.parent_id || "") === selectedId)
      .sort(compareByOrderAndName);
    const childActivities = activities
      .filter((activity) => String(activity.folder_id || "") === selectedId)
      .sort(compareByOrderAndTitle);
    const rootFolders = folders.filter((folder) => !folder.parent_id).sort(compareByOrderAndName);
    const treeHtml = rootFolders.map((folder) => renderTreeFolder(folder, 0)).join("");
    const tilesHtml = [
      selectedFolder ? renderParentTile(selectedFolder) : "",
      ...childFolders.map(renderFolderTile),
      ...childActivities.map(renderActivityTile)
    ].filter(Boolean).join("");

    list.innerHTML = `
      <div class="dashboard-activities-explorer" style="--dashboard-tree-pane-width:18%;">
        <aside class="dashboard-activity-tree-pane panel">
          <div class="dashboard-activity-tree-list">
            <div class="dashboard-activity-tree-row dashboard-activity-tree-root ${currentFolderId ? "" : "is-selected"}" data-drop-folder-id="">
              <button class="dashboard-activity-tree-main dashboard-activity-tree-main--root" type="button" data-action="open-root">
                <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">edit_note</span>
                <span class="dashboard-activity-tree-node-label">Mes activités</span>
              </button>
            </div>
            ${treeHtml || `<div class="dashboard-activity-tree-empty">Aucun dossier.</div>`}
          </div>
        </aside>
        <div class="dashboard-activity-splitter" role="separator" aria-orientation="vertical"></div>
        <section class="dashboard-activity-tiles-pane panel">
          <div class="dashboard-activity-tiles-grid-wrap">
            <div class="dashboard-activity-tiles-grid${tilesHtml ? "" : " dashboard-activity-tiles-grid--empty"}">
              ${tilesHtml || `
                <div class="dashboard-my-activities-empty-state">
                  <span class="dashboard-material-icon" aria-hidden="true">drive_file_rename_outline</span>
                  <span>Commencez par créer un dossier pour classer les activités.</span>
                  <span>Puis, créez une activité.</span>
                </div>
              `}
            </div>
          </div>
        </section>
      </div>
    `;
    bindExplorerEvents();
  }

  function renderTreeFolder(folder, depth) {
    const children = folders
      .filter((child) => String(child.parent_id || "") === String(folder.id))
      .sort(compareByOrderAndName);
    return `
      <div class="dashboard-activity-tree-row dashboard-tree-node ${String(folder.id) === String(currentFolderId || "") ? "is-selected" : ""}"
           data-node-type="folder" data-node-id="${escapeAttr(folder.id)}" data-drop-folder-id="${escapeAttr(folder.id)}" style="--dashboard-tree-depth:${depth};">
        <div class="dashboard-tree-indent" aria-hidden="true"></div>
        <span class="dashboard-tree-toggle-placeholder" aria-hidden="true"></span>
        <button class="dashboard-activity-tree-main" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folder.id)}">
          <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tree-node-label">${escapeHtml(folder.name)}</span>
        </button>
      </div>
      ${children.map((child) => renderTreeFolder(child, depth + 1)).join("")}
    `;
  }

  function renderFolderTile(folder) {
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--folder" data-node-type="folder" data-node-id="${escapeAttr(folder.id)}" data-drop-folder-id="${escapeAttr(folder.id)}" draggable="true">
        <button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folder.id)}">
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tile-title">${escapeHtml(folder.name)}</span>
        </button>
        <div class="dashboard-activity-tile-corner-actions dashboard-activity-tile-corner-actions--stacked">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="rename-folder" data-folder-id="${escapeAttr(folder.id)}" title="Renommer le dossier" aria-label="Renommer le dossier">
            <span class="dashboard-material-icon" aria-hidden="true">edit</span>
          </button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-folder" data-folder-id="${escapeAttr(folder.id)}" title="Supprimer le dossier" aria-label="Supprimer le dossier">
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>
        </div>
      </article>
    `;
  }

  function renderParentTile(folder) {
    const parentId = String(folder.parent_id || "").trim();
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--folder dashboard-activity-tile--parent" data-drop-folder-id="${escapeAttr(parentId)}">
        <button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder" type="button" data-action="${parentId ? "open-folder" : "open-root"}" ${parentId ? `data-folder-id="${escapeAttr(parentId)}"` : ""}>
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">arrow_upward</span>
          <span class="dashboard-activity-tile-title">Dossier parent</span>
        </button>
      </article>
    `;
  }

  function renderActivityTile(activity) {
    const type = normalizeActivityType(activity.activity_type);
    const typeMeta = getActivityTypeMeta(type);
    const difficultyMode = String(activity.difficulty_mode || "single") === "adaptive" ? "adaptive" : "single";
    const difficultyLabel = difficultyMode === "adaptive" ? "Adaptative" : "Difficulté unique";
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--activity" data-node-type="activity" data-node-id="${escapeAttr(activity.id)}" draggable="true">
        <button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--activity" type="button" data-action="open-activity" data-activity-id="${escapeAttr(activity.id)}">
          <span class="dashboard-activity-tile-topline">
            <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">${typeMeta.icon}</span>
            <span class="dashboard-activity-tile-subtitle dashboard-mini-pill">${escapeHtml(typeMeta.label)}</span>
          </span>
          <span class="dashboard-activity-tile-title">${escapeHtml(activity.title)}</span>
          <span class="dashboard-activity-tile-subtitle">${escapeHtml(difficultyLabel)}</span>
        </button>
        <div class="dashboard-activity-tile-actions dashboard-activity-tile-actions--activity">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="test-activity" data-activity-id="${escapeAttr(activity.id)}" title="Tester" aria-label="Tester l’activité">
            <span class="dashboard-material-icon" aria-hidden="true">play_arrow</span>
          </button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="assign-activity" data-activity-id="${escapeAttr(activity.id)}" title="Attribuer" aria-label="Attribuer l’activité">
            <span class="dashboard-material-icon" aria-hidden="true">assignment_ind</span>
          </button>
          <button class="dashboard-icon-btn" type="button" data-action="direct-launch-activity" data-activity-id="${escapeAttr(activity.id)}" title="QR / lien direct" aria-label="QR / lien direct">QR</button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="open-activity" data-activity-id="${escapeAttr(activity.id)}" title="Modifier" aria-label="Modifier l’activité">
            <span class="dashboard-material-icon" aria-hidden="true">edit</span>
          </button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-activity" data-activity-id="${escapeAttr(activity.id)}" title="Retirer de Mes activités" aria-label="Retirer de Mes activités">
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>
        </div>
      </article>
    `;
  }

  function bindExplorerEvents() {
    list?.querySelectorAll("[data-action='open-root']").forEach((button) => button.addEventListener("click", () => openFolder(null)));
    list?.querySelectorAll("[data-action='open-folder']").forEach((button) => button.addEventListener("click", () => openFolder(button.dataset.folderId)));
    list?.querySelectorAll("[data-action='rename-folder']").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      renameFolder(button.dataset.folderId);
    }));
    list?.querySelectorAll("[data-action='delete-folder']").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      void deleteFolder(button.dataset.folderId);
    }));
    list?.querySelectorAll("[data-action='open-activity']").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const activity = activities.find((item) => String(item.id) === String(button.dataset.activityId || ""));
      if (activity) onOpenActivity?.(activity);
    }));
    list?.querySelectorAll("[data-action='test-activity']").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const activity = activities.find((item) => String(item.id) === String(button.dataset.activityId || ""));
      if (activity) onTestActivity?.(activity);
    }));
    list?.querySelectorAll("[data-action='assign-activity']").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const activity = activities.find((item) => String(item.id) === String(button.dataset.activityId || ""));
      if (activity) onAssignActivity?.(activity);
    }));
    list?.querySelectorAll("[data-action='direct-launch-activity']").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const activity = activities.find((item) => String(item.id) === String(button.dataset.activityId || ""));
      if (activity) onDirectLaunch?.(activity);
    }));
    list?.querySelectorAll("[data-action='delete-activity']").forEach((button) => button.addEventListener("click", async (event) => {
      event.stopPropagation();
      await removeActivity(button.dataset.activityId || "");
    }));
    list?.querySelectorAll('[draggable="true"][data-node-type][data-node-id]').forEach((element) => {
      element.addEventListener("dragstart", handleExplorerDragStart);
      element.addEventListener("dragend", handleExplorerDragEnd);
    });
  }

  function openFolder(folderId) {
    currentFolderId = String(folderId || "").trim() || null;
    renderHeader();
    renderExplorer();
  }

  function createFolder() {
    const space = getCurrentTeacherSpace?.();
    if (!space?.id) return;
    openDashboardNameDialog({
      title: "Créer un nouveau dossier",
      placeholder: "Nom du dossier",
      confirmLabel: "Créer",
      onConfirm: async (name) => {
      await createTeacherActivityFolderForSpace?.(space.id, { name, parent_id:currentFolderId });
      await refreshData();
      renderHeader();
      renderExplorer();
      }
    });
  }

  function renameFolder(folderId) {
    const folder = getFolder(folderId);
    if (!folder) return;
    openDashboardNameDialog({
      title: "Renommer le dossier",
      initialValue: folder.name || "",
      placeholder: "Nom du dossier",
      onConfirm: async (name) => {
        await updateTeacherActivityFolder?.(folder.id, { name });
        await refreshData();
        renderHeader();
        renderExplorer();
        showToast?.("Dossier renommé.");
      }
    });
  }

  async function deleteFolder(folderId) {
    const folder = getFolder(folderId);
    if (!folder) return;
    const hasChildren = folders.some((item) => String(item.parent_id || "") === String(folder.id));
    const confirmed = await openDashboardConfirmDialog({
      title: "Supprimer le dossier",
      message: hasChildren
        ? `Supprimer « ${folder.name} » et tous ses sous-dossiers ? Les activités concernées seront conservées, mais déplacées à la racine.`
        : `Supprimer le dossier « ${folder.name} » ? Les activités qu’il contient seront conservées, mais déplacées à la racine.`,
      confirmLabel: "Supprimer",
      danger: true
    });
    if (!confirmed) return;
    try {
      await deleteTeacherActivityFolder?.(folder.id);
      await refreshData();
      renderHeader();
      renderExplorer();
      showToast?.("Dossier supprimé.");
    } catch (error) {
      showToast?.(error?.message || "Suppression impossible.", { isError: true });
    }
  }

  function openCreationDialog({ onCreate = onCreateActivity, folderId = currentFolderId } = {}) {
    closeCreationDialog();
    creationDialogContext = { onCreate, folderId:String(folderId || "").trim() || null };
    const overlay = document.createElement("div");
    overlay.className = "modal activity-hub-create-modal";
    overlay.innerHTML = `
      <div class="modal-content activity-hub-create-card" role="dialog" aria-modal="true" aria-labelledby="myActivityCreateTitle">
        <div class="activity-hub-create-head">
          <div>
            <div id="myActivityCreateTitle" class="modal-title">Créer une activité</div>
          </div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="close-create" aria-label="Fermer" title="Fermer">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </div>
        <div class="activity-hub-create-options">
          ${renderCreationOption({ action:"create-quiz", icon:"quiz", title:"Quiz", text:"Quelques questions préparées une par une." })}
          ${renderCreationOption({ action:"create-series", icon:"view_list", title:"Série", text:"Une grande banque de questions dans laquelle le site peut piocher." })}
          ${renderCreationOption({ action:"create-tool", icon:"extension", title:"Outil", text:"Des exercices générés automatiquement par un outil du site." })}
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    creationDialog = overlay;
    overlay.querySelector("[data-action='close-create']")?.addEventListener("click", closeCreationDialog);
    overlay.querySelector("[data-action='create-quiz']")?.addEventListener("click", () => launchCreation("quiz"));
    overlay.querySelector("[data-action='create-series']")?.addEventListener("click", () => launchCreation("series"));
    overlay.querySelector("[data-action='create-tool']")?.addEventListener("click", () => launchCreation("tool"));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) closeCreationDialog();
    });
  }

  function renderCreationOption({ action, icon, title, text }) {
    return `
      <button class="activity-hub-create-option" type="button" data-action="${action}">
        <span class="activity-hub-create-option-icon dashboard-material-icon" aria-hidden="true">${icon}</span>
        <span class="activity-hub-create-option-copy"><strong>${title}</strong><span>${text}</span></span>
      </button>
    `;
  }

  function launchCreation(type) {
    const safeType = ["quiz", "series", "tool"].includes(String(type || "")) ? String(type) : "quiz";
    const context = creationDialogContext || {};
    const createHandler = typeof context.onCreate === "function" ? context.onCreate : onCreateActivity;
    const targetFolderId = String(context.folderId || "").trim() || null;
    closeCreationDialog();
    createHandler?.({ type:safeType, folderId:targetFolderId, difficultyMode:"single" });
  }

  function closeCreationDialog() {
    creationDialog?.remove();
    creationDialog = null;
    creationDialogContext = null;
  }

  async function removeActivity(activityId) {
    const activity = activities.find((item) => String(item.id) === String(activityId || ""));
    if (!activity) return;
    const confirmed = await openDashboardConfirmDialog({
      title:"Retirer l’activité",
      message:`Retirer « ${activity.title} » de Mes activités ? Pendant la migration, le quiz source reste conservé dans l’ancien espace Quiz.`,
      confirmLabel:"Retirer",
      danger:true
    });
    if (!confirmed) return;
    try {
      await deleteTeacherActivity?.(activity.id);
      await refreshData();
      renderExplorer();
      showToast?.("Activité retirée de Mes activités.");
    } catch (error) {
      showToast?.(error?.message || "Impossible de retirer l’activité.", { isError:true });
    }
  }

  function getDropTargetFromEvent(event) {
    const targetElement = event.target instanceof Element ? event.target : null;
    if (!targetElement || !list?.contains(targetElement)) return null;
    const explicitTarget = targetElement.closest("[data-drop-folder-id]");
    if (explicitTarget) {
      return {
        folderId:String(explicitTarget.dataset.dropFolderId || "").trim() || null,
        element:explicitTarget
      };
    }
    const tilesPane = targetElement.closest(".dashboard-activity-tiles-pane");
    if (tilesPane) return { folderId:String(currentFolderId || "").trim() || null, element:tilesPane };
    return null;
  }

  function clearDropMarkers() {
    explorerDropTarget = null;
    list?.querySelectorAll(".is-dragging, .is-drop-inside").forEach((element) => element.classList.remove("is-dragging", "is-drop-inside"));
  }

  function renderDropTarget(dropTarget) {
    list?.querySelectorAll(".is-drop-inside").forEach((element) => element.classList.remove("is-drop-inside"));
    if (dropTarget?.element instanceof Element) dropTarget.element.classList.add("is-drop-inside");
    if (!draggedExplorerNode?.id || !draggedExplorerNode?.type) return;
    const selector = `[data-node-type="${CSS.escape(draggedExplorerNode.type)}"][data-node-id="${CSS.escape(draggedExplorerNode.id)}"]`;
    list?.querySelectorAll(selector).forEach((element) => element.classList.add("is-dragging"));
  }

  function handleExplorerDragStart(event) {
    const sourceElement = event.currentTarget;
    const type = String(sourceElement?.dataset?.nodeType || "");
    const id = String(sourceElement?.dataset?.nodeId || "");
    if (!id || !["folder", "activity"].includes(type) || isMovingExplorerNode) {
      event.preventDefault();
      return;
    }
    if (event.target instanceof Element && event.target.closest(".dashboard-activity-tile-actions")) {
      event.preventDefault();
      return;
    }
    draggedExplorerNode = { type, id };
    sourceElement.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", `${type}:${id}`);
    }
  }

  function handleExplorerDragOver(event) {
    if (!draggedExplorerNode || isMovingExplorerNode) return;
    const dropTarget = getDropTargetFromEvent(event);
    if (!dropTarget) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    explorerDropTarget = dropTarget;
    renderDropTarget(dropTarget);
  }

  function handleExplorerDragLeave(event) {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && list?.contains(relatedTarget)) return;
    clearDropMarkers();
  }

  async function handleExplorerDrop(event) {
    if (!draggedExplorerNode || isMovingExplorerNode) return;
    const dropTarget = explorerDropTarget || getDropTargetFromEvent(event);
    if (!dropTarget) return;
    event.preventDefault();
    const source = { ...draggedExplorerNode };
    await moveExplorerNodeToTarget(source, dropTarget);
  }

  function handleExplorerDragEnd() {
    draggedExplorerNode = null;
    clearDropMarkers();
  }

  function isFolderInside(targetFolderId, sourceFolderId) {
    let cursor = getFolder(targetFolderId);
    const visited = new Set();
    while (cursor) {
      const id = String(cursor.id || "");
      if (!id || visited.has(id)) return false;
      if (id === String(sourceFolderId || "")) return true;
      visited.add(id);
      cursor = getFolder(cursor.parent_id);
    }
    return false;
  }

  function getNextFolderOrder(targetFolderId, sourceFolderId) {
    return folders
      .filter((folder) => String(folder.id) !== String(sourceFolderId || ""))
      .filter((folder) => String(folder.parent_id || "") === String(targetFolderId || ""))
      .reduce((maximum, folder) => Math.max(maximum, Number(folder.display_order) || 0), -1) + 1;
  }

  function getNextActivityOrder(targetFolderId, sourceActivityId) {
    return activities
      .filter((activity) => String(activity.id) !== String(sourceActivityId || ""))
      .filter((activity) => String(activity.folder_id || "") === String(targetFolderId || ""))
      .reduce((maximum, activity) => Math.max(maximum, Number(activity.display_order) || 0), -1) + 1;
  }

  async function moveExplorerNodeToTarget(source, dropTarget) {
    if (!source?.id || !source?.type || !dropTarget || isMovingExplorerNode) return;
    const targetFolderId = String(dropTarget.folderId || "").trim() || null;
    isMovingExplorerNode = true;
    try {
      if (source.type === "folder") {
        const folder = getFolder(source.id);
        if (!folder) return;
        if (String(folder.id) === String(targetFolderId || "") || (targetFolderId && isFolderInside(targetFolderId, folder.id))) {
          showToast?.("Un dossier ne peut pas être déplacé dans lui-même ou dans l’un de ses sous-dossiers.", { isError:true });
          return;
        }
        if (String(folder.parent_id || "") === String(targetFolderId || "")) return;
        const displayOrder = getNextFolderOrder(targetFolderId, folder.id);
        await updateTeacherActivityFolder?.(folder.id, { parent_id:targetFolderId, display_order:displayOrder });
        showToast?.("Dossier déplacé.");
      } else if (source.type === "activity") {
        const activity = activities.find((item) => String(item.id) === String(source.id));
        if (!activity || String(activity.folder_id || "") === String(targetFolderId || "")) return;
        const displayOrder = getNextActivityOrder(targetFolderId, activity.id);
        await updateTeacherActivityPlacement?.(activity.id, { folder_id:targetFolderId, display_order:displayOrder });
        showToast?.("Activité déplacée.");
      }
      await refreshData();
      renderHeader();
      renderExplorer();
    } catch (error) {
      showToast?.(error?.message || "Impossible de déplacer cet élément.", { isError:true });
    } finally {
      isMovingExplorerNode = false;
      draggedExplorerNode = null;
      clearDropMarkers();
    }
  }

  function normalizeActivityType(value) {
    const type = String(value || "quiz").trim();
    return ["quiz", "series", "tool"].includes(type) ? type : "quiz";
  }

  function getActivityTypeMeta(type) {
    if (type === "series") return { label:"Série", icon:"view_list" };
    if (type === "tool") return { label:"Outil", icon:"extension" };
    return { label:"Quiz", icon:"quiz" };
  }

  function compareByOrderAndName(a, b) {
    const order = (Number(a?.display_order) || 0) - (Number(b?.display_order) || 0);
    if (order) return order;
    return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", { sensitivity:"base" });
  }

  function compareByOrderAndTitle(a, b) {
    const order = (Number(a?.display_order) || 0) - (Number(b?.display_order) || 0);
    if (order) return order;
    return String(a?.title || "").localeCompare(String(b?.title || ""), "fr", { sensitivity:"base" });
  }

  list?.addEventListener("dragover", handleExplorerDragOver);
  list?.addEventListener("dragleave", handleExplorerDragLeave);
  list?.addEventListener("drop", (event) => { void handleExplorerDrop(event); });

  return {
    render,
    refresh: async ({ forceRefresh = true } = {}) => render({ forceRefresh }),
    openCreationDialog,
    closeCreationDialog
  };
}
