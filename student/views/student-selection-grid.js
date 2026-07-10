import { escapeHtml, escapeAttr } from "../../shared/dom-helpers.js";

export function sortSelectableStudents(students) {
  return [...(Array.isArray(students) ? students : [])].sort((a, b) => {
    const classOrderA = Number(a?.class_display_order ?? 0);
    const classOrderB = Number(b?.class_display_order ?? 0);
    if (classOrderA !== classOrderB) return classOrderA - classOrderB;

    const firstNameA = String(a?.first_name || "").toLowerCase();
    const firstNameB = String(b?.first_name || "").toLowerCase();
    return firstNameA.localeCompare(firstNameB, "fr");
  });
}

export function countSelectableFirstNameDuplicates(students) {
  const map = new Map();

  for (const student of (Array.isArray(students) ? students : [])) {
    const key = String(student?.first_name || "").trim().toLowerCase();
    if (!key) continue;
    map.set(key, (map.get(key) || 0) + 1);
  }

  return map;
}

export function getSelectableStudentInitialLetter(firstName) {
  const clean = String(firstName || "").trim();
  if (!clean) return "";

  const normalized = clean
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();

  const match = normalized.match(/[A-Z]/);
  return match ? match[0] : "";
}

export function renderStudentSelectionCards(students, selectedIds = []) {
  const rows = sortSelectableStudents(students);
  const duplicateMap = countSelectableFirstNameDuplicates(rows);
  const selectedSet = new Set(
    (Array.isArray(selectedIds) ? selectedIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  );

  return rows.map((student) => {
    const studentId = String(student?.id || "").trim();
    const firstName = String(student?.first_name || "").trim();
    const className = String(student?.class_name || "").trim();
    const showClassName = (duplicateMap.get(firstName.toLowerCase()) || 0) > 1 && className;
    const initialLetter = getSelectableStudentInitialLetter(firstName);

    return `
      <button
        type="button"
        class="student-selection-btn${selectedSet.has(studentId) ? " is-selected" : ""}"
        data-student-id="${escapeAttr(studentId)}"
      >
        <div class="student-selection-initial" aria-hidden="true">
          ${
            initialLetter
              ? `<img class="student-selection-initial-img" src="./shared/ui-assets/lettres/${escapeAttr(initialLetter)}.webp" alt="">`
              : `<span class="student-selection-initial-fallback">?</span>`
          }
        </div>
        <div class="student-selection-name">${escapeHtml(firstName)}</div>
        ${showClassName ? `<div class="student-selection-class">${escapeHtml(className)}</div>` : ""}
      </button>
    `;
  }).join("");
}
