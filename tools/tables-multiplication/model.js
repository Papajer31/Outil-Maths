import { formatIntegerForDisplay } from "../../shared/tool-ui/number-format.js";

export const TABLE_OPTIONS = Object.freeze([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 25]);
export const MULTIPLIER_OPTIONS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

export const ORDER_MODES = Object.freeze({
  ORDERED: "ordered",
  SHUFFLED: "shuffled"
});

export const FACTOR_POSITIONS = Object.freeze({
  FIRST: "first_factor",
  SECOND: "second_factor",
  BOTH: "both"
});

export function getDefaultSettings() {
  return {
    tables: [2, 3, 4, 5],
    multipliers: [...MULTIPLIER_OPTIONS],
    orderMode: ORDER_MODES.SHUFFLED,
    factorPosition: FACTOR_POSITIONS.FIRST
  };
}

export function normalizeSettings(settings = {}) {
  const base = {
    ...getDefaultSettings(),
    ...(isPlainObject(settings) ? settings : {})
  };

  return {
    tables: normalizeNumberSelection(base.tables, TABLE_OPTIONS, getDefaultSettings().tables),
    multipliers: normalizeNumberSelection(base.multipliers, MULTIPLIER_OPTIONS, getDefaultSettings().multipliers),
    orderMode: normalizeOrderMode(base.orderMode),
    factorPosition: normalizeFactorPosition(base.factorPosition)
  };
}

export function hasAtLeastOneQuestion(settings = {}) {
  const cfg = normalizeSettings(settings);
  return cfg.tables.length > 0 && cfg.multipliers.length > 0;
}

export function getImpossibleMessage(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (!cfg.tables.length) return "Aucune question possible : aucune table travaillée n’est sélectionnée.";
  if (!cfg.multipliers.length) return "Aucune question possible : aucun multiplicateur n’est sélectionné.";
  return "Aucune question de table possible avec ces réglages.";
}

export function pickQuestion(settings = {}, {
  avoidKey = null,
  sequenceIndex = 0,
  usedKeys = null
} = {}) {
  const cfg = normalizeSettings(settings);
  const questions = buildQuestions(cfg);
  if (!questions.length) {
    throw new Error(getImpossibleMessage(cfg));
  }

  if (cfg.orderMode === ORDER_MODES.ORDERED) {
    return pickOrderedQuestion(questions, { sequenceIndex, usedKeys });
  }

  return pickShuffledQuestion(questions, { avoidKey, usedKeys });
}

export function buildQuestions(settings = {}) {
  const cfg = normalizeSettings(settings);
  const questions = [];

  cfg.tables.forEach((table) => {
    cfg.multipliers.forEach((multiplier) => {
      const factors = resolveFactors(table, multiplier, cfg.factorPosition);
      questions.push(createQuestion({
        table,
        multiplier,
        factors
      }));
    });
  });

  return questions;
}

export function questionKey(question) {
  return [
    "tables-multiplication",
    question?.table ?? "",
    question?.multiplier ?? "",
    question?.factor1 ?? "",
    question?.factor2 ?? "",
    question?.result ?? ""
  ].join("|");
}

export function formatQuestion(question) {
  if (!question) return "";
  return `${formatIntegerForDisplay(question.factor1)} × ${formatIntegerForDisplay(question.factor2)}`;
}

export function formatAnswer(question) {
  if (!question) return "";
  return `${formatQuestion(question)} = ${formatIntegerForDisplay(question.result)}`;
}

function pickOrderedQuestion(questions, { sequenceIndex = 0, usedKeys = null } = {}) {
  const pool = Array.isArray(questions) ? questions : [];
  if (!pool.length) return null;

  if (usedKeys instanceof Set && usedKeys.size < pool.length) {
    for (let offset = 0; offset < pool.length; offset += 1) {
      const candidate = pool[(Math.max(0, Math.floor(Number(sequenceIndex) || 0)) + offset) % pool.length];
      if (!usedKeys.has(questionKey(candidate))) {
        return candidate;
      }
    }
  }

  return pool[Math.max(0, Math.floor(Number(sequenceIndex) || 0)) % pool.length];
}

function pickShuffledQuestion(questions, { avoidKey = null, usedKeys = null } = {}) {
  const pool = Array.isArray(questions) ? questions : [];
  if (!pool.length) return null;

  let candidates = pool;
  if (usedKeys instanceof Set && usedKeys.size < pool.length) {
    candidates = pool.filter((question) => !usedKeys.has(questionKey(question)));
  }

  const nonRepeated = avoidKey
    ? candidates.filter((question) => questionKey(question) !== avoidKey)
    : candidates;

  const finalPool = nonRepeated.length ? nonRepeated : candidates.length ? candidates : pool;
  return finalPool[Math.floor(Math.random() * finalPool.length)] ?? pool[0];
}

function createQuestion({ table, multiplier, factors }) {
  const [factor1, factor2] = factors;
  return {
    tool: "tables-multiplication",
    table,
    multiplier,
    factor1,
    factor2,
    result: factor1 * factor2
  };
}

function resolveFactors(table, multiplier, factorPosition) {
  if (factorPosition === FACTOR_POSITIONS.SECOND) {
    return [multiplier, table];
  }

  if (factorPosition === FACTOR_POSITIONS.BOTH && table !== multiplier && Math.random() < 0.5) {
    return [multiplier, table];
  }

  return [table, multiplier];
}

function normalizeOrderMode(value) {
  return String(value || "") === ORDER_MODES.ORDERED ? ORDER_MODES.ORDERED : ORDER_MODES.SHUFFLED;
}

function normalizeFactorPosition(value) {
  const safeValue = String(value || "");
  if (safeValue === FACTOR_POSITIONS.SECOND) return FACTOR_POSITIONS.SECOND;
  if (safeValue === FACTOR_POSITIONS.BOTH) return FACTOR_POSITIONS.BOTH;
  return FACTOR_POSITIONS.FIRST;
}

function normalizeNumberSelection(value, allowedValues, fallbackValues = []) {
  const allowed = new Set((Array.isArray(allowedValues) ? allowedValues : [])
    .map((item) => Math.floor(Number(item)))
    .filter((item) => Number.isFinite(item)));

  const rawItems = Array.isArray(value)
    ? value
    : String(value ?? "")
      .split(/[;,\s]+/g)
      .filter(Boolean);

  const selected = [];
  rawItems.forEach((item) => {
    const safeItem = Math.floor(Number(item));
    if (!Number.isFinite(safeItem) || !allowed.has(safeItem)) return;
    if (selected.includes(safeItem)) return;
    selected.push(safeItem);
  });

  if (selected.length) {
    return (Array.isArray(allowedValues) ? allowedValues : []).filter((item) => selected.includes(item));
  }

  const fallback = Array.isArray(fallbackValues) ? fallbackValues : [];
  return (Array.isArray(allowedValues) ? allowedValues : []).filter((item) => fallback.includes(item));
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
