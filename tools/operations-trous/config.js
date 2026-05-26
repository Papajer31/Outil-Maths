import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderCheckbox,
  setMinMaxBounds
} from "../../shared/config-widgets.js";
import { normalizeNumericConstraint } from "../../shared/value-constraints.js";
import {
  OPERATION_TYPES,
  GENERATION_MODES,
  CARRY_MODES,
  HOLE_POSITIONS,
  TERM_SETTINGS_MODES,
  getDefaultSettings,
  normalizeSettings,
  normalizeAdditionsSettings,
  normalizeSubtractionsSettings,
  normalizeMultiplicationsSettings,
  computeAdditionsResultRange,
  computeSubtractionsResultRange,
  computeMultiplicationsResultRange,
  parseAdditionFixedListRaw,
  parseSubtractionFixedListRaw,
  parseMultiplicationFixedListRaw,
  hasAtLeastOnePossibleOperation,
  getImpossibleMessage
} from "./model.js";

const GLOBAL_MAX = 999;
const BRANCHES = {
  additions: {
    operation: OPERATION_TYPES.ADDITION,
    title: "Additions à trous",
    generationId: "opt_additions_generationMode",
    carryId: "opt_additions_carryMode",
    holeId: "opt_additions_holePosition",
    termModeId: "opt_additions_termSettingsMode",
    commonRangeId: "opt_additions_commonTermRange",
    t1RangeId: "opt_additions_termRange_t1",
    t2RangeId: "opt_additions_termRange_t2",
    resultEnabledId: "opt_additions_resultConstraint_enabled",
    resultRangeId: "opt_additions_resultRange",
    fixedListId: "opt_additions_fixedListRaw",
    fixedPlaceholder: "Ex. :&#10;2+3=5&#10;14 + 8&#10;29+13=42",
    hasCarry: true,
    normalizer: normalizeAdditionsSettings,
    rangeComputer: computeAdditionsResultRange,
    parser: parseAdditionFixedListRaw
  },
  subtractions: {
    operation: OPERATION_TYPES.SUBTRACTION,
    title: "Soustractions à trous",
    generationId: "opt_subtractions_generationMode",
    carryId: "opt_subtractions_carryMode",
    holeId: "opt_subtractions_holePosition",
    termModeId: "opt_subtractions_termSettingsMode",
    commonRangeId: "opt_subtractions_commonTermRange",
    t1RangeId: "opt_subtractions_termRange_t1",
    t2RangeId: "opt_subtractions_termRange_t2",
    resultEnabledId: "opt_subtractions_resultConstraint_enabled",
    resultRangeId: "opt_subtractions_resultRange",
    fixedListId: "opt_subtractions_fixedListRaw",
    fixedPlaceholder: "Ex. :&#10;54-27=27&#10;81 - 36&#10;90-8",
    hasCarry: true,
    normalizer: normalizeSubtractionsSettings,
    rangeComputer: computeSubtractionsResultRange,
    parser: parseSubtractionFixedListRaw
  },
  multiplications: {
    operation: OPERATION_TYPES.MULTIPLICATION,
    title: "Multiplications à trous",
    generationId: "opt_multiplications_generationMode",
    holeId: "opt_multiplications_holePosition",
    termModeId: "opt_multiplications_termSettingsMode",
    commonRangeId: "opt_multiplications_commonTermRange",
    t1RangeId: "opt_multiplications_termRange_t1",
    t2RangeId: "opt_multiplications_termRange_t2",
    resultEnabledId: "opt_multiplications_resultConstraint_enabled",
    resultRangeId: "opt_multiplications_resultRange",
    fixedListId: "opt_multiplications_fixedListRaw",
    fixedPlaceholder: "Ex. :&#10;7×8=56&#10;4 x 6&#10;9*3=27",
    hasCarry: false,
    normalizer: normalizeMultiplicationsSettings,
    rangeComputer: computeMultiplicationsResultRange,
    parser: parseMultiplicationFixedListRaw
  }
};

let stylesInjected = false;
const editorUiState = new WeakMap();

export function renderToolSettings(container, settings) {
  injectStyles();
  const cfg = prepareEditorSettings(settings);
  mountToolSettings(container, cfg);
}

export function readToolSettings(container, settings = {}) {
  const previous = prepareEditorSettings(settings);
  const operation = readRadio(container, "opt_operation", previous.operation || "");

  const additions = readBranchSettings(container, BRANCHES.additions, previous.specific.additions, operation);
  const subtractions = readBranchSettings(container, BRANCHES.subtractions, previous.specific.subtractions, operation);
  const multiplications = readBranchSettings(container, BRANCHES.multiplications, previous.specific.multiplications, operation);

  const next = {
    ...previous,
    operation,
    specific: {
      ...previous.specific,
      additions,
      subtractions,
      multiplications
    }
  };

  const activeBranch = getBranchDescriptorForOperation(operation);
  if (activeBranch && getSpecificBranchSettings(next, activeBranch)?.generationMode && !hasAtLeastOnePossibleOperation(next)) {
    throw new Error(getImpossibleMessage(next));
  }

  return next;
}

export { getDefaultSettings };

function renderOperationBlock(cfg) {
  return renderRadioGroup({
    title: "Opération",
    id: "opt_operation",
    value: cfg.operation,
    options: [
      { value: OPERATION_TYPES.ADDITION, label: "Additions" },
      { value: OPERATION_TYPES.SUBTRACTION, label: "Soustractions" },
      { value: OPERATION_TYPES.MULTIPLICATION, label: "Multiplications" }
    ]
  });
}

function renderBranch(branch, settings, activeOperation) {
  if (activeOperation !== branch.operation) return "";
  const cfg = branch.normalizer(settings);
  const generationMode = String(cfg.generationMode || "");

  return `
    <div class="ops-branch ops-branch--${branch.operation}" data-ops-branch="${branch.operation}">
      <div class="ops-branch-label">${escapeHtml(branch.title)}</div>
      ${renderRadioGroup({
        title: "Génération",
        id: branch.generationId,
        value: generationMode,
        options: [
          { value: GENERATION_MODES.RANDOM, label: "Aléatoire" },
          { value: GENERATION_MODES.FIXED_LIST, label: "Liste fixe" }
        ]
      })}
      ${renderGenerationBranch(branch, cfg, generationMode)}
    </div>
  `;
}

function renderGenerationBranch(branch, cfg, generationMode) {
  if (generationMode === GENERATION_MODES.RANDOM) {
    return renderRandomBranch(branch, cfg);
  }

  if (generationMode === GENERATION_MODES.FIXED_LIST) {
    return `
      ${renderHolePositionWidget(branch, cfg.holePosition)}
      ${renderFixedListWidget(branch, cfg.fixedListRaw)}
    `;
  }

  return "";
}

function renderRandomBranch(branch, cfg) {
  return `
    ${branch.hasCarry ? renderCarryWidget(branch, cfg.carryMode) : ""}
    ${renderHolePositionWidget(branch, cfg.holePosition)}
    ${renderTermSettings(branch, cfg)}
  `;
}

function renderCarryWidget(branch, carryMode) {
  return renderRadioGroup({
    title: "Retenues",
    id: branch.carryId,
    value: carryMode,
    options: [
      { value: CARRY_MODES.WITHOUT, label: "Sans retenues" },
      { value: CARRY_MODES.WITH, label: "Avec retenues" },
      { value: CARRY_MODES.BOTH, label: "Les deux" }
    ]
  });
}

function renderHolePositionWidget(branch, holePosition) {
  return renderRadioGroup({
    title: "Position du trou",
    id: branch.holeId,
    value: holePosition,
    options: [
      { value: HOLE_POSITIONS.FIRST, label: "Premier terme" },
      { value: HOLE_POSITIONS.SECOND, label: "Second terme" },
      { value: HOLE_POSITIONS.BOTH, label: "Les deux" }
    ]
  });
}

function renderTermSettings(branch, cfg) {
  const termSettingsMode = String(cfg.termSettingsMode || "");

  return `
    ${renderRadioGroup({
      title: "Réglages des termes",
      id: branch.termModeId,
      value: termSettingsMode,
      options: [
        { value: TERM_SETTINGS_MODES.COMMON, label: "Règle commune" },
        { value: TERM_SETTINGS_MODES.SPECIFIC, label: "Règles spécifiques" }
      ]
    })}
    ${termSettingsMode === TERM_SETTINGS_MODES.COMMON ? renderMinMax({
      idPrefix: branch.commonRangeId,
      title: "Bornes communes",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.commonTermRange.min,
      maxValue: cfg.commonTermRange.max,
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      step: 1,
      mode: cfg.commonTermRange.mode,
      startValue: cfg.commonTermRange.start,
      stepValue: cfg.commonTermRange.step,
      values: cfg.commonTermRange.values
    }) : ""}
    ${termSettingsMode === TERM_SETTINGS_MODES.SPECIFIC ? renderSpecificRanges(branch, cfg.termRanges) : ""}
    ${renderResultWidget(branch, cfg.resultConstraint)}
  `;
}

function renderSpecificRanges(branch, termRanges) {
  return `
    <div class="ops-term-ranges-stack">
      ${renderTermRangeWidget(branch.t1RangeId, "Terme 1", termRanges.t1)}
      ${renderTermRangeWidget(branch.t2RangeId, "Terme 2", termRanges.t2)}
    </div>
  `;
}

function renderTermRangeWidget(idPrefix, title, range) {
  return renderMinMax({
    idPrefix,
    title,
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: range.min,
    maxValue: range.max,
    inputMin: 0,
    inputMax: GLOBAL_MAX,
    step: 1,
    mode: range.mode,
    startValue: range.start,
    stepValue: range.step,
    values: range.values
  });
}

function renderResultWidget(branch, resultConstraint) {
  return `
    <div class="tv-group ops-result-constraint" data-ops-widget="${branch.operation}-result-constraint">
      <div class="ops-result-line">
        ${renderCheckbox({
          id: branch.resultEnabledId,
          label: "Résultat",
          checked: resultConstraint.enabled
        })}
        <div class="ops-result-range-wrap" data-ops-result-range-wrap="${branch.operation}">
          ${renderMinMax({
            idPrefix: branch.resultRangeId,
            title: "",
            minLabel: "Minimum",
            maxLabel: "Maximum",
            minValue: resultConstraint.range.min,
            maxValue: resultConstraint.range.max,
            inputMin: 0,
            inputMax: GLOBAL_MAX,
            step: 1,
            mode: resultConstraint.range.mode,
            startValue: resultConstraint.range.start,
            stepValue: resultConstraint.range.step,
            values: resultConstraint.range.values
          })}
        </div>
      </div>
    </div>
  `;
}

function renderFixedListWidget(branch, rawText) {
  return `
    <div class="tv-group ops-fixed-list" data-ops-widget="${branch.operation}-fixed-list">
      <div class="tv-group-title">Liste fixe</div>
      <div class="ops-fixed-list-note">Une ligne = une opération complète. Les lignes vides sont ignorées.</div>
      <textarea
        class="tv-input ops-fixed-list-textarea"
        id="${branch.fixedListId}"
        data-ops-fixed-list-input
        rows="8"
        spellcheck="false"
        placeholder="${branch.fixedPlaceholder}"
      >${escapeHtml(rawText)}</textarea>
      <div class="ops-fixed-list-feedback" data-ops-fixed-list-feedback="${branch.operation}" aria-live="polite"></div>
    </div>
  `;
}

function readBranchSettings(container, branch, previousRaw = {}, activeOperation = "") {
  const previous = branch.normalizer(previousRaw);
  const isActive = activeOperation === branch.operation;

  const generationMode = isActive
    ? readRadio(container, branch.generationId, previous.generationMode)
    : previous.generationMode;
  const isRandom = generationMode === GENERATION_MODES.RANDOM;
  const isFixedList = generationMode === GENERATION_MODES.FIXED_LIST;

  const carryMode = isActive && isRandom && branch.hasCarry
    ? readRadio(container, branch.carryId, previous.carryMode)
    : previous.carryMode;
  const holePosition = isActive && (isRandom || isFixedList)
    ? readRadio(container, branch.holeId, previous.holePosition)
    : previous.holePosition;
  const termSettingsMode = isActive && isRandom
    ? readRadio(container, branch.termModeId, previous.termSettingsMode)
    : previous.termSettingsMode;
  const resultEnabled = isActive && isRandom
    ? readCheckboxValue(container, branch.resultEnabledId)
    : previous.resultConstraint.enabled;

  const isSpecificTermSettings = isActive && isRandom && termSettingsMode === TERM_SETTINGS_MODES.SPECIFIC;
  const isCommonTermSettings = isActive && isRandom && termSettingsMode === TERM_SETTINGS_MODES.COMMON;

  const commonTermRange = isCommonTermSettings
    ? readMinMax(container, branch.commonRangeId, {
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      errorLabel: "Les bornes communes"
    })
    : previous.commonTermRange;

  const termRanges = {
    t1: isSpecificTermSettings
      ? readMinMax(container, branch.t1RangeId, {
        inputMin: 0,
        inputMax: GLOBAL_MAX,
        errorLabel: "Les bornes du terme 1"
      })
      : previous.termRanges.t1,
    t2: isSpecificTermSettings
      ? readMinMax(container, branch.t2RangeId, {
        inputMin: 0,
        inputMax: GLOBAL_MAX,
        errorLabel: "Les bornes du terme 2"
      })
      : previous.termRanges.t2
  };

  const resultBounds = isActive && isRandom
    ? branch.rangeComputer({
      generationMode,
      carryMode,
      holePosition,
      termSettingsMode,
      commonTermRange,
      termRanges,
      resultConstraint: previous.resultConstraint
    })
    : null;

  const resultRange = isActive && isRandom
    ? (
      resultEnabled && previous.resultConstraint.enabled
        ? readMinMax(container, branch.resultRangeId, {
          inputMin: resultBounds?.min ?? 0,
          inputMax: resultBounds?.max ?? GLOBAL_MAX,
          errorLabel: "Les bornes du résultat"
        })
        : clampRangeToBounds(previous.resultConstraint.range, resultBounds)
    )
    : previous.resultConstraint.range;

  const fixedListRaw = isActive && isFixedList
    ? String(container.querySelector(`#${cssEscape(branch.fixedListId)}`)?.value ?? previous.fixedListRaw ?? "")
    : previous.fixedListRaw;

  return branch.normalizer({
    ...previous,
    generationMode,
    carryMode,
    holePosition,
    termSettingsMode,
    commonTermRange,
    termRanges,
    resultConstraint: {
      enabled: resultEnabled,
      range: resultRange
    },
    fixedListRaw
  });
}

function mountToolSettings(container, cfg) {
  container.innerHTML = `
    <div class="tv-settings-stack ops-settings-stack">
      ${renderOperationBlock(cfg)}
      ${renderBranch(BRANCHES.additions, cfg.specific.additions, cfg.operation)}
      ${renderBranch(BRANCHES.subtractions, cfg.specific.subtractions, cfg.operation)}
      ${renderBranch(BRANCHES.multiplications, cfg.specific.multiplications, cfg.operation)}
    </div>
  `;

  container.querySelector('[data-tv-radio-group="opt_operation"]')
    ?.closest(".tv-group")
    ?.classList.add("ops-operation-group");

  bindRadio(container, "opt_operation", { onChange: () => syncUi(container) });

  Object.values(BRANCHES).forEach((branch) => {
    bindRadio(container, branch.generationId, { onChange: () => syncUi(container) });
    if (branch.hasCarry) {
      bindRadio(container, branch.carryId, { onChange: () => syncUi(container) });
    }
    bindRadio(container, branch.holeId, { onChange: () => syncUi(container) });
    bindRadio(container, branch.termModeId, { onChange: () => syncUi(container) });

    bindMinMax(container, branch.commonRangeId, { inputMin: 0, inputMax: GLOBAL_MAX });
    bindMinMax(container, branch.t1RangeId, { inputMin: 0, inputMax: GLOBAL_MAX });
    bindMinMax(container, branch.t2RangeId, { inputMin: 0, inputMax: GLOBAL_MAX });
    bindMinMax(container, branch.resultRangeId, { inputMin: 0, inputMax: GLOBAL_MAX });

    bindFixedListTextarea(container, branch);
    bindResultConstraintCheckbox(container, branch);

    [branch.commonRangeId, branch.t1RangeId, branch.t2RangeId, branch.resultRangeId].forEach((idPrefix) => {
      bindMinMaxLiveSync(container, idPrefix);
    });
  });

  editorUiState.set(container, {
    settings: cfg,
    structureKey: getToolStructureKey(cfg)
  });

  applyToolSettingsState(container, cfg);
}

function syncUi(container) {
  const previousState = editorUiState.get(container) || {
    settings: prepareEditorSettings({}),
    structureKey: ""
  };

  const nextSettings = readToolSettingsWithoutThrow(container, previousState.settings);
  const nextStructureKey = getToolStructureKey(nextSettings);

  if (nextStructureKey !== previousState.structureKey) {
    mountToolSettings(container, nextSettings);
    return;
  }

  editorUiState.set(container, {
    settings: nextSettings,
    structureKey: nextStructureKey
  });

  applyToolSettingsState(container, nextSettings);
}

function readToolSettingsWithoutThrow(container, settings = {}) {
  try {
    return readToolSettings(container, settings);
  } catch {
    const previous = prepareEditorSettings(settings);
    const operation = readRadio(container, "opt_operation", previous.operation || "");
    return {
      ...previous,
      operation,
      specific: {
        additions: readBranchSettings(container, BRANCHES.additions, previous.specific.additions, operation),
        subtractions: readBranchSettings(container, BRANCHES.subtractions, previous.specific.subtractions, operation),
        multiplications: readBranchSettings(container, BRANCHES.multiplications, previous.specific.multiplications, operation)
      }
    };
  }
}

function applyToolSettingsState(container, settings) {
  setWidgetState(container.querySelector('[data-tv-radio-group="opt_operation"]')?.closest(".tv-group"), {
    incomplete: !getBranchDescriptorForOperation(settings.operation)
  });

  Object.values(BRANCHES).forEach((branch) => {
    const branchSettings = getSpecificBranchSettings(settings, branch);
    const cfg = branch.normalizer(branchSettings);
    const resultBounds = settings.operation === branch.operation && cfg.generationMode === GENERATION_MODES.RANDOM
      ? branch.rangeComputer(cfg)
      : null;

    setWidgetState(container.querySelector(`[data-tv-radio-group="${cssEscape(branch.generationId)}"]`)?.closest(".tv-group"), {
      incomplete: settings.operation === branch.operation && !cfg.generationMode
    });

    syncResultConstraintWidget(container, branch, {
      enabled: Boolean(cfg.resultConstraint?.enabled),
      bounds: resultBounds,
      range: cfg.resultConstraint?.range
    });

    updateFixedListFeedback(container, branch);
  });
}

function getToolStructureKey(settings) {
  const operation = String(settings?.operation || "");
  const branch = getBranchDescriptorForOperation(operation);
  if (!branch) return JSON.stringify({ branch: "none", operation: "" });

  const cfg = branch.normalizer(getSpecificBranchSettings(settings, branch));
  const descriptor = {
    branch: branch.operation,
    generationMode: String(cfg.generationMode || "")
  };

  if (cfg.generationMode === GENERATION_MODES.RANDOM) {
    descriptor.random = {
      termSettingsMode: String(cfg.termSettingsMode || "")
    };
  } else if (cfg.generationMode === GENERATION_MODES.FIXED_LIST) {
    descriptor.fixed = true;
  }

  return JSON.stringify(descriptor);
}

function syncResultConstraintWidget(container, branch, {
  enabled = false,
  bounds = null,
  range = null
} = {}) {
  const wrap = container.querySelector(`[data-ops-result-range-wrap="${branch.operation}"]`);
  if (!wrap) return;

  wrap.classList.toggle("is-disabled", !enabled);
  wrap.setAttribute("aria-disabled", enabled ? "false" : "true");

  const minEl = container.querySelector(`#${cssEscape(`${branch.resultRangeId}_min`)}`);
  const maxEl = container.querySelector(`#${cssEscape(`${branch.resultRangeId}_max`)}`);

  if (!minEl || !maxEl) {
    wrap.querySelectorAll("input, button, textarea, select").forEach((el) => {
      el.disabled = !enabled;
    });
    return;
  }

  const safeBounds = Number.isFinite(bounds?.min) && Number.isFinite(bounds?.max)
    ? bounds
    : { min: 0, max: GLOBAL_MAX };
  const displayRange = enabled
    ? clampRangeToBounds(range, safeBounds)
    : clampRangeToBounds(safeBounds, safeBounds);

  minEl.value = String(displayRange.min);
  maxEl.value = String(displayRange.max);
  setMinMaxBounds(container, branch.resultRangeId, {
    inputMin: safeBounds.min,
    inputMax: safeBounds.max
  });

  wrap.querySelectorAll("input, button, textarea, select").forEach((el) => {
    el.disabled = !enabled;
  });
}

function updateFixedListFeedback(container, branch) {
  const textarea = container.querySelector(`#${cssEscape(branch.fixedListId)}`);
  const feedback = container.querySelector(`[data-ops-fixed-list-feedback="${branch.operation}"]`);
  const widgetRoot = container.querySelector(`[data-ops-widget="${branch.operation}-fixed-list"]`);
  if (!textarea || !feedback) return { entries: [], invalidLineNumbers: [] };

  const parsed = branch.parser(textarea.value);
  const invalidLineNumbers = parsed.invalidLineNumbers || [];
  const entries = parsed.entries || [];
  const trimmed = String(textarea.value ?? "").trim();

  textarea.classList.toggle("is-warning", invalidLineNumbers.length > 0);
  textarea.setAttribute("aria-invalid", invalidLineNumbers.length > 0 ? "true" : "false");
  widgetRoot?.classList.toggle("is-warning", invalidLineNumbers.length > 0);

  if (invalidLineNumbers.length > 0) {
    feedback.textContent = `Lignes invalides : ${invalidLineNumbers.join(", ")}.`;
    feedback.classList.add("is-warning");
    feedback.classList.remove("is-ok");
  } else if (trimmed) {
    feedback.textContent = `${entries.length} opération${entries.length > 1 ? "s" : ""} valide${entries.length > 1 ? "s" : ""}.`;
    feedback.classList.remove("is-warning");
    feedback.classList.add("is-ok");
  } else {
    feedback.textContent = "Aucune ligne saisie.";
    feedback.classList.remove("is-warning");
    feedback.classList.remove("is-ok");
  }

  return parsed;
}

function bindFixedListTextarea(container, branch) {
  const textarea = container.querySelector(`#${cssEscape(branch.fixedListId)}`);
  if (!textarea) return;

  textarea.addEventListener("input", () => {
    updateFixedListFeedback(container, branch);
    syncUi(container);
  });
  textarea.addEventListener("change", () => {
    updateFixedListFeedback(container, branch);
    syncUi(container);
  });
}

function bindResultConstraintCheckbox(container, branch) {
  const checkbox = container.querySelector(`#${cssEscape(branch.resultEnabledId)}`);
  if (!checkbox) return;
  checkbox.addEventListener("change", () => syncUi(container));
}

function bindMinMaxLiveSync(container, idPrefix) {
  const root = container.querySelector(`[data-tv-minmax="${cssEscape(idPrefix)}"]`);
  if (!root) return;

  let inputSyncTimer = null;
  const syncDelayMs = 450;

  const cancelPendingSync = () => {
    if (inputSyncTimer == null) return;
    window.clearTimeout(inputSyncTimer);
    inputSyncTimer = null;
  };

  const runSync = () => {
    cancelPendingSync();
    syncUi(container);
  };

  const scheduleSync = () => {
    cancelPendingSync();
    inputSyncTimer = window.setTimeout(() => {
      inputSyncTimer = null;
      syncUi(container);
    }, syncDelayMs);
  };

  root.addEventListener("input", (event) => {
    if (shouldDeferMinMaxLiveSync(event)) {
      scheduleSync();
      return;
    }

    runSync();
  });
  root.addEventListener("change", runSync);
}

function shouldDeferMinMaxLiveSync(event) {
  const target = event?.target;
  if (!(target instanceof HTMLInputElement)) return false;
  if (!target.classList.contains("tv-input-stepper")) return false;
  if (target.dataset.tvStepperSyntheticInput === "true") return false;
  return document.activeElement === target;
}

function setWidgetState(root, { incomplete = false, warning = false } = {}) {
  if (!root) return;
  root.classList.toggle("is-incomplete", incomplete);
  root.classList.toggle("is-warning", warning);
}

function readCheckboxValue(container, id) {
  return container.querySelector(`#${cssEscape(id)}`)?.checked === true;
}

function clampRangeToBounds(range, bounds) {
  const safeRange = isPlainObject(range) ? range : {};
  const inputMin = Number.isFinite(bounds?.min) ? bounds.min : 0;
  const inputMax = Number.isFinite(bounds?.max) ? bounds.max : GLOBAL_MAX;

  return normalizeNumericConstraint(safeRange, {
    inputMin,
    inputMax,
    defaultMin: inputMin,
    defaultMax: inputMax,
    defaultStart: inputMin,
    defaultStep: 1,
    defaultValues: []
  });
}

function prepareEditorSettings(settings) {
  const base = getDefaultSettings();
  const raw = isPlainObject(settings) ? settings : {};
  const rawSpecific = isPlainObject(raw.specific) ? raw.specific : {};
  const normalized = normalizeSettings(raw);
  const rawOperation = String(raw.operation || "");
  const operation = rawOperation === ""
    ? ""
    : normalized.operation;

  return {
    ...base,
    ...raw,
    operation,
    specific: {
      ...base.specific,
      ...rawSpecific,
      additions: normalizeAdditionsSettings(rawSpecific.additions),
      subtractions: normalizeSubtractionsSettings(rawSpecific.subtractions),
      multiplications: normalizeMultiplicationsSettings(rawSpecific.multiplications)
    }
  };
}

function getBranchDescriptorForOperation(operation) {
  return Object.values(BRANCHES).find((branch) => branch.operation === operation) || null;
}

function getSpecificBranchSettings(settings, branch) {
  if (branch.operation === OPERATION_TYPES.ADDITION) return settings?.specific?.additions;
  if (branch.operation === OPERATION_TYPES.SUBTRACTION) return settings?.specific?.subtractions;
  return settings?.specific?.multiplications;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-opt-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.optConfigStyle = href;
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

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value).replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`);
}
