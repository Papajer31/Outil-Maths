import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderSelectGroup,
  bindSelect,
  readSelect,
  renderCheckbox,
  setMinMaxBounds
} from "../../shared/config-widgets.js";
import {
  normalizeNumericConstraint
} from "../../shared/value-constraints.js";
import {
  OPERATION_TYPES,
  CARRY_MODES,
  ADDITION_GENERATION_MODES,
  ADDITION_TERM_SETTINGS_MODES,
  ADDITION_SPECIAL_MODES,
  ADDITION_TERM_COUNT_OPTIONS,
  SUBTRACTION_GENERATION_MODES,
  SUBTRACTION_TERM_SETTINGS_MODES,
  SUBTRACTION_SPECIAL_MODES,
  MULTIPLICATION_PROFILES,
  MULTIPLICATION_ORDER_MODES,
  MULTIPLICATION_FACTOR_POSITIONS,
  MULTIPLICATION_GENERATION_MODES,
  MULTIPLICATION_TABLE_OPTIONS,
  MULTIPLICATION_MULTIPLIER_OPTIONS,
  getDefaultSettings,
  normalizeAdditionsSettings,
  normalizeSubtractionsSettings,
  normalizeMultiplicationsSettings,
  computeAdditionsResultRange,
  computeSubtractionsResultRange,
  computeMultiplicationsResultRange,
  parseAdditionFixedListRaw,
  parseSubtractionFixedListRaw,
  parseMultiplicationFixedListRaw,
  getPossibleResultBounds,
  hasAtLeastOnePossibleOperation,
  getImpossibleMessage
} from "./model.js";

const GLOBAL_MAX = 999;

let stylesInjected = false;
const editorUiState = new WeakMap();

export function renderToolSettings(container, settings) {
  injectStyles();

  const cfg = prepareEditorSettings(settings);
  mountToolSettings(container, cfg);
}

export function readToolSettings(container, settings = {}) {
  const previousSettings = isPlainObject(settings) ? settings : {};
  const previousSpecific = isPlainObject(previousSettings.specific) ? previousSettings.specific : {};
  const operation = readRadio(container, "op_operation", "");
  const additions = readAdditionsSettings(container, previousSpecific.additions, operation);
  const subtractions = readSubtractionsSettings(container, previousSpecific.subtractions, operation);
  const multiplications = readMultiplicationsSettings(container, previousSpecific.multiplications, operation);

  let nextRootSettings;
  if (operation === OPERATION_TYPES.ADDITION || operation === OPERATION_TYPES.SUBTRACTION || operation === OPERATION_TYPES.MULTIPLICATION || operation === "") {
    nextRootSettings = {
      ...getDefaultSettings(),
      ...previousSettings,
      operation
    };
  } else {
    nextRootSettings = readLegacySettings(container, operation, previousSettings);
  }

  return {
    ...nextRootSettings,
    specific: {
      ...previousSpecific,
      additions,
      subtractions,
      multiplications
    }
  };
}

export { getDefaultSettings };

function renderOperationBlock(cfg) {
  return renderRadioGroup({
    title: "Opération",
    id: "op_operation",
    value: cfg.operation,
    options: [
      { value: OPERATION_TYPES.ADDITION, label: "Additions" },
      { value: OPERATION_TYPES.SUBTRACTION, label: "Soustractions" },
      { value: OPERATION_TYPES.MULTIPLICATION, label: "Multiplications" },
      { value: OPERATION_TYPES.DIVISION, label: "Divisions (bientôt)", disabled: true }
    ]
  });
}

function renderAdditionBranch(cfg) {
  if (cfg.operation !== OPERATION_TYPES.ADDITION) {
    return "";
  }

  const additions = cfg.specific.additions;
  const generationMode = String(additions.generationMode || "");

  return `
    <div class="ops-branch ops-branch--additions" data-ops-branch="addition">
      <div class="ops-branch-label">Additions</div>
      ${renderRadioGroup({
        title: "Génération",
        id: "op_additions_generationMode",
        value: generationMode,
        options: [
          { value: ADDITION_GENERATION_MODES.RANDOM, label: "Aléatoire" },
          { value: ADDITION_GENERATION_MODES.FIXED_LIST, label: "Liste fixe" },
          { value: ADDITION_GENERATION_MODES.SPECIAL, label: "Spécial" }
        ]
      })}
      ${renderAdditionGenerationBranch(additions, generationMode)}
    </div>
  `;
}

function renderSubtractionBranch(cfg) {
  if (cfg.operation !== OPERATION_TYPES.SUBTRACTION) {
    return "";
  }

  const subtractions = cfg.specific.subtractions;
  const generationMode = String(subtractions.generationMode || "");

  return `
    <div class="ops-branch ops-branch--subtractions" data-ops-branch="subtraction">
      <div class="ops-branch-label">Soustractions</div>
      ${renderRadioGroup({
        title: "Génération",
        id: "op_subtractions_generationMode",
        value: generationMode,
        options: [
          { value: SUBTRACTION_GENERATION_MODES.RANDOM, label: "Aléatoire" },
          { value: SUBTRACTION_GENERATION_MODES.FIXED_LIST, label: "Liste fixe" },
          { value: SUBTRACTION_GENERATION_MODES.SPECIAL, label: "Spécial" }
        ]
      })}
      ${renderSubtractionGenerationBranch(subtractions, generationMode)}
    </div>
  `;
}

function renderSubtractionGenerationBranch(subtractions, generationMode) {
  if (generationMode === SUBTRACTION_GENERATION_MODES.RANDOM) {
    return renderSubtractionRandomBranch(subtractions);
  }

  if (generationMode === SUBTRACTION_GENERATION_MODES.FIXED_LIST) {
    return renderFixedListWidget("subtractions", subtractions.fixedListRaw, {
      placeholder: "Ex. :&#10;54-27=27&#10;81 - 36&#10;90-8"
    });
  }

  if (generationMode === SUBTRACTION_GENERATION_MODES.SPECIAL) {
    return renderSubtractionSpecialBranch(subtractions);
  }

  return "";
}

function renderSubtractionRandomBranch(subtractions) {
  return `
    ${renderRadioGroup({
      title: "Retenues",
      id: "op_subtractions_carryMode",
      value: subtractions.carryMode,
      options: [
        { value: CARRY_MODES.WITHOUT, label: "Sans retenues" },
        { value: CARRY_MODES.WITH, label: "Avec retenues" },
        { value: CARRY_MODES.BOTH, label: "Les deux" }
      ]
    })}
    ${renderSubtractionTermSettings(subtractions)}
  `;
}

function renderSubtractionTermSettings(subtractions) {
  const termSettingsMode = String(subtractions.termSettingsMode || "");

  return `
    ${renderRadioGroup({
      title: "Réglages des termes",
      id: "op_subtractions_termSettingsMode",
      value: termSettingsMode,
      options: [
        { value: SUBTRACTION_TERM_SETTINGS_MODES.COMMON, label: "Règle commune" },
        { value: SUBTRACTION_TERM_SETTINGS_MODES.SPECIFIC, label: "Règles spécifiques" }
      ]
    })}
    ${termSettingsMode === SUBTRACTION_TERM_SETTINGS_MODES.COMMON ? renderMinMax({
      idPrefix: "op_subtractions_commonTermRange",
      title: "Bornes communes",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: subtractions.commonTermRange.min,
      maxValue: subtractions.commonTermRange.max,
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      step: 1,
      mode: subtractions.commonTermRange.mode,
      startValue: subtractions.commonTermRange.start,
      stepValue: subtractions.commonTermRange.step,
      values: subtractions.commonTermRange.values
    }) : ""}
    ${termSettingsMode === SUBTRACTION_TERM_SETTINGS_MODES.SPECIFIC ? renderSubtractionSpecificRanges(subtractions.termRanges) : ""}
    ${renderSubtractionResultWidget(subtractions.resultConstraint)}
  `;
}

function renderSubtractionSpecificRanges(termRanges) {
  return `
    <div class="ops-term-ranges-stack">
      ${renderSubtractionTermRangeWidget("t1", termRanges.t1)}
      ${renderSubtractionTermRangeWidget("t2", termRanges.t2)}
    </div>
  `;
}

function renderSubtractionTermRangeWidget(termKey, range) {
  return renderMinMax({
    idPrefix: `op_subtractions_termRange_${termKey}`,
    title: `Terme ${termKey.slice(1)}`,
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

function renderSubtractionResultWidget(resultConstraint) {
  return renderBranchResultWidget("subtractions", resultConstraint);
}

function renderSubtractionSpecialBranch(subtractions) {
  return `
    ${renderSelectGroup({
      title: "Mode spécial",
      id: "op_subtractions_specialMode",
      value: subtractions.specialMode,
      options: [
        { value: SUBTRACTION_SPECIAL_MODES.CROSS_TEN, label: "Passage par dizaine" }
      ]
    })}
    ${subtractions.specialMode === SUBTRACTION_SPECIAL_MODES.CROSS_TEN ? renderMinMax({
      idPrefix: "op_subtractions_specialCrossTenFirstTermRange",
      title: "Premier terme",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: subtractions.specialConfig.crossTen.firstTermRange.min,
      maxValue: subtractions.specialConfig.crossTen.firstTermRange.max,
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      step: 1,
      mode: subtractions.specialConfig.crossTen.firstTermRange.mode,
      startValue: subtractions.specialConfig.crossTen.firstTermRange.start,
      stepValue: subtractions.specialConfig.crossTen.firstTermRange.step,
      values: subtractions.specialConfig.crossTen.firstTermRange.values
    }) : ""}
  `;
}

function renderAdditionGenerationBranch(additions, generationMode) {
  if (generationMode === ADDITION_GENERATION_MODES.RANDOM) {
    return renderAdditionRandomBranch(additions);
  }

  if (generationMode === ADDITION_GENERATION_MODES.FIXED_LIST) {
    return renderFixedListWidget("additions", additions.fixedListRaw, {
      placeholder: "Ex. :&#10;2+3=5&#10;1+4&#10;1+2+3=6"
    });
  }

  if (generationMode === ADDITION_GENERATION_MODES.SPECIAL) {
    return renderAdditionSpecialBranch(additions);
  }

  return "";
}

function renderAdditionRandomBranch(additions) {
  const termCounts = Array.isArray(additions.termCounts) ? additions.termCounts : [];
  const hasTermCounts = termCounts.length > 0;

  return `
    ${renderRadioGroup({
      title: "Retenues",
      id: "op_additions_carryMode",
      value: additions.carryMode,
      options: [
        { value: CARRY_MODES.WITHOUT, label: "Sans retenues" },
        { value: CARRY_MODES.WITH, label: "Avec retenues" },
        { value: CARRY_MODES.BOTH, label: "Les deux" }
      ]
    })}
    ${renderTermCountsWidget(termCounts)}
    ${hasTermCounts ? renderAdditionTermSettings(additions, termCounts) : ""}
  `;
}

function renderAdditionTermSettings(additions, termCounts) {
  const termSettingsMode = String(additions.termSettingsMode || "");
  const maxTermCount = getSelectedMaxTermCount(termCounts);

  return `
    ${renderRadioGroup({
      title: "Réglages des termes",
      id: "op_additions_termSettingsMode",
      value: termSettingsMode,
      options: [
        { value: ADDITION_TERM_SETTINGS_MODES.COMMON, label: "Règle commune" },
        { value: ADDITION_TERM_SETTINGS_MODES.SPECIFIC, label: "Règles spécifiques" }
      ]
    })}
    ${termSettingsMode === ADDITION_TERM_SETTINGS_MODES.COMMON ? renderMinMax({
      idPrefix: "op_additions_commonTermRange",
      title: "Bornes communes",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: additions.commonTermRange.min,
      maxValue: additions.commonTermRange.max,
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      step: 1,
      mode: additions.commonTermRange.mode,
      startValue: additions.commonTermRange.start,
      stepValue: additions.commonTermRange.step,
      values: additions.commonTermRange.values
    }) : ""}
    ${termSettingsMode === ADDITION_TERM_SETTINGS_MODES.SPECIFIC ? renderAdditionSpecificRanges(additions.termRanges, maxTermCount) : ""}
    ${renderAdditionResultWidget(additions.resultConstraint)}
  `;
}

function renderAdditionSpecificRanges(termRanges, maxTermCount) {
  const items = [];
  if (maxTermCount >= 2) {
    items.push(renderAdditionTermRangeWidget("t1", termRanges.t1));
    items.push(renderAdditionTermRangeWidget("t2", termRanges.t2));
  }
  if (maxTermCount >= 3) {
    items.push(renderAdditionTermRangeWidget("t3", termRanges.t3));
  }
  if (maxTermCount >= 4) {
    items.push(renderAdditionTermRangeWidget("t4", termRanges.t4));
  }

  if (!items.length) {
    return "";
  }

  return `
    <div class="ops-term-ranges-stack">
      ${items.join("")}
    </div>
  `;
}

function renderAdditionTermRangeWidget(termKey, range) {
  return renderMinMax({
    idPrefix: `op_additions_termRange_${termKey}`,
    title: `Terme ${termKey.slice(1)}`,
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

function renderBranchResultWidget(prefix, resultConstraint) {
  return `
    <div class="tv-group ops-result-constraint" data-ops-widget="${prefix}-result-constraint">
      <div class="ops-result-line">
        ${renderCheckbox({
          id: `op_${prefix}_resultConstraint_enabled`,
          label: "Résultat",
          checked: resultConstraint.enabled
        })}
        <div class="ops-result-range-wrap" data-ops-result-range-wrap="${prefix}">
          ${renderMinMax({
            idPrefix: `op_${prefix}_resultRange`,
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

function renderAdditionResultWidget(resultConstraint) {
  return renderBranchResultWidget("additions", resultConstraint);
}

function renderAdditionSpecialBranch(additions) {
  return `
    ${renderSelectGroup({
      title: "Mode spécial",
      id: "op_additions_specialMode",
      value: additions.specialMode,
      options: [
        { value: ADDITION_SPECIAL_MODES.DOUBLES, label: "Doubles" }
      ]
    })}
    ${additions.specialMode === ADDITION_SPECIAL_MODES.DOUBLES ? renderMinMax({
      idPrefix: "op_additions_specialDoublesRange",
      title: "Bornes des doubles",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: additions.specialConfig.doubles.range.min,
      maxValue: additions.specialConfig.doubles.range.max,
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      step: 1,
      mode: additions.specialConfig.doubles.range.mode,
      startValue: additions.specialConfig.doubles.range.start,
      stepValue: additions.specialConfig.doubles.range.step,
      values: additions.specialConfig.doubles.range.values
    }) : ""}
  `;
}

function renderMultiplicationBranch(cfg) {
  if (cfg.operation !== OPERATION_TYPES.MULTIPLICATION) {
    return "";
  }

  const multiplications = cfg.specific.multiplications;
  const profile = String(multiplications.profile || "");

  return `
    <div class="ops-branch ops-branch--multiplications" data-ops-branch="multiplication">
      <div class="ops-branch-label">Multiplications</div>
      ${renderRadioGroup({
        title: "Type d’exercice",
        id: "op_multiplications_profile",
        value: profile,
        options: [
          { value: MULTIPLICATION_PROFILES.TABLES, label: "Tables" },
          { value: MULTIPLICATION_PROFILES.CALCULATION, label: "Calcul multiplicatif" }
        ]
      })}
      ${renderMultiplicationProfileBranch(multiplications, profile)}
    </div>
  `;
}

function renderMultiplicationProfileBranch(multiplications, profile) {
  if (profile === MULTIPLICATION_PROFILES.TABLES) {
    return renderMultiplicationTablesBranch(multiplications);
  }

  if (profile === MULTIPLICATION_PROFILES.CALCULATION) {
    return renderMultiplicationCalculationBranch(multiplications);
  }

  return "";
}

function renderMultiplicationTablesBranch(multiplications) {
  return `
    ${renderNumberCheckboxWidget({
      title: "Tables travaillées",
      widgetKey: "multiplication-tables",
      dataAttr: "data-ops-multiplication-table",
      values: MULTIPLICATION_TABLE_OPTIONS,
      selectedValues: multiplications.tables
    })}
    ${renderRadioGroup({
      title: "Ordre des tables",
      id: "op_multiplications_orderMode",
      value: multiplications.orderMode,
      options: [
        { value: MULTIPLICATION_ORDER_MODES.ORDERED, label: "Dans l’ordre" },
        { value: MULTIPLICATION_ORDER_MODES.SHUFFLED, label: "Dans le désordre" }
      ]
    })}
    ${renderRadioGroup({
      title: "Position du facteur travaillé",
      id: "op_multiplications_factorPosition",
      value: multiplications.factorPosition,
      options: [
        { value: MULTIPLICATION_FACTOR_POSITIONS.FIRST, label: "Premier facteur" },
        { value: MULTIPLICATION_FACTOR_POSITIONS.SECOND, label: "Second facteur" },
        { value: MULTIPLICATION_FACTOR_POSITIONS.BOTH, label: "Les deux" }
      ]
    })}
    ${renderNumberCheckboxWidget({
      title: "Multiplicateurs disponibles",
      widgetKey: "multiplication-multipliers",
      dataAttr: "data-ops-multiplication-multiplier",
      values: MULTIPLICATION_MULTIPLIER_OPTIONS,
      selectedValues: multiplications.multipliers
    })}
  `;
}

function renderMultiplicationCalculationBranch(multiplications) {
  const generationMode = String(multiplications.generationMode || "");

  return `
    ${renderRadioGroup({
      title: "Génération",
      id: "op_multiplications_generationMode",
      value: generationMode,
      options: [
        { value: MULTIPLICATION_GENERATION_MODES.RANDOM, label: "Aléatoire" },
        { value: MULTIPLICATION_GENERATION_MODES.FIXED_LIST, label: "Liste fixe" }
      ]
    })}
    ${renderMultiplicationCalculationGenerationBranch(multiplications, generationMode)}
  `;
}

function renderMultiplicationCalculationGenerationBranch(multiplications, generationMode) {
  if (generationMode === MULTIPLICATION_GENERATION_MODES.RANDOM) {
    return renderMultiplicationRandomBranch(multiplications);
  }

  if (generationMode === MULTIPLICATION_GENERATION_MODES.FIXED_LIST) {
    return renderFixedListWidget("multiplications", multiplications.fixedListRaw, {
      placeholder: "Ex. :&#10;7×8=56&#10;24 x 3&#10;12 * 8"
    });
  }

  return "";
}

function renderMultiplicationRandomBranch(multiplications) {
  return `
    ${renderRadioGroup({
      title: "Retenues",
      id: "op_multiplications_carryMode",
      value: multiplications.carryMode,
      options: [
        { value: CARRY_MODES.WITHOUT, label: "Sans retenues" },
        { value: CARRY_MODES.WITH, label: "Avec retenues" },
        { value: CARRY_MODES.BOTH, label: "Les deux" }
      ]
    })}
    <div class="ops-term-ranges-stack">
      ${renderMultiplicationFactorRangeWidget("f1", multiplications.factorRanges.f1)}
      ${renderMultiplicationFactorRangeWidget("f2", multiplications.factorRanges.f2)}
    </div>
    ${renderMultiplicationResultWidget(multiplications.resultConstraint)}
  `;
}

function renderMultiplicationFactorRangeWidget(factorKey, range) {
  return renderMinMax({
    idPrefix: `op_multiplications_factorRange_${factorKey}`,
    title: `Facteur ${factorKey.slice(1)}`,
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

function renderMultiplicationResultWidget(resultConstraint) {
  return renderBranchResultWidget("multiplications", resultConstraint);
}

function renderLegacyBranch(cfg) {
  const operation = String(cfg.operation || "");
  if (!isLegacyOperation(operation)) {
    return "";
  }

  return `
    <div class="ops-branch ops-branch--legacy" data-ops-branch="legacy">
      ${needsLegacyCarryMode(operation) ? renderRadioGroup({
        title: "Retenues",
        id: "op_legacy_carryMode",
        value: cfg.carryMode,
        options: [
          { value: CARRY_MODES.WITHOUT, label: "Sans retenues" },
          { value: CARRY_MODES.WITH, label: "Avec retenues" },
          { value: CARRY_MODES.BOTH, label: "Les deux" }
        ]
      }) : ""}
      ${renderMinMax({
        idPrefix: "op_legacy_n1",
        title: "Premier terme",
        minLabel: "Minimum",
        maxLabel: "Maximum",
        minValue: cfg.n1Min,
        maxValue: cfg.n1Max,
        inputMin: 0,
        inputMax: GLOBAL_MAX,
        step: 1,
        mode: cfg.n1Mode,
        startValue: cfg.n1Start,
        stepValue: cfg.n1Step,
        values: cfg.n1List
      })}
      ${renderMinMax({
        idPrefix: "op_legacy_n2",
        title: "Deuxième terme",
        minLabel: "Minimum",
        maxLabel: "Maximum",
        minValue: cfg.n2Min,
        maxValue: cfg.n2Max,
        inputMin: operation === OPERATION_TYPES.DIVISION ? 1 : 0,
        inputMax: GLOBAL_MAX,
        step: 1,
        mode: cfg.n2Mode,
        startValue: cfg.n2Start,
        stepValue: cfg.n2Step,
        values: cfg.n2List
      })}
      ${renderMinMax({
        idPrefix: "op_legacy_result",
        title: "Résultat",
        minLabel: "Minimum",
        maxLabel: "Maximum",
        minValue: cfg.resultMin,
        maxValue: cfg.resultMax,
        inputMin: 0,
        inputMax: GLOBAL_MAX,
        step: 1,
        mode: cfg.resultMode,
        startValue: cfg.resultStart,
        stepValue: cfg.resultStep,
        values: cfg.resultList
      })}
    </div>
  `;
}

function readMultiplicationsSettings(container, previousMultiplications = {}, operation = "") {
  const previous = normalizeMultiplicationsSettings(previousMultiplications);
  const isMultiplicationActive = operation === OPERATION_TYPES.MULTIPLICATION;
  const profile = isMultiplicationActive
    ? readRadio(container, "op_multiplications_profile", previous.profile)
    : previous.profile;
  const isTablesProfile = profile === MULTIPLICATION_PROFILES.TABLES;
  const isCalculationProfile = profile === MULTIPLICATION_PROFILES.CALCULATION;

  const tables = isMultiplicationActive && isTablesProfile
    ? readCheckedNumberValues(container, "[data-ops-multiplication-table]", MULTIPLICATION_TABLE_OPTIONS)
    : previous.tables;
  const orderMode = isMultiplicationActive && isTablesProfile
    ? readRadio(container, "op_multiplications_orderMode", previous.orderMode)
    : previous.orderMode;
  const factorPosition = isMultiplicationActive && isTablesProfile
    ? readRadio(container, "op_multiplications_factorPosition", previous.factorPosition)
    : previous.factorPosition;
  const multipliers = isMultiplicationActive && isTablesProfile
    ? readCheckedNumberValues(container, "[data-ops-multiplication-multiplier]", MULTIPLICATION_MULTIPLIER_OPTIONS)
    : previous.multipliers;

  const generationMode = isMultiplicationActive && isCalculationProfile
    ? readRadio(container, "op_multiplications_generationMode", previous.generationMode)
    : previous.generationMode;
  const isRandomGeneration = isCalculationProfile && generationMode === MULTIPLICATION_GENERATION_MODES.RANDOM;
  const isFixedListGeneration = isCalculationProfile && generationMode === MULTIPLICATION_GENERATION_MODES.FIXED_LIST;

  const carryMode = isMultiplicationActive && isRandomGeneration
    ? readRadio(container, "op_multiplications_carryMode", previous.carryMode)
    : previous.carryMode;

  const factorRanges = {
    f1: isMultiplicationActive && isRandomGeneration
      ? readMinMax(container, "op_multiplications_factorRange_f1", {
        inputMin: 0,
        inputMax: GLOBAL_MAX,
        errorLabel: "Les bornes du facteur 1"
      })
      : previous.factorRanges.f1,
    f2: isMultiplicationActive && isRandomGeneration
      ? readMinMax(container, "op_multiplications_factorRange_f2", {
        inputMin: 0,
        inputMax: GLOBAL_MAX,
        errorLabel: "Les bornes du facteur 2"
      })
      : previous.factorRanges.f2
  };

  const resultEnabled = isMultiplicationActive && isRandomGeneration
    ? readCheckboxValue(container, "op_multiplications_resultConstraint_enabled")
    : previous.resultConstraint.enabled;

  const resultBounds = isMultiplicationActive && isRandomGeneration
    ? computeMultiplicationsResultRange({
      profile,
      generationMode,
      carryMode,
      factorRanges
    })
    : null;

  const resultRange = isMultiplicationActive && isRandomGeneration
    ? (
      resultEnabled && previous.resultConstraint.enabled
        ? readMinMax(container, "op_multiplications_resultRange", {
          inputMin: resultBounds?.min ?? 0,
          inputMax: resultBounds?.max ?? GLOBAL_MAX,
          errorLabel: "Les bornes du résultat"
        })
        : clampRangeToBounds(previous.resultConstraint.range, resultBounds)
    )
    : previous.resultConstraint.range;

  const fixedListRaw = isMultiplicationActive && isFixedListGeneration
    ? String(container.querySelector("#op_multiplications_fixedListRaw")?.value ?? previous.fixedListRaw ?? "")
    : previous.fixedListRaw;

  return normalizeMultiplicationsSettings({
    ...previous,
    profile,
    tables,
    orderMode,
    factorPosition,
    multipliers,
    generationMode,
    carryMode,
    factorRanges,
    resultConstraint: {
      enabled: resultEnabled,
      range: resultRange
    },
    fixedListRaw
  });
}

function readLegacySettings(container, operation, previousSettings = {}) {
  const safeOperation = String(operation || "");
  const rootFallback = {
    ...getDefaultSettings(),
    ...(isPlainObject(previousSettings) ? previousSettings : {})
  };
  const hasRenderedLegacyWidgets = !!container.querySelector("#op_legacy_n1_min");

  if (!hasRenderedLegacyWidgets) {
    return {
      ...rootFallback,
      operation: safeOperation
    };
  }

  const carryMode = readRadio(container, "op_legacy_carryMode", rootFallback.carryMode);
  const n2InputMin = safeOperation === OPERATION_TYPES.DIVISION ? 1 : 0;

  const n1Range = readMinMax(container, "op_legacy_n1", {
    inputMin: 0,
    inputMax: GLOBAL_MAX,
    errorLabel: "Les bornes du premier terme"
  });

  const n2Range = readMinMax(container, "op_legacy_n2", {
    inputMin: n2InputMin,
    inputMax: GLOBAL_MAX,
    errorLabel: "Les bornes du deuxième terme"
  });

  const resultBounds = getPossibleResultBounds({
    ...rootFallback,
    operation: safeOperation,
    carryMode,
    n1Min: n1Range.min,
    n1Max: n1Range.max,
    n1Mode: n1Range.mode,
    n1Start: n1Range.start,
    n1Step: n1Range.step,
    n1List: n1Range.values,
    n2Min: n2Range.min,
    n2Max: n2Range.max,
    n2Mode: n2Range.mode,
    n2Start: n2Range.start,
    n2Step: n2Range.step,
    n2List: n2Range.values
  });

  const resultRange = readMinMax(container, "op_legacy_result", {
    inputMin: resultBounds?.min ?? 0,
    inputMax: resultBounds?.max ?? GLOBAL_MAX,
    errorLabel: "Les bornes du résultat"
  });

  const legacySettings = {
    operation: safeOperation,
    carryMode,
    n1Min: n1Range.min,
    n1Max: n1Range.max,
    n1Mode: n1Range.mode,
    n1Start: n1Range.start,
    n1Step: n1Range.step,
    n1List: n1Range.values,
    n2Min: n2Range.min,
    n2Max: n2Range.max,
    n2Mode: n2Range.mode,
    n2Start: n2Range.start,
    n2Step: n2Range.step,
    n2List: n2Range.values,
    resultMin: resultRange.min,
    resultMax: resultRange.max,
    resultMode: resultRange.mode,
    resultStart: resultRange.start,
    resultStep: resultRange.step,
    resultList: resultRange.values
  };

  if (!hasAtLeastOnePossibleOperation(legacySettings)) {
    throw new Error(getImpossibleMessage(legacySettings));
  }

  return legacySettings;
}

function readAdditionsSettings(container, previousAdditions = {}, operation = "") {
  const previous = normalizeAdditionsSettings(previousAdditions);
  const isAdditionActive = operation === OPERATION_TYPES.ADDITION;
  const generationMode = isAdditionActive
    ? readRadio(container, "op_additions_generationMode", previous.generationMode)
    : previous.generationMode;
  const isRandomGeneration = generationMode === ADDITION_GENERATION_MODES.RANDOM;
  const isFixedListGeneration = generationMode === ADDITION_GENERATION_MODES.FIXED_LIST;
  const isSpecialGeneration = generationMode === ADDITION_GENERATION_MODES.SPECIAL;

  const carryMode = isAdditionActive && isRandomGeneration
    ? readRadio(container, "op_additions_carryMode", previous.carryMode)
    : previous.carryMode;
  const termCounts = isAdditionActive && isRandomGeneration
    ? readCheckedTermCounts(container)
    : previous.termCounts;
  const maxTermCount = getSelectedMaxTermCount(termCounts);
  const termSettingsMode = isAdditionActive && isRandomGeneration && termCounts.length > 0
    ? readRadio(container, "op_additions_termSettingsMode", previous.termSettingsMode)
    : previous.termSettingsMode;
  const specialMode = isAdditionActive && isSpecialGeneration
    ? readSelect(container, "op_additions_specialMode", {
      parse: (value) => String(value || ADDITION_SPECIAL_MODES.DOUBLES)
    })
    : previous.specialMode;
  const resultEnabled = isAdditionActive && isRandomGeneration && termCounts.length > 0
    ? readCheckboxValue(container, "op_additions_resultConstraint_enabled")
    : previous.resultConstraint.enabled;

  const isSpecificTermSettings = isAdditionActive
    && isRandomGeneration
    && termCounts.length > 0
    && termSettingsMode === ADDITION_TERM_SETTINGS_MODES.SPECIFIC;
  const isCommonTermSettings = isAdditionActive
    && isRandomGeneration
    && termCounts.length > 0
    && termSettingsMode === ADDITION_TERM_SETTINGS_MODES.COMMON;

  const commonTermRange = isCommonTermSettings
    ? readMinMax(container, "op_additions_commonTermRange", {
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      errorLabel: "Les bornes communes"
    })
    : previous.commonTermRange;

  const termRanges = {
    t1: isSpecificTermSettings && maxTermCount >= 2
      ? readMinMax(container, "op_additions_termRange_t1", {
        inputMin: 0,
        inputMax: GLOBAL_MAX,
        errorLabel: "Les bornes du terme 1"
      })
      : previous.termRanges.t1,
    t2: isSpecificTermSettings && maxTermCount >= 2
      ? readMinMax(container, "op_additions_termRange_t2", {
        inputMin: 0,
        inputMax: GLOBAL_MAX,
        errorLabel: "Les bornes du terme 2"
      })
      : previous.termRanges.t2,
    t3: isSpecificTermSettings && maxTermCount >= 3
      ? readMinMax(container, "op_additions_termRange_t3", {
        inputMin: 0,
        inputMax: GLOBAL_MAX,
        errorLabel: "Les bornes du terme 3"
      })
      : previous.termRanges.t3,
    t4: isSpecificTermSettings && maxTermCount >= 4
      ? readMinMax(container, "op_additions_termRange_t4", {
        inputMin: 0,
        inputMax: GLOBAL_MAX,
        errorLabel: "Les bornes du terme 4"
      })
      : previous.termRanges.t4
  };

  const resultBounds = isAdditionActive && isRandomGeneration && termCounts.length > 0
    ? computeAdditionsResultRange({
      generationMode,
      carryMode,
      termCounts,
      termSettingsMode,
      commonTermRange,
      termRanges,
      specialMode,
      specialConfig: previous.specialConfig
    })
    : null;

  const resultRange = isAdditionActive && isRandomGeneration && termCounts.length > 0
    ? (
      resultEnabled && previous.resultConstraint.enabled
        ? readMinMax(container, "op_additions_resultRange", {
          inputMin: resultBounds?.min ?? 0,
          inputMax: resultBounds?.max ?? GLOBAL_MAX,
          errorLabel: "Les bornes du résultat"
        })
        : clampRangeToBounds(previous.resultConstraint.range, resultBounds)
    )
    : previous.resultConstraint.range;

  const doublesRange = isAdditionActive && isSpecialGeneration && specialMode === ADDITION_SPECIAL_MODES.DOUBLES
    ? readMinMax(container, "op_additions_specialDoublesRange", {
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      errorLabel: "Les bornes des doubles"
    })
    : previous.specialConfig.doubles.range;

  const fixedListRaw = isAdditionActive && isFixedListGeneration
    ? String(container.querySelector("#op_additions_fixedListRaw")?.value ?? previous.fixedListRaw ?? "")
    : previous.fixedListRaw;

  return normalizeAdditionsSettings({
    ...previous,
    generationMode,
    carryMode,
    termCounts,
    termSettingsMode,
    commonTermRange,
    termRanges,
    resultConstraint: {
      enabled: resultEnabled,
      range: resultRange
    },
    fixedListRaw,
    specialMode,
    specialConfig: {
      doubles: {
        range: doublesRange
      }
    }
  });
}

function readSubtractionsSettings(container, previousSubtractions = {}, operation = "") {
  const previous = normalizeSubtractionsSettings(previousSubtractions);
  const isSubtractionActive = operation === OPERATION_TYPES.SUBTRACTION;
  const generationMode = isSubtractionActive
    ? readRadio(container, "op_subtractions_generationMode", previous.generationMode)
    : previous.generationMode;
  const isRandomGeneration = generationMode === SUBTRACTION_GENERATION_MODES.RANDOM;
  const isFixedListGeneration = generationMode === SUBTRACTION_GENERATION_MODES.FIXED_LIST;
  const isSpecialGeneration = generationMode === SUBTRACTION_GENERATION_MODES.SPECIAL;

  const carryMode = isSubtractionActive && isRandomGeneration
    ? readRadio(container, "op_subtractions_carryMode", previous.carryMode)
    : previous.carryMode;
  const termSettingsMode = isSubtractionActive && isRandomGeneration
    ? readRadio(container, "op_subtractions_termSettingsMode", previous.termSettingsMode)
    : previous.termSettingsMode;
  const specialMode = isSubtractionActive && isSpecialGeneration
    ? readSelect(container, "op_subtractions_specialMode", {
      parse: (value) => String(value || SUBTRACTION_SPECIAL_MODES.CROSS_TEN)
    })
    : previous.specialMode;
  const resultEnabled = isSubtractionActive && isRandomGeneration
    ? readCheckboxValue(container, "op_subtractions_resultConstraint_enabled")
    : previous.resultConstraint.enabled;

  const isSpecificTermSettings = isSubtractionActive
    && isRandomGeneration
    && termSettingsMode === SUBTRACTION_TERM_SETTINGS_MODES.SPECIFIC;
  const isCommonTermSettings = isSubtractionActive
    && isRandomGeneration
    && termSettingsMode === SUBTRACTION_TERM_SETTINGS_MODES.COMMON;

  const commonTermRange = isCommonTermSettings
    ? readMinMax(container, "op_subtractions_commonTermRange", {
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      errorLabel: "Les bornes communes"
    })
    : previous.commonTermRange;

  const termRanges = {
    t1: isSpecificTermSettings
      ? readMinMax(container, "op_subtractions_termRange_t1", {
        inputMin: 0,
        inputMax: GLOBAL_MAX,
        errorLabel: "Les bornes du terme 1"
      })
      : previous.termRanges.t1,
    t2: isSpecificTermSettings
      ? readMinMax(container, "op_subtractions_termRange_t2", {
        inputMin: 0,
        inputMax: GLOBAL_MAX,
        errorLabel: "Les bornes du terme 2"
      })
      : previous.termRanges.t2
  };

  const resultBounds = isSubtractionActive && isRandomGeneration
    ? computeSubtractionsResultRange({
      generationMode,
      carryMode,
      termSettingsMode,
      commonTermRange,
      termRanges,
      specialMode,
      specialConfig: previous.specialConfig
    })
    : null;

  const resultRange = isSubtractionActive && isRandomGeneration
    ? (
      resultEnabled && previous.resultConstraint.enabled
        ? readMinMax(container, "op_subtractions_resultRange", {
          inputMin: resultBounds?.min ?? 0,
          inputMax: resultBounds?.max ?? GLOBAL_MAX,
          errorLabel: "Les bornes du résultat"
        })
        : clampRangeToBounds(previous.resultConstraint.range, resultBounds)
    )
    : previous.resultConstraint.range;

  const crossTenFirstTermRange = isSubtractionActive && isSpecialGeneration && specialMode === SUBTRACTION_SPECIAL_MODES.CROSS_TEN
    ? readMinMax(container, "op_subtractions_specialCrossTenFirstTermRange", {
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      errorLabel: "Les bornes du premier terme"
    })
    : previous.specialConfig.crossTen.firstTermRange;

  const fixedListRaw = isSubtractionActive && isFixedListGeneration
    ? String(container.querySelector("#op_subtractions_fixedListRaw")?.value ?? previous.fixedListRaw ?? "")
    : previous.fixedListRaw;

  return normalizeSubtractionsSettings({
    ...previous,
    generationMode,
    carryMode,
    termSettingsMode,
    commonTermRange,
    termRanges,
    resultConstraint: {
      enabled: resultEnabled,
      range: resultRange
    },
    fixedListRaw,
    specialMode,
    specialConfig: {
      crossTen: {
        firstTermRange: crossTenFirstTermRange
      }
    }
  });
}

function mountToolSettings(container, cfg) {
  container.innerHTML = `
    <div class="tv-settings-stack ops-settings-stack">
      ${renderOperationBlock(cfg)}
      ${renderAdditionBranch(cfg)}
      ${renderSubtractionBranch(cfg)}
      ${renderMultiplicationBranch(cfg)}
      ${renderLegacyBranch(cfg)}
    </div>
  `;

  container.querySelector('[data-tv-radio-group="op_operation"]')
    ?.closest(".tv-group")
    ?.classList.add("ops-operation-group");

  bindRadio(container, "op_operation", {
    onChange: () => syncUi(container)
  });

  bindRadio(container, "op_additions_generationMode", {
    onChange: () => syncUi(container)
  });
  bindRadio(container, "op_additions_carryMode", {
    onChange: () => syncUi(container)
  });
  bindRadio(container, "op_additions_termSettingsMode", {
    onChange: () => syncUi(container)
  });
  bindSelect(container, "op_additions_specialMode", {
    onChange: () => syncUi(container)
  });

  bindRadio(container, "op_subtractions_generationMode", {
    onChange: () => syncUi(container)
  });
  bindRadio(container, "op_subtractions_carryMode", {
    onChange: () => syncUi(container)
  });
  bindRadio(container, "op_subtractions_termSettingsMode", {
    onChange: () => syncUi(container)
  });
  bindSelect(container, "op_subtractions_specialMode", {
    onChange: () => syncUi(container)
  });

  bindRadio(container, "op_multiplications_profile", {
    onChange: () => syncUi(container)
  });
  bindRadio(container, "op_multiplications_orderMode", {
    onChange: () => syncUi(container)
  });
  bindRadio(container, "op_multiplications_factorPosition", {
    onChange: () => syncUi(container)
  });
  bindRadio(container, "op_multiplications_generationMode", {
    onChange: () => syncUi(container)
  });
  bindRadio(container, "op_multiplications_carryMode", {
    onChange: () => syncUi(container)
  });

  bindRadio(container, "op_legacy_carryMode", {
    onChange: () => syncUi(container)
  });

  bindMinMax(container, "op_legacy_n1", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_legacy_n2", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_legacy_result", { inputMin: 0, inputMax: GLOBAL_MAX });

  bindMinMax(container, "op_additions_commonTermRange", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_additions_termRange_t1", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_additions_termRange_t2", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_additions_termRange_t3", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_additions_termRange_t4", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_additions_resultRange", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_additions_specialDoublesRange", { inputMin: 0, inputMax: GLOBAL_MAX });

  bindMinMax(container, "op_subtractions_commonTermRange", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_subtractions_termRange_t1", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_subtractions_termRange_t2", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_subtractions_resultRange", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_subtractions_specialCrossTenFirstTermRange", { inputMin: 0, inputMax: GLOBAL_MAX });

  bindMinMax(container, "op_multiplications_factorRange_f1", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_multiplications_factorRange_f2", { inputMin: 0, inputMax: GLOBAL_MAX });
  bindMinMax(container, "op_multiplications_resultRange", { inputMin: 0, inputMax: GLOBAL_MAX });

  bindAdditionCheckBoxes(container);
  bindMultiplicationCheckBoxes(container);
  bindFixedListTextarea(container, "additions", parseAdditionFixedListRaw);
  bindFixedListTextarea(container, "subtractions", parseSubtractionFixedListRaw);
  bindFixedListTextarea(container, "multiplications", parseMultiplicationFixedListRaw);
  bindResultConstraintCheckbox(container, "additions");
  bindResultConstraintCheckbox(container, "subtractions");
  bindResultConstraintCheckbox(container, "multiplications");

  const legacyN1Root = container.querySelector('[data-tv-minmax="op_legacy_n1"]');
  const legacyN2Root = container.querySelector('[data-tv-minmax="op_legacy_n2"]');
  [legacyN1Root, legacyN2Root].forEach((root) => {
    root?.addEventListener("input", () => syncLegacyResultBounds(container));
    root?.addEventListener("change", () => syncLegacyResultBounds(container));
  });

  [
    "op_additions_commonTermRange",
    "op_additions_termRange_t1",
    "op_additions_termRange_t2",
    "op_additions_termRange_t3",
    "op_additions_termRange_t4",
    "op_additions_resultRange",
    "op_additions_specialDoublesRange",
    "op_subtractions_commonTermRange",
    "op_subtractions_termRange_t1",
    "op_subtractions_termRange_t2",
    "op_subtractions_resultRange",
    "op_subtractions_specialCrossTenFirstTermRange",
    "op_multiplications_factorRange_f1",
    "op_multiplications_factorRange_f2",
    "op_multiplications_resultRange"
  ].forEach((idPrefix) => {
    bindMinMaxLiveSync(container, idPrefix);
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

  const nextSettings = readToolSettings(container, previousState.settings);
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

function applyToolSettingsState(container, settings) {
  const operation = String(settings?.operation || "");
  const additions = normalizeAdditionsSettings(settings?.specific?.additions);
  const subtractions = normalizeSubtractionsSettings(settings?.specific?.subtractions);
  const multiplications = normalizeMultiplicationsSettings(settings?.specific?.multiplications);
  const additionGenerationMode = String(additions.generationMode || "");
  const multiplicationProfile = String(multiplications.profile || "");
  const multiplicationGenerationMode = String(multiplications.generationMode || "");
  const termCounts = Array.isArray(additions.termCounts) ? additions.termCounts : [];
  const additionResultBounds = operation === OPERATION_TYPES.ADDITION
    ? computeAdditionsResultRange(additions)
    : null;
  const subtractionResultBounds = operation === OPERATION_TYPES.SUBTRACTION
    ? computeSubtractionsResultRange(subtractions)
    : null;
  const multiplicationResultBounds = operation === OPERATION_TYPES.MULTIPLICATION
    ? computeMultiplicationsResultRange(multiplications)
    : null;

  setWidgetState(container.querySelector('[data-tv-radio-group="op_operation"]')?.closest(".tv-group"), {
    incomplete: !isKnownOperationType(operation)
  });

  setWidgetState(container.querySelector('[data-ops-widget="addition-term-counts"]'), {
    incomplete: operation === OPERATION_TYPES.ADDITION
      && additionGenerationMode === ADDITION_GENERATION_MODES.RANDOM
      && termCounts.length === 0
  });

  setWidgetState(container.querySelector('[data-tv-radio-group="op_multiplications_profile"]')?.closest(".tv-group"), {
    incomplete: operation === OPERATION_TYPES.MULTIPLICATION && !multiplicationProfile
  });
  setWidgetState(container.querySelector('[data-ops-widget="multiplication-tables"]'), {
    incomplete: operation === OPERATION_TYPES.MULTIPLICATION
      && multiplicationProfile === MULTIPLICATION_PROFILES.TABLES
      && (!Array.isArray(multiplications.tables) || multiplications.tables.length === 0)
  });
  setWidgetState(container.querySelector('[data-ops-widget="multiplication-multipliers"]'), {
    incomplete: operation === OPERATION_TYPES.MULTIPLICATION
      && multiplicationProfile === MULTIPLICATION_PROFILES.TABLES
      && (!Array.isArray(multiplications.multipliers) || multiplications.multipliers.length === 0)
  });
  setWidgetState(container.querySelector('[data-tv-radio-group="op_multiplications_generationMode"]')?.closest(".tv-group"), {
    incomplete: operation === OPERATION_TYPES.MULTIPLICATION
      && multiplicationProfile === MULTIPLICATION_PROFILES.CALCULATION
      && !multiplicationGenerationMode
  });

  syncResultConstraintWidget(container, "additions", {
    enabled: Boolean(additions.resultConstraint?.enabled),
    bounds: additionResultBounds,
    range: additions.resultConstraint?.range
  });
  syncResultConstraintWidget(container, "subtractions", {
    enabled: Boolean(subtractions.resultConstraint?.enabled),
    bounds: subtractionResultBounds,
    range: subtractions.resultConstraint?.range
  });
  syncResultConstraintWidget(container, "multiplications", {
    enabled: Boolean(multiplications.resultConstraint?.enabled),
    bounds: multiplicationResultBounds,
    range: multiplications.resultConstraint?.range
  });
  updateFixedListFeedback(container, "additions", parseAdditionFixedListRaw);
  updateFixedListFeedback(container, "subtractions", parseSubtractionFixedListRaw);
  updateFixedListFeedback(container, "multiplications", parseMultiplicationFixedListRaw);

  setMinMaxBounds(container, "op_legacy_n2", {
    inputMin: operation === OPERATION_TYPES.DIVISION ? 1 : 0,
    inputMax: GLOBAL_MAX
  });

  if (isLegacyOperation(operation)) {
    syncLegacyResultBounds(container);
  }
}

function getToolStructureKey(settings) {
  const operation = String(settings?.operation || "");

  if (operation === OPERATION_TYPES.ADDITION) {
    const additions = normalizeAdditionsSettings(settings?.specific?.additions);
    const generationMode = String(additions.generationMode || "");
    const descriptor = {
      branch: "addition",
      generationMode
    };

    if (generationMode === ADDITION_GENERATION_MODES.RANDOM) {
      const termCounts = Array.isArray(additions.termCounts) ? additions.termCounts : [];
      descriptor.random = {
        hasTermCounts: termCounts.length > 0,
        maxTermCount: getSelectedMaxTermCount(termCounts),
        termSettingsMode: termCounts.length > 0 ? String(additions.termSettingsMode || "") : ""
      };
    } else if (generationMode === ADDITION_GENERATION_MODES.FIXED_LIST) {
      descriptor.fixed = true;
    } else if (generationMode === ADDITION_GENERATION_MODES.SPECIAL) {
      descriptor.specialMode = String(additions.specialMode || "");
    }

    return JSON.stringify(descriptor);
  }

  if (operation === OPERATION_TYPES.SUBTRACTION) {
    const subtractions = normalizeSubtractionsSettings(settings?.specific?.subtractions);
    const generationMode = String(subtractions.generationMode || "");
    const descriptor = {
      branch: "subtraction",
      generationMode
    };

    if (generationMode === SUBTRACTION_GENERATION_MODES.RANDOM) {
      descriptor.random = {
        termSettingsMode: String(subtractions.termSettingsMode || "")
      };
    } else if (generationMode === SUBTRACTION_GENERATION_MODES.FIXED_LIST) {
      descriptor.fixed = true;
    } else if (generationMode === SUBTRACTION_GENERATION_MODES.SPECIAL) {
      descriptor.specialMode = String(subtractions.specialMode || "");
    }

    return JSON.stringify(descriptor);
  }

  if (operation === OPERATION_TYPES.MULTIPLICATION) {
    const multiplications = normalizeMultiplicationsSettings(settings?.specific?.multiplications);
    const profile = String(multiplications.profile || "");
    const descriptor = {
      branch: "multiplication",
      profile
    };

    if (profile === MULTIPLICATION_PROFILES.TABLES) {
      descriptor.tables = {
        tableCount: Array.isArray(multiplications.tables) ? multiplications.tables.length : 0,
        multiplierCount: Array.isArray(multiplications.multipliers) ? multiplications.multipliers.length : 0
      };
    } else if (profile === MULTIPLICATION_PROFILES.CALCULATION) {
      descriptor.calculation = {
        generationMode: String(multiplications.generationMode || "")
      };
    }

    return JSON.stringify(descriptor);
  }

  if (isLegacyOperation(operation)) {
    return JSON.stringify({
      branch: "legacy",
      operation,
      carry: needsLegacyCarryMode(operation)
    });
  }

  return JSON.stringify({
    branch: "none",
    operation: ""
  });
}

function syncResultConstraintWidget(container, prefix, {
  enabled = false,
  bounds = null,
  range = null
} = {}) {
  const wrap = container.querySelector(`[data-ops-result-range-wrap="${prefix}"]`);
  if (!wrap) return;

  wrap.classList.toggle("is-disabled", !enabled);
  wrap.setAttribute("aria-disabled", enabled ? "false" : "true");

  const idPrefix = `op_${prefix}_resultRange`;
  const minEl = container.querySelector(`#${cssEscape(`${idPrefix}_min`)}`);
  const maxEl = container.querySelector(`#${cssEscape(`${idPrefix}_max`)}`);

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
  setMinMaxBounds(container, idPrefix, {
    inputMin: safeBounds.min,
    inputMax: safeBounds.max
  });

  wrap.querySelectorAll("input, button, textarea, select").forEach((el) => {
    el.disabled = !enabled;
  });
}

function syncLegacyResultBounds(container) {
  try {
    const operation = readRadio(container, "op_operation", "");
    if (!operation || operation === OPERATION_TYPES.ADDITION) {
      return;
    }

    const carryMode = readRadio(container, "op_legacy_carryMode", CARRY_MODES.WITHOUT);
    const n2InputMin = operation === OPERATION_TYPES.DIVISION ? 1 : 0;

    const n1Range = readMinMax(container, "op_legacy_n1", {
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      errorLabel: "Les bornes du premier terme"
    });

    const n2Range = readMinMax(container, "op_legacy_n2", {
      inputMin: n2InputMin,
      inputMax: GLOBAL_MAX,
      errorLabel: "Les bornes du deuxième terme"
    });

    const resultBounds = getPossibleResultBounds({
      operation,
      carryMode,
      n1Min: n1Range.min,
      n1Max: n1Range.max,
      n1Mode: n1Range.mode,
      n1Start: n1Range.start,
      n1Step: n1Range.step,
      n1List: n1Range.values,
      n2Min: n2Range.min,
      n2Max: n2Range.max,
      n2Mode: n2Range.mode,
      n2Start: n2Range.start,
      n2Step: n2Range.step,
      n2List: n2Range.values
    });

    setMinMaxBounds(container, "op_legacy_result", {
      inputMin: resultBounds?.min ?? 0,
      inputMax: resultBounds?.max ?? GLOBAL_MAX,
      alignMaxValueToUpperBound: true
    });
  } catch {
    setMinMaxBounds(container, "op_legacy_result", {
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      alignMaxValueToUpperBound: true
    });
  }
}

function syncSubtractionResultBounds(container) {
  try {
    const operation = readRadio(container, "op_operation", "");
    if (operation !== OPERATION_TYPES.SUBTRACTION) {
      return;
    }

    const generationMode = readRadio(container, "op_subtractions_generationMode", "");
    if (generationMode !== SUBTRACTION_GENERATION_MODES.RANDOM) {
      return;
    }

    const carryMode = readRadio(container, "op_subtractions_carryMode", CARRY_MODES.BOTH);
    const termSettingsMode = readRadio(container, "op_subtractions_termSettingsMode", SUBTRACTION_TERM_SETTINGS_MODES.COMMON);

    const settings = {
      operation,
      specific: {
        subtractions: {
          generationMode,
          carryMode,
          termSettingsMode,
          commonTermRange: termSettingsMode === SUBTRACTION_TERM_SETTINGS_MODES.COMMON
            ? readMinMax(container, "op_subtractions_commonTermRange", {
              inputMin: 0,
              inputMax: GLOBAL_MAX,
              errorLabel: "Les bornes communes"
            })
            : undefined,
          termRanges: {
            t1: termSettingsMode === SUBTRACTION_TERM_SETTINGS_MODES.SPECIFIC
              ? readMinMax(container, "op_subtractions_termRange_t1", {
                inputMin: 0,
                inputMax: GLOBAL_MAX,
                errorLabel: "Les bornes du terme 1"
              })
              : undefined,
            t2: termSettingsMode === SUBTRACTION_TERM_SETTINGS_MODES.SPECIFIC
              ? readMinMax(container, "op_subtractions_termRange_t2", {
                inputMin: 0,
                inputMax: GLOBAL_MAX,
                errorLabel: "Les bornes du terme 2"
              })
              : undefined
          }
        }
      }
    };

    const resultBounds = getPossibleResultBounds(settings);

    setMinMaxBounds(container, "op_subtractions_resultRange", {
      inputMin: resultBounds?.min ?? 0,
      inputMax: resultBounds?.max ?? GLOBAL_MAX,
      alignMaxValueToUpperBound: true
    });
  } catch {
    setMinMaxBounds(container, "op_subtractions_resultRange", {
      inputMin: 0,
      inputMax: GLOBAL_MAX,
      alignMaxValueToUpperBound: true
    });
  }
}

function updateFixedListFeedback(container, prefix, parser) {
  const textarea = container.querySelector(`#${cssEscape(`op_${prefix}_fixedListRaw`)}`);
  const feedback = container.querySelector(`[data-ops-fixed-list-feedback="${prefix}"]`);
  const widgetRoot = container.querySelector(`[data-ops-widget="${prefix}-fixed-list"]`);
  if (!textarea || !feedback) {
    return { entries: [], invalidLineNumbers: [] };
  }

  const parsed = parser(textarea.value);
  const rawText = String(textarea.value ?? "");
  const trimmed = rawText.trim();
  const invalidLineNumbers = parsed.invalidLineNumbers || [];
  const entries = parsed.entries || [];

  textarea.classList.toggle("is-warning", invalidLineNumbers.length > 0);
  textarea.setAttribute("aria-invalid", invalidLineNumbers.length > 0 ? "true" : "false");
  widgetRoot?.classList.toggle("is-warning", invalidLineNumbers.length > 0);

  if (invalidLineNumbers.length > 0) {
    feedback.textContent = `Lignes invalides : ${formatLineNumberList(invalidLineNumbers)}.`;
    feedback.classList.add("is-warning");
    feedback.classList.remove("is-ok");
  } else if (trimmed) {
    feedback.textContent = `${entries.length} calcul${entries.length > 1 ? "s" : ""} valide${entries.length > 1 ? "s" : ""}.`;
    feedback.classList.remove("is-warning");
    feedback.classList.add("is-ok");
  } else {
    feedback.textContent = "Aucune ligne saisie.";
    feedback.classList.remove("is-warning");
    feedback.classList.remove("is-ok");
  }

  return parsed;
}

function bindAdditionCheckBoxes(container) {
  container.querySelectorAll("[data-ops-term-count]").forEach((input) => {
    input.addEventListener("change", () => syncUi(container));
  });
}

function bindMultiplicationCheckBoxes(container) {
  container.querySelectorAll("[data-ops-multiplication-table], [data-ops-multiplication-multiplier]").forEach((input) => {
    input.addEventListener("change", () => syncUi(container));
  });
}

function bindFixedListTextarea(container, prefix, parser) {
  const textarea = container.querySelector(`#${cssEscape(`op_${prefix}_fixedListRaw`)}`);
  if (!textarea) return;

  textarea.addEventListener("input", () => {
    updateFixedListFeedback(container, prefix, parser);
    syncUi(container);
  });
  textarea.addEventListener("change", () => {
    updateFixedListFeedback(container, prefix, parser);
    syncUi(container);
  });
}

function bindResultConstraintCheckbox(container, prefix) {
  const checkbox = container.querySelector(`#${cssEscape(`op_${prefix}_resultConstraint_enabled`)}`);
  if (!checkbox) return;

  checkbox.addEventListener("change", () => syncUi(container));
}

function bindMinMaxLiveSync(container, idPrefix) {
  const root = container.querySelector(`[data-tv-minmax="${cssEscape(idPrefix)}"]`);
  if (!root) return;

  root.addEventListener("input", () => syncUi(container));
  root.addEventListener("change", () => syncUi(container));
}

function setWidgetState(root, {
  incomplete = false,
  warning = false
} = {}) {
  if (!root) return;

  root.classList.toggle("is-incomplete", incomplete);
  root.classList.toggle("is-warning", warning);
}

function renderNumberCheckboxWidget({
  title,
  widgetKey,
  dataAttr,
  values,
  selectedValues
}) {
  const selected = new Set(Array.isArray(selectedValues) ? selectedValues : []);
  const items = (Array.isArray(values) ? values : []).map((value) => {
    const safeValue = Number(value);
    const id = `op_${widgetKey}_${safeValue}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `
      <label class="tv-checkbox-row ops-number-option">
        <input
          class="tv-checkbox"
          type="checkbox"
          id="${id}"
          value="${safeValue}"
          ${dataAttr}
          ${selected.has(safeValue) ? "checked" : ""}
        >
        <span>${safeValue}</span>
      </label>
    `;
  }).join("");

  return `
    <div class="tv-group" data-ops-widget="${widgetKey}">
      <div class="ops-term-counts-line">
        <div class="tv-group-title">${escapeHtml(title)}</div>
        <div class="ops-term-counts ops-number-options">
          ${items}
        </div>
      </div>
    </div>
  `;
}

function renderTermCountsWidget(selectedCounts) {
  return `
    <div class="tv-group" data-ops-widget="addition-term-counts">
      <div class="ops-term-counts-line">
        <div class="tv-group-title">Nombre de termes</div>
        <div class="ops-term-counts">
          ${renderTermCountOptions(selectedCounts)}
        </div>
      </div>
    </div>
  `;
}

function renderFixedListWidget(prefix, rawText, {
  placeholder = ""
} = {}) {
  return `
    <div class="tv-group ops-fixed-list" data-ops-widget="${prefix}-fixed-list">
      <div class="tv-group-title">Liste fixe</div>
      <div class="ops-fixed-list-note">Une ligne = un calcul. Les lignes vides sont ignorées.</div>
      <textarea
        class="tv-input ops-fixed-list-textarea"
        id="op_${prefix}_fixedListRaw"
        data-ops-fixed-list-input
        rows="8"
        spellcheck="false"
        placeholder="${placeholder}"
      >${escapeHtml(rawText)}</textarea>
      <div class="ops-fixed-list-feedback" data-ops-fixed-list-feedback="${prefix}" aria-live="polite"></div>
    </div>
  `;
}

function renderTermCountOptions(selectedCounts) {
  const selected = new Set(Array.isArray(selectedCounts) ? selectedCounts : []);

  return ADDITION_TERM_COUNT_OPTIONS.map((count) => {
    const checked = selected.has(count);
    return `
      <label class="tv-checkbox-row ops-term-count-option" for="op_additions_termCount_${count}">
        <input
          class="tv-checkbox"
          type="checkbox"
          id="op_additions_termCount_${count}"
          data-ops-term-count="${count}"
          ${checked ? "checked" : ""}
        >
        <span>${count}</span>
      </label>
    `;
  }).join("");
}

function getSelectedMaxTermCount(termCounts) {
  if (!Array.isArray(termCounts) || termCounts.length === 0) {
    return 0;
  }

  return Math.max(...termCounts.map((value) => Number(value) || 0));
}

function readCheckedNumberValues(container, selector, allowedValues) {
  const allowed = new Set(Array.isArray(allowedValues) ? allowedValues : []);
  const out = [];
  container.querySelectorAll(selector).forEach((input) => {
    if (!input.checked) return;
    const value = Math.floor(Number(input.value));
    if (!Number.isFinite(value)) return;
    if (!allowed.has(value)) return;
    if (out.includes(value)) return;
    out.push(value);
  });
  return out;
}

function readCheckedTermCounts(container) {
  return Array.from(container.querySelectorAll("[data-ops-term-count]"))
    .filter((input) => input.checked)
    .map((input) => Number(input.dataset.opsTermCount || 0))
    .filter((value) => ADDITION_TERM_COUNT_OPTIONS.includes(value))
    .sort((a, b) => a - b);
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

  const rawOperation = String(raw.operation || "");
  const operation = rawOperation === ""
    ? ""
    : (
      rawOperation === OPERATION_TYPES.ADDITION || rawOperation === OPERATION_TYPES.SUBTRACTION || rawOperation === OPERATION_TYPES.MULTIPLICATION
        ? rawOperation
        : OPERATION_TYPES.ADDITION
    );

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

function needsLegacyCarryMode() {
  return false;
}

function isKnownOperationType(value) {
  return Object.values(OPERATION_TYPES).includes(String(value || ""));
}

function isLegacyOperation(value) {
  return [
    OPERATION_TYPES.DIVISION
  ].includes(String(value || ""));
}

function formatLineNumberList(numbers) {
  return numbers.join(", ");
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-ops-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.opsConfigStyle = href;
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
