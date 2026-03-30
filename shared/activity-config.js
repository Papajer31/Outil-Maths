export const TOOL_LIMITS = Object.freeze({
  timePerQ: { min: 5, max: 999, step: 5 },
  questionCount: { min: 1, max: 200, step: 1 },
  answerTime: { min: 1, max: 30, step: 1 },
  questionTransitionSec: { min: 0, max: 30, step: 1 }
});

export const DEFAULT_TOOL_ROW = Object.freeze({
  enabled: false,
  timePerQ: 40,
  questionCount: 10,
  answerTime: 5,
  settings: null
});

export const DEFAULT_ACTIVITY_GLOBALS = Object.freeze({
  mode: "students",
  questionTransitionSec: 5
});

export function clampInt(value, min, max) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

export function cloneData(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

export function normalizeActivityMode(value) {
  return value === "board" ? "board" : "students";
}

export function normalizeActivityGlobals(globals) {
  return {
    mode: normalizeActivityMode(globals?.mode),
    questionTransitionSec: clampInt(
      globals?.questionTransitionSec,
      TOOL_LIMITS.questionTransitionSec.min,
      TOOL_LIMITS.questionTransitionSec.max
    )
  };
}

export function normalizeToolDraft(draft) {
  return {
    enabled: !!draft?.enabled,
    timePerQ: clampInt(
      draft?.timePerQ,
      TOOL_LIMITS.timePerQ.min,
      TOOL_LIMITS.timePerQ.max
    ),
    questionCount: clampInt(
      draft?.questionCount,
      TOOL_LIMITS.questionCount.min,
      TOOL_LIMITS.questionCount.max
    ),
    answerTime: clampInt(
      draft?.answerTime,
      TOOL_LIMITS.answerTime.min,
      TOOL_LIMITS.answerTime.max
    ),
    settings: draft?.settings == null ? null : cloneData(draft.settings)
  };
}