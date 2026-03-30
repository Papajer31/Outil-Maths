export const NUMBERS = [
  "zero",
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
];

export function getDefaultSettings() {
  return {
    min: 0,
    max: 19
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  base.min = clampInt(base.min, 0, NUMBERS.length - 1);
  base.max = clampInt(base.max, 0, NUMBERS.length - 1);

  if (base.min > base.max) {
    [base.min, base.max] = [base.max, base.min];
  }

  return base;
}

export function pickNumber(settings, previous = -1) {
  const cfg = normalizeSettings(settings);

  if (cfg.min === cfg.max) {
    return cfg.min;
  }

  let currentNumber = previous;
  do {
    currentNumber = rand(cfg.min, cfg.max);
  } while (currentNumber === previous);

  return currentNumber;
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
