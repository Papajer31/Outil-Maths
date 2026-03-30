export function getDefaultSettings() {
  return {
    minBase: 1,
    maxBase: 10
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  base.minBase = clampInt(base.minBase, 1, 99);
  base.maxBase = clampInt(base.maxBase, 1, 99);

  if (base.minBase > base.maxBase) {
    [base.minBase, base.maxBase] = [base.maxBase, base.minBase];
  }

  return base;
}

export function refillNumberPool(settings, lastN = null) {
  const cfg = normalizeSettings(settings);
  const values = [];

  for (let n = cfg.minBase; n <= cfg.maxBase; n++) {
    values.push(n);
  }

  const pool = shuffle(values);

  if (
    lastN !== null &&
    pool.length > 1 &&
    pool[pool.length - 1] === lastN
  ) {
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
