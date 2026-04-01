import { normalizeNumericConstraint } from "../../../../shared/value-constraints.js";

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
    max: 19,
    valueMode: "simple",
    valueStart: 0,
    valueStep: 1,
    valueList: []
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  const constraint = normalizeNumericConstraint({
    min: base.min,
    max: base.max,
    mode: base.valueMode,
    start: base.valueStart,
    step: base.valueStep,
    values: base.valueList
  }, {
    inputMin: 0,
    inputMax: NUMBERS.length - 1,
    defaultMin: 0,
    defaultMax: NUMBERS.length - 1,
    defaultStart: 0,
    defaultStep: 1,
    defaultValues: []
  });

  return {
    min: constraint.min,
    max: constraint.max,
    valueMode: constraint.mode,
    valueStart: constraint.start,
    valueStep: constraint.step,
    valueList: constraint.values,
    allowedValues: constraint.allowedValues
  };
}

export function pickNumber(settings, previous = -1) {
  const cfg = normalizeSettings(settings);
  const candidates = cfg.allowedValues;

  if (candidates.length === 0) {
    throw new Error("Aucun nombre disponible pour NombresLettres.");
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const filtered = candidates.filter((value) => value !== previous);
  const pool = filtered.length ? filtered : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}
