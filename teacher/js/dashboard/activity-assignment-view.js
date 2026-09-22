import { isIntrinsicCatalogActivity, normalizeCatalogActivity } from "../../../shared/catalogue.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";
import { openDashboardConfirmDialog } from "./confirm-dialog.js";

const LEVELS = [1, 2, 3, 4, 5];

export function createActivityAssignmentViewController({
  view,
  getCurrentTeacherSpace,
  listCatalogActivitiesForTeacherSpace,
  listTeacherActivitiesForSpace,
  listTeacherSequencesForSpace,
  listTeacherClasses,
  listStudentsForTeacherSpace,
  listActivityAssignmentsForSpace,
  saveActivityAssignmentForSpace,
  deleteActivityAssignment,
  onBack,
  showToast
} = {}) {
  let catalogActivities = [];
  let teacherActivities = [];
  let sequences = [];
  let classes = [];
  let students = [];
  let assignments = [];
  let loadedSpaceId = "";
  let loadError = "";

  let drawerOpen = false;
  let sourceTab = "catalog"; // catalog | personal
  let selectedSourceType = ""; // catalog_activity | teacher_activity | sequence
  let selectedSourceId = "";
  let selectedDifficulty = "adaptive";
  let executionMode = "questions";
  let executionValue = 5;
  let selectedTargets = new Map();

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
        listTeacherActivitiesForSpace?.(space.id) || [],
        listTeacherSequencesForSpace?.(space.id) || [],
        listTeacherClasses?.(space.id) || [],
        listStudentsForTeacherSpace?.(space.id) || [],
        listActivityAssignmentsForSpace?.(space.id) || []
      ]);
      catalogActivities = Array.isArray(results[0]) ? results[0] : [];
      teacherActivities = Array.isArray(results[1]) ? results[1] : [];
      sequences = Array.isArray(results[2]) ? results[2] : [];
      classes = Array.isArray(results[3]) ? results[3] : [];
      students = Array.isArray(results[4]) ? results[4] : [];
      assignments = Array.isArray(results[5]) ? results[5] : [];
    } catch (error) {
      console.error(error);
      loadError = error?.message || "Impossible de charger les activités attribuées.";
      assignments = [];
    }
  }

  function renderView() {
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

        ${loadError ? `<div class="modal-message error">${escapeHtml(loadError)}<br><small>Vérifie que les migrations SQL 49 et 50 ont bien été appliquées.</small></div>` : ""}

        <section class="activity-assignment-overview">
          ${renderCurrentAssignments()}
        </section>

        ${drawerOpen ? renderAssignmentDrawer() : ""}
      </div>
    `;
    bindEvents();
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
          const recipients = formatAssignmentRecipients(assignment);
          const source = assignment.source_type === "sequence"
            ? "Séquence"
            : assignment.source_type === "teacher_activity" ? "Mes activités" : "Exploration";
          return `
            <div class="activity-assignment-current-row activity-assignment-current-row--overview">
              <div class="activity-assignment-current-main">
                <strong>${escapeHtml(assignment.title_snapshot || "Activité")}</strong>
                <span>${escapeHtml(source)} · ${escapeHtml(recipients)}</span>
              </div>
              <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-assignment" data-assignment-id="${escapeAttr(assignment.id)}" title="Retirer cette attribution" aria-label="Retirer cette attribution">
                <span class="dashboard-material-icon" aria-hidden="true">delete</span>
              </button>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }

  function renderAssignmentDrawer() {
    const selected = getSelectedSource();
    return `
      <button class="activity-assignment-drawer-scrim" type="button" data-action="close-assignment-drawer" aria-label="Fermer le volet d’attribution"></button>
      <aside class="activity-assignment-drawer" role="dialog" aria-modal="true" aria-labelledby="activityAssignmentDrawerTitle">
        <header class="activity-assignment-drawer-header">
          <div>
            <div id="activityAssignmentDrawerTitle" class="dashboard-section-title">Attribuer des activités</div>
            <div class="dashboard-muted-text">Choisis une activité ou une séquence, puis ses destinataires.</div>
          </div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="close-assignment-drawer" title="Fermer" aria-label="Fermer le volet">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </header>

        <div class="activity-assignment-drawer-body">
          <section class="activity-assignment-source-column">
            <div class="activity-assignment-tabs" role="tablist" aria-label="Origine de l’activité">
              <button class="btn${sourceTab === "catalog" ? " primary" : ""}" type="button" data-source-tab="catalog">Exploration</button>
              <button class="btn${sourceTab === "personal" ? " primary" : ""}" type="button" data-source-tab="personal">Mes activités</button>
            </div>
            <div class="activity-assignment-source-list">${renderSourceList()}</div>
          </section>

          <section class="activity-assignment-config-column">
            ${selected ? renderAssignmentConfig(selected) : `<div class="dashboard-activity-empty-state">Choisis une activité ou une séquence à attribuer.</div>`}
          </section>
        </div>
      </aside>
    `;
  }

  function renderSourceList() {
    if (sourceTab === "catalog") {
      if (!catalogActivities.length) return `<div class="dashboard-activity-empty-state">Aucune activité disponible.</div>`;
      return catalogActivities.map((activity) => renderSourceButton({
        sourceType:"catalog_activity",
        sourceId:getSourceId(activity),
        title:getSourceTitle(activity),
        subtitle:"Activité du catalogue"
      })).join("");
    }

    const personalRows = [
      ...teacherActivities.map((activity) => ({
        sourceType:"teacher_activity",
        sourceId:getSourceId(activity),
        title:getSourceTitle(activity),
        subtitle:`${getPersonalTypeLabel(activity)} · ${String(activity?.difficulty_mode || "single") === "adaptive" ? "Adaptative" : "Difficulté unique"}`
      })),
      ...sequences.map((sequence) => ({
        sourceType:"sequence",
        sourceId:String(sequence?.id || ""),
        title:String(sequence?.title || "Séquence"),
        subtitle:`Séquence · ${Array.isArray(sequence?.items) ? sequence.items.length : 0} activité${Array.isArray(sequence?.items) && sequence.items.length === 1 ? "" : "s"}`
      }))
    ];

    if (!personalRows.length) return `<div class="dashboard-activity-empty-state">Aucune activité ni séquence disponible.</div>`;
    return personalRows.map(renderSourceButton).join("");
  }

  function renderSourceButton({ sourceType, sourceId, title, subtitle }) {
    const selected = sourceType === selectedSourceType && String(sourceId) === String(selectedSourceId);
    return `
      <button class="activity-assignment-source-item${selected ? " is-selected" : ""}" type="button" data-source-type="${escapeAttr(sourceType)}" data-source-id="${escapeAttr(sourceId)}">
        <span class="activity-assignment-source-title">${escapeHtml(title)}</span>
        <span class="activity-assignment-source-meta">${escapeHtml(subtitle)}</span>
      </button>
    `;
  }

  function renderAssignmentConfig(source) {
    const isSequence = selectedSourceType === "sequence";
    const title = getSelectedSourceTitle(source);
    const origin = selectedSourceType === "catalog_activity" ? "Exploration" : "Mes activités";

    if (isSequence) {
      const count = Array.isArray(source?.items) ? source.items.length : 0;
      return `
        <div class="activity-assignment-config-head">
          <div>
            <div class="dashboard-section-title">${escapeHtml(title)}</div>
            <div class="dashboard-muted-text">Séquence · ${count} activité${count === 1 ? "" : "s"}</div>
          </div>
        </div>
        <div class="activity-assignment-sequence-note">Les réglages de difficulté et de durée sont déjà définis activité par activité dans la séquence.</div>
        <div class="dashboard-section-title activity-assignment-recipient-title">Destinataires</div>
        ${renderRecipientsSection()}
        ${renderSubmitButton("Attribuer la séquence")}
      `;
    }

    const intrinsic = isSourceIntrinsic(selectedSourceType, source);
    const adaptiveAvailable = isAdaptiveAvailableFor(selectedSourceType, source);
    if (intrinsic) executionMode = "intrinsic";
    else if (executionMode === "intrinsic") executionMode = "questions";
    if (!adaptiveAvailable && selectedDifficulty === "adaptive") selectedDifficulty = "3";

    return `
      <div class="activity-assignment-config-head">
        <div>
          <div class="dashboard-section-title">${escapeHtml(title)}</div>
          <div class="dashboard-muted-text">${escapeHtml(origin)}</div>
        </div>
      </div>

      ${renderDifficultyAndExecutionFields({
        adaptiveAvailable,
        selectedDifficulty,
        intrinsic,
        executionMode,
        executionValue,
        prefix:"activityAssignment"
      })}

      <div class="dashboard-section-title activity-assignment-recipient-title">Destinataires</div>
      ${renderRecipientsSection()}
      ${renderSubmitButton("Attribuer")}
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
    return `
      <div class="activity-assignment-field-row">
        <label class="dashboard-field-label" for="${difficultyId}">Difficulté</label>
        <select id="${difficultyId}" class="student-select" data-config-field="difficulty">
          ${adaptiveAvailable
            ? `<option value="adaptive"${difficulty === "adaptive" ? " selected" : ""}>Adaptative</option>${LEVELS.map((level) => `<option value="${level}"${String(difficulty) === String(level) ? " selected" : ""}>N${level}</option>`).join("")}`
            : `<option value="3" selected>Unique</option>`}
        </select>
      </div>

      ${intrinsic ? `
        <div class="activity-assignment-field-row">
          <span class="dashboard-field-label">Questions / Temps</span>
          <span>Contenu complet</span>
        </div>
      ` : `
        <div class="activity-assignment-field-row">
          <label class="dashboard-field-label" for="${executionModeId}">Questions / Temps</label>
          <select id="${executionModeId}" class="student-select" data-config-field="execution-mode">
            <option value="questions"${mode === "questions" ? " selected" : ""}>Questions</option>
            <option value="time"${mode === "time" ? " selected" : ""}>Temps</option>
          </select>
          <input id="${executionValueId}" class="modal-text-input activity-assignment-limit-value" type="number" min="1" max="${mode === "time" ? 120 : 200}" value="${escapeAttr(mode === "time" ? Math.max(1, Math.round(value / 60)) : value)}" data-config-field="execution-value">
          <span>${mode === "time" ? "min" : "question(s)"}</span>
        </div>
      `}
    `;
  }

  function renderRecipientsSection() {
    return `
      <div class="activity-assignment-recipients">
        ${classes.map((teacherClass) => renderClassRecipients(teacherClass)).join("") || `<div class="dashboard-activity-empty-state">Aucune classe.</div>`}
      </div>
    `;
  }

  function renderClassRecipients(teacherClass) {
    const classId = String(teacherClass?.id || "");
    const classKey = `class:${classId}`;
    const wholeClass = selectedTargets.has(classKey);
    const classStudents = students.filter((student) => String(student.teacher_class_id || "") === classId);
    return `
      <div class="activity-assignment-class-group">
        <label class="activity-assignment-recipient activity-assignment-recipient--class">
          <input type="checkbox" data-target-type="class" data-target-id="${escapeAttr(classId)}" ${wholeClass ? "checked" : ""}>
          <strong>${escapeHtml(teacherClass?.name || "Classe")}</strong>
        </label>
        <div class="activity-assignment-student-list">
          ${classStudents.map((student) => {
            const key = `student:${student.id}`;
            return `<label class="activity-assignment-recipient"><input type="checkbox" data-target-type="student" data-target-id="${escapeAttr(student.id)}" ${selectedTargets.has(key) ? "checked" : ""} ${wholeClass ? "disabled" : ""}><span>${escapeHtml(student.first_name || "Élève")}</span></label>`;
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
      closeAssignmentDrawer();
      renderView();
    }));
    view.querySelectorAll("[data-action='delete-assignment']").forEach((button) => button.addEventListener("click", () => removeAssignment(button.dataset.assignmentId)));

    if (!drawerOpen) return;

    view.querySelectorAll("[data-source-tab]").forEach((button) => button.addEventListener("click", () => {
      sourceTab = button.dataset.sourceTab === "personal" ? "personal" : "catalog";
      selectedSourceType = "";
      selectedSourceId = "";
      selectedTargets.clear();
      selectedDifficulty = sourceTab === "catalog" ? "adaptive" : "3";
      executionMode = "questions";
      executionValue = 5;
      renderView();
    }));

    view.querySelectorAll("[data-source-type][data-source-id]").forEach((button) => button.addEventListener("click", () => {
      selectedSourceType = normalizeSourceType(button.dataset.sourceType);
      selectedSourceId = String(button.dataset.sourceId || "");
      selectedTargets.clear();
      syncDefaultsFromSelectedSource();
      renderView();
    }));

    view.querySelector("#activityAssignmentDifficulty")?.addEventListener("change", (event) => {
      selectedDifficulty = String(event.target?.value || "3");
    });
    view.querySelector("#activityAssignmentExecutionMode")?.addEventListener("change", (event) => {
      const priorMode = executionMode;
      executionMode = String(event.target?.value || "questions") === "time" ? "time" : "questions";
      if (priorMode !== executionMode) executionValue = executionMode === "time" ? 300 : 5;
      renderView();
    });
    view.querySelector("#activityAssignmentExecutionValue")?.addEventListener("change", (event) => {
      const raw = Math.max(1, Math.trunc(Number(event.target?.value) || 1));
      executionValue = executionMode === "time" ? raw * 60 : raw;
    });

    view.querySelectorAll("[data-target-type][data-target-id]").forEach((input) => input.addEventListener("change", () => {
      updateRecipientSelection(input);
      renderView();
    }));

    view.querySelector("[data-action='assign-selected']")?.addEventListener("click", () => saveAssignment());
    view.querySelector(".activity-assignment-drawer")?.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      closeAssignmentDrawer();
      renderView();
    });
  }

  function openAssignmentDrawer(preselect = null) {
    drawerOpen = true;
    selectedTargets.clear();

    if (preselect?.sourceType && preselect?.sourceId) {
      selectedSourceType = normalizeSourceType(preselect.sourceType);
      selectedSourceId = String(preselect.sourceId || "").trim();
      sourceTab = selectedSourceType === "catalog_activity" ? "catalog" : "personal";
      syncDefaultsFromSelectedSource();
      return;
    }

    sourceTab = "catalog";
    selectedSourceType = "";
    selectedSourceId = "";
    selectedDifficulty = "adaptive";
    executionMode = "questions";
    executionValue = 5;
  }

  function closeAssignmentDrawer() {
    drawerOpen = false;
    selectedTargets.clear();
  }

  function updateRecipientSelection(input) {
    const type = String(input.dataset.targetType || "");
    const id = String(input.dataset.targetId || "");
    if (!id) return;
    const key = `${type}:${id}`;
    if (input.checked) selectedTargets.set(key, { type, id });
    else selectedTargets.delete(key);

    if (type === "class") {
      const studentIds = students
        .filter((student) => String(student.teacher_class_id || "") === id)
        .map((student) => `student:${student.id}`);
      if (input.checked) studentIds.forEach((studentKey) => selectedTargets.delete(studentKey));
    }
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

    try {
      await saveActivityAssignmentForSpace?.(space.id, {
        source_type:selectedSourceType,
        source_id:getSelectedSourceId(source),
        title_snapshot:getSelectedSourceTitle(source),
        difficulty_mode:adaptive ? "adaptive" : "fixed",
        difficulty_level:adaptive ? null : (isSequence ? 3 : Math.max(1, Math.min(5, Number(selectedDifficulty) || 3))),
        execution_limit_mode:intrinsic ? "intrinsic" : executionMode,
        execution_limit_value:intrinsic ? null : executionValue
      }, targets);
      showToast?.(`« ${getSelectedSourceTitle(source)} » attribuée.`);
      selectedTargets.clear();
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

  function formatAssignmentRecipients(assignment) {
    const targets = Array.isArray(assignment?.targets) ? assignment.targets : [];
    const classNames = targets
      .filter((target) => target.target_type === "class")
      .map((target) => classes.find((item) => String(item.id) === String(target.teacher_class_id))?.name)
      .filter(Boolean);
    const studentNames = targets
      .filter((target) => target.target_type === "student")
      .map((target) => students.find((item) => String(item.id) === String(target.student_id))?.first_name)
      .filter(Boolean);
    return [...classNames, ...studentNames].join(", ") || "Destinataires";
  }

  function getPersonalTypeLabel(activity) {
    const type = String(activity?.activity_type || "tool");
    if (type === "series") return "Série";
    if (type === "quiz") return "Quiz";
    return "Outil";
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
