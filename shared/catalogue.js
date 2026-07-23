import { DEFAULT_ACTIVITY_MODE } from "./activity-modes.js";
import { DEFAULT_QUESTION_FLOW_MODE } from "./activity-config.js";

export const CATALOG_ROOT_LABEL = "Exploration";

export const CATALOG_CATEGORIES = Object.freeze([
  { id: "francais", parent_id: null, name: "Français", display_order: 0 },
  { id: "francais.lecture", parent_id: "francais", name: "Lecture", display_order: 0 },
  { id: "francais.ecriture", parent_id: "francais", name: "Écriture", display_order: 1 },
  { id: "francais.oral", parent_id: "francais", name: "Oral", display_order: 2 },
  { id: "francais.vocabulaire", parent_id: "francais", name: "Vocabulaire", display_order: 3 },
  { id: "francais.grammaire", parent_id: "francais", name: "Grammaire", display_order: 4 },
  { id: "francais.orthographe", parent_id: "francais", name: "Orthographe", display_order: 5 },

  { id: "mathematiques", parent_id: null, name: "Mathématiques", display_order: 1 },
  { id: "mathematiques.nombres", parent_id: "mathematiques", name: "Nombres", display_order: 0 },
  { id: "mathematiques.calculs", parent_id: "mathematiques", name: "Calculs", display_order: 1 },
  { id: "mathematiques.resolution-problemes", parent_id: "mathematiques", name: "Résolution de problèmes", display_order: 2 },
  { id: "mathematiques.grandeurs-mesures", parent_id: "mathematiques", name: "Grandeurs et mesures", display_order: 3 },
  { id: "mathematiques.espace-geometrie", parent_id: "mathematiques", name: "Espace et géométrie", display_order: 4 },
  { id: "mathematiques.donnees", parent_id: "mathematiques", name: "Organisation et gestion de données", display_order: 5 },

  { id: "questionner-le-monde", parent_id: null, name: "Questionner le monde", display_order: 2 },
  { id: "emc", parent_id: null, name: "EMC", display_order: 3 },
  { id: "autres", parent_id: null, name: "Autres", display_order: 5 }
]);

// Catalogue de secours côté code : utilisé uniquement si la table système n'existe pas encore
// ou si l'on travaille hors Supabase. Dès que catalog_activities existe, la base devient la source.
export const CATALOG_ACTIVITIES = Object.freeze([
  {
    id: "francais.orthographe.encodage",
    config_name: "Encodage",
    category_id: "francais.orthographe",
    tool_id: "encodage",
    description: "Encoder des mots à partir de graphèmes manipulables.",
    display_order: 0
  },
  {
    id: "francais.ecriture.geste-graphique",
    config_name: "Geste graphique",
    category_id: "francais.ecriture",
    tool_id: "geste-graphique",
    description: "Travailler le geste graphique des chiffres en repassant le tracé sur tablette.",
    display_order: 0,
    settings: {
      digits: ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"],
      modelVisibility: "pale"
    }
  },
  {
    id: "francais.vocabulaire.ordre-alphabetique-lettres",
    config_name: "Ordre alphabétique — Lettres",
    category_id: "francais.vocabulaire",
    tool_id: "ordre-alphabetique-lettres",
    description: "Ranger des lettres dans l’ordre alphabétique.",
    display_order: 0,
    settings: {
      itemCount: 4,
      caseMode: "lower",
      writingMode: "script",
      showAlphabet: false
    }
  },
  {
    id: "francais.vocabulaire.ordre-alphabetique-mots",
    config_name: "Ordre alphabétique — Mots",
    category_id: "francais.vocabulaire",
    tool_id: "ordre-alphabetique-mots",
    description: "Ranger des mots dans l’ordre alphabétique.",
    display_order: 1,
    settings: {
      itemCount: 4,
      prefixConstraint: "exact_1",
      visualHint: false,
      showAlphabet: false
    }
  },

  {
    id: "mathematiques.nombres.frise-picbille",
    config_name: "Frise Picbille",
    category_id: "mathematiques.nombres",
    tool_id: "frise-picbille",
    description: "Lire ou placer un nombre sur une frise Picbille.",
    display_order: 0,
    settings: {
      questionTypes: ["numberToGraduation", "graduationToNumber"],
      picbilleBoxCount: 5,
      picbilleStartValue: 1,
      numberMin: 1,
      numberMax: 50,
      numberValueMode: "simple",
      numberValueStart: 1,
      numberValueStep: 1,
      numberValueList: []
    }
  },
  {
    id: "mathematiques.nombres.droite-simple",
    config_name: "Repérage sur droite simple",
    category_id: "mathematiques.nombres",
    tool_id: "droite-numerique-simple",
    description: "Lire ou placer un nombre sur une droite graduée simple.",
    display_order: 1,
    settings: {
      questionTypes: ["numberToGraduation", "graduationToNumber"],
      markerPositions: ["start", "middle", "end"],
      markerMin: 0,
      markerMax: 140,
      markerValueMode: "simple",
      markerValueStart: 0,
      markerValueStep: 10,
      markerValueList: [],
      markerGap: 10
    }
  },
  {
    id: "mathematiques.nombres.droite-complete",
    config_name: "Repérage sur droite complète",
    category_id: "mathematiques.nombres",
    tool_id: "droite-numerique-complete",
    description: "Lire ou placer un nombre sur une droite graduée complète.",
    display_order: 2,
    settings: {
      questionTypes: ["numberToGraduation", "graduationToNumber"],
      markerPositions: ["start", "middle", "end"],
      markerMin: 0,
      markerMax: 124,
      markerValueMode: "simple",
      markerValueStart: 0,
      markerValueStep: 10,
      markerValueList: [],
      markerGap: 10
    }
  },
  {
    id: "mathematiques.nombres.representation-picbille",
    config_name: "Représentation décimale — Picbille",
    category_id: "mathematiques.nombres",
    tool_id: "representation-picbille",
    description: "Lire ou construire une représentation décimale avec Picbille.",
    display_order: 3,
    settings: {
      min: 1,
      max: 99,
      valueMode: "simple",
      valueStart: 1,
      valueStep: 1,
      valueList: [],
      allowNumberToRepresentation: true,
      allowRepresentationToNumber: true,
      displayMode: "ordered"
    }
  },
  {
    id: "mathematiques.nombres.representation-dede",
    config_name: "Représentation décimale — Dédé",
    category_id: "mathematiques.nombres",
    tool_id: "representation-dede",
    description: "Lire ou construire une représentation décimale avec Dédé.",
    display_order: 4,
    settings: {
      min: 1,
      max: 99,
      valueMode: "simple",
      valueStart: 1,
      valueStep: 1,
      valueList: [],
      allowNumberToRepresentation: true,
      allowRepresentationToNumber: true,
      displayMode: "ordered"
    }
  },
  {
    id: "mathematiques.nombres.representation-carres",
    config_name: "Représentation décimale — Carrés",
    category_id: "mathematiques.nombres",
    tool_id: "representation-carres",
    description: "Lire ou construire une représentation décimale avec les carrés de base 10.",
    display_order: 5,
    settings: {
      min: 1,
      max: 999,
      valueMode: "simple",
      valueStart: 1,
      valueStep: 1,
      valueList: [],
      allowNumberToRepresentation: true,
      allowRepresentationToNumber: true,
      displayMode: "ordered"
    }
  },
  {
    id: "mathematiques.nombres.representation-tuiles",
    config_name: "Représentation décimale — Tuiles",
    category_id: "mathematiques.nombres",
    tool_id: "representation-tuiles",
    description: "Lire ou construire une représentation décimale avec les tuiles de numération.",
    display_order: 6,
    settings: {
      min: 1,
      max: 999,
      valueMode: "simple",
      valueStart: 1,
      valueStep: 1,
      valueList: [],
      allowNumberToRepresentation: true,
      allowRepresentationToNumber: true,
      displayMode: "ordered"
    }
  },
  {
    id: "mathematiques.nombres.plus-moins-autant",
    config_name: "Plus, moins, autant",
    category_id: "mathematiques.nombres",
    tool_id: "plus-moins-autant",
    description: "Comparer deux collections par correspondance terme à terme avec objets manipulables.",
    display_order: 7,
    settings: {
      layout: "separated",
      collectionSize: { min: 3, max: 8 },
      gaps: ["0", "1", "2"],
      objectStyles: ["cubes"]
    }
  },
  {
    id: "mathematiques.nombres.comparaison",
    config_name: "Comparaison",
    category_id: "mathematiques.nombres",
    tool_id: "comparaison",
    description: "Comparer deux collections terme à terme pour trouver la différence.",
    display_order: 8,
    settings: {
      characterSet: "minibilleMaxibille",
      collectionRange: { min: 1, max: 10, mode: "simple", start: 1, step: 1, values: [] },
      tokenMode: "displayed",
      traceMode: "free"
    }
  },
  {
    id: "mathematiques.nombres.collection",
    config_name: "Collection",
    category_id: "mathematiques.nombres",
    tool_id: "collection",
    description: "Travailler le lien entre nombre et collection avec plusieurs modes de réponse simples.",
    display_order: 9,
    settings: {
      mode: "verify",
      distractorCount: 3,
      numberLineAmplitude: 7,
      numberRange: {
        min: 1,
        max: 10,
        mode: "simple",
        start: 1,
        step: 1,
        values: []
      }
    }
  },

  {
    id: "mathematiques.grandeurs-mesures.monnaie-representation",
    config_name: "Monnaie — Représentation",
    category_id: "mathematiques.grandeurs-mesures",
    tool_id: "monnaie-representation",
    description: "Lire ou composer une somme avec des pièces et billets.",
    display_order: 0,
    settings: {
      exerciseType: "both",
      moneyRange: { minCents: 100, maxCents: 2000 },
      displayFormats: ["decimal", "euros_cents"],
      assetStyle: "realistic",
      maxAttempts: 1,
      explicitDeltaFeedback: true,
      requireMinimumItems: false,
      enabledDenominations: {
        eur1: true, eur2: true, eur5: true, eur10: true, eur20: true, eur50: true, eur100: false,
        cent1: false, cent2: false, cent5: false, cent10: false, cent20: false, cent50: false,
        eur200: false, eur500: false
      }
    }
  },

  {
    id: "mathematiques.calculs.addition",
    config_name: "Addition",
    category_id: "mathematiques.calculs",
    tool_id: "addition",
    description: "Travailler les additions avec une réponse numérique simple.",
    display_order: 0,
    settings: {
      generationMode: "random",
      termCounts: [2],
      carryMode: "both",
      termRanges: {
        t1: { min: 0, max: 99, mode: "simple", start: 0, step: 1, values: [] },
        t2: { min: 0, max: 99, mode: "simple", start: 0, step: 1, values: [] }
      },
      resultConstraint: { enabled: false, range: { min: 0, max: 999, mode: "simple", start: 0, step: 1, values: [] } }
    }
  },
  {
    id: "mathematiques.calculs.soustraction",
    config_name: "Soustraction",
    category_id: "mathematiques.calculs",
    tool_id: "soustraction",
    description: "Travailler les soustractions avec une réponse numérique simple.",
    display_order: 1,
    settings: {
      generationMode: "random",
      carryMode: "both",
      termRanges: {
        t1: { min: 0, max: 99, mode: "simple", start: 0, step: 1, values: [] },
        t2: { min: 0, max: 99, mode: "simple", start: 0, step: 1, values: [] }
      },
      resultConstraint: { enabled: false, range: { min: 0, max: 999, mode: "simple", start: 0, step: 1, values: [] } }
    }
  },
  {
    id: "mathematiques.calculs.multiplication-posee",
    config_name: "Multiplication posée",
    category_id: "mathematiques.calculs",
    tool_id: "multiplication-posee",
    description: "Travailler les multiplications posées avec une réponse numérique simple.",
    display_order: 2,
    settings: {
      generationMode: "random",
      carryMode: "both",
      factorRanges: {
        f1: { min: 0, max: 99, mode: "simple", start: 0, step: 1, values: [] },
        f2: { min: 0, max: 9, mode: "simple", start: 0, step: 1, values: [] }
      },
      resultConstraint: { enabled: false, range: { min: 0, max: 999999, mode: "simple", start: 0, step: 1, values: [] } }
    }
  },
  {
    id: "mathematiques.calculs.addition-trous",
    config_name: "Addition à trous",
    category_id: "mathematiques.calculs",
    tool_id: "addition-trous",
    description: "Retrouver un terme manquant dans une addition à deux termes.",
    display_order: 3,
    settings: {
      generationMode: "random",
      carryMode: "both",
      holePosition: "second_term",
      termRanges: {
        t1: { min: 0, max: 99, mode: "simple", start: 0, step: 1, values: [] },
        t2: { min: 0, max: 99, mode: "simple", start: 0, step: 1, values: [] }
      },
      resultConstraint: { enabled: false, range: { min: 0, max: 999, mode: "simple", start: 0, step: 1, values: [] } }
    }
  },
  {
    id: "mathematiques.calculs.soustraction-trous",
    config_name: "Soustraction à trous",
    category_id: "mathematiques.calculs",
    tool_id: "soustraction-trous",
    description: "Retrouver un terme manquant dans une soustraction.",
    display_order: 4,
    settings: {
      generationMode: "random",
      carryMode: "both",
      holePosition: "second_term",
      termRanges: {
        t1: { min: 0, max: 99, mode: "simple", start: 0, step: 1, values: [] },
        t2: { min: 0, max: 99, mode: "simple", start: 0, step: 1, values: [] }
      },
      resultConstraint: { enabled: false, range: { min: 0, max: 999, mode: "simple", start: 0, step: 1, values: [] } }
    }
  },
  {
    id: "mathematiques.calculs.multiplication-trous",
    config_name: "Multiplication à trous",
    category_id: "mathematiques.calculs",
    tool_id: "multiplication-trous",
    description: "Retrouver un facteur manquant dans une multiplication.",
    display_order: 5,
    settings: {
      generationMode: "random",
      carryMode: "both",
      holePosition: "second_term",
      factorRanges: {
        f1: { min: 0, max: 99, mode: "simple", start: 0, step: 1, values: [] },
        f2: { min: 0, max: 9, mode: "simple", start: 0, step: 1, values: [] }
      },
      resultConstraint: { enabled: false, range: { min: 0, max: 999999, mode: "simple", start: 0, step: 1, values: [] } }
    }
  },
  {
    id: "mathematiques.calculs.tables-multiplication",
    config_name: "Tables de multiplication",
    category_id: "mathematiques.calculs",
    tool_id: "tables-multiplication",
    description: "Travailler les tables de multiplication avec une réponse numérique simple.",
    display_order: 6,
    settings: {
      tables: [2, 3, 4, 5],
      multipliers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      orderMode: "shuffled",
      factorPosition: "first_factor"
    }
  },
  {
    id: "mathematiques.calculs.boites-jetons",
    config_name: "Boites à jetons",
    category_id: "mathematiques.calculs",
    tool_id: "boites-jetons",
    description: "Composer une cible en cliquant sur des boites de jetons.",
    display_order: 7,
    settings: {
      boxCount: 5,
      boxValueMin: 1,
      boxValueMax: 9,
      targetMin: 10,
      targetMax: 20,
      minSolutionsToFind: 3
    }
  },
  {
    id: "mathematiques.calculs.calcul-cible",
    config_name: "Calcul ciblé",
    category_id: "mathematiques.calculs",
    tool_id: "calcul-cible",
    description: "Utiliser tous les nombres proposés pour atteindre une cible.",
    display_order: 8,
    settings: {
      numberCount: 4,
      targetMin: 10,
      targetMax: 100,
      allowedOperations: ["+", "-", "×"],
      specialNumbers: {
        "1": true, "2": true, "3": true, "4": true, "5": true,
        "6": true, "7": true, "8": true, "9": true, "10": true,
        "15": true, "20": true, "25": true, "50": true,
        "75": true, "100": true, "250": false, otherTens: false
      }
    }
  },

  {
    id: "mathematiques.calculs.somme-difference",
    config_name: "Somme ou différence ?",
    category_id: "mathematiques.calculs",
    tool_id: "somme-difference",
    description: "Choisir entre addition et soustraction à partir de deux collections, puis écrire l'opération complète.",
    display_order: 10,
    settings: {
      collectionRange: { min: 1, max: 10, mode: "simple", start: 1, step: 1, values: [] },
      responseMode: "segmented",
      traceMode: "enabled"
    }
  },
  {
    id: "mathematiques.calculs.compte-est-bon",
    config_name: "Compte est bon",
    category_id: "mathematiques.calculs",
    tool_id: "compte-est-bon",
    description: "Atteindre une cible avec six nombres proposés.",
    display_order: 9,
    settings: {
      targetMin: 100,
      targetMax: 500,
      allowedOperations: ["+", "-", "×"],
      specialNumbers: {
        "1": true, "2": true, "3": true, "4": true, "5": true,
        "6": true, "7": true, "8": true, "9": true, "10": true,
        "15": true, "20": true, "25": true, "50": true,
        "75": true, "100": true, "250": false, otherTens: false
      }
    }
  },
]);

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
  questionCount: 3,
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

export function getCatalogFolders() {
  return CATALOG_CATEGORIES.map((folder) => ({ ...folder }));
}

export function getCatalogActivities() {
  return CATALOG_ACTIVITIES.map((activity) => normalizeCatalogActivity(activity));
}

export function getCatalogActivityById(activityId, catalogActivities = null) {
  const safeId = normalizeCatalogActivityId(activityId);
  const source = Array.isArray(catalogActivities) ? catalogActivities : getCatalogActivities();
  return source.map(normalizeCatalogActivity).find((activity) => activity.id === safeId) || null;
}

export function findCatalogActivity(value, catalogActivities = null) {
  const needle = String(value || "").trim();
  if (!needle) return null;
  const source = Array.isArray(catalogActivities) ? catalogActivities : getCatalogActivities();
  const normalizedNeedle = normalizeCatalogActivityId(needle);
  const labelNeedle = normalizeCatalogLabel(needle);
  return source.map(normalizeCatalogActivity).find((activity) => (
    activity.id === normalizedNeedle || normalizeCatalogLabel(activity.config_name) === labelNeedle
  )) || null;
}

export function normalizeCatalogActivity(activity = {}) {
  const id = normalizeCatalogActivityId(activity?.id ?? activity?.catalog_activity_id);
  const title = String(activity?.config_name ?? activity?.title ?? activity?.label ?? id).trim() || id;
  const categoryId = String(activity?.category_id ?? activity?.folder_id ?? "").trim() || null;
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
    category_id: categoryId,
    description: String(activity?.description ?? "").trim(),
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
  const safeValue = String(value || "").trim().toLowerCase();
  if (safeValue === "test") return "test";
  const safeFallback = String(fallback || "").trim().toLowerCase();
  return safeFallback === "test" ? "test" : "exploration";
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
  const levelSettings = levelConfig.settings;
  const settings = pickCatalogConfigValue(options, runtimeOverrides, "settings", levelSettings ?? activity.settings ?? null);
  const questionCount = clampQuestionCount(pickCatalogConfigValue(
    options,
    runtimeOverrides,
    "questionCount",
    activity.default_question_count ?? defaults.questionCount
  ));
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
  const questionFlowMode = normalizeQuestionFlowModeValue(pickCatalogConfigValue(
    options,
    runtimeOverrides,
    "questionFlowMode",
    defaults.questionFlowMode
  ), defaults.questionFlowMode);
  const successGoalCorrectCount = clampPositiveInt(pickCatalogConfigValue(
    options,
    runtimeOverrides,
    "successGoalCorrectCount",
    defaults.successGoalCorrectCount
  ), defaults.successGoalCorrectCount);
  const successGoalSafetyMilestones = clampNonNegativeInt(pickCatalogConfigValue(
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
  const missionTime = mission?.mission_time_seconds == null ? null : Math.max(0, Math.trunc(Number(mission.mission_time_seconds) || 0));

  const sequence = (Array.isArray(steps) ? steps : [])
    .map((step, index) => {
      const activity = getCatalogActivityById(step?.catalog_activity_id, catalogActivities);
      if (!activity) return null;
      const difficultyLevel = clampDifficultyLevel(step?.difficulty_level ?? 3);
      const levelSettings = getCatalogLevelSettings(activity, difficultyLevel);
      return {
        instanceId: `${activity.tool_id}_${String(step?.id || index).replace(/[^a-zA-Z0-9_-]+/g, "-")}`,
        toolId: activity.tool_id,
        draft: {
          enabled: true,
          questionCount: Math.max(1, Math.trunc(Number(mission?.question_count) || 5)),
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
      activityTotalTimeEnabled: missionTime != null && missionTime > 0,
      activityTotalTimeSec: missionTime != null && missionTime > 0 ? missionTime : 900
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
