import { studentState } from "../student-state.js";
import {
  goBackToActivities,
  goBackToSessionStart,
  setSelectedStudent
} from "../student-actions.js";
import {
  normalizeAccessCode,
  listPublicStudentsForSpace
} from "../student-api.js";
import { ensureSelectedActivityMeta } from "../student-activity-meta.js";

export function renderSessionChoiceView(root) {
  root.innerHTML = `
    <div class="sessionchoice-shell student-screen-shell" id="sessionChoiceShell">
      <button
        class="student-nav-btn student-nav-back"
        id="btnBackToActivities"
        type="button"
        aria-label="Retour"
        data-skip-autofs="true"
      >
        <span class="student-icon" aria-hidden="true">arrow_back</span>
      </button>

      <div class="sessionchoice-content">
        <div id="sessionChoiceContent" class="sessionchoice-placeholder">Chargement des élèves…</div>
      </div>
    </div>
  `;

  const controller = new AbortController();
  const { signal } = controller;
  let disposed = false;

  const els = {
    shell: root.querySelector("#sessionChoiceShell"),
    back: root.querySelector("#btnBackToActivities"),
    content: root.querySelector("#sessionChoiceContent")
  };

  els.back?.addEventListener("click", goBackToActivities, { signal });
  els.shell?.addEventListener("click", (event) => {
    if (event.target.closest("[data-skip-autofs='true']")) return;
    enterFullscreenIfPossible();
  }, { signal });

  void boot();
  return cleanup;

  async function boot() {
    const accessCode = normalizeAccessCode(studentState.accessCode);
    const configName = String(studentState.selectedConfig?.config_name || "").trim();

    if (!accessCode || !configName) {
      goBackToActivities();
      return;
    }

    try {
      const meta = await ensureSelectedActivityMeta();
      if (disposed) return;

      if (!meta.requiresStudent) {
        setSelectedStudent(null);
        goBackToSessionStart();
        return;
      }

      const students = await listPublicStudentsForSpace(accessCode);
      if (disposed) return;

      const rows = Array.isArray(students)
        ? students.filter((student) => meta.allowedStudentIds.includes(String(student?.id || "")))
        : [];

      renderStudents(rows);
    } catch (err) {
      if (disposed) return;
      els.content.innerHTML = `
        <div class="activities-placeholder">${escapeHtml(err?.message || "Impossible de charger les élèves.")}</div>
      `;
    }
  }

  function renderStudents(students) {
    const rows = [...students].sort((a, b) => {
      const classOrderA = Number(a?.class_display_order ?? 0);
      const classOrderB = Number(b?.class_display_order ?? 0);
      if (classOrderA !== classOrderB) return classOrderA - classOrderB;

      const firstNameA = String(a?.first_name || "").toLowerCase();
      const firstNameB = String(b?.first_name || "").toLowerCase();
      return firstNameA.localeCompare(firstNameB, "fr");
    });

    if (!rows.length) {
      els.content.innerHTML = `
        <div class="activities-placeholder">Aucun élève disponible pour cette activité.</div>
      `;
      return;
    }

    const duplicateMap = countFirstNameDuplicates(rows);

    els.content.innerHTML = `
      <div class="student-selection-grid sessionchoice-grid">
        ${rows.map((student) => {
          const firstName = String(student.first_name || "").trim();
          const className = String(student.class_name || "").trim();
          const showClassName = (duplicateMap.get(firstName.toLowerCase()) || 0) > 1 && className;
          const initialLetter = getStudentInitialLetter(firstName);

          return `
            <button
              type="button"
              class="student-selection-btn"
              data-student-id="${escapeAttr(student.id ?? "")}"
            >
              <div class="student-selection-initial" aria-hidden="true">
                ${
                  initialLetter
                    ? `<img class="student-selection-initial-img" src="./student/lettres/${escapeAttr(initialLetter)}.png" alt="">`
                    : `<span class="student-selection-initial-fallback">?</span>`
                }
              </div>
              <div class="student-selection-name">${escapeHtml(firstName)}</div>
              ${showClassName ? `<div class="student-selection-class">${escapeHtml(className)}</div>` : ""}
            </button>
          `;
        }).join("")}
      </div>
    `;

    els.content.querySelectorAll("[data-student-id]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const studentId = String(btn.dataset.studentId || "").trim();
        const selectedStudent = rows.find((row) => String(row?.id || "") === studentId) || null;
        setSelectedStudent(selectedStudent);
        goBackToSessionStart();
      }, { signal });
    });
  }

  function cleanup() {
    if (disposed) return;
    disposed = true;
    controller.abort();
  }
}

function countFirstNameDuplicates(students){
  const map = new Map();

  for (const student of students) {
    const key = String(student?.first_name || "").trim().toLowerCase();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }

  return map;
}

function getStudentInitialLetter(firstName){
  const clean = String(firstName || "").trim();
  if (!clean) return "";

  const normalized = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  const match = normalized.match(/[A-Z]/);
  return match ? match[0] : "";
}

function enterFullscreenIfPossible(){
  try {
    if (!document.fullscreenElement){
      const result = document.documentElement.requestFullscreen?.();
      if (result?.catch){
        result.catch(() => {});
      }
    }
  } catch {}
}

function escapeHtml(value){
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value){
  return escapeHtml(value);
}
