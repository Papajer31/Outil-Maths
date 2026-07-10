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
  MULTIPLICATION_LIMITS,
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
    <div class="mpos-config-root">
      ${renderRadioGroup({
        title: "Mode de génération",
        id: "mpos_generationMode",
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
    <div class="mpos-term-ranges-stack">
      ${renderFactorRangeWidget("f1", cfg.factorRanges.f1, "Facteur 1")}
      ${renderFactorRangeWidget("f2", cfg.factorRanges.f2, "Facteur 2")}
    </div>
    ${renderSection("Réglages avancés", `
      ${renderRadioGroup({
        title: "Retenues",
        id: "mpos_carryMode",
        value: cfg.carryMode,
        options: [
          { value: CARRY_MODES.WITHOUT, label: "Sans retenues" },
          { value: CARRY_MODES.WITH, label: "Avec retenues" },
          { value: CARRY_MODES.BOTH, label: "Les deux" }
        ]
      })}
      ${renderResultConstraintWidget(cfg.resultConstraint)}
    `, { collapsible: true, expanded: false, idPrefix: "mpos_advanced" })}
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
    <div class="tv-group mpos-fixed-list" data-mpos-widget="fixed-list">
      <div class="tv-group-title">Liste fixe</div>
      <div class="mpos-fixed-list-note">Une ligne = une multiplication. Les lignes vides sont ignorées.</div>
      <textarea
        class="tv-input mpos-fixed-list-textarea"
        id="mpos_fixedListRaw"
        rows="8"
        spellcheck="false"
        placeholder="Ex. :&#10;12×3=36&#10;24 x 5&#10;13*7=91"
      >${escapeHtml(cfg.fixedListRaw)}</textarea>
      <div class="mpos-fixed-list-feedback${parsed.invalidLineNumbers.length ? " is-error" : ""}" aria-live="polite">${escapeHtml(feedback)}</div>
    </div>
  `;
}

function renderFactorRangeWidget(factorKey, range, title) {
  return renderMinMax({
    idPrefix: `mpos_factorRange_${factorKey}`,
    title,
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: range.min,
    maxValue: range.max,
    inputMin: MULTIPLICATION_LIMITS.factorMin,
    inputMax: getFactorInputMax(factorKey),
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
    idPrefix: "mpos_resultRange",
    title: "Limiter le résultat",
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: resultConstraint.range.min,
    maxValue: resultConstraint.range.max,
    inputMin: MULTIPLICATION_LIMITS.resultMin,
    inputMax: MULTIPLICATION_LIMITS.resultMax,
    step: 1,
    mode: resultConstraint.range.mode,
    startValue: resultConstraint.range.start,
    stepValue: resultConstraint.range.step,
    values: resultConstraint.range.values
  })
    .replace(
      '<div class="tv-group tv-group-inline">',
      `<div class="tv-group tv-group-inline mpos-result-constraint${enabled ? " is-enabled" : " is-disabled"}" data-mpos-widget="result-constraint">`
    )
    .replace(
      '<div class="tv-group-title tv-minmax-title">Limiter le résultat</div>',
      `<label class="tv-group-title tv-minmax-title mpos-result-title">
        <input class="tv-checkbox" type="checkbox" id="mpos_resultConstraint_enabled" ${enabled ? "checked" : ""}>
        <span>Limiter le résultat</span>
      </label>`
    );
}

function getFactorInputMax(factorKey) {
  return factorKey === "f2" ? MULTIPLICATION_LIMITS.factor2Max : MULTIPLICATION_LIMITS.factor1Max;
}

function getMposInputMax(idPrefix) {
  if (idPrefix === "mpos_resultRange") return MULTIPLICATION_LIMITS.resultMax;
  if (idPrefix === "mpos_factorRange_f2") return MULTIPLICATION_LIMITS.factor2Max;
  return MULTIPLICATION_LIMITS.factor1Max;
}

function bindToolSettings(container) {
  bindRadio(container, "mpos_generationMode", { onChange: () => rerenderFromCurrentState(container) });
  bindCollapsibleSection(container, "mpos_advanced");
  bindRadio(container, "mpos_carryMode");

  ["mpos_factorRange_f1", "mpos_factorRange_f2", "mpos_resultRange"].forEach((idPrefix) => {
    bindMinMax(container, idPrefix, {
      inputMin: idPrefix === "mpos_resultRange" ? MULTIPLICATION_LIMITS.resultMin : MULTIPLICATION_LIMITS.factorMin,
      inputMax: getMposInputMax(idPrefix)
    });
  });

  const resultCheckbox = container.querySelector("#mpos_resultConstraint_enabled");
  resultCheckbox?.addEventListener("change", () => syncResultConstraintState(container));
  syncResultConstraintState(container);

  const fixedList = container.querySelector("#mpos_fixedListRaw");
  fixedList?.addEventListener("input", () => syncFixedListFeedback(container));
}

function rerenderFromCurrentState(container) {
  const previous = editorUiState.get(container) || getDefaultSettings();
  const next = readSettingsFromDom(container, previous, { validate: false });
  renderToolSettings(container, next);
}

function readSettingsFromDom(container, settings = {}, { validate = true } = {}) {
  const previous = normalizeSettings(settings);
  const generationMode = readRadio(container, "mpos_generationMode", previous.generationMode);
  const carryMode = readRadio(container, "mpos_carryMode", previous.carryMode);
  const factorRanges = {
    f1: container.querySelector("#mpos_factorRange_f1_min")
      ? readMinMax(container, "mpos_factorRange_f1", { inputMin: MULTIPLICATION_LIMITS.factorMin, inputMax: MULTIPLICATION_LIMITS.factor1Max, errorLabel: "Les bornes du facteur 1" })
      : previous.factorRanges.f1,
    f2: container.querySelector("#mpos_factorRange_f2_min")
      ? readMinMax(container, "mpos_factorRange_f2", { inputMin: MULTIPLICATION_LIMITS.factorMin, inputMax: MULTIPLICATION_LIMITS.factor2Max, errorLabel: "Les bornes du facteur 2" })
      : previous.factorRanges.f2
  };
  const resultEnabled = readCheckbox(container, "mpos_resultConstraint_enabled") || false;
  const resultRange = readResultRange(container, previous.resultConstraint.range, resultEnabled);
  const fixedListRaw = container.querySelector("#mpos_fixedListRaw")
    ? String(container.querySelector("#mpos_fixedListRaw")?.value ?? "")
    : previous.fixedListRaw;

  const normalized = normalizeSettings({
    ...previous,
    generationMode,
    carryMode,
    factorRanges,
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
  const textarea = container.querySelector("#mpos_fixedListRaw");
  const feedback = container.querySelector(".mpos-fixed-list-feedback");
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
  const checkbox = container.querySelector("#mpos_resultConstraint_enabled");
  const widget = container.querySelector('[data-mpos-widget="result-constraint"]');
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
  if (!container.querySelector("#mpos_resultRange_min")) return previousRange;

  try {
    return readMinMax(container, "mpos_resultRange", {
      inputMin: MULTIPLICATION_LIMITS.resultMin,
      inputMax: MULTIPLICATION_LIMITS.resultMax,
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
  if (document.querySelector(`link[data-mpos-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.mposConfigStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
