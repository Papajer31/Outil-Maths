export function getDefaultSettings() {
  return {
    n1Min: 5,
    n1Max: 10,
    n2Min: 0,
    n2Max: 10,
    resultMin: 0,
    resultMax: 10
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  base.n1Min = clampInt(base.n1Min, 0, 99);
  base.n1Max = clampInt(base.n1Max, 0, 99);
  base.n2Min = clampInt(base.n2Min, 0, 99);
  base.n2Max = clampInt(base.n2Max, 0, 99);
  base.resultMin = clampInt(base.resultMin, 0, 99);
  base.resultMax = clampInt(base.resultMax, 0, 99);

  if (base.n1Min > base.n1Max) {
    [base.n1Min, base.n1Max] = [base.n1Max, base.n1Min];
  }

  if (base.n2Min > base.n2Max) {
    [base.n2Min, base.n2Max] = [base.n2Max, base.n2Min];
  }

  if (base.resultMin > base.resultMax) {
    [base.resultMin, base.resultMax] = [base.resultMax, base.resultMin];
  }

  base.n2Min = Math.min(base.n2Min, base.n1Max);
  base.n2Max = Math.min(base.n2Max, base.n1Max);
  base.resultMin = Math.min(base.resultMin, base.n1Max);
  base.resultMax = Math.min(base.resultMax, base.n1Max);

  if (base.n2Min > base.n2Max) {
    base.n2Min = base.n2Max;
  }

  if (base.resultMin > base.resultMax) {
    base.resultMin = base.resultMax;
  }

  return base;
}

export function hasAtLeastOnePossibleSubtraction(settings) {
  const cfg = normalizeSettings(settings);

  for (let a = cfg.n1Min; a <= cfg.n1Max; a++) {
    const bMin = Math.max(cfg.n2Min, 0);
    const bMax = Math.min(cfg.n2Max, a);

    for (let b = bMin; b <= bMax; b++) {
      const diff = a - b;
      if (diff >= cfg.resultMin && diff <= cfg.resultMax) {
        return true;
      }
    }
  }

  return false;
}

export function pickQuestion(settings) {
  const cfg = normalizeSettings(settings);

  for (let i = 0; i < 500; i++) {
    const a = rand(cfg.n1Min, cfg.n1Max);
    const bMin = Math.max(cfg.n2Min, 0);
    const bMax = Math.min(cfg.n2Max, a);

    if (bMin > bMax) continue;

    const b = rand(bMin, bMax);
    const diff = a - b;

    if (diff < cfg.resultMin || diff > cfg.resultMax) continue;
    return { n1: a, n2: b, result: diff };
  }

  for (let a = cfg.n1Min; a <= cfg.n1Max; a++) {
    const bMin = Math.max(cfg.n2Min, 0);
    const bMax = Math.min(cfg.n2Max, a);

    for (let b = bMin; b <= bMax; b++) {
      const diff = a - b;
      if (diff < cfg.resultMin || diff > cfg.resultMax) continue;
      return { n1: a, n2: b, result: diff };
    }
  }

  throw new Error("Aucune soustraction possible avec ces réglages.");
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
