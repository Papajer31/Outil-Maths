import {
  buildActivityTreeState,
  buildVisibleActivityTree,
  normalizeTreeId
} from "./activity-tree.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";
import { loadQuizLocalState } from "./quiz-local-store.js";
import { openDashboardConfirmDialog } from "./confirm-dialog.js";
const QUIZ_ROOT_PERSONAL = "__quiz_root_personal";
const QUIZ_ROOT_SYSTEM = "__quiz_root_system";
const QUIZ_SUPABASE_IMPORT_MARKER = "site-outils.quiz-supabase-imported.v1";

export function createQuizExplorerViewController({
  view,
  header,
  list,
  createQuizButton,
  createSeriesButton,
  createFolderButton,
  onCreateQuiz,
  onCreateSeries,
  onOpenQuiz,
  getCurrentTeacherSpace,
  getIsSuperAdmin,
  listQuizFoldersForSpace,
  createQuizFolderForSpace,
  updateQuizFolder,
  deleteQuizFolder,
  listQuizzesForSpace,
  saveQuizForSpace,
  deleteQuiz,
  showToast
} = {}){
  let folders = [];
  let quizzes = [];
  let isLoading = false;
  let loadError = "";
  let currentOpenFolderId = null;
  const collapsedFolderIds = new Set();
  const knownFolderIds = new Set();

  function canEditSystemContent(){
    return getIsSuperAdmin?.() === true;
  }

  function getTeacherSpaceId(){
    const id = Number(getCurrentTeacherSpace?.()?.id);
    if (!Number.isSafeInteger(id) || id <= 0) {
      throw new Error("Aucun espace enseignant actif.");
    }
    return id;
  }

  async function reloadRemoteState(){
    const teacherSpaceId = getTeacherSpaceId();
    const [nextFolders, nextQuizzes] = await Promise.all([
      listQuizFoldersForSpace?.(teacherSpaceId),
      listQuizzesForSpace?.(teacherSpaceId)
    ]);
    folders = Array.isArray(nextFolders) ? nextFolders : [];
    quizzes = Array.isArray(nextQuizzes) ? nextQuizzes : [];
  }

  function getImportMarkerKey(teacherSpaceId){
    return `${QUIZ_SUPABASE_IMPORT_MARKER}.${teacherSpaceId}`;
  }

  function readImportMarker(teacherSpaceId){
    try {
      return globalThis.localStorage?.getItem(getImportMarkerKey(teacherSpaceId)) === "done";
    } catch {
      return false;
    }
  }

  function writeImportMarker(teacherSpaceId){
    try {
      globalThis.localStorage?.setItem(getImportMarkerKey(teacherSpaceId), "done");
    } catch {}
  }

  async function importLegacyLocalQuizzesIfNeeded(){
    const teacherSpaceId = getTeacherSpaceId();
    if (readImportMarker(teacherSpaceId)) return 0;

    const hasRemotePersonalData = folders.some((folder) => folder?.is_system !== true)
      || quizzes.some((quiz) => quiz?.is_system !== true);
    if (hasRemotePersonalData) {
      writeImportMarker(teacherSpaceId);
      return 0;
    }

    const legacy = loadQuizLocalState();
    const legacyFolders = (Array.isArray(legacy?.folders) ? legacy.folders : [])
      .filter((folder) => folder?.is_system !== true);
    const legacyQuizzes = (Array.isArray(legacy?.quizzes) ? legacy.quizzes : [])
      .filter((quiz) => quiz?.is_system !== true);

    if (!legacyFolders.length && !legacyQuizzes.length) {
      writeImportMarker(teacherSpaceId);
      return 0;
    }

    const folderIdMap = new Map();
    const pendingFolders = [...legacyFolders];
    let importedCount = 0;

    while (pendingFolders.length) {
      let progressed = false;
      for (let index = pendingFolders.length - 1; index >= 0; index -= 1) {
        const source = pendingFolders[index];
        const sourceParentId = String(source?.parent_id || "").trim();
        if (sourceParentId && !folderIdMap.has(sourceParentId)) continue;
        const created = await createQuizFolderForSpace?.(teacherSpaceId, {
          name: source?.name || "Dossier sans nom",
          parent_id: sourceParentId ? folderIdMap.get(sourceParentId) : null,
          display_order: Number(source?.display_order) || 0
        });
        if (!created) throw new Error("Import d’un dossier local impossible.");
        folderIdMap.set(String(source.id), String(created.id));
        pendingFolders.splice(index, 1);
        importedCount += 1;
        progressed = true;
      }

      if (!progressed) {
        const source = pendingFolders.pop();
        const created = await createQuizFolderForSpace?.(teacherSpaceId, {
          name: source?.name || "Dossier sans nom",
          parent_id: null,
          display_order: Number(source?.display_order) || 0
        });
        if (!created) throw new Error("Import d’un dossier local impossible.");
        folderIdMap.set(String(source.id), String(created.id));
        importedCount += 1;
      }
    }

    for (const source of legacyQuizzes) {
      const sourceFolderId = String(source?.folder_id || "").trim();
      const saved = await saveQuizForSpace?.(teacherSpaceId, {
        ...source,
        id: "",
        folder_id: sourceFolderId ? (folderIdMap.get(sourceFolderId) || null) : null,
        is_system: false
      });
      if (!saved) throw new Error("Import d’un quiz local impossible.");
      importedCount += 1;
    }

    writeImportMarker(teacherSpaceId);
    return importedCount;
  }

  function getExplorerFolders(){
    const roots = [
      {
        id: QUIZ_ROOT_PERSONAL,
        parent_id: null,
        name: "Quiz personnels",
        display_order: 0,
        is_virtual_root: true,
        is_system_root: false
      },
      {
        id: QUIZ_ROOT_SYSTEM,
        parent_id: null,
        name: "Quiz système",
        display_order: 1,
        is_virtual_root: true,
        is_system_root: true
      }
    ];

    const storedFolders = folders.map((folder, index) => ({
      ...folder,
      parent_id: String(folder?.parent_id ?? "").trim()
        || (folder?.is_system === true ? QUIZ_ROOT_SYSTEM : QUIZ_ROOT_PERSONAL),
      display_order: Number.isFinite(Number(folder?.display_order))
        ? Number(folder.display_order)
        : index
    }));

    return [...roots, ...storedFolders];
  }

  function getExplorerQuizzes(){
    return quizzes.map((quiz, index) => ({
      ...quiz,
      config_name: quiz?.title || "Quiz sans titre",
      folder_id: String(quiz?.folder_id ?? "").trim()
        || (quiz?.is_system === true ? QUIZ_ROOT_SYSTEM : QUIZ_ROOT_PERSONAL),
      display_order: Number.isFinite(Number(quiz?.display_order))
        ? Number(quiz.display_order)
        : index
    }));
  }

  function buildTreeState(){
    return buildActivityTreeState({
      activitiesSource: getExplorerQuizzes(),
      foldersSource: getExplorerFolders()
    });
  }

  function buildVisibleTree(){
    return buildVisibleActivityTree({
      activitiesSource: getExplorerQuizzes(),
      foldersSource: getExplorerFolders(),
      collapsedFolderIds,
      currentActivityMode: "quiz"
    });
  }

  function isSystemLocation(folderId = currentOpenFolderId){
    let cursorId = String(folderId || "");
    if (!cursorId) return false;
    if (cursorId === QUIZ_ROOT_SYSTEM) return true;
    const treeState = buildTreeState();
    let cursor = treeState.folderById.get(cursorId) || null;
    while (cursor) {
      if (cursor.is_system === true || String(cursor.id) === QUIZ_ROOT_SYSTEM) return true;
      const parentId = normalizeTreeId(cursor.parent_id);
      cursor = parentId ? (treeState.folderById.get(parentId) || null) : null;
    }
    return false;
  }

  function isVirtualRoot(folderId){
    const safeId = String(folderId || "");
    return safeId === QUIZ_ROOT_PERSONAL || safeId === QUIZ_ROOT_SYSTEM;
  }

  function syncKnownFolders(){
    const ids = new Set(folders.map((folder) => String(folder.id)));
    for (const id of Array.from(collapsedFolderIds)) {
      if (!ids.has(id) && !isVirtualRoot(id)) collapsedFolderIds.delete(id);
    }
    for (const id of Array.from(knownFolderIds)) {
      if (!ids.has(id)) knownFolderIds.delete(id);
    }
    ids.forEach((id) => {
      if (!knownFolderIds.has(id)) {
        knownFolderIds.add(id);
        collapsedFolderIds.add(id);
      }
    });
  }

  function getFolderById(folderId){
    const safeId = normalizeTreeId(folderId);
    if (!safeId) return null;
    return getExplorerFolders().find((folder) => String(folder.id) === safeId) || null;
  }

  function sanitizeCurrentFolder(treeState = buildTreeState()){
    const safeId = normalizeTreeId(currentOpenFolderId);
    if (!safeId || !treeState.folderById.has(safeId)) currentOpenFolderId = null;
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
      childQuizzes: treeState.activityChildren.get(parentId) || []
    };
  }

  function renderTreeFolderNode(node){
    const folder = node.item;
    const folderId = String(folder.id);
    const isSelected = normalizeTreeId(currentOpenFolderId) === folderId;
    const chevronIcon = node.isCollapsed ? "chevron_right" : "expand_more";

    return `
      <div
        class="dashboard-activity-tree-row dashboard-tree-node ${isSelected ? "is-selected" : ""}"
        data-node-type="folder"
        data-node-id="${escapeAttr(folderId)}"
        style="--dashboard-tree-depth:${Math.max(0, Number(node.depth) || 0)};"
      >
        <div class="dashboard-tree-indent" aria-hidden="true"></div>
        <button
          class="dashboard-folder-toggle-btn dashboard-material-icon-btn"
          type="button"
          data-action="toggle-folder"
          data-folder-id="${escapeAttr(folderId)}"
          title="${node.isCollapsed ? "Déplier le dossier" : "Replier le dossier"}"
          aria-label="${node.isCollapsed ? "Déplier le dossier" : "Replier le dossier"}"
        >
          <span class="dashboard-material-icon" aria-hidden="true">${chevronIcon}</span>
        </button>
        <button
          class="dashboard-activity-tree-main"
          type="button"
          data-action="open-folder"
          data-folder-id="${escapeAttr(folderId)}"
        >
          <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tree-node-label">${escapeHtml(folder.name || "")}</span>
        </button>
      </div>
    `;
  }

  function renderFolderTile(folder){
    const isVirtual = folder?.is_virtual_root === true;
    const canEdit = !isVirtual && (folder?.is_system !== true || canEditSystemContent());
    const actions = canEdit
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
      <article class="dashboard-activity-tile dashboard-activity-tile--folder" data-node-type="folder" data-node-id="${escapeAttr(folder.id)}">
        <button
          class="dashboard-activity-tile-surface dashboard-activity-tile-surface--folder"
          type="button"
          data-action="open-folder"
          data-folder-id="${escapeAttr(folder.id)}"
        >
          <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">folder</span>
          <span class="dashboard-activity-tile-title">${escapeHtml(folder.name || "")}</span>
        </button>
        ${actions}
      </article>
    `;
  }

  function renderParentTile(selectedFolder){
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

  function renderQuizTile(quiz){
    const quizId = String(quiz.id || "");
    const canEdit = quiz.is_system !== true || canEditSystemContent();
    const actions = canEdit
      ? `
        <div class="dashboard-activity-tile-actions dashboard-activity-tile-actions--activity">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="rename-quiz" data-quiz-id="${escapeAttr(quizId)}" title="Renommer le quiz" aria-label="Renommer le quiz">
            <span class="dashboard-material-icon" aria-hidden="true">edit</span>
          </button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-quiz" data-quiz-id="${escapeAttr(quizId)}" title="Supprimer le quiz" aria-label="Supprimer le quiz">
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>
        </div>
      `
      : "";

    const seriesBadge = String(quiz.editorMode || "") === "series"
      ? `<span class="dashboard-activity-tile-series-badge">Série · ${escapeHtml(String(quiz.seriesResponseType || "").replace("answer", "réponse").replace("qcm-text", "QCM").replace("selection-words", "sélection"))}</span>`
      : "";

    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--activity" data-node-type="quiz" data-node-id="${escapeAttr(quizId)}">
        <button
          class="dashboard-activity-tile-surface dashboard-activity-tile-surface--activity"
          type="button"
          data-action="open-quiz"
          data-quiz-id="${escapeAttr(quizId)}"
        >
          <span class="dashboard-activity-tile-topline">
            <span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">quiz</span>
          </span>
          <span class="dashboard-activity-tile-title">${escapeHtml(quiz.title || "Quiz sans titre")}</span>
          ${seriesBadge}
        </button>
        ${actions}
      </article>
    `;
  }

  function renderEmptyState(selectedFolder){
    const contextLabel = selectedFolder ? `dans « ${selectedFolder.name} »` : "à la racine";
    return `<div class="dashboard-activity-empty-state">Aucun quiz ${escapeHtml(contextLabel)}.</div>`;
  }

  function renderShell(treeState, visibleNodes){
    const { selectedFolder, childFolders, childQuizzes } = getCurrentFolderContents(treeState);
    const treeHtml = visibleNodes
      .filter((node) => node.type === "folder")
      .map(renderTreeFolderNode)
      .join("");
    const tilesHtml = [
      renderParentTile(selectedFolder),
      ...childFolders.map(renderFolderTile),
      ...childQuizzes.map(renderQuizTile)
    ].filter(Boolean).join("");

    return `
      <div class="dashboard-activities-explorer" style="--dashboard-tree-pane-width:18%;">
        <aside class="dashboard-activity-tree-pane panel">
          <div class="dashboard-activity-tree-list">
            <div class="dashboard-activity-tree-row dashboard-activity-tree-root ${currentOpenFolderId ? "" : "is-selected"}">
              <button class="dashboard-activity-tree-main dashboard-activity-tree-main--root" type="button" data-action="open-root">
                <span class="dashboard-material-icon dashboard-activity-tree-node-icon" aria-hidden="true">home</span>
                <span class="dashboard-activity-tree-node-label">Quiz</span>
              </button>
            </div>
            ${treeHtml || '<div class="dashboard-activity-tree-empty">Aucun dossier pour le moment.</div>'}
          </div>
        </aside>

        <div class="dashboard-activity-splitter" role="separator" aria-orientation="vertical" aria-label="Séparateur entre les panneaux"></div>

        <section class="dashboard-activity-tiles-pane panel">
          <div class="dashboard-activity-tiles-grid-wrap">
            <div class="dashboard-activity-tiles-grid">
              ${tilesHtml || renderEmptyState(selectedFolder)}
            </div>
          </div>
        </section>
      </div>
    `;
  }

  function updateActions(){
    const isSystem = isSystemLocation();
    const isGlobalRoot = !normalizeTreeId(currentOpenFolderId);
    const canCreate = !isGlobalRoot && (!isSystem || canEditSystemContent());
    const disabledTitle = isGlobalRoot
      ? "Sélectionne d’abord « Quiz personnels » ou l’un de ses dossiers."
      : "Les quiz système sont réservés au super-admin.";
    if (createQuizButton) {
      createQuizButton.disabled = !canCreate;
      createQuizButton.title = canCreate ? (isSystem ? "Créer un quiz système" : "Créer un quiz") : disabledTitle;
      const label = createQuizButton.querySelector("span:last-child");
      if (label) label.textContent = isSystem && canEditSystemContent() ? "Créer un quiz système" : "Créer un quiz";
    }
    if (createSeriesButton) {
      createSeriesButton.disabled = !canCreate;
      createSeriesButton.title = canCreate ? (isSystem ? "Créer une série système" : "Créer une série de questions") : disabledTitle;
      const label = createSeriesButton.querySelector("span:last-child");
      if (label) label.textContent = isSystem && canEditSystemContent() ? "Créer une série système" : "Créer une série de questions";
    }
    if (createFolderButton) {
      createFolderButton.disabled = !canCreate;
      createFolderButton.title = canCreate ? (isSystem ? "Créer un dossier système" : "Créer un dossier") : disabledTitle;
      createFolderButton.setAttribute("aria-label", createFolderButton.title);
    }
  }

  function render(){
    if (!list) return;
    if (isLoading) {
      list.classList.add("dashboard-explorer-host");
      list.innerHTML = '<div class="dashboard-activity-empty-state">Chargement des quiz…</div>';
      return;
    }
    if (loadError) {
      list.classList.add("dashboard-explorer-host");
      list.innerHTML = `<div class="dashboard-activity-empty-state">${escapeHtml(loadError)}</div>`;
      return;
    }
    syncKnownFolders();
    const { state, visibleNodes } = buildVisibleTree();
    sanitizeCurrentFolder(state);
    list.classList.add("dashboard-explorer-host");
    list.innerHTML = renderShell(state, visibleNodes);
    updateActions();
    bindRenderedEvents();
  }

  function toggleFolder(folderId){
    const safeId = String(folderId || "");
    if (!safeId) return;
    if (collapsedFolderIds.has(safeId)) collapsedFolderIds.delete(safeId);
    else collapsedFolderIds.add(safeId);
    render();
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
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Enter") {
        event.preventDefault();
        void submit();
      }
    });
    input?.focus();
    input?.select();
  }

  function createFolder(){
    if (!normalizeTreeId(currentOpenFolderId)) return;
    const isSystem = isSystemLocation();
    if (isSystem && !canEditSystemContent()) return;
    openNameOverlay({
      title: isSystem ? "Créer un dossier système" : "Créer un dossier",
      placeholder: "Nom du dossier",
      confirmLabel: "Créer",
      onConfirm: async (name) => {
        const parentId = isVirtualRoot(currentOpenFolderId) ? null : currentOpenFolderId;
        const siblings = folders.filter((folder) =>
          folder?.is_system === isSystem
          && normalizeTreeId(folder.parent_id) === normalizeTreeId(parentId)
        );
        const folder = await createQuizFolderForSpace?.(getTeacherSpaceId(), {
          name,
          parent_id: parentId,
          display_order: siblings.length,
          is_system: isSystem
        });
        if (!folder) throw new Error("Création du dossier impossible.");
        folders.push(folder);
        knownFolderIds.add(String(folder.id));
        collapsedFolderIds.add(String(folder.id));
        render();
        showToast?.("Dossier de quiz créé.");
      }
    });
  }

  function renameFolder(folderId){
    const folder = folders.find((item) => String(item.id) === String(folderId));
    if (!folder || (folder.is_system === true && !canEditSystemContent())) return;
    openNameOverlay({
      title: "Renommer le dossier",
      initialValue: folder.name || "",
      placeholder: "Nom du dossier",
      onConfirm: async (name) => {
        const updated = await updateQuizFolder?.(folder.id, { name, is_system: folder.is_system === true });
        if (!updated) throw new Error("Renommage impossible.");
        folders = folders.map((item) => String(item.id) === String(updated.id) ? updated : item);
        render();
        showToast?.("Dossier renommé.");
      }
    });
  }

  async function deleteFolder(folderId){
    const folder = folders.find((item) => String(item.id) === String(folderId));
    if (!folder || (folder.is_system === true && !canEditSystemContent())) return;
    const confirmed = await openDashboardConfirmDialog({
      title:"Supprimer le dossier",
      message:`Supprimer le dossier « ${folder.name} » ?`,
      confirmLabel:"Supprimer",
      danger:true
    });
    if (!confirmed) return;
    try {
      await deleteQuizFolder?.(folder.id, { is_system: folder.is_system === true });
      folders = folders.filter((item) => String(item.id) !== String(folder.id));
      if (String(currentOpenFolderId || "") === String(folder.id)) currentOpenFolderId = null;
      render();
      showToast?.("Dossier supprimé.");
    } catch (error) {
      const message = error?.code === "23503"
        ? "Ce dossier n’est pas vide et ne peut donc pas être supprimé."
        : (error?.message || "Suppression impossible.");
      showToast?.(message, { isError:true });
    }
  }

  function renameQuiz(quizId){
    const quiz = quizzes.find((item) => String(item.id) === String(quizId));
    if (!quiz || (quiz.is_system === true && !canEditSystemContent())) return;
    openNameOverlay({
      title: "Renommer le quiz",
      initialValue: quiz.title || "",
      placeholder: "Nom du quiz",
      onConfirm: async (title) => {
        const saved = await saveQuizForSpace?.(getTeacherSpaceId(), { ...quiz, title, is_system: quiz.is_system === true });
        if (!saved) throw new Error("Renommage impossible.");
        quizzes = quizzes.map((item) => String(item.id) === String(saved.id) ? saved : item);
        render();
        showToast?.("Quiz renommé.");
      }
    });
  }

  async function removeQuiz(quizId){
    const quiz = quizzes.find((item) => String(item.id) === String(quizId));
    if (!quiz || (quiz.is_system === true && !canEditSystemContent())) return;
    const confirmed = await openDashboardConfirmDialog({
      title:"Supprimer le quiz",
      message:`Supprimer le quiz « ${quiz.title || "Quiz sans titre"} » ?`,
      confirmLabel:"Supprimer",
      danger:true
    });
    if (!confirmed) return;
    try {
      await deleteQuiz?.(quiz.id, { is_system: quiz.is_system === true });
      quizzes = quizzes.filter((item) => String(item.id) !== String(quiz.id));
      render();
      showToast?.("Quiz supprimé.");
    } catch (error) {
      const message = error?.code === "23503"
        ? "Ce quiz est encore utilisé par une activité et ne peut pas être supprimé."
        : (error?.message || "Suppression impossible.");
      showToast?.(message, { isError:true });
    }
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
        toggleFolder(button.dataset.folderId);
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
    list?.querySelectorAll('[data-action="open-quiz"]').forEach((button) => {
      button.addEventListener("click", () => {
        const quiz = quizzes.find((item) => String(item.id) === String(button.dataset.quizId));
        if (quiz) onOpenQuiz?.(quiz);
      });
    });
    list?.querySelectorAll('[data-action="rename-quiz"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        renameQuiz(button.dataset.quizId);
      });
    });
    list?.querySelectorAll('[data-action="delete-quiz"]').forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        void removeQuiz(button.dataset.quizId);
      });
    });
  }

  createQuizButton?.addEventListener("click", () => {
    if (!normalizeTreeId(currentOpenFolderId)) return;
    const isSystem = isSystemLocation();
    if (isSystem && !canEditSystemContent()) return;
    const folderId = isVirtualRoot(currentOpenFolderId) ? null : currentOpenFolderId;
    onCreateQuiz?.({ folderId, isSystem });
  });
  createSeriesButton?.addEventListener("click", () => {
    if (!normalizeTreeId(currentOpenFolderId)) return;
    const isSystem = isSystemLocation();
    if (isSystem && !canEditSystemContent()) return;
    const folderId = isVirtualRoot(currentOpenFolderId) ? null : currentOpenFolderId;
    onCreateSeries?.({ folderId, isSystem });
  });
  createFolderButton?.addEventListener("click", createFolder);

  async function saveQuiz(quiz = {}){
    const isSystem = quiz?.is_system === true;
    if (isSystem && !canEditSystemContent()) throw new Error("La modification des quiz système est réservée au super-admin.");
    const folderId = isVirtualRoot(quiz.folder_id) ? null : normalizeTreeId(quiz.folder_id);
    const saved = await saveQuizForSpace?.(getTeacherSpaceId(), {
      ...quiz,
      folder_id: folderId,
      display_order: quiz.display_order != null && Number.isFinite(Number(quiz.display_order))
        ? Number(quiz.display_order)
        : quizzes.filter((item) => item.is_system === isSystem).length,
      is_system: isSystem
    });
    if (!saved) throw new Error("Enregistrement Supabase impossible.");
    const index = quizzes.findIndex((item) => String(item.id) === String(saved.id));
    if (index >= 0) quizzes.splice(index, 1, saved);
    else quizzes.push(saved);
    render();
    return saved;
  }

  function addQuiz(quiz = {}){
    return saveQuiz(quiz);
  }

  async function refresh(){
    isLoading = true;
    loadError = "";
    render();
    try {
      await reloadRemoteState();
      const importedCount = await importLegacyLocalQuizzesIfNeeded();
      if (importedCount > 0) {
        await reloadRemoteState();
        showToast?.(`${importedCount} élément${importedCount > 1 ? "s" : ""} local${importedCount > 1 ? "aux" : ""} importé${importedCount > 1 ? "s" : ""} dans Supabase.`);
      }
    } catch (error) {
      console.error("Impossible de charger les quiz Supabase.", error);
      loadError = error?.message || "Impossible de charger les quiz.";
      showToast?.(loadError, { isError: true });
    } finally {
      isLoading = false;
      render();
    }
  }

  return {
    refresh,
    render,
    addQuiz,
    saveQuiz,
    getCurrentFolderId: () => currentOpenFolderId,
    isWorkshopOpen: () => view?.classList.contains("is-quiz-workshop-open") === true
  };
}
