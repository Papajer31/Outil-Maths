import { buildAllowedValuesFromConstraint, normalizeNumericConstraint } from "../../shared/value-constraints.js";

export const LIMITS = Object.freeze({
  minCount: 1,
  maxCount: 10
});

export const CHARACTER_SETS = Object.freeze({
  MINIBILLE_MAXIBILLE: "minibilleMaxibille",
  MATHIEU_MATHILDE: "mathieuMathilde"
});

export const CHARACTER_SET_VALUES = Object.freeze(Object.values(CHARACTER_SETS));

export const CHARACTER_SET_LABELS = Object.freeze({
  [CHARACTER_SETS.MINIBILLE_MAXIBILLE]: "Minibille / Maxibille",
  [CHARACTER_SETS.MATHIEU_MATHILDE]: "Mathieu / Mathilde"
});

export const TOKEN_MODES = Object.freeze({
  DISPLAYED: "displayed",
  COMPLETE: "complete",
  NONE: "none"
});

export const TOKEN_MODE_VALUES = Object.freeze(Object.values(TOKEN_MODES));

export const TOKEN_MODE_LABELS = Object.freeze({
  [TOKEN_MODES.DISPLAYED]: "Jetons affichés",
  [TOKEN_MODES.COMPLETE]: "Jetons à compléter",
  [TOKEN_MODES.NONE]: "Pas de jetons"
});

export const TRACE_MODES = Object.freeze({
  FREE: "free",
  ASSISTED: "assisted"
});

export const TRACE_MODE_VALUES = Object.freeze(Object.values(TRACE_MODES));

export const TRACE_MODE_LABELS = Object.freeze({
  [TRACE_MODES.FREE]: "Libre",
  [TRACE_MODES.ASSISTED]: "Aide au tracé"
});

export const DEFAULT_SETTINGS = Object.freeze({
  characterSet: CHARACTER_SETS.MINIBILLE_MAXIBILLE,
  collectionRange: Object.freeze({
    min: 1,
    max: 10,
    mode: "simple",
    start: 1,
    step: 1,
    values: []
  }),
  tokenMode: TOKEN_MODES.DISPLAYED,
  traceMode: TRACE_MODES.FREE
});

export function getDefaultSettings() {
  return normalizeSettings(DEFAULT_SETTINGS);
}

export function normalizeSettings(settings = {}) {
  const safeSettings = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const rawRange = safeSettings.collectionRange && typeof safeSettings.collectionRange === "object"
    ? safeSettings.collectionRange
    : safeSettings;

  const collectionRange = enforceComparableRange(normalizeNumericConstraint({
    min: rawRange.min,
    max: rawRange.max,
    mode: rawRange.mode,
    start: rawRange.start,
    step: rawRange.step,
    values: rawRange.values
  }, {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    defaultMin: DEFAULT_SETTINGS.collectionRange.min,
    defaultMax: DEFAULT_SETTINGS.collectionRange.max,
    defaultStart: DEFAULT_SETTINGS.collectionRange.start,
    defaultStep: DEFAULT_SETTINGS.collectionRange.step,
    defaultValues: DEFAULT_SETTINGS.collectionRange.values
  }));

  return {
    characterSet: normalizeCharacterSet(safeSettings.characterSet ?? safeSettings.characters),
    collectionRange,
    tokenMode: normalizeTokenMode(safeSettings.tokenMode ?? safeSettings.tokensMode ?? safeSettings.tokens),
    traceMode: normalizeTraceMode(safeSettings.traceMode ?? safeSettings.tracingMode ?? safeSettings.traces)
  };
}

export function pickQuestion(settings = {}, { avoidKey = "", attempts = 80 } = {}) {
  const cfg = normalizeSettings(settings);
  const pairsByDifference = buildPairsByDifference(cfg.collectionRange);
  const differences = Array.from(pairsByDifference.keys()).sort((a, b) => a - b);
  if (!differences.length) return null;

  let fallback = null;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const difference = differences[randomInt(0, differences.length - 1)];
    const pairs = pairsByDifference.get(difference) || [];
    if (!pairs.length) continue;

    const pair = pairs[randomInt(0, pairs.length - 1)];
    const question = buildQuestion(pair.smallCount, pair.bigCount, cfg);
    fallback = fallback || question;
    if (questionKey(question) !== avoidKey) return question;
  }
  return fallback;
}

export function questionKey(question = {}) {
  return [
    question?.characterSet || "",
    question?.smallCount || "",
    question?.bigCount || "",
    question?.tokenMode || "",
    question?.traceMode || ""
  ].join("|");
}

export function evaluateAnswer(question = {}, answer = "") {
  const expected = String(question.correctAnswer || "");
  const submitted = String(answer || "").trim();
  return {
    answered: submitted.length > 0,
    isCorrect: !!expected && submitted === expected,
    expected,
    submitted
  };
}

export function getCharacters(characterSet = DEFAULT_SETTINGS.characterSet) {
  const safeSet = normalizeCharacterSet(characterSet);
  if (safeSet === CHARACTER_SETS.MATHIEU_MATHILDE) {
    return {
      characterSet: safeSet,
      smallName: "Mathieu",
      bigName: "Mathilde",
      smallAssetId: "images-personnages-mathieu",
      bigAssetId: "images-personnages-mathilde",
      assetsAvailable: true
    };
  }

  return {
    characterSet: CHARACTER_SETS.MINIBILLE_MAXIBILLE,
    smallName: "Minibille",
    bigName: "Maxibille",
    smallAssetId: "images-comparaison-minibille",
    bigAssetId: "images-comparaison-maxibille",
    assetsAvailable: true
  };
}

export function getDefaultInstruction(settings = {}) {
  const cfg = normalizeSettings(settings);
  const characters = getCharacters(cfg.characterSet);
  return `Combien de jetons faut-il donner à ${characters.smallName} ?`;
}

function buildQuestion(smallCount, bigCount, settings) {
  const characters = getCharacters(settings.characterSet);
  const safeSmallCount = Math.max(LIMITS.minCount, Math.floor(Number(smallCount) || LIMITS.minCount));
  const safeBigCount = Math.max(safeSmallCount + 1, Math.floor(Number(bigCount) || safeSmallCount + 1));
  const difference = safeBigCount - safeSmallCount;

  return {
    characterSet: characters.characterSet,
    smallName: characters.smallName,
    bigName: characters.bigName,
    smallAssetId: characters.smallAssetId,
    bigAssetId: characters.bigAssetId,
    assetsAvailable: characters.assetsAvailable,
    smallCount: safeSmallCount,
    bigCount: safeBigCount,
    difference,
    correctAnswer: String(difference),
    tokenMode: settings.tokenMode,
    traceMode: settings.traceMode
  };
}

function buildPairsByDifference(range) {
  const values = buildAllowedValuesFromConstraint(range, {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    maxMaterializedValues: LIMITS.maxCount - LIMITS.minCount + 1
  }).filter((value) => Number.isInteger(value));

  const sortedValues = Array.from(new Set(values)).sort((a, b) => a - b);
  const valueSet = new Set(sortedValues);
  const pairsByDifference = new Map();

  sortedValues.forEach((smallCount) => {
    sortedValues.forEach((bigCount) => {
      if (bigCount <= smallCount) return;
      const difference = bigCount - smallCount;
      if (!valueSet.has(bigCount)) return;
      const pairs = pairsByDifference.get(difference) || [];
      pairs.push({ smallCount, bigCount });
      pairsByDifference.set(difference, pairs);
    });
  });

  return pairsByDifference;
}

function enforceComparableRange(range) {
  const normalized = range && typeof range === "object" ? { ...range } : normalizeNumericConstraint(DEFAULT_SETTINGS.collectionRange, {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount
  });

  if (normalized.min >= normalized.max) {
    if (normalized.max < LIMITS.maxCount) {
      normalized.max = normalized.min + 1;
    } else {
      normalized.min = Math.max(LIMITS.minCount, normalized.max - 1);
    }
  }

  const allowedValues = buildAllowedValuesFromConstraint(normalized, {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    maxMaterializedValues: LIMITS.maxCount - LIMITS.minCount + 1
  });

  if (allowedValues.length >= 2) {
    return {
      ...normalized,
      allowedValues,
      valueCount: allowedValues.length,
      isMaterialized: true
    };
  }

  return normalizeNumericConstraint(DEFAULT_SETTINGS.collectionRange, {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    defaultMin: DEFAULT_SETTINGS.collectionRange.min,
    defaultMax: DEFAULT_SETTINGS.collectionRange.max,
    defaultStart: DEFAULT_SETTINGS.collectionRange.start,
    defaultStep: DEFAULT_SETTINGS.collectionRange.step,
    defaultValues: DEFAULT_SETTINGS.collectionRange.values
  });
}

function normalizeCharacterSet(value) {
  const raw = String(value || "").trim();
  if (CHARACTER_SET_VALUES.includes(raw)) return raw;
  return DEFAULT_SETTINGS.characterSet;
}

function normalizeTokenMode(value) {
  const raw = String(value || "").trim();
  if (TOKEN_MODE_VALUES.includes(raw)) return raw;
  return DEFAULT_SETTINGS.tokenMode;
}

function normalizeTraceMode(value) {
  const raw = String(value || "").trim();
  if (TRACE_MODE_VALUES.includes(raw)) return raw;
  return DEFAULT_SETTINGS.traceMode;
}

function randomInt(min, max) {
  const safeMin = Math.ceil(Number(min));
  const safeMax = Math.floor(Number(max));
  if (!Number.isFinite(safeMin) || !Number.isFinite(safeMax) || safeMax <= safeMin) return safeMin || 0;
  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}
