function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeStudent(student){
  const id = String(student?.id || "").trim();
  const firstName = String(student?.first_name || student?.firstName || "").trim();

  if (!id && !firstName) return null;

  return {
    id: id || firstName,
    firstName: firstName || "Élève sans prénom",
    gradeLevel: String(student?.grade_level || "").trim(),
    displayOrder: Number(student?.display_order) || 0
  };
}

function normalizeStudents(students){
  return (Array.isArray(students) ? students : [])
    .map(normalizeStudent)
    .filter(Boolean);
}

function pickRandom(items){
  if (!items.length) return null;
  const index = Math.floor(Math.random() * items.length);
  return items[index] || null;
}

function uniqueStrings(values){
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean)));
}

function normalizeToolState(rawState = {}){
  return {
    avoidRepeats: rawState.avoidRepeats !== false,
    drawnIds: uniqueStrings(rawState.drawnIds),
    currentStudent: rawState.currentStudent || null,
    history: (Array.isArray(rawState.history) ? rawState.history : []).slice(0, 12)
  };
}

function createProjectorState({ toolState, students = [] } = {}){
  const state = normalizeToolState(toolState);
  const validIds = new Set(students.map((student) => student.id));
  const drawnIds = state.drawnIds.filter((id) => validIds.has(id));
  const remainingCount = state.avoidRepeats
    ? students.filter((student) => !drawnIds.includes(student.id)).length
    : students.length;

  return {
    ...state,
    drawnIds,
    history: state.history.filter((student) => validIds.has(student.id)),
    currentStudent: state.currentStudent && validIds.has(state.currentStudent.id) ? state.currentStudent : null,
    remainingCount,
    totalCount: students.length,
    updatedAt: Date.now()
  };
}

function applyRandomStudentAction({ action, payload = {}, state, students = [] } = {}){
  const safeAction = String(action || "").trim();
  const cleanStudents = normalizeStudents(students);
  const currentState = normalizeToolState(state);

  if (safeAction === "set-avoid-repeats") {
    return {
      patch: {
        state: normalizeToolState({
          ...currentState,
          avoidRepeats: payload?.avoidRepeats !== false
        })
      }
    };
  }

  if (safeAction === "reset") {
    return {
      patch: {
        state: normalizeToolState({
          ...currentState,
          drawnIds: [],
          currentStudent: null,
          history: []
        })
      },
      message: "Tirage réinitialisé."
    };
  }

  if (safeAction !== "draw") return null;

  if (!cleanStudents.length) {
    return {
      error: "Ajoute d’abord des élèves dans l’onglet Classe."
    };
  }

  const validIds = new Set(cleanStudents.map((student) => student.id));
  let drawnIds = currentState.drawnIds.filter((id) => validIds.has(id));
  let pool = currentState.avoidRepeats
    ? cleanStudents.filter((student) => !drawnIds.includes(student.id))
    : cleanStudents;
  let message = "";

  if (!pool.length && currentState.avoidRepeats) {
    drawnIds = [];
    pool = cleanStudents;
    message = "Tous les élèves avaient été tirés : le tirage a été remis à zéro.";
  }

  const picked = pickRandom(pool);
  if (!picked) return null;

  return {
    patch: {
      state: normalizeToolState({
        ...currentState,
        drawnIds: uniqueStrings([...drawnIds, picked.id]),
        currentStudent: picked,
        history: [picked, ...currentState.history.filter((student) => student.id !== picked.id)].slice(0, 12)
      })
    },
    message
  };
}

export const randomStudentTeacherTool = {
  id: "random-student",
  label: "Tirage élève",
  icon: "casino",
  description: "Tirer au sort un élève de la classe, avec ou sans remise dans le tirage.",

  createInitialState(){
    return normalizeToolState();
  },

  createProjectorState({ state, students } = {}){
    return createProjectorState({
      toolState: state,
      students: normalizeStudents(students)
    });
  },

  applyAction: applyRandomStudentAction,

  createControlPanel({ host, getWidget, updateWidget, getStudents, openProjector, showToast } = {}){
    function getCleanStudents(){
      return normalizeStudents(getStudents?.());
    }

    function getCurrentToolState(){
      return normalizeToolState(getWidget?.()?.state);
    }

    function commitPatch(patch = {}, { renderPanel = false } = {}){
      updateWidget?.(patch, { renderPanel, sync: true });
    }

    function runAction(action, payload = {}, { renderAfter = true } = {}){
      const result = applyRandomStudentAction({
        action,
        payload,
        state: getCurrentToolState(),
        students: getCleanStudents()
      });

      if (!result) return;

      if (result.error) {
        showToast?.(result.error, { isError: true });
        if (renderAfter) render();
        return;
      }

      if (result.patch) {
        commitPatch(result.patch, { renderPanel: false });
      }

      if (result.message) {
        showToast?.(result.message, { isError: result.isError === true });
      }

      if (renderAfter) render();
    }

    function getProjectorState(){
      return createProjectorState({
        toolState: getCurrentToolState(),
        students: getCleanStudents()
      });
    }

    function drawStudent(){
      runAction("draw");
    }

    function resetDraw(){
      runAction("reset");
    }

    function renderHistory(history){
      if (!history.length) {
        return `<div class="tt-random-student-history-empty">Aucun tirage pour l’instant.</div>`;
      }

      return `
        <ol class="tt-random-student-history-list">
          ${history.map((student) => `
            <li>
              <span>${escapeHtml(student.firstName)}</span>
              ${student.gradeLevel ? `<small>${escapeHtml(student.gradeLevel)}</small>` : ""}
            </li>
          `).join("")}
        </ol>
      `;
    }

    function render(){
      if (!host) return;

      const widget = getWidget?.();
      const students = getCleanStudents();
      const state = getProjectorState();
      const canDraw = students.length > 0;
      const currentName = state.currentStudent?.firstName || "—";

      host.innerHTML = `
        <section class="tt-control-panel tt-control-panel-compact" aria-label="Tirage au sort d’élève">
          <div class="tt-control-panel-head">
            <div>
              <h3>Tirage au sort d’élève</h3>
              <p>Le résultat s’affiche dans un petit widget déplaçable dans la fenêtre de projection.</p>
            </div>
            <span class="dashboard-material-icon tt-control-panel-icon" aria-hidden="true">casino</span>
          </div>

          <div class="tt-widget-panel-strip">
            <span class="dashboard-material-icon" aria-hidden="true">drag_pan</span>
            <span>Déplace ce widget depuis sa barre de titre dans la projection.</span>
          </div>

          <div class="tt-random-student-stats" aria-label="État du tirage">
            <div>
              <strong>${students.length}</strong>
              <span>élève${students.length > 1 ? "s" : ""}</span>
            </div>
            <div>
              <strong>${state.remainingCount}</strong>
              <span>encore disponible${state.remainingCount > 1 ? "s" : ""}</span>
            </div>
          </div>

          <label class="tt-checkbox-row">
            <input id="ttRandomStudentAvoidRepeats" type="checkbox" ${state.avoidRepeats ? "checked" : ""}>
            <span>Ne pas retirer un élève déjà tiré</span>
          </label>

          <label class="tt-checkbox-row">
            <input id="ttRandomStudentVisible" type="checkbox" ${widget?.visible !== false ? "checked" : ""}>
            <span>Afficher ce widget dans la projection</span>
          </label>

          <div class="tt-random-student-current" aria-live="polite">
            <span>Résultat actuel</span>
            <strong>${escapeHtml(currentName)}</strong>
          </div>

          <div class="tt-control-actions">
            <button id="ttRandomStudentOpenProjector" class="btn" type="button">
              <span class="dashboard-material-icon" aria-hidden="true">open_in_new</span>
              <span>Ouvrir la projection</span>
            </button>
            <button id="ttRandomStudentDraw" class="btn primary" type="button" ${canDraw ? "" : "disabled"}>
              <span class="dashboard-material-icon" aria-hidden="true">casino</span>
              <span>Tirer au sort</span>
            </button>
            <button id="ttRandomStudentReset" class="btn" type="button">
              <span class="dashboard-material-icon" aria-hidden="true">restart_alt</span>
              <span>Réinitialiser</span>
            </button>
          </div>

          <div class="tt-random-student-history">
            <h4>Derniers tirages</h4>
            ${renderHistory(state.history)}
          </div>
        </section>
      `;

      host.querySelector("#ttRandomStudentAvoidRepeats")?.addEventListener("change", (event) => {
        runAction("set-avoid-repeats", {
          avoidRepeats: event.currentTarget.checked === true
        });
      });

      host.querySelector("#ttRandomStudentVisible")?.addEventListener("change", (event) => {
        updateWidget?.({ visible: event.currentTarget.checked === true });
      });

      host.querySelector("#ttRandomStudentOpenProjector")?.addEventListener("click", () => {
        openProjector?.();
      });

      host.querySelector("#ttRandomStudentDraw")?.addEventListener("click", drawStudent);
      host.querySelector("#ttRandomStudentReset")?.addEventListener("click", resetDraw);
    }

    render();

    return {
      render,
      destroy(){
        if (host) host.innerHTML = "";
      }
    };
  },

  renderProjector({ host, chromeHost, widgetInfoHost, state, sendAction } = {}){
    if (!host) return;

    const safeState = state && typeof state === "object" ? state : {};
    const currentStudent = safeState.currentStudent || null;
    const currentName = String(currentStudent?.firstName || "").trim();
    const hasResult = Boolean(currentName);
    const remainingCount = Math.max(0, Number(safeState.remainingCount) || 0);
    const totalCount = Math.max(0, Number(safeState.totalCount) || 0);
    const avoidRepeats = safeState.avoidRepeats !== false;

    host.innerHTML = `
      <section class="ttp-random-student${hasResult ? " has-result" : ""}" aria-live="polite">
        <div class="ttp-random-student-name">${hasResult ? escapeHtml(currentName) : "—"}</div>
      </section>
    `;

    if (widgetInfoHost) {
      widgetInfoHost.textContent = totalCount > 0
        ? `${remainingCount} disponible${remainingCount > 1 ? "s" : ""} / ${totalCount}`
        : "En attente de la liste des élèves";
    }

    let controlsHost = chromeHost || null;
    if (!controlsHost) {
      controlsHost = document.createElement("div");
      controlsHost.className = "ttp-random-student-controls";
      controlsHost.dataset.projectorControls = "true";
      host.querySelector(".ttp-random-student")?.append(controlsHost);
    }

    controlsHost.innerHTML = `
      <button class="ttp-widget-action-btn is-primary" type="button" data-widget-action data-random-student-action="draw" ${totalCount > 0 ? "" : "disabled"}>
        Tirer
      </button>
      <button class="ttp-widget-action-btn" type="button" data-widget-action data-random-student-action="reset">
        Réinit.
      </button>
      <label class="ttp-random-student-toggle" data-widget-action>
        <input type="checkbox" data-random-student-avoid ${avoidRepeats ? "checked" : ""}>
        <span>Sans remise</span>
      </label>
    `;

    controlsHost.querySelector("[data-random-student-action='draw']")?.addEventListener("click", () => {
      sendAction?.("draw");
    });

    controlsHost.querySelector("[data-random-student-action='reset']")?.addEventListener("click", () => {
      sendAction?.("reset");
    });

    controlsHost.querySelector("[data-random-student-avoid]")?.addEventListener("change", (event) => {
      sendAction?.("set-avoid-repeats", {
        avoidRepeats: event.currentTarget.checked === true
      });
    });
  }
};
