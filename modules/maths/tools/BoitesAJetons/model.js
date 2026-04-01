export function getDefaultSettings() {
  return {
    boxValueMin: 1,
    boxValueMax: 9,
    targetMin: 10,
    targetMax: 20,
    boxCount: 5
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  base.boxCount = clampInt(base.boxCount, 3, 6);

  base.boxValueMin = clampInt(base.boxValueMin, 1, 99);
  base.boxValueMax = clampInt(base.boxValueMax, 1, 99);
  if (base.boxValueMin > base.boxValueMax) {
    [base.boxValueMin, base.boxValueMax] = [base.boxValueMax, base.boxValueMin];
  }

  const targetAbsMax = getTargetAbsoluteMax(base.boxCount);
  base.targetMin = clampInt(base.targetMin, 1, targetAbsMax);
  base.targetMax = clampInt(base.targetMax, 1, targetAbsMax);
  if (base.targetMin > base.targetMax) {
    [base.targetMin, base.targetMax] = [base.targetMax, base.targetMin];
  }

  return base;
}

export function getTargetAbsoluteMax(boxCount) {
  return clampInt(boxCount, 3, 6) * 99;
}

export function hasEnoughDistinctValues(settings) {
  const cfg = normalizeSettings(settings);
  return (cfg.boxValueMax - cfg.boxValueMin + 1) >= cfg.boxCount;
}

export function pickQuestion(settings, {
  avoidKey = null,
  attempts = 1200
} = {}) {
  const cfg = normalizeSettings(settings);

  if (!hasEnoughDistinctValues(cfg)) {
    return null;
  }

  let fallback = null;

  for (let i = 0; i < attempts; i++) {
    const candidate = buildCandidate(cfg);
    if (!candidate) continue;

    if (!fallback) fallback = candidate;
    if (!avoidKey || questionKey(candidate) !== avoidKey) {
      return candidate;
    }
  }

  return fallback;
}

export function canGenerateQuestion(settings) {
  return !!pickQuestion(settings, { attempts: 1600 });
}

export function questionKey(question) {
  const valuesKey = [...(question?.values ?? [])].sort((a, b) => a - b).join(",");
  return `${question?.target ?? ""}|${valuesKey}`;
}

function buildCandidate(settings) {
  const values = pickDistinctValues(settings.boxValueMin, settings.boxValueMax, settings.boxCount);
  if (values.length !== settings.boxCount) return null;

  const grouped = collectSolutionsByTarget(values, settings.targetMin, settings.targetMax);
  const candidateTargets = [...grouped.entries()]
    .filter(([, solutions]) => solutions.length === 3)
    .map(([target]) => target);

  if (candidateTargets.length === 0) {
    return null;
  }

  const target = pickRandom(candidateTargets);
  const rawSolutions = grouped.get(target) ?? [];

  const displaySolutions = shuffle(rawSolutions).map((solution) => shuffle(solution));

  return {
    target,
    values,
    solutions: displaySolutions,
    answerLines: displaySolutions.map((solution) => `${solution.join(" + ")} = ${target}`)
  };
}

function collectSolutionsByTarget(values, targetMin, targetMax) {
  const grouped = new Map();
  const n = values.length;

  for (let mask = 1; mask < (1 << n); mask++) {
    const terms = [];
    let sum = 0;

    for (let i = 0; i < n; i++) {
      if ((mask & (1 << i)) === 0) continue;
      terms.push(values[i]);
      sum += values[i];
    }

    if (terms.length < 2) continue;
    if (sum < targetMin || sum > targetMax) continue;

    if (!grouped.has(sum)) {
      grouped.set(sum, []);
    }

    grouped.get(sum).push(terms);
  }

  return grouped;
}

function pickDistinctValues(min, max, count) {
  const pool = [];
  for (let n = min; n <= max; n++) {
    pool.push(n);
  }

  return shuffle(pool).slice(0, count);
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
