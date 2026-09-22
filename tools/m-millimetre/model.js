import { normalizeNumericConstraint, pickValueFromConstraint } from "../../shared/value-constraints.js";

export const QUESTION_TYPES = Object.freeze({
  READ: "read",
  BUILD: "build"
});

export const VALUE_LIMITS = Object.freeze({
  min: 1,
  max: 9999
});

const DEFAULT_SETTINGS = Object.freeze({
  questionType: QUESTION_TYPES.READ,
  min: 100,
  max: 999,
  valueMode: "simple",
  valueStart: 100,
  valueStep: 1,
  valueList: []
});

export function getDefaultSettings() {
  return clone(DEFAULT_SETTINGS);
}

export function normalizeSettings(settings = {}) {
  const raw = {
    ...getDefaultSettings(),
    ...(settings && typeof settings === "object" ? settings : {})
  };

  const values = normalizeNumericConstraint({
    min: raw.min,
    max: raw.max,
    mode: raw.valueMode,
    start: raw.valueStart,
    step: raw.valueStep,
    values: raw.valueList
  }, {
    inputMin: VALUE_LIMITS.min,
    inputMax: VALUE_LIMITS.max,
    defaultMin: DEFAULT_SETTINGS.min,
    defaultMax: DEFAULT_SETTINGS.max,
    defaultStart: DEFAULT_SETTINGS.valueStart,
    defaultStep: DEFAULT_SETTINGS.valueStep,
    defaultValues: []
  });

  return {
    questionType: normalizeQuestionType(raw.questionType),
    min: values.min,
    max: values.max,
    valueMode: values.mode,
    valueStart: values.start,
    valueStep: values.step,
    valueList: values.values,
    valueCount: values.valueCount
  };
}

export function pickQuestion(settings = {}, { avoidKey = null } = {}) {
  const cfg = normalizeSettings(settings);
  const constraint = {
    min: cfg.min,
    max: cfg.max,
    mode: cfg.valueMode,
    start: cfg.valueStart,
    step: cfg.valueStep,
    values: cfg.valueList
  };

  const firstValue = pickValueFromConstraint(constraint, {
    inputMin: VALUE_LIMITS.min,
    inputMax: VALUE_LIMITS.max
  });

  if (!Number.isFinite(firstValue)) {
    throw new Error("Aucune longueur disponible pour M. Millimètre.");
  }

  const fallback = buildQuestion(cfg, firstValue);
  if (!avoidKey || questionKey(fallback) !== avoidKey || cfg.valueCount <= 1) {
    return fallback;
  }

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const value = pickValueFromConstraint(constraint, {
      inputMin: VALUE_LIMITS.min,
      inputMax: VALUE_LIMITS.max
    });
    if (!Number.isFinite(value)) continue;
    const candidate = buildQuestion(cfg, value);
    if (questionKey(candidate) !== avoidKey) return candidate;
  }

  return fallback;
}

export function questionKey(question = {}) {
  return `${question?.questionType || ""}:${question?.value ?? ""}`;
}

export function decomposeLengthMm(value) {
  const safeValue = clampInt(value, VALUE_LIMITS.min, VALUE_LIMITS.max);
  const hundreds = Math.floor(safeValue / 100);
  const remainderAfterHundreds = safeValue % 100;
  const tens = Math.floor(remainderAfterHundreds / 10);
  const units = remainderAfterHundreds % 10;

  const segments = [];
  for (let index = 0; index < hundreds; index += 1) segments.push(100);
  for (let index = 0; index < tens; index += 1) segments.push(10);
  if (units > 0) segments.push(units);

  return {
    value: safeValue,
    hundreds,
    tens,
    units,
    hundredBlocks: Math.floor(hundreds / 10),
    remainingHundreds: hundreds % 10,
    segments
  };
}

export function evaluateReadAnswer(question = {}, rawAnswer = "") {
  const submittedText = String(rawAnswer ?? "").trim();
  const submittedValue = /^\d+$/.test(submittedText)
    ? Number.parseInt(submittedText, 10)
    : null;
  const expectedValue = Number(question?.value);

  return {
    isCorrect: Number.isInteger(submittedValue) && submittedValue === expectedValue,
    submittedText,
    submittedValue,
    expectedValue
  };
}

export function evaluateBuildAnswer(question = {}, submittedSegments = []) {
  const expectedSegments = Array.isArray(question?.decomposition?.segments)
    ? question.decomposition.segments.map(Number)
    : decomposeLengthMm(question?.value).segments;
  const safeSubmitted = Array.isArray(submittedSegments)
    ? submittedSegments.map((value) => Number(value)).filter(Number.isFinite)
    : [];

  const isCorrect = safeSubmitted.length === expectedSegments.length
    && safeSubmitted.every((value, index) => value === expectedSegments[index]);

  return {
    isCorrect,
    submittedSegments: safeSubmitted,
    expectedSegments: [...expectedSegments],
    submittedTotal: safeSubmitted.reduce((sum, value) => sum + value, 0),
    expectedValue: Number(question?.value)
  };
}

function buildQuestion(cfg, value) {
  const decomposition = decomposeLengthMm(value);
  const isBuild = cfg.questionType === QUESTION_TYPES.BUILD;
  return {
    questionType: cfg.questionType,
    value,
    decomposition,
    prompt: isBuild
      ? "Construis comme M. Millimètre."
      : "Quelle est la longueur de cette ligne de M. Millimètre ?"
  };
}

function normalizeQuestionType(value) {
  return value === QUESTION_TYPES.BUILD ? QUESTION_TYPES.BUILD : QUESTION_TYPES.READ;
}

function clampInt(value, min, max) {
  const parsed = Math.floor(Number(value));
  const safe = Number.isFinite(parsed) ? parsed : min;
  return Math.max(min, Math.min(max, safe));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
