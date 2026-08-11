import { COLLECTION_ALLOWED_EMOJIS } from "./tool-assets/collection-allowed-assets.js";

const COLLECTION_ALLOWED_EMOJI_BY_SLUG = new Map(
  COLLECTION_ALLOWED_EMOJIS.map((entry) => [String(entry.slug || "").trim().toLowerCase(), entry])
);

export function getCollectionEmojiAssets(assets = []) {
  const source = Array.isArray(assets) ? assets : [];

  return source
    .filter(isEmojiCollectionAsset)
    .map((asset) => {
      const slug = String(asset?.slug || asset?.id || "").trim().toLowerCase();
      const allowed = COLLECTION_ALLOWED_EMOJI_BY_SLUG.get(slug);
      if (!allowed) return null;
      const label = String(allowed.label || asset?.label || asset?.alt || slug).trim() || "objet";
      return {
        ...asset,
        id: slug,
        slug,
        label,
        alt: label
      };
    })
    .filter(Boolean);
}

export function isEmojiCollectionAsset(asset) {
  if (!asset || typeof asset !== "object") return false;
  if (String(asset.type || "image").trim().toLowerCase() !== "image") return false;
  const slug = String(asset.slug || asset.id || "").trim().toLowerCase();
  return slug.startsWith("emoji_") && COLLECTION_ALLOWED_EMOJI_BY_SLUG.has(slug);
}

export function pickCollectionAsset(assets = [], { avoidId = "", random = Math.random } = {}) {
  const pool = Array.isArray(assets) ? assets.filter(Boolean) : [];
  if (!pool.length) return null;
  const filtered = pool.length > 1 && avoidId
    ? pool.filter((asset) => String(asset.id || "") !== String(avoidId || ""))
    : pool;
  const source = filtered.length ? filtered : pool;
  const index = Math.max(0, Math.min(source.length - 1, Math.floor(random() * source.length)));
  return source[index] || source[0] || null;
}

function pickChoiceAsset(choiceAssets, index, fallbackAsset) {
  if (!Array.isArray(choiceAssets) || !choiceAssets.length) return fallbackAsset;
  return choiceAssets[index] || fallbackAsset;
}

export function buildHomogeneousCollectionItems({ count = 0, asset = null, idPrefix = "collection_item" } = {}) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const safePrefix = String(idPrefix || "collection_item").trim() || "collection_item";
  return Array.from({ length: safeCount }, (_, index) => ({
    id: `${safePrefix}_${index + 1}`,
    index,
    assetId: String(asset?.id || "").trim(),
    src: String(asset?.url || asset?.src || "").trim(),
    alt: String(asset?.alt || asset?.label || asset?.id || "objet").trim() || "objet",
    label: String(asset?.label || asset?.alt || asset?.id || "objet").trim() || "objet"
  }));
}

export function buildCollectionObject({ count = 1, asset = null, idPrefix = "collection_item" } = {}) {
  const safeCount = Math.max(1, Math.floor(Number(count) || 1));
  return {
    count: safeCount,
    assetId: String(asset?.id || "").trim(),
    assetSrc: String(asset?.url || asset?.src || "").trim(),
    assetAlt: String(asset?.alt || asset?.label || asset?.id || "objet").trim() || "objet",
    assetLabel: String(asset?.label || asset?.alt || asset?.id || "objet").trim() || "objet",
    items: buildHomogeneousCollectionItems({ count: safeCount, asset, idPrefix })
  };
}

export function buildQuantityComparisonQuestion({ targetCount = 1, shownCount = 1, asset = null } = {}) {
  const safeTarget = Math.max(1, Math.floor(Number(targetCount) || 1));
  const safeShown = Math.max(1, Math.floor(Number(shownCount) || 1));
  const isMatch = safeTarget === safeShown;
  const shownCollection = buildCollectionObject({ count: safeShown, asset, idPrefix: "shown_collection_item" });

  return {
    targetCount: safeTarget,
    shownCount: safeShown,
    delta: safeShown - safeTarget,
    isMatch,
    correctAnswer: isMatch ? "yes" : "no",
    assetId: shownCollection.assetId,
    assetSrc: shownCollection.assetSrc,
    assetAlt: shownCollection.assetAlt,
    assetLabel: shownCollection.assetLabel,
    items: shownCollection.items,
    shownCollection
  };
}

export function buildCollectionChoice({ id = "", count = 1, asset = null, correct = false } = {}) {
  const safeId = String(id || `choice_${count}`).trim();
  const collection = buildCollectionObject({ count, asset, idPrefix: `${safeId}_item` });
  return {
    id: safeId,
    count: collection.count,
    correct: Boolean(correct),
    collection
  };
}

export function buildCollectionQcmQuestion({
  targetCount = 1,
  distractorCount = 3,
  asset = null,
  promptAsset = null,
  choiceAssets = [],
  random = Math.random
} = {}) {
  const safeTarget = Math.max(1, Math.floor(Number(targetCount) || 1));
  const safeDistractorCount = Math.max(1, Math.min(3, Math.floor(Number(distractorCount) || 3)));
  const resolvedPromptAsset = promptAsset || asset;
  const promptCollection = buildCollectionObject({ count: safeTarget, asset: resolvedPromptAsset, idPrefix: "prompt_collection_item" });
  const distractorCounts = buildAdjacentDistractorCounts(safeTarget, safeDistractorCount, { random });
  const correctChoiceAsset = pickChoiceAsset(choiceAssets, 0, asset || resolvedPromptAsset);
  const choices = [
    buildCollectionChoice({ id: "choice_correct", count: safeTarget, asset: correctChoiceAsset, correct: true }),
    ...distractorCounts.map((count, index) => buildCollectionChoice({
      id: `choice_distractor_${index + 1}`,
      count,
      asset: pickChoiceAsset(choiceAssets, index + 1, asset || resolvedPromptAsset),
      correct: false
    }))
  ];

  return {
    targetCount: safeTarget,
    shownCount: safeTarget,
    correctAnswer: "choice_correct",
    assetId: promptCollection.assetId,
    assetSrc: promptCollection.assetSrc,
    assetAlt: promptCollection.assetAlt,
    assetLabel: promptCollection.assetLabel,
    promptCollection,
    choices: shuffle(choices, random)
  };
}

export function buildNumberLineQuestion({ targetCount = 1, amplitude = 7, asset = null, minValue = 1, maxValue = 20, random = Math.random } = {}) {
  const safeMin = Math.floor(Number(minValue) || 1);
  const safeMax = Math.max(safeMin, Math.floor(Number(maxValue) || 20));
  const safeTarget = Math.max(safeMin, Math.min(safeMax, Math.floor(Number(targetCount) || safeMin)));
  const safeAmplitude = Math.max(1, Math.min(safeMax - safeMin + 1, Math.floor(Number(amplitude) || 7)));
  const minStart = Math.max(safeMin, safeTarget - safeAmplitude + 1);
  const maxStart = Math.min(safeTarget, safeMax - safeAmplitude + 1);
  const start = randomInt(minStart, maxStart, random);
  const values = Array.from({ length: safeAmplitude }, (_, index) => start + index);
  const promptCollection = buildCollectionObject({ count: safeTarget, asset, idPrefix: "prompt_collection_item" });

  return {
    targetCount: safeTarget,
    shownCount: safeTarget,
    correctAnswer: String(safeTarget),
    assetId: promptCollection.assetId,
    assetSrc: promptCollection.assetSrc,
    assetAlt: promptCollection.assetAlt,
    assetLabel: promptCollection.assetLabel,
    promptCollection,
    numberLine: {
      start,
      amplitude: safeAmplitude,
      values
    }
  };
}

export function buildWriteNumberQuestion({ targetCount = 1, asset = null } = {}) {
  const safeTarget = Math.max(1, Math.floor(Number(targetCount) || 1));
  const promptCollection = buildCollectionObject({ count: safeTarget, asset, idPrefix: "prompt_collection_item" });

  return {
    targetCount: safeTarget,
    shownCount: safeTarget,
    correctAnswer: String(safeTarget),
    assetId: promptCollection.assetId,
    assetSrc: promptCollection.assetSrc,
    assetAlt: promptCollection.assetAlt,
    assetLabel: promptCollection.assetLabel,
    promptCollection
  };
}

export function buildAdjacentDistractorCounts(targetCount = 1, distractorCount = 3, { random = Math.random } = {}) {
  const target = Math.max(1, Math.floor(Number(targetCount) || 1));
  const count = Math.max(1, Math.min(3, Math.floor(Number(distractorCount) || 3)));
  const baseDeltas = target <= 1 ? [1] : [-1, 1];
  const deltas = [];

  for (let index = 0; index < count; index += 1) {
    if (baseDeltas.length === 1) {
      deltas.push(baseDeltas[0]);
    } else if (index < baseDeltas.length) {
      deltas.push(baseDeltas[index]);
    } else {
      deltas.push(baseDeltas[Math.floor(random() * baseDeltas.length)] || 1);
    }
  }

  return shuffle(deltas, random).map((delta) => Math.max(1, target + delta));
}

export function getCollectionQuestionKey(question = {}) {
  const choices = Array.isArray(question.choices)
    ? question.choices.map((choice) => `${choice.id}:${choice.count}:${choice.collection?.assetId || ""}`).join(",")
    : "";
  const line = Array.isArray(question.numberLine?.values)
    ? question.numberLine.values.join(",")
    : "";
  return [
    String(question.mode || ""),
    Number(question.targetCount) || 0,
    Number(question.shownCount) || 0,
    String(question.assetId || ""),
    choices,
    line
  ].join("|");
}

function shuffle(items, random = Math.random) {
  const arr = Array.isArray(items) ? [...items] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomInt(min, max, random = Math.random) {
  const safeMin = Math.floor(Number(min));
  const safeMax = Math.floor(Number(max));
  if (!Number.isFinite(safeMin) || !Number.isFinite(safeMax)) return 0;
  const lo = Math.min(safeMin, safeMax);
  const hi = Math.max(safeMin, safeMax);
  return lo + Math.floor(random() * (hi - lo + 1));
}
