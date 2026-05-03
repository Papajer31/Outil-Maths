import { supabase } from "./supabase-client.js";
import {
  cleanDisplayName,
  normalizeAccessCode,
  normalizeConfigName,
  normalizeModuleKey,
  normalizeActivityConfigMeta,
  normalizeFolderRecord,
  sortActivitiesByDashboardMeta,
  sortFoldersByMeta,
  sanitizeActivityConfigJson,
  withActivityDashboardMeta
} from "./api-common.js";
import { isStudentFacingActivityMode } from "./activity-modes.js";

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
  if (!code) return [];

  const { data, error } = await supabase.rpc("get_space_activities", {
    p_access_code: code
  });

  if (error) throw error;

  const baseActivities = Array.isArray(data) ? data : [];
  const hydratedActivities = await Promise.all(baseActivities.map(async (activity, index) => {
    if (activity?.config_json && typeof activity.config_json === "object") {
      return withActivityDashboardMeta({
        ...activity,
        config_json: sanitizeActivityConfigJson(activity.config_json)
      }, index);
    }

    try {
      const remote = await loadPublicActivityConfig(code, activity?.config_name || "");
      return withActivityDashboardMeta({
        ...activity,
        config_json: remote?.config_json ?? null
      }, index);
    } catch {
      return withActivityDashboardMeta(activity, index);
    }
  }));

  const visibleActivities = hydratedActivities.filter((activity) => (
    activity?.is_visible !== false && isStudentFacingActivityMode(activity?.activity_mode)
  ));

  return sortActivitiesByDashboardMeta(visibleActivities);
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
  const code = normalizeAccessCode(accessCode);
  if (!code) return [];

  const { data, error } = await supabase.rpc("get_space_activity_folders", {
    p_access_code: code
  });

  if (error) throw error;

  const folders = Array.isArray(data) ? data : [];
  return sortFoldersByMeta(folders.map((folder, index) => normalizeFolderRecord(folder, index)));
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

export async function loadPublicActivityConfig(accessCode, configName) {
  const code = normalizeAccessCode(accessCode);
  const normalizedConfigName = normalizeConfigName(configName);

  if (!code || !normalizedConfigName) return null;

  const { data, error } = await supabase.rpc("get_activity_config", {
    p_access_code: code,
    p_config_name: normalizedConfigName
  });

  if (error) throw error;
  if (!data) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const configJson = row.config_json && typeof row.config_json === "object"
    ? sanitizeActivityConfigJson(row.config_json)
    : row.config_json ?? null;

  return {
    access_code: code,
    config_name: cleanDisplayName(configName),
    config_name_normalized: normalizedConfigName,
    module_key: normalizeModuleKey(row.module_key || "tools") || "tools",
    config_json: configJson,
    activity_mode: normalizeActivityConfigMeta(configJson).activity_mode
  };
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
