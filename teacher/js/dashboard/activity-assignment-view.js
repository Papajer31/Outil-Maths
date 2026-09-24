import { isIntrinsicCatalogActivity, normalizeCatalogActivity } from "../../../shared/catalogue.js";
import { bindStepperField, renderStepperField } from "../../../shared/config-widgets.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";
import { openDashboardConfirmDialog } from "./confirm-dialog.js";

const LEVELS = [1, 2, 3, 4, 5];

export function createActivityAssignmentViewController({
  view,
  getCurrentTeacherSpace,
  listCatalogActivitiesForTeacherSpace,
  listPedagogicalNodesForTeacher,
  listTeacherActivitiesForSpace,
  listTeacherActivityFoldersForSpace,
  listTeacherSequencesForSpace,
  listTeacherClasses,
  listStudentsForTeacherSpace,
  listActivityAssignmentsForSpace,
  saveActivityAssignmentForSpace,
  setActivityAssignmentActive,
  reassignActivityAssignment,
  deleteActivityAssignment,
  onBack,
  showToast
} = {}) {
  let catalogActivities = [];
  let catalogNodes = [];
  let teacherActivities = [];
  let teacherActivityFolders = [];
  let sequences = [];
  let classes = [];
  let students = [];
  let assignments = [];
  let loadedSpaceId = "";
  let loadError = "";

  let drawerOpen = false;
  let animateDrawerOnNextRender = false;
  let drawerMotion = null;
  let pickerBranch = null; // null | activities | sequences
  let activitySourceType = null; // null | catalog_activity | teacher_activity
  let catalogPickerFolderId = null;
  let teacherPickerFolderId = null;
  let searchQuery = "";
  let selectedSourceType = ""; // catalog_activity | teacher_activity | sequence
  let selectedSourceId = "";
  let selectedDifficulty = "adaptive";
  let executionMode = "questions";
  let executionValue = 5;
  let selectedTargets = new Map();
  let editingAssignmentId = "";

  async function render({ forceRefresh = false, preselect = null } = {}) {
    const space = getCurrentTeacherSpace?.();
    const spaceId = String(space?.id || "");
    if (!view) return;
    if (!spaceId) {
      view.innerHTML = `<div class="dashboard-activity-empty-state">Crée d’abord ton code de connexion.</div>`;
      return;
    }

    if (forceRefresh || loadedSpaceId !== spaceId) {
      view.innerHTML = `<div class="dashboard-activity-empty-state">Chargement des activités attribuées…</div>`;
      await refreshData();
      loadedSpaceId = spaceId;
    }

    if (preselect?.sourceType && preselect?.sourceId) {
      openAssignmentDrawer(preselect);
    } else if (!preselect) {
      drawerOpen = false;
    }

    renderView();
  }

  async function refreshData() {
    const space = getCurrentTeacherSpace?.();
    if (!space?.id) return;
    loadError = "";
    try {
      const results = await Promise.all([
        listCatalogActivitiesForTeacherSpace?.(space.id) || [],
        listPedagogicalNodesForTeacher?.() || [],
        listTeacherActivitiesForSpace?.(space.id) || [],
        listTeacherActivityFoldersForSpace?.(space.id) || [],
        listTeacherSequencesForSpace?.(space.id) || [],
        listTeacherClasses?.(space.id) || [],
        listStudentsForTeacherSpace?.(space.id) || [],
        listActivityAssignmentsForSpace?.(space.id) || []
      ]);
      catalogActivities = Array.isArray(results[0]) ? results[0] : [];
      catalogNodes = Array.isArray(results[1]) ? results[1] : [];
      teacherActivities = Array.isArray(results[2]) ? results[2] : [];
      teacherActivityFolders = Array.isArray(results[3]) ? results[3] : [];
      sequences = Array.isArray(results[4]) ? results[4] : [];
      classes = Array.isArray(results[5]) ? results[5] : [];
      students = Array.isArray(results[6]) ? results[6] : [];
      assignments = Array.isArray(results[7]) ? results[7] : [];
    } catch (error) {
      console.error(error);
      loadError = error?.message || "Impossible de charger les activités attribuées.";
      assignments = [];
    }
  }

  function renderView({ preserveOverviewScroll = false, anchorAssignmentId = "" } = {}) {
    const previousOverview = preserveOverviewScroll ? view.querySelector(".activity-assignment-overview") : null;
    const previousScrollTop = previousOverview?.scrollTop || 0;
    const previousAnchor = anchorAssignmentId
      ? previousOverview?.querySelector(`[data-assignment-row-id="${CSS.escape(String(anchorAssignmentId))}"]`)
      : null;
    const previousAnchorOffset = previousAnchor && previousOverview
      ? previousAnchor.getBoundingClientRect().top - previousOverview.getBoundingClientRect().top
      : null;
    view.innerHTML = `
      <div class="activity-assignment-shell">
        <div class="activity-assignment-header">
          <button class="dashboard-back-btn dashboard-material-icon-btn" type="button" data-action="back" title="Retour aux activités" aria-label="Retour aux activités">
            <span class="dashboard-material-icon" aria-hidden="true">arrow_back</span>
          </button>
          <div class="dashboard-section-title">Activités attribuées</div>
          <div class="activity-assignment-header-spacer"></div>
          <button class="btn primary dashboard-btn-with-icon" type="button" data-action="open-assignment-drawer">
            <span class="dashboard-material-icon" aria-hidden="true">assignment_ind</span>
            <span>Attribuer des activités</span>
          </button>
        </div>

        ${loadError ? `<div class="modal-message error">${escapeHtml(loadError)}<br><small>Vérifie que les migrations SQL 49, 50 et 54 ont bien été appliquées.</small></div>` : ""}

        <section class="activity-assignment-overview">
          ${renderCurrentAssignments()}
        </section>

        ${drawerOpen ? renderAssignmentDrawer() : ""}
      </div>
    `;
    bindEvents();
    if (preserveOverviewScroll) {
      const nextOverview = view.querySelector(".activity-assignment-overview");
      if (nextOverview) {
        nextOverview.scrollTop = previousScrollTop;
        const nextAnchor = anchorAssignmentId
          ? nextOverview.querySelector(`[data-assignment-row-id="${CSS.escape(String(anchorAssignmentId))}"]`)
          : null;
        if (nextAnchor && previousAnchorOffset !== null) {
          const nextAnchorOffset = nextAnchor.getBoundingClientRect().top - nextOverview.getBoundingClientRect().top;
          nextOverview.scrollTop += nextAnchorOffset - previousAnchorOffset;
        }
      }
    }
    const openingDrawer = view.querySelector(".activity-assignment-drawer.is-opening");
    openingDrawer?.addEventListener("animationend", () => openingDrawer.classList.remove("is-opening"), { once:true });
    animateDrawerOnNextRender = false;
  }

  function renderCurrentAssignments() {
    if (!assignments.length) {
      return `
        <div class="activity-assignment-empty">
          <div class="activity-assignment-empty-card panel">
            <span class="dashboard-material-icon" aria-hidden="true">assignment_ind</span>
            <strong>Aucune activité attribuée</strong>
            <p>Les activités et séquences actuellement proposées aux élèves apparaîtront ici.</p>
            <button class="btn primary dashboard-btn-with-icon" type="button" data-action="open-assignment-drawer">
              <span class="dashboard-material-icon" aria-hidden="true">add</span>
              <span>Attribuer des activités</span>
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="activity-assignment-current-list activity-assignment-current-list--overview">
        ${assignments.map((assignment) => {
          const assignedStudents = getAssignmentStudents(assignment);
          const isActive = assignment?.is_active !== false;
          const completedStudentIds = new Set((Array.isArray(assignment?.completions) ? assignment.completions : [])
            .map((completion) => String(completion?.student_id || ""))
            .filter(Boolean));
          return `
            <div class="activity-assignment-current-row activity-assignment-current-row--overview${isActive ? "" : " is-paused"}" data-assignment-row-id="${escapeAttr(assignment.id)}">
              <button class="activity-assignment-current-main activity-assignment-edit-trigger" type="button" data-action="edit-assignment" data-assignment-id="${escapeAttr(assignment.id)}" aria-label="Modifier l’attribution ${escapeAttr(assignment.title_snapshot || "Activité")}">
                <span class="activity-assignment-current-title-row">
                  <strong class="activity-assignment-current-title">${escapeHtml(assignment.title_snapshot || "Activité")}</strong>
                  ${isActive ? "" : `<span class="activity-assignment-current-status"><span class="dashboard-material-icon" aria-hidden="true">pause</span>En pause</span>`}
                </span>
                <span class="activity-assignment-current-students" aria-label="Élèves destinataires">
                  ${assignedStudents.length
                    ? assignedStudents.map((student) => {
                        const completed = completedStudentIds.has(String(student.id || ""));
                        return `<span class="activity-assignment-current-student${completed ? " is-completed" : ""}"><span>${escapeHtml(student.first_name || "Élève")}</span>${completed ? `<span class="dashboard-material-icon activity-assignment-completion-icon" aria-label="Activité effectuée" title="Activité effectuée">check_circle</span>` : ""}</span>`;
                      }).join("")
                    : `<span class="dashboard-muted-text">Aucun élève destinataire</span>`}
                </span>
              </button>
              <div class="activity-assignment-current-actions" aria-label="Actions de l’attribution">
                <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="duplicate-assignment" data-assignment-id="${escapeAttr(assignment.id)}" title="Dupliquer l’attribution" aria-label="Dupliquer l’attribution ${escapeAttr(assignment.title_snapshot || "Activité")}">
                  <span class="dashboard-material-icon" aria-hidden="true">content_copy</span>
                </button>
                <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="reassign-assignment" data-assignment-id="${escapeAttr(assignment.id)}" title="Réattribuer aux élèves" aria-label="Réattribuer ${escapeAttr(assignment.title_snapshot || "Activité")}">
                  <span class="dashboard-material-icon" aria-hidden="true">restart_alt</span>
                </button>
                <button class="dashboard-icon-btn dashboard-material-icon-btn activity-assignment-state-action${isActive ? "" : " is-resume"}" type="button" data-action="toggle-assignment-active" data-assignment-id="${escapeAttr(assignment.id)}" title="${isActive ? "Suspendre l’attribution" : "Réactiver l’attribution"}" aria-label="${isActive ? "Suspendre l’attribution" : "Réactiver l’attribution"} ${escapeAttr(assignment.title_snapshot || "Activité")}">
                  <span class="dashboard-material-icon" aria-hidden="true">${isActive ? "pause" : "play_arrow"}</span>
                </button>
                <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-assignment" data-assignment-id="${escapeAttr(assignment.id)}" title="Retirer cette attribution" aria-label="Retirer cette attribution">
                  <span class="dashboard-material-icon" aria-hidden="true">delete</span>
                </button>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderAssignmentDrawer() {
    const selected = getSelectedSource();
    return `
      <aside class="activity-assignment-drawer${animateDrawerOnNextRender ? " is-opening" : ""}" role="dialog" aria-modal="true" aria-labelledby="activityAssignmentDrawerTitle">
        <header class="activity-assignment-drawer-header">
          <div id="activityAssignmentDrawerTitle" class="dashboard-section-title">${editingAssignmentId ? "Modifier l’attribution" : "Attribuer des activités"}</div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="close-assignment-drawer" title="Fermer" aria-label="Fermer le volet">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </header>

        <div class="activity-assignment-drawer-body">
          <section class="panel activity-assignment-source-column">
            <div class="dashboard-sequence-panel-heading">SÉLECTION</div>
            <label class="dashboard-mission-catalog-search">
              <span class="dashboard-material-icon" aria-hidden="true">search</span>
              <input class="modal-text-input" type="search" data-assignment-search value="${escapeAttr(searchQuery)}" placeholder="Rechercher une activité ou une séquence…" autocomplete="off">
            </label>
            <div id="activityAssignmentBreadcrumb" class="dashboard-sequence-picker-breadcrumb-slot">${renderSelectionBreadcrumb()}</div>
            <div id="activityAssignmentSourcePicker" class="dashboard-mission-catalog-results dashboard-sequence-source-results activity-assignment-source-list">${renderSelectionPicker()}</div>
          </section>

          <section class="panel activity-assignment-config-column">
            <div class="dashboard-sequence-panel-heading">ATTRIBUTION</div>
            <div id="activityAssignmentConfigContent" class="activity-assignment-config-content">${selected ? renderAssignmentConfig(selected) : ""}</div>
          </section>
        </div>
      </aside>
    `;
  }

  function renderSelectionPicker() {
    const query = normalizeSearch(searchQuery);
    if (query) return renderSelectionSearchResults(query);
    if (!pickerBranch) return `
      ${renderSelectionRoot("activities", "Activités", "extension")}
      ${renderSelectionRoot("sequences", "Séquences", "account_tree")}
    `;
    if (pickerBranch === "sequences") return renderSequencePicker();
    if (!activitySourceType) return `
      ${renderSelectionParent("picker-root", null)}
      ${renderSelectionRoot("catalog_activity", "Activités du site", "account_tree", "open-activity-source")}
      ${renderSelectionRoot("teacher_activity", "Mes activités", "folder_shared", "open-activity-source")}
    `;
    return activitySourceType === "teacher_activity" ? renderTeacherActivityPicker() : renderCatalogActivityPicker();
  }

  function renderSelectionSearchResults(query) {
    const includeCatalog = !pickerBranch || (pickerBranch === "activities" && (!activitySourceType || activitySourceType === "catalog_activity"));
    const includePersonal = !pickerBranch || (pickerBranch === "activities" && (!activitySourceType || activitySourceType === "teacher_activity"));
    const includeSequences = !pickerBranch || pickerBranch === "sequences";
    const rows = [];
    if (includeCatalog) {
      rows.push(...getEligibleCatalogActivities()
        .filter((activity) => normalizeSearch(`${getSourceTitle(activity)} ${getCatalogActivityPath(activity)}`).includes(query))
        .sort(compareByOrderAndTitle)
        .map((activity) => renderSelectableSource(activity, "catalog_activity", getCatalogActivityPath(activity))));
    }
    if (includePersonal) {
      rows.push(...teacherActivities
        .filter((activity) => normalizeSearch(`${getSourceTitle(activity)} ${getTeacherItemPath(activity)}`).includes(query))
        .sort(compareByOrderAndTitle)
        .map((activity) => renderSelectableSource(activity, "teacher_activity", getTeacherItemPath(activity))));
    }
    if (includeSequences) {
      rows.push(...sequences
        .filter((sequence) => normalizeSearch(`${getSourceTitle(sequence)} ${getTeacherItemPath(sequence)}`).includes(query))
        .sort(compareByOrderAndTitle)
        .map((sequence) => renderSelectableSource(sequence, "sequence", getTeacherItemPath(sequence))));
    }
    return rows.join("") || `<div class="dashboard-activity-empty-state">Aucun résultat.</div>`;
  }

  function renderCatalogActivityPicker() {
    const currentNode = getCatalogNode(catalogPickerFolderId);
    const childNodes = catalogNodes
      .filter((node) => String(node?.parent_id || "") === String(currentNode?.id || ""))
      .sort(compareByOrderAndName);
    const activities = getEligibleCatalogActivities()
      .filter((activity) => String(activity?.pedagogical_node_id || activity?.folder_id || "") === String(currentNode?.id || ""))
      .sort(compareByOrderAndTitle);
    return `
      ${currentNode
        ? renderSelectionParent(currentNode.parent_id ? "catalog-node" : "catalog-root", currentNode.parent_id)
        : renderSelectionParent("activities-root", null)}
      ${childNodes.map((node) => renderSelectionFolder(node, "catalog-node")).join("")}
      ${activities.map((activity) => renderSelectableSource(activity, "catalog_activity")).join("")}
      ${currentNode && !childNodes.length && !activities.length ? `<div class="dashboard-activity-empty-state">Aucune activité dans ce dossier.</div>` : ""}
    `;
  }

  function renderTeacherActivityPicker() {
    const currentFolder = getTeacherActivityFolder(teacherPickerFolderId);
    const childFolders = teacherActivityFolders
      .filter((folder) => String(folder?.parent_id || "") === String(currentFolder?.id || ""))
      .sort(compareByOrderAndName);
    const activities = teacherActivities
      .filter((activity) => String(activity?.folder_id || "") === String(currentFolder?.id || ""))
      .sort(compareByOrderAndTitle);
    return `
      ${currentFolder
        ? renderSelectionParent(currentFolder.parent_id ? "teacher-folder" : "teacher-root", currentFolder.parent_id)
        : renderSelectionParent("activities-root", null)}
      ${childFolders.map((folder) => renderSelectionFolder(folder, "teacher-folder")).join("")}
      ${activities.map((activity) => renderSelectableSource(activity, "teacher_activity")).join("")}
      ${currentFolder && !childFolders.length && !activities.length ? `<div class="dashboard-activity-empty-state">Aucune activité dans ce dossier.</div>` : ""}
    `;
  }

  function renderSequencePicker() {
    const currentFolder = getTeacherActivityFolder(teacherPickerFolderId);
    const childFolders = teacherActivityFolders
      .filter((folder) => String(folder?.parent_id || "") === String(currentFolder?.id || ""))
      .sort(compareByOrderAndName);
    const folderSequences = sequences
      .filter((sequence) => String(sequence?.folder_id || "") === String(currentFolder?.id || ""))
      .sort(compareByOrderAndTitle);
    return `
      ${currentFolder
        ? renderSelectionParent(currentFolder.parent_id ? "sequence-folder" : "sequence-root", currentFolder.parent_id)
        : renderSelectionParent("picker-root", null)}
      ${childFolders.map((folder) => renderSelectionFolder(folder, "sequence-folder")).join("")}
      ${folderSequences.map((sequence) => renderSelectableSource(sequence, "sequence")).join("")}
      ${currentFolder && !childFolders.length && !folderSequences.length ? `<div class="dashboard-activity-empty-state">Aucune séquence dans ce dossier.</div>` : ""}
    `;
  }

  function renderSelectionRoot(value, label, icon, action = "open-branch") {
    return `<button class="dashboard-mission-catalog-folder dashboard-sequence-source-root" type="button" data-assignment-picker-action="${action}" data-picker-value="${value}"><span class="dashboard-material-icon" aria-hidden="true">${icon}</span><span>${label}</span><span class="dashboard-material-icon dashboard-mission-catalog-chevron" aria-hidden="true">chevron_right</span></button>`;
  }

  function renderSelectionParent(action, folderId) {
    return `<button class="dashboard-mission-catalog-folder dashboard-mission-catalog-folder--parent" type="button" data-assignment-picker-action="${action}" ${folderId ? `data-folder-id="${escapeAttr(folderId)}"` : ""}><span class="dashboard-material-icon" aria-hidden="true">arrow_upward</span><span>Dossier parent</span></button>`;
  }

  function renderSelectionFolder(folder, action) {
    return `<button class="dashboard-mission-catalog-folder" type="button" data-assignment-picker-action="${action}" data-folder-id="${escapeAttr(folder.id)}"><span class="dashboard-material-icon" aria-hidden="true">folder</span><span>${escapeHtml(getFolderLabel(folder))}</span><span class="dashboard-material-icon dashboard-mission-catalog-chevron" aria-hidden="true">chevron_right</span></button>`;
  }

  function renderSelectableSource(source, sourceType, meta = "") {
    const sourceId = sourceType === "sequence" ? String(source?.id || "") : getSourceId(source);
    const selected = sourceType === selectedSourceType && sourceId === String(selectedSourceId);
    const icon = sourceType === "sequence" ? "account_tree" : sourceType === "teacher_activity" ? getPersonalTypeIcon(source) : "extension";
    return `
      <button class="dashboard-mission-catalog-activity dashboard-sequence-source-item activity-assignment-picker-item${selected ? " is-selected" : ""}" type="button" data-source-type="${escapeAttr(sourceType)}" data-source-id="${escapeAttr(sourceId)}">
        <span class="dashboard-material-icon" aria-hidden="true">${icon}</span>
        <span class="dashboard-mission-catalog-activity-copy">
          <strong>${escapeHtml(getSourceTitle(source))}</strong>
          ${meta ? `<small>${escapeHtml(meta)}</small>` : ""}
        </span>
      </button>
    `;
  }

  function renderSelectionBreadcrumb() {
    if (searchQuery || !pickerBranch) return "";
    if (pickerBranch === "sequences") {
      return renderBreadcrumb([
        { label:"Séquences", action:"sequence-root" },
        { label:"Mes activités", action:"sequence-root" },
        ...getTeacherActivityBreadcrumb(teacherPickerFolderId).map((folder) => ({ label:getFolderLabel(folder), action:"sequence-folder", folderId:folder.id }))
      ]);
    }
    const crumbs = [{ label:"Activités", action:"activities-root" }];
    if (activitySourceType === "catalog_activity") {
      crumbs.push(
        { label:"Activités du site", action:"catalog-root" },
        ...getCatalogBreadcrumb(catalogPickerFolderId).map((node) => ({ label:getFolderLabel(node), action:"catalog-node", folderId:node.id }))
      );
    } else if (activitySourceType === "teacher_activity") {
      crumbs.push(
        { label:"Mes activités", action:"teacher-root" },
        ...getTeacherActivityBreadcrumb(teacherPickerFolderId).map((folder) => ({ label:getFolderLabel(folder), action:"teacher-folder", folderId:folder.id }))
      );
    }
    return renderBreadcrumb(crumbs);
  }

  function renderBreadcrumb(crumbs) {
    const safeCrumbs = crumbs.filter((crumb) => crumb?.label);
    if (!safeCrumbs.length) return "";
    const renderCrumb = (crumb, current = false) => `<button class="dashboard-breadcrumb-btn${current ? " is-current" : ""}" type="button" data-assignment-picker-action="${crumb.action}" ${crumb.folderId ? `data-folder-id="${escapeAttr(crumb.folderId)}"` : ""}>${escapeHtml(crumb.label)}</button>`;
    const separator = () => `<span class="dashboard-breadcrumb-separator" aria-hidden="true">›</span>`;
    const content = safeCrumbs.length > 3
      ? [
          `<details class="dashboard-breadcrumb-overflow"><summary class="dashboard-breadcrumb-btn dashboard-breadcrumb-overflow-trigger" aria-label="Afficher le chemin complet" title="Afficher le chemin complet">…</summary><div class="dashboard-breadcrumb-overflow-menu">${safeCrumbs.map((crumb, index) => renderCrumb(crumb, index === safeCrumbs.length - 1)).join("")}</div></details>`,
          separator(),
          renderCrumb(safeCrumbs[safeCrumbs.length - 2]),
          separator(),
          renderCrumb(safeCrumbs[safeCrumbs.length - 1], true)
        ].join("")
      : safeCrumbs.flatMap((crumb, index) => [index ? separator() : "", renderCrumb(crumb, index === safeCrumbs.length - 1)]).join("");
    return `<nav class="dashboard-breadcrumb dashboard-sequence-picker-breadcrumb" aria-label="Arborescence de la sélection">${content}</nav>`;
  }

  function renderAssignmentConfig(source) {
    const isSequence = selectedSourceType === "sequence";
    const title = getSelectedSourceTitle(source);

    if (isSequence) {
      return `
        <div class="activity-assignment-config-head">
          <div class="dashboard-section-title activity-assignment-selected-title">${escapeHtml(title)}</div>
        </div>
        ${renderRecipientsSection()}
        <section class="activity-assignment-panel-block activity-assignment-rules-block">
          <div class="activity-assignment-block-title">Règles de passation</div>
          <div class="activity-assignment-sequence-note">Les réglages de difficulté et de durée sont déjà définis activité par activité dans la séquence.</div>
        </section>
        ${renderSubmitButton(editingAssignmentId ? "Enregistrer" : "Attribuer la séquence")}
      `;
    }

    const intrinsic = isSourceIntrinsic(selectedSourceType, source);
    const adaptiveAvailable = isAdaptiveAvailableFor(selectedSourceType, source);
    if (intrinsic) executionMode = "intrinsic";
    else if (executionMode === "intrinsic") executionMode = "questions";
    if (!adaptiveAvailable && selectedDifficulty === "adaptive") selectedDifficulty = "3";

    return `
      <div class="activity-assignment-config-head">
        <div class="dashboard-section-title activity-assignment-selected-title">${escapeHtml(title)}</div>
      </div>

      ${renderRecipientsSection()}
      <section class="activity-assignment-panel-block activity-assignment-rules-block">
        <div class="activity-assignment-block-title">Règles de passation</div>
        ${renderDifficultyAndExecutionFields({
          adaptiveAvailable,
          selectedDifficulty,
          intrinsic,
          executionMode,
          executionValue,
          prefix:"activityAssignment"
        })}
      </section>
      ${renderSubmitButton(editingAssignmentId ? "Enregistrer" : "Attribuer")}
    `;
  }

  function renderSubmitButton(label) {
    return `
      <div class="activity-assignment-submit-row">
        <button class="btn primary dashboard-btn-with-icon" type="button" data-action="assign-selected" ${selectedTargets.size ? "" : "disabled"}>
          <span class="dashboard-material-icon" aria-hidden="true">assignment_ind</span>
          <span>${escapeHtml(label)}</span>
        </button>
      </div>
    `;
  }

  function renderDifficultyAndExecutionFields({ adaptiveAvailable, selectedDifficulty: difficulty, intrinsic, executionMode: mode, executionValue: value, prefix }) {
    const difficultyId = `${prefix}Difficulty`;
    const executionModeId = `${prefix}ExecutionMode`;
    const executionValueId = `${prefix}ExecutionValue`;
    const displayedValue = mode === "time" ? Math.max(1, Math.round(value / 60)) : Math.max(1, Number(value) || 5);
    return `
      <div class="dashboard-mission-step-settings activity-assignment-rules-line">
        <div class="dashboard-mission-step-difficulty">
          <label class="dashboard-mission-step-setting-label" for="${difficultyId}">Difficulté :</label>
          <select id="${difficultyId}" class="student-select dashboard-mission-step-difficulty-select" data-config-field="difficulty">
            ${adaptiveAvailable
              ? `<option value="adaptive"${difficulty === "adaptive" ? " selected" : ""}>Adaptative</option>${LEVELS.map((level) => `<option value="${level}"${String(difficulty) === String(level) ? " selected" : ""}>N${level}</option>`).join("")}`
              : `<option value="3" selected>Unique</option>`}
          </select>
        </div>
        ${intrinsic ? `
          <div class="dashboard-mission-step-limit is-intrinsic">
            <span class="dashboard-mission-step-setting-label">Passation :</span>
            <span>Contenu complet</span>
          </div>
        ` : `
          <div class="dashboard-mission-step-limit">
            <label class="dashboard-mission-step-setting-label" for="${executionModeId}">Passation :</label>
            <select id="${executionModeId}" class="student-select dashboard-mission-step-limit-mode" data-config-field="execution-mode">
              <option value="questions"${mode === "questions" ? " selected" : ""}>Questions</option>
              <option value="time"${mode === "time" ? " selected" : ""}>Temps</option>
            </select>
            ${renderStepperField({
              id:executionValueId,
              label:mode === "time" ? "Durée en minutes" : "Nombre de questions",
              value:displayedValue,
              inputMin:1,
              inputMax:mode === "time" ? 120 : 200,
              step:1,
              fieldClassName:"dashboard-sequence-limit-stepper"
            })}
            <span class="dashboard-mission-step-limit-unit">${mode === "time" ? "min" : "questions"}</span>
          </div>
        `}
      </div>
    `;
  }

  function renderRecipientsSection() {
    return `
      <section class="activity-assignment-panel-block activity-assignment-recipients-block">
        <div class="activity-assignment-block-title">Destinataires</div>
        <div class="activity-assignment-recipients">
          ${classes.map((teacherClass) => renderClassRecipients(teacherClass)).join("") || `<div class="dashboard-activity-empty-state">Aucune classe.</div>`}
        </div>
      </section>
    `;
  }

  function renderClassRecipients(teacherClass) {
    const classId = String(teacherClass?.id || "");
    const classKey = `class:${classId}`;
    const wholeClass = selectedTargets.has(classKey);
    const classStudents = students.filter((student) => String(student.teacher_class_id || "") === classId);
    return `
      <div class="activity-assignment-class-group" data-recipient-class-id="${escapeAttr(classId)}">
        ${classes.length > 1 ? `<div class="activity-assignment-class-name">${escapeHtml(teacherClass?.name || "Classe")}</div>` : ""}
        <div class="activity-assignment-whole-class-row">
          <label class="dashboard-mission-assignment-option activity-assignment-recipient--class">
            <input type="checkbox" data-target-type="class" data-target-id="${escapeAttr(classId)}" data-class-id="${escapeAttr(classId)}" ${wholeClass ? "checked" : ""}>
            <span>Toute la classe</span>
          </label>
        </div>
        <div class="activity-assignment-student-list">
          ${classStudents.map((student) => {
            const key = `student:${student.id}`;
            return `<label class="dashboard-mission-assignment-option activity-assignment-recipient"><input type="checkbox" data-target-type="student" data-target-id="${escapeAttr(student.id)}" data-class-id="${escapeAttr(classId)}" ${wholeClass || selectedTargets.has(key) ? "checked" : ""}><span>${escapeHtml(student.first_name || "Élève")}</span></label>`;
          }).join("") || `<span class="dashboard-muted-text">Aucun élève.</span>`}
        </div>
      </div>
    `;
  }

  function bindEvents() {
    view.querySelector("[data-action='back']")?.addEventListener("click", () => onBack?.());
    view.querySelectorAll("[data-action='open-assignment-drawer']").forEach((button) => button.addEventListener("click", () => {
      openAssignmentDrawer();
      renderView();
    }));
    view.querySelectorAll("[data-action='close-assignment-drawer']").forEach((button) => button.addEventListener("click", () => {
      dismissAssignmentDrawer();
    }));
    view.querySelectorAll("[data-action='delete-assignment']").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      removeAssignment(button.dataset.assignmentId);
    }));
    view.querySelectorAll("[data-action='duplicate-assignment']").forEach((button) => button.addEventListener("click", () => {
      runTileAction(button, () => duplicateAssignment(button.dataset.assignmentId));
    }));
    view.querySelectorAll("[data-action='reassign-assignment']").forEach((button) => button.addEventListener("click", () => {
      runTileAction(button, () => reassignExistingAssignment(button.dataset.assignmentId));
    }));
    view.querySelectorAll("[data-action='toggle-assignment-active']").forEach((button) => button.addEventListener("click", () => {
      runTileAction(button, () => toggleAssignmentActive(button.dataset.assignmentId));
    }));
    view.querySelectorAll("[data-action='edit-assignment']").forEach((row) => {
      row.addEventListener("click", () => {
        openAssignmentForEdit(row.dataset.assignmentId);
        renderView();
      });
    });

    if (!drawerOpen) return;
    const drawer = view.querySelector(".activity-assignment-drawer");
    view.querySelector("[data-assignment-search]")?.addEventListener("input", (event) => {
      searchQuery = String(event.target?.value || "");
      renderSelectionPickerIntoHost();
    });
    drawer?.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const pickerButton = target?.closest("[data-assignment-picker-action]");
      if (pickerButton) {
        handleSelectionNavigation(pickerButton);
        return;
      }
      const sourceButton = target?.closest("[data-source-type][data-source-id]");
      if (!sourceButton) return;
      selectedSourceType = normalizeSourceType(sourceButton.dataset.sourceType);
      selectedSourceId = String(sourceButton.dataset.sourceId || "");
      selectedTargets.clear();
      syncDefaultsFromSelectedSource();
      view.querySelectorAll(".activity-assignment-picker-item.is-selected").forEach((button) => button.classList.remove("is-selected"));
      sourceButton.classList.add("is-selected");
      renderAssignmentConfigIntoHost();
    });
    bindAssignmentConfigEvents();
    drawer?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      dismissAssignmentDrawer();
    });
  }

  function bindAssignmentConfigEvents() {
    const config = view.querySelector("#activityAssignmentConfigContent");
    if (!config) return;
    config.querySelector("#activityAssignmentDifficulty")?.addEventListener("change", (event) => {
      selectedDifficulty = String(event.target?.value || "3");
    });
    config.querySelector("#activityAssignmentExecutionMode")?.addEventListener("change", (event) => {
      const priorMode = executionMode;
      executionMode = String(event.target?.value || "questions") === "time" ? "time" : "questions";
      if (priorMode !== executionMode) executionValue = executionMode === "time" ? 300 : 5;
      renderAssignmentConfigIntoHost({ preserveScroll:true });
    });
    if (config.querySelector("#activityAssignmentExecutionValue")) {
      bindStepperField(config, "activityAssignmentExecutionValue", {
        inputMin:1,
        inputMax:executionMode === "time" ? 120 : 200,
        onChange:(raw) => {
          executionValue = executionMode === "time" ? raw * 60 : raw;
        }
      });
    }
    config.querySelectorAll("[data-target-type][data-target-id]").forEach((input) => input.addEventListener("change", () => {
      updateRecipientSelection(input);
      syncRecipientControls(config);
    }));
    config.querySelector("[data-action='assign-selected']")?.addEventListener("click", () => saveAssignment());
  }

  function renderSelectionPickerIntoHost({ resetScroll = false } = {}) {
    const picker = view.querySelector("#activityAssignmentSourcePicker");
    const breadcrumb = view.querySelector("#activityAssignmentBreadcrumb");
    if (!picker || !breadcrumb) return;
    const scrollTop = picker.scrollTop;
    picker.innerHTML = renderSelectionPicker();
    breadcrumb.innerHTML = renderSelectionBreadcrumb();
    picker.scrollTop = resetScroll ? 0 : scrollTop;
  }

  function renderAssignmentConfigIntoHost({ preserveScroll = false } = {}) {
    const config = view.querySelector("#activityAssignmentConfigContent");
    if (!config) return;
    const scrollTop = config.scrollTop;
    const selected = getSelectedSource();
    config.innerHTML = selected ? renderAssignmentConfig(selected) : "";
    if (preserveScroll) config.scrollTop = scrollTop;
    bindAssignmentConfigEvents();
  }

  function handleSelectionNavigation(button) {
    const action = String(button.dataset.assignmentPickerAction || "");
    const folderId = String(button.dataset.folderId || "").trim() || null;
    if (action === "picker-root") {
      pickerBranch = null;
      activitySourceType = null;
      catalogPickerFolderId = null;
      teacherPickerFolderId = null;
    } else if (action === "open-branch") {
      pickerBranch = button.dataset.pickerValue === "sequences" ? "sequences" : "activities";
      activitySourceType = null;
      catalogPickerFolderId = null;
      teacherPickerFolderId = null;
    } else if (action === "activities-root") {
      pickerBranch = "activities";
      activitySourceType = null;
      catalogPickerFolderId = null;
      teacherPickerFolderId = null;
    } else if (action === "open-activity-source") {
      pickerBranch = "activities";
      activitySourceType = button.dataset.pickerValue === "teacher_activity" ? "teacher_activity" : "catalog_activity";
      catalogPickerFolderId = null;
      teacherPickerFolderId = null;
    } else if (action === "catalog-root" || action === "catalog-node") {
      pickerBranch = "activities";
      activitySourceType = "catalog_activity";
      catalogPickerFolderId = action === "catalog-node" ? folderId : null;
    } else if (action === "teacher-root" || action === "teacher-folder") {
      pickerBranch = "activities";
      activitySourceType = "teacher_activity";
      teacherPickerFolderId = action === "teacher-folder" ? folderId : null;
    } else if (action === "sequence-root" || action === "sequence-folder") {
      pickerBranch = "sequences";
      activitySourceType = null;
      teacherPickerFolderId = action === "sequence-folder" ? folderId : null;
    } else {
      return;
    }
    searchQuery = "";
    const search = view.querySelector("[data-assignment-search]");
    if (search) search.value = "";
    renderSelectionPickerIntoHost({ resetScroll:true });
  }

  function openAssignmentDrawer(preselect = null) {
    if (!drawerOpen) animateDrawerOnNextRender = true;
    drawerOpen = true;
    editingAssignmentId = "";
    selectedTargets.clear();
    searchQuery = "";
    catalogPickerFolderId = null;
    teacherPickerFolderId = null;

    if (preselect?.sourceType && preselect?.sourceId) {
      selectedSourceType = normalizeSourceType(preselect.sourceType);
      selectedSourceId = String(preselect.sourceId || "").trim();
      syncDefaultsFromSelectedSource();
      const source = getSelectedSource();
      if (selectedSourceType === "sequence") {
        pickerBranch = "sequences";
        activitySourceType = null;
        teacherPickerFolderId = String(source?.folder_id || "").trim() || null;
      } else {
        pickerBranch = "activities";
        activitySourceType = selectedSourceType;
        if (selectedSourceType === "catalog_activity") {
          catalogPickerFolderId = String(source?.pedagogical_node_id || source?.folder_id || "").trim() || null;
        } else {
          teacherPickerFolderId = String(source?.folder_id || "").trim() || null;
        }
      }
      return;
    }

    pickerBranch = null;
    activitySourceType = null;
    selectedSourceType = "";
    selectedSourceId = "";
    selectedDifficulty = "adaptive";
    executionMode = "questions";
    executionValue = 5;
  }

  function openAssignmentForEdit(assignmentId) {
    const assignment = assignments.find((item) => String(item?.id || "") === String(assignmentId || ""));
    if (!assignment) return;
    openAssignmentDrawer({ sourceType:assignment.source_type, sourceId:assignment.source_id });
    editingAssignmentId = String(assignment.id || "");
    selectedDifficulty = assignment.difficulty_mode === "adaptive"
      ? "adaptive"
      : String(Math.max(1, Math.min(5, Number(assignment.difficulty_level) || 3)));
    executionMode = ["questions", "time", "intrinsic"].includes(String(assignment.execution_limit_mode || ""))
      ? String(assignment.execution_limit_mode)
      : "questions";
    executionValue = executionMode === "intrinsic"
      ? 5
      : Math.max(1, Number(assignment.execution_limit_value) || (executionMode === "time" ? 300 : 5));
    selectedTargets.clear();
    (Array.isArray(assignment.targets) ? assignment.targets : []).forEach((target) => {
      const type = target?.target_type === "class" ? "class" : target?.target_type === "student" ? "student" : "";
      const id = type === "class" ? target?.teacher_class_id : target?.student_id;
      const safeId = String(id || "").trim();
      if (type && safeId) selectedTargets.set(`${type}:${safeId}`, { type, id:safeId });
    });
  }

  function closeAssignmentDrawer() {
    drawerOpen = false;
    editingAssignmentId = "";
    selectedTargets.clear();
  }

  function dismissAssignmentDrawer() {
    const drawer = view?.querySelector(".activity-assignment-drawer");
    if (!drawerOpen || !drawer) {
      closeAssignmentDrawer();
      renderView();
      return;
    }

    const currentTransform = getComputedStyle(drawer).transform;
    drawerMotion?.cancel?.();
    drawer.getAnimations?.().forEach((animation) => animation.cancel());
    drawer.classList.remove("is-opening");
    drawer.classList.add("is-closing");
    if (typeof drawer.animate !== "function") {
      closeAssignmentDrawer();
      renderView();
      return;
    }

    const motion = drawer.animate(
      [
        { transform:currentTransform === "none" ? "translate3d(0,0,0)" : currentTransform },
        { transform:"translate3d(0,100%,0)" }
      ],
      { duration:400, easing:"cubic-bezier(.55,0,1,.45)", fill:"both" }
    );
    drawerMotion = motion;
    const finish = () => {
      if (drawerMotion !== motion) return;
      drawerMotion = null;
      closeAssignmentDrawer();
      renderView();
    };
    motion.finished.then(finish).catch(finish);
  }

  function updateRecipientSelection(input) {
    const type = String(input.dataset.targetType || "");
    const id = String(input.dataset.targetId || "");
    if (!id) return;
    const classId = String(input.dataset.classId || (type === "class" ? id : ""));
    const classKey = `class:${classId}`;
    const classStudents = students.filter((student) => String(student.teacher_class_id || "") === classId);
    if (type === "class") {
      if (input.checked) selectedTargets.set(classKey, { type:"class", id:classId });
      else selectedTargets.delete(classKey);
      classStudents.forEach((student) => selectedTargets.delete(`student:${student.id}`));
      return;
    }

    const studentKey = `student:${id}`;
    if (selectedTargets.has(classKey)) {
      selectedTargets.delete(classKey);
      classStudents.forEach((student) => {
        const siblingId = String(student.id || "");
        if (siblingId && siblingId !== id) selectedTargets.set(`student:${siblingId}`, { type:"student", id:siblingId });
      });
      return;
    }

    if (input.checked) selectedTargets.set(studentKey, { type:"student", id });
    else selectedTargets.delete(studentKey);
    if (classStudents.length && classStudents.every((student) => selectedTargets.has(`student:${student.id}`))) {
      selectedTargets.set(classKey, { type:"class", id:classId });
      classStudents.forEach((student) => selectedTargets.delete(`student:${student.id}`));
    }
  }

  function syncRecipientControls(config) {
    config.querySelectorAll("[data-recipient-class-id]").forEach((group) => {
      const classId = String(group.dataset.recipientClassId || "");
      const wholeClass = selectedTargets.has(`class:${classId}`);
      const wholeClassInput = group.querySelector('[data-target-type="class"]');
      if (wholeClassInput) wholeClassInput.checked = wholeClass;
      group.querySelectorAll('[data-target-type="student"]').forEach((studentInput) => {
        studentInput.checked = wholeClass || selectedTargets.has(`student:${studentInput.dataset.targetId}`);
      });
    });
    const submit = config.querySelector("[data-action='assign-selected']");
    if (submit) submit.disabled = !selectedTargets.size;
  }

  async function saveAssignment() {
    const source = getSelectedSource();
    const space = getCurrentTeacherSpace?.();
    if (!source || !space?.id) return;
    if (!selectedTargets.size) {
      showToast?.("Choisissez au moins un élève ou une classe.", { isError:true });
      return;
    }

    const targets = buildSelectedTargetsPayload();
    const isSequence = selectedSourceType === "sequence";
    const intrinsic = isSequence ? true : isSourceIntrinsic(selectedSourceType, source);
    const adaptive = !isSequence && selectedDifficulty === "adaptive";
    const wasEditing = !!editingAssignmentId;

    try {
      await saveActivityAssignmentForSpace?.(space.id, {
        id:editingAssignmentId || null,
        source_type:selectedSourceType,
        source_id:getSelectedSourceId(source),
        title_snapshot:getSelectedSourceTitle(source),
        difficulty_mode:adaptive ? "adaptive" : "fixed",
        difficulty_level:adaptive ? null : (isSequence ? 3 : Math.max(1, Math.min(5, Number(selectedDifficulty) || 3))),
        execution_limit_mode:intrinsic ? "intrinsic" : executionMode,
        execution_limit_value:intrinsic ? null : executionValue
      }, targets);
      showToast?.(wasEditing
        ? `Attribution de « ${getSelectedSourceTitle(source)} » mise à jour.`
        : `« ${getSelectedSourceTitle(source)} » attribuée.`);
      selectedTargets.clear();
      editingAssignmentId = "";
      drawerOpen = false;
      await refreshData();
      renderView();
    } catch (error) {
      showToast?.(error?.message || "Impossible d’attribuer cette activité.", { isError:true });
    }
  }

  async function removeAssignment(assignmentId) {
    const assignment = assignments.find((item) => String(item.id) === String(assignmentId));
    if (!assignment) return;
    const confirmed = await openDashboardConfirmDialog({
      title:"Retirer l’attribution ?",
      message:`« ${assignment.title_snapshot || "Activité"} » ne sera plus proposée aux élèves concernés.`,
      confirmLabel:"Retirer",
      danger:true
    });
    if (!confirmed) return;
    try {
      await deleteActivityAssignment?.(assignment.id);
      assignments = assignments.filter((item) => String(item.id) !== String(assignment.id));
      renderView();
      showToast?.("Attribution retirée.");
    } catch (error) {
      showToast?.(error?.message || "Impossible de retirer cette attribution.", { isError:true });
    }
  }

  async function runTileAction(button, action) {
    if (!button || button.disabled) return;
    button.disabled = true;
    try {
      await action();
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }

  async function duplicateAssignment(assignmentId) {
    const assignment = assignments.find((item) => String(item?.id || "") === String(assignmentId || ""));
    const space = getCurrentTeacherSpace?.();
    if (!assignment || !space?.id) return;
    try {
      const duplicate = await saveActivityAssignmentForSpace?.(space.id, {
        source_type:assignment.source_type,
        source_id:assignment.source_id,
        title_snapshot:assignment.title_snapshot,
        difficulty_mode:assignment.difficulty_mode,
        difficulty_level:assignment.difficulty_level,
        execution_limit_mode:assignment.execution_limit_mode,
        execution_limit_value:assignment.execution_limit_value
      }, assignment.targets || []);
      if (duplicate?.id) {
        assignments = [{ ...duplicate, is_active:duplicate.is_active !== false, completions:[] }, ...assignments];
      } else {
        await refreshData();
      }
      renderView({ preserveOverviewScroll:true, anchorAssignmentId:assignment.id });
      showToast?.(`Attribution « ${assignment.title_snapshot || "Activité"} » dupliquée.`);
    } catch (error) {
      showToast?.(error?.message || "Impossible de dupliquer cette attribution.", { isError:true });
    }
  }

  async function toggleAssignmentActive(assignmentId) {
    const assignment = assignments.find((item) => String(item?.id || "") === String(assignmentId || ""));
    if (!assignment) return;
    const nextActive = assignment.is_active === false;
    try {
      const updated = await setActivityAssignmentActive?.(assignment.id, nextActive);
      Object.assign(assignment, updated || { is_active:nextActive });
      renderView({ preserveOverviewScroll:true, anchorAssignmentId:assignment.id });
      showToast?.(nextActive ? "Attribution réactivée." : "Attribution mise en pause.");
    } catch (error) {
      showToast?.(error?.message || "Impossible de modifier l’état de cette attribution.", { isError:true });
    }
  }

  async function reassignExistingAssignment(assignmentId) {
    const assignment = assignments.find((item) => String(item?.id || "") === String(assignmentId || ""));
    if (!assignment) return;
    const confirmed = await openDashboardConfirmDialog({
      title:"Réattribuer cette activité ?",
      message:`La validation de « ${assignment.title_snapshot || "Activité"} » sera remise à zéro pour tous ses destinataires. L’historique des activités restera conservé.`,
      confirmLabel:"Réattribuer"
    });
    if (!confirmed) return;
    try {
      await reassignActivityAssignment?.(assignment.id);
      assignment.completions = [];
      renderView({ preserveOverviewScroll:true, anchorAssignmentId:assignment.id });
      showToast?.(assignment.is_active === false
        ? "Progression réinitialisée. L’attribution reste en pause."
        : "L’activité est de nouveau proposée aux élèves.");
    } catch (error) {
      showToast?.(error?.message || "Impossible de réattribuer cette activité.", { isError:true });
    }
  }

  function buildSelectedTargetsPayload() {
    return Array.from(selectedTargets.values()).map((target) => target.type === "class"
      ? { target_type:"class", teacher_class_id:Number(target.id) }
      : { target_type:"student", student_id:Number(target.id) });
  }

  function getSelectedSource() {
    if (selectedSourceType === "sequence") {
      return sequences.find((item) => String(item?.id || "") === String(selectedSourceId || "")) || null;
    }
    return findActivitySource(selectedSourceType, selectedSourceId);
  }

  function findActivitySource(type, id) {
    const source = type === "teacher_activity" ? teacherActivities : catalogActivities;
    return source.find((item) => getSourceId(item) === String(id || "")) || null;
  }

  function getSelectedSourceId(source) {
    if (selectedSourceType === "sequence") return String(source?.id || "").trim();
    return getSourceId(source);
  }

  function getSelectedSourceTitle(source) {
    if (selectedSourceType === "sequence") return String(source?.title || "Séquence").trim() || "Séquence";
    return getSourceTitle(source);
  }

  function getSourceId(source) {
    return String(source?.id || source?.catalog_activity_id || "").trim();
  }

  function getSourceTitle(source) {
    return String(source?.config_name || source?.title || "Activité").trim() || "Activité";
  }

  function getEligibleCatalogActivities() {
    return catalogActivities.filter((activity) => activity?.is_visible !== false && String(activity?.status || "published") === "published");
  }

  function getCatalogNode(id) {
    const safeId = String(id || "").trim();
    return catalogNodes.find((node) => String(node?.id || "") === safeId) || null;
  }

  function getTeacherActivityFolder(id) {
    const safeId = String(id || "").trim();
    return teacherActivityFolders.find((folder) => String(folder?.id || "") === safeId) || null;
  }

  function getBreadcrumb(id, getItem) {
    const result = [];
    const seen = new Set();
    let cursor = getItem(id);
    while (cursor && !seen.has(String(cursor.id))) {
      seen.add(String(cursor.id));
      result.unshift(cursor);
      cursor = getItem(cursor.parent_id);
    }
    return result;
  }

  function getCatalogBreadcrumb(id) {
    return getBreadcrumb(id, getCatalogNode);
  }

  function getTeacherActivityBreadcrumb(id) {
    return getBreadcrumb(id, getTeacherActivityFolder);
  }

  function getFolderLabel(folder) {
    return String(folder?.name || folder?.student_label || folder?.id || "").trim();
  }

  function getCatalogActivityPath(activity) {
    return [
      "Activités",
      "Activités du site",
      ...getCatalogBreadcrumb(activity?.pedagogical_node_id || activity?.folder_id).map(getFolderLabel)
    ].filter(Boolean).join(" › ");
  }

  function getTeacherItemPath(item) {
    return [
      "Mes activités",
      ...getTeacherActivityBreadcrumb(item?.folder_id).map(getFolderLabel)
    ].filter(Boolean).join(" › ");
  }

  function isAdaptiveAvailableFor(type, source) {
    if (type === "catalog_activity") return true;
    return String(source?.difficulty_mode || "single") === "adaptive";
  }

  function isSourceIntrinsic(type, source) {
    if (!source || type === "sequence") return true;
    const runtimeSource = type === "teacher_activity" ? teacherActivityToCatalogShape(source) : normalizeCatalogActivity(source);
    return isIntrinsicCatalogActivity(runtimeSource);
  }

  function syncDefaultsFromSelectedSource() {
    const source = getSelectedSource();
    if (!source) return;
    if (selectedSourceType === "sequence") {
      selectedDifficulty = "3";
      executionMode = "intrinsic";
      executionValue = 5;
      return;
    }
    selectedDifficulty = isAdaptiveAvailableFor(selectedSourceType, source) ? "adaptive" : "3";
    executionMode = isSourceIntrinsic(selectedSourceType, source) ? "intrinsic" : "questions";
    executionValue = executionMode === "time" ? 300 : 5;
  }

  function normalizeSourceType(value) {
    if (value === "teacher_activity") return "teacher_activity";
    if (value === "sequence") return "sequence";
    return "catalog_activity";
  }

  function getAssignmentStudents(assignment) {
    const targets = Array.isArray(assignment?.targets) ? assignment.targets : [];
    const classIds = new Set(targets
      .filter((target) => target.target_type === "class")
      .map((target) => String(target.teacher_class_id || ""))
      .filter(Boolean));
    const studentIds = new Set(targets
      .filter((target) => target.target_type === "student")
      .map((target) => String(target.student_id || ""))
      .filter(Boolean));
    return students
      .filter((student) => studentIds.has(String(student?.id || ""))
        || classIds.has(String(student?.teacher_class_id || "")))
      .sort((left, right) => String(left?.first_name || "").localeCompare(
        String(right?.first_name || ""),
        "fr",
        { sensitivity:"base" }
      ));
  }

  function getPersonalTypeIcon(activity) {
    const type = String(activity?.activity_type || "tool");
    if (type === "series") return "view_list";
    if (type === "quiz") return "quiz";
    return "extension";
  }

  function teacherActivityToCatalogShape(activity = {}) {
    const adaptive = String(activity?.difficulty_mode || "single") === "adaptive";
    const config = isPlainObject(activity?.config_json) ? activity.config_json : {};
    const single = isPlainObject(config.level) ? config.level : {};
    const levels = adaptive && isPlainObject(activity?.levels_json)
      ? activity.levels_json
      : Object.fromEntries(LEVELS.map((level) => [String(level), clone(single)]));
    return normalizeCatalogActivity({
      id:`teacher-activity.${String(activity?.id || "")}`,
      config_name:getSourceTitle(activity),
      title:getSourceTitle(activity),
      tool_id:String(config.tool_id || "").trim(),
      levels_json:levels,
      status:"published",
      default_visible:true
    });
  }

  return {
    render,
    async open(preselect = null) {
      await render({ forceRefresh:loadedSpaceId !== String(getCurrentTeacherSpace?.()?.id || ""), preselect });
    },
    async refresh() {
      await render({ forceRefresh:true });
    }
  };
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function clone(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function normalizeSearch(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function compareByOrderAndName(a, b) {
  const orderA = Number(a?.display_order) || 0;
  const orderB = Number(b?.display_order) || 0;
  if (orderA !== orderB) return orderA - orderB;
  return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", { sensitivity:"base" });
}

function compareByOrderAndTitle(a, b) {
  const orderA = Number(a?.display_order) || 0;
  const orderB = Number(b?.display_order) || 0;
  if (orderA !== orderB) return orderA - orderB;
  return String(a?.config_name || a?.title || "").localeCompare(String(b?.config_name || b?.title || ""), "fr", { sensitivity:"base" });
}
