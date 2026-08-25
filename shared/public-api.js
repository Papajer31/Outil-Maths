import { supabase } from "./supabase-client.js";
import {
  cleanDisplayName,
  normalizeAccessCode,
  normalizeConfigName,
  normalizeModuleKey,
  normalizeFolderRecord
} from "./api-common.js";
import {
  normalizeActivityAttemptStatus,
  normalizeActivityHistoryContext,
  normalizeActivityQuestionOutcome,
  normalizeHistoryJson
} from "./activity-history.js";
import {
  applyCatalogVisibility,
  buildCatalogActivityConfig,
  findCatalogActivity,
  filterEffectivelyActivePedagogicalNodes,
  getCatalogActivities,
  getPedagogicalNodes,
  normalizeCatalogDifficultyLevel,
  normalizeCatalogRuntimeContext,
  normalizeCatalogActivity,
  normalizePedagogicalNode,
  sortCatalogActivities,
  sortPedagogicalNodes
} from "./catalogue.js";

export {
  cleanDisplayName,
  normalizeAccessCode,
  normalizeConfigName,
  normalizeModuleKey
} from "./api-common.js";

export async function accessCodeExists(accessCode) {
  const code = normalizeAccessCode(accessCode);
  if (!code) return false;

  const { data, error } = await supabase.rpc("access_code_exists", {
    p_access_code: code
  });

  if (error) throw error;
  return Boolean(data);
}

export async function listPublicActivitiesForSpace(accessCode) {
  const code = normalizeAccessCode(accessCode);
  const [catalogActivities, folders] = await Promise.all([
    listPublishedCatalogActivities(),
    listPublicPedagogicalNodesForSpace(accessCode)
  ]);
  const activeFolderIds = new Set(folders.map((folder) => String(folder.id)));
  const availableActivities = catalogActivities.filter((activity) => activeFolderIds.has(String(activity.pedagogical_node_id || activity.folder_id || "")));
  if (!code) return availableActivities;

  let visibilityRows = [];
  try {
    const { data, error } = await supabase.rpc("get_catalog_visibility_for_space", {
      p_access_code: code
    });
    if (error) throw error;
    visibilityRows = Array.isArray(data) ? data : [];
  } catch {
    visibilityRows = [];
  }

  return sortCatalogActivities(applyCatalogVisibility(availableActivities, visibilityRows))
    .filter((activity) => activity?.is_visible !== false);
}

export async function listPublicCatalogActivities() {
  const [activities, folders] = await Promise.all([
    listPublishedCatalogActivities(),
    listPublicPedagogicalNodesForSpace("")
  ]);
  const activeFolderIds = new Set(folders.map((folder) => String(folder.id)));
  return activities.filter((activity) => activeFolderIds.has(String(activity.pedagogical_node_id || activity.folder_id || "")));
}

async function listPublishedCatalogActivities() {
  try {
    const { data, error } = await supabase
      .from("catalog_activities")
      .select("id, pedagogical_node_id, tool_id, title, description, adventure_tier, display_order, status, default_visible, levels_json, created_at, updated_at")
      .eq("status", "published")
      .order("pedagogical_node_id", { ascending: true })
      .order("adventure_tier", { ascending: true })
      .order("display_order", { ascending: true })
      .order("title", { ascending: true });

    if (error) throw error;
    return sortCatalogActivities((Array.isArray(data) ? data : []).map(normalizeCatalogActivity));
  } catch {
    return getCatalogActivities();
  }
}

function normalizeImageAssetSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeImageAssetStoragePath(value) {
  return String(value || "").trim();
}

function normalizeImageAssetWordSlug(value) {
  return String(value || "").trim().normalize("NFC").toLocaleLowerCase("fr-FR");
}

export async function listPublicImageAssets({ activeOnly = true } = {}) {
  let query = supabase
    .from("image_assets")
    .select("slug, word_slug, storage_path, is_active")
    .order("slug", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      slug: normalizeImageAssetSlug(row?.slug),
      word_slug: normalizeImageAssetWordSlug(row?.word_slug),
      storage_path: normalizeImageAssetStoragePath(row?.storage_path),
      is_active: row?.is_active !== false
    }))
    .filter((row) => row.slug && row.storage_path)
    .filter((row) => !activeOnly || row.is_active);
}

export async function listPublicImageAssetsInSystemFolder(folderName) {
  const safeFolderName = cleanDisplayName(folderName);
  if (!safeFolderName) return [];

  const { data, error } = await supabase.rpc("list_public_system_image_assets_in_folder", {
    p_folder_name: safeFolderName
  });
  if (error) throw error;

  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      slug: normalizeImageAssetSlug(row?.slug),
      word_slug: normalizeImageAssetWordSlug(row?.word_slug),
      storage_path: normalizeImageAssetStoragePath(row?.storage_path)
    }))
    .filter((row) => row.slug && row.storage_path);
}

export function getPublicImageAssetUrl(storagePath, { bucket = "images" } = {}) {
  const safePath = normalizeImageAssetStoragePath(storagePath);
  const safeBucket = String(bucket || "").trim() || "images";
  if (!safePath) return "";

  const { data } = supabase
    .storage
    .from(safeBucket)
    .getPublicUrl(safePath);

  return String(data?.publicUrl || "").trim();
}

function normalizePhonologyWordSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizePhonologyWordLabel(value) {
  return cleanDisplayName(value);
}

function normalizePhonologyWordUnits(value) {
  if (!Array.isArray(value)) return [];

  return value
    .map((unit) => ({
      graph: String(unit?.graph || "").trim(),
      text: String(unit?.text || "").trim(),
      isSilent: unit?.isSilent === true
    }))
    .filter((unit) => unit.graph);
}

function normalizePhonologyWordSyllables(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((syllable) => String(syllable || "").trim())
    .filter(Boolean);
}

export async function listPublicPhonologyWords({ activeOnly = true } = {}) {
  // Supabase/PostgREST limite par défaut une réponse à 1000 lignes.
  // phonology_words dépasse désormais cette taille : sans pagination, les
  // outils ne voyaient que les premiers mots par ordre alphabétique.
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    let query = supabase
      .from("phonology_words")
      .select("slug, word, prefix, units, syllables, familiarity, is_active")
      .order("slug", { ascending: true })
      .range(from, from + pageSize - 1);

    if (activeOnly) {
      query = query.eq("is_active", true);
    }

    const { data, error } = await query;
    if (error) throw error;

    const page = Array.isArray(data) ? data : [];
    rows.push(...page);
    if (page.length < pageSize) break;
  }

  return rows
    .map((row) => ({
      slug: normalizePhonologyWordSlug(row?.slug),
      word: normalizePhonologyWordLabel(row?.word),
      prefix: normalizePhonologyWordLabel(row?.prefix),
      units: normalizePhonologyWordUnits(row?.units),
      syllables: normalizePhonologyWordSyllables(row?.syllables),
      familiarity: Number.isFinite(Number(row?.familiarity))
        ? Math.max(0, Math.min(100, Math.round(Number(row.familiarity))))
        : 50,
      is_active: row?.is_active !== false
    }))
    .filter((row) => row.slug && row.word && row.units.length > 0)
    .filter((row) => !activeOnly || row.is_active);
}

export async function listPublicPedagogicalNodesForSpace(accessCode) {
  const selectWithStudentProjection = "id, parent_id, name, node_type, student_label, student_navigation_mode, display_order, is_active";
  const selectLegacy = "id, parent_id, name, node_type, display_order, is_active";

  const loadRows = async (selectColumns) => {
    const pageSize = 1000;
    const rows = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from("pedagogical_nodes")
        .select(selectColumns)
        .order("parent_id", { ascending: true, nullsFirst: true })
        .order("display_order", { ascending: true })
        .order("name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;

      const page = Array.isArray(data) ? data : [];
      rows.push(...page);
      if (page.length < pageSize) break;
    }

    return rows;
  };

  try {
    let rows;
    try {
      rows = await loadRows(selectWithStudentProjection);
    } catch (projectionError) {
      if (!isMissingStudentProjectionColumnError(projectionError)) throw projectionError;
      console.warn("Projection élève non migrée en base : chargement de l’arborescence sans métadonnées de présentation.");
      rows = await loadRows(selectLegacy);
    }

    return filterEffectivelyActivePedagogicalNodes(
      sortPedagogicalNodes(rows.map((folder, index) => normalizePedagogicalNode(normalizeFolderRecord(folder, index), index)))
    );
  } catch (err) {
    console.warn("Arborescence publique en base indisponible, utilisation du secours local.", err);
    return filterEffectivelyActivePedagogicalNodes(getPedagogicalNodes())
      .map((folder, index) => normalizeFolderRecord(folder, index));
  }
}

function isMissingStudentProjectionColumnError(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || error?.details || "").toLowerCase();
  return code === "42703"
    || code === "PGRST204"
    || message.includes("student_label")
    || message.includes("student_navigation_mode");
}

export async function listPublicClassesForSpace(accessCode) {
  const code = normalizeAccessCode(accessCode);
  if (!code) return [];

  const { data, error } = await supabase.rpc("get_space_classes", {
    p_access_code: code
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listPublicStudentsForSpace(accessCode) {
  const code = normalizeAccessCode(accessCode);
  if (!code) return [];

  const { data, error } = await supabase.rpc("get_space_students", {
    p_access_code: code
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listPublicVocabularyWordsForSpace(accessCode) {
  const code = normalizeAccessCode(accessCode);
  if (!code) return [];

  const { data, error } = await supabase.rpc("get_space_vocabulary_words", {
    p_access_code: code
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listPublicDefaultVocabularyWords() {
  const { data, error } = await supabase
    .from("vocabulary_default_words")
    .select("word, dictionary_page")
    .order("word_normalized", { ascending: true })
    .order("word", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function loadPublicActivityConfig(accessCode, configName, options = {}) {
  const code = normalizeAccessCode(accessCode);
  const requested = String(configName || "").trim();
  const catalogContext = normalizeCatalogRuntimeContext(options.context ?? options.catalogContext);
  const difficultyLevel = normalizeCatalogDifficultyLevel(options.difficultyLevel ?? options.catalogDifficultyLevel ?? options.catalogLevel ?? 3);

  const catalogActivities = await listPublishedCatalogActivities();
  const catalogActivity = findCatalogActivity(requested, catalogActivities);
  if (catalogActivity) {
    const configJson = buildCatalogActivityConfig(catalogActivity, {
      activityMode: "individual",
      progressMode: "practice",
      context: catalogContext,
      difficultyLevel,
      catalogActivities
    });

    return {
      access_code: code,
      config_name: catalogActivity.config_name,
      config_name_normalized: catalogActivity.id,
      catalog_activity_id: catalogActivity.id,
      module_key: "tools",
      config_json: configJson,
      activity_mode: configJson.activity_mode
    };
  }

  // Pas de rétrocompatibilité active : une activité élève doit venir du Catalogue
  // ou d’une Mission qui référence le Catalogue. L’ancien modèle
  // activity_configs/get_activity_config reste en quarantaine côté code enseignant.
  return null;
}

export async function verifyPublicStudentCode(accessCode, studentId, studentCode) {
  const code = normalizeAccessCode(accessCode);
  const cleanStudentCode = String(studentCode || "").trim().toUpperCase();
  const id = Number(studentId);
  if (!code || !Number.isFinite(id) || id <= 0 || !cleanStudentCode) return false;

  const { data, error } = await supabase.rpc("verify_student_code", {
    p_access_code: code,
    p_student_id: id,
    p_student_code: cleanStudentCode
  });

  if (error) throw error;
  return data === true;
}

export async function getPublicStudentCodeKeypad(accessCode, studentId) {
  const code = normalizeAccessCode(accessCode);
  const id = Number(studentId);
  if (!code || !Number.isFinite(id) || id <= 0) return [];

  const { data, error } = await supabase.rpc("get_student_code_keypad", {
    p_access_code: code,
    p_student_id: id
  });

  if (error) throw error;
  const keys = Array.isArray(data?.[0]?.keypad_characters) ? data[0].keypad_characters : [];
  return keys
    .map((value) => String(value || "").trim().toUpperCase())
    .filter((value) => /^[A-Z0-9]$/.test(value));
}


export async function openPublicStudentAdventureDay(accessCode, studentId, studentCode) {
  const code = normalizeAccessCode(accessCode);
  const id = Number(studentId);
  const cleanStudentCode = String(studentCode || "").trim().toUpperCase();
  if (!code || !Number.isFinite(id) || id <= 0 || !cleanStudentCode) {
    return null;
  }

  const { data, error } = await supabase.rpc("open_student_adventure_day", {
    p_access_code: code,
    p_student_id: id,
    p_student_code: cleanStudentCode
  });

  if (error) throw error;
  return data && typeof data === "object" ? data : null;
}

export async function getPublicStudentAdventureProgress(accessCode, studentId, studentCode) {
  const code = normalizeAccessCode(accessCode);
  const id = Number(studentId);
  const cleanStudentCode = String(studentCode || "").trim().toUpperCase();
  if (!code || !Number.isFinite(id) || id <= 0 || !cleanStudentCode) {
    return [];
  }

  const { data, error } = await supabase.rpc("get_student_adventure_progress", {
    p_access_code: code,
    p_student_id: id,
    p_student_code: cleanStudentCode
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function getPublicStudentActivityProgress(accessCode, studentId, studentCode, catalogActivityId) {
  const code = normalizeAccessCode(accessCode);
  const id = Number(studentId);
  const cleanStudentCode = String(studentCode || "").trim().toUpperCase();
  const activityId = String(catalogActivityId || "").trim();

  if (!code || !Number.isFinite(id) || id <= 0 || !cleanStudentCode || !activityId) {
    return null;
  }

  const { data, error } = await supabase.rpc("get_student_activity_progress", {
    p_access_code: code,
    p_student_id: id,
    p_student_code: cleanStudentCode,
    p_catalog_activity_id: activityId
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

export async function recordPublicStudentActivitySession({
  accessCode,
  studentId,
  studentCode,
  catalogActivityId,
  context = "exploration",
  startedLevel = 3,
  endedLevel = 3,
  questionsCount = 0,
  correctCount = 0,
  wrongCount = 0,
  durationMs = 0
} = {}) {
  const code = normalizeAccessCode(accessCode);
  const id = Number(studentId);
  const cleanStudentCode = String(studentCode || "").trim().toUpperCase();
  const activityId = String(catalogActivityId || "").trim();

  if (!code || !Number.isFinite(id) || id <= 0 || !cleanStudentCode || !activityId) {
    return null;
  }

  const { data, error } = await supabase.rpc("record_student_activity_session", {
    p_access_code: code,
    p_student_id: id,
    p_student_code: cleanStudentCode,
    p_catalog_activity_id: activityId,
    p_context: String(context || "exploration").trim() || "exploration",
    p_started_level: Math.max(1, Math.min(5, Math.trunc(Number(startedLevel) || 3))),
    p_ended_level: Math.max(1, Math.min(5, Math.trunc(Number(endedLevel) || 3))),
    p_questions_count: Math.max(0, Math.trunc(Number(questionsCount) || 0)),
    p_correct_count: Math.max(0, Math.trunc(Number(correctCount) || 0)),
    p_wrong_count: Math.max(0, Math.trunc(Number(wrongCount) || 0)),
    p_duration_ms: Math.max(0, Math.trunc(Number(durationMs) || 0))
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

export async function startPublicStudentActivityAttempt({
  accessCode,
  studentId,
  studentCode,
  catalogActivityId,
  context = "exploration",
  missionId = null,
  missionStepId = null,
  clientAttemptId = null,
  toolId = "",
  toolInstanceId = "",
  activityTitle = "",
  startedLevel = 3,
  metadata = {},
  configSnapshot = {}
} = {}) {
  const code = normalizeAccessCode(accessCode);
  const id = Number(studentId);
  const cleanStudentCode = String(studentCode || "").trim().toUpperCase();
  const activityId = String(catalogActivityId || "").trim();
  const clientId = String(clientAttemptId || "").trim() || null;

  if (!code || !Number.isFinite(id) || id <= 0 || !cleanStudentCode || !activityId) {
    return null;
  }

  const { data, error } = await supabase.rpc("start_student_activity_attempt", {
    p_access_code: code,
    p_student_id: id,
    p_student_code: cleanStudentCode,
    p_catalog_activity_id: activityId,
    p_context: normalizeActivityHistoryContext(context),
    p_mission_id: String(missionId || "").trim() || null,
    p_mission_step_id: String(missionStepId || "").trim() || null,
    p_client_attempt_id: clientId,
    p_tool_id: String(toolId || "").trim(),
    p_tool_instance_id: String(toolInstanceId || "").trim(),
    p_activity_title: String(activityTitle || "").trim(),
    p_started_level: Math.max(1, Math.min(5, Math.trunc(Number(startedLevel) || 3))),
    p_metadata_json: normalizeHistoryJson(metadata),
    p_config_snapshot: normalizeHistoryJson(configSnapshot)
  });

  if (error) throw error;
  return String(data || "").trim() || null;
}

export async function recordPublicStudentActivityAttemptQuestion({
  accessCode,
  studentId,
  studentCode,
  attemptId,
  questionIndex = 0,
  toolId = "",
  toolInstanceId = "",
  levelPresented = 3,
  levelAfter = 3,
  outcome = "unanswered",
  pointsAwarded = 0,
  durationMs = 0,
  questionSnapshot = {},
  answerSnapshot = {},
  correctionSnapshot = {}
} = {}) {
  const code = normalizeAccessCode(accessCode);
  const id = Number(studentId);
  const cleanStudentCode = String(studentCode || "").trim().toUpperCase();
  const cleanAttemptId = String(attemptId || "").trim();

  if (!code || !Number.isFinite(id) || id <= 0 || !cleanStudentCode || !cleanAttemptId) {
    return null;
  }

  const { data, error } = await supabase.rpc("record_student_activity_attempt_question", {
    p_access_code: code,
    p_student_id: id,
    p_student_code: cleanStudentCode,
    p_attempt_id: cleanAttemptId,
    p_question_index: Math.max(0, Math.trunc(Number(questionIndex) || 0)),
    p_tool_id: String(toolId || "").trim(),
    p_tool_instance_id: String(toolInstanceId || "").trim(),
    p_level_presented: Math.max(1, Math.min(5, Math.trunc(Number(levelPresented) || 3))),
    p_level_after: Math.max(1, Math.min(5, Math.trunc(Number(levelAfter) || 3))),
    p_outcome: normalizeActivityQuestionOutcome(outcome),
    p_points_awarded: Math.max(0, Math.trunc(Number(pointsAwarded) || 0)),
    p_duration_ms: Math.max(0, Math.trunc(Number(durationMs) || 0)),
    p_question_snapshot: normalizeHistoryJson(questionSnapshot),
    p_answer_snapshot: normalizeHistoryJson(answerSnapshot),
    p_correction_snapshot: normalizeHistoryJson(correctionSnapshot)
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

export async function finishPublicStudentActivityAttempt({
  accessCode,
  studentId,
  studentCode,
  attemptId,
  status = "interrupted",
  endedLevel = 3,
  durationMs = 0
} = {}) {
  const code = normalizeAccessCode(accessCode);
  const id = Number(studentId);
  const cleanStudentCode = String(studentCode || "").trim().toUpperCase();
  const cleanAttemptId = String(attemptId || "").trim();

  if (!code || !Number.isFinite(id) || id <= 0 || !cleanStudentCode || !cleanAttemptId) {
    return null;
  }

  const { data, error } = await supabase.rpc("finish_student_activity_attempt", {
    p_access_code: code,
    p_student_id: id,
    p_student_code: cleanStudentCode,
    p_attempt_id: cleanAttemptId,
    p_status: normalizeActivityAttemptStatus(status),
    p_ended_level: Math.max(1, Math.min(5, Math.trunc(Number(endedLevel) || 3))),
    p_duration_ms: Math.max(0, Math.trunc(Number(durationMs) || 0))
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}


export async function listPublicMissionsForSpace(accessCode, studentIds = [], isGroup = false) {
  const code = normalizeAccessCode(accessCode);
  if (!code) return [];
  const ids = (Array.isArray(studentIds) ? studentIds : [])
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0);
  if (!ids.length) return [];

  const { data, error } = await supabase.rpc("get_space_missions", {
    p_access_code: code,
    p_student_ids: ids,
    p_is_group: isGroup === true
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function loadPublicMissionSteps(accessCode, missionId) {
  const code = normalizeAccessCode(accessCode);
  const id = String(missionId || "").trim();
  if (!code || !id) return [];

  const { data, error } = await supabase.rpc("get_space_mission_steps", {
    p_access_code: code,
    p_mission_id: id
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

async function hydratePublicConjugationPersonalLists(accessCode, configJson = {}) {
  const safeConfig = configJson && typeof configJson === "object" && !Array.isArray(configJson)
    ? { ...configJson }
    : configJson;
  if (!safeConfig || typeof safeConfig !== "object" || !Array.isArray(safeConfig.sequence)) return safeConfig;

  const code = normalizeAccessCode(accessCode);
  if (!code) return safeConfig;

  const cache = new Map();
  const nextSequence = await Promise.all(safeConfig.sequence.map(async (item) => {
    const toolId = String(item?.toolId || item?.tool_id || "").trim();
    const settings = item?.draft?.settings && typeof item.draft.settings === "object" && !Array.isArray(item.draft.settings)
      ? item.draft.settings
      : null;
    const listId = String(settings?.personalListId || settings?.personal_list_id || "").trim();

    if (toolId !== "conjugaison" || !settings || String(settings.sourceMode || settings.source_mode || "") !== "personal" || !listId) {
      return item;
    }

    const list = await getPublicConjugationPersonalList(code, listId, cache);
    if (!list) return item;

    const infinitives = Array.isArray(list.infinitives) ? list.infinitives : [];
    return {
      ...item,
      draft: {
        ...(item.draft || {}),
        settings: {
          ...settings,
          personalListId: list.id,
          personalListName: list.name,
          personalListVerbsText: infinitives.join("\n")
        }
      }
    };
  }));

  return {
    ...safeConfig,
    sequence: nextSequence
  };
}

async function getPublicConjugationPersonalList(accessCode, listId, cache) {
  const safeId = String(listId || "").trim();
  if (!safeId) return null;
  if (cache.has(safeId)) return cache.get(safeId);

  const { data, error } = await supabase.rpc("get_conjugation_personal_list", {
    p_access_code: accessCode,
    p_list_id: safeId
  });

  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  const verbsJson = row?.verbs_json && typeof row.verbs_json === "object" ? row.verbs_json : {};
  const infinitives = Array.isArray(verbsJson.infinitives) ? verbsJson.infinitives : [];
  const list = row
    ? {
      id: String(row.id || safeId),
      name: cleanDisplayName(row.name || "Liste personnelle"),
      infinitives: infinitives.map((item) => String(item || "").trim()).filter(Boolean)
    }
    : null;
  cache.set(safeId, list);
  return list;
}
