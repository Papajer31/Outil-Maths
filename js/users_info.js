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
  return Array.isArray(data) ? data : [];
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
  return data ?? [];
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

/* =========================================================
   7) GESTION ÉLÈVES
   ========================================================= */

export async function listStudentsForClass(teacherClassId){
  const { data, error } = await supabase
    .from("students")
    .select("id, teacher_class_id, first_name, grade_level, display_order")
    .eq("teacher_class_id", teacherClassId)
    .order("display_order", { ascending: true });

  if (error) throw error;
  return data ?? [];
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