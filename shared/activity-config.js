export const TOOL_LIMITS = Object.freeze({
  timePerQ: { min: 5, max: 999, step: 5 },
  questionCount: { min: 1, max: 200, step: 1 },
  answerTime: { min: 1, max: 30, step: 1 },
  infiniteGaugeMilestones: { min: 0, max: 12, step: 1 },
  infiniteGaugeRequiredCorrect: { min: 1, max: 999, step: 1 },
  questionTransitionSec: { min: 0, max: 30, step: 1 },
  activityTotalTimeSec: { min: 60, max: 7200, step: 60 }
});

export const DEFAULT_TOOL_ROW = Object.freeze({
  enabled: false,
  timePerQ: 40,
  questionCount: 10,
  answerTime: 5,
  infiniteTimePerQ: false,
  infiniteQuestionCount: false,
  infiniteAnswerTime: false,
  settings: null
});

export const DEFAULT_ACTIVITY_GLOBALS = Object.freeze({
  questionTransitionSec: 5,
  questionTransitionInfinite: false,
  projectionResponseUi: "free",
  activityTotalTimeEnabled: false,
  activityTotalTimeSec: 900
});

export const DEFAULT_COMMON_INFINITE_GAUGE = Object.freeze({
  infiniteGaugeMilestones: 3,
  infiniteGaugeRequiredCorrect: 10
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

export function normalizeActivityGlobals(globals) {
  return {
    questionTransitionSec: clampInt(
      globals?.questionTransitionSec,
      TOOL_LIMITS.questionTransitionSec.min,
      TOOL_LIMITS.questionTransitionSec.max
    ),
    questionTransitionInfinite: globals?.questionTransitionInfinite === true,
    projectionResponseUi: normalizeProjectionResponseUi(
      globals?.projectionResponseUi,
      DEFAULT_ACTIVITY_GLOBALS.projectionResponseUi
    ),
    activityTotalTimeEnabled: globals?.activityTotalTimeEnabled === true,
    activityTotalTimeSec: globals?.activityTotalTimeSec == null
      ? DEFAULT_ACTIVITY_GLOBALS.activityTotalTimeSec
      : clampInt(
          globals?.activityTotalTimeSec,
          TOOL_LIMITS.activityTotalTimeSec.min,
          TOOL_LIMITS.activityTotalTimeSec.max
        )
  };
}

export function normalizeProjectionResponseUi(value, fallback = DEFAULT_ACTIVITY_GLOBALS.projectionResponseUi) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (safeValue === "boxed" || safeValue === "free") {
    return safeValue;
  }

  const safeFallback = String(fallback || "").trim().toLowerCase();
  return safeFallback === "boxed" || safeFallback === "free"
    ? safeFallback
    : DEFAULT_ACTIVITY_GLOBALS.projectionResponseUi;
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
    infiniteTimePerQ: !!draft?.infiniteTimePerQ,
    infiniteQuestionCount: !!draft?.infiniteQuestionCount,
    infiniteAnswerTime: !!draft?.infiniteAnswerTime,
    settings: draft?.settings == null ? null : cloneData(draft.settings)
  };
}

export function getCommonInfiniteGaugeSettings(settings) {
  const common = settings && typeof settings === "object" && !Array.isArray(settings) && settings.common && typeof settings.common === "object" && !Array.isArray(settings.common)
    ? settings.common
    : null;

  return {
    infiniteGaugeMilestones: normalizeOptionalInt(
      common?.infiniteGaugeMilestones,
      TOOL_LIMITS.infiniteGaugeMilestones,
      DEFAULT_COMMON_INFINITE_GAUGE.infiniteGaugeMilestones
    ),
    infiniteGaugeRequiredCorrect: normalizeOptionalInt(
      common?.infiniteGaugeRequiredCorrect,
      TOOL_LIMITS.infiniteGaugeRequiredCorrect,
      DEFAULT_COMMON_INFINITE_GAUGE.infiniteGaugeRequiredCorrect
    )
  };
}

export function ensureCommonInfiniteGaugeSettings(settings, gaugeSettings = {}) {
  const safeSettings = settings && typeof settings === "object" && !Array.isArray(settings)
    ? cloneData(settings)
    : {};
  const safeCommon = safeSettings.common && typeof safeSettings.common === "object" && !Array.isArray(safeSettings.common)
    ? { ...safeSettings.common }
    : {};
  const currentGaugeSettings = getCommonInfiniteGaugeSettings(settings);

  safeCommon.infiniteGaugeMilestones = normalizeOptionalInt(
    gaugeSettings?.infiniteGaugeMilestones,
    TOOL_LIMITS.infiniteGaugeMilestones,
    currentGaugeSettings.infiniteGaugeMilestones
  );
  safeCommon.infiniteGaugeRequiredCorrect = normalizeOptionalInt(
    gaugeSettings?.infiniteGaugeRequiredCorrect,
    TOOL_LIMITS.infiniteGaugeRequiredCorrect,
    currentGaugeSettings.infiniteGaugeRequiredCorrect
  );

  safeSettings.common = safeCommon;
  return safeSettings;
}

export function createToolInstanceId(toolId = "tool") {
  const safeToolId = String(toolId || "tool")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "tool";

  if (globalThis.crypto?.randomUUID) {
    return `${safeToolId}_${globalThis.crypto.randomUUID()}`;
  }

  return `${safeToolId}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export function normalizeSequenceItem(item, { fallbackToolId = "" } = {}) {
  const safeToolId = String(item?.toolId ?? fallbackToolId ?? "").trim();
  const safeDraft = normalizeToolDraft(item?.draft);
  safeDraft.enabled = true;

  return {
    instanceId: normalizeInstanceId(item?.instanceId, safeToolId),
    toolId: safeToolId,
    draft: safeDraft
  };
}

export function normalizeActivitySequence(sequence, {
  toolsCatalog = []
} = {}) {
  const safeCatalog = Array.isArray(toolsCatalog) ? toolsCatalog : [];
  const allowedToolIds = new Set(
    safeCatalog
      .map((tool) => String(tool?.id || "").trim())
      .filter(Boolean)
  );

  const out = [];
  const usedInstanceIds = new Set();

  const pushItem = (rawItem) => {
    const safeItem = normalizeSequenceItem(rawItem);
    if (!safeItem.toolId) return;
    if (allowedToolIds.size && !allowedToolIds.has(safeItem.toolId)) return;

    let instanceId = safeItem.instanceId;
    while (usedInstanceIds.has(instanceId)) {
      instanceId = createToolInstanceId(safeItem.toolId);
    }

    usedInstanceIds.add(instanceId);
    out.push({
      instanceId,
      toolId: safeItem.toolId,
      draft: safeItem.draft
    });
  };

  if (Array.isArray(sequence)) {
    sequence.forEach(pushItem);
  }

  return out;
}

function normalizeInstanceId(instanceId, toolId) {
  const safeInstanceId = String(instanceId || "").trim();
  if (safeInstanceId) return safeInstanceId;
  return createToolInstanceId(toolId);
}

function normalizeOptionalInt(value, limits, fallback) {
  const min = Number(limits?.min);
  const max = Number(limits?.max);
  const parsed = Math.floor(Number(value));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}
