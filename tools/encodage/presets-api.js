import { supabase } from "../../shared/supabase-client.js";

const DEFAULT_TOOL_KEY = "encodage";

function normalizeSpaceId(teacherSpaceId) {
  const spaceId = Number(teacherSpaceId);
  return Number.isFinite(spaceId) && spaceId > 0 ? spaceId : 0;
}

function normalizeToolKey(toolKey) {
  return String(toolKey || DEFAULT_TOOL_KEY).trim().toLowerCase() || DEFAULT_TOOL_KEY;
}

export async function listTeacherPhonologyPresets(teacherSpaceId, { toolKey = DEFAULT_TOOL_KEY } = {}) {
  const spaceId = normalizeSpaceId(teacherSpaceId);
  if (!spaceId) return [];

  const { data, error } = await supabase
    .from("teacher_phonology_presets")
    .select("id, teacher_space_id, tool_key, name, graph_order, created_at, updated_at")
    .eq("teacher_space_id", spaceId)
    .eq("tool_key", normalizeToolKey(toolKey))
    .order("name", { ascending: true });

  if (error) throw error;
  return Array.isArray(data) ? data : [];
}

export async function upsertTeacherPhonologyPreset(teacherSpaceId, preset = {}, { toolKey = DEFAULT_TOOL_KEY } = {}) {
  const spaceId = normalizeSpaceId(teacherSpaceId);
  if (!spaceId) {
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
      tool_key: normalizeToolKey(toolKey),
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

export async function deleteTeacherPhonologyPreset(teacherSpaceId, presetId, { toolKey = DEFAULT_TOOL_KEY } = {}) {
  const spaceId = normalizeSpaceId(teacherSpaceId);
  if (!spaceId) {
    throw new Error("Espace enseignant invalide.");
  }

  const id = String(presetId || "").trim();
  if (!id) return await listTeacherPhonologyPresets(spaceId, { toolKey });

  const { error } = await supabase
    .from("teacher_phonology_presets")
    .delete()
    .eq("id", id)
    .eq("teacher_space_id", spaceId)
    .eq("tool_key", normalizeToolKey(toolKey));

  if (error) throw error;
  return await listTeacherPhonologyPresets(spaceId, { toolKey });
}
