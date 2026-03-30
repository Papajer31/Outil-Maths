export const DRAW = {
  cellsPerBox: 10,

  cellWidth: 34,
  cellHeight: 44,
  boxGap: 14,

  circleRadius: 58,
  circleTopY: 20,
  stripTopY: 118,

  leftPadding: 24,
  rightPadding: 24,

  stripFill: "#efe1bf",
  stripStroke: "#8b7a63",
  mainLine: "#6f6455",
  crossLine: "#c9b48a",
  circleStroke: "#67b7e8",
  textColor: "#2b2b2b",

  svgHeight: 190
};

export function getDefaultSettings() {
  return {
    boxCount: 6,
    minValue: 11,
    maxValue: 60
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  base.boxCount = clampInt(base.boxCount, 2, 6);

  const absoluteMax = base.boxCount * DRAW.cellsPerBox;
  base.minValue = clampInt(base.minValue, 1, absoluteMax);
  base.maxValue = clampInt(base.maxValue, 1, absoluteMax);

  if (base.minValue > base.maxValue) {
    [base.minValue, base.maxValue] = [base.maxValue, base.minValue];
  }

  return base;
}

export function refillValuePool(settings, lastTarget = null) {
  const cfg = normalizeSettings(settings);
  const values = [];

  for (let n = cfg.minValue; n <= cfg.maxValue; n++) {
    values.push(n);
  }

  const pool = shuffle(values);

  if (lastTarget !== null && pool.length > 1 && pool[pool.length - 1] === lastTarget) {
    const lastIndex = pool.length - 1;
    const swapIndex = pool.length - 2;
    [pool[lastIndex], pool[swapIndex]] = [pool[swapIndex], pool[lastIndex]];
  }

  return pool;
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
