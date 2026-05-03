import { studentState } from "../student-state.js";
import {
  goBackToSelectMode,
  ensureClassDataLoaded,
  setSelectedStudent,
  setSelectedStudents,
  toggleSelectedStudentSelection
} from "../student-actions.js";
import { requestAppFullscreen, escapeHtml } from "../../shared/dom-helpers.js";
import { renderStudentSelectionCards, sortSelectableStudents } from "./student-selection-grid.js";

export function renderSelectStudentsView(root) {
  const currentMode = normalizeMode(studentState.activitiesMode);
  const selectedStudents = normalizeSelectedStudents(studentState.selectedStudents);
  const students = sortSelectableStudents(studentState.publicStudents);
  const isLoading = !!studentState.isLoadingActivities && !students.length;
  const message = String(studentState.publicStudentsMessage || "").trim();
  const selectedIds = selectedStudents.map((student) => String(student?.id || "").trim()).filter(Boolean);

  root.innerHTML = `
    <div class="selectstudents-shell sessionchoice-shell student-screen-shell student-stars-shell" id="selectStudentsShell">
      <button
        class="student-nav-btn student-nav-back"
        id="btnBackToSelectMode"
        type="button"
        aria-label="Retour"
        data-skip-autofs="true"
      >
        <span class="student-icon" aria-hidden="true">arrow_back</span>
      </button>

      <div class="student-stars-content selectstudents-content">
        <section class="selectstudents-panel" aria-label="Choix des élèves">
          <div id="selectStudentsContent" class="sessionchoice-content">
            ${renderSelectStudentsBody({
              students,
              selectedIds,
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
  const validateButton = root.querySelector("#btnValidateGroupSelection");

  root.querySelector("#btnBackToSelectMode")?.addEventListener("click", goBackToSelectMode, { signal });
  shell?.addEventListener("click", (event) => {
    if (event.target.closest("[data-skip-autofs='true']")) return;
    requestAppFullscreen();
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

      setSelectedStudent(student);
      window.location.hash = "#/activities";
    }, { signal });
  });

  validateButton?.addEventListener("click", () => {
    if (currentMode !== "group") return;
    const normalizedSelection = normalizeSelectedStudents(studentState.selectedStudents);
    if (normalizedSelection.length < 2) return;
    setSelectedStudents(normalizedSelection);
    window.location.hash = "#/activities";
  }, { signal });

  if (!studentState.publicStudents.length && !studentState.isLoadingActivities && !message) {
    void ensureClassDataLoaded({ swallowError: true });
  }

  return () => controller.abort();
}

function renderSelectStudentsBody({ students, selectedIds, currentMode, isLoading, message }) {
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

  return `
    <div class="student-selection-grid sessionchoice-grid selectstudents-grid">
      ${renderStudentSelectionCards(students, selectedIds)}
    </div>

    <div class="selectstudents-actions">
      ${currentMode === "group"
        ? `
          <button
            type="button"
            class="btn btn-primary btn-big selectstudents-validate-btn"
            id="btnValidateGroupSelection"
            ${selectedCount >= 2 ? "" : "disabled"}
          >
            Valider
          </button>
        `
        : ""}
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
