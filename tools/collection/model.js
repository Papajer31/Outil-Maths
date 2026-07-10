import { normalizeNumericConstraint, pickValueFromConstraint } from "../../shared/value-constraints.js";
import {
  buildCollectionQcmQuestion,
  buildNumberLineQuestion,
  buildQuantityComparisonQuestion,
  buildWriteNumberQuestion,
  getCollectionQuestionKey,
  pickCollectionAsset
} from "../../shared/collection-generator.js";

export const LIMITS = Object.freeze({
  minCount: 1,
  maxCount: 20,
  distractorMin: 1,
  distractorMax: 3,
  numberLineAmplitudeMin: 3,
  numberLineAmplitudeMax: 20
});

export const COLLECTION_MODES = Object.freeze({
  VERIFY: "verify",
  MATCH_COLLECTION: "matchCollection",
  NUMBER_TO_COLLECTION: "numberToCollection",
  NUMBER_LINE: "numberLine",
  WRITE_NUMBER: "writeNumber"
});

export const COLLECTION_MODE_VALUES = Object.freeze(Object.values(COLLECTION_MODES));

export const COLLECTION_MODE_LABELS = Object.freeze({
  [COLLECTION_MODES.VERIFY]: "Vérifier une collection",
  [COLLECTION_MODES.MATCH_COLLECTION]: "Retrouver la même collection",
  [COLLECTION_MODES.NUMBER_TO_COLLECTION]: "Trouver la collection du nombre",
  [COLLECTION_MODES.NUMBER_LINE]: "Trouver le nombre sur la file",
  [COLLECTION_MODES.WRITE_NUMBER]: "Écrire le nombre"
});

export const MODE_DEFAULT_INSTRUCTIONS = Object.freeze({
  [COLLECTION_MODES.VERIFY]: "La collection est-elle correcte ?",
  [COLLECTION_MODES.MATCH_COLLECTION]: "Retrouve la même collection.",
  [COLLECTION_MODES.NUMBER_TO_COLLECTION]: "Trouve la collection du nombre.",
  [COLLECTION_MODES.NUMBER_LINE]: "Trouve le nombre sur la file.",
  [COLLECTION_MODES.WRITE_NUMBER]: "Écris le nombre."
});

export const ANSWERS = Object.freeze({
  YES: "yes",
  NO: "no"
});

export const DEFAULT_SETTINGS = Object.freeze({
  mode: COLLECTION_MODES.VERIFY,
  numberRange: Object.freeze({
    min: 1,
    max: 10,
    mode: "simple",
    start: 1,
    step: 1,
    values: []
  }),
  distractorCount: 3,
  numberLineAmplitude: 7
});

export function getDefaultSettings() {
  return normalizeSettings(DEFAULT_SETTINGS);
}

export function normalizeSettings(settings = {}) {
  const safeSettings = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const rawRange = safeSettings.numberRange && typeof safeSettings.numberRange === "object"
    ? safeSettings.numberRange
    : safeSettings;

  const numberRange = normalizeNumericConstraint({
    min: rawRange.min,
    max: rawRange.max,
    mode: rawRange.mode,
    start: rawRange.start,
    step: rawRange.step,
    values: rawRange.values
  }, {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    defaultMin: DEFAULT_SETTINGS.numberRange.min,
    defaultMax: DEFAULT_SETTINGS.numberRange.max,
    defaultStart: DEFAULT_SETTINGS.numberRange.start,
    defaultStep: DEFAULT_SETTINGS.numberRange.step,
    defaultValues: DEFAULT_SETTINGS.numberRange.values
  });

  const mode = normalizeMode(safeSettings.mode ?? safeSettings.responseMode ?? safeSettings.answerMode);
  const distractorCount = clampInt(safeSettings.distractorCount, LIMITS.distractorMin, LIMITS.distractorMax, DEFAULT_SETTINGS.distractorCount);
  const numberLineAmplitude = clampInt(safeSettings.numberLineAmplitude, LIMITS.numberLineAmplitudeMin, LIMITS.numberLineAmplitudeMax, DEFAULT_SETTINGS.numberLineAmplitude);

  return {
    mode,
    numberRange,
    distractorCount,
    numberLineAmplitude
  };
}

export function pickQuestion(settings = {}, { avoidKey = "", avoidAssetId = "", assets = [], attempts = 80 } = {}) {
  const cfg = normalizeSettings(settings);
  if (!Array.isArray(assets) || assets.length === 0) return null;

  let fallback = null;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const question = buildQuestion(cfg, { assets, avoidAssetId });
    if (!question) continue;
    fallback = fallback || question;
    if (questionKey(question) !== avoidKey) return question;
  }
  return fallback;
}

export function questionKey(question = {}) {
  return getCollectionQuestionKey(question);
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

export function getDefaultInstructionForMode(mode) {
  const safeMode = normalizeMode(mode);
  return MODE_DEFAULT_INSTRUCTIONS[safeMode] || MODE_DEFAULT_INSTRUCTIONS[COLLECTION_MODES.VERIFY];
}

function buildQuestion(settings, { assets = [], avoidAssetId = "" } = {}) {
  const targetCount = pickValueFromConstraint(settings.numberRange, {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount
  });
  if (!Number.isInteger(targetCount)) return null;

  if (settings.mode === COLLECTION_MODES.MATCH_COLLECTION) {
    const requiredAssetCount = settings.distractorCount + 2;
    const distinctAssets = pickDistinctCollectionAssets(assets, {
      count: requiredAssetCount,
      avoidId: avoidAssetId
    });
    if (distinctAssets.length < requiredAssetCount) return null;

    const [promptAsset, ...choiceAssets] = distinctAssets;
    return {
      mode: settings.mode,
      ...buildCollectionQcmQuestion({
        targetCount,
        distractorCount: settings.distractorCount,
        promptAsset,
        choiceAssets
      })
    };
  }

  if (settings.mode === COLLECTION_MODES.NUMBER_TO_COLLECTION) {
    const requiredAssetCount = settings.distractorCount + 1;
    const choiceAssets = pickDistinctCollectionAssets(assets, {
      count: requiredAssetCount,
      avoidId: avoidAssetId
    });
    if (choiceAssets.length < requiredAssetCount) return null;

    return {
      mode: settings.mode,
      ...buildCollectionQcmQuestion({
        targetCount,
        distractorCount: settings.distractorCount,
        asset: choiceAssets[0],
        choiceAssets
      })
    };
  }

  const asset = pickCollectionAsset(assets, { avoidId: avoidAssetId });
  if (!asset) return null;

  if (settings.mode === COLLECTION_MODES.NUMBER_LINE) {
    return {
      mode: settings.mode,
      ...buildNumberLineQuestion({
        targetCount,
        amplitude: settings.numberLineAmplitude,
        asset,
        minValue: LIMITS.minCount,
        maxValue: LIMITS.maxCount
      })
    };
  }

  if (settings.mode === COLLECTION_MODES.WRITE_NUMBER) {
    return {
      mode: settings.mode,
      ...buildWriteNumberQuestion({ targetCount, asset })
    };
  }

  const delta = pickQuantityDelta(targetCount);
  const shownCount = targetCount + delta;
  return {
    mode: COLLECTION_MODES.VERIFY,
    ...buildQuantityComparisonQuestion({
      targetCount,
      shownCount,
      asset
    })
  };
}

function pickQuantityDelta(targetCount) {
  const roll = Math.random();
  if (roll < 0.5) return 0;
  if (roll < 0.75) {
    return targetCount > LIMITS.minCount ? -1 : 1;
  }
  return 1;
}

function normalizeMode(value) {
  const raw = String(value || "").trim();
  if (COLLECTION_MODE_VALUES.includes(raw)) return raw;
  return COLLECTION_MODES.VERIFY;
}

function pickDistinctCollectionAssets(assets = [], { count = 1, avoidId = "" } = {}) {
  const requiredCount = Math.max(1, Math.floor(Number(count) || 1));
  const uniqueAssets = dedupeAssets(assets);
  if (uniqueAssets.length < requiredCount) return [];

  const preferredAssets = avoidId && uniqueAssets.length > requiredCount
    ? uniqueAssets.filter((asset) => getAssetKey(asset) !== String(avoidId || ""))
    : uniqueAssets;
  const source = preferredAssets.length >= requiredCount ? preferredAssets : uniqueAssets;
  return shuffle(source).slice(0, requiredCount);
}

function dedupeAssets(assets = []) {
  const seen = new Set();
  const result = [];
  (Array.isArray(assets) ? assets : []).forEach((asset) => {
    const key = getAssetKey(asset);
    if (!key || seen.has(key)) return;
    seen.add(key);
    result.push(asset);
  });
  return result;
}

function getAssetKey(asset) {
  return String(asset?.id || asset?.url || asset?.src || "").trim();
}

function shuffle(items = []) {
  const arr = Array.isArray(items) ? [...items] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clampInt(value, min, max, fallback) {
  const parsed = Math.floor(Number(value));
  const n = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, n));
}
