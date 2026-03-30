export function getDefaultSettings() {
  return {
    n1Min: 0,
    n1Max: 10,
    n2Min: 0,
    n2Max: 10,
    resultMin: 5,
    resultMax: 20
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
  base.resultMin = clampInt(base.resultMin, 0, 198);
  base.resultMax = clampInt(base.resultMax, 0, 198);

  if (base.n1Min > base.n1Max) {
    [base.n1Min, base.n1Max] = [base.n1Max, base.n1Min];
  }

  if (base.n2Min > base.n2Max) {
    [base.n2Min, base.n2Max] = [base.n2Max, base.n2Min];
  }

  if (base.resultMin > base.resultMax) {
    [base.resultMin, base.resultMax] = [base.resultMax, base.resultMin];
  }

  return base;
}

export function hasAtLeastOnePossibleAddition(settings) {
  const cfg = normalizeSettings(settings);
  const minPossible = cfg.n1Min + cfg.n2Min;
  const maxPossible = cfg.n1Max + cfg.n2Max;

  return !(cfg.resultMax < minPossible || cfg.resultMin > maxPossible);
}

export function pickQuestion(settings) {
  const cfg = normalizeSettings(settings);

  for (let i = 0; i < 500; i++) {
    const a = rand(cfg.n1Min, cfg.n1Max);
    const b = rand(cfg.n2Min, cfg.n2Max);
    const sum = a + b;

    if (sum < cfg.resultMin || sum > cfg.resultMax) continue;
    return { n1: a, n2: b, result: sum };
  }

  for (let a = cfg.n1Min; a <= cfg.n1Max; a++) {
    for (let b = cfg.n2Min; b <= cfg.n2Max; b++) {
      const sum = a + b;
      if (sum < cfg.resultMin || sum > cfg.resultMax) continue;
      return { n1: a, n2: b, result: sum };
    }
  }

  throw new Error("Aucune addition possible avec ces réglages.");
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
