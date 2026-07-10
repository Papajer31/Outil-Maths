export const LIST_TYPES = Object.freeze({
  LETTERS: "letters",
  WORDS: "words"
});

export const CASE_MODES = Object.freeze({
  LOWER: "lower",
  UPPER: "upper",
  PER_QUESTION: "per_question",
  MIXED: "mixed"
});

export const WRITING_MODES = Object.freeze({
  SCRIPT: "script",
  CURSIVE: "cursive",
  PER_QUESTION: "per_question",
  MIXED: "mixed"
});

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const COLLATOR = new Intl.Collator("fr", {
  usage: "sort",
  sensitivity: "variant",
  ignorePunctuation: false
});

export function getDefaultSettings() {
  return {
    listType: LIST_TYPES.LETTERS,
    itemCount: 4,
    caseMode: CASE_MODES.LOWER,
    writingMode: WRITING_MODES.SCRIPT,
    showAlphabet: false,
    visualHint: false
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  base.listType = LIST_TYPES.LETTERS;
  base.itemCount = clampInt(base.itemCount, 2, 6);
  base.caseMode = Object.values(CASE_MODES).includes(base.caseMode)
    ? base.caseMode
    : CASE_MODES.LOWER;
  base.writingMode = Object.values(WRITING_MODES).includes(base.writingMode)
    ? base.writingMode
    : WRITING_MODES.SCRIPT;
  base.showAlphabet = normalizeBoolean(base.showAlphabet);
  base.visualHint = false;

  return base;
}

export function canGenerateQuestion(settings) {
  const cfg = normalizeSettings(settings);
  return cfg.itemCount <= ALPHABET.length;
}

export function pickQuestion(settings, { avoidKey = null, attempts = 100 } = {}) {
  const cfg = normalizeSettings(settings);
  const count = clampInt(cfg.itemCount, 2, 6);
  if (count > ALPHABET.length) return null;

  let fallback = null;

  for (let i = 0; i < attempts; i += 1) {
    const baseLetters = pickDistinctItems(ALPHABET, count).sort((a, b) => COLLATOR.compare(a, b));
    const questionCaseMode = cfg.caseMode === CASE_MODES.PER_QUESTION ? randomChoice([CASE_MODES.LOWER, CASE_MODES.UPPER]) : cfg.caseMode;
    const questionWritingMode = cfg.writingMode === WRITING_MODES.PER_QUESTION ? randomChoice([WRITING_MODES.SCRIPT, WRITING_MODES.CURSIVE]) : cfg.writingMode;

    const descriptors = baseLetters.map((letter) => {
      const caseValue = questionCaseMode === CASE_MODES.MIXED
        ? randomChoice([CASE_MODES.LOWER, CASE_MODES.UPPER])
        : questionCaseMode;
      const writingValue = questionWritingMode === WRITING_MODES.MIXED
        ? randomChoice([WRITING_MODES.SCRIPT, WRITING_MODES.CURSIVE])
        : questionWritingMode;
      const display = formatLetter(letter, caseValue);
      return {
        base: letter,
        value: display,
        case: caseValue,
        writing: writingValue
      };
    });

    const answerItems = descriptors.map((item) => item.value);
    const itemMeta = descriptors.map((item) => ({ ...item }));
    const displayItems = shuffleUntilDifferent(answerItems);
    const prompt = count === 1
      ? "Range cette lettre dans l’ordre alphabétique."
      : "Range ces lettres dans l’ordre alphabétique.";

    const question = {
      mode: LIST_TYPES.LETTERS,
      prompt,
      items: displayItems,
      answerItems,
      itemMeta,
      key: `letters|${descriptors.map((item) => `${item.base}:${item.case}:${item.writing}`).join("¦")}`
    };

    if (!fallback) fallback = question;
    if (!avoidKey || question.key !== avoidKey) return question;
  }

  return fallback;
}

export function questionKey(question) {
  return String(question?.key || "");
}

export function sortAlphabetically(values) {
  return [...(Array.isArray(values) ? values : [])].sort((a, b) => COLLATOR.compare(String(a || ""), String(b || "")));
}

export function isAnswerCorrect(answerItems, expectedItems) {
  return arraysEqual(
    Array.isArray(answerItems) ? answerItems : [],
    Array.isArray(expectedItems) ? expectedItems : []
  );
}

export function getDiscriminatingLetterRanges() {
  return new Map();
}

function formatLetter(letter, caseValue) {
  const value = String(letter || "").slice(0, 1) || "A";
  return caseValue === CASE_MODES.UPPER ? value.toUpperCase() : value.toLowerCase();
}

function pickDistinctItems(items, count) {
  const pool = [...items];
  const out = [];
  while (pool.length && out.length < count) {
    const index = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

function shuffleUntilDifferent(items) {
  const source = Array.isArray(items) ? items : [];
  if (source.length <= 1) return [...source];

  for (let i = 0; i < 20; i += 1) {
    const shuffled = shuffle(source);
    if (!arraysEqual(shuffled, source)) return shuffled;
  }

  const fallback = [...source];
  fallback.reverse();
  return fallback;
}

function shuffle(items) {
  const out = [...(Array.isArray(items) ? items : [])];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function randomChoice(items) {
  const safeItems = Array.isArray(items) && items.length ? items : [null];
  return safeItems[Math.floor(Math.random() * safeItems.length)];
}

function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function normalizeBoolean(value) {
  return value === true || value === "true" || value === "1" || value === 1 || value === "yes";
}

function clampInt(value, min, max) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
