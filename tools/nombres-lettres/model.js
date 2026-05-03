export const NUMBER_LIMITS = Object.freeze({
  min: 0,
  max: 999
});

export const QUESTION_DIRECTIONS = Object.freeze({
  NUMBER_TO_WORDS: "number_to_words",
  WORDS_TO_NUMBER: "words_to_number",
  MIXED: "mixed"
});

const SIMPLE_NUMBERS = Object.freeze([
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf"
]);

const TENS_LABELS = Object.freeze({
  20: "vingt",
  30: "trente",
  40: "quarante",
  50: "cinquante",
  60: "soixante"
});

export function getDefaultSettings() {
  return {
    min: NUMBER_LIMITS.min,
    max: NUMBER_LIMITS.max,
    direction: QUESTION_DIRECTIONS.NUMBER_TO_WORDS
  };
}

export function normalizeSettings(settings = {}) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  let min = clampInt(base.min, NUMBER_LIMITS.min, NUMBER_LIMITS.max);
  let max = clampInt(base.max, NUMBER_LIMITS.min, NUMBER_LIMITS.max);
  if (min > max) {
    const swap = min;
    min = max;
    max = swap;
  }

  const direction = normalizeDirection(base.direction);
  const allowedValues = [];
  for (let value = min; value <= max; value += 1) {
    allowedValues.push(value);
  }

  return {
    min,
    max,
    direction,
    allowedValues
  };
}

export function getAvailableQuestionDirections(settings = {}) {
  const direction = normalizeDirection(settings?.direction);
  if (direction === QUESTION_DIRECTIONS.MIXED) {
    return [QUESTION_DIRECTIONS.NUMBER_TO_WORDS, QUESTION_DIRECTIONS.WORDS_TO_NUMBER];
  }
  return [direction];
}

export function pickQuestion(settings = {}, { avoidKey = null } = {}) {
  const cfg = normalizeSettings(settings);
  if (!cfg.allowedValues.length) {
    throw new Error("Aucun nombre disponible pour Nombres en lettres.");
  }

  const directions = getAvailableQuestionDirections(cfg);
  if (!directions.length) {
    throw new Error("Aucune direction disponible pour Nombres en lettres.");
  }

  const fallback = buildQuestionCandidate(cfg);
  if (!avoidKey) {
    return fallback;
  }

  const maxAttempts = Math.max(8, cfg.allowedValues.length * directions.length * 2);
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = buildQuestionCandidate(cfg);
    if (questionKey(candidate) !== avoidKey) {
      return candidate;
    }
  }

  return fallback;
}

export function questionKey(question = {}) {
  return `${String(question?.direction || "").trim()}::${String(question?.value ?? "").trim()}`;
}

export function evaluateAnswer(question = {}, rawAnswer = "") {
  const answer = String(rawAnswer ?? "").trim();
  const expectedAnswer = String(question?.expectedAnswer ?? "").trim();
  return {
    answer,
    expectedAnswer,
    isCorrect: answer === expectedAnswer
  };
}

export function numberToFrenchWords(value) {
  const safeValue = clampInt(value, NUMBER_LIMITS.min, NUMBER_LIMITS.max);

  if (safeValue < 20) {
    return SIMPLE_NUMBERS[safeValue];
  }

  if (safeValue < 100) {
    return twoDigitsToFrenchWords(safeValue);
  }

  const hundreds = Math.floor(safeValue / 100);
  const remainder = safeValue % 100;

  let hundredLabel = hundreds === 1 ? "cent" : `${SIMPLE_NUMBERS[hundreds]}-cent`;
  if (remainder === 0 && hundreds > 1) {
    hundredLabel += "s";
  }

  if (remainder === 0) {
    return hundredLabel;
  }

  return `${hundredLabel}-${twoDigitsToFrenchWords(remainder)}`;
}

function buildQuestionCandidate(cfg) {
  const value = pickValue(cfg.allowedValues);
  const direction = pickDirection(cfg.direction);
  const words = numberToFrenchWords(value);

  if (direction === QUESTION_DIRECTIONS.WORDS_TO_NUMBER) {
    return {
      value,
      direction,
      prompt: "Écris ce nombre en chiffres.",
      displayPrimary: words,
      displaySecondary: String(value),
      expectedAnswer: String(value),
      answerKind: "number"
    };
  }

  return {
    value,
    direction: QUESTION_DIRECTIONS.NUMBER_TO_WORDS,
    prompt: "Écris ce nombre en lettres.",
    displayPrimary: String(value),
    displaySecondary: words,
    expectedAnswer: words,
    answerKind: "words"
  };
}

function pickValue(values) {
  const pool = Array.isArray(values) ? values : [];
  if (!pool.length) {
    throw new Error("Aucune valeur autorisée pour Nombres en lettres.");
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickDirection(direction) {
  const available = getAvailableQuestionDirections({ direction });
  return available[Math.floor(Math.random() * available.length)] || QUESTION_DIRECTIONS.NUMBER_TO_WORDS;
}

function twoDigitsToFrenchWords(value) {
  if (value < 20) {
    return SIMPLE_NUMBERS[value];
  }

  if (value < 70) {
    const tens = Math.floor(value / 10) * 10;
    const unit = value % 10;
    const base = TENS_LABELS[tens];
    if (unit === 0) return base;
    if (unit === 1) return `${base}-et-un`;
    return `${base}-${SIMPLE_NUMBERS[unit]}`;
  }

  if (value < 80) {
    const remainder = value - 60;
    if (remainder === 10) return "soixante-dix";
    if (remainder === 11) return "soixante-et-onze";
    return `soixante-${twoDigitsToFrenchWords(remainder)}`;
  }

  const remainder = value - 80;
  if (remainder === 0) return "quatre-vingts";
  if (remainder === 1) return "quatre-vingt-un";
  return `quatre-vingt-${twoDigitsToFrenchWords(remainder)}`;
}

function normalizeDirection(value) {
  const safeValue = String(value ?? "").trim().toLowerCase();
  if (safeValue === QUESTION_DIRECTIONS.NUMBER_TO_WORDS || safeValue === QUESTION_DIRECTIONS.WORDS_TO_NUMBER || safeValue === QUESTION_DIRECTIONS.MIXED) {
    return safeValue;
  }
  return QUESTION_DIRECTIONS.NUMBER_TO_WORDS;
}

function clampInt(value, min, max) {
  const parsed = Math.floor(Number(value));
  if (!Number.isFinite(parsed)) return min;
  return Math.min(max, Math.max(min, parsed));
}
