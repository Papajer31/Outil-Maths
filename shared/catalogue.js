import { DEFAULT_ACTIVITY_MODE } from "./activity-modes.js";
import { DEFAULT_QUESTION_FLOW_MODE, normalizeExecutionLimit } from "./activity-config.js";

export const CATALOG_ROOT_LABEL = "Exploration";

export const CATALOG_LEVELS = Object.freeze([
  { level: 1, key: "grande_difficulte", label: "Grande difficulté" },
  { level: 2, key: "petite_difficulte", label: "Petite difficulté" },
  { level: 3, key: "normal", label: "Normal" },
  { level: 4, key: "reussite", label: "Réussite" },
  { level: 5, key: "grande_reussite", label: "Grande réussite" }
]);

export const EXPLORATION_DEFAULTS = Object.freeze({
  questionCount: 5,
  timePerQ: 40,
  infiniteTimePerQ: true,
  answerTime: 5,
  infiniteAnswerTime: true,
  questionTransitionSec: 0,
  questionTransitionInfinite: false,
  toolMaxTimeMin: 10,
  toolMaxTimeInfinite: true,
  questionFlowMode: DEFAULT_QUESTION_FLOW_MODE,
  successGoalCorrectCount: 10,
  successGoalSafetyMilestones: 3
});

export const CATALOG_TEST_OVERRIDES = Object.freeze({
  questionCount: 5,
  answerTime: 5,
  infiniteAnswerTime: true,
  questionTransitionSec: 0,
  questionTransitionInfinite: false,
  toolMaxTimeMin: 10,
  toolMaxTimeInfinite: true,
  questionFlowMode: "unlimited",
  successGoalCorrectCount: 10,
  successGoalSafetyMilestones: 3
});

export const PEDAGOGICAL_NODE_TYPES = Object.freeze(["discipline", "domain", "theme", "learning_objective", "grade_level"]);

export const PEDAGOGICAL_GRADE_LEVELS = Object.freeze(["CP", "CE1", "CE2", "CM1", "CM2"]);

export function normalizePedagogicalNode(folder = {}, fallbackOrder = 0) {
  const id = String(folder?.id || "").trim();
  const parentId = String(folder?.parent_id || "").trim() || null;
  const inferredType = parentId ? "domain" : "discipline";
  const rawType = String(folder?.node_type || inferredType).trim();
  const nodeType = PEDAGOGICAL_NODE_TYPES.includes(rawType) ? rawType : inferredType;
  const order = Number(folder?.display_order);
  return {
    ...folder,
    id,
    parent_id: parentId,
    name: String(folder?.name || id).trim() || id,
    node_type: nodeType,
    student_label: String(folder?.student_label || "").trim() || null,
    student_navigation_mode: String(folder?.student_navigation_mode || "").trim() === "transparent"
      ? "transparent"
      : "folder",
    display_order: Number.isFinite(order) ? Math.max(0, Math.trunc(order)) : Math.max(0, Math.trunc(Number(fallbackOrder) || 0)),
    is_active: folder?.is_active !== false
  };
}

export function normalizeCatalogGradeLevel(value) {
  const compact = String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
  return ["CE1", "CE2", "CM1", "CM2", "CP"].find((level) => compact.startsWith(level)) || "";
}

export function normalizeCatalogGradeLevels(value, { fallback = [] } = {}) {
  const source = Array.isArray(value) ? value : fallback;
  return [...new Set(source.map(normalizeCatalogGradeLevel).filter(Boolean))];
}

export function getPedagogicalNodeGradeLevel(folder = {}) {
  const normalized = normalizePedagogicalNode(folder);
  if (normalized.node_type !== "grade_level") return "";
  return normalizeCatalogGradeLevel(normalized.name || normalized.id.split(".").pop());
}

export function sortPedagogicalNodes(folders = []) {
  return [...(Array.isArray(folders) ? folders : [])]
    .map(normalizePedagogicalNode)
    .sort((a, b) => {
      const parentA = String(a?.parent_id || "");
      const parentB = String(b?.parent_id || "");
      const byParent = parentA.localeCompare(parentB, "fr", { sensitivity: "base" });
      if (byParent !== 0) return byParent;
      const orderA = Number(a?.display_order) || 0;
      const orderB = Number(b?.display_order) || 0;
      if (orderA !== orderB) return orderA - orderB;
      return String(a?.name || "").localeCompare(String(b?.name || ""), "fr", { sensitivity: "base" });
    });
}

function hasExplicitGradeFolders(folders = []) {
  return (Array.isArray(folders) ? folders : [])
    .some((folder) => normalizePedagogicalNode(folder).node_type === "grade_level");
}

function getLegacyEffectiveGradeLevels(folders = [], folderId = "") {
  const folderById = new Map((Array.isArray(folders) ? folders : []).map((folder, index) => {
    const normalized = normalizePedagogicalNode(folder, index);
    return [normalized.id, normalized];
  }));
  const seen = new Set();
  let cursor = folderById.get(String(folderId || "").trim()) || null;
  while (cursor && !seen.has(cursor.id)) {
    seen.add(cursor.id);
    if (String(cursor.grade_scope_mode || "").trim() === "custom") {
      return normalizeCatalogGradeLevels(cursor.grade_levels);
    }
    cursor = cursor.parent_id ? folderById.get(cursor.parent_id) || null : null;
  }
  return [...PEDAGOGICAL_GRADE_LEVELS];
}

export function getPedagogicalNodeEffectiveGradeLevels(folders = [], folderId = "") {
  const normalized = (Array.isArray(folders) ? folders : []).map(normalizePedagogicalNode);
  if (!hasExplicitGradeFolders(normalized)) {
    return getLegacyEffectiveGradeLevels(normalized, folderId);
  }

  const folderById = new Map(normalized.map((folder) => [folder.id, folder]));
  const childrenByParent = new Map();
  normalized.forEach((folder) => {
    const parentId = String(folder.parent_id || "");
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(folder);
  });

  const root = folderById.get(String(folderId || "").trim()) || null;
  if (!root) return [];

  const levels = new Set();
  const seen = new Set();
  const visit = (folder) => {
    if (!folder || seen.has(folder.id)) return;
    seen.add(folder.id);
    const grade = getPedagogicalNodeGradeLevel(folder);
    if (grade) levels.add(grade);
    (childrenByParent.get(folder.id) || []).forEach(visit);
  };
  visit(root);

  return PEDAGOGICAL_GRADE_LEVELS.filter((grade) => levels.has(grade));
}

export function filterEffectivelyActivePedagogicalNodes(folders = []) {
  const normalized = (Array.isArray(folders) ? folders : []).map(normalizePedagogicalNode);
  const folderById = new Map(normalized.map((folder) => [folder.id, folder]));
  const memo = new Map();
  const isEffectivelyActive = (folder) => {
    if (!folder) return false;
    if (memo.has(folder.id)) return memo.get(folder.id);
    if (folder.is_active === false) {
      memo.set(folder.id, false);
      return false;
    }
    const active = !folder.parent_id || isEffectivelyActive(folderById.get(folder.parent_id));
    memo.set(folder.id, active);
    return active;
  };
  return normalized.filter(isEffectivelyActive);
}

export function filterPedagogicalNodesForGradeLevels(folders = [], gradeLevels = [], { requireAll = true } = {}) {
  const normalizedGrades = normalizeCatalogGradeLevels(gradeLevels);
  const activeFolders = filterEffectivelyActivePedagogicalNodes(folders);
  if (!normalizedGrades.length) return activeFolders;

  if (!hasExplicitGradeFolders(activeFolders)) {
    return activeFolders.filter((folder) => {
      const allowed = new Set(getLegacyEffectiveGradeLevels(activeFolders, folder.id));
      return requireAll
        ? normalizedGrades.every((grade) => allowed.has(grade))
        : normalizedGrades.some((grade) => allowed.has(grade));
    });
  }

  const folderById = new Map(activeFolders.map((folder) => [folder.id, folder]));

  if (requireAll && normalizedGrades.length > 1) {
    return activeFolders.filter((folder) => {
      if (folder.node_type === "grade_level") return false;
      const allowed = new Set(getPedagogicalNodeEffectiveGradeLevels(activeFolders, folder.id));
      return normalizedGrades.every((grade) => allowed.has(grade));
    });
  }

  const selected = new Set(normalizedGrades);
  const visibleIds = new Set();

  activeFolders.forEach((folder) => {
    const grade = getPedagogicalNodeGradeLevel(folder);
    if (!grade || !selected.has(grade)) return;

    let cursor = folder;
    const seen = new Set();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      visibleIds.add(cursor.id);
      cursor = cursor.parent_id ? folderById.get(cursor.parent_id) || null : null;
    }
  });

  return activeFolders.filter((folder) => visibleIds.has(folder.id));
}

export function getCatalogActivityById(activityId, catalogActivities = null) {
  const safeId = normalizeCatalogActivityId(activityId);
  const source = Array.isArray(catalogActivities) ? catalogActivities : [];
  return source.map(normalizeCatalogActivity).find((activity) => activity.id === safeId) || null;
}

export function findCatalogActivity(value, catalogActivities = null) {
  const needle = String(value || "").trim();
  if (!needle) return null;
  const source = Array.isArray(catalogActivities) ? catalogActivities : [];
  const normalizedNeedle = normalizeCatalogActivityId(needle);
  const labelNeedle = normalizeCatalogLabel(needle);
  return source.map(normalizeCatalogActivity).find((activity) => (
    activity.id === normalizedNeedle || normalizeCatalogLabel(activity.config_name) === labelNeedle
  )) || null;
}

export function normalizeCatalogActivity(activity = {}) {
  const id = normalizeCatalogActivityId(activity?.id ?? activity?.catalog_activity_id);
  const title = String(activity?.config_name ?? activity?.title ?? activity?.label ?? id).trim() || id;
  const categoryId = String(activity?.pedagogical_node_id ?? activity?.folder_id ?? "").trim() || null;
  const rawLevels = activity?.difficulty_levels_json ?? activity?.difficulty_levels ?? activity?.levels_json ?? activity?.levels;
  const difficultyLevels = normalizeDifficultyLevels(rawLevels);
  const defaultLevelConfig = getCatalogLevelConfig({ difficulty_levels: difficultyLevels }, 3);
  const defaultLevelSettings = defaultLevelConfig.settings;
  const fallbackSettings = activity?.settings === undefined ? null : activity.settings;
  const defaultQuestionCount = getCatalogActivityQuestionCountFromLevels(rawLevels, activity?.default_question_count ?? activity?.question_count);

  return {
    ...activity,
    id,
    config_name: title,
    title,
    module_key: "tools",
    tool_id: String(activity?.tool_id ?? activity?.toolId ?? "").trim(),
    folder_id: categoryId,
    pedagogical_node_id: categoryId,
    description: String(activity?.description ?? "").trim(),
    adventure_tier: Number.isFinite(Number(activity?.adventure_tier))
      ? Math.max(1, Math.trunc(Number(activity.adventure_tier)))
      : 1,
    display_order: Number.isFinite(Number(activity?.display_order)) ? Math.max(0, Math.trunc(Number(activity.display_order))) : 0,
    activity_mode: DEFAULT_ACTIVITY_MODE,
    is_visible: activity?.is_visible !== false,
    is_highlighted: false,
    is_catalog: true,
    status: String(activity?.status || "published").trim() || "published",
    default_visible: activity?.default_visible !== false,
    default_question_count: defaultQuestionCount,
    question_count: defaultQuestionCount,
    difficulty_levels: difficultyLevels,
    settings: fallbackSettings ?? defaultLevelSettings
  };
}

export function normalizeDifficultyLevels(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return CATALOG_LEVELS.reduce((acc, meta) => {
    const raw = source[String(meta.level)] ?? source[meta.key] ?? source[meta.level] ?? {};
    acc[String(meta.level)] = normalizeLevelConfig(raw);
    return acc;
  }, {});
}

export function getCatalogLevelConfig(activityOrLevels = {}, level = 3) {
  const safeLevel = clampDifficultyLevel(level);
  const levels = normalizeDifficultyLevels(activityOrLevels?.difficulty_levels ?? activityOrLevels);
  return normalizeLevelConfig(levels[String(safeLevel)] || {});
}

export function getCatalogLevelSettings(activityOrLevels = {}, level = 3) {
  const config = getCatalogLevelConfig(activityOrLevels, level);
  return config.settings && typeof config.settings === "object" && !Array.isArray(config.settings)
    ? config.settings
    : {};
}

export function normalizeCatalogDifficultyLevel(value) {
  return clampDifficultyLevel(value);
}

export function normalizeCatalogRuntimeContext(value, fallback = "exploration") {
  const normalize = (candidate) => {
    const safe = String(candidate || "").trim().toLowerCase();
    if (safe === "aventure") return "adventure";
    return ["exploration", "mission", "adventure", "test"].includes(safe) ? safe : "";
  };

  return normalize(value) || normalize(fallback) || "exploration";
}

function isQuizSeriesSettings(settings = null) {
  const safe = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const snapshot = safe.quizSnapshot ?? safe.quiz_snapshot ?? null;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return false;
  const editorMode = String(snapshot.editorMode ?? snapshot.editor_mode ?? "").trim();
  const seriesModelId = String(snapshot.seriesModelId ?? snapshot.series_model_id ?? "").trim();
  return editorMode === "series" || Boolean(seriesModelId);
}

function hasConfiguredQuizSnapshot(settings = null) {
  const safe = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const snapshot = safe.quizSnapshot ?? safe.quiz_snapshot ?? safe.snapshot ?? null;
  return !!(snapshot && typeof snapshot === "object" && !Array.isArray(snapshot)
    && Array.isArray(snapshot.questions) && snapshot.questions.length > 0);
}

function getQuizLevelSettingsWithFallback(activity = {}, levelSettings = {}) {
  const safeLevel = levelSettings && typeof levelSettings === "object" && !Array.isArray(levelSettings)
    ? levelSettings
    : {};
  if (String(activity?.tool_id ?? activity?.toolId ?? "").trim() !== "quiz") return safeLevel;
  if (hasConfiguredQuizSnapshot(safeLevel) || !hasConfiguredQuizSnapshot(activity?.settings)) return safeLevel;

  // L'éditeur de catalogue s'ouvre au niveau 3, alors que l'adaptatif élève
  // démarre au niveau 1. Un niveau Quiz encore vierge hérite donc du snapshot
  // de référence de l'activité au lieu de lancer un quiz vide. Les éventuels
  // réglages communs propres au niveau restent prioritaires.
  const { quizSnapshot, quiz_snapshot, snapshot, ...levelOverrides } = safeLevel;
  return {
    ...(activity.settings && typeof activity.settings === "object" && !Array.isArray(activity.settings) ? activity.settings : {}),
    ...levelOverrides
  };
}

function getCatalogActivitySettingsCandidates(activity = {}) {
  const candidates = [];
  const push = (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) candidates.push(value);
  };

  push(activity?.settings);

  const levels = activity?.difficulty_levels_json
    ?? activity?.difficulty_levels
    ?? activity?.levels_json
    ?? activity?.levels
    ?? null;
  if (levels && typeof levels === "object" && !Array.isArray(levels)) {
    Object.values(levels).forEach((level) => {
      if (level && typeof level === "object" && !Array.isArray(level)) push(level.settings);
    });
  }

  return candidates;
}

export function isIntrinsicCatalogActivity(activity = {}, settingsOverride = null) {
  if (String(activity?.tool_id ?? activity?.toolId ?? "").trim() !== "quiz") return false;

  // Au runtime, le réglage du palier/niveau courant est la source de vérité.
  if (settingsOverride && typeof settingsOverride === "object" && !Array.isArray(settingsOverride)) {
    return !isQuizSeriesSettings(settingsOverride);
  }

  // Dans les éditeurs Mission/Aventure, aucun niveau élève n’est encore connu.
  // Si l’activité contient une série à l’un de ses niveaux, on laisse donc
  // l’enseignant définir Questions/Temps plutôt que de la verrouiller à tort.
  const candidates = getCatalogActivitySettingsCandidates(activity);
  return !candidates.some(isQuizSeriesSettings);
}

export function getDefaultExecutionLimitForContext(context = "exploration") {
  const safe = normalizeCatalogRuntimeContext(context);
  if (safe === "exploration") return { mode: "questions", value: EXPLORATION_DEFAULTS.questionCount };
  return { mode: "questions", value: 5 };
}

export function buildCatalogActivityConfig(activityOrId, options = {}) {
  const catalogActivities = Array.isArray(options.catalogActivities) ? options.catalogActivities : null;
  const activity = typeof activityOrId === "object" && activityOrId
    ? normalizeCatalogActivity(activityOrId)
    : getCatalogActivityById(activityOrId, catalogActivities);
  if (!activity) return null;

  const catalogContext = normalizeCatalogRuntimeContext(options.context ?? options.catalogContext);
  const activityMode = normalizeRuntimeMode(options.activityMode);
  const responseUi = String(options.responseUi || (activityMode === "group" ? "free" : "boxed")).trim() || "boxed";
  const progressMode = String(options.progressMode || "practice").trim() || "practice";
  const defaults = {
    ...EXPLORATION_DEFAULTS,
    ...(options.defaults && typeof options.defaults === "object" ? options.defaults : {})
  };
  const runtimeOverrides = getCatalogRuntimeOverrides(catalogContext, options.overrides);
  const difficultyLevel = clampDifficultyLevel(options.difficultyLevel ?? 3);
  const levelConfig = getCatalogLevelConfig(activity, difficultyLevel);
  const difficultyLevels = normalizeDifficultyLevels(activity.difficulty_levels);
  const levelSettings = getQuizLevelSettingsWithFallback(activity, levelConfig.settings);
  const settings = pickCatalogConfigValue(options, runtimeOverrides, "settings", levelSettings ?? activity.settings ?? null);
  const legacyQuestionCount = pickCatalogConfigValue(
    options,
    runtimeOverrides,
    "questionCount",
    null
  );
  const requestedExecutionLimit = options.executionLimit
    ?? options.execution_limit
    ?? runtimeOverrides.executionLimit
    ?? runtimeOverrides.execution_limit
    ?? (legacyQuestionCount == null ? null : { mode: "questions", value: legacyQuestionCount })
    ?? getDefaultExecutionLimitForContext(catalogContext);
  const externalExecutionLimit = normalizeExecutionLimit(
    requestedExecutionLimit,
    getDefaultExecutionLimitForContext(catalogContext)
  );
  const executionLimit = isIntrinsicCatalogActivity(activity, settings)
    ? { mode: "intrinsic", value: null }
    : externalExecutionLimit;
  const questionCount = executionLimit.mode === "questions"
    ? clampQuestionCount(executionLimit.value)
    : clampQuestionCount(defaults.questionCount);
  const timePerQ = clampPositiveInt(pickCatalogConfigValue(
    options,
    runtimeOverrides,
    "timePerQ",
    levelConfig.timePerQ == null ? defaults.timePerQ : levelConfig.timePerQ
  ), defaults.timePerQ);
  const infiniteTimePerQ = pickCatalogConfigValue(
    options,
    runtimeOverrides,
    "infiniteTimePerQ",
    levelConfig.infiniteTimePerQ == null ? defaults.infiniteTimePerQ === true : levelConfig.infiniteTimePerQ === true
  ) === true;
  const answerTime = clampNonNegativeInt(pickCatalogConfigValue(options, runtimeOverrides, "answerTime", defaults.answerTime), defaults.answerTime);
  const infiniteAnswerTime = pickCatalogConfigValue(options, runtimeOverrides, "infiniteAnswerTime", defaults.infiniteAnswerTime) === true;
  const questionTransitionSec = clampNonNegativeInt(
    pickCatalogConfigValue(options, runtimeOverrides, "questionTransitionSec", defaults.questionTransitionSec),
    defaults.questionTransitionSec
  );
  const questionTransitionInfinite = pickCatalogConfigValue(
    options,
    runtimeOverrides,
    "questionTransitionInfinite",
    defaults.questionTransitionInfinite
  ) === true;
  const toolMaxTimeMin = clampPositiveInt(pickCatalogConfigValue(options, runtimeOverrides, "toolMaxTimeMin", defaults.toolMaxTimeMin), defaults.toolMaxTimeMin);
  const toolMaxTimeInfinite = pickCatalogConfigValue(options, runtimeOverrides, "toolMaxTimeInfinite", defaults.toolMaxTimeInfinite) === true;
  const questionFlowMode = executionLimit.mode === "success"
    ? "successGoal"
    : executionLimit.mode === "time"
      ? "unlimited"
      : "fixed";
  const successGoalCorrectCount = executionLimit.mode === "success"
    ? Math.max(1, Math.trunc(Number(executionLimit.value) || 10))
    : clampPositiveInt(pickCatalogConfigValue(
        options,
        runtimeOverrides,
        "successGoalCorrectCount",
        defaults.successGoalCorrectCount
      ), defaults.successGoalCorrectCount);
  const successGoalSafetyMilestones = executionLimit.mode === "success"
    ? Math.max(0, Math.min(12, Math.trunc(Number(executionLimit.milestones) || 0)))
    : clampNonNegativeInt(pickCatalogConfigValue(
        options,
        runtimeOverrides,
        "successGoalSafetyMilestones",
        defaults.successGoalSafetyMilestones
      ), defaults.successGoalSafetyMilestones);
  const activityTotalTimeSec = pickCatalogConfigValue(options, runtimeOverrides, "activityTotalTimeSec", null);
  const hasActivityTotalTimeSec = activityTotalTimeSec != null
    && String(activityTotalTimeSec).trim() !== ""
    && Number.isFinite(Number(activityTotalTimeSec));
  const activityTotalTimeEnabled = pickCatalogConfigValue(
    options,
    runtimeOverrides,
    "activityTotalTimeEnabled",
    hasActivityTotalTimeSec
  ) === true;
  const catalogAdaptive = catalogContext === "test" ? false : options.adaptive !== false;

  return {
    version: 1,
    type: "catalog_activity_runtime",
    catalog_activity_id: activity.id,
    catalog_difficulty_level: difficultyLevel,
    catalog_context: catalogContext,
    activity_mode: activityMode,
    response_ui: responseUi,
    progress_mode: progressMode,
    globals: {
      activityTotalTimeEnabled,
      activityTotalTimeSec: hasActivityTotalTimeSec
        ? Math.max(60, Math.trunc(Number(activityTotalTimeSec)))
        : 900
    },
    sequence: [{
      instanceId: `${activity.tool_id}_${activity.id.replace(/[^a-z0-9_-]+/g, "-")}`,
      toolId: activity.tool_id,
      catalog_activity_id: activity.id,
      catalog_activity_title: activity.config_name,
      catalog_context: catalogContext,
      catalog_difficulty_level: difficultyLevel,
      catalog_levels: difficultyLevels,
      catalog_adaptive: catalogAdaptive,
      catalog_defaults: {
        timePerQ,
        infiniteTimePerQ
      },
      draft: {
        enabled: true,
        ...defaults,
        executionLimit,
        questionCount,
        timePerQ,
        infiniteTimePerQ,
        answerTime,
        infiniteAnswerTime,
        questionTransitionSec,
        questionTransitionInfinite,
        toolMaxTimeMin,
        toolMaxTimeInfinite,
        questionFlowMode,
        successGoalCorrectCount,
        successGoalSafetyMilestones,
        settings
      }
    }]
  };
}

const DIRECT_QUIZ_CATALOG_ACTIVITY_ID = "system.quiz.direct";

export function buildMissionRuntimeConfig(mission = {}, steps = [], options = {}) {
  const catalogActivities = Array.isArray(options.catalogActivities) ? options.catalogActivities : null;
  const activityMode = normalizeRuntimeMode(options.activityMode);
  const answerMode = String(mission?.answer_mode || "student_input").trim();
  const intentMode = String(mission?.intent_mode || "practice").trim();
  const responseUi = answerMode === "manual_validation" || activityMode === "group" ? "free" : "boxed";
  const progressMode = intentMode === "evaluation" ? "evaluated" : "practice";
  const questionTime = mission?.question_time_seconds == null ? null : Math.max(0, Math.trunc(Number(mission.question_time_seconds) || 0));
  const answerDisplay = mission?.answer_display_seconds == null ? null : Math.max(0, Math.trunc(Number(mission.answer_display_seconds) || 0));
  const transition = Math.max(0, Math.trunc(Number(mission?.transition_seconds) || 0));

  const sequence = (Array.isArray(steps) ? steps : [])
    .map((step, index) => {
      const directQuiz = String(step?.catalog_activity_id || "") === DIRECT_QUIZ_CATALOG_ACTIVITY_ID
        ? step?.step_options_json?.direct_quiz
        : null;
      if (directQuiz) {
        const settings = step?.step_options_json?.settings && typeof step.step_options_json.settings === "object"
          ? step.step_options_json.settings
          : null;
        if (!settings?.quizSnapshot) return null;
        const title = String(directQuiz?.title || settings?.quizTitle || "Quiz").trim() || "Quiz";
        const executionLimit = normalizeExecutionLimit(
          step?.step_options_json?.execution_limit ?? { mode: "questions", value: directQuiz?.question_count ?? 1 },
          { mode: "questions", value: 1 }
        );
        return {
          instanceId: `quiz_${String(step?.id || index).replace(/[^a-zA-Z0-9_-]+/g, "-")}`,
          toolId: "quiz",
          catalog_activity_id: DIRECT_QUIZ_CATALOG_ACTIVITY_ID,
          catalog_activity_title: title,
          catalog_context: "mission",
          catalog_difficulty_level: 3,
          catalog_levels: null,
          catalog_adaptive: false,
          mission_id: String(mission?.id || ""),
          mission_step_id: String(step?.id || ""),
          // Dans une mission, la fin du quiz rend toujours la main au moteur de mission.
          auto_exit_session_on_complete: false,
          draft: {
            enabled: true,
            executionLimit,
            questionCount: executionLimit.mode === "questions" ? executionLimit.value : 1,
            // Le chrono est désormais porté par chaque question du quiz.
            // Le moteur générique démarre donc le quiz sans limite globale ;
            // le runtime Quiz fournit ensuite la durée de la question courante.
            timePerQ: 40,
            infiniteTimePerQ: true,
            answerTime: answerDisplay == null ? 5 : answerDisplay,
            infiniteAnswerTime: answerDisplay == null,
            questionTransitionSec: transition,
            questionTransitionInfinite: false,
            toolMaxTimeMin: 10,
            toolMaxTimeInfinite: true,
            questionFlowMode: DEFAULT_QUESTION_FLOW_MODE,
            successGoalCorrectCount: 10,
            successGoalSafetyMilestones: 3,
            settings
          }
        };
      }

      const activity = getCatalogActivityById(step?.catalog_activity_id, catalogActivities);
      if (!activity) return null;
      const difficultyMode = String(step?.difficulty_mode || "normal").trim().toLowerCase();
      const difficultyFallback = difficultyMode === "adaptive" ? 1 : (step?.difficulty_level ?? 3);
      const difficultyLevel = clampDifficultyLevel(
        step?.resolved_difficulty_level ?? step?.resolvedDifficultyLevel ?? difficultyFallback
      );
      const levelSettings = getCatalogLevelSettings(activity, difficultyLevel);
      const stepLimit = normalizeExecutionLimit(
        step?.step_options_json?.execution_limit ?? step?.step_options_json?.executionLimit ?? { mode: "questions", value: 5 },
        { mode: "questions", value: 5 }
      );
      const executionLimit = isIntrinsicCatalogActivity(activity, levelSettings)
        ? { mode: "intrinsic", value: null }
        : stepLimit;
      return {
        instanceId: `${activity.tool_id}_${String(step?.id || index).replace(/[^a-zA-Z0-9_-]+/g, "-")}`,
        toolId: activity.tool_id,
        catalog_activity_id: activity.id,
        catalog_activity_title: activity.config_name,
        catalog_context: "mission",
        catalog_difficulty_level: difficultyLevel,
        catalog_levels: activity.difficulty_levels && typeof activity.difficulty_levels === "object" && !Array.isArray(activity.difficulty_levels)
          ? activity.difficulty_levels
          : null,
        catalog_adaptive: difficultyMode === "adaptive",
        mission_id: String(mission?.id || ""),
        mission_step_id: String(step?.id || ""),
        draft: {
          enabled: true,
          executionLimit,
          questionCount: executionLimit.mode === "questions" ? executionLimit.value : 5,
          timePerQ: questionTime == null || questionTime <= 0 ? 40 : questionTime,
          infiniteTimePerQ: questionTime == null,
          answerTime: answerDisplay == null ? 5 : answerDisplay,
          infiniteAnswerTime: answerDisplay == null,
          questionTransitionSec: transition,
          questionTransitionInfinite: false,
          toolMaxTimeMin: 10,
          toolMaxTimeInfinite: true,
          questionFlowMode: DEFAULT_QUESTION_FLOW_MODE,
          successGoalCorrectCount: 10,
          successGoalSafetyMilestones: 3,
          settings: step?.step_options_json?.settings ?? levelSettings ?? activity.settings ?? null
        }
      };
    })
    .filter(Boolean);

  return {
    version: 1,
    type: "mission_runtime",
    mission_id: String(mission?.id || ""),
    activity_mode: activityMode,
    response_ui: responseUi,
    progress_mode: progressMode,
    globals: {
      // La durée appartient désormais à chaque étape générative de la mission.
      // Les anciens champs globaux mission_time_seconds restent en base pour compatibilité,
      // mais ne pilotent plus l’exécution.
      activityTotalTimeEnabled: false,
      activityTotalTimeSec: 900
    },
    sequence
  };
}

export function applyCatalogVisibility(activities = [], visibilityRows = []) {
  const visibilityById = new Map((Array.isArray(visibilityRows) ? visibilityRows : []).map((row) => [
    normalizeCatalogActivityId(row?.catalog_activity_id),
    row?.is_visible !== false
  ]));

  return (Array.isArray(activities) ? activities : []).map((activity) => {
    const normalizedActivity = normalizeCatalogActivity(activity);
    const id = normalizeCatalogActivityId(normalizedActivity?.id);
    const defaultVisible = normalizedActivity.default_visible !== false;
    const isVisible = visibilityById.has(id) ? visibilityById.get(id) : defaultVisible;
    return {
      ...normalizedActivity,
      is_visible: isVisible
    };
  });
}

export function sortCatalogActivities(activities = []) {
  return [...(Array.isArray(activities) ? activities : [])]
    .map(normalizeCatalogActivity)
    .sort((a, b) => {
      const folderA = String(a?.folder_id || "");
      const folderB = String(b?.folder_id || "");
      const byFolder = folderA.localeCompare(folderB, "fr", { sensitivity: "base" });
      if (byFolder !== 0) return byFolder;
      const tierA = Number(a?.adventure_tier) || 1;
      const tierB = Number(b?.adventure_tier) || 1;
      if (tierA !== tierB) return tierA - tierB;
      const orderA = Number(a?.display_order) || 0;
      const orderB = Number(b?.display_order) || 0;
      if (orderA !== orderB) return orderA - orderB;
      return String(a?.config_name || "").localeCompare(String(b?.config_name || ""), "fr", { sensitivity: "base" });
    });
}

function normalizeLevelConfig(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { settings: {} };
  }
  const settings = value.settings && typeof value.settings === "object" && !Array.isArray(value.settings)
    ? value.settings
    : (value.tool_settings && typeof value.tool_settings === "object" && !Array.isArray(value.tool_settings) ? value.tool_settings : {});
  const out = {
    ...value,
    settings
  };
  if (value.timePerQ != null) {
    out.timePerQ = clampPositiveInt(value.timePerQ, EXPLORATION_DEFAULTS.timePerQ);
  }
  if (value.infiniteTimePerQ != null) {
    out.infiniteTimePerQ = value.infiniteTimePerQ === true;
  }
  return out;
}

function getCatalogActivityQuestionCountFromLevels(rawLevels, fallback = EXPLORATION_DEFAULTS.questionCount) {
  const source = rawLevels && typeof rawLevels === "object" && !Array.isArray(rawLevels) ? rawLevels : {};
  return clampQuestionCount(
    source.__activity?.questionCount ?? source.__activity?.question_count ?? source.defaults?.questionCount ?? source.defaults?.question_count ?? fallback
  );
}

function clampQuestionCount(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return EXPLORATION_DEFAULTS.questionCount;
  return Math.max(1, Math.min(200, number));
}

function clampPositiveInt(value, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(1, number);
}

function clampNonNegativeInt(value, fallback) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, number);
}

function clampDifficultyLevel(value) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return 3;
  return Math.max(1, Math.min(5, number));
}

function normalizeRuntimeMode(value) {
  return String(value || "").trim().toLowerCase() === "group" ? "group" : "individual";
}

function normalizeCatalogActivityId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeCatalogLabel(value) {
  return String(value || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function getCatalogRuntimeOverrides(context, overrides) {
  const base = normalizeCatalogRuntimeContext(context) === "test"
    ? CATALOG_TEST_OVERRIDES
    : {};
  const explicit = overrides && typeof overrides === "object" && !Array.isArray(overrides)
    ? overrides
    : {};
  return {
    ...base,
    ...explicit
  };
}

function pickCatalogConfigValue(options, overrides, key, fallback) {
  if (hasOwn(options, key)) return options[key];
  if (hasOwn(overrides, key)) return overrides[key];
  return fallback;
}

function normalizeQuestionFlowModeValue(value, fallback = DEFAULT_QUESTION_FLOW_MODE) {
  const safeValue = String(value || "").trim();
  if (["fixed", "unlimited", "successGoal"].includes(safeValue)) return safeValue;
  const safeFallback = String(fallback || "").trim();
  return ["fixed", "unlimited", "successGoal"].includes(safeFallback)
    ? safeFallback
    : DEFAULT_QUESTION_FLOW_MODE;
}

function hasOwn(source, key) {
  return !!source && Object.prototype.hasOwnProperty.call(source, key);
}
