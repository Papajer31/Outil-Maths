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
  SUBTRACTION_LIMITS,
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
    <div class="sub-config-root">
      ${renderRadioGroup({
        title: "Mode de génération",
        id: "sub_generationMode",
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
  syncFixedListFeedback(container);
}

export function readToolSettings(container, settings = {}) {
  const normalized = readSettingsFromDom(container, settings, { validate: true });
  if (!hasAtLeastOneQuestion(normalized)) throw new Error(getImpossibleMessage(normalized));
  return normalized;
}

export { getDefaultSettings };

function renderGenerationBranch(cfg) {
  if (cfg.generationMode === GENERATION_MODES.FIXED_LIST) return renderFixedListBranch(cfg);
  return renderRandomBranch(cfg);
}

function renderRandomBranch(cfg) {
  return `
    <div class="sub-term-ranges-stack">
      ${renderTermRangeWidget("t1", cfg.termRanges.t1, "Terme 1")}
      ${renderTermRangeWidget("t2", cfg.termRanges.t2, "Terme 2")}
    </div>
    ${renderSection("Réglages avancés", `
      ${renderRadioGroup({
        title: "Retenues",
        id: "sub_carryMode",
        value: cfg.carryMode,
        options: [
          { value: CARRY_MODES.WITHOUT, label: "Sans retenues" },
          { value: CARRY_MODES.WITH, label: "Avec retenues" },
          { value: CARRY_MODES.BOTH, label: "Les deux" }
        ]
      })}
      ${renderResultConstraintWidget(cfg.resultConstraint)}
    `, { collapsible: true, expanded: false, idPrefix: "sub_advanced" })}
  `;
}

function renderFixedListBranch(cfg) {
  const parsed = parseFixedListRaw(cfg.fixedListRaw);
  const feedback = parsed.invalidLineNumbers.length
    ? `Ligne(s) invalide(s) : ${parsed.invalidLineNumbers.join(", ")}.`
    : parsed.entries.length
      ? `${parsed.entries.length} soustraction(s) valide(s).`
      : "";

  return `
    <div class="tv-group sub-fixed-list" data-sub-widget="fixed-list">
      <div class="tv-group-title">Liste fixe</div>
      <div class="sub-fixed-list-note">Une ligne = une soustraction. Les lignes vides sont ignorées.</div>
      <textarea
        class="tv-input sub-fixed-list-textarea"
        id="sub_fixedListRaw"
        rows="8"
        spellcheck="false"
        placeholder="Ex. :&#10;9-3=6&#10;15−7&#10;42 - 18 = 24"
      >${escapeHtml(cfg.fixedListRaw)}</textarea>
      <div class="sub-fixed-list-feedback${parsed.invalidLineNumbers.length ? " is-error" : ""}" aria-live="polite">${escapeHtml(feedback)}</div>
    </div>
  `;
}

function renderTermRangeWidget(termKey, range, title) {
  return renderMinMax({
    idPrefix: `sub_termRange_${termKey}`,
    title,
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: range.min,
    maxValue: range.max,
    inputMin: SUBTRACTION_LIMITS.termMin,
    inputMax: SUBTRACTION_LIMITS.termMax,
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
    idPrefix: "sub_resultRange",
    title: "Limiter le résultat",
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: resultConstraint.range.min,
    maxValue: resultConstraint.range.max,
    inputMin: SUBTRACTION_LIMITS.resultMin,
    inputMax: SUBTRACTION_LIMITS.resultMax,
    step: 1,
    mode: resultConstraint.range.mode,
    startValue: resultConstraint.range.start,
    stepValue: resultConstraint.range.step,
    values: resultConstraint.range.values
  })
    .replace(
      '<div class="tv-group tv-group-inline">',
      `<div class="tv-group tv-group-inline sub-result-constraint${enabled ? " is-enabled" : " is-disabled"}" data-sub-widget="result-constraint">`
    )
    .replace(
      '<div class="tv-group-title tv-minmax-title">Limiter le résultat</div>',
      `<label class="tv-group-title tv-minmax-title sub-result-title">
        <input class="tv-checkbox" type="checkbox" id="sub_resultConstraint_enabled" ${enabled ? "checked" : ""}>
        <span>Limiter le résultat</span>
      </label>`
    );
}

function bindToolSettings(container) {
  bindRadio(container, "sub_generationMode", { onChange: () => rerenderFromCurrentState(container) });
  bindCollapsibleSection(container, "sub_advanced");
  bindRadio(container, "sub_carryMode");

  ["sub_termRange_t1", "sub_termRange_t2", "sub_resultRange"].forEach((idPrefix) => {
    bindMinMax(container, idPrefix, {
      inputMin: idPrefix === "sub_resultRange" ? SUBTRACTION_LIMITS.resultMin : SUBTRACTION_LIMITS.termMin,
      inputMax: idPrefix === "sub_resultRange" ? SUBTRACTION_LIMITS.resultMax : SUBTRACTION_LIMITS.termMax
    });
  });

  const resultCheckbox = container.querySelector("#sub_resultConstraint_enabled");
  resultCheckbox?.addEventListener("change", () => syncResultConstraintState(container));
  syncResultConstraintState(container);

  const fixedList = container.querySelector("#sub_fixedListRaw");
  fixedList?.addEventListener("input", () => syncFixedListFeedback(container));
}

function rerenderFromCurrentState(container) {
  const previous = editorUiState.get(container) || getDefaultSettings();
  const next = readSettingsFromDom(container, previous, { validate: false });
  renderToolSettings(container, next);
}

function readSettingsFromDom(container, settings = {}, { validate = true } = {}) {
  const previous = normalizeSettings(settings);
  const generationMode = readRadio(container, "sub_generationMode", previous.generationMode);
  const carryMode = readRadio(container, "sub_carryMode", previous.carryMode);
  const termRanges = {
    t1: container.querySelector("#sub_termRange_t1_min")
      ? readMinMax(container, "sub_termRange_t1", { inputMin: SUBTRACTION_LIMITS.termMin, inputMax: SUBTRACTION_LIMITS.termMax, errorLabel: "Les bornes du terme 1" })
      : previous.termRanges.t1,
    t2: container.querySelector("#sub_termRange_t2_min")
      ? readMinMax(container, "sub_termRange_t2", { inputMin: SUBTRACTION_LIMITS.termMin, inputMax: SUBTRACTION_LIMITS.termMax, errorLabel: "Les bornes du terme 2" })
      : previous.termRanges.t2
  };
  const resultEnabled = readCheckbox(container, "sub_resultConstraint_enabled") || false;
  const resultRange = readResultRange(container, previous.resultConstraint.range, resultEnabled);
  const fixedListRaw = container.querySelector("#sub_fixedListRaw")
    ? String(container.querySelector("#sub_fixedListRaw")?.value ?? "")
    : previous.fixedListRaw;

  const normalized = normalizeSettings({
    ...previous,
    generationMode,
    carryMode,
    termRanges,
    resultConstraint: { enabled: resultEnabled, range: resultRange },
    fixedListRaw
  });

  if (validate && normalized.generationMode === GENERATION_MODES.FIXED_LIST) {
    const parsed = parseFixedListRaw(normalized.fixedListRaw);
    if (parsed.invalidLineNumbers.length) throw new Error(`Liste fixe : ligne(s) invalide(s) ${parsed.invalidLineNumbers.join(", ")}.`);
  }
  return normalized;
}

function syncFixedListFeedback(container) {
  const textarea = container.querySelector("#sub_fixedListRaw");
  const feedback = container.querySelector(".sub-fixed-list-feedback");
  if (!textarea || !feedback) return;
  const parsed = parseFixedListRaw(textarea.value);
  feedback.classList.toggle("is-error", parsed.invalidLineNumbers.length > 0);
  feedback.textContent = parsed.invalidLineNumbers.length
    ? `Ligne(s) invalide(s) : ${parsed.invalidLineNumbers.join(", ")}.`
    : parsed.entries.length
      ? `${parsed.entries.length} soustraction(s) valide(s).`
      : "";
}

function syncResultConstraintState(container) {
  const checkbox = container.querySelector("#sub_resultConstraint_enabled");
  const widget = container.querySelector('[data-sub-widget="result-constraint"]');
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
  if (!container.querySelector("#sub_resultRange_min")) return previousRange;

  try {
    return readMinMax(container, "sub_resultRange", {
      inputMin: SUBTRACTION_LIMITS.resultMin,
      inputMax: SUBTRACTION_LIMITS.resultMax,
      errorLabel: "Les bornes du résultat"
    });
  } catch (error) {
    if (enabled) throw error;
    return previousRange;
  }
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-sub-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.subConfigStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
