import { escapeAttr, escapeHtml } from "./text-utils.js";
import { openDashboardConfirmDialog } from "./confirm-dialog.js";
import { isIntrinsicCatalogActivity } from "../../../shared/catalogue.js";

export function createMissionsViewController({
  missionsView,
  missionsHeader,
  missionsList,
  getCurrentTeacherSpace,
  getCurrentStudents,
  listMissionFoldersForSpace,
  createMissionFolderForSpace,
  listMissionsForSpace,
  listMissionSteps,
  listMissionAssignments,
  saveMissionForSpace,
  setMissionInactive,
  reactivateMission,
  deleteMissionPermanently,
  listCatalogActivitiesForTeacherSpace,
  listPedagogicalNodesForTeacher
} = {}){
  let currentFolderId = null;
  let folders = [];
  let missions = [];
  let editingMission = null;
  let editingSteps = [];
  let editingAssignments = [];
  let catalogActivities = [];
  let catalogNodes = [];
  let catalogPickerFolderId = null;
  let catalogSearchQuery = "";
  let missionEditorMotion = null;
  let missionEditorCloseTimer = null;
  let missionEditorHost = null;

  async function renderMissionsView({ forceRefresh = false } = {}){
    const space = getCurrentTeacherSpace?.();
    if (!missionsList) return;
    renderHeader();
    if (!space?.id) {
      missionsList.innerHTML = `<div class="dashboard-activity-empty-state">Crée d’abord ton code de connexion.</div>`;
      return;
    }
    if (forceRefresh || !folders.length && !missions.length) {
      missionsList.innerHTML = `<div class="dashboard-activity-empty-state">Chargement des missions…</div>`;
      await refreshData();
    }
    renderExplorer();
  }

  async function refreshData(){
    const space = getCurrentTeacherSpace?.();
    if (!space?.id) return;
    const [nextFolders, nextMissions, nextCatalogActivities, nextCatalogNodes] = await Promise.all([
      listMissionFoldersForSpace?.(space.id),
      listMissionsForSpace?.(space.id),
      listCatalogActivitiesForTeacherSpace?.(space.id),
      listPedagogicalNodesForTeacher?.()
    ]);
    folders = Array.isArray(nextFolders) ? nextFolders : [];
    missions = Array.isArray(nextMissions) ? nextMissions : [];
    catalogActivities = Array.isArray(nextCatalogActivities) ? nextCatalogActivities : [];
    catalogNodes = Array.isArray(nextCatalogNodes) ? nextCatalogNodes : [];
  }

  function renderHeader(){
    if (!missionsHeader) return;
    const breadcrumb = getBreadcrumb();
    const breadcrumbHtml = [
      `<button class="dashboard-breadcrumb-btn${breadcrumb.length ? "" : " is-current"}" type="button" data-action="open-root">Missions</button>`,
      ...breadcrumb.map((folder, index) => `
        <span class="dashboard-breadcrumb-separator" aria-hidden="true">/</span>
        <button class="dashboard-breadcrumb-btn${index === breadcrumb.length - 1 ? " is-current" : ""}" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folder.id)}">${escapeHtml(folder.name)}</button>
      `)
    ].join("");
    missionsHeader.innerHTML = `
      <div class="dashboard-config-header-main">
        <div class="dashboard-section-title">Missions</div>
      </div>
      <div class="dashboard-config-header-center">
        <nav class="dashboard-breadcrumb" aria-label="Fil d’Ariane des missions">${breadcrumbHtml}</nav>
      </div>
      <div class="dashboard-config-header-actions">
        <button class="dashboard-icon-btn dashboard-material-icon-btn" id="btnCreateMissionFolder" type="button" title="Créer un dossier" aria-label="Créer un dossier"><span class="dashboard-material-icon" aria-hidden="true">create_new_folder</span></button>
        <button class="btn primary" id="btnCreateMission" type="button"><span class="dashboard-material-icon" aria-hidden="true">add</span><span>Créer une mission</span></button>
      </div>
    `;
    missionsHeader.querySelectorAll("[data-action='open-root']").forEach((btn) => btn.addEventListener("click", () => { currentFolderId = null; renderExplorer(); renderHeader(); }));
    missionsHeader.querySelectorAll("[data-action='open-folder']").forEach((btn) => btn.addEventListener("click", () => { currentFolderId = btn.dataset.folderId || null; renderExplorer(); renderHeader(); }));
    missionsHeader.querySelector("#btnCreateMissionFolder")?.addEventListener("click", () => createFolder());
    missionsHeader.querySelector("#btnCreateMission")?.addEventListener("click", () => openEditor(""));
  }

  function renderExplorer(){
    if (!missionsList) return;
    clearTimeout(missionEditorCloseTimer);
    missionEditorCloseTimer = null;
    cancelMissionEditorMotion();
    missionEditorHost?.remove();
    missionEditorHost = null;
    missionsList.classList.add("dashboard-explorer-host");
    const selectedFolder = getFolder(currentFolderId);
    const childFolders = folders.filter((folder) => String(folder.parent_id || "") === String(selectedFolder?.id || "")).sort(compareByOrderAndName);
    const childMissions = missions.filter((mission) => String(mission.folder_id || "") === String(selectedFolder?.id || "")).sort(compareByOrderAndTitle);
    const rootFolders = folders.filter((folder) => !folder.parent_id).sort(compareByOrderAndName);
    const treeHtml = rootFolders.map((folder) => renderTreeFolder(folder, 0)).join("");
    const tilesHtml = [
      selectedFolder ? renderParentTile(selectedFolder) : "",
      ...childFolders.map(renderFolderTile),
      ...childMissions.map(renderMissionTile)
    ].filter(Boolean).join("");
    missionsList.innerHTML = `
      <div class="dashboard-activities-explorer" style="--dashboard-tree-pane-width:18%;">
        <aside class="dashboard-activity-tree-pane panel">
          <div class="dashboard-activity-tree-list">
            <div class="dashboard-activity-tree-row dashboard-activity-tree-root ${currentFolderId ? "" : "is-selected"}">
              <button class="dashboard-activity-tree-main dashboard-activity-tree-main--root" type="button" data-action="open-root"><span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">flag</span><span class="dashboard-activity-tree-node-label">Missions</span></button>
            </div>
            ${treeHtml || `<div class="dashboard-activity-tree-empty">Aucun dossier.</div>`}
          </div>
        </aside>
        <div class="dashboard-activity-splitter" role="separator" aria-orientation="vertical"></div>
        <section class="dashboard-activity-tiles-pane panel">
          <div class="dashboard-activity-tiles-grid-wrap"><div class="dashboard-activity-tiles-grid">${tilesHtml || `<div class="dashboard-activity-empty-state">Aucune mission dans ce dossier.</div>`}</div></div>
        </section>
      </div>
    `;
    bindExplorerEvents();
  }

  function renderTreeFolder(folder, depth){
    return `
      <div class="dashboard-activity-tree-row dashboard-tree-node ${String(folder.id) === String(currentFolderId || "") ? "is-selected" : ""}" style="--dashboard-tree-depth:${depth};">
        <div class="dashboard-tree-indent" aria-hidden="true"></div><span class="dashboard-tree-toggle-placeholder" aria-hidden="true"></span>
        <button class="dashboard-activity-tree-main" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folder.id)}"><span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">folder</span><span class="dashboard-activity-tree-node-label">${escapeHtml(folder.name)}</span></button>
      </div>
      ${folders.filter((child) => String(child.parent_id || "") === String(folder.id)).sort(compareByOrderAndName).map((child) => renderTreeFolder(child, depth + 1)).join("")}
    `;
  }

  function renderFolderTile(folder){
    return `<article class="dashboard-activity-tile dashboard-activity-tile--folder"><button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder" type="button" data-action="open-folder" data-folder-id="${escapeAttr(folder.id)}"><span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">folder</span><span class="dashboard-activity-tile-title">${escapeHtml(folder.name)}</span></button></article>`;
  }

  function renderParentTile(folder){
    const parentId = String(folder.parent_id || "").trim();
    return `<article class="dashboard-activity-tile dashboard-activity-tile--folder dashboard-activity-tile--parent"><button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder" type="button" data-action="${parentId ? "open-folder" : "open-root"}" ${parentId ? `data-folder-id="${escapeAttr(parentId)}"` : ""}><span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">arrow_upward</span><span class="dashboard-activity-tile-title">Dossier parent</span></button></article>`;
  }

  function renderMissionTile(mission){
    const status = String(mission.status || "draft").trim();
    const active = status === "active";
    const inactive = status === "inactive";
    const statusLabel = active ? "Active" : inactive ? "Inactive" : "Brouillon";
    const lifecycleAction = active
      ? `<button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="deactivate-mission" data-mission-id="${escapeAttr(mission.id)}" title="Désactiver" aria-label="Désactiver la mission"><span class="dashboard-material-icon" aria-hidden="true">pause_circle</span></button>`
      : inactive
        ? `<button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="reactivate-mission" data-mission-id="${escapeAttr(mission.id)}" title="Réactiver" aria-label="Réactiver la mission"><span class="dashboard-material-icon" aria-hidden="true">restart_alt</span></button>`
        : "";
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--activity ${active ? "is-highlighted" : ""}">
        <button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--activity" type="button" data-action="edit-mission" data-mission-id="${escapeAttr(mission.id)}">
          <span class="dashboard-activity-tile-topline"><span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">flag</span><span class="dashboard-activity-tile-subtitle dashboard-mini-pill">${statusLabel}</span></span>
          <span class="dashboard-activity-tile-title">${escapeHtml(mission.title)}</span>
        </button>
        <div class="dashboard-activity-tile-actions dashboard-activity-tile-actions--activity">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="edit-mission" data-mission-id="${escapeAttr(mission.id)}" title="Modifier"><span class="dashboard-material-icon" aria-hidden="true">edit</span></button>
          ${lifecycleAction}
          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-mission" data-mission-id="${escapeAttr(mission.id)}" title="Supprimer définitivement" aria-label="Supprimer définitivement la mission"><span class="dashboard-material-icon" aria-hidden="true">delete_forever</span></button>
        </div>
      </article>
    `;
  }

  function bindExplorerEvents(){
    missionsList.querySelectorAll("[data-action='open-root']").forEach((btn) => btn.addEventListener("click", () => { currentFolderId = null; renderHeader(); renderExplorer(); }));
    missionsList.querySelectorAll("[data-action='open-folder']").forEach((btn) => btn.addEventListener("click", () => { currentFolderId = btn.dataset.folderId || null; renderHeader(); renderExplorer(); }));
    missionsList.querySelectorAll("[data-action='edit-mission']").forEach((btn) => btn.addEventListener("click", () => openEditor(btn.dataset.missionId || "")));

    missionsList.querySelectorAll("[data-action='deactivate-mission']").forEach((btn) => btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const confirmed = await openDashboardConfirmDialog({
        title:"Désactiver la mission",
        message:"Les élèves ne verront plus cette mission. Leur progression actuelle est conservée. Si tu la réactives plus tard, une nouvelle session repartira à zéro pour tous les élèves attribués.",
        confirmLabel:"Désactiver"
      });
      if (!confirmed) return;
      await setMissionInactive?.(btn.dataset.missionId || "");
      await refreshData();
      renderExplorer();
    }));

    missionsList.querySelectorAll("[data-action='reactivate-mission']").forEach((btn) => btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const confirmed = await openDashboardConfirmDialog({
        title:"Réactiver la mission",
        message:"Une nouvelle session va démarrer. La progression de cette mission repartira à zéro pour tous les élèves attribués. Les anciennes tentatives resteront dans leur historique.",
        confirmLabel:"Réactiver"
      });
      if (!confirmed) return;
      await reactivateMission?.(btn.dataset.missionId || "");
      await refreshData();
      renderExplorer();
    }));

    missionsList.querySelectorAll("[data-action='delete-mission']").forEach((btn) => btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const confirmed = await openDashboardConfirmDialog({
        title:"Supprimer définitivement la mission",
        message:"La mission, ses étapes, ses attributions et sa progression actuelle seront supprimées. Les tentatives déjà enregistrées dans l’historique des élèves seront conservées. Cette action est définitive.",
        confirmLabel:"Supprimer définitivement",
        danger:true
      });
      if (!confirmed) return;
      await deleteMissionPermanently?.(btn.dataset.missionId || "");
      await refreshData();
      renderExplorer();
    }));
  }

  async function createFolder(){
    const space = getCurrentTeacherSpace?.();
    if (!space?.id) return;
    const name = prompt("Nom du dossier");
    if (!String(name || "").trim()) return;
    await createMissionFolderForSpace?.(space.id, { name, parent_id: currentFolderId });
    await refreshData();
    renderHeader();
    renderExplorer();
  }

  async function openEditor(missionId = ""){
    const space = getCurrentTeacherSpace?.();
    if (!space?.id || !missionsList) return;
    const mission = missionId ? missions.find((item) => String(item.id) === String(missionId)) : null;
    editingMission = mission ? { ...mission } : defaultMission(space.id);
    editingSteps = mission ? await listMissionSteps?.(mission.id) || [] : [];
    editingAssignments = mission ? await listMissionAssignments?.(mission.id) || [] : [];
    catalogPickerFolderId = null;
    catalogSearchQuery = "";
    renderEditor();
  }

  function defaultMission(teacherSpaceId){
    return {
      teacher_space_id: teacherSpaceId,
      folder_id: currentFolderId,
      title: "",
      status: "draft",
      question_count: 5
    };
  }

  function renderMissionEditorStatusControl(mission){
    const status = String(mission?.status || "draft").trim();
    if (status === "active") {
      return `<span class="dashboard-mini-pill">Active</span>`;
    }
    if (status === "inactive") {
      return `<span class="dashboard-mini-pill">Inactive</span>`;
    }
    return `
      <div class="dashboard-view-toggle" role="group" aria-label="Statut de publication">
        <button class="dashboard-view-toggle-btn is-active" type="button" data-action="set-mission-status" data-status="draft" aria-pressed="true">Brouillon</button>
        <button class="dashboard-view-toggle-btn" type="button" data-action="set-mission-status" data-status="active" aria-pressed="false">Publier</button>
      </div>
    `;
  }

  function renderEditor(){
    const students = getCurrentStudents?.() || [];
    const classIds = [...new Set(students.map((student) => Number(student.teacher_class_id)).filter(Boolean))];
    const assignedClassIds = new Set(editingAssignments.filter((a) => a.target_type === "class").map((a) => String(a.teacher_class_id)));
    const assignedStudentIds = new Set(editingAssignments.filter((a) => a.target_type === "student").map((a) => String(a.student_id)));
    if (!missionsView) return;
    const shouldAnimateOpening = !missionEditorHost;
    clearTimeout(missionEditorCloseTimer);
    missionEditorCloseTimer = null;
    cancelMissionEditorMotion();
    missionEditorHost?.remove();
    missionEditorHost = document.createElement("aside");
    missionEditorHost.className = "dashboard-mission-editor-host";
    missionEditorHost.setAttribute("role", "dialog");
    missionEditorHost.setAttribute("aria-modal", "true");
    missionEditorHost.setAttribute("aria-label", "Éditeur de mission");
    missionEditorHost.innerHTML = `
        <section class="panel dashboard-mission-editor">
          <div class="dashboard-mission-editor-head">
            <div>
              <div class="dashboard-section-title">${editingMission.id ? "Modifier la mission" : "Créer une mission"}</div>
              <div class="dashboard-mission-editor-hint">Compose une suite d’activités, choisis ses destinataires, puis active-la quand elle est prête.</div>
            </div>
            <div class="dashboard-mission-editor-head-actions">
              <div id="missionEditorMessage" class="modal-message"></div>
              ${renderMissionEditorStatusControl(editingMission)}
              <button class="btn primary" type="button" data-action="save-mission">Enregistrer</button>
              <button class="btn" type="button" data-action="back-missions">Retour</button>
            </div>
          </div>

          <div class="dashboard-mission-title-field">
            <input
              class="dashboard-mission-title-input"
              type="text"
              data-field="title"
              value="${escapeAttr(editingMission.title)}"
              placeholder="Donnez un titre à cette mission"
              aria-label="Titre de la mission"
              autocomplete="off"
              required
            >
          </div>

          <section class="panel dashboard-mission-assignment-panel">
            <div class="dashboard-mission-panel-title">Attribution</div>
            <div class="dashboard-mission-assignment-options">
              <label class="dashboard-mission-assignment-option">
                <input type="checkbox" data-assignment-class="${escapeAttr(classIds[0] || "")}" ${assignedClassIds.has(String(classIds[0] || "")) ? "checked" : ""} ${classIds[0] ? "" : "disabled"}>
                <span>Toute la classe</span>
              </label>
              ${students.map((student) => `<label class="dashboard-mission-assignment-option"><input type="checkbox" data-assignment-student="${escapeAttr(student.id)}" ${assignedStudentIds.has(String(student.id)) ? "checked" : ""}><span>${escapeHtml(student.first_name || "")}</span></label>`).join("") || `<span class="dashboard-activity-empty-state">Aucun élève.</span>`}
            </div>
          </section>

          <div class="dashboard-mission-compose-grid">
            <section class="panel dashboard-mission-catalog-panel">
              <div class="dashboard-mission-panel-title">Ajouter une activité</div>
              <div id="missionCatalogPicker">${renderCatalogPicker()}</div>
            </section>

            <section class="panel dashboard-mission-sequence-panel">
              <div class="dashboard-mission-panel-title">Suite de la mission <span class="dashboard-mini-pill">${editingSteps.length}</span></div>
              <div class="dashboard-mission-step-list">
                ${editingSteps.length ? editingSteps.map((step, index) => renderStepRow(step, index)).join("") : `<div class="dashboard-activity-empty-state">Ajoute au moins une activité.</div>`}
              </div>
            </section>
          </div>

        </section>
    `;
    missionsView.append(missionEditorHost);
    const editorHost = missionEditorHost;
    if (shouldAnimateOpening) {
      editorHost?.classList.remove("is-open", "is-closing");
      const openMotion = runMissionEditorMotion(editorHost, true);
      if (!openMotion) requestAnimationFrame(() => editorHost?.classList.add("is-open"));
    } else {
      editorHost?.classList.add("is-open");
    }
    bindEditorEvents();
  }

  function renderCatalogPicker(){
    const eligibleActivities = catalogActivities.filter((activity) => activity?.is_visible !== false && String(activity?.status || "published") === "published");
    const query = normalizeMissionSearch(catalogSearchQuery);
    const searchResults = query
      ? eligibleActivities
        .filter((activity) => normalizeMissionSearch(`${activity.config_name} ${getCatalogActivityPath(activity)}`).includes(query))
        .sort(compareCatalogActivities)
      : [];

    if (query) {
      return `
        <div class="dashboard-mission-catalog-search">
          <span class="dashboard-material-icon" aria-hidden="true">search</span>
          <input class="modal-text-input" id="missionCatalogSearch" value="${escapeAttr(catalogSearchQuery)}" placeholder="Rechercher une activité">
        </div>
        <div class="dashboard-mission-catalog-results">
          ${searchResults.length
            ? searchResults.map((activity) => renderCatalogActivityChoice(activity, { showPath: true })).join("")
            : `<div class="dashboard-activity-empty-state">Aucune activité trouvée.</div>`}
        </div>
      `;
    }

    const currentNode = getCatalogNode(catalogPickerFolderId);
    const childNodes = catalogNodes
      .filter((node) => String(node.parent_id || "") === String(currentNode?.id || ""))
      .sort(compareByOrderAndName);
    const directActivities = eligibleActivities
      .filter((activity) => String(activity.pedagogical_node_id || activity.folder_id || "") === String(currentNode?.id || ""))
      .sort(compareCatalogActivities);
    const breadcrumb = getCatalogBreadcrumb(catalogPickerFolderId);

    return `
      <div class="dashboard-mission-catalog-search">
        <span class="dashboard-material-icon" aria-hidden="true">search</span>
        <input class="modal-text-input" id="missionCatalogSearch" value="" placeholder="Rechercher une activité">
      </div>
      <nav class="dashboard-mission-catalog-breadcrumb" aria-label="Arborescence du Catalogue">
        <button type="button" data-action="catalog-root" class="${currentNode ? "" : "is-current"}">Catalogue</button>
        ${breadcrumb.map((node, index) => `<span aria-hidden="true">/</span><button type="button" data-action="open-catalog-node" data-node-id="${escapeAttr(node.id)}" class="${index === breadcrumb.length - 1 ? "is-current" : ""}">${escapeHtml(getCatalogNodeLabel(node))}</button>`).join("")}
      </nav>
      <div class="dashboard-mission-catalog-results">
        ${currentNode ? `<button class="dashboard-mission-catalog-folder dashboard-mission-catalog-folder--parent" type="button" data-action="${currentNode.parent_id ? "open-catalog-node" : "catalog-root"}" ${currentNode.parent_id ? `data-node-id="${escapeAttr(currentNode.parent_id)}"` : ""}><span class="dashboard-material-icon" aria-hidden="true">arrow_upward</span><span>Dossier parent</span></button>` : ""}
        ${childNodes.map(renderCatalogFolderChoice).join("")}
        ${directActivities.map((activity) => renderCatalogActivityChoice(activity)).join("")}
        ${!childNodes.length && !directActivities.length ? `<div class="dashboard-activity-empty-state">Aucune activité dans ce dossier.</div>` : ""}
      </div>
    `;
  }

  function renderCatalogFolderChoice(node){
    return `<button class="dashboard-mission-catalog-folder" type="button" data-action="open-catalog-node" data-node-id="${escapeAttr(node.id)}"><span class="dashboard-material-icon" aria-hidden="true">folder</span><span>${escapeHtml(getCatalogNodeLabel(node))}</span><span class="dashboard-material-icon dashboard-mission-catalog-chevron" aria-hidden="true">chevron_right</span></button>`;
  }

  function renderCatalogActivityChoice(activity, { showPath = false } = {}){
    return `
      <button class="dashboard-mission-catalog-activity" type="button" data-action="add-step" data-catalog-activity-id="${escapeAttr(activity.id)}">
        <span class="dashboard-material-icon" aria-hidden="true">add_circle</span>
        <span class="dashboard-mission-catalog-activity-copy">
          <strong>${escapeHtml(activity.config_name)}</strong>
          ${showPath ? `<small>${escapeHtml(getCatalogActivityPath(activity))}</small>` : ""}
        </span>
      </button>
    `;
  }

  function renderCatalogPickerIntoHost({ refocusSearch = false } = {}){
    const host = missionEditorHost?.querySelector("#missionCatalogPicker");
    if (!host) return;
    host.innerHTML = renderCatalogPicker();
    bindCatalogPickerEvents();
    if (refocusSearch) {
      const search = host.querySelector("#missionCatalogSearch");
      search?.focus();
      if (search && typeof search.setSelectionRange === "function") {
        const end = String(search.value || "").length;
        search.setSelectionRange(end, end);
      }
    }
  }

  function bindCatalogPickerEvents(){
    const host = missionEditorHost?.querySelector("#missionCatalogPicker");
    if (!host) return;
    host.querySelector("#missionCatalogSearch")?.addEventListener("input", (event) => {
      catalogSearchQuery = event.target.value || "";
      renderCatalogPickerIntoHost({ refocusSearch: true });
    });
    host.querySelectorAll("[data-action='catalog-root']").forEach((btn) => btn.addEventListener("click", () => {
      catalogPickerFolderId = null;
      catalogSearchQuery = "";
      renderCatalogPickerIntoHost();
    }));
    host.querySelectorAll("[data-action='open-catalog-node']").forEach((btn) => btn.addEventListener("click", () => {
      catalogPickerFolderId = btn.dataset.nodeId || null;
      catalogSearchQuery = "";
      renderCatalogPickerIntoHost();
    }));
    host.querySelectorAll("[data-action='add-step']").forEach((btn) => btn.addEventListener("click", () => {
      syncEditorStateFromDom();
      editingSteps.push({
        catalog_activity_id: btn.dataset.catalogActivityId,
        difficulty_mode: "adaptive",
        difficulty_level: 3,
        step_options_json: { execution_limit: { mode: "questions", value: 5 } }
      });
      renderEditor();
    }));
  }

  function getCatalogNode(id){
    const safeId = String(id || "");
    return catalogNodes.find((node) => String(node.id) === safeId) || null;
  }

  function getCatalogNodeLabel(node){
    return String(node?.name || node?.student_label || node?.id || "").trim();
  }

  function getCatalogBreadcrumb(nodeId){
    const result = [];
    let cursor = getCatalogNode(nodeId);
    const seen = new Set();
    while (cursor && !seen.has(String(cursor.id))) {
      seen.add(String(cursor.id));
      result.unshift(cursor);
      cursor = getCatalogNode(cursor.parent_id);
    }
    return result;
  }

  function getCatalogActivityPath(activity){
    return getCatalogBreadcrumb(activity?.pedagogical_node_id || activity?.folder_id)
      .map(getCatalogNodeLabel)
      .filter(Boolean)
      .join(" › ");
  }

  function renderStepRow(step, index){
    const activity = catalogActivities.find((item) => item.id === step.catalog_activity_id);
    const intrinsic = isIntrinsicCatalogActivity(activity);
    const limit = getMissionStepExecutionLimit(step);
    const difficulty = getMissionStepDifficulty(step);
    const difficultyHtml = `<div class="dashboard-mission-step-difficulty">
      <span class="dashboard-mission-step-setting-label">Difficulté</span>
      <select class="student-select dashboard-mission-step-difficulty-select" data-step-difficulty="${index}" aria-label="Difficulté de l’activité">
        <option value="adaptive" ${difficulty.mode === "adaptive" ? "selected" : ""}>Adaptative</option>
        ${[1, 2, 3, 4, 5].map((level) => `<option value="${level}" ${difficulty.mode === "fixed" && difficulty.level === level ? "selected" : ""}>N${level}</option>`).join("")}
      </select>
    </div>`;
    const limitHtml = intrinsic
      ? `<div class="dashboard-mission-step-limit is-intrinsic"><span class="dashboard-material-icon" aria-hidden="true">lock</span><span>Toutes les questions · contenu de l’activité</span></div>`
      : `<div class="dashboard-mission-step-limit">
          <select class="student-select dashboard-mission-step-limit-mode" data-step-limit-mode="${index}" aria-label="Règle d’arrêt">
            <option value="questions" ${limit.mode === "questions" ? "selected" : ""}>Questions</option>
            <option value="time" ${limit.mode === "time" ? "selected" : ""}>Temps</option>
          </select>
          <input class="modal-text-input dashboard-mission-step-limit-value" type="number" min="1" max="${limit.mode === "time" ? 120 : 200}" step="1" data-step-limit-value="${index}" value="${escapeAttr(limit.mode === "time" ? Math.max(1, Math.round(limit.value / 60)) : limit.value)}">
          <span class="dashboard-mission-step-limit-unit">${limit.mode === "time" ? "min" : "questions"}</span>
        </div>`;
    return `<div class="dashboard-class-card dashboard-mission-step-card"><div class="dashboard-class-card-main dashboard-mission-step-main" style="cursor:default;"><div class="dashboard-class-card-heading"><span class="dashboard-class-card-title">${index + 1}. ${escapeHtml(activity?.config_name || step.catalog_activity_id)}</span></div><div class="dashboard-mission-step-settings">${difficultyHtml}${limitHtml}</div></div><div class="dashboard-class-card-actions"><button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="move-step-up" data-step-index="${index}" ${index <= 0 ? "disabled" : ""}><span class="dashboard-material-icon">arrow_upward</span></button><button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="move-step-down" data-step-index="${index}" ${index >= editingSteps.length - 1 ? "disabled" : ""}><span class="dashboard-material-icon">arrow_downward</span></button><button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="remove-step" data-step-index="${index}"><span class="dashboard-material-icon">delete</span></button></div></div>`;
  }

  function getMissionStepDifficulty(step){
    const rawMode = String(step?.difficulty_mode || "normal").trim().toLowerCase();
    const level = Math.max(1, Math.min(5, Math.trunc(Number(step?.difficulty_level) || 3)));
    return rawMode === "adaptive"
      ? { mode: "adaptive", level }
      : { mode: "fixed", level };
  }

  function readMissionStepDifficulties(){
    editingSteps.forEach((step, index) => {
      const select = missionEditorHost?.querySelector(`[data-step-difficulty="${index}"]`);
      if (!select) return;
      const value = String(select.value || "adaptive").trim().toLowerCase();
      if (value === "adaptive") {
        step.difficulty_mode = "adaptive";
        step.difficulty_level = Math.max(1, Math.min(5, Math.trunc(Number(step.difficulty_level) || 3)));
        return;
      }
      const level = Math.max(1, Math.min(5, Math.trunc(Number(value) || 3)));
      step.difficulty_mode = "fixed";
      step.difficulty_level = level;
    });
  }

  function getMissionStepExecutionLimit(step){
    const raw = step?.step_options_json?.execution_limit ?? step?.step_options_json?.executionLimit ?? {};
    const mode = String(raw?.mode || "questions").trim() === "time" ? "time" : "questions";
    const fallback = mode === "time" ? 180 : 5;
    const value = Math.max(1, Math.trunc(Number(raw?.value) || fallback));
    return { mode, value };
  }

  function readMissionStepExecutionLimits(){
    editingSteps.forEach((step, index) => {
      const activity = catalogActivities.find((item) => item.id === step.catalog_activity_id);
      if (isIntrinsicCatalogActivity(activity)) return;
      const modeEl = missionEditorHost?.querySelector(`[data-step-limit-mode="${index}"]`);
      const valueEl = missionEditorHost?.querySelector(`[data-step-limit-value="${index}"]`);
      if (!modeEl || !valueEl) return;
      const mode = String(modeEl.value || "questions") === "time" ? "time" : "questions";
      const rawValue = Math.max(1, Math.trunc(Number(valueEl.value) || (mode === "time" ? 3 : 5)));
      const executionLimit = { mode, value: mode === "time" ? rawValue * 60 : rawValue };
      step.step_options_json = {
        ...(step.step_options_json && typeof step.step_options_json === "object" ? step.step_options_json : {}),
        execution_limit: executionLimit
      };
    });
  }

  function bindEditorEvents(){
    missionEditorHost?.querySelector("[data-action='back-missions']")?.addEventListener("click", () => {
      editingMission = null;
      closeEditorToExplorer();
    });
    missionEditorHost?.querySelectorAll("[data-field]").forEach((field) => field.addEventListener("input", () => readMissionFields()));
    missionEditorHost?.querySelectorAll("[data-field]").forEach((field) => field.addEventListener("change", () => readMissionFields()));
    missionEditorHost?.querySelectorAll("[data-action='remove-step']").forEach((btn) => btn.addEventListener("click", () => {
      syncEditorStateFromDom();
      editingSteps.splice(Number(btn.dataset.stepIndex), 1);
      renderEditor();
    }));
    missionEditorHost?.querySelectorAll("[data-action='move-step-up']").forEach((btn) => btn.addEventListener("click", () => {
      syncEditorStateFromDom();
      moveStep(Number(btn.dataset.stepIndex), -1);
    }));
    missionEditorHost?.querySelectorAll("[data-action='move-step-down']").forEach((btn) => btn.addEventListener("click", () => {
      syncEditorStateFromDom();
      moveStep(Number(btn.dataset.stepIndex), 1);
    }));
    missionEditorHost?.querySelectorAll("[data-action='set-mission-status']").forEach((button) => button.addEventListener("click", () => {
      const status = button.dataset.status === "active" ? "active" : "draft";
      editingMission.status = status;
      missionEditorHost?.querySelectorAll("[data-action='set-mission-status']").forEach((control) => {
        const active = control.dataset.status === status;
        control.classList.toggle("is-active", active);
        control.setAttribute("aria-pressed", active ? "true" : "false");
      });
    }));
    missionEditorHost?.querySelectorAll("[data-step-difficulty]").forEach((select) => select.addEventListener("change", () => {
      readMissionStepDifficulties();
    }));
    missionEditorHost?.querySelectorAll("[data-step-limit-mode]").forEach((select) => select.addEventListener("change", () => {
      const index = Number(select.dataset.stepLimitMode);
      // On mémorise d’abord les autres étapes, sans réinterpréter la valeur de celle qui change d’unité.
      editingSteps.forEach((step, stepIndex) => {
        if (stepIndex === index) return;
        const activity = catalogActivities.find((item) => item.id === step.catalog_activity_id);
        if (isIntrinsicCatalogActivity(activity)) return;
        const modeEl = missionEditorHost?.querySelector(`[data-step-limit-mode="${stepIndex}"]`);
        const valueEl = missionEditorHost?.querySelector(`[data-step-limit-value="${stepIndex}"]`);
        if (!modeEl || !valueEl) return;
        const mode = String(modeEl.value || "questions") === "time" ? "time" : "questions";
        const rawValue = Math.max(1, Math.trunc(Number(valueEl.value) || (mode === "time" ? 3 : 5)));
        step.step_options_json = {
          ...(step.step_options_json && typeof step.step_options_json === "object" ? step.step_options_json : {}),
          execution_limit: { mode, value: mode === "time" ? rawValue * 60 : rawValue }
        };
      });
      const step = editingSteps[index];
      if (step) {
        step.step_options_json = {
          ...(step.step_options_json && typeof step.step_options_json === "object" ? step.step_options_json : {}),
          execution_limit: select.value === "time"
            ? { mode: "time", value: 180 }
            : { mode: "questions", value: 5 }
        };
      }
      const limitHost = select.closest(".dashboard-mission-step-limit");
      const valueInput = limitHost?.querySelector("[data-step-limit-value]");
      const unit = limitHost?.querySelector(".dashboard-mission-step-limit-unit");
      const isTimeLimit = select.value === "time";
      if (valueInput) {
        valueInput.max = isTimeLimit ? "120" : "200";
        valueInput.value = isTimeLimit ? "3" : "5";
      }
      if (unit) unit.textContent = isTimeLimit ? "min" : "questions";
    }));
    missionEditorHost?.querySelector("[data-action='save-mission']")?.addEventListener("click", () => saveCurrentMission());

    const classAssignment = missionEditorHost?.querySelector("[data-assignment-class]");
    classAssignment?.addEventListener("change", () => {
      missionEditorHost?.querySelectorAll("[data-assignment-student]").forEach((input) => {
        input.checked = classAssignment.checked;
      });
    });
    missionEditorHost?.querySelectorAll("[data-assignment-student]").forEach((input) => input.addEventListener("change", () => {
      if (input.checked && classAssignment) classAssignment.checked = false;
    }));

    bindCatalogPickerEvents();
  }

  function readMissionFields(){
    missionEditorHost?.querySelectorAll("[data-field]").forEach((field) => {
      editingMission[field.dataset.field] = field.value;
    });
  }

  function readMissionAssignmentsFromDom(){
    const assignments = [];
    const classAssignment = missionEditorHost?.querySelector("[data-assignment-class]");
    if (classAssignment?.checked && classAssignment.dataset.assignmentClass) {
      assignments.push({ target_type: "class", teacher_class_id: classAssignment.dataset.assignmentClass });
      editingAssignments = assignments;
      return assignments;
    }
    missionEditorHost?.querySelectorAll("[data-assignment-class]").forEach((input) => {
      if (input.checked && input.dataset.assignmentClass) {
        assignments.push({ target_type: "class", teacher_class_id: input.dataset.assignmentClass });
      }
    });
    missionEditorHost?.querySelectorAll("[data-assignment-student]").forEach((input) => {
      if (input.checked && input.dataset.assignmentStudent) {
        assignments.push({ target_type: "student", student_id: input.dataset.assignmentStudent });
      }
    });
    editingAssignments = assignments;
    return assignments;
  }

  function syncEditorStateFromDom(){
    readMissionFields();
    readMissionAssignmentsFromDom();
    readMissionStepDifficulties();
    readMissionStepExecutionLimits();
  }

  function moveStep(index, delta){
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= editingSteps.length) return;
    const [item] = editingSteps.splice(index, 1);
    editingSteps.splice(nextIndex, 0, item);
    renderEditor();
  }

  async function saveCurrentMission(){
    syncEditorStateFromDom();
    const message = missionEditorHost?.querySelector("#missionEditorMessage");
    const assignments = editingAssignments;
    if (!editingSteps.length) {
      if (message) message.textContent = "Ajoute au moins une activité.";
      return;
    }
    if (String(editingMission.status || "draft") === "active" && !assignments.length) {
      if (message) message.textContent = "Choisis au moins un destinataire avant d’activer la mission.";
      return;
    }
    try {
      await saveMissionForSpace?.(getCurrentTeacherSpace?.().id, editingMission, editingSteps, assignments);
      editingMission = null;
      editingSteps = [];
      editingAssignments = [];
      await refreshData();
      closeEditorToExplorer();
    } catch (err) {
      if (message) message.textContent = err?.message || "Enregistrement impossible.";
    }
  }

  function closeEditorToExplorer(){
    const editorHost = missionEditorHost;
    const finish = () => {
      clearTimeout(missionEditorCloseTimer);
      missionEditorCloseTimer = null;
      editorHost?.remove();
      if (missionEditorHost === editorHost) missionEditorHost = null;
      renderHeader();
      renderExplorer();
    };
    if (!editorHost) {
      finish();
      return;
    }
    clearTimeout(missionEditorCloseTimer);
    editorHost.classList.add("is-closing");
    const closeMotion = runMissionEditorMotion(editorHost, false);
    if (closeMotion) {
      closeMotion.finished.then(finish).catch(() => {});
      return;
    }
    editorHost.classList.remove("is-open");
    missionEditorCloseTimer = window.setTimeout(finish, 460);
  }

  function cancelMissionEditorMotion(){
    if (!missionEditorMotion) return;
    const motion = missionEditorMotion;
    missionEditorMotion = null;
    try { motion.cancel(); } catch {}
  }

  function runMissionEditorMotion(editorHost, open){
    if (!editorHost?.animate) return null;

    cancelMissionEditorMotion();
    editorHost.classList.remove("is-animating", "is-opening");
    editorHost.classList.add("is-animating");
    if (open) editorHost.classList.add("is-opening");

    const motion = editorHost.animate(
      open
        ? [
            { transform:"translate3d(0,112%,0)" },
            { transform:"translate3d(0,0,0)" }
          ]
        : [
            { transform:"translate3d(0,0,0)" },
            { transform:"translate3d(0,100%,0)" }
          ],
      {
        duration:open ? 450 : 400,
        easing:open ? "cubic-bezier(.22,1,.36,1)" : "cubic-bezier(.55,0,1,.45)",
        fill:"both"
      }
    );

    missionEditorMotion = motion;
    motion.finished.then(() => {
      if (missionEditorMotion !== motion) return;
      if (open) editorHost.classList.add("is-open");
      else editorHost.classList.remove("is-open");
      missionEditorMotion = null;
      editorHost.classList.remove("is-animating", "is-opening");
      try { motion.cancel(); } catch {}
    }).catch(() => {});
    return motion;
  }

  function getFolder(id){ return folders.find((folder) => String(folder.id) === String(id || "")) || null; }
  function getBreadcrumb(){ const out=[]; let cursor=getFolder(currentFolderId); while(cursor){ out.unshift(cursor); cursor=getFolder(cursor.parent_id); } return out; }

  return { renderMissionsView };
}

function compareByOrderAndName(a, b){
  const orderA = Number(a?.display_order) || 0;
  const orderB = Number(b?.display_order) || 0;
  if (orderA !== orderB) return orderA - orderB;
  return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", { sensitivity: "base" });
}
function compareByOrderAndTitle(a, b){
  const orderA = Number(a?.display_order) || 0;
  const orderB = Number(b?.display_order) || 0;
  if (orderA !== orderB) return orderA - orderB;
  return String(a?.title || "").localeCompare(String(b?.title || ""), "fr", { sensitivity: "base" });
}

function compareCatalogActivities(a, b){
  const orderA = Number(a?.display_order) || 0;
  const orderB = Number(b?.display_order) || 0;
  if (orderA !== orderB) return orderA - orderB;
  return String(a?.config_name || a?.title || "").localeCompare(String(b?.config_name || b?.title || ""), "fr", { sensitivity: "base" });
}

function normalizeMissionSearch(value){
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
