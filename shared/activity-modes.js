import {
  getToolActivityModeProfile as getContractToolActivityModeProfile,
  getToolSupportedActivityModes as getContractToolSupportedActivityModes
} from "./tool-contract.js";

export const ACTIVITY_MODE_VALUES = Object.freeze([
  "individual",
  "group"
]);

export const DEFAULT_ACTIVITY_MODE = "individual";

export const ACTIVITY_MODE_LABELS = Object.freeze({
  individual: "Individuel",
  group: "Groupe"
});

export const STUDENT_FACING_ACTIVITY_MODES = Object.freeze([
  "individual",
  "group"
]);

export function normalizeActivityMode(value, fallback = DEFAULT_ACTIVITY_MODE) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (ACTIVITY_MODE_VALUES.includes(safeValue)) {
    return safeValue;
  }

  const safeFallback = String(fallback || "").trim().toLowerCase();
  return ACTIVITY_MODE_VALUES.includes(safeFallback)
    ? safeFallback
    : DEFAULT_ACTIVITY_MODE;
}

export function getActivityModeLabel(value) {
  return ACTIVITY_MODE_LABELS[normalizeActivityMode(value)] || ACTIVITY_MODE_LABELS[DEFAULT_ACTIVITY_MODE];
}

export function isProjectionActivityMode(value) {
  return false;
}

export function isStudentFacingActivityMode(value) {
  return STUDENT_FACING_ACTIVITY_MODES.includes(normalizeActivityMode(value));
}

export function getOtherActivityModes(value) {
  const safeMode = normalizeActivityMode(value);
  return ACTIVITY_MODE_VALUES.filter((mode) => mode !== safeMode);
}

export function getToolSupportedActivityModes(tool, context = {}) {
  const supportedModes = getContractToolSupportedActivityModes(tool, {
    ...context,
    activityMode: normalizeActivityMode(context.activityMode)
  });

  return supportedModes.length ? supportedModes : [...ACTIVITY_MODE_VALUES];
}

export function getToolActivityModeSupport(tool, context = {}) {
  return getContractToolActivityModeProfile(tool, {
    ...context,
    activityMode: normalizeActivityMode(context.activityMode)
  });
}

export function getToolProjectionCompatibility(tool, context = {}) {
  return { compatible: true, blockingMessage: "" };
}
