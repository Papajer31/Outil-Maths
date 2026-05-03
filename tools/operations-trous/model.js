import { normalizeNumericConstraint } from "../../shared/value-constraints.js";

export const OPERATION_TYPES = {
  ADDITION: "addition",
  SUBTRACTION: "subtraction",
  MULTIPLICATION: "multiplication"
};

export const GENERATION_MODES = {
  RANDOM: "random",
  FIXED_LIST: "fixed_list"
};

export const CARRY_MODES = {
  WITHOUT: "without_carry",
  WITH: "with_carry",
  BOTH: "both"
};

export const HOLE_POSITIONS = {
  FIRST: "first_term",
  SECOND: "second_term",
  BOTH: "both"
};

export const TERM_SETTINGS_MODES = {
  COMMON: "common",
  SPECIFIC: "specific"
};

const GLOBAL_MIN = 0;
const GLOBAL_MAX = 999;
const DEFAULT_TERM_MAX = 99;
const DEFAULT_MULTIPLICATION_TERM_MAX = 10;
const RANDOM_PICK_MAX_ATTEMPTS = 360;

export function getDefaultSettings() {
  return {
    operation: "",
    specific: {
      additions: getDefaultBranchSettings({ withCarry: true, defaultMax: DEFAULT_TERM_MAX }),
      subtractions: getDefaultBranchSettings({ withCarry: true, defaultMax: DEFAULT_TERM_MAX }),
      multiplications: getDefaultBranchSettings({ withCarry: false, defaultMax: DEFAULT_MULTIPLICATION_TERM_MAX, resultMax: 100 })
    }
  };
}

function getDefaultBranchSettings({ withCarry = true, defaultMax = DEFAULT_TERM_MAX, resultMax = GLOBAL_MAX } = {}) {
  return {
    generationMode: "",
    carryMode: withCarry ? CARRY_MODES.BOTH : CARRY_MODES.BOTH,
    holePosition: HOLE_POSITIONS.BOTH,
    termSettingsMode: TERM_SETTINGS_MODES.COMMON,
    commonTermRange: createDefaultRange(0, defaultMax),
    termRanges: {
      t1: createDefaultRange(0, defaultMax),
      t2: createDefaultRange(0, defaultMax)
    },
    resultConstraint: {
      enabled: false,
      range: createDefaultRange(0, resultMax)
    },
    fixedListRaw: ""
  };
}

export function normalizeSettings(settings = {}) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };
  const specific = isPlainObject(base.specific) ? base.specific : {};

  return {
    operation: normalizeOperation(base.operation),
    specific: {
      additions: normalizeAdditionsSettings(specific.additions),
      subtractions: normalizeSubtractionsSettings(specific.subtractions),
      multiplications: normalizeMultiplicationsSettings(specific.multiplications)
    }
  };
}

export function normalizeAdditionsSettings(raw = {}) {
  return normalizeBranchSettings(raw, {
    withCarry: true,
    defaultMax: DEFAULT_TERM_MAX,
    resultMax: GLOBAL_MAX
  });
}

export function normalizeSubtractionsSettings(raw = {}) {
  return normalizeBranchSettings(raw, {
    withCarry: true,
    defaultMax: DEFAULT_TERM_MAX,
    resultMax: GLOBAL_MAX
  });
}

export function normalizeMultiplicationsSettings(raw = {}) {
  return normalizeBranchSettings(raw, {
    withCarry: false,
    defaultMax: DEFAULT_MULTIPLICATION_TERM_MAX,
    resultMax: 100
  });
}

function normalizeBranchSettings(raw = {}, {
  withCarry = true,
  defaultMax = DEFAULT_TERM_MAX,
  resultMax = GLOBAL_MAX
} = {}) {
  const base = {
    ...getDefaultBranchSettings({ withCarry, defaultMax, resultMax }),
    ...(raw ?? {})
  };
  const termRanges = isPlainObject(base.termRanges) ? base.termRanges : {};
  const resultConstraint = isPlainObject(base.resultConstraint) ? base.resultConstraint : {};

  return {
    generationMode: normalizeGenerationMode(base.generationMode),
    carryMode: normalizeCarryMode(base.carryMode),
    holePosition: normalizeHolePosition(base.holePosition),
    termSettingsMode: normalizeTermSettingsMode(base.termSettingsMode),
    commonTermRange: normalizeRange(base.commonTermRange, {
      defaultMin: 0,
      defaultMax
    }),
    termRanges: {
      t1: normalizeRange(termRanges.t1, {
        defaultMin: 0,
        defaultMax
      }),
      t2: normalizeRange(termRanges.t2, {
        defaultMin: 0,
        defaultMax
      })
    },
    resultConstraint: {
      enabled: resultConstraint.enabled === true,
      range: normalizeRange(resultConstraint.range, {
        defaultMin: 0,
        defaultMax: resultMax
      })
    },
    fixedListRaw: String(base.fixedListRaw ?? "")
  };
}

export function parseAdditionFixedListRaw(rawText) {
  return parseFixedListRaw(rawText, OPERATION_TYPES.ADDITION);
}

export function parseSubtractionFixedListRaw(rawText) {
  return parseFixedListRaw(rawText, OPERATION_TYPES.SUBTRACTION);
}

export function parseMultiplicationFixedListRaw(rawText) {
  return parseFixedListRaw(rawText, OPERATION_TYPES.MULTIPLICATION);
}

function parseFixedListRaw(rawText, operation) {
  const rawLines = String(rawText ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const entries = [];
  const invalidLineNumbers = [];

  rawLines.forEach((line, index) => {
    const parsed = parseFixedListLine(line, operation);
    if (parsed == null) return;
    if (parsed.valid) {
      entries.push(parsed.entry);
    } else {
      invalidLineNumbers.push(index + 1);
    }
  });

  return { entries, invalidLineNumbers };
}

function parseFixedListLine(line, operation) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return null;

  const parts = trimmed.split("=");
  if (parts.length > 2) return { valid: false };

  const leftRaw = String(parts[0] ?? "").trim();
  const rightRaw = parts[1] == null ? null : String(parts[1] ?? "").trim();
  if (!leftRaw) return { valid: false };

  const operatorPattern = getOperatorPattern(operation);
  const leftParts = leftRaw.split(operatorPattern).map((part) => part.trim());
  if (leftParts.length !== 2) return { valid: false };

  const [n1Raw, n2Raw] = leftParts;
  if (!/^\d+$/.test(n1Raw) || !/^\d+$/.test(n2Raw)) return { valid: false };

  const n1 = Number(n1Raw);
  const n2 = Number(n2Raw);
  if (!Number.isSafeInteger(n1) || !Number.isSafeInteger(n2)) return { valid: false };

  const result = computeResult(operation, n1, n2);
  if (!Number.isFinite(result) || result < GLOBAL_MIN || result > GLOBAL_MAX) return { valid: false };
  if (operation === OPERATION_TYPES.SUBTRACTION && n2 > n1) return { valid: false };

  if (rightRaw != null) {
    if (!/^\d+$/.test(rightRaw)) return { valid: false };
    if (Number(rightRaw) !== result) return { valid: false };
  }

  return {
    valid: true,
    entry: buildBaseQuestion(operation, n1, n2)
  };
}

function getOperatorPattern(operation) {
  if (operation === OPERATION_TYPES.ADDITION) return /\+/;
  if (operation === OPERATION_TYPES.SUBTRACTION) return /-/;
  return /(?:×|x|X|\*)/;
}

export function computeAdditionsResultRange(raw = {}) {
  return computeBranchResultRange(OPERATION_TYPES.ADDITION, normalizeAdditionsSettings(raw));
}

export function computeSubtractionsResultRange(raw = {}) {
  return computeBranchResultRange(OPERATION_TYPES.SUBTRACTION, normalizeSubtractionsSettings(raw));
}

export function computeMultiplicationsResultRange(raw = {}) {
  return computeBranchResultRange(OPERATION_TYPES.MULTIPLICATION, normalizeMultiplicationsSettings(raw));
}

function computeBranchResultRange(operation, branch) {
  if (branch.generationMode === GENERATION_MODES.FIXED_LIST) {
    const entries = getFixedListEntries(operation, branch.fixedListRaw);
    return computeRangeFromQuestions(entries);
  }

  if (branch.generationMode !== GENERATION_MODES.RANDOM) {
    return null;
  }

  const [t1Values, t2Values] = getValueLists(branch);
  if (!t1Values.length || !t2Values.length) return null;

  if (operation === OPERATION_TYPES.ADDITION && branch.carryMode === CARRY_MODES.BOTH) {
    return normalizeComputedResultRange(t1Values[0] + t2Values[0], last(t1Values) + last(t2Values));
  }

  if (operation === OPERATION_TYPES.MULTIPLICATION) {
    return normalizeComputedResultRange(t1Values[0] * t2Values[0], last(t1Values) * last(t2Values));
  }

  let min = Infinity;
  let max = -Infinity;
  let count = 0;

  iterateBaseQuestions(operation, branch, (question) => {
    min = Math.min(min, question.result);
    max = Math.max(max, question.result);
    count += 1;
  });

  return count > 0 ? normalizeComputedResultRange(min, max) : null;
}

export function hasAtLeastOnePossibleOperation(settings) {
  try {
    return Boolean(pickQuestion(settings));
  } catch {
    return false;
  }
}

export function pickQuestion(settings, { avoidKey = null } = {}) {
  const cfg = normalizeSettings(settings);
  const branch = getBranchSettings(cfg);
  if (!branch) throw new Error(getImpossibleMessage(cfg));

  let question = null;

  if (branch.generationMode === GENERATION_MODES.FIXED_LIST) {
    question = pickFixedListQuestion(cfg.operation, branch, { avoidKey });
  } else if (branch.generationMode === GENERATION_MODES.RANDOM) {
    question = pickRandomQuestion(cfg.operation, branch, { avoidKey });
  }

  if (!question) throw new Error(getImpossibleMessage(cfg));
  return question;
}

function pickFixedListQuestion(operation, branch, { avoidKey = null } = {}) {
  const entries = getFixedListEntries(operation, branch.fixedListRaw)
    .map((entry) => applyHolePosition(entry, branch.holePosition))
    .filter(Boolean);

  if (!entries.length) return null;

  const candidates = avoidKey
    ? entries.filter((entry) => questionKey(entry) !== avoidKey)
    : entries;

  return pickRandomFrom(candidates.length ? candidates : entries);
}

function pickRandomQuestion(operation, branch, { avoidKey = null } = {}) {
  const resultSet = branch.resultConstraint?.enabled
    ? new Set((branch.resultConstraint?.range?.allowedValues || []).filter((value) => value >= GLOBAL_MIN && value <= GLOBAL_MAX))
    : null;

  let chosen = null;
  let chosenCount = 0;
  let fallback = null;
  let fallbackCount = 0;

  const tryQuestion = (baseQuestion) => {
    if (!baseQuestion) return;
    if (resultSet && !resultSet.has(baseQuestion.result)) return;

    const question = applyHolePosition(baseQuestion, branch.holePosition);
    if (!question) return;

    fallbackCount += 1;
    if (Math.random() < (1 / fallbackCount)) fallback = question;

    if (avoidKey && questionKey(question) === avoidKey) return;

    chosenCount += 1;
    if (Math.random() < (1 / chosenCount)) chosen = question;
  };

  const [t1Values, t2Values] = getValueLists(branch);
  const candidateSpaceSize = t1Values.length * t2Values.length;

  if (candidateSpaceSize > 0 && candidateSpaceSize <= 120000) {
    iterateBaseQuestions(operation, branch, tryQuestion);
    return chosen || fallback;
  }

  for (let attempt = 0; attempt < RANDOM_PICK_MAX_ATTEMPTS; attempt += 1) {
    const n1 = pickRandomFrom(t1Values);
    const n2 = pickRandomFrom(t2Values);
    const baseQuestion = buildFilteredBaseQuestion(operation, n1, n2, branch);
    tryQuestion(baseQuestion);
    if (chosen && attempt > 30) break;
  }

  return chosen || fallback;
}

function getFixedListEntries(operation, rawText) {
  if (operation === OPERATION_TYPES.ADDITION) return parseAdditionFixedListRaw(rawText).entries || [];
  if (operation === OPERATION_TYPES.SUBTRACTION) return parseSubtractionFixedListRaw(rawText).entries || [];
  return parseMultiplicationFixedListRaw(rawText).entries || [];
}

function iterateBaseQuestions(operation, branch, visitor) {
  const [t1Values, t2Values] = getValueLists(branch);
  if (!t1Values.length || !t2Values.length) return;

  for (const n1 of t1Values) {
    for (const n2 of t2Values) {
      const question = buildFilteredBaseQuestion(operation, n1, n2, branch);
      if (!question) continue;
      const result = visitor(question);
      if (result === false) return;
    }
  }
}

function buildFilteredBaseQuestion(operation, n1, n2, branch) {
  const question = buildBaseQuestion(operation, n1, n2);
  if (!question) return null;

  if (operation === OPERATION_TYPES.ADDITION && !passesCarryRuleForAddition(n1, n2, branch.carryMode)) {
    return null;
  }

  if (operation === OPERATION_TYPES.SUBTRACTION && !passesCarryRuleForSubtraction(n1, n2, branch.carryMode)) {
    return null;
  }

  return question;
}

function buildBaseQuestion(operation, n1, n2) {
  const a = Math.floor(Number(n1));
  const b = Math.floor(Number(n2));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  if (a < GLOBAL_MIN || b < GLOBAL_MIN) return null;

  const result = computeResult(operation, a, b);
  if (!Number.isFinite(result) || result < GLOBAL_MIN || result > GLOBAL_MAX) return null;

  if (operation === OPERATION_TYPES.SUBTRACTION && b > a) return null;

  return {
    operation,
    terms: [a, b],
    n1: a,
    n2: b,
    result,
    operatorSymbol: getOperatorSymbol(operation)
  };
}

function applyHolePosition(question, holePosition) {
  if (!question) return null;

  const safeHolePosition = normalizeHolePosition(holePosition);
  const missingIndex = safeHolePosition === HOLE_POSITIONS.BOTH
    ? Math.floor(Math.random() * 2)
    : safeHolePosition === HOLE_POSITIONS.SECOND
      ? 1
      : 0;
  const missingValue = question.terms?.[missingIndex];
  if (!Number.isFinite(missingValue)) return null;

  return {
    ...question,
    missingIndex,
    missingValue,
    holePosition: safeHolePosition
  };
}

function computeResult(operation, n1, n2) {
  if (operation === OPERATION_TYPES.ADDITION) return n1 + n2;
  if (operation === OPERATION_TYPES.SUBTRACTION) return n1 - n2;
  if (operation === OPERATION_TYPES.MULTIPLICATION) return n1 * n2;
  return NaN;
}

function getOperatorSymbol(operation) {
  if (operation === OPERATION_TYPES.ADDITION) return "+";
  if (operation === OPERATION_TYPES.SUBTRACTION) return "−";
  return "×";
}

export function questionKey(question) {
  return [
    question?.operation || "",
    Array.isArray(question?.terms) ? question.terms.join(",") : "",
    question?.result ?? "",
    question?.missingIndex ?? ""
  ].join("|");
}

export function getImpossibleMessage(settings) {
  const cfg = normalizeSettings(settings);
  const branch = getBranchSettings(cfg);

  if (branch?.generationMode === GENERATION_MODES.FIXED_LIST) {
    if (cfg.operation === OPERATION_TYPES.ADDITION) return "Aucune addition valide dans la liste fixe.";
    if (cfg.operation === OPERATION_TYPES.SUBTRACTION) return "Aucune soustraction valide dans la liste fixe.";
    return "Aucune multiplication valide dans la liste fixe.";
  }

  if (cfg.operation === OPERATION_TYPES.ADDITION) {
    if (branch?.carryMode === CARRY_MODES.WITH) return "Aucune addition à trou avec retenue possible avec ces réglages.";
    if (branch?.carryMode === CARRY_MODES.WITHOUT) return "Aucune addition à trou sans retenue possible avec ces réglages.";
    return "Aucune addition à trou possible avec ces réglages.";
  }

  if (cfg.operation === OPERATION_TYPES.SUBTRACTION) {
    if (branch?.carryMode === CARRY_MODES.WITH) return "Aucune soustraction à trou avec retenue possible avec ces réglages.";
    if (branch?.carryMode === CARRY_MODES.WITHOUT) return "Aucune soustraction à trou sans retenue possible avec ces réglages.";
    return "Aucune soustraction à trou possible avec ces réglages.";
  }

  return "Aucune multiplication à trou possible avec ces réglages.";
}

export function formatQuestion(question) {
  if (!question) return "";
  const first = question.missingIndex === 0 ? "□" : String(question.terms?.[0] ?? "");
  const second = question.missingIndex === 1 ? "□" : String(question.terms?.[1] ?? "");
  return `${first} ${question.operatorSymbol || getOperatorSymbol(question.operation)} ${second} = ${question.result}`;
}

export function formatAnswer(question) {
  if (!question) return "";
  return `${question.terms?.[0] ?? ""} ${question.operatorSymbol || getOperatorSymbol(question.operation)} ${question.terms?.[1] ?? ""} = ${question.result}`;
}

export function formatAnswerValue(question) {
  return String(question?.missingValue ?? "");
}

function getBranchSettings(cfg) {
  if (cfg.operation === OPERATION_TYPES.ADDITION) return cfg.specific?.additions;
  if (cfg.operation === OPERATION_TYPES.SUBTRACTION) return cfg.specific?.subtractions;
  if (cfg.operation === OPERATION_TYPES.MULTIPLICATION) return cfg.specific?.multiplications;
  return null;
}

function getValueLists(branch) {
  const firstRange = branch.termSettingsMode === TERM_SETTINGS_MODES.SPECIFIC
    ? branch.termRanges?.t1
    : branch.commonTermRange;
  const secondRange = branch.termSettingsMode === TERM_SETTINGS_MODES.SPECIFIC
    ? branch.termRanges?.t2
    : branch.commonTermRange;

  return [
    Array.isArray(firstRange?.allowedValues) ? firstRange.allowedValues : [],
    Array.isArray(secondRange?.allowedValues) ? secondRange.allowedValues : []
  ];
}

function computeRangeFromQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) return null;
  let min = Infinity;
  let max = -Infinity;
  questions.forEach((question) => {
    if (!Number.isFinite(question?.result)) return;
    min = Math.min(min, question.result);
    max = Math.max(max, question.result);
  });
  return Number.isFinite(min) && Number.isFinite(max)
    ? normalizeComputedResultRange(min, max)
    : null;
}

function normalizeComputedResultRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  const lower = Math.max(GLOBAL_MIN, Math.min(GLOBAL_MAX, Math.floor(min)));
  const upper = Math.max(GLOBAL_MIN, Math.min(GLOBAL_MAX, Math.floor(max)));
  return {
    min: Math.min(lower, upper),
    max: Math.max(lower, upper)
  };
}

function normalizeOperation(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (Object.values(OPERATION_TYPES).includes(safeValue)) return safeValue;
  return OPERATION_TYPES.ADDITION;
}

function normalizeGenerationMode(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (Object.values(GENERATION_MODES).includes(safeValue)) return safeValue;
  return "";
}

function normalizeCarryMode(value) {
  if (value === CARRY_MODES.WITH) return CARRY_MODES.WITH;
  if (value === CARRY_MODES.WITHOUT) return CARRY_MODES.WITHOUT;
  return CARRY_MODES.BOTH;
}

function normalizeHolePosition(value) {
  if (value === HOLE_POSITIONS.FIRST) return HOLE_POSITIONS.FIRST;
  if (value === HOLE_POSITIONS.SECOND) return HOLE_POSITIONS.SECOND;
  return HOLE_POSITIONS.BOTH;
}

function normalizeTermSettingsMode(value) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (safeValue === TERM_SETTINGS_MODES.SPECIFIC) return TERM_SETTINGS_MODES.SPECIFIC;
  return TERM_SETTINGS_MODES.COMMON;
}

function normalizeRange(rawRange, {
  defaultMin = 0,
  defaultMax = DEFAULT_TERM_MAX
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

function passesCarryRuleForAddition(a, b, carryMode) {
  if (carryMode === CARRY_MODES.BOTH) return true;
  const hasCarry = hasAdditionCarry(a, b);
  return carryMode === CARRY_MODES.WITH ? hasCarry : !hasCarry;
}

function passesCarryRuleForSubtraction(a, b, carryMode) {
  if (carryMode === CARRY_MODES.BOTH) return true;
  const hasBorrow = hasSubtractionBorrow(a, b);
  return carryMode === CARRY_MODES.WITH ? hasBorrow : !hasBorrow;
}

function hasAdditionCarry(a, b) {
  let carry = 0;
  let x = Math.floor(Math.abs(Number(a) || 0));
  let y = Math.floor(Math.abs(Number(b) || 0));

  while (x > 0 || y > 0 || carry > 0) {
    const da = x % 10;
    const db = y % 10;
    const sum = da + db + carry;
    if (sum >= 10) return true;
    carry = Math.floor(sum / 10);
    x = Math.floor(x / 10);
    y = Math.floor(y / 10);
  }

  return false;
}

function hasSubtractionBorrow(a, b) {
  let borrow = 0;
  let x = Math.floor(Math.abs(Number(a) || 0));
  let y = Math.floor(Math.abs(Number(b) || 0));

  while (x > 0 || y > 0) {
    let da = x % 10;
    const db = y % 10;
    da -= borrow;
    if (da < db) return true;
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

function pickRandomFrom(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values[Math.floor(Math.random() * values.length)] ?? null;
}

function last(values) {
  return values[values.length - 1];
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
