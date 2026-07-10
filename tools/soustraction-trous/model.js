import { constraintContainsValue, normalizeNumericConstraint, pickValueFromConstraint } from "../../shared/value-constraints.js";
import { formatIntegerForDisplay, parseIntegerLike } from "../../shared/tool-ui/number-format.js";

export const GENERATION_MODES = Object.freeze({
  RANDOM: "random",
  FIXED_LIST: "fixed_list"
});

export const CARRY_MODES = Object.freeze({
  WITHOUT: "without_carry",
  WITH: "with_carry",
  BOTH: "both"
});

export const HOLE_POSITIONS = Object.freeze({
  FIRST: "first_term",
  SECOND: "second_term",
  BOTH: "both"
});

export const SUBTRACTION_HOLE_LIMITS = Object.freeze({
  valueMin: 0,
  valueMax: 999999,
  defaultFirstMax: 99,
  defaultSecondMax: 99,
  resultMin: 0,
  resultMax: 999999
});

export function getDefaultSettings() {
  return {
    generationMode: GENERATION_MODES.RANDOM,
    carryMode: CARRY_MODES.BOTH,
    holePosition: HOLE_POSITIONS.SECOND,
    termRanges: {
      t1: createDefaultRange(0, SUBTRACTION_HOLE_LIMITS.defaultFirstMax),
      t2: createDefaultRange(0, SUBTRACTION_HOLE_LIMITS.defaultSecondMax)
    },
    resultConstraint: {
      enabled: false,
      range: createDefaultRange(0, SUBTRACTION_HOLE_LIMITS.resultMax)
    },
    fixedListRaw: ""
  };
}

export function normalizeSettings(settings = {}) {
  const defaults = getDefaultSettings();
  const base = { ...defaults, ...(isPlainObject(settings) ? settings : {}) };
  const ranges = isPlainObject(base.termRanges) ? base.termRanges : {};
  const resultConstraint = isPlainObject(base.resultConstraint) ? base.resultConstraint : {};

  return {
    generationMode: normalizeGenerationMode(base.generationMode),
    carryMode: normalizeCarryMode(base.carryMode),
    holePosition: normalizeHolePosition(base.holePosition),
    termRanges: {
      t1: normalizeValueRange(ranges.t1, { defaultMin: 0, defaultMax: SUBTRACTION_HOLE_LIMITS.defaultFirstMax }),
      t2: normalizeValueRange(ranges.t2, { defaultMin: 0, defaultMax: SUBTRACTION_HOLE_LIMITS.defaultSecondMax })
    },
    resultConstraint: {
      enabled: resultConstraint.enabled === true,
      range: normalizeResultRange(resultConstraint.range, {
        defaultMin: SUBTRACTION_HOLE_LIMITS.resultMin,
        defaultMax: SUBTRACTION_HOLE_LIMITS.resultMax
      })
    },
    fixedListRaw: String(base.fixedListRaw ?? "")
  };
}

export function hasAtLeastOneQuestion(settings = {}) {
  return Boolean(buildQuestionPool(settings, { maxQuestions: 240 }).length);
}

export function getImpossibleMessage(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.generationMode === GENERATION_MODES.RANDOM) {
    const structuralMessage = getRandomStructuralImpossibleMessage(cfg);
    if (structuralMessage) return structuralMessage;
    if (cfg.carryMode === CARRY_MODES.WITH) return "Aucune soustraction à trou avec retenue possible avec ces réglages.";
    if (cfg.carryMode === CARRY_MODES.WITHOUT) return "Aucune soustraction à trou sans retenue possible avec ces réglages.";
    return "Aucune soustraction à trou possible avec ces réglages.";
  }

  const parsed = parseFixedListRaw(cfg.fixedListRaw);
  if (parsed.invalidLineNumbers.length) {
    return `Liste fixe : ligne(s) invalide(s) ${parsed.invalidLineNumbers.join(", ")}.`;
  }
  return "Aucune soustraction à trou possible : la liste fixe ne contient aucun calcul valide.";
}

export function pickQuestion(settings = {}, { avoidKey = null, usedKeys = null } = {}) {
  const cfg = normalizeSettings(settings);
  const pool = buildQuestionPool(cfg, { maxQuestions: 360 });
  if (!pool.length) throw new Error(getImpossibleMessage(cfg));
  return pickQuestionFromPool(pool, { avoidKey, usedKeys });
}

export function buildQuestionPool(settings = {}, { maxQuestions = 500 } = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.generationMode === GENERATION_MODES.FIXED_LIST) {
    return parseFixedListRaw(cfg.fixedListRaw).entries
      .map((entry) => buildQuestionFromValues(entry.first, entry.second))
      .filter(Boolean)
      .filter((question) => passesQuestionRules(question, cfg))
      .map((question) => applyHolePosition(question, cfg.holePosition))
      .filter(Boolean);
  }
  return buildRandomQuestionPool(cfg, { maxQuestions });
}

export function questionKey(question) {
  return [
    "soustraction-trous",
    Array.isArray(question?.terms) ? question.terms.join(",") : "",
    question?.result ?? "",
    question?.missingIndex ?? ""
  ].join("|");
}

export function formatQuestion(question) {
  if (!question) return "";
  const first = question.missingIndex === 0 ? "□" : formatIntegerForDisplay(question.terms?.[0] ?? "");
  const second = question.missingIndex === 1 ? "□" : formatIntegerForDisplay(question.terms?.[1] ?? "");
  return `${first} ${question.operatorSymbol || "−"} ${second} = ${formatIntegerForDisplay(question.result)}`;
}

export function formatAnswer(question) {
  if (!question) return "";
  return `${formatIntegerForDisplay(question.terms?.[0] ?? "")} ${question.operatorSymbol || "−"} ${formatIntegerForDisplay(question.terms?.[1] ?? "")} = ${formatIntegerForDisplay(question.result)}`;
}

export function formatAnswerValue(question) {
  return String(question?.missingValue ?? "");
}

export function parseFixedListRaw(rawText) {
  const rawLines = String(rawText ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const entries = [];
  const invalidLineNumbers = [];
  rawLines.forEach((line, index) => {
    const parsed = parseFixedListLine(line);
    if (parsed == null) return;
    if (parsed.valid) entries.push(parsed.entry);
    else invalidLineNumbers.push(index + 1);
  });
  return { entries, invalidLineNumbers };
}

function getRandomStructuralImpossibleMessage(cfg) {
  const firstRange = cfg?.termRanges?.t1;
  const secondRange = cfg?.termRanges?.t2;
  if (!firstRange?.valueCount || !secondRange?.valueCount) {
    return "Aucune soustraction à trou possible : au moins une plage de termes ne contient aucune valeur.";
  }

  if (Math.floor(Number(firstRange.max) || 0) < Math.floor(Number(secondRange.min) || 0)) {
    return `Configuration impossible : le plus grand premier terme possible est ${formatIntegerForDisplay(firstRange.max)}, mais le second terme commence à ${formatIntegerForDisplay(secondRange.min)}.`;
  }

  return "";
}

function buildRandomQuestionPool(cfg, { maxQuestions = 500 } = {}) {
  const questions = [];
  if (getRandomStructuralImpossibleMessage(cfg)) return questions;

  const seen = new Set();
  const attempts = Math.max(80, Math.min(5000, Number(maxQuestions) * 18));
  const firstRange = cfg.termRanges.t1;
  const secondRange = cfg.termRanges.t2;

  if (!firstRange?.valueCount || !secondRange?.valueCount) return questions;

  for (let attempt = 0; attempt < attempts && questions.length < maxQuestions; attempt += 1) {
    const question = buildQuestionFromValues(pickValueFromConstraint(firstRange), pickValueFromConstraint(secondRange));
    if (!question) continue;
    if (!passesQuestionRules(question, cfg)) continue;
    const withHole = applyHolePosition(question, cfg.holePosition);
    if (!withHole) continue;
    const key = questionKey(withHole);
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(withHole);
  }
  return questions;
}

function buildQuestionFromValues(first, second) {
  const safeFirst = Math.floor(Number(first));
  const safeSecond = Math.floor(Number(second));
  if (!Number.isFinite(safeFirst) || !Number.isFinite(safeSecond)) return null;
  if (safeFirst < SUBTRACTION_HOLE_LIMITS.valueMin || safeFirst > SUBTRACTION_HOLE_LIMITS.valueMax) return null;
  if (safeSecond < SUBTRACTION_HOLE_LIMITS.valueMin || safeSecond > SUBTRACTION_HOLE_LIMITS.valueMax) return null;

  const result = computeResult(safeFirst, safeSecond);
  if (!Number.isFinite(result) || result < SUBTRACTION_HOLE_LIMITS.resultMin || result > SUBTRACTION_HOLE_LIMITS.resultMax) return null;
  if (safeSecond > safeFirst) return null;

  return {
    tool: "soustraction-trous",
    operation: "subtraction",
    terms: [safeFirst, safeSecond],
    n1: safeFirst,
    n2: safeSecond,
    result,
    operatorSymbol: "−"
  };
}

function passesQuestionRules(question, cfg) {
  if (!question) return false;
  if (!passesCarryRule(question.terms?.[0], question.terms?.[1], cfg.carryMode)) return false;
  if (!cfg.resultConstraint.enabled) return true;
  return constraintContainsValue(cfg.resultConstraint.range, question.result);
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
  return { ...question, missingIndex, missingValue, holePosition: safeHolePosition };
}

function computeResult(first, second) {
  return first - second;
}

function passesCarryRule(first, second, carryMode) {
  if (carryMode === CARRY_MODES.BOTH) return true;
  const hasCarry = hasSubtractionBorrow(first, second);
  return carryMode === CARRY_MODES.WITH ? hasCarry : !hasCarry;
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
  let top = Math.floor(Math.abs(Number(a) || 0));
  let bottom = Math.floor(Math.abs(Number(b) || 0));
  let borrow = 0;
  while (top > 0 || bottom > 0) {
    let topDigit = (top % 10) - borrow;
    const bottomDigit = bottom % 10;
    if (topDigit < bottomDigit) return true;
    borrow = topDigit < 0 ? 1 : 0;
    top = Math.floor(top / 10);
    bottom = Math.floor(bottom / 10);
  }
  return false;
}

function hasMultiplicationCarry(factor1, factor2) {
  const topDigits = digitsOf(Math.floor(Math.abs(Number(factor1) || 0)));
  const bottomDigits = digitsOf(Math.floor(Math.abs(Number(factor2) || 0)));
  for (const bottomDigit of bottomDigits) {
    let carry = 0;
    for (const topDigit of topDigits) {
      const product = topDigit * bottomDigit + carry;
      if (product >= 10) return true;
      carry = Math.floor(product / 10);
    }
    if (carry > 0) return true;
  }
  return false;
}

function digitsOf(value) {
  const safeValue = Math.floor(Math.abs(Number(value) || 0));
  if (safeValue === 0) return [0];
  return String(safeValue).split("").reverse().map((digit) => Number(digit));
}

function parseFixedListLine(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return null;

  const parts = trimmed.split("=");
  if (parts.length > 2) return { valid: false };

  const leftRaw = String(parts[0] ?? "").trim();
  const rightRaw = parts[1] == null ? null : String(parts[1] ?? "").trim();
  if (!leftRaw) return { valid: false };

  const leftParts = leftRaw.split(/[\-−]/).map((part) => part.trim()).filter(Boolean);
  if (leftParts.length !== 2) return { valid: false };

  const first = parseIntegerLike(leftParts[0]);
  const second = parseIntegerLike(leftParts[1]);
  const question = buildQuestionFromValues(first, second);
  if (!question) return { valid: false };

  if (rightRaw != null) {
    const expectedResult = parseIntegerLike(rightRaw);
    if (!Number.isFinite(expectedResult) || expectedResult !== question.result) return { valid: false };
  }

  return { valid: true, entry: { first, second } };
}

function pickQuestionFromPool(pool, { avoidKey = null, usedKeys = null } = {}) {
  let candidates = Array.isArray(pool) ? pool : [];
  if (!candidates.length) return null;
  if (usedKeys instanceof Set && usedKeys.size < candidates.length) {
    candidates = candidates.filter((question) => !usedKeys.has(questionKey(question)));
  }
  const nonRepeated = avoidKey ? candidates.filter((question) => questionKey(question) !== avoidKey) : candidates;
  const finalPool = nonRepeated.length ? nonRepeated : candidates.length ? candidates : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)] ?? pool[0];
}

function normalizeGenerationMode(value) {
  return String(value || "") === GENERATION_MODES.FIXED_LIST ? GENERATION_MODES.FIXED_LIST : GENERATION_MODES.RANDOM;
}

function normalizeCarryMode(value) {
  const safeValue = String(value || "");
  if (safeValue === CARRY_MODES.WITHOUT) return CARRY_MODES.WITHOUT;
  if (safeValue === CARRY_MODES.WITH) return CARRY_MODES.WITH;
  return CARRY_MODES.BOTH;
}

function normalizeHolePosition(value) {
  const safeValue = String(value || "");
  if (safeValue === HOLE_POSITIONS.FIRST) return HOLE_POSITIONS.FIRST;
  if (safeValue === HOLE_POSITIONS.BOTH) return HOLE_POSITIONS.BOTH;
  return HOLE_POSITIONS.SECOND;
}

function normalizeValueRange(range, { defaultMin = 0, defaultMax = SUBTRACTION_HOLE_LIMITS.defaultFirstMax } = {}) {
  return normalizeNumericConstraint(range ?? {}, {
    inputMin: SUBTRACTION_HOLE_LIMITS.valueMin,
    inputMax: SUBTRACTION_HOLE_LIMITS.valueMax,
    defaultMin,
    defaultMax,
    defaultStart: defaultMin,
    defaultStep: 1,
    defaultValues: []
  });
}

function normalizeResultRange(range, { defaultMin = 0, defaultMax = SUBTRACTION_HOLE_LIMITS.resultMax } = {}) {
  return normalizeNumericConstraint(range ?? {}, {
    inputMin: SUBTRACTION_HOLE_LIMITS.resultMin,
    inputMax: SUBTRACTION_HOLE_LIMITS.resultMax,
    defaultMin,
    defaultMax,
    defaultStart: defaultMin,
    defaultStep: 1,
    defaultValues: []
  });
}

function createDefaultRange(min, max) {
  return { min, max, mode: "simple", start: min, step: 1, values: [] };
}

function pickRandomFrom(values) {
  if (!Array.isArray(values) || values.length === 0) return null;
  return values[Math.floor(Math.random() * values.length)] ?? null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
