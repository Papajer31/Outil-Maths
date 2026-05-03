import { supabase } from "../../shared/supabase-client.js";
import {
  cleanDisplayName,
  normalizeAccessCode,
  normalizeConfigName,
  mergeActivityDashboardMeta,
  mergePreservedActivityMeta,
  normalizeFolderRecord,
  sortActivitiesByDashboardMeta,
  sortFoldersByMeta,
  sanitizeActivityConfigJson,
  withActivityDashboardMeta
} from "../../shared/api-common.js";
import {
  DEFAULT_ACTIVITY_MODE,
  isStudentFacingActivityMode,
  normalizeActivityMode
} from "../../shared/activity-modes.js";

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

  const normalizedActivities = (data ?? []).map((activity, index) => withActivityDashboardMeta({
    ...activity,
    config_json: sanitizeActivityConfigJson(activity.config_json)
  }, index));
  return sortActivitiesByDashboardMeta(normalizedActivities);
}

export async function getMyActivityFoldersForSpace(teacherSpaceId) {
  const { data, error } = await supabase
    .from("activity_folders")
    .select(`
      id,
      teacher_space_id,
      parent_id,
      name,
      display_order,
      created_at,
      updated_at
    `)
    .eq("teacher_space_id", teacherSpaceId)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw error;

  const normalizedFolders = (data ?? []).map((folder, index) => normalizeFolderRecord(folder, index));
  return sortFoldersByMeta(normalizedFolders);
}

export async function createActivityFolderForSpace(teacherSpaceId, { name, parent_id = null } = {}) {
  const displayName = cleanDisplayName(name);
  if (!displayName) {
    throw new Error("Nom de dossier vide.");
  }

  const safeParentId = String(parent_id ?? "").trim() || null;
  const [folders, activities] = await Promise.all([
    getMyActivityFoldersForSpace(teacherSpaceId),
    getMyActivitiesForSpace(teacherSpaceId)
  ]);

  const siblingFolders = folders.filter((folder) => String(folder.parent_id ?? "") === String(safeParentId ?? ""));
  const siblingActivities = activities.filter((activity) => String(activity.folder_id ?? "") === String(safeParentId ?? ""));
  const nextOrder = [...siblingFolders, ...siblingActivities]
    .reduce((maxOrder, item) => Math.max(maxOrder, Number(item.display_order) || 0), -1) + 1;

  const { data, error } = await supabase
    .from("activity_folders")
    .insert({
      teacher_space_id: teacherSpaceId,
      parent_id: safeParentId,
      name: displayName,
      display_order: nextOrder,
      updated_at: new Date().toISOString()
    })
    .select(`
      id,
      teacher_space_id,
      parent_id,
      name,
      display_order,
      created_at,
      updated_at
    `)
    .single();

  if (error) throw error;
  return normalizeFolderRecord(data, nextOrder);
}

export async function updateActivityFolder(folderId, updates = {}) {
  if (!folderId) {
    throw new Error("Dossier introuvable.");
  }

  const payload = {
    updated_at: new Date().toISOString()
  };

  if ("name" in updates) {
    const displayName = cleanDisplayName(updates.name);
    if (!displayName) {
      throw new Error("Nom de dossier vide.");
    }
    payload.name = displayName;
  }

  if ("parent_id" in updates) {
    payload.parent_id = String(updates.parent_id ?? "").trim() || null;
  }

  if ("display_order" in updates) {
    const displayOrder = Number(updates.display_order);
    if (!Number.isFinite(displayOrder)) {
      throw new Error("Ordre de dossier invalide.");
    }
    payload.display_order = Math.max(0, Math.trunc(displayOrder));
  }

  const { data, error } = await supabase
    .from("activity_folders")
    .update(payload)
    .eq("id", folderId)
    .select(`
      id,
      teacher_space_id,
      parent_id,
      name,
      display_order,
      created_at,
      updated_at
    `)
    .single();

  if (error) throw error;
  return normalizeFolderRecord(data);
}

export async function deleteActivityFolder(folderId) {
  if (!folderId) {
    throw new Error("Dossier introuvable.");
  }

  const { error } = await supabase
    .from("activity_folders")
    .delete()
    .eq("id", folderId);

  if (error) throw error;
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
  return data ? withActivityDashboardMeta({
    ...data,
    config_json: sanitizeActivityConfigJson(data.config_json)
  }) : null;
}

export async function saveActivityConfig(params) {
  const {
    accessCode,
    moduleKey,
    configName,
    configJson,
    desiredFolderId = null,
    existingConfigName = ""
  } = params || {};

  const teacherSpace = await getMyTeacherSpace();
  if (!teacherSpace) {
    throw new Error("Aucun espace enseignant trouvé.");
  }

  const normalizedAccessCode = normalizeAccessCode(accessCode);
  const displayConfigName = cleanDisplayName(configName);
  const normalizedConfigName = normalizeConfigName(configName);
  const normalizedExistingConfigName = normalizeConfigName(existingConfigName);
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
    throw new Error("Clé d’outil vide.");
  }

  if (!configJson || typeof configJson !== "object" || Array.isArray(configJson)) {
    throw new Error("Configuration absente.");
  }

  const safeConfigJson = sanitizeActivityConfigJson(configJson);
  if (!Array.isArray(safeConfigJson.sequence)) {
    throw new Error("La configuration doit contenir une séquence valide.");
  }

  let existingActivity = null;
  if (normalizedExistingConfigName) {
    existingActivity = await getMyActivityByName(teacherSpace.id, existingConfigName);
  }
  if (!existingActivity) {
    existingActivity = await getMyActivityByName(teacherSpace.id, displayConfigName);
  }

  if (
    existingActivity
    && String(existingActivity.config_name_normalized || "") !== String(normalizedConfigName)
  ) {
    const conflictingActivity = await getMyActivityByName(teacherSpace.id, displayConfigName);
    if (conflictingActivity && String(conflictingActivity.id) !== String(existingActivity.id)) {
      throw new Error("Une activité porte déjà ce nom.");
    }
  }

  let preservedDashboard = existingActivity?.config_json?.dashboard ?? null;
  const preservedActivityMode = normalizeActivityMode(
    existingActivity?.config_json?.activity_mode,
    DEFAULT_ACTIVITY_MODE
  );

  if (!preservedDashboard) {
    const [existingActivities, existingFolders] = await Promise.all([
      getMyActivitiesForSpace(teacherSpace.id),
      getMyActivityFoldersForSpace(teacherSpace.id)
    ]);

    const safeDesiredFolderId = existingFolders.some((folder) => String(folder.id) === String(desiredFolderId ?? ""))
      ? String(desiredFolderId)
      : null;
    const siblingActivities = existingActivities.filter((activity) => String(activity.folder_id ?? "") === String(safeDesiredFolderId ?? ""));
    const siblingFolders = existingFolders.filter((folder) => String(folder.parent_id ?? "") === String(safeDesiredFolderId ?? ""));
    const nextOrder = [...siblingActivities, ...siblingFolders]
      .reduce((maxOrder, item) => Math.max(maxOrder, Number(item.display_order) || 0), -1) + 1;

    preservedDashboard = {
      display_order: nextOrder,
      folder_id: safeDesiredFolderId,
      is_visible: true,
      is_highlighted: false
    };
  }

  const payload = {
    teacher_space_id: teacherSpace.id,
    module_key: cleanedModuleKey,
    config_name: displayConfigName,
    config_name_normalized: normalizedConfigName,
    config_json: mergePreservedActivityMeta(safeConfigJson, {
      dashboard: preservedDashboard,
      activity_mode: preservedActivityMode
    }),
    updated_at: new Date().toISOString()
  };

  const activityWriteQuery = existingActivity?.id
    ? supabase
      .from("activity_configs")
      .update(payload)
      .eq("id", existingActivity.id)
    : supabase
      .from("activity_configs")
      .insert(payload);

  const { data, error } = await activityWriteQuery
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
    activity: withActivityDashboardMeta({
      ...data,
      config_json: sanitizeActivityConfigJson(data.config_json)
    })
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
  return withActivityDashboardMeta({
    ...data,
    config_json: sanitizeActivityConfigJson(data.config_json)
  });
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

export async function setHighlightedActivityForTeacherSpace(teacherSpaceId, highlightedActivityId = null, activityMode = null) {
  const activities = await getMyActivitiesForSpace(teacherSpaceId);
  const targetId = highlightedActivityId == null ? null : String(highlightedActivityId);
  const targetActivity = targetId
    ? activities.find((activity) => String(activity.id) === targetId) || null
    : null;
  const targetMode = normalizeActivityMode(targetActivity?.activity_mode ?? activityMode, DEFAULT_ACTIVITY_MODE);

  if (!isStudentFacingActivityMode(targetMode)) {
    return null;
  }

  const updates = activities
    .filter((activity) => normalizeActivityMode(activity?.activity_mode, DEFAULT_ACTIVITY_MODE) === targetMode)
    .filter((activity) => {
      const shouldHighlight = targetId !== null
        && String(activity.id) === targetId
        && activity.is_visible !== false;
      return activity.is_highlighted !== shouldHighlight;
    })
    .map((activity) => updateActivityDashboardMeta(activity.id, {
      is_highlighted: targetId !== null
        && String(activity.id) === targetId
        && activity.is_visible !== false
    }));

  await Promise.all(updates);

  return targetId;
}

export async function listStudentsForClass(teacherClassId) {
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

export async function listStudentsForTeacherSpace(teacherSpaceId) {
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

const QUESTION_BANK_FIELDS = `
  id,
  teacher_space_id,
  source_bank_id,
  bank_type,
  title,
  title_normalized,
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

function normalizeQuestionBankRecord(record) {
  if (!record) return null;
  return {
    ...record,
    bank_type: normalizeQuestionBankType(record.bank_type),
    title: cleanDisplayName(record.title) || "Banque sans titre",
    description: String(record.description || ""),
    subject: String(record.subject || ""),
    grade_level: String(record.grade_level || ""),
    tags: normalizeQuestionBankTags(record.tags),
    is_system: record.is_system === true
  };
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

export async function listQuestionBanksForSpace(teacherSpaceId, { includeSystem = true } = {}) {
  const spaceId = Number(teacherSpaceId);
  if (!Number.isFinite(spaceId) || spaceId <= 0) return [];

  let query = supabase
    .from("question_banks")
    .select(QUESTION_BANK_FIELDS)
    .order("is_system", { ascending: true })
    .order("title", { ascending: true });

  if (includeSystem) {
    query = query.or(`teacher_space_id.eq.${spaceId},is_system.eq.true`);
  } else {
    query = query.eq("teacher_space_id", spaceId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizeQuestionBankRecord).filter(Boolean);
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

  const now = new Date().toISOString();
  const payload = {
    teacher_space_id: spaceId,
    bank_type: normalizeQuestionBankType(bank.bank_type),
    title,
    title_normalized: titleNormalized,
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
  return normalizeQuestionBankRecord(data);
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

  if ("description" in updates) payload.description = String(updates.description || "").trim();
  if ("subject" in updates) payload.subject = String(updates.subject || "").trim();
  if ("grade_level" in updates) payload.grade_level = String(updates.grade_level || "").trim();
  if ("tags" in updates) payload.tags = normalizeQuestionBankTags(updates.tags);
  if ("bank_type" in updates) payload.bank_type = normalizeQuestionBankType(updates.bank_type);
  if ("source_bank_id" in updates) payload.source_bank_id = String(updates.source_bank_id || "").trim() || null;
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

export async function copyQuestionBankToSpace(sourceBankId, teacherSpaceId, { title = "" } = {}) {
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
    description: sourceBank?.description || "",
    subject: sourceBank?.subject || "",
    grade_level: sourceBank?.grade_level || "",
    tags: sourceBank?.tags || []
  });

  const updatedBank = await updateQuestionBank(createdBank.id, { source_bank_id: sourceId }).catch(() => createdBank);

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
