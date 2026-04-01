import {
  parsePhrasesFromTextarea
} from "./model.js";

/* =========================
   STATE LOCAL
   ========================= */

let copiedConfig = null;
let stylesInjected = false;

/* =========================
   API
   ========================= */

export function requiresStudent() {
  return true;
}

export function renderToolSettings(container, settings, context = {}) {
  injectStyles();

  const students = normalizeStudents(context?.students);
  const cfg = normalizeSettingsV2(settings);

  container.innerHTML = `
    <div class="pem-config-root">
      ${renderStudentSelector(students, cfg)}
      ${renderStudentConfigs(students, cfg)}
    </div>
  `;

  bindEvents(container, students);
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettingsV2(settings);

  const selected = [];
  container.querySelectorAll("[data-student-check]").forEach((el) => {
    if (el.checked) selected.push(String(el.dataset.studentCheck || ""));
  });

  const studentConfigs = { ...previous.studentConfigs };

  container.querySelectorAll("[data-student-block]").forEach((block) => {
    const id = String(block.dataset.studentBlock || "");
    if (!id) return;

    const textarea = block.querySelector("[data-text]");
    const timeInput = block.querySelector("[data-time]");

    const phrasesText = String(textarea?.value || "");
    const phrases = parsePhrasesFromTextarea(phrasesText);

    studentConfigs[id] = {
      phraseTimeSec: Number(timeInput?.value || 5) || 5,
      phrasesText,
      phrases
    };
  });

  return {
    selectedStudentIds: selected,
    selectionOrder: selected,
    studentConfigs
  };
}

/* =========================
   RENDER
   ========================= */

function renderStudentSelector(students, cfg) {
  return `
    <div class="pem-student-grid">
      ${students.map((student) => `
        <label class="pem-student-chip">
          <input type="checkbox" data-student-check="${escapeAttr(student.id)}" ${cfg.selected.includes(student.id) ? "checked" : ""}>
          <span>${escapeHtml(student.first_name)}</span>
        </label>
      `).join("")}
    </div>
  `;
}

function renderStudentConfigs(students, cfg) {
  if (!cfg.selected.length) {
    return `
      <div class="pem-placeholder">
        Coche un ou plusieurs élèves pour afficher leur configuration.
      </div>
    `;
  }

  return `
    <div class="pem-student-sections">
      ${cfg.selected.map((id) => {
        const student = students.find((s) => s.id === id);
        const scfg = cfg.studentConfigs[id] || defaultStudentConfig();

        return `
          <section class="pem-student-card" data-student-block="${escapeAttr(id)}">
            <div class="pem-student-head">
              <div class="pem-student-name">${escapeHtml(student?.first_name || "")}</div>

              <label class="pem-student-timing">
                <span>Temps par phrase (s)</span>
                <input data-time class="cfg-input pem-student-time" type="number" min="1" max="300" step="1" value="${escapeAttr(String(scfg.phraseTimeSec))}">
              </label>
            </div>

            <div class="pem-student-body">
              <textarea
                data-text
                class="cfg-input pem-student-text"
                rows="1"
                placeholder="Utiliser des / pour séparer les étiquettes&#10;Ex : La souris/court/dans/le salon/."
              >${escapeHtml(scfg.phrasesText)}</textarea>

              <div class="pem-student-actions">
                <button class="pem-icon-btn" type="button" data-copy="${escapeAttr(id)}" aria-label="Copier">⧉</button>
                <button class="pem-icon-btn" type="button" data-paste="${escapeAttr(id)}" aria-label="Coller">⇩</button>
              </div>
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

/* =========================
   EVENTS
   ========================= */

function bindEvents(container, students) {
  container.querySelectorAll("[data-student-check]").forEach((cb) => {
    cb.addEventListener("change", () => {
      rerender(container, students);
    });
  });

  container.querySelectorAll("textarea[data-text]").forEach((textarea) => {
    autoResize(textarea);
    textarea.addEventListener("input", () => autoResize(textarea));
  });

  container.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const block = btn.closest("[data-student-block]");
      if (!block) return;
      copiedConfig = extractBlock(block);
    });
  });

  container.querySelectorAll("[data-paste]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!copiedConfig) return;
      const block = btn.closest("[data-student-block]");
      if (!block) return;
      applyBlock(block, copiedConfig);
    });
  });
}

/* =========================
   HELPERS
   ========================= */

function rerender(container, students) {
  const settings = readToolSettings(container, {});
  renderToolSettings(container, settings, { students });
}

function extractBlock(block) {
  return {
    text: String(block.querySelector("[data-text]")?.value || ""),
    time: String(block.querySelector("[data-time]")?.value || "5")
  };
}

function applyBlock(block, data) {
  const textarea = block.querySelector("[data-text]");
  const timeInput = block.querySelector("[data-time]");

  if (textarea) {
    textarea.value = data.text;
    autoResize(textarea);
  }

  if (timeInput) {
    timeInput.value = data.time;
  }
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function normalizeStudents(students) {
  if (!Array.isArray(students)) return [];
  return students
    .map((s) => ({
      id: String(s?.id || "").trim(),
      first_name: String(s?.first_name || "").trim()
    }))
    .filter((s) => s.id && s.first_name);
}

function normalizeSettingsV2(settings) {
  const selected = Array.isArray(settings?.selectionOrder)
    ? settings.selectionOrder.map(String)
    : Array.isArray(settings?.selectedStudentIds)
      ? settings.selectedStudentIds.map(String)
      : [];

  const studentConfigs = settings?.studentConfigs && typeof settings.studentConfigs === "object"
    ? settings.studentConfigs
    : {};

  return {
    selected,
    studentConfigs
  };
}

function defaultStudentConfig() {
  return {
    phraseTimeSec: 5,
    phrasesText: "",
    phrases: []
  };
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-pem-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.pemConfigStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttr(s) {
  return String(s || "")
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
