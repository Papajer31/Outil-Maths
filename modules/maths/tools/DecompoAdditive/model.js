export function getDefaultSettings() {
  return {
    minTop: 5,
    maxTop: 9,
    allowZero: false,
    includeSymmetricPairs: true
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  base.minTop = clampInt(base.minTop, 1, 99);
  base.maxTop = clampInt(base.maxTop, 1, 99);

  if (base.minTop > base.maxTop) {
    [base.minTop, base.maxTop] = [base.maxTop, base.minTop];
  }

  if (!base.allowZero && base.maxTop < 2) {
    base.maxTop = 2;
    if (base.minTop > 2) {
      base.minTop = 2;
    }
  }

  return base;
}

export function buildQuestionPool(settings) {
  const cfg = normalizeSettings(settings);
  const pool = [];

  for (let top = cfg.minTop; top <= cfg.maxTop; top++) {
    const minGiven = cfg.allowZero ? 0 : 1;

    if (cfg.includeSymmetricPairs) {
      for (let given = minGiven; given <= top; given++) {
        const answer = top - given;
        if (!cfg.allowZero && answer === 0) continue;
        pool.push({ top, given, answer });
      }
    } else {
      for (let given = minGiven; given <= Math.floor(top / 2); given++) {
        const answer = top - given;
        if (!cfg.allowZero && answer === 0) continue;
        pool.push({ top, given, answer });
      }
    }
  }

  return pool;
}

export function questionKey(question) {
  return `${question.top}|${question.given}|${question.answer}`;
}

export function refillQuestionPool(settings, lastQuestionKey = null) {
  const pool = shuffle(buildQuestionPool(settings));

  if (
    lastQuestionKey !== null &&
    pool.length > 1 &&
    questionKey(pool[pool.length - 1]) === lastQuestionKey
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
