export const VALUE_CONSTRAINT_MODES = {
  SIMPLE: "simple",
  ADVANCED: "advanced",
  LIST: "list"
};

export function normalizeConstraintMode(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === VALUE_CONSTRAINT_MODES.ADVANCED) return VALUE_CONSTRAINT_MODES.ADVANCED;
  if (raw === VALUE_CONSTRAINT_MODES.LIST) return VALUE_CONSTRAINT_MODES.LIST;
  return VALUE_CONSTRAINT_MODES.SIMPLE;
}

export function clampIntValue(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function normalizeValueList(rawValues, {
  inputMin = 0,
  inputMax = 99
} = {}) {
  let values = [];

  if (Array.isArray(rawValues)) {
    values = rawValues;
  } else if (typeof rawValues === "string") {
    values = rawValues
      .split(/[\s,;]+/)
      .map((chunk) => chunk.trim())
      .filter(Boolean);
  } else if (rawValues != null) {
    values = [rawValues];
  }

  const seen = new Set();
  const normalized = [];

  values.forEach((value) => {
    const n = Math.floor(Number(value));
    if (!Number.isFinite(n)) return;
    if (n < inputMin || n > inputMax) return;
    if (seen.has(n)) return;
    seen.add(n);
    normalized.push(n);
  });

  normalized.sort((a, b) => a - b);
  return normalized;
}

export function buildAllowedValuesFromConstraint({
  min,
  max,
  mode = VALUE_CONSTRAINT_MODES.SIMPLE,
  start,
  step,
  values = []
}, {
  inputMin = 0,
  inputMax = 99
} = {}) {
  const safeMin = clampIntValue(min, inputMin, inputMax);
  const safeMax = clampIntValue(max, inputMin, inputMax);
  const lower = Math.min(safeMin, safeMax);
  const upper = Math.max(safeMin, safeMax);
  const safeMode = normalizeConstraintMode(mode);
  const safeValues = normalizeValueList(values, { inputMin, inputMax });

  if (safeMode === VALUE_CONSTRAINT_MODES.LIST) {
    return safeValues;
  }

  if (safeMode === VALUE_CONSTRAINT_MODES.ADVANCED) {
    const safeStart = clampIntValue(start, inputMin, inputMax);
    const safeStep = Math.max(1, Math.floor(Number(step) || 1));
    const resolved = [];

    for (let current = safeStart; current <= inputMax; current += safeStep) {
      if (current >= lower && current <= upper) {
        resolved.push(current);
      }
    }

    return resolved;
  }

  const resolved = [];
  for (let current = lower; current <= upper; current++) {
    resolved.push(current);
  }
  return resolved;
}

export function normalizeNumericConstraint(rawConstraint, {
  inputMin = 0,
  inputMax = 99,
  defaultMin = inputMin,
  defaultMax = inputMax,
  defaultMode = VALUE_CONSTRAINT_MODES.SIMPLE,
  defaultStart = defaultMin,
  defaultStep = 1,
  defaultValues = []
} = {}) {
  const safeMin = clampIntValue(rawConstraint?.min ?? defaultMin, inputMin, inputMax);
  const safeMax = clampIntValue(rawConstraint?.max ?? defaultMax, inputMin, inputMax);
  const min = Math.min(safeMin, safeMax);
  const max = Math.max(safeMin, safeMax);
  const mode = normalizeConstraintMode(rawConstraint?.mode ?? defaultMode);
  const start = clampIntValue(rawConstraint?.start ?? defaultStart ?? min, inputMin, inputMax);
  const maxStep = Math.max(1, inputMax - inputMin);
  const step = clampIntValue(rawConstraint?.step ?? defaultStep, 1, maxStep);
  const values = normalizeValueList(rawConstraint?.values ?? defaultValues, { inputMin, inputMax });
  const allowedValues = buildAllowedValuesFromConstraint({ min, max, mode, start, step, values }, {
    inputMin,
    inputMax
  });

  return {
    min,
    max,
    mode,
    start,
    step,
    values,
    allowedValues
  };
}

export function formatConstraintPreview(values, {
  maxPreviewCount = 12
} = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    return "aucune valeur";
  }

  if (values.length <= maxPreviewCount) {
    return values.join(", ");
  }

  const head = values.slice(0, maxPreviewCount).join(", ");
  return `${head}… (${values.length} valeurs)`;
}
