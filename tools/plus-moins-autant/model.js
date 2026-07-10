export const LAYOUTS = Object.freeze({
  RANDOM: "random",
  SEPARATED: "separated",
  PAIRED: "paired"
});

export const OBJECT_STYLES = Object.freeze({
  CUBES: "cubes",
  TOKENS: "tokens",
  EMOJIS: "emojis"
});

export const GAP_VALUES = Object.freeze(["0", "1", "2", "3plus"]);
export const OBJECT_STYLE_VALUES = Object.freeze(Object.values(OBJECT_STYLES));
export const LAYOUT_VALUES = Object.freeze(Object.values(LAYOUTS));

export const PROMPT_MODES = Object.freeze({
  MORE: "more",
  LESS: "less"
});

export const PROMPT_MODE_VALUES = Object.freeze(Object.values(PROMPT_MODES));

export const LIMITS = Object.freeze({
  minCount: 1,
  maxCount: 20
});

export const DEFAULT_SETTINGS = Object.freeze({
  layout: LAYOUTS.SEPARATED,
  layouts: [LAYOUTS.SEPARATED],
  collectionSize: { min: 3, max: 8 },
  gaps: ["0", "1", "2"],
  objectStyles: [OBJECT_STYLES.CUBES],
  promptModes: [PROMPT_MODES.MORE, PROMPT_MODES.LESS]
});

export const ANSWERS = Object.freeze({
  RED: "red",
  BLUE: "blue",
  EQUAL: "equal"
});

const EMOJI_POOL = Object.freeze(["🚀", "⚽", "🎈", "🔔", "💡", "🏆", "⭐", "🍎", "🐟", "🧸", "🎲", "🌙"]);

export function getDefaultSettings() {
  return normalizeSettings(DEFAULT_SETTINGS);
}

export function normalizeSettings(settings = {}) {
  const safeSettings = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const layouts = normalizeStringList(
    safeSettings.layouts ?? safeSettings.layout,
    LAYOUT_VALUES,
    DEFAULT_SETTINGS.layouts
  );
  const collectionSize = normalizeCollectionSize(safeSettings.collectionSize ?? safeSettings);
  const gaps = normalizeStringList(safeSettings.gaps, GAP_VALUES, DEFAULT_SETTINGS.gaps);
  const objectStyles = normalizeStringList(safeSettings.objectStyles, OBJECT_STYLE_VALUES, DEFAULT_SETTINGS.objectStyles);
  const promptModes = normalizeStringList(safeSettings.promptModes ?? safeSettings.promptMode, PROMPT_MODE_VALUES, DEFAULT_SETTINGS.promptModes);

  return {
    layout: layouts[0] || DEFAULT_SETTINGS.layout,
    layouts,
    collectionSize,
    gaps,
    objectStyles,
    promptModes
  };
}

export function canGenerateQuestion(settings = {}) {
  return getViableGaps(normalizeSettings(settings)).length > 0;
}

export function getImpossibleMessage(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (getViableGaps(cfg).length > 0) return "";
  return "Aucune question possible : l’écart choisi est trop grand pour la taille des collections.";
}

export function pickQuestion(settings = {}, { avoidKey = "", attempts = 120 } = {}) {
  const cfg = normalizeSettings(settings);
  const viableGaps = getViableGaps(cfg);
  if (!viableGaps.length) return null;

  let fallback = null;
  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const question = buildQuestion(cfg, viableGaps);
    if (!question) continue;
    fallback = fallback || question;
    if (questionKey(question) !== avoidKey) return question;
  }
  return fallback;
}

export function questionKey(question = {}) {
  return [
    Number(question.redCount) || 0,
    Number(question.blueCount) || 0,
    String(question.promptMode || ""),
    String(question.layout || ""),
    String(question.objectStyle || ""),
    String(question.redEmoji || ""),
    String(question.blueEmoji || "")
  ].join("|");
}

export function evaluateAnswer(question = {}, answer = "") {
  const expected = String(question.correctAnswer || "");
  const submitted = String(answer || "");
  return {
    answered: submitted === ANSWERS.RED || submitted === ANSWERS.BLUE || submitted === ANSWERS.EQUAL,
    isCorrect: !!expected && submitted === expected,
    expected,
    submitted
  };
}

export function getAnswerLabel(answer) {
  if (answer === ANSWERS.RED) return "rouges";
  if (answer === ANSWERS.BLUE) return "bleus";
  if (answer === ANSWERS.EQUAL) return "autant";
  return "";
}

export function getCorrectionMessage(question = {}) {
  const red = Number(question.redCount) || 0;
  const blue = Number(question.blueCount) || 0;
  if (red === blue) {
    return "Il y en a autant.";
  }
  const diff = Math.abs(red - blue);
  const asksLess = question.promptMode === PROMPT_MODES.LESS;
  const color = asksLess
    ? red < blue ? "rouge" : "bleu"
    : red > blue ? "rouge" : "bleu";
  const colorPlural = `${color}s`;
  const quantity = asksLess ? "moins" : "plus";
  return `Il y a ${diff} objet${diff > 1 ? "s" : ""} de ${quantity} chez les ${colorPlural}.`;
}

function buildQuestion(cfg, viableGaps) {
  const gapKey = pickRandom(viableGaps);
  const gap = resolveGapValue(gapKey, cfg.collectionSize);
  if (!Number.isInteger(gap) || gap < 0) return null;

  const min = cfg.collectionSize.min;
  const max = cfg.collectionSize.max;
  const smallMax = Math.max(min, max - gap);
  if (smallMax < min) return null;

  const smaller = randomInt(min, smallMax);
  const larger = smaller + gap;
  const majority = gap === 0 ? ANSWERS.EQUAL : pickRandom([ANSWERS.RED, ANSWERS.BLUE]);
  const redCount = majority === ANSWERS.BLUE ? smaller : larger;
  const blueCount = majority === ANSWERS.RED ? smaller : larger;
  const promptMode = pickRandom(cfg.promptModes);
  const objectStyle = pickRandom(cfg.objectStyles);
  const emojis = objectStyle === OBJECT_STYLES.EMOJIS ? pickDistinctEmojis() : { red: "", blue: "" };
  const layout = pickRandom(cfg.layouts);
  const items = buildItems({ redCount, blueCount, objectStyle, emojis, layout });

  return {
    redCount,
    blueCount,
    promptMode,
    correctAnswer: getCorrectAnswer({ redCount, blueCount, promptMode }),
    objectStyle,
    redEmoji: emojis.red,
    blueEmoji: emojis.blue,
    layout,
    gap,
    items
  };
}

function getCorrectAnswer({ redCount, blueCount, promptMode }) {
  if (redCount === blueCount) return ANSWERS.EQUAL;
  if (promptMode === PROMPT_MODES.LESS) {
    return redCount < blueCount ? ANSWERS.RED : ANSWERS.BLUE;
  }
  return redCount > blueCount ? ANSWERS.RED : ANSWERS.BLUE;
}

function buildItems({ redCount, blueCount, objectStyle, emojis, layout }) {
  const redItems = Array.from({ length: redCount }, (_, index) => createItem({ color: ANSWERS.RED, index, objectStyle, emojis }));
  const blueItems = Array.from({ length: blueCount }, (_, index) => createItem({ color: ANSWERS.BLUE, index, objectStyle, emojis }));
  const items = [...redItems, ...blueItems];
  const positions = createInitialPositions(redItems, blueItems, layout);
  items.forEach((item) => {
    const pos = positions.get(item.id) || { x: randomInt(14, 86), y: randomInt(16, 84) };
    item.x = pos.x;
    item.y = pos.y;
  });
  return shuffle(items);
}

function createItem({ color, index, objectStyle, emojis }) {
  return {
    id: `${color}_${index + 1}_${randomId()}`,
    color,
    index,
    objectStyle,
    emoji: color === ANSWERS.BLUE ? emojis?.blue || "" : emojis?.red || "",
    x: 50,
    y: 50
  };
}

function createInitialPositions(redItems, blueItems, layout) {
  if (layout === LAYOUTS.PAIRED) return createPairedPositions(redItems, blueItems);
  if (layout === LAYOUTS.RANDOM) return createRandomPositions([...redItems, ...blueItems]);
  return createSeparatedPositions(redItems, blueItems);
}

function createSeparatedPositions(redItems, blueItems) {
  const map = new Map();
  placeRandomCloud(redItems, { xMin: 13, xMax: 43, yMin: 14, yMax: 86 }, map);
  placeRandomCloud(blueItems, { xMin: 57, xMax: 87, yMin: 14, yMax: 86 }, map);
  return map;
}

function createPairedPositions(redItems, blueItems) {
  const map = new Map();
  const pairs = Math.min(redItems.length, blueItems.length);
  const placedItems = [];

  for (let index = 0; index < pairs; index += 1) {
    const pair = createRandomPairPosition(placedItems, pairs, redItems[index]);
    placedItems.push(pair.red, pair.blue);
    map.set(redItems[index].id, pair.red);
    map.set(blueItems[index].id, pair.blue);
  }

  const extraRed = redItems.slice(pairs);
  const extraBlue = blueItems.slice(pairs);
  placeRandomCloud([...extraRed, ...extraBlue], { xMin: 12, xMax: 88, yMin: 14, yMax: 86 }, map, {
    placed: placedItems,
    minDistance: getRandomItemDistance(redItems.length + blueItems.length)
  });
  return map;
}

function createRandomPositions(items) {
  const map = new Map();
  placeRandomCloud(items, { xMin: 12, xMax: 88, yMin: 14, yMax: 86 }, map);
  return map;
}

function placeRandomCloud(items, bounds, map, { placed = [], minDistance = getRandomItemDistance(items.length) } = {}) {
  const placedPositions = [...placed];
  items.forEach((item, index) => {
    const candidate = pickRandomOpenPosition(bounds, placedPositions, Math.max(9.5, minDistance - index * .08));
    placedPositions.push(candidate);
    map.set(item.id, candidate);
  });
}

function createRandomPairPosition(placedItems, pairCount, sampleItem) {
  const pairGap = getInitialPairGap(pairCount, sampleItem?.objectStyle);
  const margin = pairGap / 2 + 10;
  const bounds = { xMin: margin, xMax: 100 - margin, yMin: margin, yMax: 100 - margin };
  const minDistance = getRandomPairDistance(pairCount);
  let best = null;

  for (let attempt = 0; attempt < 180; attempt += 1) {
    const angle = pickPairAngle();
    const dx = Math.cos(angle) * pairGap / 2;
    const dy = Math.sin(angle) * pairGap / 2;
    const center = {
      x: randomFloat(bounds.xMin, bounds.xMax),
      y: randomFloat(bounds.yMin, bounds.yMax)
    };
    const candidate = {
      center,
      red: { x: center.x - dx, y: center.y - dy },
      blue: { x: center.x + dx, y: center.y + dy }
    };
    const score = Math.min(
      getNearestDistance(candidate.red, placedItems),
      getNearestDistance(candidate.blue, placedItems)
    );
    if (score >= minDistance) return candidate;
    if (!best || score > best.score) best = { ...candidate, score };
  }

  return best || {
    center: { x: 50, y: 50 },
    red: { x: 50 - pairGap / 2, y: 50 },
    blue: { x: 50 + pairGap / 2, y: 50 }
  };
}

function pickRandomOpenPosition(bounds, placed, minDistance) {
  const safeBounds = normalizeBounds(bounds);
  let best = null;
  for (let attempt = 0; attempt < 260; attempt += 1) {
    const candidate = {
      x: randomFloat(safeBounds.xMin, safeBounds.xMax),
      y: randomFloat(safeBounds.yMin, safeBounds.yMax)
    };
    const nearest = getNearestDistance(candidate, placed);
    if (!best || nearest > best.score) best = { ...candidate, score: nearest };
    if (nearest >= minDistance) {
      return candidate;
    }
  }

  return best || {
    x: randomFloat(safeBounds.xMin, safeBounds.xMax),
    y: randomFloat(safeBounds.yMin, safeBounds.yMax)
  };
}

function normalizeBounds(bounds = {}) {
  const xMin = Number(bounds.xMin);
  const xMax = Number(bounds.xMax);
  const yMin = Number(bounds.yMin);
  const yMax = Number(bounds.yMax);
  return {
    xMin: Number.isFinite(xMin) ? xMin : 12,
    xMax: Number.isFinite(xMax) ? xMax : 88,
    yMin: Number.isFinite(yMin) ? yMin : 14,
    yMax: Number.isFinite(yMax) ? yMax : 86
  };
}

function getRandomItemDistance(count) {
  if (count <= 6) return 20;
  if (count <= 10) return 17;
  if (count <= 16) return 14;
  return 11;
}

function getRandomPairDistance(count) {
  if (count <= 4) return 25;
  if (count <= 8) return 21;
  if (count <= 14) return 17;
  return 13;
}

function getInitialPairGap(pairCount, objectStyle) {
  const base = objectStyle === OBJECT_STYLES.EMOJIS ? 13 : 14.5;
  if (pairCount <= 6) return base + 1;
  if (pairCount <= 12) return base;
  return base - 1.2;
}

function pickPairAngle() {
  const base = Math.random() < .5 ? 0 : Math.PI;
  return base + randomFloat(-Math.PI / 7, Math.PI / 7);
}

function getNearestDistance(candidate, placed) {
  if (!placed.length) return Infinity;
  return placed.reduce((best, pos) => Math.min(best, distance(pos, candidate)), Infinity);
}

function getViableGaps(cfg) {
  const delta = cfg.collectionSize.max - cfg.collectionSize.min;
  return cfg.gaps.filter((gap) => {
    if (gap === "0") return true;
    if (gap === "1") return delta >= 1;
    if (gap === "2") return delta >= 2;
    if (gap === "3plus") return delta >= 3;
    return false;
  });
}

function resolveGapValue(gapKey, collectionSize) {
  if (gapKey === "0") return 0;
  if (gapKey === "1") return 1;
  if (gapKey === "2") return 2;
  if (gapKey === "3plus") {
    const maxGap = Math.max(3, collectionSize.max - collectionSize.min);
    return randomInt(3, maxGap);
  }
  return 0;
}

function normalizeCollectionSize(value = {}) {
  const safe = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const rawMin = safe.min ?? safe.collectionMin ?? safe.minCount ?? DEFAULT_SETTINGS.collectionSize.min;
  const rawMax = safe.max ?? safe.collectionMax ?? safe.maxCount ?? DEFAULT_SETTINGS.collectionSize.max;
  let min = clampInt(rawMin, LIMITS.minCount, LIMITS.maxCount);
  let max = clampInt(rawMax, LIMITS.minCount, LIMITS.maxCount);
  if (min > max) [min, max] = [max, min];
  return { min, max };
}

function normalizeStringList(value, allowedValues, fallbackValues) {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const allowed = new Set(allowedValues.map(String));
  const result = [];
  raw.forEach((item) => {
    const safe = String(item ?? "").trim();
    if (!allowed.has(safe) || result.includes(safe)) return;
    result.push(safe);
  });
  return result.length ? result : [...fallbackValues];
}

function clampInt(value, min, max) {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function pickRandom(values) {
  const list = Array.isArray(values) ? values : [];
  return list[Math.floor(Math.random() * list.length)] ?? list[0];
}

function pickDistinctEmojis() {
  const red = pickRandom(EMOJI_POOL);
  const candidates = EMOJI_POOL.filter((emoji) => emoji !== red);
  return {
    red,
    blue: pickRandom(candidates)
  };
}

function randomInt(min, max) {
  const a = Math.ceil(Math.min(min, max));
  const b = Math.floor(Math.max(min, max));
  return a + Math.floor(Math.random() * (b - a + 1));
}

function randomFloat(min, max) {
  const a = Math.min(Number(min) || 0, Number(max) || 0);
  const b = Math.max(Number(min) || 0, Number(max) || 0);
  return a + Math.random() * (b - a);
}

function jitter(amount) {
  return (Math.random() * 2 - 1) * amount;
}

function distance(a, b) {
  return Math.hypot((a.x || 0) - (b.x || 0), (a.y || 0) - (b.y || 0));
}

function shuffle(values) {
  const arr = [...values];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function randomId() {
  return Math.random().toString(36).slice(2, 8);
}
