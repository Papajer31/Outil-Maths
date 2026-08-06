import { studentState } from "../student-state.js";
import {
  goBackToSelectMode,
  ensureClassDataLoaded,
  setSelectedStudent,
  setSelectedStudents,
  setStudentCode,
  loadStudentCodeKeypad,
  validateSingleStudentCode,
  refreshMissionsForCurrentSelection,
  toggleSelectedStudentSelection
} from "../student-actions.js";
import { requestAppFullscreen, escapeHtml, escapeAttr } from "../../shared/dom-helpers.js";
import { renderMaterialIcon } from "../../shared/material-icons-svg.js";
import { renderStudentSelectionCards, sortSelectableStudents } from "./student-selection-grid.js";

export function renderSelectStudentsView(root) {
  const currentMode = normalizeMode(studentState.activitiesMode);
  const selectedStudents = normalizeSelectedStudents(studentState.selectedStudents);
  const students = sortSelectableStudents(studentState.publicStudents);
  const isLoading = !!studentState.isLoadingActivities && !students.length;
  const message = String(studentState.publicStudentsMessage || "").trim();
  const selectedIds = selectedStudents.map((student) => String(student?.id || "").trim()).filter(Boolean);
  const selectedSingle = currentMode === "individual" && selectedStudents.length === 1 ? selectedStudents[0] : null;

  root.innerHTML = `
    <div class="selectstudents-shell sessionchoice-shell student-screen-shell student-stars-shell" id="selectStudentsShell">
      <button
        class="student-nav-btn student-nav-back"
        id="btnBackToSelectMode"
        type="button"
        aria-label="Retour"
        data-skip-autofs="true"
      >
        ${renderMaterialIcon("arrow_back")}
      </button>

      <div class="student-stars-content selectstudents-content">
        <section class="selectstudents-panel" aria-label="Choix des élèves">
          <div id="selectStudentsContent" class="sessionchoice-content">
            ${renderSelectStudentsBody({
              students,
              selectedIds,
              selectedSingle,
              currentMode,
              isLoading,
              message
            })}
          </div>
        </section>
      </div>
    </div>
  `;

  const controller = new AbortController();
  const { signal } = controller;

  const shell = root.querySelector("#selectStudentsShell");
  const validateGroupButton = root.querySelector("#btnValidateGroupSelection");
  const validateSingleButton = root.querySelector("#btnValidateStudentCode");
  const studentCodeInput = root.querySelector("#studentCodeInput");
  const studentCodeMessage = root.querySelector("#studentCodeMessage");
  const studentCodeOverlay = root.querySelector("#studentCodeOverlay");

  const closeStudentCodeOverlay = () => {
    setStudentCode("");
    setSelectedStudent(null);
  };

  root.querySelector("#btnBackToSelectMode")?.addEventListener("click", goBackToSelectMode, { signal });
  shell?.addEventListener("click", (event) => {
    if (event.target.closest("[data-skip-autofs='true']")) return;
    requestAppFullscreen();
  }, { signal });
  studentCodeOverlay?.addEventListener("click", (event) => {
    if (event.target !== studentCodeOverlay) return;
    closeStudentCodeOverlay();
  }, { signal });
  root.addEventListener("keydown", (event) => {
    if (!studentCodeOverlay) return;
    if (event.key === "Escape") {
      closeStudentCodeOverlay();
      return;
    }
    if (event.key === "Enter" && !event.isComposing && !validateSingleButton?.disabled) {
      event.preventDefault();
      validateSingleButton.click();
    }
  }, { signal });

  root.querySelectorAll("[data-student-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const studentId = String(button.dataset.studentId || "").trim();
      const student = students.find((row) => String(row?.id || "").trim() === studentId) || null;
      if (!student) return;

      if (currentMode === "group") {
        toggleSelectedStudentSelection(student);
        return;
      }

      setStudentCode("");
      setSelectedStudent(student);
      void loadStudentCodeKeypad(student.id);
    }, { signal });
  });

  const updateStudentCode = (value) => {
    const nextValue = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
    if (studentCodeInput) studentCodeInput.value = nextValue;
    setStudentCode(nextValue);
    validateSingleButton?.toggleAttribute("disabled", nextValue.length < 3);
    if (studentCodeMessage) studentCodeMessage.textContent = "";
  };

  root.querySelectorAll("[data-student-code-key]").forEach((button) => {
    button.addEventListener("click", () => updateStudentCode(`${studentState.studentCode}${button.dataset.studentCodeKey || ""}`), { signal });
  });
  root.querySelector("[data-student-code-delete]")?.addEventListener("click", () => {
    updateStudentCode(String(studentState.studentCode || "").slice(0, -1));
  }, { signal });

  validateSingleButton?.addEventListener("click", async () => {
    if (currentMode !== "individual") return;
    validateSingleButton.setAttribute("disabled", "disabled");
    if (studentCodeMessage) studentCodeMessage.textContent = "Vérification du code…";

    try {
      const ok = await validateSingleStudentCode();
      if (!ok) {
        validateSingleButton.removeAttribute("disabled");
        if (studentCodeMessage) studentCodeMessage.textContent = "Code élève incorrect.";
        return;
      }
      await refreshMissionsForCurrentSelection();
      window.location.hash = "#/activities";
    } catch (err) {
      validateSingleButton.removeAttribute("disabled");
      if (studentCodeMessage) studentCodeMessage.textContent = err?.message || "Impossible de vérifier le code.";
    }
  }, { signal });

  validateGroupButton?.addEventListener("click", async () => {
    if (currentMode !== "group") return;
    const normalizedSelection = normalizeSelectedStudents(studentState.selectedStudents);
    if (normalizedSelection.length < 2) return;
    validateGroupButton.setAttribute("disabled", "disabled");
    setSelectedStudents(normalizedSelection);
    await refreshMissionsForCurrentSelection();
    window.location.hash = "#/activities";
  }, { signal });

  if (!studentState.publicStudents.length && !studentState.isLoadingActivities && !message) {
    void ensureClassDataLoaded({ swallowError: true });
  }

  return () => controller.abort();
}

function renderSelectStudentsBody({ students, selectedIds, selectedSingle, currentMode, isLoading, message }) {
  if (isLoading) {
    return `
      <div class="sessionchoice-placeholder">
        Chargement des élèves…
      </div>
    `;
  }

  if (message) {
    return `
      <div class="sessionchoice-placeholder">
        ${escapeHtml(message)}
      </div>
    `;
  }

  if (!students.length) {
    return `
      <div class="sessionchoice-placeholder">
        Aucun élève disponible dans cette classe.
      </div>
    `;
  }

  const selectedCount = selectedIds.length;
  const groupActions = currentMode === "group"
    ? `
      <div class="selectstudents-actions">
        <button
          type="button"
          class="btn btn-primary btn-big selectstudents-validate-btn"
          id="btnValidateGroupSelection"
          ${selectedCount >= 2 ? "" : "disabled"}
        >
          Valider
        </button>
      </div>
    `
    : "";
  const studentCodeOverlay = currentMode === "individual" ? renderStudentCodeOverlay(selectedSingle) : "";

  return `
    <div class="student-selection-grid sessionchoice-grid selectstudents-grid">
      ${renderStudentSelectionCards(students, selectedIds)}
    </div>

    ${groupActions}
    ${studentCodeOverlay}
  `;
}

function renderStudentCodeOverlay(student) {
  if (!student) return "";

  const value = String(studentState.studentCode || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  const studentId = String(student.id || "").trim();
  const keypadKeys = studentState.studentCodeKeypadStudentId === studentId
    ? studentState.studentCodeKeypad
    : [];
  const keypadLoading = studentState.isLoadingStudentCodeKeypad && studentState.studentCodeKeypadStudentId === studentId;
  const keypadMessage = String(studentState.studentCodeKeypadMessage || "").trim();
  return `
    <div
      class="selectstudents-code-overlay"
      id="studentCodeOverlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studentCodeTitle"
      data-skip-autofs="true"
    >
      <div class="selectstudents-code-card" data-skip-autofs="true">
        <div class="selectstudents-code-title" id="studentCodeTitle">
          Entre ton code élève
        </div>
        <div class="selectstudents-code-input-row">
          <input
            id="studentCodeInput"
            class="selectstudents-code-input"
            value="${escapeAttr(value)}"
            inputmode="none"
            autocomplete="off"
            maxlength="3"
            aria-label="Code élève"
            readonly
            data-skip-autofs="true"
          >
          <button type="button" class="selectstudents-code-delete" data-student-code-delete aria-label="Effacer le dernier caractère" title="Effacer" data-skip-autofs="true">
            <svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 -960 960 960" width="24" fill="currentColor" aria-hidden="true"><path d="m456-320 104-104 104 104 56-56-104-104 104-104-56-56-104 104-104-104-56 56 104 104-104 104 56 56Zm-96 160q-19 0-36-8.5T296-192L80-480l216-288q11-15 28-23.5t36-8.5h440q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H360ZM180-480l180 240h440v-480H360L180-480Zm400 0Z"/></svg>
          </button>
        </div>
        <div class="selectstudents-code-keypad" role="group" aria-label="Clavier du code élève">
          ${keypadLoading ? '<div class="selectstudents-code-keypad-loading">Préparation du clavier…</div>' : keypadKeys.map((key) => `
            <button type="button" class="selectstudents-code-key" data-student-code-key="${escapeAttr(key)}" aria-label="Ajouter ${escapeAttr(key)}" data-skip-autofs="true">${escapeHtml(key)}</button>
          `).join("")}
        </div>
        <button
          type="button"
          class="btn btn-primary btn-big selectstudents-validate-btn selectstudents-code-submit"
          id="btnValidateStudentCode"
          data-skip-autofs="true"
          ${value.length >= 3 && keypadKeys.length ? "" : "disabled"}
        >
          Valider
        </button>
        <div id="studentCodeMessage" class="sessionchoice-hint selectstudents-code-message">${escapeHtml(keypadMessage)}</div>
      </div>
    </div>
  `;
}

function normalizeMode(value) {
  return String(value || "").trim().toLowerCase() === "group" ? "group" : "individual";
}

function normalizeSelectedStudents(students) {
  return [...(Array.isArray(students) ? students : [])]
    .filter(Boolean)
    .map((student) => ({ ...student, id: String(student?.id || "").trim() }))
    .filter((student, index, rows) => {
      if (!student.id) return false;
      return rows.findIndex((row) => row.id === student.id) === index;
    });
}
