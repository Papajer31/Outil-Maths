const { createClient } = window.supabase;

const SUPABASE_URL = "https://uxmcwiyfhtvyekllpuze.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_9uJrGqzpAz7vNbxK9fI3PA_8CE9yuRG";

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

/* =========================================================
   1) OUTILS DE NORMALISATION
   ========================================================= */

export function normalizeAccessCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 12);
}

export function normalizeConfigName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9_-]/g, "");
}

export function cleanDisplayName(value) {
  return String(value || "").trim();
}

export function normalizeModuleKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "");
}

function normalizeActivityDashboardMeta(configJson = {}, fallbackOrder = 0) {
  const raw = configJson && typeof configJson === "object" ? (configJson.dashboard ?? {}) : {};

  const displayOrderValue = Number(raw?.display_order);
  const displayOrder = Number.isFinite(displayOrderValue)
    ? Math.max(0, Math.trunc(displayOrderValue))
    : Math.max(0, Math.trunc(Number(fallbackOrder) || 0));

  return {
    display_order: displayOrder,
    is_visible: raw?.is_visible !== false,
    is_highlighted: raw?.is_highlighted === true
  };
}

function withActivityDashboardMeta(activity, fallbackOrder = 0) {
  const dashboard = normalizeActivityDashboardMeta(activity?.config_json, fallbackOrder);

  return {
    ...(activity || {}),
    display_order: dashboard.display_order,
    is_visible: dashboard.is_visible,
    is_highlighted: dashboard.is_highlighted
  };
}

function mergeActivityDashboardMeta(configJson = {}, metaUpdates = {}, fallbackOrder = 0) {
  const safeConfig = configJson && typeof configJson === "object" ? configJson : {};
  const current = normalizeActivityDashboardMeta(safeConfig, fallbackOrder);
  const next = { ...current };

  if ("display_order" in metaUpdates) {
    const displayOrder = Number(metaUpdates.display_order);
    if (!Number.isFinite(displayOrder)) {
      throw new Error("Ordre d’activité invalide.");
    }
    next.display_order = Math.max(0, Math.trunc(displayOrder));
  }

  if ("is_visible" in metaUpdates) {
    next.is_visible = metaUpdates.is_visible !== false;
  }

  if ("is_highlighted" in metaUpdates) {
    next.is_highlighted = metaUpdates.is_highlighted === true;
  }

  return {
    ...safeConfig,
    dashboard: next
  };
}

function sortActivitiesByDashboardMeta(activities = []) {
  return [...activities].sort((a, b) => {
    const orderA = Number(a?.display_order);
    const orderB = Number(b?.display_order);

    if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
      return orderA - orderB;
    }

    const nameA = String(a?.config_name || "").localeCompare(String(b?.config_name || ""), "fr", { sensitivity: "base" });
    if (nameA !== 0) return nameA;

    return String(a?.id || "").localeCompare(String(b?.id || ""), "fr", { sensitivity: "base" });
  });
}

/* =========================================================
   2) AUTHENTIFICATION
   ========================================================= */

export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user ?? null;
}

export async function signInUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw error;
  return data.user ?? null;
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

/* =========================================================
   3) ESPACE ENSEIGNANT
   ========================================================= */

export async function accessCodeExists(accessCode) {
  const code = normalizeAccessCode(accessCode);
  if (!code) return false;

  const { data, error } = await supabase.rpc("access_code_exists", {
    p_access_code: code,
  });

  if (error) throw error;
  return Boolean(data);
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
    last_opened_at: new Date().toISOString(),
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
    updated_at: new Date().toISOString(),
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
      last_opened_at: now,
    })
    .eq("id", teacherSpaceId)
    .select("id, owner_user_id, access_code, created_at, updated_at, last_opened_at")
    .single();

  if (error) throw error;
  return data;
}

/* =========================================================
   4) CLASSES ENSEIGNANT
   ========================================================= */

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
      updated_at: new Date().toISOString(),
    })
    .select("id, teacher_space_id, name, display_order, created_at, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function updateTeacherClass(teacherClassId, updates = {}) {
  const payload = {
    updated_at: new Date().toISOString(),
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

/* =========================================================
   5) LECTURE PUBLIQUE DES ACTIVITÉS
   ========================================================= */

export async function listPublicActivitiesForSpace(accessCode) {
  const code = normalizeAccessCode(accessCode);
  if (!code) return [];

  const { data, error } = await supabase.rpc("get_space_activities", {
    p_access_code: code,
  });

  if (error) throw error;

  const baseActivities = Array.isArray(data) ? data : [];

  const hydratedActivities = await Promise.all(baseActivities.map(async (activity, index) => {
    if (activity?.config_json && typeof activity.config_json === "object") {
      return withActivityDashboardMeta(activity, index);
    }

    try {
      const remote = await loadPublicActivityConfig(code, activity?.config_name || "");
      return withActivityDashboardMeta({ ...activity, config_json: remote?.config_json ?? null }, index);
    } catch {
      return withActivityDashboardMeta(activity, index);
    }
  }));

  const visibleActivities = hydratedActivities.filter((activity) => activity?.is_visible !== false);
  return sortActivitiesByDashboardMeta(visibleActivities);
}

export async function listPublicClassesForSpace(accessCode) {
  const code = normalizeAccessCode(accessCode);
  if (!code) return [];

  const { data, error } = await supabase.rpc("get_space_classes", {
    p_access_code: code,
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listPublicStudentsForSpace(accessCode) {
  const code = normalizeAccessCode(accessCode);
  if (!code) return [];

  const { data, error } = await supabase.rpc("get_space_students", {
    p_access_code: code,
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function listPublicVocabularyWordsForSpace(accessCode) {
  const code = normalizeAccessCode(accessCode);
  if (!code) return [];

  const { data, error } = await supabase.rpc("get_space_vocabulary_words", {
    p_access_code: code,
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
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

export async function loadPublicActivityConfig(accessCode, configName) {
  const code = normalizeAccessCode(accessCode);
  const normalizedConfigName = normalizeConfigName(configName);

  if (!code || !normalizedConfigName) return null;

  const { data, error } = await supabase.rpc("get_activity_config", {
    p_access_code: code,
    p_config_name: normalizedConfigName,
  });

  if (error) throw error;
  if (!data) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    access_code: code,
    config_name: cleanDisplayName(configName),
    config_name_normalized: normalizedConfigName,
    module_key: normalizeModuleKey(row.module_key || "maths") || "maths",
    config_json: row.config_json ?? null,
  };
}

/* =========================================================
   6) GESTION PRIVÉE DES ACTIVITÉS
   ========================================================= */

export async function getMyActivitiesForSpace(teacherSpaceId) {
  const { data, error } = await supabase
    .from("activity_configs")
    .select(`
      id,
      teacher_space_id,
      module_key,
      config_name,
      config_name_normalized,
      config_json,
      created_at,
      updated_at
    `)
    .eq("teacher_space_id", teacherSpaceId)
    .order("config_name", { ascending: true });

  if (error) throw error;

  const normalizedActivities = (data ?? []).map((activity, index) => withActivityDashboardMeta(activity, index));
  return sortActivitiesByDashboardMeta(normalizedActivities);
}

export async function getMyActivityByName(teacherSpaceId, configName) {
  const normalizedConfigName = normalizeConfigName(configName);
  if (!normalizedConfigName) return null;

  const { data, error } = await supabase
    .from("activity_configs")
    .select(`
      id,
      teacher_space_id,
      module_key,
      config_name,
      config_name_normalized,
      config_json,
      created_at,
      updated_at
    `)
    .eq("teacher_space_id", teacherSpaceId)
    .eq("config_name_normalized", normalizedConfigName)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function saveActivityConfig(params) {
  const {
    accessCode,
    moduleKey,
    configName,
    configJson,
  } = params || {};

  const teacherSpace = await getMyTeacherSpace();
  if (!teacherSpace) {
    throw new Error("Aucun espace enseignant trouvé.");
  }

  const normalizedAccessCode = normalizeAccessCode(accessCode);
  const displayConfigName = cleanDisplayName(configName);
  const normalizedConfigName = normalizeConfigName(configName);
  const cleanedModuleKey = cleanDisplayName(moduleKey);

  if (!normalizedAccessCode) {
    throw new Error("Code de connexion vide.");
  }

  if (teacherSpace.access_code !== normalizedAccessCode) {
    throw new Error("Le code de connexion ne correspond pas à ton espace enseignant.");
  }

  if (!displayConfigName) {
    throw new Error("Nom d’activité vide.");
  }

  if (!normalizedConfigName) {
    throw new Error("Nom d’activité invalide.");
  }

  if (!cleanedModuleKey) {
    throw new Error("Clé module vide.");
  }

  if (configJson === undefined) {
    throw new Error("Configuration absente.");
  }

  const payload = {
    teacher_space_id: teacherSpace.id,
    module_key: cleanedModuleKey,
    config_name: displayConfigName,
    config_name_normalized: normalizedConfigName,
    config_json: configJson,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("activity_configs")
    .upsert(payload, {
      onConflict: "teacher_space_id,config_name_normalized",
    })
    .select(`
      id,
      teacher_space_id,
      module_key,
      config_name,
      config_name_normalized,
      config_json,
      created_at,
      updated_at
    `)
    .single();

  if (error) throw error;

  return {
    teacher_space: teacherSpace,
    activity: data,
  };
}

export async function deleteMyActivity(teacherSpaceId, configName) {
  const normalizedConfigName = normalizeConfigName(configName);
  if (!normalizedConfigName) {
    throw new Error("Nom d’activité vide.");
  }

  const { error } = await supabase
    .from("activity_configs")
    .delete()
    .eq("teacher_space_id", teacherSpaceId)
    .eq("config_name_normalized", normalizedConfigName);

  if (error) throw error;
}


export async function updateActivityDashboardMeta(activityId, metaUpdates = {}) {
  if (!activityId) {
    throw new Error("Activité introuvable.");
  }

  const { data: existing, error: readError } = await supabase
    .from("activity_configs")
    .select("id, config_json")
    .eq("id", activityId)
    .single();

  if (readError) throw readError;

  const nextConfigJson = mergeActivityDashboardMeta(existing?.config_json, metaUpdates);

  const { data, error } = await supabase
    .from("activity_configs")
    .update({
      config_json: nextConfigJson,
      updated_at: new Date().toISOString()
    })
    .eq("id", activityId)
    .select(`
      id,
      teacher_space_id,
      module_key,
      config_name,
      config_name_normalized,
      config_json,
      created_at,
      updated_at
    `)
    .single();

  if (error) throw error;
  return withActivityDashboardMeta(data);
}

export async function saveActivityOrderForTeacherSpace(teacherSpaceId, orderedActivityIds = []) {
  if (!Array.isArray(orderedActivityIds)) {
    throw new Error("Ordre d’activités invalide.");
  }

  const activities = await getMyActivitiesForSpace(teacherSpaceId);
  const currentIds = activities.map((activity) => String(activity.id));
  const currentIdSet = new Set(currentIds);

  const seen = new Set();
  const normalizedOrderedIds = orderedActivityIds
    .map((id) => String(id))
    .filter((id) => currentIdSet.has(id))
    .filter((id) => {
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });

  const missingIds = currentIds.filter((id) => !seen.has(id));
  const finalIds = [...normalizedOrderedIds, ...missingIds];

  await Promise.all(finalIds.map((activityId, index) => updateActivityDashboardMeta(activityId, { display_order: index })));

  return finalIds;
}

export async function setHighlightedActivityForTeacherSpace(teacherSpaceId, highlightedActivityId = null) {
  const activities = await getMyActivitiesForSpace(teacherSpaceId);
  const targetId = highlightedActivityId == null ? null : String(highlightedActivityId);

  await Promise.all(activities.map((activity) => updateActivityDashboardMeta(activity.id, {
    is_highlighted: targetId !== null && String(activity.id) === targetId
  })));

  return targetId;
}

/* =========================================================
   7) GESTION ÉLÈVES
   ========================================================= */

export async function listStudentsForClass(teacherClassId){
  const { data, error } = await supabase
    .from("students")
    .select("id, teacher_class_id, first_name, grade_level, display_order, updated_at")
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

export async function listStudentsForTeacherSpace(teacherSpaceId){
  const storageContainers = await listStudentStorageContainersForSpace(teacherSpaceId);
  if (!storageContainers.length) return [];

  const storageContainerIds = storageContainers.map((item) => item.id);

  const { data, error } = await supabase
    .from("students")
    .select("id, teacher_class_id, first_name, grade_level, display_order, updated_at")
    .in("teacher_class_id", storageContainerIds)
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function listStudentsForSpace(teacherSpaceId){
  return await listStudentsForTeacherSpace(teacherSpaceId);
}

export async function createStudent(teacherClassId, student = {}){
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
      display_order: nextOrder,
      updated_at: new Date().toISOString()
    })
    .select("id, teacher_class_id, first_name, grade_level, display_order, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function createStudentForTeacherSpace(teacherSpaceId, student = {}) {
  const storageContainer = await ensureDefaultStudentStorageContainerForSpace(teacherSpaceId);
  return await createStudent(storageContainer.id, student);
}

export async function updateStudent(studentId, updates = {}){
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
    .select("id, teacher_class_id, first_name, grade_level, display_order, updated_at")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteStudent(studentId){
  const { error } = await supabase
    .from("students")
    .delete()
    .eq("id", studentId);

  if (error) throw error;
}

export async function saveStudentOrderForTeacherSpace(teacherSpaceId, orderedStudentIds = []){
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

export async function replaceStudentsForClass(teacherClassId, students){
  if (!Array.isArray(students)){
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