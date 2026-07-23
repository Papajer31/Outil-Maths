import { supabase } from "../../shared/supabase-client.js";
import {
  cleanDisplayName,
  normalizeAccessCode,
  normalizeConfigName,
  normalizeFolderRecord,
  sortFoldersByMeta
} from "../../shared/api-common.js";
import {
  applyCatalogVisibility,
  getCatalogActivities,
  getCatalogFolders,
  normalizeCatalogActivity,
  sortCatalogActivities
} from "../../shared/catalogue.js";

export { normalizeAccessCode, normalizeConfigName };

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

export async function signInUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (error) throw error;
  return data.user ?? null;
}

export async function signUpUser(email, password, metadata = {}) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata && typeof metadata === "object" ? metadata : {}
    }
  });
  if (error) throw error;
  return data;
}

export async function accessCodeExists(accessCode) {
  const code = normalizeAccessCode(accessCode);
  if (!code) return false;

  const { data, error } = await supabase.rpc("access_code_exists", {
    p_access_code: code
  });

  if (error) throw error;
  return data === true;
}

export async function signOutUser() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getCurrentSession() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ?? null;
}

export async function getMyTeacherSpace() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Aucun utilisateur connecté.");
  }

  const { data, error } = await supabase
    .from("teacher_spaces")
    .select("id, owner_user_id, access_code, created_at, updated_at, last_opened_at")
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function createMyTeacherSpace(accessCode) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Aucun utilisateur connecté.");
  }

  const code = normalizeAccessCode(accessCode);
  if (!code) {
    throw new Error("Code de connexion vide.");
  }

  const payload = {
    owner_user_id: user.id,
    access_code: code,
    updated_at: new Date().toISOString(),
    last_opened_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("teacher_spaces")
    .insert(payload)
    .select("id, owner_user_id, access_code, created_at, updated_at, last_opened_at")
    .single();

  if (error) throw error;
  return data;
}

export async function createOrGetMyTeacherSpace(accessCode) {
  const existing = await getMyTeacherSpace();
  if (existing) return existing;

  return await createMyTeacherSpace(accessCode);
}

export async function updateMyTeacherSpace(teacherSpaceId, updates = {}) {
  const payload = {
    updated_at: new Date().toISOString()
  };

  if ("access_code" in updates) {
    const code = normalizeAccessCode(updates.access_code);
    if (!code) {
      throw new Error("Code de connexion invalide.");
    }
    payload.access_code = code;
  }

  const { data, error } = await supabase
    .from("teacher_spaces")
    .update(payload)
    .eq("id", teacherSpaceId)
    .select("id, owner_user_id, access_code, created_at, updated_at, last_opened_at")
    .single();

  if (error) throw error;
  return data;
}

export async function markTeacherSpaceAsOpened(teacherSpaceId) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("teacher_spaces")
    .update({
      last_opened_at: now
    })
    .eq("id", teacherSpaceId)
    .select("id, owner_user_id, access_code, created_at, updated_at, last_opened_at")
    .single();

  if (error) throw error;
  return data;
}

export async function getMyTeacherClasses(teacherSpaceId) {
  const { data, error } = await supabase
    .from("teacher_classes")
    .select("id, teacher_space_id, name, display_order, created_at, updated_at")
    .eq("teacher_space_id", teacherSpaceId)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function createTeacherClass(teacherSpaceId, name) {
  const cleanedName = cleanDisplayName(name);
  if (!cleanedName) {
    throw new Error("Nom de classe vide.");
  }

  const existing = await getMyTeacherClasses(teacherSpaceId);
  const nextOrder = existing.length;

  const { data, error } = await supabase
    .from("teacher_classes")
    .insert({
      teacher_space_id: teacherSpaceId,
      name: cleanedName,
      display_order: nextOrder,
      updated_at: new Date().toISOString()
    })
    .select("id, teacher_space_id, name, display_order, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function updateTeacherClass(teacherClassId, updates = {}) {
  const payload = {
    updated_at: new Date().toISOString()
  };

  if ("name" in updates) {
    const cleanedName = cleanDisplayName(updates.name);
    if (!cleanedName) {
      throw new Error("Nom de classe vide.");
    }
    payload.name = cleanedName;
  }

  if ("display_order" in updates) {
    payload.display_order = Number(updates.display_order) || 0;
  }

  const { data, error } = await supabase
    .from("teacher_classes")
    .update(payload)
    .eq("id", teacherClassId)
    .select("id, teacher_space_id, name, display_order, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTeacherClass(teacherClassId) {
  const { error } = await supabase
    .from("teacher_classes")
    .delete()
    .eq("id", teacherClassId);

  if (error) throw error;
}

export async function listTeacherVocabularyWords(teacherSpaceId) {
  const { data, error } = await supabase
    .from("teacher_vocabulary_words")
    .select("id, teacher_space_id, word, word_normalized, dictionary_page, created_at, updated_at")
    .eq("teacher_space_id", teacherSpaceId)
    .order("word_normalized", { ascending: true })
    .order("word", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function replaceTeacherVocabularyWords(teacherSpaceId, items = []) {
  const { error } = await supabase.rpc("replace_teacher_vocabulary_words", {
    p_teacher_space_id: teacherSpaceId,
    p_items: items
  });

  if (error) throw error;
  return await listTeacherVocabularyWords(teacherSpaceId);
}

export async function resetTeacherVocabularyWords(teacherSpaceId) {
  const { error } = await supabase.rpc("reset_teacher_vocabulary_words", {
    p_teacher_space_id: teacherSpaceId
  });

  if (error) throw error;
  return await listTeacherVocabularyWords(teacherSpaceId);
}

export async function listTeacherPhonologyPresets(teacherSpaceId, { toolKey = "encodage" } = {}) {
  const spaceId = Number(teacherSpaceId);
  if (!Number.isFinite(spaceId) || spaceId <= 0) return [];

  const { data, error } = await supabase
    .from("teacher_phonology_presets")
    .select("id, teacher_space_id, tool_key, name, graph_order, created_at, updated_at")
    .eq("teacher_space_id", spaceId)
    .eq("tool_key", String(toolKey || "encodage").trim().toLowerCase())
    .order("name", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function upsertTeacherPhonologyPreset(teacherSpaceId, preset = {}, { toolKey = "encodage" } = {}) {
  const spaceId = Number(teacherSpaceId);
  if (!Number.isFinite(spaceId) || spaceId <= 0) {
    throw new Error("Espace enseignant invalide.");
  }

  const id = String(preset?.id || "").trim();
  const name = String(preset?.name || "").trim();
  const graphOrder = Array.isArray(preset?.graphOrder) ? preset.graphOrder : [];

  if (!id) {
    throw new Error("Identifiant de preset manquant.");
  }

  if (!name) {
    throw new Error("Nom de preset manquant.");
  }

  const now = new Date().toISOString();

  const { error } = await supabase
    .from("teacher_phonology_presets")
    .upsert({
      id,
      teacher_space_id: spaceId,
      tool_key: String(toolKey || "encodage").trim().toLowerCase(),
      name,
      graph_order: graphOrder,
      updated_at: now,
      created_at: now
    }, {
      onConflict: "id"
    });

  if (error) throw error;
  return await listTeacherPhonologyPresets(spaceId, { toolKey });
}

export async function deleteTeacherPhonologyPreset(teacherSpaceId, presetId, { toolKey = "encodage" } = {}) {
  const spaceId = Number(teacherSpaceId);
  if (!Number.isFinite(spaceId) || spaceId <= 0) {
    throw new Error("Espace enseignant invalide.");
  }

  const id = String(presetId || "").trim();
  if (!id) return await listTeacherPhonologyPresets(spaceId, { toolKey });

  const { error } = await supabase
    .from("teacher_phonology_presets")
    .delete()
    .eq("id", id)
    .eq("teacher_space_id", spaceId)
    .eq("tool_key", String(toolKey || "encodage").trim().toLowerCase());

  if (error) throw error;
  return await listTeacherPhonologyPresets(spaceId, { toolKey });
}

export async function listStudentsForClass(teacherClassId) {
  const { data, error } = await supabase
    .from("students")
    .select("id, teacher_class_id, first_name, grade_level, student_code, display_order, updated_at")
    .eq("teacher_class_id", teacherClassId)
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listStudentStorageContainersForSpace(teacherSpaceId) {
  return await getMyTeacherClasses(teacherSpaceId);
}

export async function ensureDefaultStudentStorageContainerForSpace(teacherSpaceId) {
  const containers = await listStudentStorageContainersForSpace(teacherSpaceId);
  if (containers.length) {
    return containers[0];
  }

  return await createTeacherClass(teacherSpaceId, "Ma classe");
}

export async function listStudentsForTeacherSpace(teacherSpaceId) {
  const storageContainers = await listStudentStorageContainersForSpace(teacherSpaceId);
  if (!storageContainers.length) return [];

  const storageContainerIds = storageContainers.map((item) => item.id);

  const { data, error } = await supabase
    .from("students")
    .select("id, teacher_class_id, first_name, grade_level, student_code, display_order, updated_at")
    .in("teacher_class_id", storageContainerIds)
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listStudentsForSpace(teacherSpaceId) {
  return await listStudentsForTeacherSpace(teacherSpaceId);
}

export async function createStudent(teacherClassId, student = {}) {
  const firstName = String(student.first_name || "").trim();
  const gradeLevel = String(student.grade_level || "").trim() || null;

  if (!firstName) {
    throw new Error("Prénom vide.");
  }

  const existing = await listStudentsForClass(teacherClassId);
  const maxExistingOrder = existing.reduce((maxOrder, item) => {
    const value = Number(item?.display_order);
    return Number.isFinite(value) ? Math.max(maxOrder, value) : maxOrder;
  }, -1);
  const nextOrder = maxExistingOrder + 1;

  const { data, error } = await supabase
    .from("students")
    .insert({
      teacher_class_id: teacherClassId,
      first_name: firstName,
      grade_level: gradeLevel,
      student_code: normalizeStudentCode(student.student_code),
      display_order: nextOrder,
      updated_at: new Date().toISOString()
    })
    .select("id, teacher_class_id, first_name, grade_level, student_code, display_order, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function createStudentForTeacherSpace(teacherSpaceId, student = {}) {
  const storageContainer = await ensureDefaultStudentStorageContainerForSpace(teacherSpaceId);
  return await createStudent(storageContainer.id, student);
}

export async function updateStudent(studentId, updates = {}) {
  const payload = {
    updated_at: new Date().toISOString()
  };

  if ("first_name" in updates) {
    const firstName = String(updates.first_name || "").trim();
    if (!firstName) {
      throw new Error("Prénom vide.");
    }
    payload.first_name = firstName;
  }

  if ("grade_level" in updates) {
    payload.grade_level = String(updates.grade_level || "").trim() || null;
  }

  if ("student_code" in updates) {
    payload.student_code = normalizeStudentCode(updates.student_code);
  }

  if ("display_order" in updates) {
    const displayOrder = Number(updates.display_order);
    if (!Number.isFinite(displayOrder)) {
      throw new Error("Ordre d’élève invalide.");
    }
    payload.display_order = Math.max(0, Math.trunc(displayOrder));
  }

  const { data, error } = await supabase
    .from("students")
    .update(payload)
    .eq("id", studentId)
    .select("id, teacher_class_id, first_name, grade_level, student_code, display_order, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteStudent(studentId) {
  const { error } = await supabase
    .from("students")
    .delete()
    .eq("id", studentId);

  if (error) throw error;
}

export async function saveStudentOrderForTeacherSpace(teacherSpaceId, orderedStudentIds = []) {
  if (!Array.isArray(orderedStudentIds)) {
    throw new Error("Ordre d’élèves invalide.");
  }

  const students = await listStudentsForTeacherSpace(teacherSpaceId);
  const currentIds = students.map((student) => String(student.id));
  const currentIdSet = new Set(currentIds);

  const seen = new Set();
  const normalizedOrderedIds = orderedStudentIds
    .map((id) => String(id))
    .filter((id) => currentIdSet.has(id))
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

  const missingIds = currentIds.filter((id) => !seen.has(id));
  const finalIds = [...normalizedOrderedIds, ...missingIds];

  await Promise.all(finalIds.map((studentId, index) => updateStudent(studentId, { display_order: index })));

  return finalIds;
}

export async function replaceStudentsForClass(teacherClassId, students) {
  if (!Array.isArray(students)) {
    throw new Error("Liste élèves invalide.");
  }

  const { error: delError } = await supabase
    .from("students")
    .delete()
    .eq("teacher_class_id", teacherClassId);

  if (delError) throw delError;

  if (!students.length) return [];

  const seen = new Set();

  const normalizedStudents = students
    .map((s) => ({
      first_name: String(s.first_name || "").trim(),
      grade_level: String(s.grade_level || "").trim() || null
    }))
    .filter((s) => s.first_name)
    .filter((s) => {
      const key = s.first_name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const payload = normalizedStudents.map((s, index) => ({
    teacher_class_id: teacherClassId,
    first_name: s.first_name,
    grade_level: s.grade_level,
    display_order: index,
    updated_at: new Date().toISOString()
  }));

  const { data, error } = await supabase
    .from("students")
    .insert(payload)
    .select();

  if (error) throw error;

  return data;
}

/* =========================
   QUESTION BANKS
   ========================= */

const QUESTION_BANK_TYPE_TEXT_ANSWER = "text_answer";
const QUESTION_BANK_TYPE_QCM = "qcm";
const QUESTION_BANK_TYPE_SELECTION = "selection";

const QUESTION_BANK_FOLDER_FIELDS = `
  id,
  teacher_space_id,
  parent_id,
  name,
  display_order,
  created_at,
  updated_at
`;

const QUESTION_BANK_FIELDS = `
  id,
  teacher_space_id,
  source_bank_id,
  folder_id,
  display_order,
  bank_type,
  title,
  title_normalized,
  instruction,
  description,
  subject,
  grade_level,
  tags,
  is_system,
  share_code,
  created_at,
  updated_at
`;

const QUESTION_BANK_ITEM_FIELDS = `
  id,
  bank_id,
  item_type,
  prompt,
  payload_json,
  position,
  is_active,
  created_at,
  updated_at
`;

export function normalizeQuestionBankTitle(title) {
  return normalizeConfigName(title);
}

function normalizeQuestionBankType(type) {
  const value = String(type || "text_answer").trim().toLowerCase();
  return value || "text_answer";
}

function normalizeQuestionBankTags(tags) {
  if (Array.isArray(tags)) {
    return tags
      .map((tag) => String(tag || "").trim())
      .filter(Boolean)
      .filter((tag, index, list) => list.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === index)
      .slice(0, 24);
  }

  return String(tags || "")
    .split(/[;,]/g)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .filter((tag, index, list) => list.findIndex((item) => item.toLowerCase() === tag.toLowerCase()) === index)
    .slice(0, 24);
}

function normalizeQuestionBankRecord(record, fallbackOrder = 0) {
  if (!record) return null;
  const displayOrderValue = Number(record.display_order);
  return {
    ...record,
    folder_id: String(record.folder_id ?? "").trim() || null,
    display_order: Number.isFinite(displayOrderValue)
      ? Math.max(0, Math.trunc(displayOrderValue))
      : Math.max(0, Math.trunc(Number(fallbackOrder) || 0)),
    bank_type: normalizeQuestionBankType(record.bank_type),
    title: cleanDisplayName(record.title) || "Banque sans titre",
    instruction: String(record.instruction || "").trim(),
    description: String(record.description || ""),
    subject: String(record.subject || ""),
    grade_level: String(record.grade_level || ""),
    tags: normalizeQuestionBankTags(record.tags),
    is_system: record.is_system === true
  };
}

function sortQuestionBanksByMeta(banks = []) {
  return [...banks].sort((a, b) => {
    if (a?.is_system !== b?.is_system) {
      return a?.is_system ? 1 : -1;
    }

    const orderA = Number(a?.display_order);
    const orderB = Number(b?.display_order);
    if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
      return orderA - orderB;
    }

    const titleCompare = String(a?.title || "").localeCompare(String(b?.title || ""), "fr", { sensitivity: "base" });
    if (titleCompare !== 0) return titleCompare;

    return String(a?.id || "").localeCompare(String(b?.id || ""), "fr", { sensitivity: "base" });
  });
}

function normalizeQuestionBankItem(item, index = 0) {
  const itemType = normalizeQuestionBankType(item?.item_type ?? item?.type);
  const payload = item?.payload_json && typeof item.payload_json === "object" && !Array.isArray(item.payload_json)
    ? item.payload_json
    : (item?.payload && typeof item.payload === "object" && !Array.isArray(item.payload) ? item.payload : {});

  let normalizedPayload = { ...payload };

  if (itemType === QUESTION_BANK_TYPE_TEXT_ANSWER) {
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
  } else if (itemType === QUESTION_BANK_TYPE_QCM) {
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

    for (let index = 0; index < 5; index += 1) {
      normalizedPayload[`distractor${index + 1}`] = String(distractors[index] || "");
    }
  } else if (itemType === QUESTION_BANK_TYPE_SELECTION) {
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
    is_active: item?.is_active !== false,
    created_at: item?.created_at ?? null,
    updated_at: item?.updated_at ?? null
  };
}
function hasMeaningfulQuestionBankItem(item) {
  const prompt = String(item?.prompt || "").trim();
  const payload = item?.payload_json && typeof item.payload_json === "object" && !Array.isArray(item.payload_json)
    ? item.payload_json
    : {};

  if (item?.item_type === QUESTION_BANK_TYPE_TEXT_ANSWER) {
    return Boolean(prompt || String(payload.mainAnswer || "").trim());
  }

  if (item?.item_type === QUESTION_BANK_TYPE_QCM) {
    return Boolean(
      prompt
      || String(payload.correctAnswer || "").trim()
      || (Array.isArray(payload.distractors) && payload.distractors.some((value) => String(value || "").trim()))
    );
  }

  if (item?.item_type === QUESTION_BANK_TYPE_SELECTION) {
    return Boolean(
      prompt
      || (Array.isArray(payload.expectedTokenIndexes) && payload.expectedTokenIndexes.length)
      || String(payload.explanation || "").trim()
    );
  }

  return Boolean(prompt || Object.keys(payload).length);
}
function buildQuestionBankItemPayload(item) {
  const payload = item?.payload_json && typeof item.payload_json === "object" && !Array.isArray(item.payload_json)
    ? item.payload_json
    : {};

  if (item?.item_type === QUESTION_BANK_TYPE_TEXT_ANSWER) {
    return {
      ...payload,
      mainAnswer: String(payload.mainAnswer || "").trim(),
      acceptedAnswers: Array.isArray(payload.acceptedAnswers)
        ? payload.acceptedAnswers.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
      explanation: String(payload.explanation || "").trim()
    };
  }

  if (item?.item_type === QUESTION_BANK_TYPE_QCM) {
    const distractors = Array.isArray(payload.distractors)
      ? payload.distractors
      : [payload.distractor1, payload.distractor2, payload.distractor3, payload.distractor4, payload.distractor5];

    return {
      ...payload,
      correctAnswer: String(payload.correctAnswer || "").trim(),
      distractors: distractors
        .map((value) => String(value || "").trim())
        .filter(Boolean)
        .slice(0, 5),
      explanation: String(payload.explanation || "").trim()
    };
  }

  if (item?.item_type === QUESTION_BANK_TYPE_SELECTION) {
    const indexes = Array.isArray(payload.expectedTokenIndexes)
      ? payload.expectedTokenIndexes
      : String(payload.expectedTokenIndexes || "").split(/[;,.\s]+/g);
    const {
      instruction: _instruction,
      consigne: _consigne,
      promptInstruction: _promptInstruction,
      prompt_instruction: _prompt_instruction,
      itemInstruction: _itemInstruction,
      item_instruction: _item_instruction,
      ...selectionPayload
    } = payload;

    return {
      ...selectionPayload,
      expectedTokenIndexes: indexes
        .map((value) => Math.trunc(Number(value)))
        .filter((value) => Number.isFinite(value) && value >= 0)
        .filter((value, index, list) => list.indexOf(value) === index)
        .sort((a, b) => a - b),
      expectedSelectionText: String(payload.expectedSelectionText || "").trim(),
      explanation: String(payload.explanation || "").trim()
    };
  }

  return { ...payload };
}
function isMissingQuestionBankReplaceRpcError(error) {
  const message = String(error?.message || error?.details || "").toLowerCase();
  return error?.code === "42883"
    || error?.code === "PGRST202"
    || message.includes("could not find the function");
}

export async function listQuestionBankFoldersForSpace(teacherSpaceId) {
  const spaceId = Number(teacherSpaceId);
  if (!Number.isFinite(spaceId) || spaceId <= 0) return [];

  const { data, error } = await supabase
    .from("question_bank_folders")
    .select(QUESTION_BANK_FOLDER_FIELDS)
    .eq("teacher_space_id", spaceId)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  const normalizedFolders = (Array.isArray(data) ? data : []).map((folder, index) => normalizeFolderRecord(folder, index));
  return sortFoldersByMeta(normalizedFolders);
}

export async function createQuestionBankFolderForSpace(teacherSpaceId, { name, parent_id = null } = {}) {
  const spaceId = Number(teacherSpaceId);
  if (!Number.isFinite(spaceId) || spaceId <= 0) {
    throw new Error("Espace enseignant invalide.");
  }

  const displayName = cleanDisplayName(name);
  if (!displayName) {
    throw new Error("Nom de dossier vide.");
  }

  const folders = await listQuestionBankFoldersForSpace(spaceId);
  const safeParentId = folders.some((folder) => String(folder.id) === String(parent_id ?? ""))
    ? String(parent_id)
    : null;
  const banks = await listQuestionBanksForSpace(spaceId, { includeSystem: false });
  const siblingFolders = folders.filter((folder) => String(folder.parent_id ?? "") === String(safeParentId ?? ""));
  const siblingBanks = banks.filter((bank) => String(bank.folder_id ?? "") === String(safeParentId ?? ""));
  const nextOrder = [...siblingFolders, ...siblingBanks]
    .reduce((maxOrder, item) => Math.max(maxOrder, Number(item.display_order) || 0), -1) + 1;

  const { data, error } = await supabase
    .from("question_bank_folders")
    .insert({
      teacher_space_id: spaceId,
      parent_id: safeParentId,
      name: displayName,
      display_order: nextOrder,
      updated_at: new Date().toISOString()
    })
    .select(QUESTION_BANK_FOLDER_FIELDS)
    .single();

  if (error) throw error;
  return normalizeFolderRecord(data, nextOrder);
}

export async function updateQuestionBankFolder(folderId, updates = {}) {
  const id = String(folderId || "").trim();
  if (!id) throw new Error("Dossier introuvable.");

  const payload = {
    updated_at: new Date().toISOString()
  };

  if ("name" in updates) {
    const displayName = cleanDisplayName(updates.name);
    if (!displayName) throw new Error("Nom de dossier vide.");
    payload.name = displayName;
  }

  if ("parent_id" in updates) {
    payload.parent_id = String(updates.parent_id ?? "").trim() || null;
  }

  if ("display_order" in updates) {
    const displayOrder = Number(updates.display_order);
    if (!Number.isFinite(displayOrder)) throw new Error("Ordre de dossier invalide.");
    payload.display_order = Math.max(0, Math.trunc(displayOrder));
  }

  const { data, error } = await supabase
    .from("question_bank_folders")
    .update(payload)
    .eq("id", id)
    .select(QUESTION_BANK_FOLDER_FIELDS)
    .single();

  if (error) throw error;
  return normalizeFolderRecord(data);
}

export async function deleteQuestionBankFolder(folderId) {
  const id = String(folderId || "").trim();
  if (!id) throw new Error("Dossier introuvable.");

  const { error } = await supabase
    .from("question_bank_folders")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function listQuestionBanksForSpace(teacherSpaceId, { includeSystem = true } = {}) {
  const spaceId = Number(teacherSpaceId);
  if (!Number.isFinite(spaceId) || spaceId <= 0) return [];

  let query = supabase
    .from("question_banks")
    .select(QUESTION_BANK_FIELDS)
    .order("is_system", { ascending: true })
    .order("display_order", { ascending: true })
    .order("title", { ascending: true });

  if (includeSystem) {
    query = query.or(`teacher_space_id.eq.${spaceId},is_system.eq.true`);
  } else {
    query = query.eq("teacher_space_id", spaceId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return sortQuestionBanksByMeta((Array.isArray(data) ? data : []).map(normalizeQuestionBankRecord).filter(Boolean));
}

export async function createQuestionBankForSpace(teacherSpaceId, bank = {}) {
  const spaceId = Number(teacherSpaceId);
  if (!Number.isFinite(spaceId) || spaceId <= 0) {
    throw new Error("Espace enseignant invalide.");
  }

  const title = cleanDisplayName(bank.title) || "Nouvelle banque";
  const titleNormalized = normalizeQuestionBankTitle(title);
  if (!titleNormalized) {
    throw new Error("Titre de banque invalide.");
  }

  const folders = await listQuestionBankFoldersForSpace(spaceId);
  const safeFolderId = folders.some((folder) => String(folder.id) === String(bank.folder_id ?? ""))
    ? String(bank.folder_id)
    : null;
  const siblingFolders = folders.filter((folder) => String(folder.parent_id ?? "") === String(safeFolderId ?? ""));
  const siblingBanks = await listQuestionBanksForSpace(spaceId, { includeSystem: false });
  const displayOrderValue = Number(bank.display_order);
  const nextOrder = Number.isFinite(displayOrderValue)
    ? Math.max(0, Math.trunc(displayOrderValue))
    : [...siblingFolders, ...siblingBanks.filter((item) => String(item.folder_id ?? "") === String(safeFolderId ?? ""))]
      .reduce((maxOrder, item) => Math.max(maxOrder, Number(item.display_order) || 0), -1) + 1;

  const now = new Date().toISOString();
  const payload = {
    teacher_space_id: spaceId,
    source_bank_id: String(bank.source_bank_id || "").trim() || null,
    folder_id: safeFolderId,
    display_order: nextOrder,
    bank_type: normalizeQuestionBankType(bank.bank_type),
    title,
    title_normalized: titleNormalized,
    instruction: String(bank.instruction || "").trim(),
    description: String(bank.description || "").trim(),
    subject: String(bank.subject || "").trim(),
    grade_level: String(bank.grade_level || "").trim(),
    tags: normalizeQuestionBankTags(bank.tags),
    is_system: false,
    updated_at: now,
    created_at: now
  };

  const { data, error } = await supabase
    .from("question_banks")
    .insert(payload)
    .select(QUESTION_BANK_FIELDS)
    .single();

  if (error) throw error;
  return normalizeQuestionBankRecord(data, nextOrder);
}

export async function updateQuestionBank(bankId, updates = {}) {
  const id = String(bankId || "").trim();
  if (!id) throw new Error("Banque introuvable.");

  const payload = {
    updated_at: new Date().toISOString()
  };

  if ("title" in updates) {
    const title = cleanDisplayName(updates.title);
    if (!title) throw new Error("Titre de banque vide.");
    payload.title = title;
    payload.title_normalized = normalizeQuestionBankTitle(title);
  }

  if ("instruction" in updates) {
    const instruction = String(updates.instruction || "").trim();
    if (!instruction) throw new Error("Consigne de banque vide.");
    payload.instruction = instruction;
  }
  if ("description" in updates) payload.description = String(updates.description || "").trim();
  if ("subject" in updates) payload.subject = String(updates.subject || "").trim();
  if ("grade_level" in updates) payload.grade_level = String(updates.grade_level || "").trim();
  if ("tags" in updates) payload.tags = normalizeQuestionBankTags(updates.tags);
  if ("bank_type" in updates) payload.bank_type = normalizeQuestionBankType(updates.bank_type);
  if ("source_bank_id" in updates) payload.source_bank_id = String(updates.source_bank_id || "").trim() || null;
  if ("folder_id" in updates) payload.folder_id = String(updates.folder_id ?? "").trim() || null;
  if ("display_order" in updates) {
    const displayOrder = Number(updates.display_order);
    if (!Number.isFinite(displayOrder)) throw new Error("Ordre de banque invalide.");
    payload.display_order = Math.max(0, Math.trunc(displayOrder));
  }
  if ("share_code" in updates) payload.share_code = String(updates.share_code || "").trim().toUpperCase() || null;

  const { data, error } = await supabase
    .from("question_banks")
    .update(payload)
    .eq("id", id)
    .select(QUESTION_BANK_FIELDS)
    .single();

  if (error) throw error;
  return normalizeQuestionBankRecord(data);
}

export async function deleteQuestionBank(bankId) {
  const id = String(bankId || "").trim();
  if (!id) throw new Error("Banque introuvable.");

  const { error } = await supabase
    .from("question_banks")
    .delete()
    .eq("id", id);

  if (error) throw error;
}

export async function listQuestionBankItems(bankId) {
  const id = String(bankId || "").trim();
  if (!id) return [];

  const { data, error } = await supabase
    .from("question_bank_items")
    .select(QUESTION_BANK_ITEM_FIELDS)
    .eq("bank_id", id)
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizeQuestionBankItem);
}

export async function replaceQuestionBankItems(bankId, items = []) {
  const id = String(bankId || "").trim();
  if (!id) throw new Error("Banque introuvable.");
  if (!Array.isArray(items)) throw new Error("Liste de questions invalide.");

  const normalizedItems = items
    .map(normalizeQuestionBankItem)
    .filter(hasMeaningfulQuestionBankItem)
    .map((item, index) => ({
      bank_id: id,
      item_type: normalizeQuestionBankType(item.item_type),
      prompt: String(item.prompt || "").trim(),
      payload_json: buildQuestionBankItemPayload(item),
      position: index,
      is_active: item.is_active !== false,
      updated_at: new Date().toISOString()
    }));

  const { error: rpcError } = await supabase.rpc("replace_question_bank_items", {
    p_bank_id: id,
    p_items: normalizedItems
  });

  if (!rpcError) {
    return await listQuestionBankItems(id);
  }

  if (!isMissingQuestionBankReplaceRpcError(rpcError)) {
    throw rpcError;
  }

  const { error: deleteError } = await supabase
    .from("question_bank_items")
    .delete()
    .eq("bank_id", id);

  if (deleteError) throw deleteError;

  if (normalizedItems.length) {
    const { error: insertError } = await supabase
      .from("question_bank_items")
      .insert(normalizedItems);

    if (insertError) throw insertError;
  }

  return await listQuestionBankItems(id);
}

export async function copyQuestionBankToSpace(sourceBankId, teacherSpaceId, { title = "", folder_id = null, display_order = null } = {}) {
  const sourceId = String(sourceBankId || "").trim();
  const spaceId = Number(teacherSpaceId);
  if (!sourceId) throw new Error("Banque source introuvable.");
  if (!Number.isFinite(spaceId) || spaceId <= 0) throw new Error("Espace enseignant invalide.");

  const { data: sourceBank, error: sourceError } = await supabase
    .from("question_banks")
    .select(QUESTION_BANK_FIELDS)
    .eq("id", sourceId)
    .single();

  if (sourceError) throw sourceError;

  const createdBank = await createQuestionBankForSpace(spaceId, {
    title: cleanDisplayName(title) || sourceBank?.title || "Banque copiée",
    bank_type: sourceBank?.bank_type || "text_answer",
    instruction: sourceBank?.instruction || "",
    description: sourceBank?.description || "",
    subject: sourceBank?.subject || "",
    grade_level: sourceBank?.grade_level || "",
    tags: sourceBank?.tags || [],
    folder_id,
    display_order
  });

  const updatedBank = createdBank?.source_bank_id
    ? createdBank
    : await updateQuestionBank(createdBank.id, { source_bank_id: sourceId }).catch(() => createdBank);

  const sourceItems = await listQuestionBankItems(sourceId);
  const copiedItems = sourceItems.map((item) => ({
    item_type: item.item_type,
    prompt: item.prompt,
    payload_json: item.payload_json,
    is_active: item.is_active
  }));
  await replaceQuestionBankItems(createdBank.id, copiedItems);
  return {
    bank: updatedBank,
    items: await listQuestionBankItems(createdBank.id)
  };
}


function normalizeStudentCode(value) {
  const safe = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  return safe || null;
}

export function listCatalogFolders() {
  return getCatalogFolders();
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
  } catch (err) {
    // Mode secours : utile hors Supabase ou avant application de la migration super-admin.
    console.warn("Catalogue système en base indisponible, utilisation du catalogue de secours.", err);
    return getCatalogActivities();
  }
}

export async function listCatalogActivitiesForTeacherSpace(teacherSpaceId) {
  const catalogActivities = await listPublishedCatalogActivities();
  const { data, error } = await supabase
    .from("catalog_activity_visibility")
    .select("catalog_activity_id, is_visible, updated_at")
    .eq("teacher_space_id", teacherSpaceId);

  if (error) throw error;
  return sortCatalogActivities(applyCatalogVisibility(catalogActivities, Array.isArray(data) ? data : []));
}

export async function setCatalogActivityVisibility(teacherSpaceId, catalogActivityId, isVisible) {
  const payload = {
    teacher_space_id: teacherSpaceId,
    catalog_activity_id: String(catalogActivityId || "").trim(),
    is_visible: isVisible !== false,
    updated_at: new Date().toISOString()
  };

  if (!payload.teacher_space_id || !payload.catalog_activity_id) {
    throw new Error("Activité de catalogue introuvable.");
  }

  const { error } = await supabase
    .from("catalog_activity_visibility")
    .upsert(payload, { onConflict: "teacher_space_id,catalog_activity_id" });

  if (error) throw error;
  return await listCatalogActivitiesForTeacherSpace(teacherSpaceId);
}

export async function listMissionFoldersForSpace(teacherSpaceId) {
  const { data, error } = await supabase
    .from("mission_folders")
    .select("id, teacher_space_id, parent_id, name, display_order, created_at, updated_at")
    .eq("teacher_space_id", teacherSpaceId)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function createMissionFolderForSpace(teacherSpaceId, { name, parent_id = null } = {}) {
  const cleanName = cleanDisplayName(name);
  if (!cleanName) throw new Error("Nom de dossier vide.");
  const folders = await listMissionFoldersForSpace(teacherSpaceId);
  const safeParentId = String(parent_id || "").trim() || null;
  const nextOrder = folders.filter((folder) => String(folder.parent_id || "") === String(safeParentId || ""))
    .reduce((max, folder) => Math.max(max, Number(folder.display_order) || 0), -1) + 1;
  const { data, error } = await supabase.from("mission_folders").insert({
    teacher_space_id: teacherSpaceId,
    parent_id: safeParentId,
    name: cleanName,
    display_order: nextOrder
  }).select("id, teacher_space_id, parent_id, name, display_order, created_at, updated_at").single();
  if (error) throw error;
  return data;
}

export async function updateMissionFolder(folderId, updates = {}) {
  const payload = {};
  if ("name" in updates) payload.name = cleanDisplayName(updates.name);
  if ("parent_id" in updates) payload.parent_id = String(updates.parent_id || "").trim() || null;
  if ("display_order" in updates) payload.display_order = Math.max(0, Math.trunc(Number(updates.display_order) || 0));
  const { data, error } = await supabase.from("mission_folders").update(payload).eq("id", folderId)
    .select("id, teacher_space_id, parent_id, name, display_order, created_at, updated_at").single();
  if (error) throw error;
  return data;
}

export async function deleteMissionFolder(folderId) {
  const { error } = await supabase.from("mission_folders").delete().eq("id", folderId);
  if (error) throw error;
}

export async function listMissionsForSpace(teacherSpaceId) {
  const { data, error } = await supabase
    .from("missions")
    .select("id, teacher_space_id, folder_id, title, title_normalized, description, status, answer_mode, intent_mode, question_count, question_time_seconds, answer_display_seconds, transition_seconds, mission_time_seconds, instructions, display_order, created_at, updated_at")
    .eq("teacher_space_id", teacherSpaceId)
    .neq("status", "archived")
    .order("display_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listMissionSteps(missionId) {
  const { data, error } = await supabase
    .from("mission_steps")
    .select("id, mission_id, catalog_activity_id, position, difficulty_mode, difficulty_level, step_options_json, created_at, updated_at")
    .eq("mission_id", missionId)
    .order("position", { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listMissionAssignments(missionId) {
  const { data, error } = await supabase
    .from("mission_assignments")
    .select("id, mission_id, target_type, teacher_class_id, student_id, created_at")
    .eq("mission_id", missionId);
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function saveMissionForSpace(teacherSpaceId, mission = {}, steps = [], assignments = []) {
  const title = cleanDisplayName(mission.title);
  if (!title) throw new Error("Titre de mission vide.");
  const payload = {
    teacher_space_id: teacherSpaceId,
    folder_id: String(mission.folder_id || "").trim() || null,
    title,
    title_normalized: normalizeConfigName(title),
    description: String(mission.description || "").trim(),
    status: String(mission.status || "draft").trim() === "active" ? "active" : "draft",
    answer_mode: String(mission.answer_mode || "student_input").trim() === "manual_validation" ? "manual_validation" : "student_input",
    intent_mode: String(mission.intent_mode || "practice").trim() === "evaluation" ? "evaluation" : "practice",
    question_count: Math.max(1, Math.trunc(Number(mission.question_count) || 5)),
    question_time_seconds: mission.question_time_seconds == null || mission.question_time_seconds === "" ? null : Math.max(0, Math.trunc(Number(mission.question_time_seconds) || 0)),
    answer_display_seconds: mission.answer_display_seconds == null || mission.answer_display_seconds === "" ? null : Math.max(0, Math.trunc(Number(mission.answer_display_seconds) || 0)),
    transition_seconds: Math.max(0, Math.trunc(Number(mission.transition_seconds) || 0)),
    mission_time_seconds: mission.mission_time_seconds == null || mission.mission_time_seconds === "" ? null : Math.max(0, Math.trunc(Number(mission.mission_time_seconds) || 0)),
    instructions: String(mission.instructions || "").trim() || null,
    display_order: Math.max(0, Math.trunc(Number(mission.display_order) || 0))
  };

  let savedMission;
  if (mission.id) {
    const { data, error } = await supabase.from("missions").update(payload).eq("id", mission.id).select("*").single();
    if (error) throw error;
    savedMission = data;
  } else {
    const existing = await listMissionsForSpace(teacherSpaceId);
    payload.display_order = existing.reduce((max, item) => Math.max(max, Number(item.display_order) || 0), -1) + 1;
    const { data, error } = await supabase.from("missions").insert(payload).select("*").single();
    if (error) throw error;
    savedMission = data;
  }

  const missionId = savedMission.id;
  await supabase.from("mission_steps").delete().eq("mission_id", missionId);
  const cleanSteps = (Array.isArray(steps) ? steps : []).map((step, index) => ({
    mission_id: missionId,
    catalog_activity_id: String(step.catalog_activity_id || step.id || "").trim(),
    position: index,
    difficulty_mode: String(step.difficulty_mode || "normal").trim() || "normal",
    difficulty_level: Math.max(1, Math.min(5, Math.trunc(Number(step.difficulty_level) || 3))),
    step_options_json: step.step_options_json && typeof step.step_options_json === "object" ? step.step_options_json : {}
  })).filter((step) => step.catalog_activity_id);
  if (cleanSteps.length) {
    const { error } = await supabase.from("mission_steps").insert(cleanSteps);
    if (error) throw error;
  }

  await supabase.from("mission_assignments").delete().eq("mission_id", missionId);
  const cleanAssignments = (Array.isArray(assignments) ? assignments : []).map((assignment) => {
    const targetType = String(assignment.target_type || "").trim();
    if (targetType === "class") {
      const classId = Number(assignment.teacher_class_id);
      return Number.isFinite(classId) && classId > 0 ? { mission_id: missionId, target_type: "class", teacher_class_id: classId } : null;
    }
    if (targetType === "student") {
      const studentId = Number(assignment.student_id);
      return Number.isFinite(studentId) && studentId > 0 ? { mission_id: missionId, target_type: "student", student_id: studentId } : null;
    }
    return null;
  }).filter(Boolean);
  if (cleanAssignments.length) {
    const { error } = await supabase.from("mission_assignments").insert(cleanAssignments);
    if (error) throw error;
  }

  return savedMission;
}

export async function deleteMission(missionId) {
  const { error } = await supabase.from("missions").update({ status: "archived" }).eq("id", missionId);
  if (error) throw error;
}

export async function isCurrentUserSuperAdmin() {
  const { data, error } = await supabase.rpc("is_super_admin");
  if (error) {
    console.warn("Vérification super-admin impossible.", error);
    return false;
  }
  return data === true;
}

export async function listCatalogActivitiesForAdmin() {
  const { data, error } = await supabase
    .from("catalog_activities")
    .select("id, category_id, tool_id, title, description, display_order, status, default_visible, levels_json, created_at, updated_at")
    .neq("status", "archived")
    .order("category_id", { ascending: true })
    .order("display_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) throw error;
  return sortCatalogActivities(Array.isArray(data) ? data.map(normalizeCatalogActivity) : []);
}

export async function saveCatalogActivityAsAdmin(activity = {}) {
  const id = String(activity.id || "").trim().toLowerCase();
  const title = cleanDisplayName(activity.title || activity.config_name);
  const categoryId = String(activity.category_id || activity.folder_id || "").trim();
  const toolId = String(activity.tool_id || "").trim();
  if (!id) throw new Error("Identifiant d’activité vide.");
  if (!/^[a-z0-9][a-z0-9._-]{1,160}$/.test(id)) {
    throw new Error("Identifiant invalide. Utilise minuscules, chiffres, points, tirets ou underscores.");
  }
  if (!title) throw new Error("Titre d’activité vide.");
  if (!categoryId) throw new Error("Catégorie obligatoire.");
  if (!toolId) throw new Error("Outil obligatoire.");

  const payload = {
    id,
    category_id: categoryId,
    tool_id: toolId,
    title,
    description: String(activity.description || "").trim(),
    display_order: Math.max(0, Math.trunc(Number(activity.display_order) || 0)),
    status: String(activity.status || "draft").trim() === "published" ? "published" : "draft",
    default_visible: activity.default_visible !== false,
    levels_json: activity.levels_json && typeof activity.levels_json === "object" && !Array.isArray(activity.levels_json)
      ? activity.levels_json
      : { "1": { settings: {} }, "2": { settings: {} }, "3": { settings: {} }, "4": { settings: {} }, "5": { settings: {} } },
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("catalog_activities")
    .upsert(payload, { onConflict: "id" })
    .select("id, category_id, tool_id, title, description, display_order, status, default_visible, levels_json, created_at, updated_at")
    .single();

  if (error) throw error;
  return normalizeCatalogActivity(data);
}

export async function getCatalogActivityUsageAsAdmin(activityId) {
  const id = String(activityId || "").trim().toLowerCase();
  if (!id) throw new Error("Activité introuvable.");
  const { data, error } = await supabase.rpc("get_catalog_activity_usage_as_admin", {
    p_activity_id: id
  });
  if (error) throw error;
  return Array.isArray(data) && data.length ? data[0] : {
    catalog_activity_id: id,
    mission_steps_count: 0,
    missions_count: 0,
    progress_count: 0,
    sessions_count: 0,
    visibility_count: 0
  };
}

export async function deleteCatalogActivityAsAdmin(activityId) {
  const id = String(activityId || "").trim().toLowerCase();
  if (!id) throw new Error("Activité introuvable.");
  const { error } = await supabase.rpc("delete_catalog_activity_cascade", {
    p_activity_id: id
  });
  if (error) throw error;
}

function makeVocabularyExactKey(value) {
  // Pour le vocabulaire, on ne normalise pas les accents ni la casse :
  // "marche" et "marché" sont deux mots différents.
  return cleanDisplayName(value);
}

function normalizeVocabularyDictionaryPage(value) {
  if (value == null || value === "") return null;
  const page = Number(value);
  return Number.isFinite(page) && page > 0 ? Math.trunc(page) : null;
}

async function ensureDefaultVocabularyExactKeys() {
  const { data, error } = await supabase
    .from("vocabulary_default_words")
    .select("id, word, word_normalized");
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  for (const row of rows) {
    const exactKey = makeVocabularyExactKey(row?.word);
    if (!row?.id || !exactKey || row.word_normalized === exactKey) continue;
    const { error: updateError } = await supabase
      .from("vocabulary_default_words")
      .update({ word_normalized: exactKey, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    if (updateError) throw updateError;
  }
}

function normalizeSystemSlug(value, fallback = "item") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    || fallback;
}

export async function listDefaultVocabularyWordsAsAdmin() {
  const { data, error } = await supabase
    .from("vocabulary_default_words")
    .select("id, word, word_normalized, dictionary_page, created_at, updated_at")
    .order("word_normalized", { ascending: true })
    .order("word", { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function saveDefaultVocabularyWordAsAdmin(item = {}) {
  const word = cleanDisplayName(item.word);
  if (!word) throw new Error("Mot vide.");
  await ensureDefaultVocabularyExactKeys();
  const payload = {
    word,
    word_normalized: makeVocabularyExactKey(word),
    dictionary_page: normalizeVocabularyDictionaryPage(item.dictionary_page),
    updated_at: new Date().toISOString()
  };
  let query;
  if (item.id) {
    query = supabase.from("vocabulary_default_words").update(payload).eq("id", item.id);
  } else {
    query = supabase.from("vocabulary_default_words").upsert(payload, { onConflict: "word_normalized" });
  }
  const { data, error } = await query
    .select("id, word, word_normalized, dictionary_page, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function upsertDefaultVocabularyWordsAsAdmin(items = []) {
  if (!Array.isArray(items)) throw new Error("Import vocabulaire invalide.");
  await ensureDefaultVocabularyExactKeys();

  const now = new Date().toISOString();
  const payloads = items
    .map((item) => {
      const word = cleanDisplayName(item?.word);
      if (!word) return null;
      return {
        word,
        word_normalized: makeVocabularyExactKey(word),
        dictionary_page: normalizeVocabularyDictionaryPage(item?.dictionary_page),
        updated_at: now
      };
    })
    .filter(Boolean);

  if (!payloads.length) throw new Error("Aucun mot valide à importer.");

  const chunkSize = 400;
  for (let index = 0; index < payloads.length; index += chunkSize) {
    const chunk = payloads.slice(index, index + chunkSize);
    const { error } = await supabase
      .from("vocabulary_default_words")
      .upsert(chunk, { onConflict: "word_normalized" });
    if (error) throw error;
  }

  return await listDefaultVocabularyWordsAsAdmin();
}

export async function deleteDefaultVocabularyWordAsAdmin(wordId) {
  const id = Number(wordId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("Mot introuvable.");
  const { error } = await supabase.from("vocabulary_default_words").delete().eq("id", id);
  if (error) throw error;
}

export async function listEncodingResourcesAsAdmin() {
  const [assetsResult, wordsResult] = await Promise.all([
    supabase.from("image_assets").select("slug, storage_path, tags, notes, is_active, created_at, updated_at").order("slug", { ascending: true }),
    supabase.from("phonology_words").select("slug, word, units, is_active, created_at, updated_at").order("slug", { ascending: true })
  ]);
  if (assetsResult.error) throw assetsResult.error;
  if (wordsResult.error) throw wordsResult.error;
  return {
    assets: Array.isArray(assetsResult.data) ? assetsResult.data : [],
    words: Array.isArray(wordsResult.data) ? wordsResult.data : []
  };
}

export async function saveImageAssetAsAdmin(asset = {}) {
  const slug = normalizeSystemSlug(asset.slug || asset.word || asset.storage_path, "asset");
  const storagePath = String(asset.storage_path || "").trim();
  if (!slug) throw new Error("Slug d’asset vide.");
  if (!storagePath) throw new Error("Chemin Storage vide.");
  const tags = Array.isArray(asset.tags)
    ? asset.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
    : String(asset.tags || "").split(/[;,]/g).map((tag) => tag.trim()).filter(Boolean);
  const payload = {
    slug,
    storage_path: storagePath,
    tags,
    notes: String(asset.notes || "").trim(),
    is_active: asset.is_active !== false,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from("image_assets")
    .upsert(payload, { onConflict: "slug" })
    .select("slug, storage_path, tags, notes, is_active, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteImageAssetAsAdmin(slug) {
  const id = normalizeSystemSlug(slug, "");
  if (!id) throw new Error("Asset introuvable.");
  const { error } = await supabase.from("image_assets").delete().eq("slug", id);
  if (error) throw error;
}

export async function savePhonologyWordAsAdmin(entry = {}) {
  const slug = normalizeSystemSlug(entry.slug || entry.word, "mot");
  const word = cleanDisplayName(entry.word);
  if (!slug) throw new Error("Slug du mot vide.");
  if (!word) throw new Error("Mot Encodage vide.");
  const units = normalizePhonologyUnitsForAdmin(entry.units ?? entry.correction ?? entry.units_text);
  const payload = {
    slug,
    word,
    units,
    is_active: entry.is_active !== false,
    updated_at: new Date().toISOString()
  };
  const { data, error } = await supabase
    .from("phonology_words")
    .upsert(payload, { onConflict: "slug" })
    .select("slug, word, units, is_active, created_at, updated_at")
    .single();
  if (error) throw error;
  return data;
}

export async function deletePhonologyWordAsAdmin(slug) {
  const id = normalizeSystemSlug(slug, "");
  if (!id) throw new Error("Mot Encodage introuvable.");
  const { error } = await supabase.from("phonology_words").delete().eq("slug", id);
  if (error) throw error;
}

function normalizePhonologyUnitsForAdmin(value) {
  if (Array.isArray(value)) {
    return value.map(normalizePhonologyUnit).filter(Boolean);
  }
  const text = String(value || "").trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map(normalizePhonologyUnit).filter(Boolean);
  } catch {}
  return text.split(/\s+/g).map((token) => {
    const clean = String(token || "").trim();
    if (!clean) return null;
    const silent = clean.endsWith("*") || clean.endsWith("°");
    return { graph: silent ? clean.slice(0, -1) : clean, isSilent: silent };
  }).filter((unit) => unit?.graph);
}

function normalizePhonologyUnit(unit) {
  if (!unit || typeof unit !== "object") return null;
  const graph = String(unit.graph || unit.value || "").trim();
  if (!graph) return null;
  return {
    graph,
    isSilent: unit.isSilent === true || unit.silent === true
  };
}

export async function listSystemQuestionBanksAsAdmin() {
  const { data, error } = await supabase
    .from("question_banks")
    .select(QUESTION_BANK_FIELDS)
    .eq("is_system", true)
    .order("bank_type", { ascending: true })
    .order("display_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return sortQuestionBanksByMeta((Array.isArray(data) ? data : []).map(normalizeQuestionBankRecord).filter(Boolean));
}

export async function createSystemQuestionBankAsAdmin(bank = {}) {
  const title = cleanDisplayName(bank.title) || "Nouvelle banque système";
  const existing = await listSystemQuestionBanksAsAdmin();
  const nextOrder = existing
    .filter((item) => normalizeQuestionBankType(item.bank_type) === normalizeQuestionBankType(bank.bank_type))
    .reduce((max, item) => Math.max(max, Number(item.display_order) || 0), -1) + 1;
  const now = new Date().toISOString();
  const payload = {
    teacher_space_id: null,
    source_bank_id: null,
    folder_id: null,
    bank_type: normalizeQuestionBankType(bank.bank_type),
    title,
    title_normalized: normalizeQuestionBankTitle(title),
    instruction: String(bank.instruction || "").trim(),
    description: String(bank.description || "").trim(),
    subject: String(bank.subject || "").trim(),
    grade_level: String(bank.grade_level || "").trim(),
    tags: normalizeQuestionBankTags(bank.tags),
    is_system: true,
    display_order: nextOrder,
    created_at: now,
    updated_at: now
  };
  const { data, error } = await supabase
    .from("question_banks")
    .insert(payload)
    .select(QUESTION_BANK_FIELDS)
    .single();
  if (error) throw error;
  return normalizeQuestionBankRecord(data, nextOrder);
}

/* =========================
   QUIZ SUPABASE
   ========================= */

const QUIZ_FOLDER_FIELDS = "id, teacher_space_id, parent_id, name, display_order, is_system, created_at, updated_at";
const QUIZ_FIELDS = "id, teacher_space_id, folder_id, title, document, schema_version, display_order, is_system, created_at, updated_at";
const RESOURCE_FOLDER_FIELDS = "id, teacher_space_id, parent_id, name, display_order, is_system, created_at, updated_at";
const RESOURCE_FIELDS = "id, teacher_space_id, folder_id, title, resource_type, storage_bucket, storage_path, mime_type, size_bytes, width, height, duration_seconds, alt_text, tags, metadata, display_order, is_system, created_at, updated_at";
const TEACHER_RESOURCE_BUCKET = "teacher-resources";

function normalizePositiveTeacherSpaceId(value) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Espace enseignant invalide.");
  }
  return id;
}

function normalizeUuid(value) {
  const id = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)
    ? id
    : "";
}

function cloneJsonValue(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function collectQuizResourceIds(document) {
  const result = new Set();
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const kind = String(value.kind || value.type || "").trim().toLowerCase();
    if (kind === "resource" || kind === "supabase-resource" || kind === "personal-resource" || kind === "system-resource") {
      const id = normalizeUuid(value.resourceId || value.resource_id || value.id);
      if (id) result.add(id);
    }
    Object.values(value).forEach(visit);
  };
  visit(document);
  return Array.from(result);
}

async function syncQuizResourceLinks(quizId, document) {
  const id = normalizeUuid(quizId);
  if (!id) return;
  const resourceIds = collectQuizResourceIds(document);
  const { error: deleteError } = await supabase
    .from("quiz_resources")
    .delete()
    .eq("quiz_id", id);
  if (deleteError) throw deleteError;
  if (!resourceIds.length) return;
  const { error: insertError } = await supabase
    .from("quiz_resources")
    .insert(resourceIds.map((resourceId) => ({ quiz_id:id, resource_id:resourceId })));
  if (insertError) throw insertError;
}


function normalizeNullableUuid(value) {
  return normalizeUuid(value) || null;
}

function normalizeQuizFolderRecord(row = {}, index = 0) {
  return {
    id: String(row.id || ""),
    teacher_space_id: row.teacher_space_id == null ? null : Number(row.teacher_space_id),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    name: cleanDisplayName(row.name) || "Dossier sans nom",
    display_order: Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : index,
    is_system: row.is_system === true,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || row.created_at || "")
  };
}

function normalizeQuizRecord(row = {}, index = 0) {
  const document = row.document && typeof row.document === "object" && !Array.isArray(row.document)
    ? cloneJsonValue(row.document)
    : {};
  return {
    ...document,
    version: Number(document.version || row.schema_version) || 1,
    id: String(row.id || document.id || ""),
    title: cleanDisplayName(row.title || document.title) || "Quiz sans titre",
    teacher_space_id: row.teacher_space_id == null ? null : Number(row.teacher_space_id),
    folder_id: row.folder_id ? String(row.folder_id) : null,
    display_order: Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : index,
    is_system: row.is_system === true,
    created_at: String(row.created_at || document.created_at || ""),
    updated_at: String(row.updated_at || document.updated_at || row.created_at || "")
  };
}

export async function listQuizFoldersForSpace(teacherSpaceId) {
  const spaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const { data, error } = await supabase
    .from("quiz_folders")
    .select(QUIZ_FOLDER_FIELDS)
    .or(`teacher_space_id.eq.${spaceId},is_system.eq.true`)
    .order("is_system", { ascending: true })
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizeQuizFolderRecord);
}

export async function createQuizFolderForSpace(teacherSpaceId, folder = {}) {
  const spaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const name = cleanDisplayName(folder.name);
  if (!name) throw new Error("Nom de dossier vide.");

  const { data, error } = await supabase
    .from("quiz_folders")
    .insert({
      teacher_space_id: spaceId,
      parent_id: normalizeNullableUuid(folder.parent_id),
      name,
      display_order: Number.isFinite(Number(folder.display_order)) ? Number(folder.display_order) : 0,
      is_system: false
    })
    .select(QUIZ_FOLDER_FIELDS)
    .single();

  if (error) throw error;
  return normalizeQuizFolderRecord(data);
}

export async function updateQuizFolder(folderId, updates = {}) {
  const id = normalizeUuid(folderId);
  if (!id) throw new Error("Dossier de quiz invalide.");

  const payload = {};
  if ("name" in updates) {
    const name = cleanDisplayName(updates.name);
    if (!name) throw new Error("Nom de dossier vide.");
    payload.name = name;
  }
  if ("parent_id" in updates) payload.parent_id = normalizeNullableUuid(updates.parent_id);
  if ("display_order" in updates) payload.display_order = Number(updates.display_order) || 0;

  const { data, error } = await supabase
    .from("quiz_folders")
    .update(payload)
    .eq("id", id)
    .eq("is_system", false)
    .select(QUIZ_FOLDER_FIELDS)
    .single();

  if (error) throw error;
  return normalizeQuizFolderRecord(data);
}

export async function deleteQuizFolder(folderId) {
  const id = normalizeUuid(folderId);
  if (!id) throw new Error("Dossier de quiz invalide.");
  const { error } = await supabase
    .from("quiz_folders")
    .delete()
    .eq("id", id)
    .eq("is_system", false);
  if (error) throw error;
}

export async function listQuizzesForSpace(teacherSpaceId) {
  const spaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const { data, error } = await supabase
    .from("quizzes")
    .select(QUIZ_FIELDS)
    .or(`teacher_space_id.eq.${spaceId},is_system.eq.true`)
    .order("is_system", { ascending: true })
    .order("display_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizeQuizRecord);
}

export async function saveQuizForSpace(teacherSpaceId, quiz = {}) {
  const spaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const title = cleanDisplayName(quiz.title) || "Quiz sans titre";
  const existingId = normalizeUuid(quiz.id);
  const now = new Date().toISOString();
  const schemaVersion = Math.max(1, Math.trunc(Number(quiz.version || quiz.schemaVersion || 1) || 1));
  const document = cloneJsonValue({
    ...quiz,
    version: schemaVersion,
    title
  });

  const payload = {
    teacher_space_id: spaceId,
    folder_id: normalizeNullableUuid(quiz.folder_id),
    title,
    document,
    schema_version: schemaVersion,
    display_order: Number.isFinite(Number(quiz.display_order)) ? Number(quiz.display_order) : 0,
    is_system: false,
    updated_at: now
  };

  let query;
  if (existingId) {
    query = supabase
      .from("quizzes")
      .update(payload)
      .eq("id", existingId)
      .eq("teacher_space_id", spaceId)
      .eq("is_system", false);
  } else {
    query = supabase
      .from("quizzes")
      .insert({ ...payload, created_at: now });
  }

  const { data, error } = await query.select(QUIZ_FIELDS).single();
  if (error) throw error;
  const saved = normalizeQuizRecord(data);
  await syncQuizResourceLinks(saved.id, saved.document || document);
  return saved;
}

export async function deleteQuiz(quizId) {
  const id = normalizeUuid(quizId);
  if (!id) throw new Error("Quiz invalide.");
  const { error } = await supabase
    .from("quizzes")
    .delete()
    .eq("id", id)
    .eq("is_system", false);
  if (error) throw error;
}

/* =========================
   RESSOURCES SUPABASE
   ========================= */

function normalizeResourceFolderRecord(row = {}, index = 0) {
  return {
    id: String(row.id || ""),
    teacher_space_id: row.teacher_space_id == null ? null : Number(row.teacher_space_id),
    parent_id: row.parent_id ? String(row.parent_id) : null,
    name: cleanDisplayName(row.name) || "Dossier sans nom",
    display_order: Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : index,
    is_system: row.is_system === true,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || row.created_at || "")
  };
}

function normalizeResourceRecord(row = {}, index = 0) {
  return {
    id: String(row.id || ""),
    teacher_space_id: row.teacher_space_id == null ? null : Number(row.teacher_space_id),
    folder_id: row.folder_id ? String(row.folder_id) : null,
    title: cleanDisplayName(row.title) || "Ressource sans nom",
    type: String(row.resource_type || "image") === "audio" ? "audio" : "image",
    storage_bucket: String(row.storage_bucket || TEACHER_RESOURCE_BUCKET),
    storage_path: String(row.storage_path || ""),
    path: String(row.storage_path || ""),
    mime_type: String(row.mime_type || ""),
    size_bytes: Math.max(0, Number(row.size_bytes) || 0),
    width: Math.max(0, Number(row.width) || 0),
    height: Math.max(0, Number(row.height) || 0),
    duration: Math.max(0, Number(row.duration_seconds) || 0),
    alt: String(row.alt_text || row.title || ""),
    tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? cloneJsonValue(row.metadata)
      : {},
    display_order: Number.isFinite(Number(row.display_order)) ? Number(row.display_order) : index,
    is_system: row.is_system === true,
    scope: row.is_system === true ? "system" : "personal",
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || row.created_at || "")
  };
}

export async function listResourceFoldersForSpace(teacherSpaceId) {
  const spaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const { data, error } = await supabase
    .from("resource_folders")
    .select(RESOURCE_FOLDER_FIELDS)
    .or(`teacher_space_id.eq.${spaceId},is_system.eq.true`)
    .order("is_system", { ascending: true })
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizeResourceFolderRecord);
}

export async function createResourceFolderForSpace(teacherSpaceId, folder = {}) {
  const spaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const name = cleanDisplayName(folder.name);
  if (!name) throw new Error("Nom de dossier vide.");
  const { data, error } = await supabase
    .from("resource_folders")
    .insert({
      teacher_space_id: spaceId,
      parent_id: normalizeNullableUuid(folder.parent_id),
      name,
      display_order: Number.isFinite(Number(folder.display_order)) ? Number(folder.display_order) : 0,
      is_system: false
    })
    .select(RESOURCE_FOLDER_FIELDS)
    .single();
  if (error) throw error;
  return normalizeResourceFolderRecord(data);
}

export async function updateResourceFolder(folderId, updates = {}) {
  const id = normalizeUuid(folderId);
  if (!id) throw new Error("Dossier de ressources invalide.");
  const payload = {};
  if ("name" in updates) {
    const name = cleanDisplayName(updates.name);
    if (!name) throw new Error("Nom de dossier vide.");
    payload.name = name;
  }
  if ("parent_id" in updates) payload.parent_id = normalizeNullableUuid(updates.parent_id);
  if ("display_order" in updates) payload.display_order = Number(updates.display_order) || 0;
  const { data, error } = await supabase
    .from("resource_folders")
    .update(payload)
    .eq("id", id)
    .eq("is_system", false)
    .select(RESOURCE_FOLDER_FIELDS)
    .single();
  if (error) throw error;
  return normalizeResourceFolderRecord(data);
}

export async function deleteResourceFolder(folderId) {
  const id = normalizeUuid(folderId);
  if (!id) throw new Error("Dossier de ressources invalide.");
  const { error } = await supabase
    .from("resource_folders")
    .delete()
    .eq("id", id)
    .eq("is_system", false);
  if (error) throw error;
}

export async function listResourcesForSpace(teacherSpaceId) {
  const spaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const { data, error } = await supabase
    .from("resources")
    .select(RESOURCE_FIELDS)
    .or(`teacher_space_id.eq.${spaceId},is_system.eq.true`)
    .order("is_system", { ascending: true })
    .order("display_order", { ascending: true })
    .order("title", { ascending: true });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizeResourceRecord);
}

function sanitizeStorageFileName(value, fallback = "resource") {
  const source = String(value || fallback).trim() || fallback;
  const normalized = source.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const safe = normalized
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return safe || fallback;
}

export async function uploadResourceForSpace(teacherSpaceId, file, resource = {}) {
  const spaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  if (!(file instanceof Blob)) throw new Error("Fichier de ressource invalide.");
  const mimeType = String(file.type || resource.mime_type || "").trim().toLowerCase();
  const resourceType = mimeType.startsWith("audio/") || resource.type === "audio" ? "audio" : "image";
  if (!mimeType.startsWith("image/") && !mimeType.startsWith("audio/")) {
    throw new Error("Seules les images et les pistes audio sont acceptées.");
  }

  const user = await getCurrentUser();
  if (!user?.id) throw new Error("Utilisateur non connecté.");
  const resourceId = globalThis.crypto?.randomUUID?.();
  if (!resourceId) throw new Error("Impossible de générer l’identifiant de la ressource.");
  const fileName = sanitizeStorageFileName(resource.name || file.name, resourceType === "audio" ? "audio" : "image");
  const storagePath = `${user.id}/${resourceId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(TEACHER_RESOURCE_BUCKET)
    .upload(storagePath, file, {
      contentType: mimeType,
      cacheControl: "3600",
      upsert: false
    });
  if (uploadError) throw uploadError;

  const payload = {
    id: resourceId,
    teacher_space_id: spaceId,
    folder_id: normalizeNullableUuid(resource.folder_id),
    title: cleanDisplayName(resource.title || file.name) || (resourceType === "audio" ? "Audio" : "Image"),
    resource_type: resourceType,
    storage_bucket: TEACHER_RESOURCE_BUCKET,
    storage_path: storagePath,
    mime_type: mimeType,
    size_bytes: Math.max(0, Number(file.size) || 0),
    width: Math.max(0, Number(resource.width) || 0),
    height: Math.max(0, Number(resource.height) || 0),
    duration_seconds: Math.max(0, Number(resource.duration) || 0),
    alt_text: String(resource.alt || resource.title || file.name || "").trim(),
    tags: Array.isArray(resource.tags) ? resource.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
    metadata: resource.metadata && typeof resource.metadata === "object" && !Array.isArray(resource.metadata)
      ? cloneJsonValue(resource.metadata)
      : {},
    display_order: Number.isFinite(Number(resource.display_order)) ? Number(resource.display_order) : 0,
    is_system: false
  };

  const { data, error } = await supabase
    .from("resources")
    .insert(payload)
    .select(RESOURCE_FIELDS)
    .single();

  if (error) {
    await supabase.storage.from(TEACHER_RESOURCE_BUCKET).remove([storagePath]).catch(() => {});
    throw error;
  }

  return normalizeResourceRecord(data);
}

export async function updateResource(resourceId, updates = {}) {
  const id = normalizeUuid(resourceId);
  if (!id) throw new Error("Ressource invalide.");

  const payload = {};
  if ("folder_id" in updates) payload.folder_id = normalizeNullableUuid(updates.folder_id);
  if ("display_order" in updates) payload.display_order = Number(updates.display_order) || 0;
  if ("title" in updates) {
    const title = cleanDisplayName(updates.title);
    if (!title) throw new Error("Nom de ressource vide.");
    payload.title = title;
  }
  if ("alt" in updates || "alt_text" in updates) {
    payload.alt_text = String(updates.alt_text ?? updates.alt ?? "").trim();
  }
  if ("tags" in updates) {
    payload.tags = Array.isArray(updates.tags)
      ? updates.tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [];
  }
  if ("metadata" in updates) {
    payload.metadata = updates.metadata && typeof updates.metadata === "object" && !Array.isArray(updates.metadata)
      ? cloneJsonValue(updates.metadata)
      : {};
  }

  if (!Object.keys(payload).length) {
    const { data, error } = await supabase
      .from("resources")
      .select(RESOURCE_FIELDS)
      .eq("id", id)
      .eq("is_system", false)
      .single();
    if (error) throw error;
    return normalizeResourceRecord(data);
  }

  const { data, error } = await supabase
    .from("resources")
    .update(payload)
    .eq("id", id)
    .eq("is_system", false)
    .select(RESOURCE_FIELDS)
    .single();
  if (error) throw error;
  return normalizeResourceRecord(data);
}

export async function createResourceSignedUrl(resource, expiresInSeconds = 3600) {
  const bucket = String(resource?.storage_bucket || TEACHER_RESOURCE_BUCKET).trim();
  const path = String(resource?.storage_path || resource?.path || "").trim();
  if (!path) return "";
  const expiresIn = Math.max(60, Math.min(86400, Math.trunc(Number(expiresInSeconds) || 3600)));
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return String(data?.signedUrl || "");
}

export async function deleteResource(resourceId) {
  const id = normalizeUuid(resourceId);
  if (!id) throw new Error("Ressource invalide.");

  const { data: resource, error: readError } = await supabase
    .from("resources")
    .select(RESOURCE_FIELDS)
    .eq("id", id)
    .eq("is_system", false)
    .single();
  if (readError) throw readError;

  const { error: deleteError } = await supabase
    .from("resources")
    .delete()
    .eq("id", id)
    .eq("is_system", false);
  if (deleteError) throw deleteError;

  const bucket = String(resource?.storage_bucket || TEACHER_RESOURCE_BUCKET);
  const path = String(resource?.storage_path || "");
  if (path) {
    const { error: storageError } = await supabase.storage.from(bucket).remove([path]);
    if (storageError) console.warn("La ligne a été supprimée, mais le fichier Storage n’a pas pu être effacé.", storageError);
  }
}
