import { supabase } from "../../shared/supabase-client.js";

const TABLE_NAME = "teacher_conjugation_lists";
const ACTIVITY_TABLE_NAME = "activity_configs";
const FOLDER_TABLE_NAME = "activity_folders";

function normalizeSpaceId(teacherSpaceId) {
  const spaceId = Number(teacherSpaceId);
  return Number.isFinite(spaceId) && spaceId > 0 ? spaceId : 0;
}

function normalizeListId(value = "") {
  return String(value || "").trim();
}

function normalizeListName(value = "") {
  return String(value || "").trim().replace(/\s+/gu, " ").slice(0, 120);
}

function normalizeListNameKey(value = "") {
  return normalizeListName(value)
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^a-z0-9]+/giu, "")
    .slice(0, 140);
}

function parseInfinitives(rawText = "") {
  return String(rawText ?? "")
    .split(/[\n,;]+/gu)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, list) => list.findIndex((other) => other.toLocaleLowerCase("fr-FR") === item.toLocaleLowerCase("fr-FR")) === index);
}

function normalizeVerbsJson(value = {}) {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const infinitives = Array.isArray(raw.infinitives)
    ? raw.infinitives
    : Array.isArray(value)
      ? value
      : [];

  return {
    infinitives: parseInfinitives(infinitives.join("\n"))
  };
}

export function normalizeConjugationListRecord(record = {}) {
  if (!record) return null;
  const verbsJson = normalizeVerbsJson(record.verbs_json ?? record.verbsJson ?? {});
  return {
    id: normalizeListId(record.id),
    teacher_space_id: Number(record.teacher_space_id) || null,
    name: normalizeListName(record.name) || "Liste sans nom",
    normalized_name: String(record.normalized_name || "").trim(),
    verbs_json: verbsJson,
    infinitives: verbsJson.infinitives,
    verbsText: verbsJson.infinitives.join("\n"),
    created_at: record.created_at || null,
    updated_at: record.updated_at || null
  };
}

export async function listTeacherConjugationLists(teacherSpaceId) {
  const spaceId = normalizeSpaceId(teacherSpaceId);
  if (!spaceId) return [];

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select("id, teacher_space_id, name, normalized_name, verbs_json, created_at, updated_at")
    .eq("teacher_space_id", spaceId)
    .order("name", { ascending: true });

  if (error) throw error;
  return (Array.isArray(data) ? data : [])
    .map((row) => normalizeConjugationListRecord(row))
    .filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
}

export async function createTeacherConjugationList(teacherSpaceId, { name, verbsText = "" } = {}) {
  const spaceId = normalizeSpaceId(teacherSpaceId);
  if (!spaceId) throw new Error("Espace enseignant invalide.");

  const safeName = normalizeListName(name);
  if (!safeName) throw new Error("Nom de liste vide.");

  const infinitives = parseInfinitives(verbsText);
  if (!infinitives.length) throw new Error("La liste ne contient aucun verbe.");

  const id = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert({
      id,
      teacher_space_id: spaceId,
      name: safeName,
      normalized_name: normalizeListNameKey(safeName),
      verbs_json: { infinitives },
      created_at: now,
      updated_at: now
    })
    .select("id, teacher_space_id, name, normalized_name, verbs_json, created_at, updated_at")
    .single();

  if (error) throw error;
  return normalizeConjugationListRecord(data);
}

export async function renameTeacherConjugationList(teacherSpaceId, listId, name) {
  const spaceId = normalizeSpaceId(teacherSpaceId);
  const id = normalizeListId(listId);
  if (!spaceId || !id) throw new Error("Liste personnelle introuvable.");

  const safeName = normalizeListName(name);
  if (!safeName) throw new Error("Nom de liste vide.");

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({
      name: safeName,
      normalized_name: normalizeListNameKey(safeName),
      updated_at: new Date().toISOString()
    })
    .eq("teacher_space_id", spaceId)
    .eq("id", id)
    .select("id, teacher_space_id, name, normalized_name, verbs_json, created_at, updated_at")
    .single();

  if (error) throw error;
  return normalizeConjugationListRecord(data);
}

export async function updateTeacherConjugationList(teacherSpaceId, listId, { verbsText = "" } = {}) {
  const spaceId = normalizeSpaceId(teacherSpaceId);
  const id = normalizeListId(listId);
  if (!spaceId || !id) throw new Error("Liste personnelle introuvable.");

  const infinitives = parseInfinitives(verbsText);
  if (!infinitives.length) throw new Error("La liste ne contient aucun verbe.");

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .update({
      verbs_json: { infinitives },
      updated_at: new Date().toISOString()
    })
    .eq("teacher_space_id", spaceId)
    .eq("id", id)
    .select("id, teacher_space_id, name, normalized_name, verbs_json, created_at, updated_at")
    .single();

  if (error) throw error;
  return normalizeConjugationListRecord(data);
}

export async function deleteTeacherConjugationList(teacherSpaceId, listId) {
  const spaceId = normalizeSpaceId(teacherSpaceId);
  const id = normalizeListId(listId);
  if (!spaceId || !id) throw new Error("Liste personnelle introuvable.");

  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .eq("teacher_space_id", spaceId)
    .eq("id", id);

  if (error) throw error;
}

export async function listTeacherConjugationListUsages(teacherSpaceId, listId) {
  const spaceId = normalizeSpaceId(teacherSpaceId);
  const id = normalizeListId(listId);
  if (!spaceId || !id) return [];

  const [{ data: activityRows, error: activityError }, { data: folderRows, error: folderError }] = await Promise.all([
    supabase
      .from(ACTIVITY_TABLE_NAME)
      .select("id, config_name, config_json")
      .eq("teacher_space_id", spaceId),
    supabase
      .from(FOLDER_TABLE_NAME)
      .select("id, parent_id, name")
      .eq("teacher_space_id", spaceId)
  ]);

  if (activityError) throw activityError;
  if (folderError) throw folderError;

  const folders = Array.isArray(folderRows) ? folderRows : [];
  const folderById = new Map(folders.map((folder) => [String(folder.id), folder]));
  const activities = Array.isArray(activityRows) ? activityRows : [];

  return activities
    .filter((activity) => activityUsesPersonalConjugationList(activity?.config_json, id))
    .map((activity) => ({
      id: String(activity.id || ""),
      name: String(activity.config_name || "Activité sans nom").trim() || "Activité sans nom",
      path: buildFolderPath(activity?.config_json?.dashboard?.folder_id, folderById)
    }));
}

function activityUsesPersonalConjugationList(configJson = {}, listId = "") {
  const sequence = Array.isArray(configJson?.sequence) ? configJson.sequence : [];
  return sequence.some((item) => {
    if (String(item?.toolId || item?.tool_id || "") !== "conjugaison") return false;
    const settings = item?.draft?.settings && typeof item.draft.settings === "object"
      ? item.draft.settings
      : {};
    return String(settings.sourceMode || settings.source_mode || "") === "personal"
      && String(settings.personalListId || settings.personal_list_id || "") === listId;
  });
}

function buildFolderPath(folderId, folderById) {
  const parts = [];
  const seen = new Set();
  let currentId = String(folderId ?? "").trim();

  while (currentId && folderById.has(currentId) && !seen.has(currentId)) {
    seen.add(currentId);
    const folder = folderById.get(currentId);
    const name = String(folder?.name || "").trim();
    if (name) parts.push(name);
    currentId = String(folder?.parent_id ?? "").trim();
  }

  return parts.reverse().join(" > ");
}
