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
  HOLE_POSITIONS,
  SUBTRACTION_HOLE_LIMITS,
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
    <div class="subh-config-root">
      ${renderRadioGroup({
        title: "Mode de génération",
        id: "subh_generationMode",
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
    <div class="subh-term-ranges-stack">
      ${renderValueRangeWidget("t1", cfg.termRanges.t1, "Terme 1")}
      ${renderValueRangeWidget("t2", cfg.termRanges.t2, "Terme 2")}
    </div>
    ${renderSection("Réglages avancés", `
      ${renderRadioGroup({
        title: "Position du trou",
        id: "subh_holePosition",
        value: cfg.holePosition,
        options: [
          { value: HOLE_POSITIONS.FIRST, label: "Terme 1" },
          { value: HOLE_POSITIONS.SECOND, label: "Terme 2" },
          { value: HOLE_POSITIONS.BOTH, label: "Au hasard" }
        ]
      })}
      ${renderRadioGroup({
        title: "Retenues",
        id: "subh_carryMode",
        value: cfg.carryMode,
        options: [
          { value: CARRY_MODES.WITHOUT, label: "Sans retenues" },
          { value: CARRY_MODES.WITH, label: "Avec retenues" },
          { value: CARRY_MODES.BOTH, label: "Les deux" }
        ]
      })}
      ${renderResultConstraintWidget(cfg.resultConstraint)}
    `, { collapsible: true, expanded: false, idPrefix: "subh_advanced" })}
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
    <div class="tv-group subh-fixed-list" data-subh-widget="fixed-list">
      <div class="tv-group-title">Liste fixe</div>
      <div class="subh-fixed-list-note">Une ligne = une soustraction à trous. Les lignes vides sont ignorées.</div>
      <textarea
        class="tv-input subh-fixed-list-textarea"
        id="subh_fixedListRaw"
        rows="8"
        spellcheck="false"
        placeholder="Ex. :&#10;9-3=6&#10;15−7&#10;42 - 18 = 24"
      >${escapeHtml(cfg.fixedListRaw)}</textarea>
      <div class="subh-fixed-list-feedback${parsed.invalidLineNumbers.length ? " is-error" : ""}" aria-live="polite">${escapeHtml(feedback)}</div>
    </div>
  `;
}

function renderValueRangeWidget(key, range, title) {
  return renderMinMax({
    idPrefix: `subh_valueRange_${key}`,
    title,
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: range.min,
    maxValue: range.max,
    inputMin: SUBTRACTION_HOLE_LIMITS.valueMin,
    inputMax: SUBTRACTION_HOLE_LIMITS.valueMax,
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
    idPrefix: "subh_resultRange",
    title: "Limiter le résultat",
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: resultConstraint.range.min,
    maxValue: resultConstraint.range.max,
    inputMin: SUBTRACTION_HOLE_LIMITS.resultMin,
    inputMax: SUBTRACTION_HOLE_LIMITS.resultMax,
    step: 1,
    mode: resultConstraint.range.mode,
    startValue: resultConstraint.range.start,
    stepValue: resultConstraint.range.step,
    values: resultConstraint.range.values
  })
    .replace(
      '<div class="tv-group tv-group-inline">',
      `<div class="tv-group tv-group-inline subh-result-constraint${enabled ? " is-enabled" : " is-disabled"}" data-subh-widget="result-constraint">`
    )
    .replace(
      '<div class="tv-group-title tv-minmax-title">Limiter le résultat</div>',
      `<label class="tv-group-title tv-minmax-title subh-result-title">
        <input class="tv-checkbox" type="checkbox" id="subh_resultConstraint_enabled" ${enabled ? "checked" : ""}>
        <span>Limiter le résultat</span>
      </label>`
    );
}

function bindToolSettings(container) {
  bindRadio(container, "subh_generationMode", { onChange: () => rerenderFromCurrentState(container) });
  bindCollapsibleSection(container, "subh_advanced");
  bindRadio(container, "subh_holePosition");
  bindRadio(container, "subh_carryMode");

  ["subh_valueRange_t1", "subh_valueRange_t2", "subh_resultRange"].forEach((idPrefix) => {
    bindMinMax(container, idPrefix, {
      inputMin: idPrefix === "subh_resultRange" ? SUBTRACTION_HOLE_LIMITS.resultMin : SUBTRACTION_HOLE_LIMITS.valueMin,
      inputMax: idPrefix === "subh_resultRange" ? SUBTRACTION_HOLE_LIMITS.resultMax : SUBTRACTION_HOLE_LIMITS.valueMax
    });
  });

  const resultCheckbox = container.querySelector("#subh_resultConstraint_enabled");
  resultCheckbox?.addEventListener("change", () => syncResultConstraintState(container));
  syncResultConstraintState(container);

  const fixedList = container.querySelector("#subh_fixedListRaw");
  fixedList?.addEventListener("input", () => syncFixedListFeedback(container));
}

function rerenderFromCurrentState(container) {
  const previous = editorUiState.get(container) || getDefaultSettings();
  const next = readSettingsFromDom(container, previous, { validate: false });
  renderToolSettings(container, next);
}

function readSettingsFromDom(container, settings = {}, { validate = true } = {}) {
  const previous = normalizeSettings(settings);
  const generationMode = readRadio(container, "subh_generationMode", previous.generationMode);
  const holePosition = readRadio(container, "subh_holePosition", previous.holePosition);
  const carryMode = readRadio(container, "subh_carryMode", previous.carryMode);
  const ranges = {
    t1: container.querySelector("#subh_valueRange_t1_min")
      ? readMinMax(container, "subh_valueRange_t1", { inputMin: SUBTRACTION_HOLE_LIMITS.valueMin, inputMax: SUBTRACTION_HOLE_LIMITS.valueMax, errorLabel: "Les bornes de terme 1" })
      : previous.termRanges.t1,
    t2: container.querySelector("#subh_valueRange_t2_min")
      ? readMinMax(container, "subh_valueRange_t2", { inputMin: SUBTRACTION_HOLE_LIMITS.valueMin, inputMax: SUBTRACTION_HOLE_LIMITS.valueMax, errorLabel: "Les bornes de terme 2" })
      : previous.termRanges.t2
  };
  const resultEnabled = readCheckbox(container, "subh_resultConstraint_enabled") || false;
  const resultRange = readResultRange(container, previous.resultConstraint.range, resultEnabled);
  const fixedListRaw = container.querySelector("#subh_fixedListRaw")
    ? String(container.querySelector("#subh_fixedListRaw")?.value ?? "")
    : previous.fixedListRaw;

  const normalized = normalizeSettings({
    ...previous,
    generationMode,
    holePosition,
    carryMode,
    termRanges: ranges,
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
  const textarea = container.querySelector("#subh_fixedListRaw");
  const feedback = container.querySelector(".subh-fixed-list-feedback");
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
  const checkbox = container.querySelector("#subh_resultConstraint_enabled");
  const widget = container.querySelector('[data-subh-widget="result-constraint"]');
  const enabled = checkbox?.checked === true;
  widget?.classList.toggle("is-enabled", enabled);
  widget?.classList.toggle("is-disabled", !enabled);
  widget?.querySelectorAll(".tv-minmax-header-actions, .tv-minmax-advanced").forEach((el) => {
    if (enabled) el.removeAttribute("inert");
    else el.setAttribute("inert", "");
  });
}

function readResultRange(container, previousRange, enabled) {
  if (!enabled) return previousRange;
  if (!container.querySelector("#subh_resultRange_min")) return previousRange;
  return readMinMax(container, "subh_resultRange", {
    inputMin: SUBTRACTION_HOLE_LIMITS.resultMin,
    inputMax: SUBTRACTION_HOLE_LIMITS.resultMax,
    errorLabel: "Les bornes du résultat"
  });
}

function injectStyles() {
  if (stylesInjected || document.querySelector('link[data-tool-config="soustraction-trous"]')) {
    stylesInjected = true;
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./config.css", import.meta.url).href;
  link.dataset.toolConfig = "soustraction-trous";
  document.head.appendChild(link);
  stylesInjected = true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
