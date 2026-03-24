const { createClient } = window.supabase;

const SUPABASE_URL = "https://ilxepsjltauzpgcyqyuk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_2lIxmTvda0lzOe3eLj7qJg_wqkxxnmR";

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

export function normalizeClassCode(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "");
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
   3) ESPACES DE CLASSE
   ========================================================= */

export async function classCodeExists(classCode) {
  const code = normalizeClassCode(classCode);
  if (!code) return false;

  const { data, error } = await supabase.rpc("class_code_exists", {
    p_class_code: code,
  });

  if (error) throw error;
  return Boolean(data);
}

export async function getMyClassSpaces() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Aucun utilisateur connecté.");
  }

  const { data, error } = await supabase
    .from("class_spaces")
    .select("id, owner_user_id, class_code, title, created_at, updated_at, last_opened_at")
    .order("class_code", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getMyClassSpaceByCode(classCode) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Aucun utilisateur connecté.");
  }

  const code = normalizeClassCode(classCode);
  if (!code) return null;

  const { data, error } = await supabase
    .from("class_spaces")
    .select("id, owner_user_id, class_code, title, created_at, updated_at, last_opened_at")
    .eq("class_code", code)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function createClassSpace(classCode, options = {}) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Aucun utilisateur connecté.");
  }

  const code = normalizeClassCode(classCode);
  if (!code) {
    throw new Error("Code classe vide.");
  }

  const title = cleanDisplayName(options.title || "");
  const now = new Date().toISOString();

  const payload = {
    owner_user_id: user.id,
    class_code: code,
    title: title || null,
    updated_at: now,
    last_opened_at: now,
  };

  const { data, error } = await supabase
    .from("class_spaces")
    .insert(payload)
    .select("id, owner_user_id, class_code, title, created_at, updated_at, last_opened_at")
    .single();

  if (error) throw error;
  return data;
}

export async function createOrGetMyClassSpace(classCode, options = {}) {
  const code = normalizeClassCode(classCode);
  if (!code) {
    throw new Error("Code classe vide.");
  }

  const existing = await getMyClassSpaceByCode(code);
  if (existing) return existing;

  return await createClassSpace(code, options);
}

export async function updateMyClassSpace(classSpaceId, updates = {}) {
  const payload = {
    updated_at: new Date().toISOString(),
  };

  if ("title" in updates) {
    payload.title = cleanDisplayName(updates.title || "") || null;
  }

  const { data, error } = await supabase
    .from("class_spaces")
    .update(payload)
    .eq("id", classSpaceId)
    .select("id, owner_user_id, class_code, title, created_at, updated_at, last_opened_at")
    .single();

  if (error) throw error;
  return data;
}

export async function markClassSpaceAsOpened(classSpaceId) {
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("class_spaces")
    .update({
      last_opened_at: now,
    })
    .eq("id", classSpaceId)
    .select("id, owner_user_id, class_code, title, created_at, updated_at, last_opened_at")
    .single();

  if (error) throw error;
  return data;
}

export async function deleteMyClassSpace(classSpaceId) {
  const { error: configsError } = await supabase
    .from("activity_configs")
    .delete()
    .eq("class_space_id", classSpaceId);

  if (configsError) throw configsError;

  const { error } = await supabase
    .from("class_spaces")
    .delete()
    .eq("id", classSpaceId);

  if (error) throw error;
}

/* =========================================================
   4) LECTURE PUBLIQUE DES ACTIVITÉS
   ========================================================= */

export async function listPublicActivitiesForClass(classCode) {
  const code = normalizeClassCode(classCode);
  if (!code) return [];

  const { data, error } = await supabase.rpc("get_class_activities", {
    p_class_code: code,
  });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function loadPublicActivityConfig(classCode, configName) {
  const code = normalizeClassCode(classCode);
  const normalizedConfigName = normalizeConfigName(configName);

  if (!code || !normalizedConfigName) return null;

  const { data, error } = await supabase.rpc("get_activity_config", {
    p_class_code: code,
    p_config_name: normalizedConfigName,
  });

  if (error) throw error;
  if (!data) return null;

  const rawConfig = data?.config_json ?? data;
  const rawModuleKey = data?.module_key ?? "maths";

  return {
    class_code: code,
    config_name: cleanDisplayName(configName),
    config_name_normalized: normalizedConfigName,
    module_key: cleanDisplayName(rawModuleKey) || "maths",
    config_json: rawConfig,
  };
}

/* =========================================================
   5) GESTION PRIVÉE DES ACTIVITÉS
   ========================================================= */

export async function getMyActivitiesForClass(classSpaceId) {
  const { data, error } = await supabase
    .from("activity_configs")
    .select(`
      id,
      class_space_id,
      module_key,
      config_name,
      config_name_normalized,
      config_json,
      created_at,
      updated_at
    `)
    .eq("class_space_id", classSpaceId)
    .order("config_name", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function getMyActivityByName(classSpaceId, configName) {
  const normalizedConfigName = normalizeConfigName(configName);
  if (!normalizedConfigName) return null;

  const { data, error } = await supabase
    .from("activity_configs")
    .select(`
      id,
      class_space_id,
      module_key,
      config_name,
      config_name_normalized,
      config_json,
      created_at,
      updated_at
    `)
    .eq("class_space_id", classSpaceId)
    .eq("config_name_normalized", normalizedConfigName)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

export async function saveActivityConfig(params) {
  const {
    classCode,
    moduleKey,
    configName,
    configJson,
    classTitle = "",
  } = params || {};

  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Aucun utilisateur connecté.");
  }

  const normalizedClassCode = normalizeClassCode(classCode);
  const displayConfigName = cleanDisplayName(configName);
  const normalizedConfigName = normalizeConfigName(configName);
  const cleanedModuleKey = cleanDisplayName(moduleKey);

  if (!normalizedClassCode) {
    throw new Error("Code classe vide.");
  }

  if (!displayConfigName) {
    throw new Error("Nom de configuration vide.");
  }

  if (!normalizedConfigName) {
    throw new Error("Nom de configuration invalide.");
  }

  if (!cleanedModuleKey) {
    throw new Error("Clé module vide.");
  }

  if (configJson === undefined) {
    throw new Error("Configuration absente.");
  }

  const classSpace = await createOrGetMyClassSpace(normalizedClassCode, {
    title: classTitle,
  });

  const payload = {
    class_space_id: classSpace.id,
    module_key: cleanedModuleKey,
    config_name: displayConfigName,
    config_name_normalized: normalizedConfigName,
    config_json: configJson,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("activity_configs")
    .upsert(payload, {
      onConflict: "class_space_id,config_name_normalized",
    })
    .select(`
      id,
      class_space_id,
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
    class_space: classSpace,
    activity: data,
  };
}

export async function deleteMyActivity(classSpaceId, configName) {
  const normalizedConfigName = normalizeConfigName(configName);
  if (!normalizedConfigName) {
    throw new Error("Nom de configuration vide.");
  }

  const { error } = await supabase
    .from("activity_configs")
    .delete()
    .eq("class_space_id", classSpaceId)
    .eq("config_name_normalized", normalizedConfigName);

  if (error) throw error;
}

/* =========================================================
   6) COPIE / IMPORT D’UNE ACTIVITÉ PUBLIQUE
   ========================================================= */

export async function importPublicActivityToMyClass(params) {
  const {
    sourceClassCode,
    sourceConfigName,
    targetClassCode,
    targetConfigName,
    targetModuleKey,
    targetClassTitle = "",
  } = params || {};

  const loaded = await loadPublicActivityConfig(sourceClassCode, sourceConfigName);
  if (!loaded) {
    throw new Error("Activité source introuvable.");
  }

  const sourceModuleKey =
    cleanDisplayName(targetModuleKey || "") ||
    cleanDisplayName(loaded.module_key || "") ||
    cleanDisplayName(loaded.config_json?.module_key || "") ||
    "maths";

  return await saveActivityConfig({
    classCode: targetClassCode,
    moduleKey: sourceModuleKey,
    configName: targetConfigName || sourceConfigName,
    configJson: loaded.config_json,
    classTitle: targetClassTitle,
  });
}