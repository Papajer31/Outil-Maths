export const TOOL_LIMITS = Object.freeze({
  timePerQ: { min: 5, max: 999, step: 5 },
  questionCount: { min: 1, max: 200, step: 1 },
  answerTime: { min: 0, max: 30, step: 1 },
  successGoalSafetyMilestones: { min: 0, max: 12, step: 1 },
  successGoalCorrectCount: { min: 1, max: 999, step: 1 },
  questionTransitionSec: { min: 0, max: 30, step: 1 },
  toolMaxTimeMin: { min: 1, max: 120, step: 1 },
  activityTotalTimeSec: { min: 60, max: 7200, step: 60 }
});

export const RESPONSE_UI_VALUES = Object.freeze(["boxed", "free"]);
export const PROGRESS_MODE_VALUES = Object.freeze(["evaluated", "practice"]);
export const QUESTION_FLOW_MODE_VALUES = Object.freeze(["fixed", "unlimited", "successGoal"]);

export const DEFAULT_RESPONSE_UI = "boxed";
export const DEFAULT_PROGRESS_MODE = "evaluated";
export const DEFAULT_QUESTION_FLOW_MODE = "fixed";

export const DEFAULT_TOOL_ROW = Object.freeze({
  enabled: false,
  timePerQ: 40,
  questionCount: 10,
  answerTime: 5,
  questionTransitionSec: 5,
  questionTransitionInfinite: false,
  toolMaxTimeMin: 10,
  toolMaxTimeInfinite: true,
  infiniteTimePerQ: false,
  questionFlowMode: DEFAULT_QUESTION_FLOW_MODE,
  successGoalCorrectCount: 10,
  successGoalSafetyMilestones: 3,
  infiniteAnswerTime: false,
  settings: null
});

export const DEFAULT_ACTIVITY_GLOBALS = Object.freeze({
  activityTotalTimeEnabled: false,
  activityTotalTimeSec: 900
});

export const DEFAULT_PASSATION_PROFILE = Object.freeze({
  activityMode: "individual",
  responseUi: DEFAULT_RESPONSE_UI,
  progressMode: DEFAULT_PROGRESS_MODE
});

export const DEFAULT_COMMON_SUCCESS_GOAL = Object.freeze({
  successGoalSafetyMilestones: 3,
  successGoalCorrectCount: 10
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

export function normalizeResponseUi(value, fallback = DEFAULT_RESPONSE_UI) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (RESPONSE_UI_VALUES.includes(safeValue)) return safeValue;

  const safeFallback = String(fallback || "").trim().toLowerCase();
  return RESPONSE_UI_VALUES.includes(safeFallback) ? safeFallback : DEFAULT_RESPONSE_UI;
}

export function normalizeProgressMode(value, fallback = DEFAULT_PROGRESS_MODE) {
  const safeValue = String(value || "").trim().toLowerCase();
  if (PROGRESS_MODE_VALUES.includes(safeValue)) return safeValue;

  const safeFallback = String(fallback || "").trim().toLowerCase();
  return PROGRESS_MODE_VALUES.includes(safeFallback) ? safeFallback : DEFAULT_PROGRESS_MODE;
}

export function normalizeQuestionFlowMode(value, fallback = DEFAULT_QUESTION_FLOW_MODE) {
  const safeValue = String(value || "").trim();
  if (QUESTION_FLOW_MODE_VALUES.includes(safeValue)) return safeValue;

  const safeFallback = String(fallback || "").trim();
  return QUESTION_FLOW_MODE_VALUES.includes(safeFallback) ? safeFallback : DEFAULT_QUESTION_FLOW_MODE;
}

export function getDefaultResponseUiForActivityMode(activityMode = "individual") {
  return String(activityMode || "").trim().toLowerCase() === "group" ? "free" : "boxed";
}

export function normalizePassationProfile(source = {}, fallback = DEFAULT_PASSATION_PROFILE) {
  const fallbackActivityMode = String(fallback?.activityMode || DEFAULT_PASSATION_PROFILE.activityMode).trim().toLowerCase() === "group"
    ? "group"
    : "individual";
  const rawActivityMode = String(source?.activityMode ?? source?.activity_mode ?? "").trim().toLowerCase();
  const activityMode = rawActivityMode === "individual" || rawActivityMode === "group"
    ? rawActivityMode
    : fallbackActivityMode;
  const rawResponseUi = source?.responseUi ?? source?.response_ui;
  const responseUi = normalizeResponseUi(
    rawResponseUi,
    rawResponseUi == null
      ? getDefaultResponseUiForActivityMode(activityMode)
      : (fallback?.responseUi ?? getDefaultResponseUiForActivityMode(activityMode))
  );
  const progressMode = normalizeProgressMode(
    source?.progressMode ?? source?.progress_mode,
    fallback?.progressMode ?? DEFAULT_PROGRESS_MODE
  );

  return { activityMode, responseUi, progressMode };
}

export function isForbiddenPassationProfile(profile = {}) {
  const safe = normalizePassationProfile(profile);
  return safe.activityMode === "individual" && safe.responseUi === "free" && safe.progressMode === "evaluated";
}

export function supportsSuccessGoalQuestionFlow(profile = {}) {
  const safe = normalizePassationProfile(profile);
  return safe.responseUi === "boxed" && safe.progressMode === "evaluated";
}

export function normalizeActivityGlobals(globals) {
  return {
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


export function normalizeToolDraft(draft, { fallbackGlobals = null } = {}) {
  const fallbackTransition = normalizeQuestionTransitionSettings(fallbackGlobals, {
    questionTransitionSec: DEFAULT_TOOL_ROW.questionTransitionSec,
    questionTransitionInfinite: DEFAULT_TOOL_ROW.questionTransitionInfinite
  });
  const transition = normalizeQuestionTransitionSettings(draft, fallbackTransition);
  const rawToolMaxTimeMin = Math.floor(Number(draft?.toolMaxTimeMin));
  const hasValidToolMaxTimeMin = draft?.toolMaxTimeMin != null
    && Number.isFinite(rawToolMaxTimeMin)
    && rawToolMaxTimeMin >= TOOL_LIMITS.toolMaxTimeMin.min;

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
    questionTransitionSec: transition.questionTransitionSec,
    questionTransitionInfinite: transition.questionTransitionInfinite,
    toolMaxTimeMin: hasValidToolMaxTimeMin
      ? clampInt(
          rawToolMaxTimeMin,
          TOOL_LIMITS.toolMaxTimeMin.min,
          TOOL_LIMITS.toolMaxTimeMin.max
        )
      : DEFAULT_TOOL_ROW.toolMaxTimeMin,
    toolMaxTimeInfinite: draft?.toolMaxTimeInfinite == null
      ? DEFAULT_TOOL_ROW.toolMaxTimeInfinite
      : draft?.toolMaxTimeInfinite === true || !hasValidToolMaxTimeMin,
    infiniteTimePerQ: !!draft?.infiniteTimePerQ,
    questionFlowMode: normalizeQuestionFlowMode(draft?.questionFlowMode, DEFAULT_QUESTION_FLOW_MODE),
    successGoalCorrectCount: normalizeOptionalInt(
      draft?.successGoalCorrectCount,
      TOOL_LIMITS.successGoalCorrectCount,
      DEFAULT_COMMON_SUCCESS_GOAL.successGoalCorrectCount
    ),
    successGoalSafetyMilestones: normalizeOptionalInt(
      draft?.successGoalSafetyMilestones,
      TOOL_LIMITS.successGoalSafetyMilestones,
      DEFAULT_COMMON_SUCCESS_GOAL.successGoalSafetyMilestones
    ),
    infiniteAnswerTime: !!draft?.infiniteAnswerTime,
    settings: draft?.settings == null ? null : cloneData(draft.settings)
  };
}

export function normalizeQuestionTransitionSettings(source, fallback = DEFAULT_TOOL_ROW) {
  const fallbackSec = fallback?.questionTransitionSec == null
    ? DEFAULT_TOOL_ROW.questionTransitionSec
    : clampInt(
        fallback?.questionTransitionSec,
        TOOL_LIMITS.questionTransitionSec.min,
        TOOL_LIMITS.questionTransitionSec.max
      );

  return {
    questionTransitionSec: source?.questionTransitionSec == null
      ? fallbackSec
      : clampInt(
          source?.questionTransitionSec,
          TOOL_LIMITS.questionTransitionSec.min,
          TOOL_LIMITS.questionTransitionSec.max
        ),
    questionTransitionInfinite: source?.questionTransitionInfinite == null
      ? fallback?.questionTransitionInfinite === true
      : source?.questionTransitionInfinite === true
  };
}

export function getCommonSuccessGoalSettings(settingsOrDraft = {}) {
  const source = settingsOrDraft && typeof settingsOrDraft === "object" && !Array.isArray(settingsOrDraft)
    ? settingsOrDraft
    : {};
  const settings = source.settings && typeof source.settings === "object" && !Array.isArray(source.settings)
    ? source.settings
    : source;
  const common = settings && typeof settings === "object" && !Array.isArray(settings) && settings.common && typeof settings.common === "object" && !Array.isArray(settings.common)
    ? settings.common
    : null;

  return {
    successGoalSafetyMilestones: normalizeOptionalInt(
      source.successGoalSafetyMilestones ?? common?.successGoalSafetyMilestones,
      TOOL_LIMITS.successGoalSafetyMilestones,
      DEFAULT_COMMON_SUCCESS_GOAL.successGoalSafetyMilestones
    ),
    successGoalCorrectCount: normalizeOptionalInt(
      source.successGoalCorrectCount ?? common?.successGoalCorrectCount,
      TOOL_LIMITS.successGoalCorrectCount,
      DEFAULT_COMMON_SUCCESS_GOAL.successGoalCorrectCount
    )
  };
}

export function ensureCommonSuccessGoalSettings(settings, successGoalSettings = {}) {
  const safeSettings = settings && typeof settings === "object" && !Array.isArray(settings)
    ? cloneData(settings)
    : {};
  const safeCommon = safeSettings.common && typeof safeSettings.common === "object" && !Array.isArray(safeSettings.common)
    ? { ...safeSettings.common }
    : {};
  const currentSettings = getCommonSuccessGoalSettings(settings);

  safeCommon.successGoalSafetyMilestones = normalizeOptionalInt(
    successGoalSettings?.successGoalSafetyMilestones,
    TOOL_LIMITS.successGoalSafetyMilestones,
    currentSettings.successGoalSafetyMilestones
  );
  safeCommon.successGoalCorrectCount = normalizeOptionalInt(
    successGoalSettings?.successGoalCorrectCount,
    TOOL_LIMITS.successGoalCorrectCount,
    currentSettings.successGoalCorrectCount
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

export function normalizeSequenceItem(item, { fallbackToolId = "", fallbackGlobals = null } = {}) {
  const safeToolId = String(item?.toolId ?? fallbackToolId ?? "").trim();
  const safeDraft = normalizeToolDraft(item?.draft, { fallbackGlobals });
  safeDraft.enabled = true;

  const normalized = {
    instanceId: normalizeInstanceId(item?.instanceId, safeToolId),
    toolId: safeToolId,
    draft: safeDraft
  };

  // Les activités du Catalogue transportent des métadonnées qui ne font pas
  // partie du brouillon outil strict, mais dont le runtime élève a besoin :
  // activité source, niveaux adaptatifs, niveau de départ, contexte, etc.
  // On les conserve ici pour éviter que normalizeActivitySequence() transforme
  // une activité Exploration adaptative en simple outil figé au niveau initial.
  preserveSequenceMetadata(item, normalized);

  return normalized;
}

function preserveSequenceMetadata(source, target) {
  if (!source || !target) return target;

  const catalogActivityId = String(source.catalog_activity_id ?? source.catalogActivityId ?? "").trim();
  if (catalogActivityId) {
    target.catalog_activity_id = catalogActivityId;
  }

  const catalogContext = String(source.catalog_context ?? source.catalogContext ?? "").trim();
  if (catalogContext) {
    target.catalog_context = catalogContext;
  }

  const rawLevel = source.catalog_difficulty_level ?? source.catalogDifficultyLevel;
  if (rawLevel != null) {
    const level = Math.floor(Number(rawLevel));
    if (Number.isFinite(level)) {
      target.catalog_difficulty_level = Math.min(5, Math.max(1, level));
    }
  }

  const catalogLevels = source.catalog_levels ?? source.catalogLevels;
  if (catalogLevels && typeof catalogLevels === "object" && !Array.isArray(catalogLevels)) {
    target.catalog_levels = cloneData(catalogLevels);
  }

  const catalogDefaults = source.catalog_defaults ?? source.catalogDefaults;
  if (catalogDefaults && typeof catalogDefaults === "object" && !Array.isArray(catalogDefaults)) {
    target.catalog_defaults = cloneData(catalogDefaults);
  }

  if (source.catalog_adaptive != null || source.catalogAdaptive != null) {
    target.catalog_adaptive = (source.catalog_adaptive ?? source.catalogAdaptive) === true;
  }

  const missionStepId = String(source.mission_step_id ?? source.missionStepId ?? "").trim();
  if (missionStepId) {
    target.mission_step_id = missionStepId;
  }

  return target;
}

export function normalizeActivitySequence(sequence, {
  toolsCatalog = [],
  fallbackGlobals = null
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
    const safeItem = normalizeSequenceItem(rawItem, { fallbackGlobals });
    if (!safeItem.toolId) return;
    if (allowedToolIds.size && !allowedToolIds.has(safeItem.toolId)) return;

    let instanceId = safeItem.instanceId;
    while (usedInstanceIds.has(instanceId)) {
      instanceId = createToolInstanceId(safeItem.toolId);
    }

    usedInstanceIds.add(instanceId);

    // Important : normalizeSequenceItem() a déjà conservé les métadonnées
    // Catalogue/Mission utiles au runtime (catalog_activity_id, catalog_levels,
    // catalog_adaptive, etc.). Ne pas reconstruire un objet minimal ici, sinon
    // l’Exploration adaptative redevient une activité figée au niveau initial.
    out.push({
      ...safeItem,
      instanceId
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
