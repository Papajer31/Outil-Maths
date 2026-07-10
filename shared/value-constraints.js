export const VALUE_CONSTRAINT_MODES = {
  SIMPLE: "simple",
  ADVANCED: "advanced",
  LIST: "list"
};

const THIN_NBSP = "\u202F";
const MAX_MATERIALIZED_ALLOWED_VALUES = 2000;

export function normalizeConstraintMode(value) {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === VALUE_CONSTRAINT_MODES.ADVANCED) return VALUE_CONSTRAINT_MODES.ADVANCED;
  if (raw === VALUE_CONSTRAINT_MODES.LIST) return VALUE_CONSTRAINT_MODES.LIST;
  return VALUE_CONSTRAINT_MODES.SIMPLE;
}

function stripIntegerSeparators(value) {
  return String(value ?? "").replace(/[\s\u00a0\u202f']/g, "");
}

function parseIntegerLike(value) {
  const raw = stripIntegerSeparators(value).trim();
  if (!/^-?\d+$/.test(raw)) return NaN;
  return Math.floor(Number(raw));
}

function formatIntegerForDisplay(value) {
  const parsed = parseIntegerLike(value);
  if (!Number.isFinite(parsed)) return String(value ?? "");

  const sign = parsed < 0 ? "-" : "";
  const digits = String(Math.abs(parsed));
  return `${sign}${digits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_NBSP)}`;
}

function splitValueList(raw) {
  const text = String(raw ?? "").trim();
  if (!text) return [];

  if (/[;,\n]/.test(text)) {
    return text.split(/[;,\n]+/).map((chunk) => chunk.trim()).filter(Boolean);
  }

  // Une seule valeur avec séparateur des milliers : "1 000" ou "12 345".
  if (/^-?\d{1,3}([\s\u00a0\u202f]\d{3})+$/.test(text)) {
    return [text];
  }

  return text.split(/\s+/).map((chunk) => chunk.trim()).filter(Boolean);
}

export function clampIntValue(v, min, max) {
  const parsed = typeof v === "string" ? parseIntegerLike(v) : Math.floor(Number(v));
  const n = Number.isFinite(parsed) ? parsed : min;
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
    values = splitValueList(rawValues);
  } else if (rawValues != null) {
    values = [rawValues];
  }

  const seen = new Set();
  const normalized = [];

  values.forEach((value) => {
    const n = parseIntegerLike(value);
    if (!Number.isFinite(n)) return;
    if (n < inputMin || n > inputMax) return;
    if (seen.has(n)) return;
    seen.add(n);
    normalized.push(n);
  });

  normalized.sort((a, b) => a - b);
  return normalized;
}

function resolveConstraintParts(constraint = {}, options = {}) {
  const {
    min,
    max,
    mode = VALUE_CONSTRAINT_MODES.SIMPLE,
    start,
    step,
    values = []
  } = constraint || {};

  const resolvedInputMin = Number.isFinite(Number(options.inputMin))
    ? Math.floor(Number(options.inputMin))
    : Number.isFinite(Number(constraint?.inputMin))
      ? Math.floor(Number(constraint.inputMin))
      : 0;
  const resolvedInputMax = Number.isFinite(Number(options.inputMax))
    ? Math.floor(Number(options.inputMax))
    : Number.isFinite(Number(constraint?.inputMax))
      ? Math.floor(Number(constraint.inputMax))
      : 99;
  const inputMin = Math.min(resolvedInputMin, resolvedInputMax);
  const inputMax = Math.max(resolvedInputMin, resolvedInputMax);

  const safeMin = clampIntValue(min, inputMin, inputMax);
  const safeMax = clampIntValue(max, inputMin, inputMax);
  const lower = Math.min(safeMin, safeMax);
  const upper = Math.max(safeMin, safeMax);
  const safeMode = normalizeConstraintMode(mode);
  const safeValues = normalizeValueList(values, { inputMin, inputMax });
  const safeStart = clampIntValue(start ?? lower, inputMin, inputMax);
  const safeStep = Math.max(1, Math.floor(Number(step) || 1));

  return { lower, upper, mode: safeMode, start: safeStart, step: safeStep, values: safeValues, inputMin, inputMax };
}

function getAdvancedFirstValue({ lower, upper, start, step }) {
  if (start > upper) return null;
  if (start >= lower) return start;
  const delta = lower - start;
  const jumps = Math.ceil(delta / step);
  const first = start + (jumps * step);
  return first <= upper ? first : null;
}

export function getConstraintValueCount(constraint = {}, options = {}) {
  const parts = resolveConstraintParts(constraint, options);

  if (parts.mode === VALUE_CONSTRAINT_MODES.LIST) {
    return parts.values.length;
  }

  if (parts.mode === VALUE_CONSTRAINT_MODES.ADVANCED) {
    const first = getAdvancedFirstValue(parts);
    if (first == null) return 0;
    return Math.floor((parts.upper - first) / parts.step) + 1;
  }

  return Math.max(0, parts.upper - parts.lower + 1);
}

export function buildAllowedValuesFromConstraint(constraint = {}, options = {}) {
  const parts = resolveConstraintParts(constraint, options);
  const valueCount = getConstraintValueCount(constraint, options);
  const maxMaterializedValues = Math.max(0, Math.floor(Number(options.maxMaterializedValues ?? MAX_MATERIALIZED_ALLOWED_VALUES)));

  if (parts.mode === VALUE_CONSTRAINT_MODES.LIST) {
    return parts.values;
  }

  if (valueCount <= 0 || valueCount > maxMaterializedValues) {
    return [];
  }

  const resolved = [];

  if (parts.mode === VALUE_CONSTRAINT_MODES.ADVANCED) {
    const first = getAdvancedFirstValue(parts);
    if (first == null) return [];
    for (let current = first; current <= parts.upper; current += parts.step) {
      resolved.push(current);
    }
    return resolved;
  }

  for (let current = parts.lower; current <= parts.upper; current++) {
    resolved.push(current);
  }
  return resolved;
}

export function constraintContainsValue(constraint = {}, value, options = {}) {
  const candidate = Math.floor(Number(value));
  if (!Number.isFinite(candidate)) return false;
  const parts = resolveConstraintParts(constraint, options);

  if (parts.mode === VALUE_CONSTRAINT_MODES.LIST) {
    return parts.values.includes(candidate);
  }

  if (candidate < parts.lower || candidate > parts.upper) return false;

  if (parts.mode === VALUE_CONSTRAINT_MODES.ADVANCED) {
    return candidate >= parts.start && ((candidate - parts.start) % parts.step === 0);
  }

  return true;
}

export function pickValueFromConstraint(constraint = {}, options = {}) {
  const parts = resolveConstraintParts(constraint, options);
  const valueCount = getConstraintValueCount(constraint, options);
  if (valueCount <= 0) return null;

  if (parts.mode === VALUE_CONSTRAINT_MODES.LIST) {
    return parts.values[Math.floor(Math.random() * parts.values.length)] ?? null;
  }

  if (parts.mode === VALUE_CONSTRAINT_MODES.ADVANCED) {
    const first = getAdvancedFirstValue(parts);
    if (first == null) return null;
    const index = Math.floor(Math.random() * valueCount);
    return first + (index * parts.step);
  }

  return parts.lower + Math.floor(Math.random() * valueCount);
}

export function normalizeNumericConstraint(rawConstraint, {
  inputMin = 0,
  inputMax = 99,
  defaultMin = inputMin,
  defaultMax = inputMax,
  defaultMode = VALUE_CONSTRAINT_MODES.SIMPLE,
  defaultStart = defaultMin,
  defaultStep = 1,
  defaultValues = [],
  maxMaterializedValues = MAX_MATERIALIZED_ALLOWED_VALUES
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
  const descriptor = { min, max, mode, start, step, values };
  const valueCount = getConstraintValueCount(descriptor, { inputMin, inputMax });
  const allowedValues = buildAllowedValuesFromConstraint(descriptor, {
    inputMin,
    inputMax,
    maxMaterializedValues
  });

  return {
    min,
    max,
    mode,
    start,
    step,
    values,
    allowedValues,
    valueCount,
    isMaterialized: mode === VALUE_CONSTRAINT_MODES.LIST || allowedValues.length === valueCount,
    inputMin,
    inputMax
  };
}

export function formatConstraintPreview(constraintOrValues, {
  maxPreviewCount = 12
} = {}) {
  if (Array.isArray(constraintOrValues)) {
    return formatMaterializedPreview(constraintOrValues, { maxPreviewCount });
  }

  const constraint = constraintOrValues;
  if (!constraint || typeof constraint !== "object") {
    return "aucune valeur";
  }

  const valueCount = Number.isFinite(Number(constraint.valueCount))
    ? Number(constraint.valueCount)
    : getConstraintValueCount(constraint, {
      inputMin: constraint.inputMin,
      inputMax: constraint.inputMax
    });

  if (valueCount <= 0) return "aucune valeur";

  if (constraint.mode === VALUE_CONSTRAINT_MODES.LIST) {
    return formatMaterializedPreview(constraint.allowedValues || constraint.values || [], { maxPreviewCount });
  }

  if (Array.isArray(constraint.allowedValues) && constraint.allowedValues.length > 0 && constraint.allowedValues.length <= maxPreviewCount) {
    return formatMaterializedPreview(constraint.allowedValues, { maxPreviewCount });
  }

  if (constraint.mode === VALUE_CONSTRAINT_MODES.ADVANCED) {
    return `${formatIntegerForDisplay(constraint.min)} → ${formatIntegerForDisplay(constraint.max)} ; départ ${formatIntegerForDisplay(constraint.start)}, pas ${formatIntegerForDisplay(constraint.step)} (${formatIntegerForDisplay(valueCount)} valeurs)`;
  }

  return `${formatIntegerForDisplay(constraint.min)} → ${formatIntegerForDisplay(constraint.max)} (${formatIntegerForDisplay(valueCount)} valeurs)`;
}

function formatMaterializedPreview(values, { maxPreviewCount = 12 } = {}) {
  if (!Array.isArray(values) || values.length === 0) {
    return "aucune valeur";
  }

  const formatted = values.map((value) => formatIntegerForDisplay(value));

  if (formatted.length <= maxPreviewCount) {
    return formatted.join(", ");
  }

  const head = formatted.slice(0, maxPreviewCount).join(", ");
  return `${head}… (${formatIntegerForDisplay(values.length)} valeurs)`;
}
