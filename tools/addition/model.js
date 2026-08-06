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

export const NUMBER_DISPLAY_MODES = Object.freeze({
  DIGITS: "digits",
  WORDS: "words"
});

export const TERM_COUNT_OPTIONS = Object.freeze([2, 3, 4]);

export const ADDITION_LIMITS = Object.freeze({
  termMin: 0,
  termMax: 999999,
  defaultTermMax: 99,
  resultMin: 0,
  resultMax: 999999
});

export function getDefaultSettings() {
  return {
    generationMode: GENERATION_MODES.RANDOM,
    termCounts: [2],
    carryMode: CARRY_MODES.BOTH,
    numberDisplayMode: NUMBER_DISPLAY_MODES.DIGITS,
    termRanges: {
      t1: createDefaultRange(0, ADDITION_LIMITS.defaultTermMax),
      t2: createDefaultRange(0, ADDITION_LIMITS.defaultTermMax),
      t3: createDefaultRange(0, ADDITION_LIMITS.defaultTermMax),
      t4: createDefaultRange(0, ADDITION_LIMITS.defaultTermMax)
    },
    resultConstraint: {
      enabled: false,
      range: createDefaultRange(0, ADDITION_LIMITS.resultMax)
    },
    fixedListRaw: ""
  };
}

export function normalizeSettings(settings = {}) {
  const defaults = getDefaultSettings();
  const base = {
    ...defaults,
    ...(isPlainObject(settings) ? settings : {})
  };

  const termRanges = isPlainObject(base.termRanges) ? base.termRanges : {};
  const resultConstraint = isPlainObject(base.resultConstraint) ? base.resultConstraint : {};

  return {
    generationMode: normalizeGenerationMode(base.generationMode),
    termCounts: normalizeTermCounts(base.termCounts),
    carryMode: normalizeCarryMode(base.carryMode),
    numberDisplayMode: normalizeNumberDisplayMode(base.numberDisplayMode),
    termRanges: {
      t1: normalizeCalculationRange(termRanges.t1, { defaultMin: 0, defaultMax: ADDITION_LIMITS.defaultTermMax }),
      t2: normalizeCalculationRange(termRanges.t2, { defaultMin: 0, defaultMax: ADDITION_LIMITS.defaultTermMax }),
      t3: normalizeCalculationRange(termRanges.t3, { defaultMin: 0, defaultMax: ADDITION_LIMITS.defaultTermMax }),
      t4: normalizeCalculationRange(termRanges.t4, { defaultMin: 0, defaultMax: ADDITION_LIMITS.defaultTermMax })
    },
    resultConstraint: {
      enabled: resultConstraint.enabled === true,
      range: normalizeCalculationRange(resultConstraint.range, {
        defaultMin: ADDITION_LIMITS.resultMin,
        defaultMax: ADDITION_LIMITS.resultMax
      })
    },
    fixedListRaw: String(base.fixedListRaw ?? "")
  };
}

export function hasAtLeastOneQuestion(settings = {}) {
  const cfg = normalizeSettings(settings);
  return Boolean(buildQuestionPool(cfg, { maxQuestions: 240 }).length);
}

export function getImpossibleMessage(settings = {}) {
  const cfg = normalizeSettings(settings);

  if (cfg.generationMode === GENERATION_MODES.RANDOM) {
    const structuralMessage = getRandomStructuralImpossibleMessage(cfg);
    if (structuralMessage) return structuralMessage;
    if (!cfg.termCounts.length) return "Aucune question possible : aucun nombre de termes n’est sélectionné.";
    if (cfg.carryMode === CARRY_MODES.WITH) return "Aucune addition avec retenue possible avec ces réglages.";
    if (cfg.carryMode === CARRY_MODES.WITHOUT) return "Aucune addition sans retenue possible avec ces réglages.";
    return "Aucune addition possible avec ces réglages.";
  }

  if (cfg.generationMode === GENERATION_MODES.FIXED_LIST) {
    const parsed = parseFixedListRaw(cfg.fixedListRaw);
    if (parsed.invalidLineNumbers.length) {
      return `Liste fixe : ligne(s) invalide(s) ${parsed.invalidLineNumbers.join(", ")}.`;
    }
    return "Aucune addition possible : la liste fixe ne contient aucune addition valide.";
  }

  return "Aucune addition possible avec ces réglages.";
}

export function pickQuestion(settings = {}, {
  avoidKey = null,
  usedKeys = null
} = {}) {
  const cfg = normalizeSettings(settings);
  const pool = buildQuestionPool(cfg, { maxQuestions: 360 });

  if (!pool.length) {
    throw new Error(getImpossibleMessage(cfg));
  }

  return pickQuestionFromPool(pool, { avoidKey, usedKeys });
}

export function buildQuestionPool(settings = {}, { maxQuestions = 500 } = {}) {
  const cfg = normalizeSettings(settings);

  if (cfg.generationMode === GENERATION_MODES.FIXED_LIST) {
    return parseFixedListRaw(cfg.fixedListRaw).entries
      .map((entry) => buildQuestionFromTerms(entry.terms))
      .filter(Boolean)
      .filter((question) => passesResultConstraint(question, cfg));
  }

  return buildRandomQuestionPool(cfg, { maxQuestions });
}

export function questionKey(question) {
  return [
    "addition",
    Array.isArray(question?.terms) ? question.terms.join(",") : "",
    question?.result ?? ""
  ].join("|");
}

export function formatQuestion(question, numberDisplayMode = NUMBER_DISPLAY_MODES.DIGITS) {
  if (!question) return "";
  if (Array.isArray(question.terms) && question.terms.length >= 2) {
    return question.terms.map((term) => formatNumberForQuestion(term, numberDisplayMode)).join(" + ");
  }
  return "";
}

export function formatAnswer(question, numberDisplayMode = NUMBER_DISPLAY_MODES.DIGITS) {
  if (!question) return "";
  return `${formatQuestion(question, numberDisplayMode)} = ${formatIntegerForDisplay(question.result)}`;
}

export function parseFixedListRaw(rawText) {
  const rawLines = String(rawText ?? "").replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  const entries = [];
  const invalidLineNumbers = [];

  rawLines.forEach((line, index) => {
    const parsed = parseFixedListLine(line);
    if (parsed == null) return;
    if (parsed.valid) {
      entries.push(parsed.entry);
    } else {
      invalidLineNumbers.push(index + 1);
    }
  });

  return { entries, invalidLineNumbers };
}

export function computeResultBounds(settings = {}) {
  const pool = buildQuestionPool(settings, { maxQuestions: 1200 });
  if (!pool.length) return null;

  let min = Infinity;
  let max = -Infinity;
  pool.forEach((question) => {
    const result = Number(question?.result);
    if (!Number.isFinite(result)) return;
    min = Math.min(min, result);
    max = Math.max(max, result);
  });

  if (!Number.isFinite(min) || !Number.isFinite(max)) return null;
  return {
    min: Math.max(ADDITION_LIMITS.resultMin, Math.floor(min)),
    max: Math.min(ADDITION_LIMITS.resultMax, Math.floor(max))
  };
}

function buildRandomQuestionPool(cfg, { maxQuestions = 500 } = {}) {
  const questions = [];
  if (getRandomStructuralImpossibleMessage(cfg)) return questions;

  const seen = new Set();
  const attempts = Math.max(80, Math.min(5000, Number(maxQuestions) * 14));

  for (let attempt = 0; attempt < attempts && questions.length < maxQuestions; attempt += 1) {
    const termCount = pickRandomFrom(cfg.termCounts);
    if (!Number.isInteger(termCount) || termCount < 2) continue;

    const ranges = getRangesForTermCount(cfg, termCount);
    if (!ranges.length || ranges.some((range) => !range || range.valueCount <= 0)) continue;

    const terms = sampleTerms(ranges);
    const question = buildQuestionFromTerms(terms);
    if (!question) continue;
    if (!passesCarryRule(question.terms, cfg.carryMode)) continue;
    if (!passesResultConstraint(question, cfg)) continue;

    const key = questionKey(question);
    if (seen.has(key)) continue;
    seen.add(key);
    questions.push(question);
  }

  return questions;
}

function getRandomStructuralImpossibleMessage(cfg) {
  if (!Array.isArray(cfg?.termCounts) || cfg.termCounts.length === 0) {
    return "Aucune question possible : aucun nombre de termes n’est sélectionné.";
  }

  const resultMax = getEffectiveResultMax(cfg, ADDITION_LIMITS.resultMax);
  const blocked = [];

  for (const termCount of cfg.termCounts) {
    const ranges = getRangesForTermCount(cfg, termCount);
    if (!ranges.length || ranges.some((range) => !range || range.valueCount <= 0)) {
      blocked.push({ termCount, minSum: null });
      continue;
    }

    const minSum = ranges.reduce((sum, range) => sum + Math.floor(Number(range.min) || 0), 0);
    if (minSum <= resultMax) return "";
    blocked.push({ termCount, minSum });
  }

  const best = blocked
    .filter((item) => Number.isFinite(item.minSum))
    .sort((a, b) => a.minSum - b.minSum)[0];

  if (best) {
    return `Configuration impossible : avec ${best.termCount} terme${best.termCount > 1 ? "s" : ""}, le plus petit résultat possible est ${formatIntegerForDisplay(best.minSum)}, mais le résultat maximum autorisé est ${formatIntegerForDisplay(resultMax)}.`;
  }

  return "Aucune addition possible : au moins une plage de termes ne contient aucune valeur.";
}

function getEffectiveResultMax(cfg, fallbackMax) {
  if (!cfg?.resultConstraint?.enabled) return fallbackMax;
  const range = cfg.resultConstraint.range;
  if (Array.isArray(range?.values) && range.values.length > 0) {
    return Math.max(...range.values.map((value) => Math.floor(Number(value))).filter(Number.isFinite));
  }
  return Math.min(fallbackMax, Math.floor(Number(range?.max) || fallbackMax));
}

function pickQuestionFromPool(pool, { avoidKey = null, usedKeys = null } = {}) {
  let candidates = Array.isArray(pool) ? pool : [];
  if (!candidates.length) return null;

  if (usedKeys instanceof Set && usedKeys.size < candidates.length) {
    candidates = candidates.filter((question) => !usedKeys.has(questionKey(question)));
  }

  const nonRepeated = avoidKey
    ? candidates.filter((question) => questionKey(question) !== avoidKey)
    : candidates;

  const finalPool = nonRepeated.length ? nonRepeated : candidates.length ? candidates : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)] ?? pool[0];
}

function getRangesForTermCount(cfg, termCount) {
  const ranges = [];
  for (let index = 0; index < termCount; index += 1) {
    ranges.push(cfg.termRanges?.[`t${index + 1}`] || null);
  }
  return ranges;
}

function buildQuestionFromTerms(terms) {
  const safeTerms = Array.isArray(terms)
    ? terms.map((value) => Math.floor(Number(value))).filter((value) => Number.isFinite(value))
    : [];

  if (safeTerms.length < 2) return null;

  const result = safeTerms.reduce((sum, value) => sum + value, 0);
  if (!Number.isFinite(result)) return null;

  return {
    tool: "addition",
    operation: "addition",
    terms: safeTerms,
    result
  };
}

function sampleTerms(ranges) {
  const terms = [];
  for (const range of ranges) {
    const value = pickValueFromConstraint(range);
    if (!Number.isFinite(value)) return null;
    terms.push(value);
  }
  return terms;
}

function passesResultConstraint(question, cfg) {
  const result = Number(question?.result);
  if (!Number.isFinite(result)) return false;
  if (result < ADDITION_LIMITS.resultMin || result > ADDITION_LIMITS.resultMax) return false;
  if (!cfg.resultConstraint.enabled) return true;
  return constraintContainsValue(cfg.resultConstraint.range, result);
}

function passesCarryRule(terms, carryMode) {
  if (carryMode === CARRY_MODES.BOTH) return true;
  const hasCarry = hasCarryForTerms(terms);
  return carryMode === CARRY_MODES.WITH ? hasCarry : !hasCarry;
}

function hasCarryForTerms(terms) {
  let carry = 0;
  let values = (Array.isArray(terms) ? terms : [])
    .map((value) => Math.floor(Math.abs(Number(value) || 0)))
    .filter((value) => Number.isFinite(value));

  while (values.some((value) => value > 0) || carry > 0) {
    let digitSum = carry;
    values = values.map((value) => {
      digitSum += value % 10;
      return Math.floor(value / 10);
    });

    if (digitSum >= 10) return true;
    carry = Math.floor(digitSum / 10);
  }

  return false;
}

function parseFixedListLine(line) {
  const trimmed = String(line ?? "").trim();
  if (!trimmed) return null;

  const withoutResult = trimmed.split("=")[0]?.trim() ?? "";
  const parts = withoutResult.split("+").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return { valid: false };

  const terms = parts.map((part) => parseIntegerLike(part));
  if (terms.some((value) => !Number.isFinite(value) || value < ADDITION_LIMITS.termMin || value > ADDITION_LIMITS.termMax)) {
    return { valid: false };
  }

  return { valid: true, entry: { terms } };
}

function normalizeGenerationMode(value) {
  const safeValue = String(value || "");
  if (safeValue === GENERATION_MODES.FIXED_LIST) return GENERATION_MODES.FIXED_LIST;
  return GENERATION_MODES.RANDOM;
}

function normalizeCarryMode(value) {
  const safeValue = String(value || "");
  if (safeValue === CARRY_MODES.WITHOUT) return CARRY_MODES.WITHOUT;
  if (safeValue === CARRY_MODES.WITH) return CARRY_MODES.WITH;
  return CARRY_MODES.BOTH;
}

function normalizeNumberDisplayMode(value) {
  return String(value || "").trim() === NUMBER_DISPLAY_MODES.WORDS
    ? NUMBER_DISPLAY_MODES.WORDS
    : NUMBER_DISPLAY_MODES.DIGITS;
}

function formatNumberForQuestion(value, numberDisplayMode) {
  if (numberDisplayMode !== NUMBER_DISPLAY_MODES.WORDS) return formatIntegerForDisplay(value);
  return numberToFrenchWords(value);
}

function numberToFrenchWords(value) {
  const safeValue = Math.max(0, Math.min(ADDITION_LIMITS.resultMax, Math.floor(Number(value) || 0)));
  if (safeValue < 1000) return numberUnderOneThousandToFrenchWords(safeValue);

  const thousands = Math.floor(safeValue / 1000);
  const remainder = safeValue % 1000;
  const thousandLabel = thousands === 1
    ? "mille"
    : `${numberUnderOneThousandToFrenchWords(thousands)}-mille`;
  return remainder ? `${thousandLabel}-${numberUnderOneThousandToFrenchWords(remainder)}` : thousandLabel;
}

function numberUnderOneThousandToFrenchWords(value) {
  const safeValue = Math.max(0, Math.min(999, Math.floor(Number(value) || 0)));
  if (safeValue < 100) return numberUnderOneHundredToFrenchWords(safeValue);

  const hundreds = Math.floor(safeValue / 100);
  const remainder = safeValue % 100;
  let label = hundreds === 1 ? "cent" : `${numberUnderOneHundredToFrenchWords(hundreds)}-cent`;
  if (remainder === 0 && hundreds > 1) label += "s";
  return remainder ? `${label}-${numberUnderOneHundredToFrenchWords(remainder)}` : label;
}

function numberUnderOneHundredToFrenchWords(value) {
  const simple = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf"];
  const tens = { 20:"vingt", 30:"trente", 40:"quarante", 50:"cinquante", 60:"soixante" };
  if (value < 20) return simple[value];
  if (value < 70) {
    const ten = Math.floor(value / 10) * 10;
    const unit = value % 10;
    return unit === 0 ? tens[ten] : unit === 1 ? `${tens[ten]}-et-un` : `${tens[ten]}-${simple[unit]}`;
  }
  if (value < 80) {
    const remainder = value - 60;
    return remainder === 10 ? "soixante-dix" : remainder === 11 ? "soixante-et-onze" : `soixante-${numberUnderOneHundredToFrenchWords(remainder)}`;
  }
  const remainder = value - 80;
  return remainder === 0 ? "quatre-vingts" : remainder === 1 ? "quatre-vingt-un" : `quatre-vingt-${numberUnderOneHundredToFrenchWords(remainder)}`;
}

function normalizeTermCounts(value) {
  const rawItems = Array.isArray(value)
    ? value
    : String(value ?? "").split(/[;,\s]+/g).filter(Boolean);
  const selected = [];

  rawItems.forEach((item) => {
    const safeItem = Math.floor(Number(item));
    if (!TERM_COUNT_OPTIONS.includes(safeItem)) return;
    if (selected.includes(safeItem)) return;
    selected.push(safeItem);
  });

  if (selected.length) {
    return TERM_COUNT_OPTIONS.filter((item) => selected.includes(item));
  }

  return [2];
}

function normalizeCalculationRange(range, {
  defaultMin = 0,
  defaultMax = ADDITION_LIMITS.defaultTermMax
} = {}) {
  return normalizeNumericConstraint(range ?? {}, {
    inputMin: ADDITION_LIMITS.termMin,
    inputMax: ADDITION_LIMITS.termMax,
    defaultMin,
    defaultMax,
    defaultStart: defaultMin,
    defaultStep: 1,
    defaultValues: []
  });
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

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
