import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderSection,
  bindCollapsibleSection,
  renderMinMax,
  bindMinMax,
  readMinMax,
  readCheckbox
} from "../../shared/config-widgets.js";
import {
  GENERATION_MODES,
  CARRY_MODES,
  TERM_COUNT_OPTIONS,
  ADDITION_LIMITS,
  getDefaultSettings,
  normalizeSettings,
  hasAtLeastOneQuestion,
  getImpossibleMessage,
  parseFixedListRaw
} from "./model.js";

let stylesInjected = false;
const editorUiState = new WeakMap();

export function renderToolSettings(container, settings) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="add-config-root">
      ${renderRadioGroup({
        title: "Mode de génération",
        id: "add_generationMode",
        value: cfg.generationMode,
        options: [
          { value: GENERATION_MODES.RANDOM, label: "Aléatoire" },
          { value: GENERATION_MODES.FIXED_LIST, label: "Liste fixe" }
        ]
      })}
      ${renderGenerationBranch(cfg)}
    </div>
  `;

  bindToolSettings(container);
  editorUiState.set(container, cfg);
  syncValidationState(container);
}

export function readToolSettings(container, settings = {}) {
  const normalized = readSettingsFromDom(container, settings, { validate: true });
  if (!hasAtLeastOneQuestion(normalized)) {
    throw new Error(getImpossibleMessage(normalized));
  }
  return normalized;
}

export { getDefaultSettings };

function renderGenerationBranch(cfg) {
  if (cfg.generationMode === GENERATION_MODES.FIXED_LIST) {
    return renderFixedListBranch(cfg);
  }

  return renderRandomBranch(cfg);
}

function renderRandomBranch(cfg) {
  const maxTermCount = getSelectedMaxTermCount(cfg.termCounts);

  return `
    ${renderNumberCheckboxWidget({
      title: "Nombre de termes",
      widgetKey: "term-counts",
      dataAttr: "data-add-term-count",
      values: TERM_COUNT_OPTIONS,
      selectedValues: cfg.termCounts
    })}
    ${renderTermRanges(cfg.termRanges, maxTermCount)}
    ${renderSection("Réglages avancés", `
      ${renderRadioGroup({
        title: "Retenues",
        id: "add_carryMode",
        value: cfg.carryMode,
        options: [
          { value: CARRY_MODES.WITHOUT, label: "Sans retenues" },
          { value: CARRY_MODES.WITH, label: "Avec retenues" },
          { value: CARRY_MODES.BOTH, label: "Les deux" }
        ]
      })}
      ${renderResultConstraintWidget(cfg.resultConstraint)}
    `, { collapsible: true, expanded: false, idPrefix: "add_advanced" })}
  `;
}

function renderFixedListBranch(cfg) {
  const parsed = parseFixedListRaw(cfg.fixedListRaw);
  const feedback = parsed.invalidLineNumbers.length
    ? `Ligne(s) invalide(s) : ${parsed.invalidLineNumbers.join(", ")}.`
    : parsed.entries.length
      ? `${parsed.entries.length} addition(s) valide(s).`
      : "";

  return `
    <div class="tv-group add-fixed-list" data-add-widget="fixed-list">
      <div class="tv-group-title">Liste fixe</div>
      <div class="add-fixed-list-note">Une ligne = une addition. Les lignes vides sont ignorées.</div>
      <textarea
        class="tv-input add-fixed-list-textarea"
        id="add_fixedListRaw"
        rows="8"
        spellcheck="false"
        placeholder="Ex. :&#10;2+3=5&#10;1+4&#10;1+2+3=6"
      >${escapeHtml(cfg.fixedListRaw)}</textarea>
      <div class="add-fixed-list-feedback${parsed.invalidLineNumbers.length ? " is-error" : ""}" aria-live="polite">${escapeHtml(feedback)}</div>
    </div>
  `;
}

function renderTermRanges(termRanges, maxTermCount) {
  const items = [];
  for (let index = 1; index <= Math.max(2, maxTermCount); index += 1) {
    items.push(renderTermRangeWidget(`t${index}`, termRanges?.[`t${index}`]));
  }

  return `
    <div class="add-term-ranges-stack">
      ${items.join("")}
    </div>
  `;
}

function renderTermRangeWidget(termKey, range) {
  return renderMinMax({
    idPrefix: `add_termRange_${termKey}`,
    title: `Terme ${termKey.slice(1)}`,
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: range.min,
    maxValue: range.max,
    inputMin: ADDITION_LIMITS.termMin,
    inputMax: ADDITION_LIMITS.termMax,
    step: 1,
    mode: range.mode,
    startValue: range.start,
    stepValue: range.step,
    values: range.values
  });
}

function renderResultConstraintWidget(resultConstraint) {
  const enabled = resultConstraint?.enabled === true;
  return renderMinMax({
    idPrefix: "add_resultRange",
    title: "Limiter le résultat",
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: resultConstraint.range.min,
    maxValue: resultConstraint.range.max,
    inputMin: ADDITION_LIMITS.resultMin,
    inputMax: ADDITION_LIMITS.resultMax,
    step: 1,
    mode: resultConstraint.range.mode,
    startValue: resultConstraint.range.start,
    stepValue: resultConstraint.range.step,
    values: resultConstraint.range.values
  })
    .replace(
      '<div class="tv-group tv-group-inline">',
      `<div class="tv-group tv-group-inline add-result-constraint${enabled ? " is-enabled" : " is-disabled"}" data-add-widget="result-constraint">`
    )
    .replace(
      '<div class="tv-group-title tv-minmax-title">Limiter le résultat</div>',
      `<label class="tv-group-title tv-minmax-title add-result-title">
        <input class="tv-checkbox" type="checkbox" id="add_resultConstraint_enabled" ${enabled ? "checked" : ""}>
        <span>Limiter le résultat</span>
      </label>`
    );
}

function bindToolSettings(container) {
  bindRadio(container, "add_generationMode", {
    onChange: () => rerenderFromCurrentState(container)
  });
  bindCollapsibleSection(container, "add_advanced");
  bindRadio(container, "add_carryMode");

  [
    "add_termRange_t1",
    "add_termRange_t2",
    "add_termRange_t3",
    "add_termRange_t4",
    "add_resultRange"
  ].forEach((idPrefix) => {
    bindMinMax(container, idPrefix, {
      inputMin: idPrefix === "add_resultRange" ? ADDITION_LIMITS.resultMin : ADDITION_LIMITS.termMin,
      inputMax: idPrefix === "add_resultRange" ? ADDITION_LIMITS.resultMax : ADDITION_LIMITS.termMax
    });
  });

  container.querySelectorAll("[data-add-term-count]").forEach((input) => {
    input.addEventListener("change", () => {
      syncValidationState(container);
      rerenderFromCurrentState(container);
    });
  });

  const resultCheckbox = container.querySelector("#add_resultConstraint_enabled");
  resultCheckbox?.addEventListener("change", () => syncResultConstraintState(container));
  syncResultConstraintState(container);

  const fixedList = container.querySelector("#add_fixedListRaw");
  fixedList?.addEventListener("input", () => syncFixedListFeedback(container));
}

function rerenderFromCurrentState(container) {
  const previous = editorUiState.get(container) || getDefaultSettings();
  const next = readSettingsFromDom(container, previous, { validate: false });
  renderToolSettings(container, next);
}

function readSettingsFromDom(container, settings = {}, { validate = true } = {}) {
  const previous = normalizeSettings(settings);
  const generationMode = readRadio(container, "add_generationMode", previous.generationMode);

  const termCounts = readCheckedNumberValues(container, "[data-add-term-count]", TERM_COUNT_OPTIONS, previous.termCounts);
  const carryMode = readRadio(container, "add_carryMode", previous.carryMode);

  const termRanges = {
    t1: container.querySelector("#add_termRange_t1_min")
      ? readMinMax(container, "add_termRange_t1", { inputMin: ADDITION_LIMITS.termMin, inputMax: ADDITION_LIMITS.termMax, errorLabel: "Les bornes du terme 1" })
      : previous.termRanges.t1,
    t2: container.querySelector("#add_termRange_t2_min")
      ? readMinMax(container, "add_termRange_t2", { inputMin: ADDITION_LIMITS.termMin, inputMax: ADDITION_LIMITS.termMax, errorLabel: "Les bornes du terme 2" })
      : previous.termRanges.t2,
    t3: container.querySelector("#add_termRange_t3_min")
      ? readMinMax(container, "add_termRange_t3", { inputMin: ADDITION_LIMITS.termMin, inputMax: ADDITION_LIMITS.termMax, errorLabel: "Les bornes du terme 3" })
      : previous.termRanges.t3,
    t4: container.querySelector("#add_termRange_t4_min")
      ? readMinMax(container, "add_termRange_t4", { inputMin: ADDITION_LIMITS.termMin, inputMax: ADDITION_LIMITS.termMax, errorLabel: "Les bornes du terme 4" })
      : previous.termRanges.t4
  };

  const resultEnabled = readCheckbox(container, "add_resultConstraint_enabled") || false;
  const resultRange = readResultRange(container, previous.resultConstraint.range, resultEnabled);

  const fixedListRaw = container.querySelector("#add_fixedListRaw")
    ? String(container.querySelector("#add_fixedListRaw")?.value ?? "")
    : previous.fixedListRaw;

  const normalized = normalizeSettings({
    ...previous,
    generationMode,
    termCounts,
    carryMode,
    termRanges,
    resultConstraint: {
      enabled: resultEnabled,
      range: resultRange
    },
    fixedListRaw
  });

  if (validate && normalized.generationMode === GENERATION_MODES.FIXED_LIST) {
    const parsed = parseFixedListRaw(normalized.fixedListRaw);
    if (parsed.invalidLineNumbers.length) {
      throw new Error(`Liste fixe : ligne(s) invalide(s) ${parsed.invalidLineNumbers.join(", ")}.`);
    }
  }

  return normalized;
}

function syncValidationState(container) {
  const termCounts = readCheckedNumberValues(container, "[data-add-term-count]", TERM_COUNT_OPTIONS, []);
  setWidgetState(container.querySelector('[data-add-widget="term-counts"]'), {
    incomplete: termCounts.length === 0
  });
  syncFixedListFeedback(container);
}

function syncFixedListFeedback(container) {
  const textarea = container.querySelector("#add_fixedListRaw");
  const feedback = container.querySelector(".add-fixed-list-feedback");
  if (!textarea || !feedback) return;
  const parsed = parseFixedListRaw(textarea.value);
  feedback.classList.toggle("is-error", parsed.invalidLineNumbers.length > 0);
  feedback.textContent = parsed.invalidLineNumbers.length
    ? `Ligne(s) invalide(s) : ${parsed.invalidLineNumbers.join(", ")}.`
    : parsed.entries.length
      ? `${parsed.entries.length} addition(s) valide(s).`
      : "";
}

function syncResultConstraintState(container) {
  const checkbox = container.querySelector("#add_resultConstraint_enabled");
  const widget = container.querySelector('[data-add-widget="result-constraint"]');
  const enabled = checkbox?.checked === true;

  widget?.classList.toggle("is-enabled", enabled);
  widget?.classList.toggle("is-disabled", !enabled);
  widget?.querySelectorAll(".tv-minmax-header-actions, .tv-minmax-advanced").forEach((el) => {
    if (enabled) {
      el.removeAttribute("inert");
    } else {
      el.setAttribute("inert", "");
    }
  });
}

function readResultRange(container, previousRange, enabled) {
  if (!container.querySelector("#add_resultRange_min")) return previousRange;

  try {
    return readMinMax(container, "add_resultRange", {
      inputMin: ADDITION_LIMITS.resultMin,
      inputMax: ADDITION_LIMITS.resultMax,
      errorLabel: "Les bornes du résultat"
    });
  } catch (error) {
    if (enabled) throw error;
    return previousRange;
  }
}

function renderNumberCheckboxWidget({ title, widgetKey, dataAttr, values, selectedValues }) {
  const selected = new Set(Array.isArray(selectedValues) ? selectedValues : []);
  const items = (Array.isArray(values) ? values : []).map((value) => {
    const safeValue = Number(value);
    const id = `add_${widgetKey}_${safeValue}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `
      <label class="tv-checkbox-row add-number-option">
        <input
          class="tv-checkbox"
          type="checkbox"
          id="${escapeAttr(id)}"
          value="${safeValue}"
          ${dataAttr}
          ${selected.has(safeValue) ? "checked" : ""}
        >
        <span>${safeValue}</span>
      </label>
    `;
  }).join("");

  return `
    <div class="tv-group add-number-widget" data-add-widget="${escapeAttr(widgetKey)}">
      <div class="add-number-widget-line">
        <div class="tv-group-title add-number-widget-title">${escapeHtml(title)}</div>
        <div class="add-number-options">
          ${items}
        </div>
      </div>
      <div class="add-widget-warning">Sélectionne au moins une valeur.</div>
    </div>
  `;
}

function readCheckedNumberValues(container, selector, allowedValues, fallbackValues = []) {
  const allowed = new Set((Array.isArray(allowedValues) ? allowedValues : []).map((value) => Number(value)));
  const values = Array.from(container.querySelectorAll(`${selector}:checked`))
    .map((input) => Number(input.value))
    .filter((value) => Number.isFinite(value) && allowed.has(value));

  if (values.length) {
    return (Array.isArray(allowedValues) ? allowedValues : []).filter((value) => values.includes(value));
  }

  return Array.isArray(fallbackValues) ? [...fallbackValues] : [];
}

function setWidgetState(widget, { incomplete = false } = {}) {
  if (!widget) return;
  widget.classList.toggle("is-incomplete", incomplete === true);
}

function getSelectedMaxTermCount(termCounts) {
  if (!Array.isArray(termCounts) || !termCounts.length) return 2;
  return Math.max(2, ...termCounts.map((value) => Number(value) || 0));
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-add-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.addConfigStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
