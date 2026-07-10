import { supabase } from "./supabase-client.js";
import {
  cleanDisplayName,
  normalizeAccessCode,
  normalizeConfigName,
  normalizeModuleKey,
  normalizeFolderRecord
} from "./api-common.js";
import {
  applyCatalogVisibility,
  buildCatalogActivityConfig,
  findCatalogActivity,
  getCatalogActivities,
  getCatalogFolders,
  normalizeCatalogDifficultyLevel,
  normalizeCatalogRuntimeContext,
  normalizeCatalogActivity,
  sortCatalogActivities
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
  const catalogActivities = await listPublishedCatalogActivities();
  if (!code) return catalogActivities;

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

  return sortCatalogActivities(applyCatalogVisibility(catalogActivities, visibilityRows))
    .filter((activity) => activity?.is_visible !== false);
}

export async function listPublicCatalogActivities() {
  return await listPublishedCatalogActivities();
}

async function listPublishedCatalogActivities() {
  try {
    const { data, error } = await supabase
      .from("catalog_activities")
      .select("id, category_id, tool_id, title, description, display_order, status, default_visible, levels_json, created_at, updated_at")
      .eq("status", "published")
      .order("category_id", { ascending: true })
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

export async function listPublicImageAssets({ activeOnly = true } = {}) {
  let query = supabase
    .from("image_assets")
    .select("slug, storage_path, is_active")
    .order("slug", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      slug: normalizeImageAssetSlug(row?.slug),
      storage_path: normalizeImageAssetStoragePath(row?.storage_path),
      is_active: row?.is_active !== false
    }))
    .filter((row) => row.slug && row.storage_path)
    .filter((row) => !activeOnly || row.is_active);
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
      isSilent: unit?.isSilent === true
    }))
    .filter((unit) => unit.graph);
}

export async function listPublicPhonologyWords({ activeOnly = true } = {}) {
  let query = supabase
    .from("phonology_words")
    .select("slug, word, units, is_active")
    .order("slug", { ascending: true });

  if (activeOnly) {
    query = query.eq("is_active", true);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      slug: normalizePhonologyWordSlug(row?.slug),
      word: normalizePhonologyWordLabel(row?.word),
      units: normalizePhonologyWordUnits(row?.units),
      is_active: row?.is_active !== false
    }))
    .filter((row) => row.slug && row.word && row.units.length > 0)
    .filter((row) => !activeOnly || row.is_active);
}

export async function listPublicActivityFoldersForSpace(accessCode) {
  return getCatalogFolders().map((folder, index) => normalizeFolderRecord(folder, index));
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

function normalizePublicQuestionBankType(value) {
  const safeValue = String(value || "text_answer").trim().toLowerCase();
  return safeValue || "text_answer";
}

function normalizePublicQuestionBankItem(item, index = 0) {
  const itemType = normalizePublicQuestionBankType(item?.item_type ?? item?.type);
  const payload = item?.payload_json && typeof item.payload_json === "object" && !Array.isArray(item.payload_json)
    ? item.payload_json
    : {};

  let normalizedPayload = { ...payload };

  if (itemType === "text_answer") {
    const acceptedAnswersSource = payload.acceptedAnswers
      ?? payload.accepted_answers
      ?? item?.acceptedAnswers
      ?? item?.accepted_answers
      ?? [];

    normalizedPayload = {
      ...payload,
      mainAnswer: String(payload.mainAnswer ?? payload.main_answer ?? item?.mainAnswer ?? item?.main_answer ?? ""),
      acceptedAnswers: Array.isArray(acceptedAnswersSource)
        ? acceptedAnswersSource.map((value) => String(value || "").trim()).filter(Boolean)
        : String(acceptedAnswersSource || "")
          .split(/[;\n]/g)
          .map((value) => value.trim())
          .filter(Boolean),
      explanation: String(payload.explanation ?? item?.explanation ?? "")
    };
  } else if (itemType === "qcm") {
    const distractorsSource = payload.distractors
      ?? payload.distractorAnswers
      ?? payload.distractor_answers
      ?? item?.distractors
      ?? item?.distractorAnswers
      ?? item?.distractor_answers
      ?? [
        payload.distractor1,
        payload.distractor2,
        payload.distractor3,
        payload.distractor4,
        payload.distractor5,
        item?.distractor1,
        item?.distractor2,
        item?.distractor3,
        item?.distractor4,
        item?.distractor5
      ];
    const distractors = (Array.isArray(distractorsSource) ? distractorsSource : String(distractorsSource || "").split(/[;\n]/g))
      .map((value) => String(value || "").trim())
      .filter(Boolean)
      .slice(0, 5);

    normalizedPayload = {
      ...payload,
      correctAnswer: String(payload.correctAnswer ?? payload.correct_answer ?? payload.mainAnswer ?? payload.main_answer ?? item?.correctAnswer ?? item?.correct_answer ?? ""),
      distractors,
      explanation: String(payload.explanation ?? item?.explanation ?? "")
    };

    for (let choiceIndex = 0; choiceIndex < 5; choiceIndex += 1) {
      normalizedPayload[`distractor${choiceIndex + 1}`] = String(distractors[choiceIndex] || "");
    }
  } else if (itemType === "selection") {
    const indexesSource = payload.expectedTokenIndexes
      ?? payload.expected_token_indexes
      ?? payload.selectedTokenIndexes
      ?? payload.selected_token_indexes
      ?? [];
    const expectedTokenIndexes = (Array.isArray(indexesSource) ? indexesSource : String(indexesSource || "").split(/[;,.\s]+/g))
      .map((value) => Math.trunc(Number(value)))
      .filter((value) => Number.isFinite(value) && value >= 0)
      .filter((value, index, list) => list.indexOf(value) === index)
      .sort((a, b) => a - b);

    const {
      instruction: _instruction,
      consigne: _consigne,
      promptInstruction: _promptInstruction,
      prompt_instruction: _prompt_instruction,
      itemInstruction: _itemInstruction,
      item_instruction: _item_instruction,
      ...selectionPayload
    } = payload;

    normalizedPayload = {
      ...selectionPayload,
      expectedTokenIndexes,
      expectedSelectionText: String(payload.expectedSelectionText ?? payload.expected_selection_text ?? item?.expectedSelectionText ?? ""),
      explanation: String(payload.explanation ?? item?.explanation ?? "")
    };
  }

  return {
    id: item?.id ?? null,
    bank_id: item?.bank_id ?? null,
    item_type: itemType,
    prompt: String(item?.prompt ?? payload.prompt ?? ""),
    payload_json: normalizedPayload,
    position: Math.max(0, Math.trunc(Number(item?.position ?? index) || 0)),
    is_active: item?.is_active !== false
  };
}
export async function listPublicQuestionBankItemsForSpace(accessCode, bankId) {
  const code = normalizeAccessCode(accessCode);
  const safeBankId = String(bankId || "").trim();
  if (!code || !safeBankId) return [];

  const { data, error } = await supabase.rpc("get_question_bank_items_for_space", {
    p_access_code: code,
    p_bank_id: safeBankId
  });

  if (error) throw error;

  return (Array.isArray(data) ? data : [])
    .map(normalizePublicQuestionBankItem)
    .filter((item) => item.is_active !== false);
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
