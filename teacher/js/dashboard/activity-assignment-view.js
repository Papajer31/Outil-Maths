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
  saveTeacherSequenceForSpace,
  deleteTeacherSequence,
  listTeacherClasses,
  listStudentsForTeacherSpace,
  listActivityAssignmentsForSpace,
  saveActivityAssignmentForSpace,
  deleteActivityAssignment,
  onDirectLaunchSequence,
  onBack,
  showToast
} = {}) {
  let catalogActivities = [];
  let teacherActivities = [];
  let sequences = [];
  let classes = [];
  let students = [];
  let assignments = [];
  let panelMode = "activity";
  let sourceType = "catalog_activity";
  let selectedSourceId = "";
  let selectedDifficulty = "adaptive";
  let executionMode = "questions";
  let executionValue = 5;
  let selectedTargets = new Map();
  let loadedSpaceId = "";
  let loadError = "";

  let sequenceDraft = null;
  let sequenceAddSourceType = "catalog_activity";

  async function render({ forceRefresh = false, preselect = null } = {}) {
    const space = getCurrentTeacherSpace?.();
    const spaceId = String(space?.id || "");
    if (!view) return;
    if (!spaceId) {
      view.innerHTML = `<div class="dashboard-activity-empty-state">Crée d’abord ton code de connexion.</div>`;
      return;
    }

    if (forceRefresh || loadedSpaceId !== spaceId) {
      view.innerHTML = `<div class="dashboard-activity-empty-state">Chargement des activités et des élèves…</div>`;
      await refreshData();
      loadedSpaceId = spaceId;
    }

    if (preselect?.sourceType && preselect?.sourceId) {
      panelMode = "activity";
      sourceType = preselect.sourceType === "teacher_activity" ? "teacher_activity" : "catalog_activity";
      selectedSourceId = String(preselect.sourceId || "").trim();
      selectedTargets.clear();
      syncDefaultsFromSelectedSource();
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
      loadError = error?.message || "Impossible de charger l’attribution des activités.";
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
          <div class="dashboard-section-title">Attribuer des activités</div>
          <div class="activity-assignment-tabs" role="tablist" aria-label="Type de travail">
            <button class="btn${panelMode === "activity" ? " primary" : ""}" type="button" data-panel-mode="activity">Attribuer une activité</button>
            <button class="btn${panelMode === "sequences" ? " primary" : ""}" type="button" data-panel-mode="sequences">Mes séquences</button>
          </div>
        </div>

        ${loadError ? `<div class="modal-message error">${escapeHtml(loadError)}<br><small>Vérifie que les migrations SQL 49 et 50 ont bien été appliquées.</small></div>` : ""}

        ${panelMode === "sequences" ? renderSequencesPanel() : renderActivityPanel()}

        <section class="activity-assignment-current">
          <div class="dashboard-section-title">Attributions</div>
          ${renderCurrentAssignments()}
        </section>
      </div>
    `;
    bindCommonEvents();
    if (panelMode === "sequences") bindSequenceEvents();
    else bindActivityEvents();
  }

  function renderActivityPanel() {
    const selected = getSelectedSource();
    return `
      <div class="activity-assignment-workspace">
        <section class="activity-assignment-source-column">
          <div class="activity-assignment-tabs" role="tablist" aria-label="Origine de l’activité">
            <button class="btn${sourceType === "catalog_activity" ? " primary" : ""}" type="button" data-source-tab="catalog_activity">Exploration</button>
            <button class="btn${sourceType === "teacher_activity" ? " primary" : ""}" type="button" data-source-tab="teacher_activity">Mes activités</button>
          </div>
          <div class="activity-assignment-source-list">${renderSourceList(sourceType, selectedSourceId)}</div>
        </section>

        <section class="activity-assignment-config-column">
          ${selected ? renderAssignmentConfig(selected) : `<div class="dashboard-activity-empty-state">Choisissez une activité à attribuer.</div>`}
        </section>
      </div>
    `;
  }

  function renderSequencesPanel() {
    return `
      <div class="activity-assignment-workspace activity-sequence-workspace">
        <section class="activity-assignment-source-column">
          <div class="activity-assignment-tabs">
            <button class="btn primary" type="button" data-action="new-sequence">+ Créer une séquence</button>
          </div>
          <div class="activity-assignment-source-list">
            ${sequences.length ? sequences.map((sequence) => `
              <div class="activity-assignment-source-item${String(sequenceDraft?.id || "") === String(sequence.id || "") ? " is-selected" : ""}">
                <button type="button" class="activity-sequence-open-btn" data-action="edit-sequence" data-sequence-id="${escapeAttr(sequence.id)}">
                  <span class="activity-assignment-source-title">${escapeHtml(sequence.title || "Séquence")}</span>
                  <span class="activity-assignment-source-meta">${Array.isArray(sequence.items) ? sequence.items.length : 0} activité(s)</span>
                </button>
                <button class="dashboard-icon-btn" type="button" data-action="direct-launch-sequence" data-sequence-id="${escapeAttr(sequence.id)}" title="QR / lien direct" aria-label="QR / lien direct">QR</button>
                <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-sequence" data-sequence-id="${escapeAttr(sequence.id)}" title="Supprimer la séquence" aria-label="Supprimer la séquence"><span class="dashboard-material-icon" aria-hidden="true">delete</span></button>
              </div>
            `).join("") : `<div class="dashboard-activity-empty-state">Aucune séquence pour le moment.</div>`}
          </div>
        </section>

        <section class="activity-assignment-config-column">
          ${sequenceDraft ? renderSequenceEditor() : `<div class="dashboard-activity-empty-state">Créez une séquence ou ouvrez-en une.</div>`}
        </section>
      </div>
    `;
  }

  function renderSourceList(type = sourceType, selectedId = selectedSourceId, { addToSequence = false } = {}) {
    const source = type === "teacher_activity" ? teacherActivities : catalogActivities;
    if (!source.length) return `<div class="dashboard-activity-empty-state">Aucune activité disponible.</div>`;
    return source.map((activity) => {
      const id = getSourceId(activity);
      const active = !addToSequence && id === selectedId;
      const title = getSourceTitle(activity);
      const subtitle = type === "teacher_activity"
        ? `${getPersonalTypeLabel(activity)} · ${String(activity?.difficulty_mode || "single") === "adaptive" ? "Adaptative" : "Difficulté unique"}`
        : "Activité du catalogue";
      return `
        <button class="activity-assignment-source-item${active ? " is-selected" : ""}" type="button" ${addToSequence ? "data-sequence-add-source" : "data-source-id"}="${escapeAttr(id)}">
          <span class="activity-assignment-source-title">${escapeHtml(title)}</span>
          <span class="activity-assignment-source-meta">${escapeHtml(subtitle)}</span>
          ${addToSequence ? `<span class="dashboard-material-icon" aria-hidden="true">add</span>` : ""}
        </button>
      `;
    }).join("");
  }

  function renderAssignmentConfig(source) {
    const intrinsic = isSourceIntrinsic(sourceType, source);
    const adaptiveAvailable = isAdaptiveAvailableFor(sourceType, source);
    if (intrinsic) executionMode = "intrinsic";
    else if (executionMode === "intrinsic") executionMode = "questions";
    if (!adaptiveAvailable && selectedDifficulty === "adaptive") selectedDifficulty = "3";

    return `
      <div class="activity-assignment-config-head">
        <div>
          <div class="dashboard-section-title">${escapeHtml(getSourceTitle(source))}</div>
          <div class="dashboard-muted-text">${sourceType === "catalog_activity" ? "Exploration" : "Mes activités"}</div>
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

      ${renderRecipientsSection()}

      <div class="activity-assignment-submit-row">
        <button class="btn primary dashboard-btn-with-icon" type="button" data-action="assign-selected" ${selectedTargets.size ? "" : "disabled"}>
          <span class="dashboard-material-icon" aria-hidden="true">assignment_ind</span>
          <span>Attribuer</span>
        </button>
      </div>
    `;
  }

  function renderSequenceEditor() {
    const items = Array.isArray(sequenceDraft.items) ? sequenceDraft.items : [];
    return `
      <div class="activity-sequence-editor">
        <div class="activity-assignment-config-head">
          <input id="sequenceTitle" class="modal-text-input" type="text" value="${escapeAttr(sequenceDraft.title || "")}" placeholder="Nom de la séquence">
          <button class="btn primary" type="button" data-action="save-sequence">Enregistrer</button>
        </div>

        <div class="dashboard-section-title">Activités de la séquence</div>
        <div class="activity-sequence-items">
          ${items.length ? items.map((item, index) => renderSequenceItem(item, index)).join("") : `<div class="dashboard-activity-empty-state">Ajoutez au moins une activité.</div>`}
        </div>

        <div class="dashboard-section-title">Ajouter une activité</div>
        <div class="activity-assignment-tabs" role="tablist" aria-label="Origine de l’activité à ajouter">
          <button class="btn${sequenceAddSourceType === "catalog_activity" ? " primary" : ""}" type="button" data-sequence-source-tab="catalog_activity">Exploration</button>
          <button class="btn${sequenceAddSourceType === "teacher_activity" ? " primary" : ""}" type="button" data-sequence-source-tab="teacher_activity">Mes activités</button>
        </div>
        <div class="activity-assignment-source-list activity-sequence-add-list">
          ${renderSourceList(sequenceAddSourceType, "", { addToSequence:true })}
        </div>

        <div class="dashboard-section-title activity-assignment-recipient-title">Attribuer cette séquence</div>
        ${renderRecipientsSection()}
        <div class="activity-assignment-submit-row">
          <button class="btn primary dashboard-btn-with-icon" type="button" data-action="assign-sequence" ${items.length && selectedTargets.size ? "" : "disabled"}>
            <span class="dashboard-material-icon" aria-hidden="true">assignment_ind</span>
            <span>Attribuer la séquence</span>
          </button>
        </div>
      </div>
    `;
  }

  function renderSequenceItem(item, index) {
    const source = findSource(item.source_type, item.source_id);
    const intrinsic = source ? isSourceIntrinsic(item.source_type, source) : item.execution_limit_mode === "intrinsic";
    const adaptiveAvailable = source ? isAdaptiveAvailableFor(item.source_type, source) : item.difficulty_mode === "adaptive";
    const difficulty = item.difficulty_mode === "adaptive" ? "adaptive" : String(item.difficulty_level || 3);
    const itemExecutionMode = intrinsic ? "intrinsic" : String(item.execution_limit_mode || "questions");
    const itemExecutionValue = Math.max(1, Number(item.execution_limit_value) || (itemExecutionMode === "time" ? 300 : 5));
    return `
      <div class="activity-sequence-item" data-sequence-item-index="${index}">
        <div class="activity-sequence-item-head">
          <strong>${index + 1}. ${escapeHtml(item.title_snapshot || getSourceTitle(source) || "Activité")}</strong>
          <span>${item.source_type === "teacher_activity" ? "Mes activités" : "Exploration"}</span>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="move-sequence-item-up" data-index="${index}" ${index === 0 ? "disabled" : ""} title="Monter"><span class="dashboard-material-icon" aria-hidden="true">arrow_upward</span></button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-action="move-sequence-item-down" data-index="${index}" ${index === (sequenceDraft.items.length - 1) ? "disabled" : ""} title="Descendre"><span class="dashboard-material-icon" aria-hidden="true">arrow_downward</span></button>
          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="remove-sequence-item" data-index="${index}" title="Retirer"><span class="dashboard-material-icon" aria-hidden="true">delete</span></button>
        </div>
        ${renderDifficultyAndExecutionFields({
          adaptiveAvailable,
          selectedDifficulty:difficulty,
          intrinsic,
          executionMode:itemExecutionMode,
          executionValue:itemExecutionValue,
          prefix:`sequenceItem${index}`,
          index
        })}
      </div>
    `;
  }

  function renderDifficultyAndExecutionFields({ adaptiveAvailable, selectedDifficulty: difficulty, intrinsic, executionMode: mode, executionValue: value, prefix, index = null }) {
    const dataIndex = index == null ? "" : ` data-sequence-config-index="${index}"`;
    const difficultyId = `${prefix}Difficulty`;
    const executionModeId = `${prefix}ExecutionMode`;
    const executionValueId = `${prefix}ExecutionValue`;
    return `
      <div class="activity-assignment-field-row">
        <label class="dashboard-field-label" for="${difficultyId}">Difficulté</label>
        <select id="${difficultyId}" class="student-select" data-config-field="difficulty"${dataIndex}>
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
          <select id="${executionModeId}" class="student-select" data-config-field="execution-mode"${dataIndex}>
            <option value="questions"${mode === "questions" ? " selected" : ""}>Questions</option>
            <option value="time"${mode === "time" ? " selected" : ""}>Temps</option>
          </select>
          <input id="${executionValueId}" class="modal-text-input activity-assignment-limit-value" type="number" min="1" max="${mode === "time" ? 120 : 200}" value="${escapeAttr(mode === "time" ? Math.max(1, Math.round(value / 60)) : value)}" data-config-field="execution-value"${dataIndex}>
          <span>${mode === "time" ? "min" : "questions"}</span>
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

  function renderCurrentAssignments() {
    if (!assignments.length) return `<div class="dashboard-activity-empty-state">Aucune attribution pour le moment.</div>`;
    return `<div class="activity-assignment-current-list">${assignments.map((assignment) => {
      const recipients = formatAssignmentRecipients(assignment);
      const source = assignment.source_type === "sequence"
        ? "Séquence"
        : assignment.source_type === "teacher_activity" ? "Mes activités" : "Exploration";
      return `
        <div class="activity-assignment-current-row">
          <div class="activity-assignment-current-main">
            <strong>${escapeHtml(assignment.title_snapshot || "Activité")}</strong>
            <span>${escapeHtml(source)} · ${escapeHtml(recipients)}</span>
          </div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn is-danger" type="button" data-action="delete-assignment" data-assignment-id="${escapeAttr(assignment.id)}" title="Retirer cette attribution" aria-label="Retirer cette attribution">
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>
        </div>
      `;
    }).join("")}</div>`;
  }

  function bindCommonEvents() {
    view.querySelector("[data-action='back']")?.addEventListener("click", () => onBack?.());
    view.querySelectorAll("[data-panel-mode]").forEach((button) => button.addEventListener("click", () => {
      panelMode = button.dataset.panelMode === "sequences" ? "sequences" : "activity";
      selectedTargets.clear();
      renderView();
    }));
    bindRecipientEvents();
    view.querySelectorAll("[data-action='delete-assignment']").forEach((button) => button.addEventListener("click", () => removeAssignment(button.dataset.assignmentId)));
  }

  function bindRecipientEvents() {
    view.querySelectorAll("[data-target-type][data-target-id]").forEach((input) => input.addEventListener("change", () => {
      updateRecipientSelection(input);
      renderView();
    }));
  }

  function bindActivityEvents() {
    view.querySelectorAll("[data-source-tab]").forEach((button) => button.addEventListener("click", () => {
      sourceType = button.dataset.sourceTab === "teacher_activity" ? "teacher_activity" : "catalog_activity";
      selectedSourceId = "";
      selectedTargets.clear();
      selectedDifficulty = sourceType === "catalog_activity" ? "adaptive" : "3";
      executionMode = "questions";
      executionValue = 5;
      renderView();
    }));
    view.querySelectorAll("[data-source-id]").forEach((button) => button.addEventListener("click", () => {
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

    view.querySelector("[data-action='assign-selected']")?.addEventListener("click", () => saveAssignment());
  }

  function bindSequenceEvents() {
    view.querySelector("[data-action='new-sequence']")?.addEventListener("click", () => {
      sequenceDraft = { id:null, title:"Nouvelle séquence", items:[] };
      selectedTargets.clear();
      renderView();
    });
    view.querySelectorAll("[data-action='edit-sequence']").forEach((button) => button.addEventListener("click", () => {
      const sequence = sequences.find((item) => String(item.id) === String(button.dataset.sequenceId));
      if (!sequence) return;
      sequenceDraft = clone(sequence);
      selectedTargets.clear();
      renderView();
    }));
    view.querySelectorAll("[data-action='direct-launch-sequence']").forEach((button) => button.addEventListener("click", () => {
      const sequence = sequences.find((item) => String(item.id) === String(button.dataset.sequenceId));
      if (sequence) onDirectLaunchSequence?.(sequence);
    }));
    view.querySelectorAll("[data-action='delete-sequence']").forEach((button) => button.addEventListener("click", () => removeSequence(button.dataset.sequenceId)));
    view.querySelector("[data-action='save-sequence']")?.addEventListener("click", () => saveSequenceDraft({ quiet:false }));
    view.querySelector("[data-action='assign-sequence']")?.addEventListener("click", () => assignSequenceDraft());

    view.querySelectorAll("[data-sequence-source-tab]").forEach((button) => button.addEventListener("click", () => {
      sequenceAddSourceType = button.dataset.sequenceSourceTab === "teacher_activity" ? "teacher_activity" : "catalog_activity";
      renderView();
    }));
    view.querySelectorAll("[data-sequence-add-source]").forEach((button) => button.addEventListener("click", () => addSourceToSequence(button.dataset.sequenceAddSource)));

    view.querySelector("#sequenceTitle")?.addEventListener("input", (event) => {
      if (sequenceDraft) sequenceDraft.title = String(event.target?.value || "");
    });

    view.querySelectorAll("[data-action='remove-sequence-item']").forEach((button) => button.addEventListener("click", () => {
      const index = Number(button.dataset.index);
      if (!sequenceDraft || !Number.isInteger(index)) return;
      sequenceDraft.items.splice(index, 1);
      renderView();
    }));
    view.querySelectorAll("[data-action='move-sequence-item-up']").forEach((button) => button.addEventListener("click", () => moveSequenceItem(Number(button.dataset.index), -1)));
    view.querySelectorAll("[data-action='move-sequence-item-down']").forEach((button) => button.addEventListener("click", () => moveSequenceItem(Number(button.dataset.index), 1)));

    view.querySelectorAll("[data-sequence-config-index][data-config-field]").forEach((control) => control.addEventListener("change", () => updateSequenceItemConfig(control)));
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

    const intrinsic = isSourceIntrinsic(sourceType, source);
    const adaptive = selectedDifficulty === "adaptive";
    const targets = buildSelectedTargetsPayload();

    try {
      await saveActivityAssignmentForSpace?.(space.id, {
        source_type:sourceType,
        source_id:getSourceId(source),
        title_snapshot:getSourceTitle(source),
        difficulty_mode:adaptive ? "adaptive" : "fixed",
        difficulty_level:adaptive ? null : Math.max(1, Math.min(5, Number(selectedDifficulty) || 3)),
        execution_limit_mode:intrinsic ? "intrinsic" : executionMode,
        execution_limit_value:intrinsic ? null : executionValue
      }, targets);
      showToast?.(`« ${getSourceTitle(source)} » attribuée.`);
      selectedTargets.clear();
      await refreshData();
      renderView();
    } catch (error) {
      showToast?.(error?.message || "Impossible d’attribuer cette activité.", { isError:true });
    }
  }

  async function saveSequenceDraft({ quiet = false } = {}) {
    const space = getCurrentTeacherSpace?.();
    if (!space?.id || !sequenceDraft) return null;
    const title = String(sequenceDraft.title || "").trim();
    if (!title) {
      showToast?.("Donnez un nom à la séquence.", { isError:true });
      return null;
    }
    if (!Array.isArray(sequenceDraft.items) || !sequenceDraft.items.length) {
      showToast?.("Ajoutez au moins une activité à la séquence.", { isError:true });
      return null;
    }
    try {
      const saved = await saveTeacherSequenceForSpace?.(space.id, sequenceDraft);
      sequenceDraft = clone(saved);
      await refreshData();
      if (!quiet) showToast?.(`Séquence « ${saved.title} » enregistrée.`);
      renderView();
      return saved;
    } catch (error) {
      showToast?.(error?.message || "Impossible d’enregistrer la séquence.", { isError:true });
      return null;
    }
  }

  async function assignSequenceDraft() {
    if (!sequenceDraft || !selectedTargets.size) {
      showToast?.("Choisissez au moins un élève ou une classe.", { isError:true });
      return;
    }
    const saved = await saveSequenceDraft({ quiet:true });
    if (!saved) return;
    const space = getCurrentTeacherSpace?.();
    if (!space?.id) return;
    try {
      await saveActivityAssignmentForSpace?.(space.id, {
        source_type:"sequence",
        source_id:String(saved.id || ""),
        title_snapshot:String(saved.title || "Séquence"),
        difficulty_mode:"fixed",
        difficulty_level:3,
        execution_limit_mode:"intrinsic",
        execution_limit_value:null
      }, buildSelectedTargetsPayload());
      showToast?.(`Séquence « ${saved.title} » attribuée.`);
      selectedTargets.clear();
      await refreshData();
      sequenceDraft = clone(sequences.find((item) => String(item.id) === String(saved.id)) || saved);
      renderView();
    } catch (error) {
      showToast?.(error?.message || "Impossible d’attribuer cette séquence.", { isError:true });
    }
  }

  function addSourceToSequence(sourceId) {
    if (!sequenceDraft) return;
    const source = findSource(sequenceAddSourceType, sourceId);
    if (!source) return;
    const intrinsic = isSourceIntrinsic(sequenceAddSourceType, source);
    const adaptiveAvailable = isAdaptiveAvailableFor(sequenceAddSourceType, source);
    sequenceDraft.items.push({
      source_type:sequenceAddSourceType,
      source_id:getSourceId(source),
      title_snapshot:getSourceTitle(source),
      difficulty_mode:adaptiveAvailable ? "adaptive" : "fixed",
      difficulty_level:adaptiveAvailable ? null : 3,
      execution_limit_mode:intrinsic ? "intrinsic" : "questions",
      execution_limit_value:intrinsic ? null : 5
    });
    renderView();
  }

  function moveSequenceItem(index, delta) {
    if (!sequenceDraft || !Array.isArray(sequenceDraft.items)) return;
    const target = index + delta;
    if (index < 0 || target < 0 || index >= sequenceDraft.items.length || target >= sequenceDraft.items.length) return;
    const [item] = sequenceDraft.items.splice(index, 1);
    sequenceDraft.items.splice(target, 0, item);
    renderView();
  }

  function updateSequenceItemConfig(control) {
    const index = Number(control.dataset.sequenceConfigIndex);
    const field = String(control.dataset.configField || "");
    const item = sequenceDraft?.items?.[index];
    if (!item) return;
    if (field === "difficulty") {
      const value = String(control.value || "3");
      item.difficulty_mode = value === "adaptive" ? "adaptive" : "fixed";
      item.difficulty_level = value === "adaptive" ? null : Math.max(1, Math.min(5, Number(value) || 3));
      return;
    }
    if (field === "execution-mode") {
      const nextMode = String(control.value || "questions") === "time" ? "time" : "questions";
      item.execution_limit_mode = nextMode;
      item.execution_limit_value = nextMode === "time" ? 300 : 5;
      renderView();
      return;
    }
    if (field === "execution-value") {
      const raw = Math.max(1, Math.trunc(Number(control.value) || 1));
      item.execution_limit_value = item.execution_limit_mode === "time" ? raw * 60 : raw;
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

  async function removeSequence(sequenceId) {
    const sequence = sequences.find((item) => String(item.id) === String(sequenceId));
    if (!sequence) return;
    const confirmed = await openDashboardConfirmDialog({
      title:"Supprimer la séquence ?",
      message:`« ${sequence.title || "Séquence"} » sera supprimée.`,
      confirmLabel:"Supprimer",
      danger:true
    });
    if (!confirmed) return;
    try {
      await deleteTeacherSequence?.(sequence.id);
      if (String(sequenceDraft?.id || "") === String(sequence.id)) sequenceDraft = null;
      await refreshData();
      renderView();
      showToast?.("Séquence supprimée.");
    } catch (error) {
      showToast?.(error?.message || "Impossible de supprimer cette séquence.", { isError:true });
    }
  }

  function buildSelectedTargetsPayload() {
    return Array.from(selectedTargets.values()).map((target) => target.type === "class"
      ? { target_type:"class", teacher_class_id:Number(target.id) }
      : { target_type:"student", student_id:Number(target.id) });
  }

  function getSelectedSource() {
    return findSource(sourceType, selectedSourceId);
  }

  function findSource(type, id) {
    const source = type === "teacher_activity" ? teacherActivities : catalogActivities;
    return source.find((item) => getSourceId(item) === String(id || "")) || null;
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
    if (!source) return false;
    const runtimeSource = type === "teacher_activity" ? teacherActivityToCatalogShape(source) : normalizeCatalogActivity(source);
    return isIntrinsicCatalogActivity(runtimeSource);
  }

  function syncDefaultsFromSelectedSource() {
    const source = getSelectedSource();
    if (!source) return;
    selectedDifficulty = isAdaptiveAvailableFor(sourceType, source) ? "adaptive" : "3";
    executionMode = isSourceIntrinsic(sourceType, source) ? "intrinsic" : "questions";
    executionValue = executionMode === "time" ? 300 : 5;
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
