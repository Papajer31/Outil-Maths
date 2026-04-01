import { normalizeNumericConstraint } from "../../../../shared/value-constraints.js";

export function getDefaultSettings() {
  return {
    minBase: 1,
    maxBase: 10,
    baseMode: "simple",
    baseStart: 1,
    baseStep: 1,
    baseList: []
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  const constraint = normalizeNumericConstraint({
    min: base.minBase,
    max: base.maxBase,
    mode: base.baseMode,
    start: base.baseStart,
    step: base.baseStep,
    values: base.baseList
  }, {
    inputMin: 1,
    inputMax: 99,
    defaultMin: 1,
    defaultMax: 10,
    defaultStart: 1,
    defaultStep: 1,
    defaultValues: []
  });

  return {
    minBase: constraint.min,
    maxBase: constraint.max,
    baseMode: constraint.mode,
    baseStart: constraint.start,
    baseStep: constraint.step,
    baseList: constraint.values,
    allowedValues: constraint.allowedValues
  };
}

export function refillNumberPool(settings, lastN = null) {
  const cfg = normalizeSettings(settings);
  const pool = shuffle(cfg.allowedValues);

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

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
