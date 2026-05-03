import { normalizeNumericConstraint } from "../../shared/value-constraints.js";

export const OPERATION_TYPES = {
  ADDITION: "addition",
  SUBTRACTION: "subtraction",
  MULTIPLICATION: "multiplication",
  DIVISION: "division"
};

export const CARRY_MODES = {
  WITHOUT: "without_carry",
  WITH: "with_carry",
  BOTH: "both"
};

export const ADDITION_GENERATION_MODES = {
  RANDOM: "random",
  FIXED_LIST: "fixed_list",
  SPECIAL: "special"
};

export const ADDITION_TERM_SETTINGS_MODES = {
  COMMON: "common",
  SPECIFIC: "specific"
};

export const ADDITION_SPECIAL_MODES = {
  DOUBLES: "doubles"
};

export const ADDITION_TERM_COUNT_OPTIONS = [2, 3, 4];

export const SUBTRACTION_GENERATION_MODES = {
  RANDOM: "random",
  FIXED_LIST: "fixed_list",
  SPECIAL: "special"
};

export const SUBTRACTION_TERM_SETTINGS_MODES = {
  COMMON: "common",
  SPECIFIC: "specific"
};

export const SUBTRACTION_SPECIAL_MODES = {
  CROSS_TEN: "cross_ten"
};

export const MULTIPLICATION_PROFILES = {
  TABLES: "tables",
  CALCULATION: "calculation"
};

export const MULTIPLICATION_ORDER_MODES = {
  ORDERED: "ordered",
  SHUFFLED: "shuffled"
};

export const MULTIPLICATION_FACTOR_POSITIONS = {
  FIRST: "first_factor",
  SECOND: "second_factor",
  BOTH: "both"
};

export const MULTIPLICATION_GENERATION_MODES = {
  RANDOM: "random",
  FIXED_LIST: "fixed_list"
};

export const MULTIPLICATION_TABLE_OPTIONS = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 25];
export const MULTIPLICATION_MULTIPLIER_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

const GLOBAL_MIN = 0;
const GLOBAL_MAX = 999;
const ADDITION_TERM_RANGE_MAX = 99;
const SUBTRACTION_TERM_RANGE_MAX = 99;
const MULTIPLICATION_FACTOR_RANGE_MAX = 999;
const MULTIPLICATION_SECOND_FACTOR_DEFAULT_MAX = 9;

export function getDefaultSettings() {
  return {
    operation: "",
    carryMode: CARRY_MODES.WITHOUT,
    n1Min: 0,
    n1Max: 99,
    n1Mode: "simple",
    n1Start: 0,
    n1Step: 1,
    n1List: [],
    n2Min: 0,
    n2Max: 99,
    n2Mode: "simple",
    n2Start: 0,
    n2Step: 1,
    n2List: [],
    resultMin: 0,
    resultMax: 999,
    resultMode: "simple",
    resultStart: 0,
    resultStep: 1,
    resultList: [],
    specific: {
      additions: getDefaultAdditionsSettings(),
      subtractions: getDefaultSubtractionsSettings(),
      multiplications: getDefaultMultiplicationsSettings()
    }
  };
}

export function getDefaultAdditionsSettings() {
  return {
    generationMode: "",
    carryMode: CARRY_MODES.BOTH,
    termCounts: [],
    termSettingsMode: ADDITION_TERM_SETTINGS_MODES.COMMON,
    commonTermRange: createDefaultRange(0, ADDITION_TERM_RANGE_MAX),
    termRanges: {
      t1: createDefaultRange(0, ADDITION_TERM_RANGE_MAX),
      t2: createDefaultRange(0, ADDITION_TERM_RANGE_MAX),
      t3: createDefaultRange(0, ADDITION_TERM_RANGE_MAX),
      t4: createDefaultRange(0, ADDITION_TERM_RANGE_MAX)
    },
    resultConstraint: {
      enabled: false,
      range: createDefaultRange(0, GLOBAL_MAX)
    },
    fixedListRaw: "",
    specialMode: ADDITION_SPECIAL_MODES.DOUBLES,
    specialConfig: {
      doubles: {
        range: createDefaultRange(0, ADDITION_TERM_RANGE_MAX)
      }
    }
  };
}

export function getDefaultSubtractionsSettings() {
  return {
    generationMode: "",
    carryMode: CARRY_MODES.BOTH,
    termSettingsMode: SUBTRACTION_TERM_SETTINGS_MODES.COMMON,
    commonTermRange: createDefaultRange(0, SUBTRACTION_TERM_RANGE_MAX),
    termRanges: {
      t1: createDefaultRange(0, SUBTRACTION_TERM_RANGE_MAX),
      t2: createDefaultRange(0, SUBTRACTION_TERM_RANGE_MAX)
    },
    resultConstraint: {
      enabled: false,
      range: createDefaultRange(0, GLOBAL_MAX)
    },
    fixedListRaw: "",
    specialMode: SUBTRACTION_SPECIAL_MODES.CROSS_TEN,
    specialConfig: {
      crossTen: {
        firstTermRange: createDefaultRange(10, SUBTRACTION_TERM_RANGE_MAX)
      }
    }
  };
}

export function getDefaultMultiplicationsSettings() {
  return {
    profile: "",
    tables: [],
    orderMode: MULTIPLICATION_ORDER_MODES.ORDERED,
    factorPosition: MULTIPLICATION_FACTOR_POSITIONS.FIRST,
    multipliers: [...MULTIPLICATION_MULTIPLIER_OPTIONS],
    generationMode: "",
    carryMode: CARRY_MODES.BOTH,
    factorRanges: {
      f1: createDefaultRange(0, MULTIPLICATION_FACTOR_RANGE_MAX),
      f2: createDefaultRange(0, MULTIPLICATION_SECOND_FACTOR_DEFAULT_MAX)
    },
    resultConstraint: {
      enabled: false,
      range: createDefaultRange(0, GLOBAL_MAX)
    },
    fixedListRaw: ""
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  const operation = normalizeOperation(base.operation);
  const carryMode = normalizeCarryMode(base.carryMode);
  const n2InputMin = operation === OPERATION_TYPES.DIVISION ? 1 : GLOBAL_MIN;

  const n1Constraint = normalizeNumericConstraint({
    min: base.n1Min,
    max: base.n1Max,
    mode: base.n1Mode,
    start: base.n1Start,
    step: base.n1Step,
    values: base.n1List
  }, {
    inputMin: GLOBAL_MIN,
    inputMax: GLOBAL_MAX,
    defaultMin: 0,
    defaultMax: 99,
    defaultStart: 0,
    defaultStep: 1,
    defaultValues: []
  });

  const n2Constraint = normalizeNumericConstraint({
    min: base.n2Min,
    max: base.n2Max,
    mode: base.n2Mode,
    start: base.n2Start,
    step: base.n2Step,
    values: base.n2List
  }, {
    inputMin: n2InputMin,
    inputMax: GLOBAL_MAX,
    defaultMin: n2InputMin,
    defaultMax: 99,
    defaultStart: n2InputMin,
    defaultStep: 1,
    defaultValues: []
  });

  const resultConstraint = normalizeNumericConstraint({
    min: base.resultMin,
    max: base.resultMax,
    mode: base.resultMode,
    start: base.resultStart,
    step: base.resultStep,
    values: base.resultList
  }, {
    inputMin: GLOBAL_MIN,
    inputMax: GLOBAL_MAX,
    defaultMin: 0,
    defaultMax: GLOBAL_MAX,
    defaultStart: 0,
    defaultStep: 1,
    defaultValues: []
  });

  const specific = isPlainObject(base.specific) ? base.specific : {};
  const additions = normalizeAdditionsSettings(specific.additions);
  const subtractions = normalizeSubtractionsSettings(specific.subtractions);
  const multiplications = normalizeMultiplicationsSettings(specific.multiplications);

  return {
    operation,
    carryMode,
    n1Min: n1Constraint.min,
    n1Max: n1Constraint.max,
    n1Mode: n1Constraint.mode,
    n1Start: n1Constraint.start,
    n1Step: n1Constraint.step,
    n1List: n1Constraint.values,
    n1AllowedValues: n1Constraint.allowedValues,
    n2Min: n2Constraint.min,
    n2Max: n2Constraint.max,
    n2Mode: n2Constraint.mode,
    n2Start: n2Constraint.start,
    n2Step: n2Constraint.step,
    n2List: n2Constraint.values,
    n2AllowedValues: n2Constraint.allowedValues,
    resultMin: resultConstraint.min,
    resultMax: resultConstraint.max,
    resultMode: resultConstraint.mode,
    resultStart: resultConstraint.start,
    resultStep: resultConstraint.step,
    resultList: resultConstraint.values,
    resultAllowedValues: resultConstraint.allowedValues,
    specific: {
      ...specific,
      additions,
      subtractions,
      multiplications
    }
  };
}

export function normalizeAdditionsSettings(rawAdditions = {}) {
  const base = {
    ...getDefaultAdditionsSettings(),
    ...(rawAdditions ?? {})
  };

  const termRanges = isPlainObject(base.termRanges) ? base.termRanges : {};
  const resultConstraint = isPlainObject(base.resultConstraint) ? base.resultConstraint : {};
  const specialConfig = isPlainObject(base.specialConfig) ? base.specialConfig : {};
  const doublesConfig = isPlainObject(specialConfig.doubles) ? specialConfig.doubles : {};

  return {
    generationMode: normalizeAdditionGenerationMode(base.generationMode),
    carryMode: normalizeAdditionCarryMode(base.carryMode),
    termCounts: normalizeAdditionTermCounts(base.termCounts),
    termSettingsMode: normalizeAdditionTermSettingsMode(base.termSettingsMode),
    commonTermRange: normalizeAdditionRange(base.commonTermRange, {
      defaultMin: 0,
      defaultMax: ADDITION_TERM_RANGE_MAX
    }),
    termRanges: {
      t1: normalizeAdditionRange(termRanges.t1, {
        defaultMin: 0,
        defaultMax: ADDITION_TERM_RANGE_MAX
      }),
      t2: normalizeAdditionRange(termRanges.t2, {
        defaultMin: 0,
        defaultMax: ADDITION_TERM_RANGE_MAX
      }),
      t3: normalizeAdditionRange(termRanges.t3, {
        defaultMin: 0,
        defaultMax: ADDITION_TERM_RANGE_MAX
      }),
      t4: normalizeAdditionRange(termRanges.t4, {
        defaultMin: 0,
        defaultMax: ADDITION_TERM_RANGE_MAX
      })
    },
    resultConstraint: {
      enabled: resultConstraint.enabled === true,
      range: normalizeAdditionRange(resultConstraint.range, {
        defaultMin: 0,
        defaultMax: GLOBAL_MAX
      })
    },
    fixedListRaw: String(base.fixedListRaw ?? ""),
    specialMode: normalizeAdditionSpecialMode(base.specialMode),
    specialConfig: {
      doubles: {
        range: normalizeAdditionRange(doublesConfig.range, {
          defaultMin: 0,
          defaultMax: ADDITION_TERM_RANGE_MAX
        })
      }
    }
  };
}

export function normalizeSubtractionsSettings(rawSubtractions = {}) {
  const base = {
    ...getDefaultSubtractionsSettings(),
    ...(rawSubtractions ?? {})
  };

  const termRanges = isPlainObject(base.termRanges) ? base.termRanges : {};
  const resultConstraint = isPlainObject(base.resultConstraint) ? base.resultConstraint : {};
  const specialConfig = isPlainObject(base.specialConfig) ? base.specialConfig : {};
  const crossTenConfig = isPlainObject(specialConfig.crossTen) ? specialConfig.crossTen : {};

  return {
    generationMode: normalizeSubtractionGenerationMode(base.generationMode),
    carryMode: normalizeAdditionCarryMode(base.carryMode),
    termSettingsMode: normalizeSubtractionTermSettingsMode(base.termSettingsMode),
    commonTermRange: normalizeSubtractionRange(base.commonTermRange, {
      defaultMin: 0,
      defaultMax: SUBTRACTION_TERM_RANGE_MAX
    }),
    termRanges: {
      t1: normalizeSubtractionRange(termRanges.t1, {
        defaultMin: 0,
        defaultMax: SUBTRACTION_TERM_RANGE_MAX
      }),
      t2: normalizeSubtractionRange(termRanges.t2, {
        defaultMin: 0,
        defaultMax: SUBTRACTION_TERM_RANGE_MAX
      })
    },
    resultConstraint: {
      enabled: resultConstraint.enabled === true,
      range: normalizeSubtractionRange(resultConstraint.range, {
        defaultMin: 0,
        defaultMax: GLOBAL_MAX
      })
    },
    fixedListRaw: String(base.fixedListRaw ?? ""),
    specialMode: normalizeSubtractionSpecialMode(base.specialMode),
    specialConfig: {
      crossTen: {
        firstTermRange: normalizeSubtractionRange(crossTenConfig.firstTermRange, {
          defaultMin: 10,
          defaultMax: SUBTRACTION_TERM_RANGE_MAX
        })
      }
    }
  };
}

export function normalizeMultiplicationsSettings(rawMultiplications = {}) {
  const base = {
    ...getDefaultMultiplicationsSettings(),
    ...(rawMultiplications ?? {})
  };

  const factorRanges = isPlainObject(base.factorRanges) ? base.factorRanges : {};
  const resultConstraint = isPlainObject(base.resultConstraint) ? base.resultConstraint : {};

  return {
    profile: normalizeMultiplicationProfile(base.profile),
    tables: normalizeNumberSelection(base.tables, MULTIPLICATION_TABLE_OPTIONS),
    orderMode: normalizeMultiplicationOrderMode(base.orderMode),
    factorPosition: normalizeMultiplicationFactorPosition(base.factorPosition),
    multipliers: normalizeNumberSelection(base.multipliers, MULTIPLICATION_MULTIPLIER_OPTIONS),
    generationMode: normalizeMultiplicationGenerationMode(base.generationMode),
    carryMode: normalizeAdditionCarryMode(base.carryMode),
    factorRanges: {
      f1: normalizeMultiplicationRange(factorRanges.f1, {
        defaultMin: 0,
        defaultMax: MULTIPLICATION_FACTOR_RANGE_MAX
      }),
      f2: normalizeMultiplicationRange(factorRanges.f2, {
        defaultMin: 0,
        defaultMax: MULTIPLICATION_SECOND_FACTOR_DEFAULT_MAX
      })
    },
    resultConstraint: {
      enabled: resultConstraint.enabled === true,
      range: normalizeMultiplicationRange(resultConstraint.range, {
        defaultMin: 0,
        defaultMax: GLOBAL_MAX
      })
    },
    fixedListRaw: String(base.fixedListRaw ?? "")
  };
}

export function parseAdditionFixedListRaw(rawText) {
  const rawLines = String(rawText ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const entries = [];
  const invalidLineNumbers = [];

  rawLines.forEach((line, index) => {
    const parsed = parseAdditionFixedListLine(line);
    if (parsed == null) {
      return;
    }

    if (parsed.valid) {
      entries.push(parsed.entry);
    } else {
      invalidLineNumbers.push(index + 1);
    }
  });

  return {
    entries,
    invalidLineNumbers
  };
}

export function parseSubtractionFixedListRaw(rawText) {
  const rawLines = String(rawText ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const entries = [];
  const invalidLineNumbers = [];

  rawLines.forEach((line, index) => {
    const parsed = parseSubtractionFixedListLine(line);
    if (parsed == null) {
      return;
    }

    if (parsed.valid) {
      entries.push(parsed.entry);
    } else {
      invalidLineNumbers.push(index + 1);
    }
  });

  return {
    entries,
    invalidLineNumbers
  };
}

export function parseMultiplicationFixedListRaw(rawText) {
  const rawLines = String(rawText ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const entries = [];
  const invalidLineNumbers = [];

  rawLines.forEach((line, index) => {
    const parsed = parseMultiplicationFixedListLine(line);
    if (parsed == null) {
      return;
    }

    if (parsed.valid) {
      entries.push(parsed.entry);
    } else {
      invalidLineNumbers.push(index + 1);
    }
  });

  return {
    entries,
    invalidLineNumbers
  };
}

export function computeAdditionsResultRange(rawAdditions = {}) {
  const additions = normalizeAdditionsSettings(rawAdditions);
  const generationMode = additions.generationMode;

  if (generationMode === ADDITION_GENERATION_MODES.FIXED_LIST) {
    const entries = parseAdditionFixedListRaw(additions.fixedListRaw).entries || [];
    if (!entries.length) {
      return null;
    }

    let min = Infinity;
    let max = -Infinity;
    entries.forEach((entry) => {
      const result = Array.isArray(entry?.terms)
        ? entry.terms.reduce((sum, value) => sum + (Number(value) || 0), 0)
        : Number(entry?.result);
      if (!Number.isFinite(result)) return;
      min = Math.min(min, result);
      max = Math.max(max, result);
    });

    return normalizeComputedResultRange(min, max);
  }

  if (generationMode === ADDITION_GENERATION_MODES.SPECIAL) {
    const values = Array.isArray(additions.specialConfig?.doubles?.range?.allowedValues)
      ? additions.specialConfig.doubles.range.allowedValues
      : [];

    if (!values.length) {
      return null;
    }

    const min = Math.min(...values) * 2;
    const max = Math.max(...values) * 2;
    return normalizeComputedResultRange(min, max);
  }

  if (generationMode !== ADDITION_GENERATION_MODES.RANDOM) {
    return null;
  }

  const termCounts = Array.isArray(additions.termCounts) ? additions.termCounts : [];
  if (!termCounts.length) {
    return null;
  }

  let min = Infinity;
  let max = -Infinity;

  termCounts.forEach((termCount) => {
    const local = computeAdditionRandomResultRange(additions, termCount);
    if (!local) return;
    min = Math.min(min, local.min);
    max = Math.max(max, local.max);
  });

  return normalizeComputedResultRange(min, max);
}

export function computeSubtractionsResultRange(rawSubtractions = {}) {
  const subtractions = normalizeSubtractionsSettings(rawSubtractions);
  const generationMode = subtractions.generationMode;

  if (generationMode === SUBTRACTION_GENERATION_MODES.FIXED_LIST) {
    const entries = parseSubtractionFixedListRaw(subtractions.fixedListRaw).entries || [];
    if (!entries.length) {
      return null;
    }

    let min = Infinity;
    let max = -Infinity;
    entries.forEach((entry) => {
      const result = Array.isArray(entry?.terms)
        ? (Number(entry.terms[0]) || 0) - (Number(entry.terms[1]) || 0)
        : Number(entry?.result);
      if (!Number.isFinite(result)) return;
      min = Math.min(min, result);
      max = Math.max(max, result);
    });

    return normalizeComputedResultRange(min, max);
  }

  if (generationMode === SUBTRACTION_GENERATION_MODES.SPECIAL) {
    const firstTermValues = Array.isArray(subtractions.specialConfig?.crossTen?.firstTermRange?.allowedValues)
      ? subtractions.specialConfig.crossTen.firstTermRange.allowedValues
      : [];

    let min = Infinity;
    let max = -Infinity;
    let count = 0;

    firstTermValues.forEach((n1) => {
      getCrossTenSecondTerms(n1).forEach((n2) => {
        const question = buildSubtractionQuestionFromTerms([n1, n2], CARRY_MODES.WITH);
        if (!question) return;
        min = Math.min(min, question.result);
        max = Math.max(max, question.result);
        count += 1;
      });
    });

    return count > 0 ? normalizeComputedResultRange(min, max) : null;
  }

  if (generationMode !== SUBTRACTION_GENERATION_MODES.RANDOM) {
    return null;
  }

  if (subtractions.termSettingsMode === SUBTRACTION_TERM_SETTINGS_MODES.SPECIFIC) {
    const t1 = subtractions.termRanges?.t1;
    const t2 = subtractions.termRanges?.t2;
    const t1Values = Array.isArray(t1?.allowedValues) ? t1.allowedValues : [];
    const t2Values = Array.isArray(t2?.allowedValues) ? t2.allowedValues : [];
    if (!t1Values.length || !t2Values.length) {
      return null;
    }

    return normalizeComputedResultRange(
      Math.max(GLOBAL_MIN, t1Values[0] - t2Values[t2Values.length - 1]),
      Math.max(GLOBAL_MIN, t1Values[t1Values.length - 1] - t2Values[0])
    );
  }

  const commonRange = subtractions.commonTermRange;
  const commonValues = Array.isArray(commonRange?.allowedValues) ? commonRange.allowedValues : [];
  if (!commonValues.length) {
    return null;
  }

  return normalizeComputedResultRange(
    0,
    Math.max(GLOBAL_MIN, commonValues[commonValues.length - 1] - commonValues[0])
  );
}

export function computeMultiplicationsResultRange(rawMultiplications = {}) {
  const multiplications = normalizeMultiplicationsSettings(rawMultiplications);

  if (multiplications.profile === MULTIPLICATION_PROFILES.TABLES) {
    return computeRangeFromQuestions(buildMultiplicationTableQuestions(multiplications));
  }

  if (multiplications.profile !== MULTIPLICATION_PROFILES.CALCULATION) {
    return null;
  }

  if (multiplications.generationMode === MULTIPLICATION_GENERATION_MODES.FIXED_LIST) {
    const entries = parseMultiplicationFixedListRaw(multiplications.fixedListRaw).entries || [];
    return computeRangeFromQuestions(entries.map((entry) => buildMultiplicationQuestionFromFactors(entry.terms, CARRY_MODES.BOTH)).filter(Boolean));
  }

  if (multiplications.generationMode !== MULTIPLICATION_GENERATION_MODES.RANDOM) {
    return null;
  }

  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  iterateMultiplicationCalculationQuestions(multiplications, (question) => {
    min = Math.min(min, question.result);
    max = Math.max(max, question.result);
    count += 1;
  });

  return count > 0 ? normalizeComputedResultRange(min, max) : null;
}

export function computeResultRange(operation, settings = {}) {
  const safeOperation = String(operation || "");

  if (safeOperation === OPERATION_TYPES.ADDITION) {
    return computeAdditionsResultRange(settings?.specific?.additions ?? settings);
  }

  if (safeOperation === OPERATION_TYPES.SUBTRACTION) {
    return computeSubtractionsResultRange(settings?.specific?.subtractions ?? settings);
  }

  if (safeOperation === OPERATION_TYPES.MULTIPLICATION) {
    return computeMultiplicationsResultRange(settings?.specific?.multiplications ?? settings);
  }

  return null;
}

export function getPossibleResultBounds(settings) {
  const cfg = normalizeSettings(settings);

  if (usesAdditionSpecificGeneration(cfg)) {
    return getAdditionPossibleResultBounds(cfg);
  }

  if (usesSubtractionSpecificGeneration(cfg)) {
    return getSubtractionPossibleResultBounds(cfg);
  }

  if (usesMultiplicationSpecificGeneration(cfg)) {
    return getMultiplicationPossibleResultBounds(cfg);
  }

  let min = Infinity;
  let max = -Infinity;
  let count = 0;

  iterateCandidateQuestions(cfg, (question) => {
    min = Math.min(min, question.result);
    max = Math.max(max, question.result);
    count += 1;
  });

  if (!count) {
    return null;
  }

  return { min, max, count };
}

function computeAdditionRandomResultRange(additions, termCount) {
  const safeTermCount = Math.floor(Number(termCount));
  if (!Number.isFinite(safeTermCount) || safeTermCount < 2) {
    return null;
  }

  const valueLists = getAdditionValueListsForTermCount(additions, safeTermCount);
  if (!valueLists.length || valueLists.some((values) => !Array.isArray(values) || values.length === 0)) {
    return null;
  }

  let min = Infinity;
  let max = -Infinity;

  if (additions.carryMode === CARRY_MODES.BOTH) {
    min = valueLists.reduce((sum, values) => sum + values[0], 0);
    max = valueLists.reduce((sum, values) => sum + values[values.length - 1], 0);
    return normalizeComputedResultRange(min, max);
  }

  const lowerGuess = valueLists.reduce((sum, values) => sum + values[0], 0);
  const upperGuess = valueLists.reduce((sum, values) => sum + values[values.length - 1], 0);
  const searchMin = Math.max(GLOBAL_MIN, Math.min(GLOBAL_MAX, Math.floor(Math.min(lowerGuess, upperGuess))));
  const searchMax = Math.max(GLOBAL_MIN, Math.min(GLOBAL_MAX, Math.floor(Math.max(lowerGuess, upperGuess))));

  for (let target = searchMin; target <= searchMax; target += 1) {
    if (findAdditionTermsForTarget(valueLists, target, additions.carryMode)) {
      min = target;
      break;
    }
  }

  for (let target = searchMax; target >= searchMin; target -= 1) {
    if (findAdditionTermsForTarget(valueLists, target, additions.carryMode)) {
      max = target;
      break;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  return normalizeComputedResultRange(min, max);
}

function normalizeComputedResultRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return null;
  }

  const lower = Math.max(GLOBAL_MIN, Math.min(GLOBAL_MAX, Math.floor(min)));
  const upper = Math.max(GLOBAL_MIN, Math.min(GLOBAL_MAX, Math.floor(max)));

  return {
    min: Math.min(lower, upper),
    max: Math.max(lower, upper)
  };
}

export function hasAtLeastOnePossibleOperation(settings) {
  const cfg = normalizeSettings(settings);

  if (usesAdditionSpecificGeneration(cfg)) {
    return additionHasAtLeastOnePossibleQuestion(cfg);
  }

  if (usesSubtractionSpecificGeneration(cfg)) {
    return subtractionHasAtLeastOnePossibleQuestion(cfg);
  }

  if (usesMultiplicationSpecificGeneration(cfg)) {
    return multiplicationHasAtLeastOnePossibleQuestion(cfg);
  }

  const resultSet = new Set(cfg.resultAllowedValues);
  let found = false;

  iterateCandidateQuestions(cfg, (question) => {
    if (!resultSet.has(question.result)) return;
    found = true;
    return false;
  });

  return found;
}

export function pickQuestion(settings, { avoidKey = null, sequenceIndex = 0, usedKeys = null } = {}) {
  const cfg = normalizeSettings(settings);

  if (usesAdditionSpecificGeneration(cfg)) {
    const additionQuestion = pickAdditionQuestion(cfg, { avoidKey });
    if (!additionQuestion) {
      throw new Error(getImpossibleMessage(cfg));
    }
    return additionQuestion;
  }

  if (usesSubtractionSpecificGeneration(cfg)) {
    const subtractionQuestion = pickSubtractionQuestion(cfg, { avoidKey });
    if (!subtractionQuestion) {
      throw new Error(getImpossibleMessage(cfg));
    }
    return subtractionQuestion;
  }

  if (usesMultiplicationSpecificGeneration(cfg)) {
    const multiplicationQuestion = pickMultiplicationQuestion(cfg, { avoidKey, sequenceIndex, usedKeys });
    if (!multiplicationQuestion) {
      throw new Error(getImpossibleMessage(cfg));
    }
    return multiplicationQuestion;
  }

  const resultSet = new Set(cfg.resultAllowedValues);
  let chosen = null;
  let chosenCount = 0;
  let fallback = null;
  let fallbackCount = 0;

  iterateCandidateQuestions(cfg, (question) => {
    if (!resultSet.has(question.result)) return;

    fallbackCount += 1;
    if (Math.random() < (1 / fallbackCount)) {
      fallback = question;
    }

    if (avoidKey && questionKey(question) === avoidKey) {
      return;
    }

    chosenCount += 1;
    if (Math.random() < (1 / chosenCount)) {
      chosen = question;
    }
  });

  const finalQuestion = chosen || fallback;
  if (!finalQuestion) {
    throw new Error(getImpossibleMessage(cfg));
  }

  return finalQuestion;
}

export function questionKey(question) {
  const termsKey = Array.isArray(question?.terms)
    ? question.terms.join(",")
    : "";

  return [
    question?.operation || "",
    termsKey,
    question?.n1 ?? "",
    question?.n2 ?? "",
    question?.result ?? "",
    question?.quotient ?? "",
    question?.remainder ?? ""
  ].join("|");
}

export function getImpossibleMessage(settings) {
  const cfg = normalizeSettings(settings);

  switch (cfg.operation) {
    case OPERATION_TYPES.ADDITION:
      if (usesAdditionSpecificGeneration(cfg)) {
        return getAdditionImpossibleMessage(cfg);
      }
      if (cfg.carryMode === CARRY_MODES.WITH) {
        return "Aucune addition avec retenue possible avec ces réglages.";
      }
      if (cfg.carryMode === CARRY_MODES.BOTH) {
        return "Aucune addition possible avec ces réglages.";
      }
      return "Aucune addition sans retenue possible avec ces réglages.";
    case OPERATION_TYPES.SUBTRACTION:
      if (usesSubtractionSpecificGeneration(cfg)) {
        return getSubtractionImpossibleMessage(cfg);
      }
      if (cfg.carryMode === CARRY_MODES.WITH) {
        return "Aucune soustraction avec retenue possible avec ces réglages.";
      }
      if (cfg.carryMode === CARRY_MODES.BOTH) {
        return "Aucune soustraction possible avec ces réglages.";
      }
      return "Aucune soustraction sans retenue possible avec ces réglages.";
    case OPERATION_TYPES.MULTIPLICATION:
      return getMultiplicationImpossibleMessage(cfg);
    case OPERATION_TYPES.DIVISION:
      return "Aucune division euclidienne possible avec ces réglages.";
    default:
      return "Aucune opération possible avec ces réglages.";
  }
}

export function formatQuestion(question) {
  switch (question?.operation) {
    case OPERATION_TYPES.ADDITION:
      if (Array.isArray(question?.terms) && question.terms.length >= 2) {
        return question.terms.join(" + ");
      }
      return `${question.n1} + ${question.n2}`;
    case OPERATION_TYPES.SUBTRACTION:
      if (Array.isArray(question?.terms) && question.terms.length >= 2) {
        return `${question.terms[0]} - ${question.terms[1]}`;
      }
      return `${question.n1} - ${question.n2}`;
    case OPERATION_TYPES.MULTIPLICATION:
      return `${question.n1} × ${question.n2}`;
    case OPERATION_TYPES.DIVISION:
      return `${question.n1} : ${question.n2} ?`;
    default:
      return "";
  }
}

export function formatAnswer(question) {
  switch (question?.operation) {
    case OPERATION_TYPES.ADDITION:
      if (Array.isArray(question?.terms) && question.terms.length >= 2) {
        return `${question.terms.join(" + ")} = ${question.result}`;
      }
      return `${question.n1} + ${question.n2} = ${question.result}`;
    case OPERATION_TYPES.SUBTRACTION:
      if (Array.isArray(question?.terms) && question.terms.length >= 2) {
        return `${question.terms[0]} - ${question.terms[1]} = ${question.result}`;
      }
      return `${question.n1} - ${question.n2} = ${question.result}`;
    case OPERATION_TYPES.MULTIPLICATION:
      return `${question.n1} × ${question.n2} = ${question.result}`;
    case OPERATION_TYPES.DIVISION:
      return `q = ${question.quotient} et r = ${question.remainder}`;
    default:
      return "";
  }
}

function normalizeOperation(value) {
  const safeValue = String(value || "").toLowerCase();

  if (
    safeValue === OPERATION_TYPES.ADDITION
    || safeValue === OPERATION_TYPES.SUBTRACTION
    || safeValue === OPERATION_TYPES.MULTIPLICATION
  ) {
    return safeValue;
  }

  return OPERATION_TYPES.ADDITION;
}

function normalizeCarryMode(value) {
  if (value === CARRY_MODES.WITH) return CARRY_MODES.WITH;
  if (value === CARRY_MODES.BOTH) return CARRY_MODES.BOTH;
  return CARRY_MODES.WITHOUT;
}

function normalizeAdditionGenerationMode(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (Object.values(ADDITION_GENERATION_MODES).includes(safeValue)) {
    return safeValue;
  }
  return "";
}

function normalizeAdditionCarryMode(value) {
  if (value === CARRY_MODES.WITH) return CARRY_MODES.WITH;
  if (value === CARRY_MODES.WITHOUT) return CARRY_MODES.WITHOUT;
  return CARRY_MODES.BOTH;
}

function normalizeAdditionTermSettingsMode(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (safeValue === ADDITION_TERM_SETTINGS_MODES.SPECIFIC) return ADDITION_TERM_SETTINGS_MODES.SPECIFIC;
  return ADDITION_TERM_SETTINGS_MODES.COMMON;
}

function normalizeAdditionSpecialMode(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (safeValue === ADDITION_SPECIAL_MODES.DOUBLES) return ADDITION_SPECIAL_MODES.DOUBLES;
  return ADDITION_SPECIAL_MODES.DOUBLES;
}

function normalizeSubtractionGenerationMode(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (Object.values(SUBTRACTION_GENERATION_MODES).includes(safeValue)) {
    return safeValue;
  }
  return "";
}

function normalizeSubtractionTermSettingsMode(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (safeValue === SUBTRACTION_TERM_SETTINGS_MODES.SPECIFIC) return SUBTRACTION_TERM_SETTINGS_MODES.SPECIFIC;
  return SUBTRACTION_TERM_SETTINGS_MODES.COMMON;
}

function normalizeSubtractionSpecialMode(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (safeValue === SUBTRACTION_SPECIAL_MODES.CROSS_TEN) return SUBTRACTION_SPECIAL_MODES.CROSS_TEN;
  return SUBTRACTION_SPECIAL_MODES.CROSS_TEN;
}

function normalizeMultiplicationProfile(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (Object.values(MULTIPLICATION_PROFILES).includes(safeValue)) {
    return safeValue;
  }
  return "";
}

function normalizeMultiplicationOrderMode(value) {
  if (value === MULTIPLICATION_ORDER_MODES.SHUFFLED) return MULTIPLICATION_ORDER_MODES.SHUFFLED;
  return MULTIPLICATION_ORDER_MODES.ORDERED;
}

function normalizeMultiplicationFactorPosition(value) {
  if (value === MULTIPLICATION_FACTOR_POSITIONS.SECOND) return MULTIPLICATION_FACTOR_POSITIONS.SECOND;
  if (value === MULTIPLICATION_FACTOR_POSITIONS.BOTH) return MULTIPLICATION_FACTOR_POSITIONS.BOTH;
  return MULTIPLICATION_FACTOR_POSITIONS.FIRST;
}

function normalizeMultiplicationGenerationMode(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (Object.values(MULTIPLICATION_GENERATION_MODES).includes(safeValue)) {
    return safeValue;
  }
  return "";
}

function normalizeNumberSelection(value, allowedOptions) {
  const allowed = new Set(Array.isArray(allowedOptions) ? allowedOptions : []);
  const rawValues = Array.isArray(value) ? value : [];
  const out = [];
  rawValues.forEach((raw) => {
    const number = Math.floor(Number(raw));
    if (!Number.isFinite(number)) return;
    if (!allowed.has(number)) return;
    if (out.includes(number)) return;
    out.push(number);
  });
  return out;
}

function normalizeAdditionTermCounts(value) {
  const rawValues = Array.isArray(value)
    ? value
    : value == null
      ? []
      : String(value)
        .split(/[\s,;|]+/)
        .filter(Boolean);

  const seen = new Set();
  const out = [];

  rawValues.forEach((item) => {
    const n = Math.floor(Number(item));
    if (!Number.isFinite(n)) return;
    if (!ADDITION_TERM_COUNT_OPTIONS.includes(n)) return;
    if (seen.has(n)) return;
    seen.add(n);
    out.push(n);
  });

  out.sort((a, b) => a - b);
  return out;
}

function normalizeAdditionRange(rawRange, {
  defaultMin = 0,
  defaultMax = ADDITION_TERM_RANGE_MAX
} = {}) {
  const range = isPlainObject(rawRange) ? rawRange : {};

  return normalizeNumericConstraint({
    min: range.min,
    max: range.max,
    mode: range.mode,
    start: range.start,
    step: range.step,
    values: range.values
  }, {
    inputMin: GLOBAL_MIN,
    inputMax: GLOBAL_MAX,
    defaultMin,
    defaultMax,
    defaultStart: defaultMin,
    defaultStep: 1,
    defaultValues: []
  });
}

function normalizeSubtractionRange(rawRange, {
  defaultMin = 0,
  defaultMax = SUBTRACTION_TERM_RANGE_MAX
} = {}) {
  const range = isPlainObject(rawRange) ? rawRange : {};

  return normalizeNumericConstraint({
    min: range.min,
    max: range.max,
    mode: range.mode,
    start: range.start,
    step: range.step,
    values: range.values
  }, {
    inputMin: GLOBAL_MIN,
    inputMax: GLOBAL_MAX,
    defaultMin,
    defaultMax,
    defaultStart: defaultMin,
    defaultStep: 1,
    defaultValues: []
  });
}

function normalizeMultiplicationRange(rawRange, {
  defaultMin = 0,
  defaultMax = GLOBAL_MAX
} = {}) {
  const range = isPlainObject(rawRange) ? rawRange : {};

  return normalizeNumericConstraint({
    min: range.min,
    max: range.max,
    mode: range.mode,
    start: range.start,
    step: range.step,
    values: range.values
  }, {
    inputMin: GLOBAL_MIN,
    inputMax: GLOBAL_MAX,
    defaultMin,
    defaultMax,
    defaultStart: defaultMin,
    defaultStep: 1,
    defaultValues: []
  });
}

function parseAdditionFixedListLine(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split("=");
  if (parts.length > 2) {
    return { valid: false };
  }

  const leftRaw = String(parts[0] ?? "").trim();
  if (!leftRaw) {
    return { valid: false };
  }

  const leftTerms = leftRaw.split("+").map((term) => term.trim());
  if (leftTerms.length < 2) {
    return { valid: false };
  }

  const values = [];
  for (const term of leftTerms) {
    if (!/^\d+$/.test(term)) {
      return { valid: false };
    }
    values.push(Number(term));
  }

  const sum = values.reduce((acc, value) => acc + value, 0);
  const rightRaw = parts[1];

  if (rightRaw != null) {
    const rightTrimmed = String(rightRaw ?? "").trim();
    if (!/^\d+$/.test(rightTrimmed)) {
      return { valid: false };
    }

    if (Number(rightTrimmed) !== sum) {
      return { valid: false };
    }
  }

  return {
    valid: true,
    entry: {
      terms: values,
      result: rightRaw == null ? null : sum
    }
  };
}

function parseMultiplicationFixedListLine(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split("=");
  if (parts.length > 2) {
    return { valid: false };
  }

  const leftRaw = String(parts[0] ?? "").trim();
  if (!leftRaw) {
    return { valid: false };
  }

  const leftTerms = leftRaw.split(/(?:×|x|X|\*)/).map((term) => term.trim());
  if (leftTerms.length !== 2) {
    return { valid: false };
  }

  const [n1Raw, n2Raw] = leftTerms;
  if (!/^\d+$/.test(n1Raw) || !/^\d+$/.test(n2Raw)) {
    return { valid: false };
  }

  const n1 = Number(n1Raw);
  const n2 = Number(n2Raw);
  const result = n1 * n2;
  if (!Number.isFinite(result) || result < GLOBAL_MIN || result > GLOBAL_MAX) {
    return { valid: false };
  }

  const rightRaw = parts[1];
  if (rightRaw != null) {
    const rightTrimmed = String(rightRaw ?? "").trim();
    if (!/^\d+$/.test(rightTrimmed)) {
      return { valid: false };
    }

    if (Number(rightTrimmed) !== result) {
      return { valid: false };
    }
  }

  return {
    valid: true,
    entry: {
      terms: [n1, n2],
      result: rightRaw == null ? null : result
    }
  };
}

function parseSubtractionFixedListLine(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split("=");
  if (parts.length > 2) {
    return { valid: false };
  }

  const leftRaw = String(parts[0] ?? "").trim();
  if (!leftRaw) {
    return { valid: false };
  }

  const leftTerms = leftRaw.split("-").map((term) => term.trim());
  if (leftTerms.length !== 2) {
    return { valid: false };
  }

  const [n1Raw, n2Raw] = leftTerms;
  if (!/^\d+$/.test(n1Raw) || !/^\d+$/.test(n2Raw)) {
    return { valid: false };
  }

  const n1 = Number(n1Raw);
  const n2 = Number(n2Raw);
  if (n2 > n1) {
    return { valid: false };
  }

  const result = n1 - n2;
  const rightRaw = parts[1];

  if (rightRaw != null) {
    const rightTrimmed = String(rightRaw ?? "").trim();
    if (!/^\d+$/.test(rightTrimmed)) {
      return { valid: false };
    }

    if (Number(rightTrimmed) !== result) {
      return { valid: false };
    }
  }

  return {
    valid: true,
    entry: {
      terms: [n1, n2],
      result: rightRaw == null ? null : result
    }
  };
}

function usesAdditionSpecificGeneration(cfg) {
  return cfg?.operation === OPERATION_TYPES.ADDITION
    && Object.values(ADDITION_GENERATION_MODES).includes(cfg?.specific?.additions?.generationMode);
}

function usesSubtractionSpecificGeneration(cfg) {
  return cfg?.operation === OPERATION_TYPES.SUBTRACTION
    && Object.values(SUBTRACTION_GENERATION_MODES).includes(cfg?.specific?.subtractions?.generationMode);
}

function usesMultiplicationSpecificGeneration(cfg) {
  const multiplications = cfg?.specific?.multiplications;
  if (cfg?.operation !== OPERATION_TYPES.MULTIPLICATION || !multiplications) return false;
  if (multiplications.profile === MULTIPLICATION_PROFILES.TABLES) return true;
  return multiplications.profile === MULTIPLICATION_PROFILES.CALCULATION
    && Object.values(MULTIPLICATION_GENERATION_MODES).includes(multiplications.generationMode);
}

function getAdditionImpossibleMessage(cfg) {
  const additions = cfg?.specific?.additions;
  const generationMode = additions?.generationMode;

  if (generationMode === ADDITION_GENERATION_MODES.FIXED_LIST) {
    return "Aucune addition valide dans la liste fixe.";
  }

  if (generationMode === ADDITION_GENERATION_MODES.SPECIAL) {
    return "Aucun double possible avec ces réglages.";
  }

  if (!Array.isArray(additions?.termCounts) || additions.termCounts.length === 0) {
    return "Aucune addition possible : aucun nombre de termes n’est sélectionné.";
  }

  if (additions?.carryMode === CARRY_MODES.WITH) {
    return "Aucune addition avec retenue possible avec ces réglages.";
  }

  if (additions?.carryMode === CARRY_MODES.WITHOUT) {
    return "Aucune addition sans retenue possible avec ces réglages.";
  }

  return "Aucune addition possible avec ces réglages.";
}

function getSubtractionImpossibleMessage(cfg) {
  const subtractions = cfg?.specific?.subtractions;
  const generationMode = subtractions?.generationMode;

  if (generationMode === SUBTRACTION_GENERATION_MODES.FIXED_LIST) {
    return "Aucune soustraction valide dans la liste fixe.";
  }

  if (generationMode === SUBTRACTION_GENERATION_MODES.SPECIAL) {
    return "Aucune soustraction avec passage par dizaine possible avec ces réglages.";
  }

  if (subtractions?.carryMode === CARRY_MODES.WITH) {
    return "Aucune soustraction avec retenue possible avec ces réglages.";
  }

  if (subtractions?.carryMode === CARRY_MODES.WITHOUT) {
    return "Aucune soustraction sans retenue possible avec ces réglages.";
  }

  return "Aucune soustraction possible avec ces réglages.";
}

function getMultiplicationImpossibleMessage(cfg) {
  const multiplications = cfg?.specific?.multiplications;
  if (!multiplications?.profile) {
    return "Aucune multiplication possible : aucun type d’exercice n’est sélectionné.";
  }

  if (multiplications.profile === MULTIPLICATION_PROFILES.TABLES) {
    if (!Array.isArray(multiplications.tables) || multiplications.tables.length === 0) {
      return "Aucune multiplication possible : aucune table travaillée n’est sélectionnée.";
    }
    if (!Array.isArray(multiplications.multipliers) || multiplications.multipliers.length === 0) {
      return "Aucune multiplication possible : aucun multiplicateur n’est sélectionné.";
    }
    return "Aucune multiplication de tables possible avec ces réglages.";
  }

  if (multiplications.generationMode === MULTIPLICATION_GENERATION_MODES.FIXED_LIST) {
    return "Aucune multiplication valide dans la liste fixe.";
  }

  if (multiplications.carryMode === CARRY_MODES.WITH) {
    return "Aucune multiplication avec retenue possible avec ces réglages.";
  }

  if (multiplications.carryMode === CARRY_MODES.WITHOUT) {
    return "Aucune multiplication sans retenue possible avec ces réglages.";
  }

  return "Aucune multiplication possible avec ces réglages.";
}

function getAdditionPossibleResultBounds(cfg) {
  const additions = cfg?.specific?.additions;
  if (!additions) return null;

  if (additions.generationMode === ADDITION_GENERATION_MODES.FIXED_LIST) {
    const entries = parseAdditionFixedListRaw(additions.fixedListRaw).entries || [];
    if (!entries.length) return null;

    let min = Infinity;
    let max = -Infinity;
    entries.forEach((entry) => {
      min = Math.min(min, entry.result);
      max = Math.max(max, entry.result);
    });

    return Number.isFinite(min) && Number.isFinite(max)
      ? { min, max, count: entries.length }
      : null;
  }

  if (additions.generationMode === ADDITION_GENERATION_MODES.SPECIAL) {
    const values = additions.specialConfig?.doubles?.range?.allowedValues || [];
    if (!values.length) return null;

    const results = values.map((value) => value * 2).filter((value) => value >= GLOBAL_MIN && value <= GLOBAL_MAX);
    if (!results.length) return null;

    return {
      min: Math.min(...results),
      max: Math.max(...results),
      count: results.length
    };
  }

  const termCounts = additions.termCounts || [];
  if (!termCounts.length) return null;

  let min = Infinity;
  let max = -Infinity;
  let count = 0;

  for (const termCount of termCounts) {
    const valueLists = getAdditionValueListsForTermCount(additions, termCount);
    if (!valueLists.length || valueLists.some((values) => values.length === 0)) {
      continue;
    }

    const localMin = valueLists.reduce((sum, values) => sum + values[0], 0);
    const localMax = valueLists.reduce((sum, values) => sum + values[values.length - 1], 0);

    if (localMax < GLOBAL_MIN || localMin > GLOBAL_MAX) {
      continue;
    }

    min = Math.min(min, Math.max(GLOBAL_MIN, localMin));
    max = Math.max(max, Math.min(GLOBAL_MAX, localMax));
    count += 1;
  }

  if (!count) return null;
  return { min, max, count };
}

function getSubtractionPossibleResultBounds(cfg) {
  const subtractions = cfg?.specific?.subtractions;
  if (!subtractions) return null;

  if (subtractions.generationMode === SUBTRACTION_GENERATION_MODES.FIXED_LIST) {
    const entries = parseSubtractionFixedListRaw(subtractions.fixedListRaw).entries || [];
    if (!entries.length) return null;

    let min = Infinity;
    let max = -Infinity;
    entries.forEach((entry) => {
      const result = entry.terms[0] - entry.terms[1];
      min = Math.min(min, result);
      max = Math.max(max, result);
    });

    return Number.isFinite(min) && Number.isFinite(max)
      ? { min, max, count: entries.length }
      : null;
  }

  if (subtractions.generationMode === SUBTRACTION_GENERATION_MODES.SPECIAL) {
    const firstTermValues = subtractions.specialConfig?.crossTen?.firstTermRange?.allowedValues || [];
    let min = Infinity;
    let max = -Infinity;
    let count = 0;

    firstTermValues.forEach((n1) => {
      getCrossTenSecondTerms(n1).forEach((n2) => {
        const question = buildSubtractionQuestionFromTerms([n1, n2], CARRY_MODES.WITH);
        if (!question) return;
        min = Math.min(min, question.result);
        max = Math.max(max, question.result);
        count += 1;
      });
    });

    return count > 0 ? { min, max, count } : null;
  }

  let min = Infinity;
  let max = -Infinity;
  let count = 0;

  iterateSubtractionRandomQuestions(cfg, (question) => {
    min = Math.min(min, question.result);
    max = Math.max(max, question.result);
    count += 1;
  });

  return count > 0 ? { min, max, count } : null;
}

function getMultiplicationPossibleResultBounds(cfg) {
  const multiplications = cfg?.specific?.multiplications;
  if (!multiplications) return null;

  if (multiplications.profile === MULTIPLICATION_PROFILES.TABLES) {
    return computeRangeFromQuestions(buildMultiplicationTableQuestions(multiplications));
  }

  if (multiplications.profile !== MULTIPLICATION_PROFILES.CALCULATION) {
    return null;
  }

  if (multiplications.generationMode === MULTIPLICATION_GENERATION_MODES.FIXED_LIST) {
    const entries = parseMultiplicationFixedListRaw(multiplications.fixedListRaw).entries || [];
    return computeRangeFromQuestions(entries.map((entry) => buildMultiplicationQuestionFromFactors(entry.terms, CARRY_MODES.BOTH)).filter(Boolean));
  }

  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  iterateMultiplicationCalculationQuestions(multiplications, (question) => {
    min = Math.min(min, question.result);
    max = Math.max(max, question.result);
    count += 1;
  });

  return count > 0 ? { min, max, count } : null;
}

function additionHasAtLeastOnePossibleQuestion(cfg) {
  return Boolean(pickAdditionQuestion(cfg, { avoidKey: null, maxAttempts: 120 }));
}

function subtractionHasAtLeastOnePossibleQuestion(cfg) {
  return Boolean(pickSubtractionQuestion(cfg, { avoidKey: null }));
}

function multiplicationHasAtLeastOnePossibleQuestion(cfg) {
  return Boolean(pickMultiplicationQuestion(cfg, { avoidKey: null }));
}

function pickAdditionQuestion(cfg, {
  avoidKey = null,
  maxAttempts = 240
} = {}) {
  const additions = cfg?.specific?.additions;
  if (!additions) return null;

  if (additions.generationMode === ADDITION_GENERATION_MODES.FIXED_LIST) {
    return pickAdditionFixedListQuestion(cfg, { avoidKey });
  }

  if (additions.generationMode === ADDITION_GENERATION_MODES.SPECIAL) {
    return pickAdditionSpecialQuestion(cfg, { avoidKey });
  }

  if (additions.generationMode !== ADDITION_GENERATION_MODES.RANDOM) {
    return null;
  }

  const termCounts = Array.isArray(additions.termCounts) ? additions.termCounts.filter((value) => Number.isInteger(value)) : [];
  if (!termCounts.length) return null;

  const resultValues = additions.resultConstraint?.enabled
    ? [...(additions.resultConstraint?.range?.allowedValues || [])]
      .filter((value) => value >= GLOBAL_MIN && value <= GLOBAL_MAX)
    : [];

  const fallbackPool = [];

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const termCount = pickRandomFrom(termCounts);
    if (!Number.isInteger(termCount) || termCount < 2) continue;

    const valueLists = getAdditionValueListsForTermCount(additions, termCount);
    if (!valueLists.length || valueLists.some((values) => values.length === 0)) {
      continue;
    }

    let question = null;

    if (resultValues.length > 0) {
      const targetResult = pickRandomFrom(resultValues);
      if (!Number.isFinite(targetResult)) continue;
      const terms = findAdditionTermsForTarget(valueLists, targetResult, additions.carryMode);
      if (!terms) continue;
      question = buildAdditionQuestionFromTerms(terms);
    } else {
      const terms = sampleAdditionTerms(valueLists);
      if (!terms) continue;
      question = buildAdditionQuestionFromTerms(terms);
      if (!question) continue;
      if (!passesCarryRuleForAdditionTerms(terms, additions.carryMode)) continue;
    }

    if (!question) continue;
    if (question.result < GLOBAL_MIN || question.result > GLOBAL_MAX) continue;

    const key = questionKey(question);
    fallbackPool.push(question);

    if (avoidKey && key === avoidKey) {
      continue;
    }

    return question;
  }

  if (!fallbackPool.length) {
    return null;
  }

  const nonAvoided = avoidKey
    ? fallbackPool.filter((question) => questionKey(question) !== avoidKey)
    : fallbackPool;

  if (nonAvoided.length) {
    return pickRandomFrom(nonAvoided);
  }

  return pickRandomFrom(fallbackPool);
}

function pickSubtractionQuestion(cfg, { avoidKey = null } = {}) {
  const subtractions = cfg?.specific?.subtractions;
  if (!subtractions) return null;

  if (subtractions.generationMode === SUBTRACTION_GENERATION_MODES.FIXED_LIST) {
    return pickSubtractionFixedListQuestion(cfg, { avoidKey });
  }

  if (subtractions.generationMode === SUBTRACTION_GENERATION_MODES.SPECIAL) {
    return pickSubtractionSpecialQuestion(cfg, { avoidKey });
  }

  if (subtractions.generationMode !== SUBTRACTION_GENERATION_MODES.RANDOM) {
    return null;
  }

  const resultSet = subtractions.resultConstraint?.enabled
    ? new Set((subtractions.resultConstraint?.range?.allowedValues || []).filter((value) => value >= GLOBAL_MIN && value <= GLOBAL_MAX))
    : null;

  let chosen = null;
  let chosenCount = 0;
  let fallback = null;
  let fallbackCount = 0;

  iterateSubtractionRandomQuestions(cfg, (question) => {
    if (resultSet && !resultSet.has(question.result)) {
      return;
    }

    fallbackCount += 1;
    if (Math.random() < (1 / fallbackCount)) {
      fallback = question;
    }

    if (avoidKey && questionKey(question) === avoidKey) {
      return;
    }

    chosenCount += 1;
    if (Math.random() < (1 / chosenCount)) {
      chosen = question;
    }
  });

  return chosen || fallback;
}

function pickSubtractionFixedListQuestion(cfg, { avoidKey = null } = {}) {
  const entries = parseSubtractionFixedListRaw(cfg?.specific?.subtractions?.fixedListRaw).entries || [];
  const questions = entries
    .map((entry) => buildSubtractionQuestionFromTerms(entry.terms, CARRY_MODES.BOTH))
    .filter(Boolean)
    .filter((question) => question.result >= GLOBAL_MIN && question.result <= GLOBAL_MAX);

  if (!questions.length) return null;

  const candidates = avoidKey
    ? questions.filter((question) => questionKey(question) !== avoidKey)
    : questions;

  if (candidates.length) {
    return pickRandomFrom(candidates);
  }

  return pickRandomFrom(questions);
}

function pickSubtractionSpecialQuestion(cfg, { avoidKey = null } = {}) {
  const firstTermValues = cfg?.specific?.subtractions?.specialConfig?.crossTen?.firstTermRange?.allowedValues || [];
  const questions = [];

  firstTermValues.forEach((n1) => {
    getCrossTenSecondTerms(n1).forEach((n2) => {
      const question = buildSubtractionQuestionFromTerms([n1, n2], CARRY_MODES.WITH);
      if (question) {
        questions.push(question);
      }
    });
  });

  if (!questions.length) return null;

  const candidates = avoidKey
    ? questions.filter((question) => questionKey(question) !== avoidKey)
    : questions;

  if (candidates.length) {
    return pickRandomFrom(candidates);
  }

  return pickRandomFrom(questions);
}

function pickAdditionFixedListQuestion(cfg, { avoidKey = null } = {}) {
  const entries = parseAdditionFixedListRaw(cfg?.specific?.additions?.fixedListRaw).entries || [];
  const questions = entries
    .map((entry) => buildAdditionQuestionFromTerms(entry.terms))
    .filter(Boolean)
    .filter((question) => question.result >= GLOBAL_MIN && question.result <= GLOBAL_MAX);

  if (!questions.length) return null;

  const candidates = avoidKey
    ? questions.filter((question) => questionKey(question) !== avoidKey)
    : questions;

  if (candidates.length) {
    return pickRandomFrom(candidates);
  }

  return pickRandomFrom(questions);
}

function pickAdditionSpecialQuestion(cfg, { avoidKey = null } = {}) {
  const values = cfg?.specific?.additions?.specialConfig?.doubles?.range?.allowedValues || [];
  const questions = values
    .map((value) => buildAdditionQuestionFromTerms([value, value]))
    .filter(Boolean)
    .filter((question) => question.result >= GLOBAL_MIN && question.result <= GLOBAL_MAX);

  if (!questions.length) return null;

  const candidates = avoidKey
    ? questions.filter((question) => questionKey(question) !== avoidKey)
    : questions;

  if (candidates.length) {
    return pickRandomFrom(candidates);
  }

  return pickRandomFrom(questions);
}

function pickMultiplicationQuestion(cfg, { avoidKey = null, sequenceIndex = 0, usedKeys = null } = {}) {
  const multiplications = cfg?.specific?.multiplications;
  if (!multiplications) return null;

  if (multiplications.profile === MULTIPLICATION_PROFILES.TABLES) {
    return pickMultiplicationTableQuestion(multiplications, { avoidKey, sequenceIndex, usedKeys });
  }

  if (multiplications.profile !== MULTIPLICATION_PROFILES.CALCULATION) {
    return null;
  }

  if (multiplications.generationMode === MULTIPLICATION_GENERATION_MODES.FIXED_LIST) {
    return pickMultiplicationFixedListQuestion(multiplications, { avoidKey, usedKeys });
  }

  if (multiplications.generationMode !== MULTIPLICATION_GENERATION_MODES.RANDOM) {
    return null;
  }

  return pickMultiplicationCalculationQuestion(multiplications, { avoidKey, usedKeys });
}

function pickMultiplicationTableQuestion(multiplications, { avoidKey = null, sequenceIndex = 0, usedKeys = null } = {}) {
  const pool = buildMultiplicationTableQuestions(multiplications);
  if (!pool.length) return null;

  if (multiplications.orderMode === MULTIPLICATION_ORDER_MODES.ORDERED) {
    return pool[Math.max(0, Math.floor(Number(sequenceIndex) || 0)) % pool.length] || null;
  }

  return pickQuestionFromPool(pool, { avoidKey, usedKeys });
}

function pickMultiplicationFixedListQuestion(multiplications, { avoidKey = null, usedKeys = null } = {}) {
  const questions = (parseMultiplicationFixedListRaw(multiplications.fixedListRaw).entries || [])
    .map((entry) => buildMultiplicationQuestionFromFactors(entry.terms, CARRY_MODES.BOTH))
    .filter(Boolean);

  return pickQuestionFromPool(questions, { avoidKey, usedKeys });
}

function pickMultiplicationCalculationQuestion(multiplications, { avoidKey = null, usedKeys = null } = {}) {
  const resultSet = multiplications.resultConstraint?.enabled
    ? new Set((multiplications.resultConstraint?.range?.allowedValues || []).filter((value) => value >= GLOBAL_MIN && value <= GLOBAL_MAX))
    : null;

  const pool = [];
  iterateMultiplicationCalculationQuestions(multiplications, (question) => {
    if (resultSet && !resultSet.has(question.result)) return;
    pool.push(question);
  });

  return pickQuestionFromPool(pool, { avoidKey, usedKeys });
}

function pickQuestionFromPool(pool, { avoidKey = null, usedKeys = null } = {}) {
  const questions = Array.isArray(pool) ? pool.filter(Boolean) : [];
  if (!questions.length) return null;

  const used = usedKeys instanceof Set ? usedKeys : null;
  const fresh = used
    ? questions.filter((question) => !used.has(questionKey(question)))
    : questions;
  const preferredBase = fresh.length > 0 ? fresh : questions;
  const preferred = avoidKey
    ? preferredBase.filter((question) => questionKey(question) !== avoidKey)
    : preferredBase;

  if (preferred.length) {
    return pickRandomFrom(preferred);
  }

  return pickRandomFrom(preferredBase);
}

function buildMultiplicationTableQuestions(multiplications) {
  const questions = [];
  const tableSet = new Set(multiplications.tables || []);
  const multiplierSet = new Set(multiplications.multipliers || []);
  const tables = MULTIPLICATION_TABLE_OPTIONS.filter((value) => tableSet.has(value));
  const multipliers = MULTIPLICATION_MULTIPLIER_OPTIONS.filter((value) => multiplierSet.has(value));

  tables.forEach((table) => {
    multipliers.forEach((multiplier) => {
      const question = buildMultiplicationTableQuestion(table, multiplier, multiplications.factorPosition);
      if (question) questions.push(question);
    });
  });

  return questions;
}

function buildMultiplicationTableQuestion(table, multiplier, factorPosition) {
  let n1 = table;
  let n2 = multiplier;

  if (factorPosition === MULTIPLICATION_FACTOR_POSITIONS.SECOND) {
    n1 = multiplier;
    n2 = table;
  } else if (factorPosition === MULTIPLICATION_FACTOR_POSITIONS.BOTH && table !== multiplier && Math.random() < 0.5) {
    n1 = multiplier;
    n2 = table;
  }

  return buildMultiplicationQuestionFromFactors([n1, n2], CARRY_MODES.BOTH);
}

function iterateMultiplicationCalculationQuestions(multiplications, visitor) {
  const f1Values = multiplications.factorRanges?.f1?.allowedValues || [];
  const f2Values = multiplications.factorRanges?.f2?.allowedValues || [];
  if (!f1Values.length || !f2Values.length) return;

  for (const n1 of f1Values) {
    for (const n2 of f2Values) {
      const question = buildMultiplicationQuestionFromFactors([n1, n2], multiplications.carryMode);
      if (!question) continue;
      const result = visitor(question);
      if (result === false) return;
    }
  }
}

function buildMultiplicationQuestionFromFactors(factors, carryMode = CARRY_MODES.BOTH) {
  const safeFactors = Array.isArray(factors)
    ? factors.map((value) => Math.floor(Number(value))).filter((value) => Number.isFinite(value))
    : [];
  if (safeFactors.length !== 2) return null;

  const [n1, n2] = safeFactors;
  const result = n1 * n2;
  if (!Number.isFinite(result) || result < GLOBAL_MIN || result > GLOBAL_MAX) return null;
  if (!passesCarryRuleForMultiplication(n1, n2, carryMode)) return null;

  return {
    operation: OPERATION_TYPES.MULTIPLICATION,
    terms: [n1, n2],
    n1,
    n2,
    result
  };
}

function computeRangeFromQuestions(questions) {
  const safeQuestions = Array.isArray(questions) ? questions : [];
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  safeQuestions.forEach((question) => {
    const result = Number(question?.result);
    if (!Number.isFinite(result)) return;
    min = Math.min(min, result);
    max = Math.max(max, result);
    count += 1;
  });

  return count > 0 ? normalizeComputedResultRange(min, max) : null;
}

function getAdditionValueListsForTermCount(additions, termCount) {
  const lists = [];

  for (let index = 0; index < termCount; index += 1) {
    const range = additions.termSettingsMode === ADDITION_TERM_SETTINGS_MODES.SPECIFIC
      ? additions.termRanges?.[`t${index + 1}`]
      : additions.commonTermRange;
    const values = Array.isArray(range?.allowedValues) ? range.allowedValues : [];
    lists.push(values);
  }

  return lists;
}

function getSubtractionValueLists(subtractions) {
  const firstRange = subtractions.termSettingsMode === SUBTRACTION_TERM_SETTINGS_MODES.SPECIFIC
    ? subtractions.termRanges?.t1
    : subtractions.commonTermRange;
  const secondRange = subtractions.termSettingsMode === SUBTRACTION_TERM_SETTINGS_MODES.SPECIFIC
    ? subtractions.termRanges?.t2
    : subtractions.commonTermRange;

  return [
    Array.isArray(firstRange?.allowedValues) ? firstRange.allowedValues : [],
    Array.isArray(secondRange?.allowedValues) ? secondRange.allowedValues : []
  ];
}

function iterateSubtractionRandomQuestions(cfg, visitor) {
  const subtractions = cfg?.specific?.subtractions;
  if (!subtractions) return;

  const [n1Values, n2Values] = getSubtractionValueLists(subtractions);
  if (!n1Values.length || !n2Values.length) return;

  for (const n1 of n1Values) {
    for (const n2 of n2Values) {
      const question = buildSubtractionQuestionFromTerms([n1, n2], subtractions.carryMode);
      if (!question) continue;
      const result = visitor(question);
      if (result === false) {
        return;
      }
    }
  }
}

function buildSubtractionQuestionFromTerms(terms, carryMode = CARRY_MODES.BOTH) {
  const safeTerms = Array.isArray(terms)
    ? terms.map((value) => Math.floor(Number(value))).filter((value) => Number.isFinite(value))
    : [];

  if (safeTerms.length !== 2) return null;

  const [n1, n2] = safeTerms;
  if (n2 > n1) return null;

  const result = n1 - n2;
  if (!Number.isFinite(result)) return null;
  if (result < GLOBAL_MIN || result > GLOBAL_MAX) return null;
  if (!passesCarryRuleForSubtraction(n1, n2, carryMode)) return null;

  return {
    operation: OPERATION_TYPES.SUBTRACTION,
    terms: [n1, n2],
    n1,
    n2,
    result
  };
}

function getCrossTenSecondTerms(n1) {
  const safeN1 = Math.floor(Number(n1));
  if (!Number.isFinite(safeN1) || safeN1 < 10) {
    return [];
  }

  const units = safeN1 % 10;
  const out = [];

  for (let n2 = Math.max(1, units + 1); n2 <= 9; n2 += 1) {
    if (n2 > safeN1) break;
    out.push(n2);
  }

  return out;
}

function buildAdditionQuestionFromTerms(terms) {
  const safeTerms = Array.isArray(terms)
    ? terms.map((value) => Math.floor(Number(value))).filter((value) => Number.isFinite(value))
    : [];

  if (safeTerms.length < 2) return null;

  const result = safeTerms.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(result)) return null;

  return {
    operation: OPERATION_TYPES.ADDITION,
    terms: safeTerms,
    n1: safeTerms[0],
    n2: safeTerms[1],
    result
  };
}

function sampleAdditionTerms(valueLists) {
  const terms = [];
  for (const values of valueLists) {
    if (!Array.isArray(values) || values.length === 0) {
      return null;
    }
    terms.push(pickRandomFrom(values));
  }
  return terms;
}

function findAdditionTermsForTarget(valueLists, targetResult, carryMode) {
  if (!Array.isArray(valueLists) || valueLists.length < 2) return null;
  if (!Number.isFinite(targetResult)) return null;

  const normalizedLists = valueLists.map((values) => Array.isArray(values) ? [...values] : []);
  if (normalizedLists.some((values) => values.length === 0)) return null;

  const suffixMin = new Array(normalizedLists.length + 1).fill(0);
  const suffixMax = new Array(normalizedLists.length + 1).fill(0);

  for (let index = normalizedLists.length - 1; index >= 0; index -= 1) {
    suffixMin[index] = suffixMin[index + 1] + normalizedLists[index][0];
    suffixMax[index] = suffixMax[index + 1] + normalizedLists[index][normalizedLists[index].length - 1];
  }

  const orderedLists = normalizedLists.map((values) => shuffledCopy(values));

  function visit(index, remaining, terms) {
    if (index === orderedLists.length) {
      if (remaining !== 0) return null;
      if (!passesCarryRuleForAdditionTerms(terms, carryMode)) return null;
      return [...terms];
    }

    const values = orderedLists[index];
    const minAfter = suffixMin[index + 1];
    const maxAfter = suffixMax[index + 1];

    for (const value of values) {
      const nextRemaining = remaining - value;
      if (nextRemaining < minAfter || nextRemaining > maxAfter) {
        continue;
      }

      terms.push(value);
      const found = visit(index + 1, nextRemaining, terms);
      if (found) {
        return found;
      }
      terms.pop();
    }

    return null;
  }

  return visit(0, targetResult, []);
}

function passesCarryRuleForAdditionTerms(terms, carryMode) {
  if (carryMode === CARRY_MODES.BOTH) {
    return true;
  }

  const hasCarry = hasAdditionCarryForTerms(terms);
  if (carryMode === CARRY_MODES.WITH) {
    return hasCarry;
  }
  return !hasCarry;
}

function hasAdditionCarryForTerms(terms) {
  const safeTerms = Array.isArray(terms) ? terms : [];
  const integers = safeTerms
    .map((value) => Math.floor(Math.abs(Number(value) || 0)))
    .filter((value) => Number.isFinite(value));

  let carry = 0;
  let values = [...integers];

  while (values.some((value) => value > 0) || carry > 0) {
    let digitSum = carry;
    values = values.map((value) => {
      digitSum += value % 10;
      return Math.floor(value / 10);
    });

    if (digitSum >= 10) {
      return true;
    }

    carry = Math.floor(digitSum / 10);
  }

  return false;
}

function shuffledCopy(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const otherIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[otherIndex]] = [copy[otherIndex], copy[index]];
  }
  return copy;
}

function pickRandomFrom(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values[Math.floor(Math.random() * values.length)] ?? null;
}

function iterateCandidateQuestions(cfg, visitor) {
  const n1Values = cfg.n1AllowedValues;
  const n2Values = cfg.n2AllowedValues;

  for (const n1 of n1Values) {
    for (const n2 of n2Values) {
      const question = buildQuestion(cfg, n1, n2);
      if (!question) continue;
      const result = visitor(question);
      if (result === false) {
        return;
      }
    }
  }
}

function buildQuestion(cfg, n1, n2) {
  switch (cfg.operation) {
    case OPERATION_TYPES.ADDITION: {
      const result = n1 + n2;
      if (result < GLOBAL_MIN || result > GLOBAL_MAX) return null;
      if (!passesCarryRuleForAddition(n1, n2, cfg.carryMode)) return null;
      return { operation: cfg.operation, n1, n2, result };
    }

    case OPERATION_TYPES.SUBTRACTION: {
      if (n2 > n1) return null;
      const result = n1 - n2;
      if (result < GLOBAL_MIN || result > GLOBAL_MAX) return null;
      if (!passesCarryRuleForSubtraction(n1, n2, cfg.carryMode)) return null;
      return { operation: cfg.operation, n1, n2, result };
    }

    case OPERATION_TYPES.MULTIPLICATION: {
      const result = n1 * n2;
      if (result < GLOBAL_MIN || result > GLOBAL_MAX) return null;
      return { operation: cfg.operation, n1, n2, result };
    }

    case OPERATION_TYPES.DIVISION: {
      if (n2 === 0) return null;
      const quotient = Math.floor(n1 / n2);
      const remainder = n1 % n2;
      if (quotient < GLOBAL_MIN || quotient > GLOBAL_MAX) return null;
      return {
        operation: cfg.operation,
        n1,
        n2,
        result: quotient,
        quotient,
        remainder
      };
    }

    default:
      return null;
  }
}

function passesCarryRuleForAddition(a, b, carryMode) {
  if (carryMode === CARRY_MODES.BOTH) {
    return true;
  }
  if (carryMode === CARRY_MODES.WITH) {
    return hasAdditionCarry(a, b);
  }
  return !hasAdditionCarry(a, b);
}

function passesCarryRuleForSubtraction(a, b, carryMode) {
  if (carryMode === CARRY_MODES.BOTH) {
    return true;
  }
  if (carryMode === CARRY_MODES.WITH) {
    return hasSubtractionBorrow(a, b);
  }
  return !hasSubtractionBorrow(a, b);
}

function passesCarryRuleForMultiplication(a, b, carryMode) {
  if (carryMode === CARRY_MODES.BOTH) {
    return true;
  }
  const hasCarry = hasMultiplicationCarry(a, b);
  if (carryMode === CARRY_MODES.WITH) {
    return hasCarry;
  }
  return !hasCarry;
}

function hasAdditionCarry(a, b) {
  let carry = 0;
  let x = Math.floor(Math.abs(a));
  let y = Math.floor(Math.abs(b));

  while (x > 0 || y > 0 || carry > 0) {
    const da = x % 10;
    const db = y % 10;
    const sum = da + db + carry;
    if (sum >= 10) {
      return true;
    }
    carry = sum >= 10 ? 1 : 0;
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }

  return false;
}

function hasMultiplicationCarry(a, b) {
  const multiplicand = Math.floor(Math.abs(Number(a) || 0));
  let multiplier = Math.floor(Math.abs(Number(b) || 0));

  if (!Number.isFinite(multiplicand) || !Number.isFinite(multiplier)) return false;
  if (multiplicand === 0 || multiplier === 0) return false;

  while (multiplier > 0) {
    const multiplierDigit = multiplier % 10;
    let rest = multiplicand;
    let carry = 0;

    while (rest > 0) {
      const digit = rest % 10;
      const product = digit * multiplierDigit + carry;
      if (product >= 10) {
        return true;
      }
      carry = Math.floor(product / 10);
      rest = Math.floor(rest / 10);
    }

    if (carry > 0) {
      return true;
    }

    multiplier = Math.floor(multiplier / 10);
  }

  return false;
}

function hasSubtractionBorrow(a, b) {
  let borrow = 0;
  let x = Math.floor(Math.abs(a));
  let y = Math.floor(Math.abs(b));

  while (x > 0 || y > 0) {
    let da = x % 10;
    const db = y % 10;

    da -= borrow;
    if (da < db) {
      return true;
    }

    borrow = 0;
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }

  return false;
}

function createDefaultRange(min, max) {
  return {
    min,
    max,
    mode: "simple",
    start: min,
    step: 1,
    values: []
  };
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
