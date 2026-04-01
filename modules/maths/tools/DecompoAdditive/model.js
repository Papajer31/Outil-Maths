import { normalizeNumericConstraint } from "../../../../shared/value-constraints.js";

export function getDefaultSettings() {
  return {
    minTop: 5,
    maxTop: 9,
    topMode: "simple",
    topStart: 5,
    topStep: 1,
    topList: [],
    allowZero: false,
    includeSymmetricPairs: true
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  const constraint = normalizeNumericConstraint({
    min: base.minTop,
    max: base.maxTop,
    mode: base.topMode,
    start: base.topStart,
    step: base.topStep,
    values: base.topList
  }, {
    inputMin: 1,
    inputMax: 99,
    defaultMin: 5,
    defaultMax: 9,
    defaultStart: 5,
    defaultStep: 1,
    defaultValues: []
  });

  const allowedValues = constraint.allowedValues.filter((value) => base.allowZero || value >= 2);

  return {
    minTop: constraint.min,
    maxTop: constraint.max,
    topMode: constraint.mode,
    topStart: constraint.start,
    topStep: constraint.step,
    topList: constraint.values,
    allowedValues,
    allowZero: !!base.allowZero,
    includeSymmetricPairs: !!base.includeSymmetricPairs
  };
}

export function buildQuestionPool(settings) {
  const cfg = normalizeSettings(settings);
  const pool = [];

  cfg.allowedValues.forEach((top) => {
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
  });

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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
