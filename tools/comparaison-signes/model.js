import { buildAllowedValuesFromConstraint, normalizeNumericConstraint } from "../../shared/value-constraints.js";
import { pickCollectionAsset } from "../../shared/collection-generator.js";

export const LIMITS = Object.freeze({
  minCount: 1,
  maxCount: 20
});

export const MODES = Object.freeze({
  CHOOSE_COLLECTION: "choose-collection",
  ORIENT_CROCODILE: "orient-crocodile",
  CHOOSE_SYMBOL: "choose-symbol"
});

export const MODE_VALUES = Object.freeze(Object.values(MODES));

export const MODE_LABELS = Object.freeze({
  [MODES.CHOOSE_COLLECTION]: "Que va manger le crocodile ?",
  [MODES.ORIENT_CROCODILE]: "Orienter le crocodile",
  [MODES.CHOOSE_SYMBOL]: "Compléter par < ou >"
});

export const LAYOUTS = Object.freeze({
  ROWS: "rows",
  CLOUD: "cloud",
  MIXED: "mixed"
});

export const LAYOUT_VALUES = Object.freeze(Object.values(LAYOUTS));

export const LAYOUT_LABELS = Object.freeze({
  [LAYOUTS.ROWS]: "Rangées",
  [LAYOUTS.CLOUD]: "Nuage",
  [LAYOUTS.MIXED]: "Mélangé"
});

export const REPRESENTATIONS = Object.freeze({
  COLLECTION: "collection",
  NUMBER: "number"
});

export const REPRESENTATION_VALUES = Object.freeze(Object.values(REPRESENTATIONS));

export const REPRESENTATION_LABELS = Object.freeze({
  [REPRESENTATIONS.COLLECTION]: "Collection",
  [REPRESENTATIONS.NUMBER]: "Nombre"
});

export const SIDES = Object.freeze({
  LEFT: "left",
  RIGHT: "right"
});

export const CROCODILE_STATES = Object.freeze({
  NEUTRAL: "neutral",
  LEFT: "left",
  RIGHT: "right"
});

const CROCODILE_ASSET_ID = "emoji_poisson";

export const DEFAULT_SETTINGS = Object.freeze({
  mode: MODES.CHOOSE_COLLECTION,
  layout: LAYOUTS.ROWS,
  leftRepresentation: REPRESENTATIONS.COLLECTION,
  rightRepresentation: REPRESENTATIONS.COLLECTION,
  maxDifference: 9,
  collectionRange: Object.freeze({
    min: 1,
    max: 10,
    mode: "simple",
    start: 1,
    step: 1,
    values: []
  })
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
  const maxDifferenceLimit = getMaximumDifferenceForRange(collectionRange);
  const rawMaxDifference = Number.parseInt(safeSettings.maxDifference, 10);
  const maxDifference = clampInt(
    Number.isFinite(rawMaxDifference) ? rawMaxDifference : maxDifferenceLimit,
    1,
    Math.max(1, maxDifferenceLimit)
  );

  return {
    mode: normalizeMode(safeSettings.mode),
    layout: normalizeLayout(safeSettings.layout ?? safeSettings.collectionLayout),
    leftRepresentation: normalizeRepresentation(safeSettings.leftRepresentation),
    rightRepresentation: normalizeRepresentation(safeSettings.rightRepresentation),
    maxDifference,
    collectionRange
  };
}

export function getMaximumDifferenceForRange(range = {}) {
  const values = Array.isArray(range?.allowedValues) && range.allowedValues.length
    ? range.allowedValues
    : buildAllowedValuesFromConstraint(range, {
      inputMin: LIMITS.minCount,
      inputMax: LIMITS.maxCount,
      maxMaterializedValues: LIMITS.maxCount - LIMITS.minCount + 1
    }).filter((value) => Number.isInteger(value));
  if (values.length < 2) return 1;
  const min = Math.min(...values);
  const max = Math.max(...values);
  return Math.max(1, max - min);
}

export function getInstruction(mode = MODES.CHOOSE_COLLECTION) {
  const safeMode = normalizeMode(mode);
  if (safeMode === MODES.ORIENT_CROCODILE) {
    return "Clique sur le crocodile pour indiquer ce qu’il va manger.";
  }
  if (safeMode === MODES.CHOOSE_SYMBOL) {
    return "Complète par < ou >.";
  }
  return "Que va manger le crocodile ?";
}

export function pickQuestion(settings = {}, { avoidKey = "", attempts = 120, assets = [] } = {}) {
  const cfg = normalizeSettings(settings);
  const values = buildAllowedValuesFromConstraint(cfg.collectionRange, {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    maxMaterializedValues: LIMITS.maxCount - LIMITS.minCount + 1
  }).filter((value) => Number.isInteger(value));

  const distinctValues = Array.from(new Set(values)).sort((a, b) => a - b);
  if (distinctValues.length < 2) return null;

  const eligiblePairs = [];
  for (let leftIndex = 0; leftIndex < distinctValues.length - 1; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < distinctValues.length; rightIndex += 1) {
      const difference = distinctValues[rightIndex] - distinctValues[leftIndex];
      if (difference >= 1 && difference <= cfg.maxDifference) {
        eligiblePairs.push([distinctValues[leftIndex], distinctValues[rightIndex]]);
      }
    }
  }
  if (!eligiblePairs.length) return null;

  let fallback = null;
  for (let attempt = 0; attempt < Math.max(1, Number(attempts) || 120); attempt += 1) {
    const pair = eligiblePairs[randomInt(0, eligiblePairs.length - 1)];
    let [leftCount, rightCount] = pair;

    // Équilibre la position de la plus grande valeur.
    if (Math.random() < 0.5) {
      [leftCount, rightCount] = [rightCount, leftCount];
    }

    const question = buildQuestion(leftCount, rightCount, cfg, assets);
    if (!question) return null;
    fallback = fallback || question;
    if (!avoidKey || questionKey(question) !== avoidKey) return question;
  }
  return fallback;
}

export function questionKey(question = {}) {
  return [
    String(question.mode || ""),
    Number(question.leftCount) || 0,
    Number(question.rightCount) || 0,
    String(question.leftRepresentation || ""),
    String(question.rightRepresentation || ""),
    String(question.layout || ""),
    String(question.assetId || "")
  ].join("|");
}

export function evaluateAnswer(question = {}, answer = "") {
  const submitted = String(answer || "").trim();
  const expected = String(question.correctAnswer || "").trim();
  return {
    answered: submitted.length > 0 && submitted !== CROCODILE_STATES.NEUTRAL,
    isCorrect: submitted.length > 0 && submitted === expected,
    submitted,
    expected
  };
}

function buildQuestion(leftCount, rightCount, settings, assets) {
  const mode = normalizeMode(settings.mode);
  const leftRepresentation = normalizeRepresentation(settings.leftRepresentation);
  const rightRepresentation = normalizeRepresentation(settings.rightRepresentation);
  const layout = settings.layout === LAYOUTS.MIXED
    ? (Math.random() < 0.5 ? LAYOUTS.ROWS : LAYOUTS.CLOUD)
    : normalizeLayout(settings.layout);
  const correctSide = leftCount > rightCount ? SIDES.LEFT : SIDES.RIGHT;
  const needsCollectionAsset = leftRepresentation === REPRESENTATIONS.COLLECTION
    || rightRepresentation === REPRESENTATIONS.COLLECTION;
  const assetPool = needsCollectionAsset ? getAssetPool(mode, assets) : [];
  const asset = needsCollectionAsset ? pickCollectionAsset(assetPool) : null;
  if (needsCollectionAsset && !asset) return null;

  return {
    mode,
    instruction: getInstruction(mode),
    leftCount,
    rightCount,
    leftRepresentation,
    rightRepresentation,
    layout,
    assetId: String(asset?.id || ""),
    assetSrc: String(asset?.url || asset?.src || ""),
    assetAlt: String(asset?.alt || asset?.label || "objet"),
    assetLabel: String(asset?.label || asset?.alt || "objet"),
    correctSide,
    correctSymbol: leftCount < rightCount ? "<" : ">",
    correctCrocodileState: correctSide,
    correctAnswer: mode === MODES.CHOOSE_SYMBOL
      ? (leftCount < rightCount ? "<" : ">")
      : correctSide,
    leftPositions: leftRepresentation === REPRESENTATIONS.COLLECTION && layout === LAYOUTS.CLOUD
      ? createCloudPositions(leftCount)
      : [],
    rightPositions: rightRepresentation === REPRESENTATIONS.COLLECTION && layout === LAYOUTS.CLOUD
      ? createCloudPositions(rightCount)
      : []
  };
}

function getAssetPool(mode, assets) {
  const source = Array.isArray(assets) ? assets.filter((asset) => asset?.url || asset?.src) : [];
  if (mode !== MODES.CHOOSE_SYMBOL) {
    return source.filter((asset) => String(asset?.id || asset?.slug || "").trim().toLowerCase() === CROCODILE_ASSET_ID);
  }
  return source;
}

function createCloudPositions(count) {
  const total = Math.max(1, Math.floor(Number(count) || 1));
  const points = [];
  const minDistance = total <= 6 ? 25 : total <= 10 ? 19 : total <= 15 ? 15 : 12;

  for (let index = 0; index < total; index += 1) {
    let best = null;
    let bestNearest = -1;
    for (let attempt = 0; attempt < 90; attempt += 1) {
      const candidate = {
        x: randomBetween(9, 91),
        y: randomBetween(10, 90),
        r: randomBetween(-14, 14)
      };
      const nearest = points.length
        ? Math.min(...points.map((point) => Math.hypot(point.x - candidate.x, point.y - candidate.y)))
        : Infinity;
      if (nearest >= minDistance) {
        best = candidate;
        break;
      }
      if (nearest > bestNearest) {
        best = candidate;
        bestNearest = nearest;
      }
    }
    points.push(best || { x: 50, y: 50, r: 0 });
  }

  return points;
}

function enforceComparableRange(range) {
  const normalized = range && typeof range === "object" ? { ...range } : {};
  const allowedValues = buildAllowedValuesFromConstraint(normalized, {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    maxMaterializedValues: LIMITS.maxCount - LIMITS.minCount + 1
  }).filter((value) => Number.isInteger(value));

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

function normalizeMode(value) {
  const raw = String(value || "").trim();
  return MODE_VALUES.includes(raw) ? raw : DEFAULT_SETTINGS.mode;
}

function normalizeLayout(value) {
  const raw = String(value || "").trim();
  return LAYOUT_VALUES.includes(raw) ? raw : DEFAULT_SETTINGS.layout;
}

function normalizeRepresentation(value) {
  const raw = String(value || "").trim();
  return REPRESENTATION_VALUES.includes(raw) ? raw : REPRESENTATIONS.COLLECTION;
}

function clampInt(value, min, max) {
  const number = Number.parseInt(value, 10);
  const safe = Number.isFinite(number) ? number : min;
  return Math.max(min, Math.min(max, safe));
}

function randomInt(min, max) {
  const safeMin = Math.ceil(Number(min));
  const safeMax = Math.floor(Number(max));
  if (!Number.isFinite(safeMin) || !Number.isFinite(safeMax) || safeMax <= safeMin) return safeMin || 0;
  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}

function randomBetween(min, max) {
  return Number(min) + Math.random() * (Number(max) - Number(min));
}
