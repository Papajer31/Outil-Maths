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
  MULTIPLICATION_HOLE_LIMITS,
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
    <div class="mulh-config-root">
      ${renderRadioGroup({
        title: "Mode de génération",
        id: "mulh_generationMode",
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
    <div class="mulh-term-ranges-stack">
      ${renderValueRangeWidget("f1", cfg.factorRanges.f1, "Facteur 1")}
      ${renderValueRangeWidget("f2", cfg.factorRanges.f2, "Facteur 2")}
    </div>
    ${renderSection("Réglages avancés", `
      ${renderRadioGroup({
        title: "Position du trou",
        id: "mulh_holePosition",
        value: cfg.holePosition,
        options: [
          { value: HOLE_POSITIONS.FIRST, label: "Facteur 1" },
          { value: HOLE_POSITIONS.SECOND, label: "Facteur 2" },
          { value: HOLE_POSITIONS.BOTH, label: "Au hasard" }
        ]
      })}
      ${renderRadioGroup({
        title: "Retenues",
        id: "mulh_carryMode",
        value: cfg.carryMode,
        options: [
          { value: CARRY_MODES.WITHOUT, label: "Sans retenues" },
          { value: CARRY_MODES.WITH, label: "Avec retenues" },
          { value: CARRY_MODES.BOTH, label: "Les deux" }
        ]
      })}
      ${renderResultConstraintWidget(cfg.resultConstraint)}
    `, { collapsible: true, expanded: false, idPrefix: "mulh_advanced" })}
  `;
}

function renderFixedListBranch(cfg) {
  const parsed = parseFixedListRaw(cfg.fixedListRaw);
  const feedback = parsed.invalidLineNumbers.length
    ? `Ligne(s) invalide(s) : ${parsed.invalidLineNumbers.join(", ")}.`
    : parsed.entries.length
      ? `${parsed.entries.length} multiplication(s) valide(s).`
      : "";

  return `
    <div class="tv-group mulh-fixed-list" data-mulh-widget="fixed-list">
      <div class="tv-group-title">Liste fixe</div>
      <div class="mulh-fixed-list-note">Une ligne = une multiplication à trous. Les lignes vides sont ignorées.</div>
      <textarea
        class="tv-input mulh-fixed-list-textarea"
        id="mulh_fixedListRaw"
        rows="8"
        spellcheck="false"
        placeholder="Ex. :&#10;6×7=42&#10;12 x 3&#10;13*7=91"
      >${escapeHtml(cfg.fixedListRaw)}</textarea>
      <div class="mulh-fixed-list-feedback${parsed.invalidLineNumbers.length ? " is-error" : ""}" aria-live="polite">${escapeHtml(feedback)}</div>
    </div>
  `;
}

function renderValueRangeWidget(key, range, title) {
  return renderMinMax({
    idPrefix: `mulh_valueRange_${key}`,
    title,
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: range.min,
    maxValue: range.max,
    inputMin: MULTIPLICATION_HOLE_LIMITS.valueMin,
    inputMax: getFactorInputMax(key),
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
    idPrefix: "mulh_resultRange",
    title: "Limiter le résultat",
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: resultConstraint.range.min,
    maxValue: resultConstraint.range.max,
    inputMin: MULTIPLICATION_HOLE_LIMITS.resultMin,
    inputMax: MULTIPLICATION_HOLE_LIMITS.resultMax,
    step: 1,
    mode: resultConstraint.range.mode,
    startValue: resultConstraint.range.start,
    stepValue: resultConstraint.range.step,
    values: resultConstraint.range.values
  })
    .replace(
      '<div class="tv-group tv-group-inline">',
      `<div class="tv-group tv-group-inline mulh-result-constraint${enabled ? " is-enabled" : " is-disabled"}" data-mulh-widget="result-constraint">`
    )
    .replace(
      '<div class="tv-group-title tv-minmax-title">Limiter le résultat</div>',
      `<label class="tv-group-title tv-minmax-title mulh-result-title">
        <input class="tv-checkbox" type="checkbox" id="mulh_resultConstraint_enabled" ${enabled ? "checked" : ""}>
        <span>Limiter le résultat</span>
      </label>`
    );
}

function getFactorInputMax(factorKey) {
  return factorKey === "f2" ? MULTIPLICATION_HOLE_LIMITS.secondMax : MULTIPLICATION_HOLE_LIMITS.firstMax;
}

function getMulhInputMax(idPrefix) {
  if (idPrefix === "mulh_resultRange") return MULTIPLICATION_HOLE_LIMITS.resultMax;
  if (idPrefix === "mulh_valueRange_f2") return MULTIPLICATION_HOLE_LIMITS.secondMax;
  return MULTIPLICATION_HOLE_LIMITS.firstMax;
}

function bindToolSettings(container) {
  bindRadio(container, "mulh_generationMode", { onChange: () => rerenderFromCurrentState(container) });
  bindCollapsibleSection(container, "mulh_advanced");
  bindRadio(container, "mulh_holePosition");
  bindRadio(container, "mulh_carryMode");

  ["mulh_valueRange_f1", "mulh_valueRange_f2", "mulh_resultRange"].forEach((idPrefix) => {
    bindMinMax(container, idPrefix, {
      inputMin: idPrefix === "mulh_resultRange" ? MULTIPLICATION_HOLE_LIMITS.resultMin : MULTIPLICATION_HOLE_LIMITS.valueMin,
      inputMax: getMulhInputMax(idPrefix)
    });
  });

  const resultCheckbox = container.querySelector("#mulh_resultConstraint_enabled");
  resultCheckbox?.addEventListener("change", () => syncResultConstraintState(container));
  syncResultConstraintState(container);

  const fixedList = container.querySelector("#mulh_fixedListRaw");
  fixedList?.addEventListener("input", () => syncFixedListFeedback(container));
}

function rerenderFromCurrentState(container) {
  const previous = editorUiState.get(container) || getDefaultSettings();
  const next = readSettingsFromDom(container, previous, { validate: false });
  renderToolSettings(container, next);
}

function readSettingsFromDom(container, settings = {}, { validate = true } = {}) {
  const previous = normalizeSettings(settings);
  const generationMode = readRadio(container, "mulh_generationMode", previous.generationMode);
  const holePosition = readRadio(container, "mulh_holePosition", previous.holePosition);
  const carryMode = readRadio(container, "mulh_carryMode", previous.carryMode);
  const ranges = {
    f1: container.querySelector("#mulh_valueRange_f1_min")
      ? readMinMax(container, "mulh_valueRange_f1", { inputMin: MULTIPLICATION_HOLE_LIMITS.valueMin, inputMax: MULTIPLICATION_HOLE_LIMITS.firstMax, errorLabel: "Les bornes de facteur 1" })
      : previous.factorRanges.f1,
    f2: container.querySelector("#mulh_valueRange_f2_min")
      ? readMinMax(container, "mulh_valueRange_f2", { inputMin: MULTIPLICATION_HOLE_LIMITS.valueMin, inputMax: MULTIPLICATION_HOLE_LIMITS.secondMax, errorLabel: "Les bornes de facteur 2" })
      : previous.factorRanges.f2
  };
  const resultEnabled = readCheckbox(container, "mulh_resultConstraint_enabled") || false;
  const resultRange = readResultRange(container, previous.resultConstraint.range, resultEnabled);
  const fixedListRaw = container.querySelector("#mulh_fixedListRaw")
    ? String(container.querySelector("#mulh_fixedListRaw")?.value ?? "")
    : previous.fixedListRaw;

  const normalized = normalizeSettings({
    ...previous,
    generationMode,
    holePosition,
    carryMode,
    factorRanges: ranges,
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
  const textarea = container.querySelector("#mulh_fixedListRaw");
  const feedback = container.querySelector(".mulh-fixed-list-feedback");
  if (!textarea || !feedback) return;
  const parsed = parseFixedListRaw(textarea.value);
  feedback.classList.toggle("is-error", parsed.invalidLineNumbers.length > 0);
  feedback.textContent = parsed.invalidLineNumbers.length
    ? `Ligne(s) invalide(s) : ${parsed.invalidLineNumbers.join(", ")}.`
    : parsed.entries.length
      ? `${parsed.entries.length} multiplication(s) valide(s).`
      : "";
}

function syncResultConstraintState(container) {
  const checkbox = container.querySelector("#mulh_resultConstraint_enabled");
  const widget = container.querySelector('[data-mulh-widget="result-constraint"]');
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
  if (!container.querySelector("#mulh_resultRange_min")) return previousRange;
  return readMinMax(container, "mulh_resultRange", {
    inputMin: MULTIPLICATION_HOLE_LIMITS.resultMin,
    inputMax: MULTIPLICATION_HOLE_LIMITS.resultMax,
    errorLabel: "Les bornes du résultat"
  });
}

function injectStyles() {
  if (stylesInjected || document.querySelector('link[data-tool-config="multiplication-trous"]')) {
    stylesInjected = true;
    return;
  }
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = new URL("./config.css", import.meta.url).href;
  link.dataset.toolConfig = "multiplication-trous";
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
