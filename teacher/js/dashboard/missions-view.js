import { escapeAttr, escapeHtml } from "./text-utils.js";
import { openDashboardConfirmDialog } from "./confirm-dialog.js";

export function createMissionsViewController({
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
  deleteMission,
  listCatalogActivitiesForTeacherSpace
} = {}){
  let currentFolderId = null;
  let folders = [];
  let missions = [];
  let editingMission = null;
  let editingSteps = [];
  let editingAssignments = [];
  let catalogActivities = [];

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
    const [nextFolders, nextMissions, nextCatalogActivities] = await Promise.all([
      listMissionFoldersForSpace?.(space.id),
      listMissionsForSpace?.(space.id),
      listCatalogActivitiesForTeacherSpace?.(space.id)
    ]);
    folders = Array.isArray(nextFolders) ? nextFolders : [];
    missions = Array.isArray(nextMissions) ? nextMissions : [];
    catalogActivities = Array.isArray(nextCatalogActivities) ? nextCatalogActivities : [];
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
        <button class="btn primary" id="btnCreateMission" type="button" disabled aria-disabled="true" title="Création de missions temporairement désactivée"><span class="dashboard-material-icon" aria-hidden="true">add</span><span>Créer une mission</span></button>
      </div>
    `;
    missionsHeader.querySelectorAll("[data-action='open-root']").forEach((btn) => btn.addEventListener("click", () => { currentFolderId = null; renderExplorer(); renderHeader(); }));
    missionsHeader.querySelectorAll("[data-action='open-folder']").forEach((btn) => btn.addEventListener("click", () => { currentFolderId = btn.dataset.folderId || null; renderExplorer(); renderHeader(); }));
    missionsHeader.querySelector("#btnCreateMissionFolder")?.addEventListener("click", () => createFolder());
    // Création temporairement désactivée : l’éditeur existe encore pour les missions déjà présentes,
    // mais on empêche de créer de nouvelles missions tant que le Catalogue n’est pas assez fourni.
    missionsHeader.querySelector("#btnCreateMission")?.addEventListener("click", (event) => event.preventDefault());
  }

  function renderExplorer(){
    if (!missionsList) return;
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
    const active = mission.status === "active";
    return `
      <article class="dashboard-activity-tile dashboard-activity-tile--activity ${active ? "is-highlighted" : ""}">
        <button class="dashboard-activity-tile-surface dashboard-activity-tile-surface--activity" type="button" data-action="edit-mission" data-mission-id="${escapeAttr(mission.id)}">
          <span class="dashboard-activity-tile-topline"><span class="dashboard-material-icon dashboard-activity-tile-icon" aria-hidden="true">flag</span><span class="dashboard-activity-tile-subtitle dashboard-mini-pill">${active ? "Active" : "Brouillon"}</span></span>
          <span class="dashboard-activity-tile-title">${escapeHtml(mission.title)}</span>
          <span class="dashboard-activity-tile-subtitle">${escapeHtml(mission.intent_mode === "evaluation" ? "Évaluation" : "Entrainement")} · ${escapeHtml(mission.answer_mode === "manual_validation" ? "sans saisie" : "réponse saisie")}</span>
        </button>
        <div class="dashboard-activity-tile-actions dashboard-activity-tile-actions--activity">
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="edit-mission" data-mission-id="${escapeAttr(mission.id)}" title="Modifier"><span class="dashboard-material-icon" aria-hidden="true">edit</span></button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-mission" data-mission-id="${escapeAttr(mission.id)}" title="Archiver"><span class="dashboard-material-icon" aria-hidden="true">delete</span></button>
        </div>
      </article>
    `;
  }

  function bindExplorerEvents(){
    missionsList.querySelectorAll("[data-action='open-root']").forEach((btn) => btn.addEventListener("click", () => { currentFolderId = null; renderHeader(); renderExplorer(); }));
    missionsList.querySelectorAll("[data-action='open-folder']").forEach((btn) => btn.addEventListener("click", () => { currentFolderId = btn.dataset.folderId || null; renderHeader(); renderExplorer(); }));
    missionsList.querySelectorAll("[data-action='edit-mission']").forEach((btn) => btn.addEventListener("click", () => openEditor(btn.dataset.missionId || "")));
    missionsList.querySelectorAll("[data-action='delete-mission']").forEach((btn) => btn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const confirmed = await openDashboardConfirmDialog({
        title:"Archiver la mission",
        message:"Archiver cette mission ?",
        confirmLabel:"Archiver",
        danger:true
      });
      if (!confirmed) return;
      await deleteMission?.(btn.dataset.missionId || "");
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
    renderEditor();
  }

  function defaultMission(teacherSpaceId){
    return {
      teacher_space_id: teacherSpaceId,
      folder_id: currentFolderId,
      title: "Nouvelle mission",
      status: "draft",
      answer_mode: "student_input",
      intent_mode: "practice",
      question_count: 5,
      question_time_seconds: null,
      answer_display_seconds: null,
      transition_seconds: 0,
      mission_time_seconds: null,
      instructions: ""
    };
  }

  function renderEditor(){
    const students = getCurrentStudents?.() || [];
    const classIds = [...new Set(students.map((student) => Number(student.teacher_class_id)).filter(Boolean))];
    const assignedClassIds = new Set(editingAssignments.filter((a) => a.target_type === "class").map((a) => String(a.teacher_class_id)));
    const assignedStudentIds = new Set(editingAssignments.filter((a) => a.target_type === "student").map((a) => String(a.student_id)));
    missionsList.innerHTML = `
      <div class="dashboard-bank-editor-host" style="display:block; padding:1rem;">
        <section class="panel" style="padding:1rem; display:grid; gap:1rem;">
          <div style="display:flex; justify-content:space-between; gap:1rem; align-items:center;">
            <div class="dashboard-section-title">${editingMission.id ? "Modifier la mission" : "Créer une mission"}</div>
            <button class="btn" type="button" data-action="back-missions">Retour</button>
          </div>
          <div style="display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:.75rem;">
            <label>Nom interne / titre<br><input class="modal-text-input" data-field="title" value="${escapeAttr(editingMission.title)}"></label>
            <label>Statut<br><select class="student-select" data-field="status"><option value="draft" ${editingMission.status !== "active" ? "selected" : ""}>Brouillon</option><option value="active" ${editingMission.status === "active" ? "selected" : ""}>Active</option></select></label>
            <label>Réponse<br><select class="student-select" data-field="answer_mode"><option value="student_input" ${editingMission.answer_mode !== "manual_validation" ? "selected" : ""}>Réponse saisie</option><option value="manual_validation" ${editingMission.answer_mode === "manual_validation" ? "selected" : ""}>Sans saisie / validation</option></select></label>
            <label>Situation<br><select class="student-select" data-field="intent_mode"><option value="practice" ${editingMission.intent_mode !== "evaluation" ? "selected" : ""}>Entrainement</option><option value="evaluation" ${editingMission.intent_mode === "evaluation" ? "selected" : ""}>Évaluation</option></select></label>
            <label>Questions par activité<br><input class="modal-text-input" type="number" min="1" data-field="question_count" value="${escapeAttr(editingMission.question_count ?? 5)}"></label>
            <label>Temps par question (vide = infini)<br><input class="modal-text-input" type="number" min="0" data-field="question_time_seconds" value="${escapeAttr(editingMission.question_time_seconds ?? "")}"></label>
            <label>Affichage réponse (vide = infini)<br><input class="modal-text-input" type="number" min="0" data-field="answer_display_seconds" value="${escapeAttr(editingMission.answer_display_seconds ?? "")}"></label>
            <label>Temps entre questions<br><input class="modal-text-input" type="number" min="0" data-field="transition_seconds" value="${escapeAttr(editingMission.transition_seconds ?? 0)}"></label>
            <label>Durée maximale mission (vide = infini)<br><input class="modal-text-input" type="number" min="0" data-field="mission_time_seconds" value="${escapeAttr(editingMission.mission_time_seconds ?? "")}"></label>
            <label>Dossier<br><select class="student-select" data-field="folder_id"><option value="">Racine</option>${folders.map((f) => `<option value="${escapeAttr(f.id)}" ${String(editingMission.folder_id || "") === String(f.id) ? "selected" : ""}>${escapeHtml(f.name)}</option>`).join("")}</select></label>
          </div>
          <label>Consigne spécifique de mission<br><textarea class="modal-text-input" rows="2" data-field="instructions">${escapeHtml(editingMission.instructions || "")}</textarea></label>

          <div style="display:grid; grid-template-columns:minmax(260px, 1fr) 1.2fr; gap:1rem; align-items:start;">
            <section class="panel" style="padding:1rem;">
              <h3 style="margin-top:0;">Ajouter une activité du Catalogue</h3>
              <div style="display:grid; gap:.4rem; max-height:310px; overflow:auto;">
                ${catalogActivities.map((activity) => `<button class="btn" type="button" data-action="add-step" data-catalog-activity-id="${escapeAttr(activity.id)}">${escapeHtml(activity.config_name)}</button>`).join("")}
              </div>
            </section>
            <section class="panel" style="padding:1rem;">
              <h3 style="margin-top:0;">Suite de la mission</h3>
              <div style="display:grid; gap:.4rem;">
                ${editingSteps.length ? editingSteps.map((step, index) => renderStepRow(step, index)).join("") : `<div class="dashboard-activity-empty-state">Ajoute au moins une activité.</div>`}
              </div>
            </section>
          </div>

          <section class="panel" style="padding:1rem;">
            <h3 style="margin-top:0;">Attribution</h3>
            <label style="display:block; margin-bottom:.5rem;"><input type="checkbox" data-assignment-class="${escapeAttr(classIds[0] || "")}" ${assignedClassIds.has(String(classIds[0] || "")) ? "checked" : ""} ${classIds[0] ? "" : "disabled"}> Toute la classe</label>
            <div style="display:flex; flex-wrap:wrap; gap:.5rem;">
              ${students.map((student) => `<label class="dashboard-mini-pill"><input type="checkbox" data-assignment-student="${escapeAttr(student.id)}" ${assignedStudentIds.has(String(student.id)) ? "checked" : ""}> ${escapeHtml(student.first_name || "")}</label>`).join("")}
            </div>
          </section>

          <div style="display:flex; justify-content:flex-end; gap:.75rem; align-items:center;">
            <div id="missionEditorMessage" class="modal-message"></div>
            <button class="btn primary" type="button" data-action="save-mission">Enregistrer</button>
          </div>
        </section>
      </div>
    `;
    bindEditorEvents();
  }

  function renderStepRow(step, index){
    const activity = catalogActivities.find((item) => item.id === step.catalog_activity_id);
    return `<div class="dashboard-class-card" style="align-items:center;"><div class="dashboard-class-card-main" style="cursor:default;"><div class="dashboard-class-card-heading"><span class="dashboard-class-card-title">${index + 1}. ${escapeHtml(activity?.config_name || step.catalog_activity_id)}</span></div></div><div class="dashboard-class-card-actions"><button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="move-step-up" data-step-index="${index}" ${index <= 0 ? "disabled" : ""}><span class="dashboard-material-icon">arrow_upward</span></button><button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="move-step-down" data-step-index="${index}" ${index >= editingSteps.length - 1 ? "disabled" : ""}><span class="dashboard-material-icon">arrow_downward</span></button><button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="remove-step" data-step-index="${index}"><span class="dashboard-material-icon">delete</span></button></div></div>`;
  }

  function bindEditorEvents(){
    missionsList.querySelector("[data-action='back-missions']")?.addEventListener("click", () => { editingMission = null; renderHeader(); renderExplorer(); });
    missionsList.querySelectorAll("[data-field]").forEach((field) => field.addEventListener("input", () => readMissionFields()));
    missionsList.querySelectorAll("[data-field]").forEach((field) => field.addEventListener("change", () => readMissionFields()));
    missionsList.querySelectorAll("[data-action='add-step']").forEach((btn) => btn.addEventListener("click", () => { editingSteps.push({ catalog_activity_id: btn.dataset.catalogActivityId, difficulty_mode: "normal", difficulty_level: 3, step_options_json: {} }); renderEditor(); }));
    missionsList.querySelectorAll("[data-action='remove-step']").forEach((btn) => btn.addEventListener("click", () => { editingSteps.splice(Number(btn.dataset.stepIndex), 1); renderEditor(); }));
    missionsList.querySelectorAll("[data-action='move-step-up']").forEach((btn) => btn.addEventListener("click", () => moveStep(Number(btn.dataset.stepIndex), -1)));
    missionsList.querySelectorAll("[data-action='move-step-down']").forEach((btn) => btn.addEventListener("click", () => moveStep(Number(btn.dataset.stepIndex), 1)));
    missionsList.querySelector("[data-action='save-mission']")?.addEventListener("click", () => saveCurrentMission());
  }

  function readMissionFields(){
    missionsList.querySelectorAll("[data-field]").forEach((field) => {
      editingMission[field.dataset.field] = field.value;
    });
  }

  function moveStep(index, delta){
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= editingSteps.length) return;
    const [item] = editingSteps.splice(index, 1);
    editingSteps.splice(nextIndex, 0, item);
    renderEditor();
  }

  async function saveCurrentMission(){
    readMissionFields();
    const message = missionsList.querySelector("#missionEditorMessage");
    const assignments = [];
    missionsList.querySelectorAll("[data-assignment-class]").forEach((input) => {
      if (input.checked && input.dataset.assignmentClass) assignments.push({ target_type: "class", teacher_class_id: input.dataset.assignmentClass });
    });
    missionsList.querySelectorAll("[data-assignment-student]").forEach((input) => {
      if (input.checked && input.dataset.assignmentStudent) assignments.push({ target_type: "student", student_id: input.dataset.assignmentStudent });
    });
    if (!editingSteps.length) {
      if (message) message.textContent = "Ajoute au moins une activité.";
      return;
    }
    try {
      await saveMissionForSpace?.(getCurrentTeacherSpace?.().id, editingMission, editingSteps, assignments);
      editingMission = null;
      editingSteps = [];
      editingAssignments = [];
      await refreshData();
      renderHeader();
      renderExplorer();
    } catch (err) {
      if (message) message.textContent = err?.message || "Enregistrement impossible.";
    }
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
