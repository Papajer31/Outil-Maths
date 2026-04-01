import { normalizeNumericConstraint } from "../../../../shared/value-constraints.js";

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

const GLOBAL_MIN = 0;
const GLOBAL_MAX = 999;

export function getDefaultSettings() {
  return {
    operation: OPERATION_TYPES.ADDITION,
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
    resultList: []
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
    resultAllowedValues: resultConstraint.allowedValues
  };
}

export function getPossibleResultBounds(settings) {
  const cfg = normalizeSettings(settings);
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

export function hasAtLeastOnePossibleOperation(settings) {
  const cfg = normalizeSettings(settings);
  const resultSet = new Set(cfg.resultAllowedValues);
  let found = false;

  iterateCandidateQuestions(cfg, (question) => {
    if (!resultSet.has(question.result)) return;
    found = true;
    return false;
  });

  return found;
}

export function pickQuestion(settings, { avoidKey = null } = {}) {
  const cfg = normalizeSettings(settings);
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
  return [
    question?.operation || "",
    question?.n1 ?? "",
    question?.n2 ?? "",
    question?.result ?? "",
    question?.remainder ?? ""
  ].join("|");
}

export function getImpossibleMessage(settings) {
  const cfg = normalizeSettings(settings);

  switch (cfg.operation) {
    case OPERATION_TYPES.ADDITION:
      if (cfg.carryMode === CARRY_MODES.WITH) {
        return "Aucune addition avec retenue possible avec ces réglages.";
      }
      if (cfg.carryMode === CARRY_MODES.BOTH) {
        return "Aucune addition possible avec ces réglages.";
      }
      return "Aucune addition sans retenue possible avec ces réglages.";
    case OPERATION_TYPES.SUBTRACTION:
      if (cfg.carryMode === CARRY_MODES.WITH) {
        return "Aucune soustraction avec retenue possible avec ces réglages.";
      }
      if (cfg.carryMode === CARRY_MODES.BOTH) {
        return "Aucune soustraction possible avec ces réglages.";
      }
      return "Aucune soustraction sans retenue possible avec ces réglages.";
    case OPERATION_TYPES.MULTIPLICATION:
      return "Aucune multiplication possible avec ces réglages.";
    case OPERATION_TYPES.DIVISION:
      return "Aucune division euclidienne possible avec ces réglages.";
    default:
      return "Aucune opération possible avec ces réglages.";
  }
}

function normalizeOperation(value) {
  const safeValue = String(value || "").toLowerCase();
  if (Object.values(OPERATION_TYPES).includes(safeValue)) {
    return safeValue;
  }
  return OPERATION_TYPES.ADDITION;
}

function normalizeCarryMode(value) {
  if (value === CARRY_MODES.WITH) return CARRY_MODES.WITH;
  if (value === CARRY_MODES.BOTH) return CARRY_MODES.BOTH;
  return CARRY_MODES.WITHOUT;
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
