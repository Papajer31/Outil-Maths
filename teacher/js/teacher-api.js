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
  filterEffectivelyActivePedagogicalNodes,
  getCatalogActivities,
  getPedagogicalNodes,
  normalizeCatalogActivity,
  normalizePedagogicalNode,
  normalizeCatalogGradeLevel,
  PEDAGOGICAL_NODE_TYPES,
  sortCatalogActivities,
  sortPedagogicalNodes
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

function normalizeStudentCode(value) {
  const safe = String(value || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 3);
  return safe || null;
}

export function listPedagogicalNodes() {
  return getPedagogicalNodes();
}

async function queryPedagogicalNodes() {
  const pageSize = 1000;
  const rows = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("pedagogical_nodes")
      .select("id, parent_id, name, node_type, display_order, is_active, created_at, updated_at")
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

  return sortPedagogicalNodes(rows.map(normalizePedagogicalNode));
}

export async function listPedagogicalNodesForTeacher() {
  try {
    return filterEffectivelyActivePedagogicalNodes(await queryPedagogicalNodes());
  } catch (err) {
    console.warn("Arborescence pédagogique en base indisponible, utilisation du secours local.", err);
    return filterEffectivelyActivePedagogicalNodes(getPedagogicalNodes());
  }
}

export async function listPedagogicalNodesForAdmin() {
  try {
    return await queryPedagogicalNodes();
  } catch (err) {
    console.warn("Arborescence pédagogique Admin indisponible, utilisation du secours local.", err);
    return getPedagogicalNodes();
  }
}

export async function createPedagogicalNodeAsAdmin(folder = {}) {
  const id = String(folder.id || "").trim().toLowerCase();
  const name = cleanDisplayName(folder.name);
  const parentId = String(folder.parent_id || "").trim() || null;
  const nodeType = String(folder.node_type || "").trim();
  if (!id || !/^[a-z0-9][a-z0-9._-]{0,159}$/.test(id)) throw new Error("Identifiant de nœud invalide.");
  if (!name) throw new Error("Nom du nœud vide.");
  if (!PEDAGOGICAL_NODE_TYPES.includes(nodeType)) throw new Error("Type de nœud invalide.");
  if (nodeType === "grade_level" && !normalizeCatalogGradeLevel(name)) {
    throw new Error("Un dossier de niveau doit être nommé CP, CE1, CE2, CM1 ou CM2.");
  }
  const payload = {
    id,
    parent_id: parentId,
    name,
    node_type: nodeType,
    display_order: Math.max(0, Math.trunc(Number(folder.display_order) || 0)),
    is_active: folder.is_active !== false
  };
  const { data, error } = await supabase.from("pedagogical_nodes").insert(payload)
    .select("id, parent_id, name, node_type, display_order, is_active, created_at, updated_at")
    .single();
  if (error) throw error;
  return normalizePedagogicalNode(data);
}

export async function updatePedagogicalNodeAsAdmin(folderId, updates = {}) {
  const id = String(folderId || "").trim().toLowerCase();
  if (!id) throw new Error("Nœud pédagogique introuvable.");
  const payload = {};
  if ("name" in updates) {
    payload.name = cleanDisplayName(updates.name);
    const currentNode = (await queryPedagogicalNodes()).find((node) => node.id === id) || null;
    if (currentNode?.node_type === "grade_level" && !normalizeCatalogGradeLevel(payload.name)) {
      throw new Error("Un dossier de niveau doit être nommé CP, CE1, CE2, CM1 ou CM2.");
    }
  }
  if ("parent_id" in updates) payload.parent_id = String(updates.parent_id || "").trim() || null;
  if ("display_order" in updates) payload.display_order = Math.max(0, Math.trunc(Number(updates.display_order) || 0));
  if ("is_active" in updates) payload.is_active = updates.is_active !== false;
  if (!Object.keys(payload).length) return null;
  const { data, error } = await supabase.from("pedagogical_nodes").update(payload).eq("id", id)
    .select("id, parent_id, name, node_type, display_order, is_active, created_at, updated_at")
    .single();
  if (error) throw error;
  return normalizePedagogicalNode(data);
}

export async function deletePedagogicalNodeAsAdmin(folderId) {
  const id = String(folderId || "").trim().toLowerCase();
  if (!id) throw new Error("Nœud pédagogique introuvable.");
  const { error } = await supabase.from("pedagogical_nodes").delete().eq("id", id);
  if (error) throw error;
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
  } catch (err) {
    // Mode secours : utile hors Supabase ou avant application de la migration super-admin.
    console.warn("Catalogue système en base indisponible, utilisation du catalogue de secours.", err);
    return getCatalogActivities();
  }
}

export async function listCatalogActivitiesForTeacherSpace(teacherSpaceId) {
  const [catalogActivities, folders] = await Promise.all([
    listPublishedCatalogActivities(),
    listPedagogicalNodesForTeacher()
  ]);
  const activeFolderIds = new Set(folders.map((folder) => String(folder.id)));
  const availableActivities = catalogActivities.filter((activity) => activeFolderIds.has(String(activity.pedagogical_node_id || activity.folder_id || "")));
  const { data, error } = await supabase
    .from("catalog_activity_visibility")
    .select("catalog_activity_id, is_visible, updated_at")
    .eq("teacher_space_id", teacherSpaceId);

  if (error) throw error;
  return sortCatalogActivities(applyCatalogVisibility(availableActivities, Array.isArray(data) ? data : []));
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
    .select("id, pedagogical_node_id, tool_id, title, description, adventure_tier, display_order, status, default_visible, levels_json, created_at, updated_at")
    .neq("status", "archived")
    .order("pedagogical_node_id", { ascending: true })
    .order("adventure_tier", { ascending: true })
    .order("display_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) throw error;
  return sortCatalogActivities(Array.isArray(data) ? data.map(normalizeCatalogActivity) : []);
}


export async function listAdventureDefaultMenuSlots(gradeLevel) {
  const safeGrade = normalizeAdventureGradeLevel(gradeLevel);
  const { data, error } = await supabase
    .from("adventure_default_menu_slots")
    .select("grade_level, menu_number, day_number, slot_number, item_type, grade_folder_id, catalog_activity_id, created_at, updated_at")
    .eq("grade_level", safeGrade)
    .order("menu_number", { ascending: true })
    .order("day_number", { ascending: true })
    .order("slot_number", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data.map(normalizeAdventureMenuSlot) : [];
}

export async function saveAdventureDefaultMenuSlots(gradeLevel, items = []) {
  const safeGrade = normalizeAdventureGradeLevel(gradeLevel);
  const slots = (Array.isArray(items) ? items : [])
    .map((item) => normalizeAdventureMenuSlot({ ...item, grade_level: safeGrade }))
    .filter((item) => item.item_type === "objective" || item.item_type === "activity")
    .map((item) => ({
      menu_number: item.menu_number,
      day_number: item.day_number,
      slot_number: item.slot_number,
      item_type: item.item_type,
      grade_folder_id: item.item_type === "objective" ? item.grade_folder_id : null,
      catalog_activity_id: item.item_type === "activity" ? item.catalog_activity_id : null
    }));

  const { error } = await supabase.rpc("replace_adventure_default_menu", {
    p_grade_level: safeGrade,
    p_slots: slots
  });
  if (error) throw error;
  return listAdventureDefaultMenuSlots(safeGrade);
}

export async function listTeacherAdventureMenuSlots(teacherSpaceId, gradeLevel) {
  const safeTeacherSpaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const safeGrade = normalizeAdventureGradeLevel(gradeLevel);
  const { data, error } = await supabase
    .from("teacher_adventure_menu_slots")
    .select("teacher_space_id, grade_level, menu_number, day_number, slot_number, item_type, grade_folder_id, catalog_activity_id, created_at, updated_at")
    .eq("teacher_space_id", safeTeacherSpaceId)
    .eq("grade_level", safeGrade)
    .order("menu_number", { ascending: true })
    .order("day_number", { ascending: true })
    .order("slot_number", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data.map(normalizeAdventureMenuSlot) : [];
}

export async function saveTeacherAdventureMenuSlot(teacherSpaceId, item = {}) {
  const safeTeacherSpaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const normalized = normalizeAdventureMenuSlot({
    ...item,
    teacher_space_id: safeTeacherSpaceId
  });
  const payload = {
    teacher_space_id: safeTeacherSpaceId,
    grade_level: normalized.grade_level,
    menu_number: normalized.menu_number,
    day_number: normalized.day_number,
    slot_number: normalized.slot_number,
    item_type: normalized.item_type,
    grade_folder_id: normalized.item_type === "objective" ? normalized.grade_folder_id : null,
    catalog_activity_id: normalized.item_type === "activity" ? normalized.catalog_activity_id : null,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("teacher_adventure_menu_slots")
    .upsert(payload, {
      onConflict: "teacher_space_id,grade_level,menu_number,day_number,slot_number"
    })
    .select("teacher_space_id, grade_level, menu_number, day_number, slot_number, item_type, grade_folder_id, catalog_activity_id, created_at, updated_at")
    .single();

  if (error) throw error;
  return normalizeAdventureMenuSlot(data);
}

export async function deleteTeacherAdventureMenuSlot(teacherSpaceId, gradeLevel, menuNumber, dayNumber, slotNumber) {
  const safeTeacherSpaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const safeGrade = normalizeAdventureGradeLevel(gradeLevel);
  const { error } = await supabase
    .from("teacher_adventure_menu_slots")
    .delete()
    .eq("teacher_space_id", safeTeacherSpaceId)
    .eq("grade_level", safeGrade)
    .eq("menu_number", normalizeAdventureMenuNumber(menuNumber))
    .eq("day_number", normalizeAdventureDayNumber(dayNumber))
    .eq("slot_number", normalizeAdventureSlotNumber(slotNumber));
  if (error) throw error;
}

export async function deleteTeacherAdventureMenuSlotsForGrade(teacherSpaceId, gradeLevel) {
  const safeTeacherSpaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const safeGrade = normalizeAdventureGradeLevel(gradeLevel);
  const { error } = await supabase
    .from("teacher_adventure_menu_slots")
    .delete()
    .eq("teacher_space_id", safeTeacherSpaceId)
    .eq("grade_level", safeGrade);
  if (error) throw error;
}

export async function listAdventureClassCursors(teacherClassIds = [], gradeLevel) {
  const classIds = [...new Set((Array.isArray(teacherClassIds) ? teacherClassIds : [])
    .map((value) => Number(value))
    .filter((value) => Number.isSafeInteger(value) && value > 0))];
  if (!classIds.length) return [];

  const safeGrade = normalizeAdventureGradeLevel(gradeLevel);
  const { data, error } = await supabase
    .from("adventure_class_cursors")
    .select("teacher_class_id, grade_level, menu_number, day_number, is_enabled, created_at, updated_at")
    .in("teacher_class_id", classIds)
    .eq("grade_level", safeGrade)
    .order("teacher_class_id", { ascending: true });

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizeAdventureClassCursor);
}

export async function saveAdventureClassCursor(teacherClassId, gradeLevel, updates = {}) {
  const safeClassId = Number(teacherClassId);
  if (!Number.isSafeInteger(safeClassId) || safeClassId <= 0) {
    throw new Error("Classe Aventure invalide.");
  }

  const payload = {
    teacher_class_id: safeClassId,
    grade_level: normalizeAdventureGradeLevel(gradeLevel),
    menu_number: normalizeAdventureMenuNumber(updates?.menu_number),
    day_number: normalizeAdventureDayNumber(updates?.day_number),
    is_enabled: updates?.is_enabled === true,
    updated_at: new Date().toISOString()
  };

  const { data, error } = await supabase
    .from("adventure_class_cursors")
    .upsert(payload, { onConflict: "teacher_class_id,grade_level" })
    .select("teacher_class_id, grade_level, menu_number, day_number, is_enabled, created_at, updated_at")
    .single();

  if (error) throw error;
  return normalizeAdventureClassCursor(data);
}

function normalizeAdventureClassCursor(item = {}) {
  return {
    ...item,
    teacher_class_id: Number(item?.teacher_class_id) || null,
    grade_level: normalizeAdventureGradeLevel(item?.grade_level),
    menu_number: normalizeAdventureMenuNumber(item?.menu_number),
    day_number: normalizeAdventureDayNumber(item?.day_number),
    is_enabled: item?.is_enabled === true
  };
}

function normalizeAdventureMenuSlot(item = {}) {
  const itemType = ["objective", "activity", "empty"].includes(String(item?.item_type || "").trim())
    ? String(item.item_type).trim()
    : "empty";
  return {
    ...item,
    teacher_space_id: Number(item?.teacher_space_id) || null,
    grade_level: normalizeAdventureGradeLevel(item?.grade_level),
    menu_number: normalizeAdventureMenuNumber(item?.menu_number),
    day_number: normalizeAdventureDayNumber(item?.day_number),
    slot_number: normalizeAdventureSlotNumber(item?.slot_number),
    item_type: itemType,
    grade_folder_id: itemType === "objective" ? String(item?.grade_folder_id || "").trim() || null : null,
    catalog_activity_id: itemType === "activity" ? String(item?.catalog_activity_id || "").trim() || null : null
  };
}

function normalizeAdventureGradeLevel(value) {
  const grade = normalizeCatalogGradeLevel(value);
  if (!grade) throw new Error("Niveau Aventure invalide.");
  return grade;
}

function normalizeAdventureMenuNumber(value) {
  return Math.max(1, Math.min(34, Math.trunc(Number(value) || 1)));
}

function normalizeAdventureDayNumber(value) {
  return Math.max(1, Math.min(4, Math.trunc(Number(value) || 1)));
}

function normalizeAdventureSlotNumber(value) {
  return Math.max(1, Math.min(6, Math.trunc(Number(value) || 1)));
}

export async function listAdventureObjectivesForSpace(teacherSpaceId) {
  const safeTeacherSpaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const { data, error } = await supabase
    .from("teacher_adventure_objectives")
    .select("teacher_space_id, grade_folder_id, display_order, is_enabled, created_at, updated_at")
    .eq("teacher_space_id", safeTeacherSpaceId)
    .order("display_order", { ascending: true })
    .order("grade_folder_id", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data.map(normalizeTeacherAdventureObjective) : [];
}

export async function saveAdventureObjectivesForSpace(teacherSpaceId, items = []) {
  const safeTeacherSpaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const payload = (Array.isArray(items) ? items : []).map((item, index) => {
    const gradeFolderId = String(item?.grade_folder_id || "").trim();
    if (!gradeFolderId) return null;
    return {
      teacher_space_id: safeTeacherSpaceId,
      grade_folder_id: gradeFolderId,
      display_order: Math.max(0, Math.trunc(Number(item?.display_order) || index)),
      is_enabled: item?.is_enabled !== false,
      updated_at: new Date().toISOString()
    };
  }).filter(Boolean);

  if (!payload.length) return [];

  const { data, error } = await supabase
    .from("teacher_adventure_objectives")
    .upsert(payload, { onConflict: "teacher_space_id,grade_folder_id" })
    .select("teacher_space_id, grade_folder_id, display_order, is_enabled, created_at, updated_at");

  if (error) throw error;
  return Array.isArray(data) ? data.map(normalizeTeacherAdventureObjective) : [];
}

function normalizeTeacherAdventureObjective(item = {}) {
  const displayOrder = Number(item?.display_order);
  return {
    ...item,
    teacher_space_id: Number(item?.teacher_space_id) || null,
    grade_folder_id: String(item?.grade_folder_id || "").trim(),
    display_order: Number.isFinite(displayOrder) ? Math.max(0, Math.trunc(displayOrder)) : 0,
    is_enabled: item?.is_enabled !== false
  };
}

export async function saveCatalogActivityAsAdmin(activity = {}) {
  const id = String(activity.id || "").trim().toLowerCase();
  const title = cleanDisplayName(activity.title || activity.config_name);
  const categoryId = String(activity.pedagogical_node_id || activity.folder_id || "").trim();
  const toolId = String(activity.tool_id || "").trim();
  if (!id) throw new Error("Identifiant d’activité vide.");
  if (!/^[a-z0-9][a-z0-9._-]{1,160}$/.test(id)) {
    throw new Error("Identifiant invalide. Utilise minuscules, chiffres, points, tirets ou underscores.");
  }
  if (!title) throw new Error("Titre d’activité vide.");
  if (!categoryId) throw new Error("Adresse pédagogique obligatoire.");
  if (!toolId) throw new Error("Outil obligatoire.");

  const payload = {
    id,
    pedagogical_node_id: categoryId,
    tool_id: toolId,
    title,
    description: String(activity.description || "").trim(),
    adventure_tier: Math.max(1, Math.trunc(Number(activity.adventure_tier) || 1)),
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
    .select("id, pedagogical_node_id, tool_id, title, description, adventure_tier, display_order, status, default_visible, levels_json, created_at, updated_at")
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

export async function listDefaultVocabularyWordsAsAdmin() {
  const { data, error } = await supabase
    .from("vocabulary_default_words")
    .select("id, word, word_normalized, dictionary_page, created_at, updated_at")
    .order("word_normalized", { ascending: true })
    .order("word", { ascending: true });
  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

/* =========================
   QUIZ SUPABASE
   ========================= */

const QUIZ_FOLDER_FIELDS = "id, teacher_space_id, parent_id, name, display_order, is_system, created_at, updated_at";
const QUIZ_FIELDS = "id, teacher_space_id, folder_id, title, document, schema_version, display_order, is_system, created_at, updated_at";
const QUIZ_SUMMARY_FIELDS = "id, teacher_space_id, folder_id, title, schema_version, display_order, is_system, created_at, updated_at";
const RESOURCE_FOLDER_FIELDS = "id, teacher_space_id, parent_id, name, metadata, display_order, is_system, created_at, updated_at";
const RESOURCE_FIELDS = "id, teacher_space_id, folder_id, title, resource_type, storage_bucket, storage_path, mime_type, size_bytes, width, height, duration_seconds, alt_text, tags, metadata, display_order, is_system, created_at, updated_at";
const TEACHER_RESOURCE_BUCKET = "teacher-resources";
const SYSTEM_IMAGE_BUCKET = "images";

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

function hasForbiddenSystemQuizSource(document) {
  const forbiddenKinds = new Set([
    "local-upload",
    "local-recording",
    "local-file",
    "site-asset",
    "system",
    "asset",
    "blob"
  ]);
  let forbidden = false;
  const visit = (value) => {
    if (forbidden || !value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const kind = String(value.kind || "").trim().toLowerCase();
    if (forbiddenKinds.has(kind)) {
      forbidden = true;
      return;
    }
    Object.values(value).forEach(visit);
  };
  visit(document);
  return forbidden;
}

async function assertSystemQuizResourcesAreSystem(resourceIds) {
  const ids = Array.from(new Set((Array.isArray(resourceIds) ? resourceIds : []).map(normalizeUuid).filter(Boolean)));
  if (!ids.length) return;

  const { data, error } = await supabase
    .from("resources")
    .select("id, is_system")
    .in("id", ids);
  if (error) throw error;

  const rows = Array.isArray(data) ? data : [];
  const allowedIds = new Set(rows.filter((row) => row?.is_system === true).map((row) => normalizeUuid(row.id)).filter(Boolean));
  if (allowedIds.size !== ids.length || ids.some((id) => !allowedIds.has(id))) {
    throw new Error("Un quiz système ne peut utiliser que des ressources système.");
  }
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
  const isSystem = folder?.is_system === true;
  const spaceId = isSystem ? null : normalizePositiveTeacherSpaceId(teacherSpaceId);
  const name = cleanDisplayName(folder.name);
  if (!name) throw new Error("Nom de dossier vide.");

  const { data, error } = await supabase
    .from("quiz_folders")
    .insert({
      teacher_space_id: spaceId,
      parent_id: normalizeNullableUuid(folder.parent_id),
      name,
      display_order: Number.isFinite(Number(folder.display_order)) ? Number(folder.display_order) : 0,
      is_system: isSystem
    })
    .select(QUIZ_FOLDER_FIELDS)
    .single();

  if (error) throw error;
  return normalizeQuizFolderRecord(data);
}

export async function updateQuizFolder(folderId, updates = {}) {
  const id = normalizeUuid(folderId);
  if (!id) throw new Error("Dossier de quiz invalide.");
  const isSystem = updates?.is_system === true;

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
    .eq("is_system", isSystem)
    .select(QUIZ_FOLDER_FIELDS)
    .single();

  if (error) throw error;
  return normalizeQuizFolderRecord(data);
}

export async function deleteQuizFolder(folderId, options = {}) {
  const id = normalizeUuid(folderId);
  if (!id) throw new Error("Dossier de quiz invalide.");
  const { error } = await supabase
    .from("quiz_folders")
    .delete()
    .eq("id", id)
    .eq("is_system", options?.is_system === true);
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

// Le sélecteur de quiz n'a besoin que de l'arborescence. Éviter de transférer
// tous les documents (qui peuvent contenir des centaines de variantes).
export async function listQuizSummariesForSpace(teacherSpaceId) {
  const spaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const { data, error } = await supabase
    .from("quizzes")
    .select(QUIZ_SUMMARY_FIELDS)
    .or(`teacher_space_id.eq.${spaceId},is_system.eq.true`)
    .order("is_system", { ascending: true })
    .order("display_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizeQuizRecord);
}

export async function getQuizForSpace(teacherSpaceId, quizId) {
  const spaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const id = normalizeUuid(quizId);
  if (!id) throw new Error("Quiz invalide.");

  const { data, error } = await supabase
    .from("quizzes")
    .select(QUIZ_FIELDS)
    .eq("id", id)
    .or(`teacher_space_id.eq.${spaceId},is_system.eq.true`)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error("Quiz introuvable.");
  return normalizeQuizRecord(data);
}

export async function saveQuizForSpace(teacherSpaceId, quiz = {}) {
  const isSystem = quiz?.is_system === true;
  const spaceId = isSystem ? null : normalizePositiveTeacherSpaceId(teacherSpaceId);
  const title = cleanDisplayName(quiz.title) || "Quiz sans titre";
  const existingId = normalizeUuid(quiz.id);
  const now = new Date().toISOString();
  const schemaVersion = Math.max(1, Math.trunc(Number(quiz.version || quiz.schemaVersion || 1) || 1));
  const document = cloneJsonValue({
    ...quiz,
    version: schemaVersion,
    title,
    is_system: isSystem
  });
  const linkedResourceIds = collectQuizResourceIds(document);
  if (isSystem && hasForbiddenSystemQuizSource(document)) {
    throw new Error("Un quiz système ne peut pas utiliser de fichiers locaux au navigateur.");
  }
  if (isSystem) await assertSystemQuizResourcesAreSystem(linkedResourceIds);

  const payload = {
    teacher_space_id: spaceId,
    folder_id: normalizeNullableUuid(quiz.folder_id),
    title,
    document,
    schema_version: schemaVersion,
    display_order: Number.isFinite(Number(quiz.display_order)) ? Number(quiz.display_order) : 0,
    is_system: isSystem,
    updated_at: now
  };

  let query;
  if (existingId) {
    query = supabase
      .from("quizzes")
      .update(payload)
      .eq("id", existingId)
      .eq("is_system", isSystem);
    if (!isSystem) query = query.eq("teacher_space_id", spaceId);
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

export async function deleteQuiz(quizId, options = {}) {
  const id = normalizeUuid(quizId);
  if (!id) throw new Error("Quiz invalide.");
  const { error } = await supabase
    .from("quizzes")
    .delete()
    .eq("id", id)
    .eq("is_system", options?.is_system === true);
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
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? cloneJsonValue(row.metadata)
      : {},
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
      metadata: folder.metadata && typeof folder.metadata === "object" && !Array.isArray(folder.metadata)
        ? cloneJsonValue(folder.metadata)
        : {},
      display_order: Number.isFinite(Number(folder.display_order)) ? Number(folder.display_order) : 0,
      is_system: false
    })
    .select(RESOURCE_FOLDER_FIELDS)
    .single();
  if (error) throw error;
  return normalizeResourceFolderRecord(data);
}

export async function createSystemResourceFolderAsAdmin(folder = {}) {
  const name = cleanDisplayName(folder.name);
  if (!name) throw new Error("Nom de dossier vide.");
  const metadata = folder.metadata && typeof folder.metadata === "object" && !Array.isArray(folder.metadata)
    ? cloneJsonValue(folder.metadata)
    : {};
  const { data, error } = await supabase
    .from("resource_folders")
    .insert({
      teacher_space_id: null,
      parent_id: normalizeNullableUuid(folder.parent_id),
      name,
      metadata: { ...metadata, resource_type:"image" },
      display_order: Number.isFinite(Number(folder.display_order)) ? Number(folder.display_order) : 0,
      is_system: true
    })
    .select(RESOURCE_FOLDER_FIELDS)
    .single();
  if (error) throw error;
  return normalizeResourceFolderRecord(data);
}

export async function ensureRecordingsResourceFolderForSpace(teacherSpaceId) {
  const spaceId = normalizePositiveTeacherSpaceId(teacherSpaceId);
  const findExisting = async () => {
    const { data, error } = await supabase
      .from("resource_folders")
      .select(RESOURCE_FOLDER_FIELDS)
      .eq("teacher_space_id", spaceId)
      .eq("is_system", false)
      .contains("metadata", { system_role: "recordings" })
      .limit(1);
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    return row ? normalizeResourceFolderRecord(row) : null;
  };

  const existing = await findExisting();
  if (existing) return existing;

  const folders = await listResourceFoldersForSpace(spaceId);
  const rootFolders = folders.filter((folder) => folder?.is_system !== true && !folder?.parent_id);
  try {
    return await createResourceFolderForSpace(spaceId, {
      name: "Enregistrements",
      parent_id: null,
      display_order: rootFolders.length,
      metadata: { system_role: "recordings" }
    });
  } catch (error) {
    if (String(error?.code || "") !== "23505") throw error;
    const concurrent = await findExisting();
    if (concurrent) return concurrent;
    throw error;
  }
}

export async function updateResourceFolder(folderId, updates = {}, options = {}) {
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
  if ("metadata" in updates) {
    payload.metadata = updates.metadata && typeof updates.metadata === "object" && !Array.isArray(updates.metadata)
      ? cloneJsonValue(updates.metadata)
      : {};
  }
  const isSystem = options?.is_system === true;
  const { data, error } = await supabase
    .from("resource_folders")
    .update(payload)
    .eq("id", id)
    .eq("is_system", isSystem)
    .select(RESOURCE_FOLDER_FIELDS)
    .single();
  if (error) throw error;
  return normalizeResourceFolderRecord(data);
}

export async function deleteResourceFolder(folderId, options = {}) {
  const id = normalizeUuid(folderId);
  if (!id) throw new Error("Dossier de ressources invalide.");
  const { error } = await supabase
    .from("resource_folders")
    .delete()
    .eq("id", id)
    .eq("is_system", options?.is_system === true);
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

export async function updateResource(resourceId, updates = {}, options = {}) {
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

  const isSystem = options?.is_system === true;

  if (!Object.keys(payload).length) {
    const { data, error } = await supabase
      .from("resources")
      .select(RESOURCE_FIELDS)
      .eq("id", id)
      .eq("is_system", isSystem)
      .single();
    if (error) throw error;
    return normalizeResourceRecord(data);
  }

  const { data, error } = await supabase
    .from("resources")
    .update(payload)
    .eq("id", id)
    .eq("is_system", isSystem)
    .select(RESOURCE_FIELDS)
    .single();
  if (error) throw error;
  return normalizeResourceRecord(data);
}

export async function createResourceSignedUrl(resource, expiresInSeconds = 3600) {
  const bucket = String(resource?.storage_bucket || TEACHER_RESOURCE_BUCKET).trim();
  const path = String(resource?.storage_path || resource?.path || "").trim();
  if (!path) return "";
  if (bucket === SYSTEM_IMAGE_BUCKET) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return String(data?.publicUrl || "");
  }
  const expiresIn = Math.max(60, Math.min(86400, Math.trunc(Number(expiresInSeconds) || 3600)));
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) throw error;
  return String(data?.signedUrl || "");
}

export async function deleteResource(resourceId, options = {}) {
  const id = normalizeUuid(resourceId);
  if (!id) throw new Error("Ressource invalide.");

  if (options?.is_system === true) {
    const { data, error } = await supabase.rpc("delete_system_image_asset_as_admin", {
      p_resource_id: id
    });
    if (error) throw error;

    const bucket = String(data?.storage_bucket || SYSTEM_IMAGE_BUCKET).trim() || SYSTEM_IMAGE_BUCKET;
    const path = String(data?.storage_path || "").trim();
    if (path) {
      const { error: storageError } = await supabase.storage.from(bucket).remove([path]);
      if (storageError) {
        console.warn("L’image a été supprimée de la base, mais son fichier Storage n’a pas pu être effacé.", storageError);
      }
    }
    return data && typeof data === "object" ? data : {};
  }

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
  return resource;
}

export async function syncPhonologyWordsAsAdmin(words, {
  deactivateMissing = true,
  replaceAll = false
} = {}) {
  // Préflight volontaire : une ancienne fonction RPC accepterait le JSON
  // enrichi mais pourrait ignorer silencieusement les nouveaux champs. On
  // refuse donc la synchronisation tant que le schéma prefix + syllables + familiarity
  // n’est pas présent (migration 29).
  const { error: phonologySchemaError } = await supabase
    .from("phonology_words")
    .select("prefix, syllables, familiarity")
    .limit(1);
  if (phonologySchemaError) throw phonologySchemaError;

  const payload = (Array.isArray(words) ? words : []).map((row) => ({
    slug: String(row?.slug || "").trim().toLocaleLowerCase("fr-FR"),
    word: String(row?.word || "").trim(),
    prefix: String(row?.prefix || "").trim(),
    units: Array.isArray(row?.units) ? row.units.map((unit) => ({
      graph: String(unit?.graph || "").trim(),
      text: String(unit?.text || "").trim(),
      isSilent: unit?.isSilent === true
    })) : [],
    syllables: Array.isArray(row?.syllables)
      ? row.syllables.map((syllable) => String(syllable || "").trim()).filter(Boolean)
      : [],
    familiarity: Number.isFinite(Number(row?.familiarity))
      ? Math.max(0, Math.min(100, Math.round(Number(row.familiarity))))
      : 50,
    is_active: true
  }));

  const rpcName = replaceAll === true
    ? "replace_phonology_words_as_admin"
    : "sync_phonology_words_as_admin";
  const rpcArgs = replaceAll === true
    ? { p_words: payload }
    : {
        p_words: payload,
        p_deactivate_missing: deactivateMissing === true
      };

  const { data, error } = await supabase.rpc(rpcName, rpcArgs);
  if (error) throw error;
  return data && typeof data === "object" ? data : {};
}

function normalizeImageAssetRecord(row = {}) {
  return {
    slug: String(row.slug || "").trim().toLowerCase(),
    resource_id: row.resource_id ? String(row.resource_id) : null,
    storage_path: String(row.storage_path || "").trim(),
    tags: Array.isArray(row.tags) ? row.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
    notes: String(row.notes || "").trim(),
    metadata: row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? cloneJsonValue(row.metadata)
      : {},
    is_active: row.is_active !== false,
    created_at: String(row.created_at || ""),
    updated_at: String(row.updated_at || row.created_at || "")
  };
}

export async function listImageAssetsAsAdmin() {
  const { data, error } = await supabase
    .from("image_assets")
    .select("slug, resource_id, storage_path, tags, notes, metadata, is_active, created_at, updated_at")
    .order("slug", { ascending: true });
  if (error) throw error;
  return (Array.isArray(data) ? data : []).map(normalizeImageAssetRecord);
}

function isDuplicateStorageObjectError(error) {
  const code = String(error?.code || error?.statusCode || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  return code === "409" || code === "duplicate" || message.includes("duplicate") || message.includes("already exists");
}

export async function importSystemImageAssetAsAdmin(file, asset = {}) {
  if (!(file instanceof Blob)) throw new Error("Fichier image invalide.");
  const slug = String(asset.slug || "").trim().toLowerCase();
  const storagePath = String(asset.storage_path || "").trim();
  const mimeType = String(file.type || asset?.metadata?.mime_type || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,119}$/.test(slug)) throw new Error("Identifiant d’image invalide.");
  if (!storagePath.startsWith(`bank/${slug}/`)) throw new Error("Chemin Storage invalide.");
  if (!mimeType.startsWith("image/")) throw new Error("Le fichier sélectionné n’est pas une image.");

  let uploadedNewObject = false;
  const { error: uploadError } = await supabase.storage
    .from(SYSTEM_IMAGE_BUCKET)
    .upload(storagePath, file, {
      contentType: mimeType,
      cacheControl: "31536000",
      upsert: false
    });
  if (uploadError && !isDuplicateStorageObjectError(uploadError)) throw uploadError;
  uploadedNewObject = !uploadError;

  const tags = Array.isArray(asset.tags) ? asset.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [];
  const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata)
    ? cloneJsonValue(asset.metadata)
    : {};
  const { data, error } = await supabase.rpc("upsert_system_image_asset_as_admin", {
    p_slug: slug,
    p_storage_path: storagePath,
    p_tags: tags,
    p_notes: String(asset.notes || "").trim(),
    p_metadata: metadata,
    p_folder_path: String(asset.folder_path || "").trim()
  });

  if (error) {
    if (uploadedNewObject) {
      await supabase.storage.from(SYSTEM_IMAGE_BUCKET).remove([storagePath]).catch(() => {});
    }
    throw error;
  }

  const previousStoragePath = String(asset.previous_storage_path || "").trim();
  if (previousStoragePath && previousStoragePath !== storagePath && previousStoragePath.startsWith("bank/")) {
    const { error: cleanupError } = await supabase.storage.from(SYSTEM_IMAGE_BUCKET).remove([previousStoragePath]);
    if (cleanupError) console.warn("L’image a été remplacée, mais l’ancienne version Storage n’a pas pu être supprimée.", cleanupError);
  }

  return normalizeImageAssetRecord(data);
}

