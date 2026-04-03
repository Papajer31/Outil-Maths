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

export function normalizeActivityGlobals(globals) {
  return {
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
  toolsCatalog = [],
  legacyDrafts = null
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

  if (out.length) {
    return out;
  }

  const safeLegacyDrafts = legacyDrafts && typeof legacyDrafts === "object"
    ? legacyDrafts
    : {};

  const orderedToolIds = safeCatalog.length
    ? safeCatalog.map((tool) => String(tool?.id || "").trim()).filter(Boolean)
    : Object.keys(safeLegacyDrafts);

  orderedToolIds.forEach((toolId) => {
    const safeToolId = String(toolId || "").trim();
    if (!safeToolId) return;

    const safeDraft = normalizeToolDraft(safeLegacyDrafts[safeToolId]);
    if (!safeDraft.enabled) return;

    pushItem({
      toolId: safeToolId,
      draft: safeDraft
    });
  });

  return out;
}

function normalizeInstanceId(instanceId, toolId) {
  const safeInstanceId = String(instanceId || "").trim();
  if (safeInstanceId) return safeInstanceId;
  return createToolInstanceId(toolId);
}
