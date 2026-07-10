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

export const SUBTRACTION_LIMITS = Object.freeze({
  termMin: 0,
  termMax: 999999,
  defaultTerm1Max: 99,
  defaultTerm2Max: 99,
  resultMin: 0,
  resultMax: 999999
});

export function getDefaultSettings() {
  return {
    generationMode: GENERATION_MODES.RANDOM,
    carryMode: CARRY_MODES.BOTH,
    termRanges: {
      t1: createDefaultRange(0, SUBTRACTION_LIMITS.defaultTerm1Max),
      t2: createDefaultRange(0, SUBTRACTION_LIMITS.defaultTerm2Max)
    },
    resultConstraint: {
      enabled: false,
      range: createDefaultRange(0, SUBTRACTION_LIMITS.resultMax)
    },
    fixedListRaw: ""
  };
}

export function normalizeSettings(settings = {}) {
  const defaults = getDefaultSettings();
  const base = { ...defaults, ...(isPlainObject(settings) ? settings : {}) };
  const termRanges = isPlainObject(base.termRanges) ? base.termRanges : {};
  const resultConstraint = isPlainObject(base.resultConstraint) ? base.resultConstraint : {};

  return {
    generationMode: normalizeGenerationMode(base.generationMode),
    carryMode: normalizeCarryMode(base.carryMode),
    termRanges: {
      t1: normalizeSubtractionRange(termRanges.t1, { defaultMin: 0, defaultMax: SUBTRACTION_LIMITS.defaultTerm1Max }),
      t2: normalizeSubtractionRange(termRanges.t2, { defaultMin: 0, defaultMax: SUBTRACTION_LIMITS.defaultTerm2Max })
    },
    resultConstraint: {
      enabled: resultConstraint.enabled === true,
      range: normalizeSubtractionRange(resultConstraint.range, {
        defaultMin: SUBTRACTION_LIMITS.resultMin,
        defaultMax: SUBTRACTION_LIMITS.resultMax
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
    if (cfg.carryMode === CARRY_MODES.WITH) return "Aucune soustraction avec retenue possible avec ces réglages.";
    if (cfg.carryMode === CARRY_MODES.WITHOUT) return "Aucune soustraction sans retenue possible avec ces réglages.";
    return "Aucune soustraction possible avec ces réglages.";
  }

  const parsed = parseFixedListRaw(cfg.fixedListRaw);
  if (parsed.invalidLineNumbers.length) {
    return `Liste fixe : ligne(s) invalide(s) ${parsed.invalidLineNumbers.join(", ")}.`;
  }
  return "Aucune soustraction possible : la liste fixe ne contient aucune soustraction valide.";
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
      .map((entry) => buildQuestionFromTerms(entry.term1, entry.term2))
      .filter(Boolean)
      .filter((question) => passesQuestionRules(question, cfg));
  }
  return buildRandomQuestionPool(cfg, { maxQuestions });
}

export function questionKey(question) {
  return ["soustraction", question?.term1 ?? "", question?.term2 ?? "", question?.result ?? ""].join("|");
}

export function formatQuestion(question) {
  if (!question) return "";
  return `${formatIntegerForDisplay(question.term1)} − ${formatIntegerForDisplay(question.term2)}`;
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
  const firstRange = cfg?.termRanges?.t1;
  const secondRange = cfg?.termRanges?.t2;
  if (!firstRange?.valueCount || !secondRange?.valueCount) {
    return "Aucune soustraction possible : au moins une plage de termes ne contient aucune valeur.";
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
  const attempts = Math.max(80, Math.min(5000, Number(maxQuestions) * 16));
  const term1Range = cfg.termRanges.t1;
  const term2Range = cfg.termRanges.t2;

  if (!term1Range?.valueCount || !term2Range?.valueCount) return questions;

  for (let attempt = 0; attempt < attempts && questions.length < maxQuestions; attempt += 1) {
    const question = buildQuestionFromTerms(pickValueFromConstraint(term1Range), pickValueFromConstraint(term2Range));
    if (!question) continue;
    if (!passesQuestionRules(question, cfg)) continue;
    const key = questionKey(question);
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(question);
  }
  return questions;
}

function buildQuestionFromTerms(term1, term2) {
  const safeTerm1 = Math.floor(Number(term1));
  const safeTerm2 = Math.floor(Number(term2));
  if (!Number.isFinite(safeTerm1) || !Number.isFinite(safeTerm2)) return null;
  if (safeTerm1 < SUBTRACTION_LIMITS.termMin || safeTerm1 > SUBTRACTION_LIMITS.termMax) return null;
  if (safeTerm2 < SUBTRACTION_LIMITS.termMin || safeTerm2 > SUBTRACTION_LIMITS.termMax) return null;
  const result = safeTerm1 - safeTerm2;
  if (result < SUBTRACTION_LIMITS.resultMin || result > SUBTRACTION_LIMITS.resultMax) return null;
  return { tool: "soustraction", operation: "soustraction", term1: safeTerm1, term2: safeTerm2, result };
}

function passesQuestionRules(question, cfg) {
  if (!question) return false;
  if (!passesCarryRule(question.term1, question.term2, cfg.carryMode)) return false;
  if (!cfg.resultConstraint.enabled) return true;
  return constraintContainsValue(cfg.resultConstraint.range, question.result);
}

function passesCarryRule(term1, term2, carryMode) {
  if (carryMode === CARRY_MODES.BOTH) return true;
  const hasCarry = hasBorrowForSubtraction(term1, term2);
  return carryMode === CARRY_MODES.WITH ? hasCarry : !hasCarry;
}

function hasBorrowForSubtraction(term1, term2) {
  let top = Math.floor(Math.abs(Number(term1) || 0));
  let bottom = Math.floor(Math.abs(Number(term2) || 0));
  let borrow = 0;
  while (top > 0 || bottom > 0) {
    const topDigit = (top % 10) - borrow;
    const bottomDigit = bottom % 10;
    if (topDigit < bottomDigit) return true;
    borrow = topDigit < bottomDigit ? 1 : 0;
    top = Math.floor(top / 10);
    bottom = Math.floor(bottom / 10);
  }
  return false;
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
  const parts = withoutResult.split(/[\-−]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length !== 2) return { valid: false };
  const term1 = parseIntegerLike(parts[0]);
  const term2 = parseIntegerLike(parts[1]);
  const question = buildQuestionFromTerms(term1, term2);
  if (!question) return { valid: false };
  return { valid: true, entry: { term1, term2 } };
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

function normalizeSubtractionRange(range, { defaultMin = 0, defaultMax = SUBTRACTION_LIMITS.defaultTerm1Max } = {}) {
  return normalizeNumericConstraint(range ?? {}, {
    inputMin: SUBTRACTION_LIMITS.termMin,
    inputMax: SUBTRACTION_LIMITS.termMax,
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
