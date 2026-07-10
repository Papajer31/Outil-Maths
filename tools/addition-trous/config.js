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
  ADDITION_HOLE_LIMITS,
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
    <div class="addh-config-root">
      ${renderRadioGroup({
        title: "Mode de génération",
        id: "addh_generationMode",
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
    <div class="addh-term-ranges-stack">
      ${renderValueRangeWidget("t1", cfg.termRanges.t1, "Terme 1")}
      ${renderValueRangeWidget("t2", cfg.termRanges.t2, "Terme 2")}
    </div>
    ${renderSection("Réglages avancés", `
      ${renderRadioGroup({
        title: "Position du trou",
        id: "addh_holePosition",
        value: cfg.holePosition,
        options: [
          { value: HOLE_POSITIONS.FIRST, label: "Terme 1" },
          { value: HOLE_POSITIONS.SECOND, label: "Terme 2" },
          { value: HOLE_POSITIONS.BOTH, label: "Au hasard" }
        ]
      })}
      ${renderRadioGroup({
        title: "Retenues",
        id: "addh_carryMode",
        value: cfg.carryMode,
        options: [
          { value: CARRY_MODES.WITHOUT, label: "Sans retenues" },
          { value: CARRY_MODES.WITH, label: "Avec retenues" },
          { value: CARRY_MODES.BOTH, label: "Les deux" }
        ]
      })}
      ${renderResultConstraintWidget(cfg.resultConstraint)}
    `, { collapsible: true, expanded: false, idPrefix: "addh_advanced" })}
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
    <div class="tv-group addh-fixed-list" data-addh-widget="fixed-list">
      <div class="tv-group-title">Liste fixe</div>
      <div class="addh-fixed-list-note">Une ligne = une addition à trous. Les lignes vides sont ignorées.</div>
      <textarea
        class="tv-input addh-fixed-list-textarea"
        id="addh_fixedListRaw"
        rows="8"
        spellcheck="false"
        placeholder="Ex. :&#10;2+3=5&#10;14 + 8&#10;29+13=42"
      >${escapeHtml(cfg.fixedListRaw)}</textarea>
      <div class="addh-fixed-list-feedback${parsed.invalidLineNumbers.length ? " is-error" : ""}" aria-live="polite">${escapeHtml(feedback)}</div>
    </div>
  `;
}

function renderValueRangeWidget(key, range, title) {
  return renderMinMax({
    idPrefix: `addh_valueRange_${key}`,
    title,
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: range.min,
    maxValue: range.max,
    inputMin: ADDITION_HOLE_LIMITS.valueMin,
    inputMax: ADDITION_HOLE_LIMITS.valueMax,
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
    idPrefix: "addh_resultRange",
    title: "Limiter le résultat",
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: resultConstraint.range.min,
    maxValue: resultConstraint.range.max,
    inputMin: ADDITION_HOLE_LIMITS.resultMin,
    inputMax: ADDITION_HOLE_LIMITS.resultMax,
    step: 1,
    mode: resultConstraint.range.mode,
    startValue: resultConstraint.range.start,
    stepValue: resultConstraint.range.step,
    values: resultConstraint.range.values
  })
    .replace(
      '<div class="tv-group tv-group-inline">',
      `<div class="tv-group tv-group-inline addh-result-constraint${enabled ? " is-enabled" : " is-disabled"}" data-addh-widget="result-constraint">`
    )
    .replace(
      '<div class="tv-group-title tv-minmax-title">Limiter le résultat</div>',
      `<label class="tv-group-title tv-minmax-title addh-result-title">
        <input class="tv-checkbox" type="checkbox" id="addh_resultConstraint_enabled" ${enabled ? "checked" : ""}>
        <span>Limiter le résultat</span>
      </label>`
    );
}

function bindToolSettings(container) {
  bindRadio(container, "addh_generationMode", { onChange: () => rerenderFromCurrentState(container) });
  bindCollapsibleSection(container, "addh_advanced");
  bindRadio(container, "addh_holePosition");
  bindRadio(container, "addh_carryMode");

  ["addh_valueRange_t1", "addh_valueRange_t2", "addh_resultRange"].forEach((idPrefix) => {
    bindMinMax(container, idPrefix, {
      inputMin: idPrefix === "addh_resultRange" ? ADDITION_HOLE_LIMITS.resultMin : ADDITION_HOLE_LIMITS.valueMin,
      inputMax: idPrefix === "addh_resultRange" ? ADDITION_HOLE_LIMITS.resultMax : ADDITION_HOLE_LIMITS.valueMax
    });
  });

  const resultCheckbox = container.querySelector("#addh_resultConstraint_enabled");
  resultCheckbox?.addEventListener("change", () => syncResultConstraintState(container));
  syncResultConstraintState(container);

  const fixedList = container.querySelector("#addh_fixedListRaw");
  fixedList?.addEventListener("input", () => syncFixedListFeedback(container));
}

function rerenderFromCurrentState(container) {
  const previous = editorUiState.get(container) || getDefaultSettings();
  const next = readSettingsFromDom(container, previous, { validate: false });
  renderToolSettings(container, next);
}

function readSettingsFromDom(container, settings = {}, { validate = true } = {}) {
  const previous = normalizeSettings(settings);
  const generationMode = readRadio(container, "addh_generationMode", previous.generationMode);
  const holePosition = readRadio(container, "addh_holePosition", previous.holePosition);
  const carryMode = readRadio(container, "addh_carryMode", previous.carryMode);
  const ranges = {
    t1: container.querySelector("#addh_valueRange_t1_min")
      ? readMinMax(container, "addh_valueRange_t1", { inputMin: ADDITION_HOLE_LIMITS.valueMin, inputMax: ADDITION_HOLE_LIMITS.valueMax, errorLabel: "Les bornes de terme 1" })
      : previous.termRanges.t1,
    t2: container.querySelector("#addh_valueRange_t2_min")
      ? readMinMax(container, "addh_valueRange_t2", { inputMin: ADDITION_HOLE_LIMITS.valueMin, inputMax: ADDITION_HOLE_LIMITS.valueMax, errorLabel: "Les bornes de terme 2" })
      : previous.termRanges.t2
  };
  const resultEnabled = readCheckbox(container, "addh_resultConstraint_enabled") || false;
  const resultRange = readResultRange(container, previous.resultConstraint.range, resultEnabled);
  const fixedListRaw = container.querySelector("#addh_fixedListRaw")
    ? String(container.querySelector("#addh_fixedListRaw")?.value ?? "")
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
  const textarea = container.querySelector("#addh_fixedListRaw");
  const feedback = container.querySelector(".addh-fixed-list-feedback");
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
  const checkbox = container.querySelector("#addh_resultConstraint_enabled");
  const widget = container.querySelector('[data-addh-widget="result-constraint"]');
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
  if (!container.querySelector("#addh_resultRange_min")) return previousRange;
  return readMinMax(container, "addh_resultRange", {
    inputMin: ADDITION_HOLE_LIMITS.resultMin,
    inputMax: ADDITION_HOLE_LIMITS.resultMax,
    errorLabel: "Les bornes du résultat"
  });
}

function injectStyles() {
  if (stylesInjected || document.querySelector('link[data-tool-config="addition-trous"]')) {
    stylesInjected = true;
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./config.css", import.meta.url).href;
  link.dataset.toolConfig = "addition-trous";
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
