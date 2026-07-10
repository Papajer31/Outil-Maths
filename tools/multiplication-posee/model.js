import { constraintContainsValue, normalizeNumericConstraint, pickValueFromConstraint } from "../../shared/value-constraints.js";
import { countIntegerDigits, formatIntegerForDisplay, parseIntegerLike } from "../../shared/tool-ui/number-format.js";

export const GENERATION_MODES = Object.freeze({
  RANDOM: "random",
  FIXED_LIST: "fixed_list"
});

export const CARRY_MODES = Object.freeze({
  WITHOUT: "without_carry",
  WITH: "with_carry",
  BOTH: "both"
});

export const MULTIPLICATION_LIMITS = Object.freeze({
  factorMin: 0,
  factorMax: 99999,
  factor1Max: 99999,
  factor2Max: 999,
  maxFactorDigitTotal: 7,
  defaultFactor1Max: 99,
  defaultFactor2Max: 9,
  resultMin: 0,
  resultMax: 9999999
});

export function getDefaultSettings() {
  return {
    generationMode: GENERATION_MODES.RANDOM,
    carryMode: CARRY_MODES.BOTH,
    factorRanges: {
      f1: createDefaultRange(0, MULTIPLICATION_LIMITS.defaultFactor1Max),
      f2: createDefaultRange(0, MULTIPLICATION_LIMITS.defaultFactor2Max)
    },
    resultConstraint: {
      enabled: false,
      range: createDefaultRange(0, MULTIPLICATION_LIMITS.resultMax)
    },
    fixedListRaw: ""
  };
}

export function normalizeSettings(settings = {}) {
  const defaults = getDefaultSettings();
  const base = { ...defaults, ...(isPlainObject(settings) ? settings : {}) };
  const factorRanges = isPlainObject(base.factorRanges) ? base.factorRanges : {};
  const resultConstraint = isPlainObject(base.resultConstraint) ? base.resultConstraint : {};

  return {
    generationMode: normalizeGenerationMode(base.generationMode),
    carryMode: normalizeCarryMode(base.carryMode),
    factorRanges: {
      f1: normalizeFactorRange(factorRanges.f1, { defaultMin: 0, defaultMax: MULTIPLICATION_LIMITS.defaultFactor1Max, inputMax: MULTIPLICATION_LIMITS.factor1Max }),
      f2: normalizeFactorRange(factorRanges.f2, { defaultMin: 0, defaultMax: MULTIPLICATION_LIMITS.defaultFactor2Max, inputMax: MULTIPLICATION_LIMITS.factor2Max })
    },
    resultConstraint: {
      enabled: resultConstraint.enabled === true,
      range: normalizeResultRange(resultConstraint.range, {
        defaultMin: MULTIPLICATION_LIMITS.resultMin,
        defaultMax: MULTIPLICATION_LIMITS.resultMax
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
    if (cfg.carryMode === CARRY_MODES.WITH) return "Aucune multiplication posée avec retenue possible avec ces réglages.";
    if (cfg.carryMode === CARRY_MODES.WITHOUT) return "Aucune multiplication posée sans retenue possible avec ces réglages.";
    return "Aucune multiplication posée possible avec ces réglages.";
  }

  const parsed = parseFixedListRaw(cfg.fixedListRaw);
  if (parsed.invalidLineNumbers.length) {
    return `Liste fixe : ligne(s) invalide(s) ${parsed.invalidLineNumbers.join(", ")}.`;
  }
  return "Aucune multiplication posée possible : la liste fixe ne contient aucune multiplication valide.";
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
      .map((entry) => buildQuestionFromFactors(entry.factor1, entry.factor2))
      .filter(Boolean)
      .filter((question) => passesQuestionRules(question, cfg));
  }
  return buildRandomQuestionPool(cfg, { maxQuestions });
}

export function questionKey(question) {
  return ["multiplication-posee", question?.factor1 ?? "", question?.factor2 ?? "", question?.result ?? ""].join("|");
}

export function formatQuestion(question) {
  if (!question) return "";
  return `${formatIntegerForDisplay(question.factor1)} × ${formatIntegerForDisplay(question.factor2)}`;
}

export function formatAnswer(question) {
  if (!question) return "";
  return `${formatQuestion(question)} = ${formatIntegerForDisplay(question.result)}`;
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
  const firstRange = cfg?.factorRanges?.f1;
  const secondRange = cfg?.factorRanges?.f2;
  if (!firstRange?.valueCount || !secondRange?.valueCount) {
    return "Aucune multiplication posée possible : au moins une plage de facteurs ne contient aucune valeur.";
  }

  const minFirst = Math.floor(Number(firstRange.min) || 0);
  const minSecond = Math.floor(Number(secondRange.min) || 0);
  const minDigitTotal = countIntegerDigits(minFirst) + countIntegerDigits(minSecond);
  if (minDigitTotal > MULTIPLICATION_LIMITS.maxFactorDigitTotal) {
    return `Configuration impossible : les plus petits facteurs possibles ont déjà ${minDigitTotal} chiffres au total, alors que la limite est de ${MULTIPLICATION_LIMITS.maxFactorDigitTotal}.`;
  }

  const resultMax = getEffectiveResultMax(cfg, MULTIPLICATION_LIMITS.resultMax);
  const minResult = minFirst * minSecond;
  if (minResult > resultMax) {
    return `Configuration impossible : le plus petit résultat possible est ${formatIntegerForDisplay(minResult)}, mais le résultat maximum autorisé est ${formatIntegerForDisplay(resultMax)}.`;
  }

  return "";
}

function getEffectiveResultMax(cfg, fallbackMax) {
  if (!cfg?.resultConstraint?.enabled) return fallbackMax;
  const range = cfg.resultConstraint.range;
  if (Array.isArray(range?.values) && range.values.length > 0) {
    return Math.max(...range.values.map((value) => Math.floor(Number(value))).filter(Number.isFinite));
  }
  return Math.min(fallbackMax, Math.floor(Number(range?.max) || fallbackMax));
}

function buildRandomQuestionPool(cfg, { maxQuestions = 500 } = {}) {
  const questions = [];
  if (getRandomStructuralImpossibleMessage(cfg)) return questions;

  const seen = new Set();
  const attempts = Math.max(80, Math.min(5000, Number(maxQuestions) * 16));
  const factor1Range = cfg.factorRanges.f1;
  const factor2Range = cfg.factorRanges.f2;

  if (!factor1Range?.valueCount || !factor2Range?.valueCount) return questions;

  for (let attempt = 0; attempt < attempts && questions.length < maxQuestions; attempt += 1) {
    const question = buildQuestionFromFactors(pickValueFromConstraint(factor1Range), pickValueFromConstraint(factor2Range));
    if (!question) continue;
    if (!passesQuestionRules(question, cfg)) continue;
    const key = questionKey(question);
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(question);
  }
  return questions;
}

function buildQuestionFromFactors(factor1, factor2) {
  const safeFactor1 = Math.floor(Number(factor1));
  const safeFactor2 = Math.floor(Number(factor2));
  if (!Number.isFinite(safeFactor1) || !Number.isFinite(safeFactor2)) return null;
  if (safeFactor1 < MULTIPLICATION_LIMITS.factorMin || safeFactor1 > MULTIPLICATION_LIMITS.factor1Max) return null;
  if (safeFactor2 < MULTIPLICATION_LIMITS.factorMin || safeFactor2 > MULTIPLICATION_LIMITS.factor2Max) return null;
  if (countIntegerDigits(safeFactor1) + countIntegerDigits(safeFactor2) > MULTIPLICATION_LIMITS.maxFactorDigitTotal) return null;
  const result = safeFactor1 * safeFactor2;
  if (result < MULTIPLICATION_LIMITS.resultMin || result > MULTIPLICATION_LIMITS.resultMax) return null;
  return { tool: "multiplication-posee", operation: "multiplication", factor1: safeFactor1, factor2: safeFactor2, result };
}

function passesQuestionRules(question, cfg) {
  if (!question) return false;
  if (!passesCarryRule(question.factor1, question.factor2, cfg.carryMode)) return false;
  if (!cfg.resultConstraint.enabled) return true;
  return constraintContainsValue(cfg.resultConstraint.range, question.result);
}

function passesCarryRule(factor1, factor2, carryMode) {
  if (carryMode === CARRY_MODES.BOTH) return true;
  const hasCarry = hasCarryForMultiplication(factor1, factor2);
  return carryMode === CARRY_MODES.WITH ? hasCarry : !hasCarry;
}

function hasCarryForMultiplication(factor1, factor2) {
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

function parseFixedListLine(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return null;
  const withoutResult = trimmed.split("=")[0]?.trim() ?? "";
  const parts = withoutResult.split(/[xX×*]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return { valid: false };
  const factor1 = parseIntegerLike(parts[0]);
  const factor2 = parseIntegerLike(parts[1]);
  const question = buildQuestionFromFactors(factor1, factor2);
  if (!question) return { valid: false };
  return { valid: true, entry: { factor1, factor2 } };
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

function normalizeFactorRange(range, {
  defaultMin = 0,
  defaultMax = MULTIPLICATION_LIMITS.defaultFactor1Max,
  inputMax = MULTIPLICATION_LIMITS.factorMax
} = {}) {
  return normalizeNumericConstraint(range ?? {}, {
    inputMin: MULTIPLICATION_LIMITS.factorMin,
    inputMax,
    defaultMin,
    defaultMax,
    defaultStart: defaultMin,
    defaultStep: 1,
    defaultValues: []
  });
}

function normalizeResultRange(range, { defaultMin = 0, defaultMax = MULTIPLICATION_LIMITS.resultMax } = {}) {
  return normalizeNumericConstraint(range ?? {}, {
    inputMin: MULTIPLICATION_LIMITS.resultMin,
    inputMax: MULTIPLICATION_LIMITS.resultMax,
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
  return !!value && typeof value === "object" && !Array.isArray(value);
}
