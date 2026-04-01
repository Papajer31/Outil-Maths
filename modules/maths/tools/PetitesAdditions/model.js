import { normalizeNumericConstraint } from "../../../../shared/value-constraints.js";

export function getDefaultSettings() {
  return {
    n1Min: 0,
    n1Max: 10,
    n1Mode: "simple",
    n1Start: 0,
    n1Step: 1,
    n1List: [],
    n2Min: 0,
    n2Max: 10,
    n2Mode: "simple",
    n2Start: 0,
    n2Step: 1,
    n2List: [],
    resultMin: 5,
    resultMax: 20,
    resultMode: "simple",
    resultStart: 5,
    resultStep: 1,
    resultList: []
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  const n1Constraint = normalizeNumericConstraint({
    min: base.n1Min,
    max: base.n1Max,
    mode: base.n1Mode,
    start: base.n1Start,
    step: base.n1Step,
    values: base.n1List
  }, {
    inputMin: 0,
    inputMax: 99,
    defaultMin: 0,
    defaultMax: 10,
    defaultStart: 0,
    defaultStep: 1,
    defaultValues: []
  });

  const n2Constraint = normalizeNumericConstraint({
    min: base.n2Min,
    max: base.n2Max,
    mode: base.n2Mode,
    start: base.n2Start,
    step: base.n2Step,
    values: base.n2List
  }, {
    inputMin: 0,
    inputMax: 99,
    defaultMin: 0,
    defaultMax: 10,
    defaultStart: 0,
    defaultStep: 1,
    defaultValues: []
  });

  const resultConstraint = normalizeNumericConstraint({
    min: base.resultMin,
    max: base.resultMax,
    mode: base.resultMode,
    start: base.resultStart,
    step: base.resultStep,
    values: base.resultList
  }, {
    inputMin: 0,
    inputMax: 198,
    defaultMin: 5,
    defaultMax: 20,
    defaultStart: 5,
    defaultStep: 1,
    defaultValues: []
  });

  return {
    n1Min: n1Constraint.min,
    n1Max: n1Constraint.max,
    n1Mode: n1Constraint.mode,
    n1Start: n1Constraint.start,
    n1Step: n1Constraint.step,
    n1List: n1Constraint.values,
    n1AllowedValues: n1Constraint.allowedValues,
    n2Min: n2Constraint.min,
    n2Max: n2Constraint.max,
    n2Mode: n2Constraint.mode,
    n2Start: n2Constraint.start,
    n2Step: n2Constraint.step,
    n2List: n2Constraint.values,
    n2AllowedValues: n2Constraint.allowedValues,
    resultMin: resultConstraint.min,
    resultMax: resultConstraint.max,
    resultMode: resultConstraint.mode,
    resultStart: resultConstraint.start,
    resultStep: resultConstraint.step,
    resultList: resultConstraint.values,
    resultAllowedValues: resultConstraint.allowedValues
  };
}

export function hasAtLeastOnePossibleAddition(settings) {
  const cfg = normalizeSettings(settings);
  const resultSet = new Set(cfg.resultAllowedValues);

  for (const a of cfg.n1AllowedValues) {
    for (const b of cfg.n2AllowedValues) {
      if (resultSet.has(a + b)) {
        return true;
      }
    }
  }

  return false;
}

export function pickQuestion(settings) {
  const cfg = normalizeSettings(settings);
  const resultSet = new Set(cfg.resultAllowedValues);
  const validQuestions = [];

  for (const a of cfg.n1AllowedValues) {
    for (const b of cfg.n2AllowedValues) {
      const sum = a + b;
      if (!resultSet.has(sum)) continue;
      validQuestions.push({ n1: a, n2: b, result: sum });
    }
  }

  if (!validQuestions.length) {
    throw new Error("Aucune addition possible avec ces réglages.");
  }

  return validQuestions[Math.floor(Math.random() * validQuestions.length)];
}
