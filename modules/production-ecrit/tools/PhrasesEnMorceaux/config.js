import {
  defaultPhraseConfig,
  normalizeSettings,
  parsePhrasesFromTextarea
} from "./model.js";

/* =========================
   STATE LOCAL
   ========================= */

let copiedConfig = null;
let copiedSourceBlockKey = "";
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
  const cfg = normalizeConfigState(settings);

  container.innerHTML = `
    <div class="pem-config-root">
      ${renderProjectionConfig(cfg.projectionEnabled, cfg.commonConfig)}
      ${renderStudentSelector(students, cfg)}
      ${renderStudentConfigs(students, cfg)}
    </div>
  `;

  bindEvents(container, students);
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);

  const selected = [];
  container.querySelectorAll("[data-student-check]").forEach((el) => {
    if (el.checked) selected.push(String(el.dataset.studentCheck || ""));
  });

  const studentConfigs = { ...previous.studentConfigs };

  container.querySelectorAll("[data-student-block]").forEach((block) => {
    const id = String(block.dataset.studentBlock || "");
    if (!id) return;
    studentConfigs[id] = readPhraseConfigFromBlock(block, previous.studentConfigs?.[id]);
  });

  const projectionEnabled = container.querySelector("[data-projection-check='1']")?.checked === true;
  const commonBlock = container.querySelector("[data-common-block]");
  const commonConfig = commonBlock
    ? readPhraseConfigFromBlock(commonBlock, previous.commonConfig)
    : normalizePhraseConfig(previous.commonConfig);

  return {
    selectedStudentIds: selected,
    selectionOrder: selected,
    studentConfigs,
    projectionEnabled,
    commonConfig
  };
}

/* =========================
   RENDER
   ========================= */

function renderProjectionConfig(projectionEnabled, commonConfig) {
  const cfg = normalizePhraseConfig(commonConfig);

  return `
    <section class="pem-student-card pem-projection-card${projectionEnabled ? ' is-open' : ''}">
      <label class="pem-projection-toggle">
        <input type="checkbox" data-projection-check="1" ${projectionEnabled ? 'checked' : ''}>
        <span>Mode projection</span>
      </label>

      ${projectionEnabled ? `
        <div class="pem-projection-panel" data-common-block="1" data-config-block="common">
          <div class="pem-student-head">
            <div class="pem-student-name pem-projection-title">Phrases à afficher</div>

            ${renderTimingControls({
              time: cfg.phraseTimeSec,
              infinite: cfg.infinitePhraseTime,
              prefix: 'common'
            })}
          </div>

          <div class="pem-student-body">
            <textarea
              data-text
              class="cfg-input pem-student-text"
              rows="1"
              placeholder="Utiliser des / pour séparer les étiquettes&#10;Ex : La souris/court/dans/le salon/."
            >${escapeHtml(cfg.phrasesText)}</textarea>

            <div class="pem-student-actions">
              <button class="pem-icon-btn${copiedSourceBlockKey === 'common' ? ' is-active' : ''}" type="button" data-copy="common" aria-label="Copier" aria-pressed="${copiedSourceBlockKey === 'common' ? 'true' : 'false'}" title="Copier ce texte">
                <span class="pem-icon-symbol" aria-hidden="true">content_copy</span>
              </button>
              <button class="pem-icon-btn" type="button" data-paste="common" aria-label="Coller" title="Coller le texte copié">
                <span class="pem-icon-symbol" aria-hidden="true">content_paste</span>
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    </section>
  `;
}

function renderStudentSelector(students, cfg) {
  if (!students.length) {
    return `
      <div class="pem-placeholder">
        Aucun élève disponible pour cette activité.
      </div>
    `;
  }

  return `
    <section class="pem-selector-card">
      <div class="pem-selector-toolbar">
        <div class="pem-selector-title">Élèves</div>

        <div class="pem-selector-actions">
          <button class="pem-toolbar-btn" type="button" data-select-all="1">Cocher tous les élèves</button>
          <button class="pem-toolbar-btn" type="button" data-unselect-all="1">Décocher tous les élèves</button>
        </div>
      </div>

      <div class="pem-student-grid">
        ${students.map((student) => `
          <label class="pem-student-chip">
            <input type="checkbox" data-student-check="${escapeAttr(student.id)}" ${cfg.selectionSet.has(student.id) ? 'checked' : ''}>
            <span>${escapeHtml(student.first_name)}</span>
          </label>
        `).join("")}
      </div>
    </section>
  `;
}

function renderStudentConfigs(students, cfg) {
  const selectedStudents = students.filter((student) => cfg.selectionSet.has(student.id));

  if (!selectedStudents.length) {
    return `
      <div class="pem-placeholder">
        Coche un ou plusieurs élèves pour afficher leur configuration.
      </div>
    `;
  }

  return `
    <div class="pem-student-sections">
      ${selectedStudents.map((student) => {
        const scfg = normalizePhraseConfig(cfg.studentConfigs[student.id]);

        return `
          <section class="pem-student-card" data-student-block="${escapeAttr(student.id)}" data-config-block="${escapeAttr(student.id)}">
            <div class="pem-student-head">
              <div class="pem-student-name">${escapeHtml(student.first_name || '')}</div>

              ${renderTimingControls({
                time: scfg.phraseTimeSec,
                infinite: scfg.infinitePhraseTime,
                prefix: `student-${student.id}`
              })}
            </div>

            <div class="pem-student-body">
              <textarea
                data-text
                class="cfg-input pem-student-text"
                rows="1"
                placeholder="Utiliser des / pour séparer les étiquettes&#10;Ex : La souris/court/dans/le salon/."
              >${escapeHtml(scfg.phrasesText)}</textarea>

              <div class="pem-student-actions">
                <button class="pem-icon-btn${copiedSourceBlockKey === student.id ? ' is-active' : ''}" type="button" data-copy="${escapeAttr(student.id)}" aria-label="Copier" aria-pressed="${copiedSourceBlockKey === student.id ? 'true' : 'false'}" title="Copier ce texte">
                  <span class="pem-icon-symbol" aria-hidden="true">content_copy</span>
                </button>
                <button class="pem-icon-btn" type="button" data-paste="${escapeAttr(student.id)}" aria-label="Coller" title="Coller le texte copié">
                  <span class="pem-icon-symbol" aria-hidden="true">content_paste</span>
                </button>
              </div>
            </div>
          </section>
        `;
      }).join("")}
    </div>
  `;
}

function renderTimingControls({ time, infinite, prefix }) {
  return `
    <label class="pem-student-timing">
      <span>Temps par phrase</span>

      <div class="pem-time-controls">
        <input
          data-time
          class="cfg-input pem-student-time"
          type="number"
          min="1"
          max="300"
          step="1"
          value="${escapeAttr(String(time))}"
          ${infinite ? 'disabled' : ''}
        >

        <button
          class="pem-infinity-btn${infinite ? ' is-active' : ''}"
          type="button"
          data-infinite-btn="${escapeAttr(prefix)}"
          aria-label="Temps infini"
          aria-pressed="${infinite ? 'true' : 'false'}"
          title="Temps infini"
        >
          <span class="pem-icon-symbol" aria-hidden="true">all_inclusive</span>
        </button>
      </div>
    </label>
  `;
}

/* =========================
   EVENTS
   ========================= */

function bindEvents(container, students) {
  container.querySelector("[data-projection-check='1']")?.addEventListener("change", () => {
    rerender(container, students);
  });

  container.querySelectorAll("[data-student-check]").forEach((cb) => {
    cb.addEventListener("change", () => {
      rerender(container, students);
    });
  });

  container.querySelector("[data-select-all='1']")?.addEventListener("click", () => {
    container.querySelectorAll("[data-student-check]").forEach((cb) => {
      cb.checked = true;
    });
    rerender(container, students);
  });

  container.querySelector("[data-unselect-all='1']")?.addEventListener("click", () => {
    container.querySelectorAll("[data-student-check]").forEach((cb) => {
      cb.checked = false;
    });
    rerender(container, students);
  });

  container.querySelectorAll("textarea[data-text]").forEach((textarea) => {
    autoResize(textarea);
    textarea.addEventListener("input", () => autoResize(textarea));
  });

  container.querySelectorAll("[data-copy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const block = btn.closest("[data-config-block]");
      if (!block) return;
      copiedConfig = extractBlock(block);
      copiedSourceBlockKey = String(block.dataset.configBlock || "");
      updateCopyButtonStates(container);
    });
  });

  container.querySelectorAll("[data-paste]").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (!copiedConfig) return;
      const block = btn.closest("[data-config-block]");
      if (!block) return;
      applyBlock(block, copiedConfig);
    });
  });

  container.querySelectorAll("[data-infinite-btn]").forEach((btn) => {
    const input = btn.closest(".pem-time-controls")?.querySelector("[data-time]");
    applyInfiniteButtonState(btn, input, btn.getAttribute("aria-pressed") === "true");

    btn.addEventListener("click", () => {
      const nextActive = btn.getAttribute("aria-pressed") !== "true";
      applyInfiniteButtonState(btn, input, nextActive);
    });
  });

  updateCopyButtonStates(container);
}

/* =========================
   HELPERS
   ========================= */

function rerender(container, students) {
  const settings = readToolSettings(container, {});
  renderToolSettings(container, settings, { students });
}

function readPhraseConfigFromBlock(block, previousConfig) {
  const textarea = block.querySelector("[data-text]");
  const timeInput = block.querySelector("[data-time]");
  const infinityBtn = block.querySelector("[data-infinite-btn]");

  const phrasesText = String(textarea?.value || "");
  const phrases = parsePhrasesFromTextarea(phrasesText);
  const infinitePhraseTime = infinityBtn?.getAttribute("aria-pressed") === "true";

  return {
    ...normalizePhraseConfig(previousConfig),
    phraseTimeSec: Number(timeInput?.value || 5) || 5,
    infinitePhraseTime,
    phrasesText,
    phrases
  };
}

function extractBlock(block) {
  return {
    text: String(block.querySelector("[data-text]")?.value || ""),
    time: String(block.querySelector("[data-time]")?.value || "5"),
    infinite: block.querySelector("[data-infinite-btn]")?.getAttribute("aria-pressed") === "true"
  };
}

function applyBlock(block, data) {
  const textarea = block.querySelector("[data-text]");
  const timeInput = block.querySelector("[data-time]");
  const infinityBtn = block.querySelector("[data-infinite-btn]");

  if (textarea) {
    textarea.value = data.text;
    autoResize(textarea);
  }

  if (timeInput) {
    timeInput.value = data.time;
  }

  if (infinityBtn) {
    applyInfiniteButtonState(infinityBtn, timeInput, !!data.infinite);
  }
}

function autoResize(textarea) {
  textarea.style.height = "auto";
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function updateCopyButtonStates(container) {
  container.querySelectorAll("[data-copy]").forEach((btn) => {
    const key = String(btn.dataset.copy || "");
    const isActive = !!copiedConfig && key === copiedSourceBlockKey;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function applyInfiniteButtonState(button, input, active) {
  button.classList.toggle("is-active", !!active);
  button.setAttribute("aria-pressed", active ? "true" : "false");

  if (input) {
    input.disabled = !!active;
  }
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

function normalizeConfigState(settings) {
  const cfg = normalizeSettings(settings);
  return {
    ...cfg,
    selectionSet: new Set(Array.isArray(cfg.selectionOrder) ? cfg.selectionOrder : cfg.selectedStudentIds)
  };
}

function normalizePhraseConfig(config) {
  return {
    ...defaultPhraseConfig(),
    ...config,
    phraseTimeSec: Math.max(1, Math.min(300, Math.floor(Number(config?.phraseTimeSec ?? 5) || 5))),
    infinitePhraseTime: config?.infinitePhraseTime === true,
    phrasesText: String(config?.phrasesText || "")
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
