const RESOURCE_LOCAL_STORAGE_KEY = "site-outils.teacher-resources.v1";
const RESOURCE_LOCAL_STORAGE_VERSION = 1;

let fallbackState = {
  version: RESOURCE_LOCAL_STORAGE_VERSION,
  folders: [],
  resources: []
};

function cloneValue(value){
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}

function createLocalId(prefix){
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeId(value){
  const safe = String(value ?? "").trim();
  return safe || null;
}

function normalizeFolder(source = {}, index = 0){
  const now = new Date().toISOString();
  return {
    id: String(source.id || createLocalId("resource-folder")),
    name: String(source.name || "Dossier sans nom").trim() || "Dossier sans nom",
    parent_id: normalizeId(source.parent_id),
    display_order: Number.isFinite(Number(source.display_order)) ? Number(source.display_order) : index,
    created_at: String(source.created_at || now),
    updated_at: String(source.updated_at || now)
  };
}

function normalizeResource(source = {}, index = 0){
  const now = new Date().toISOString();
  const type = String(source.type || "image").trim().toLowerCase() === "audio" ? "audio" : "image";
  return {
    id: String(source.id || createLocalId("resource")),
    title: String(source.title || source.name || "Ressource sans nom").trim() || "Ressource sans nom",
    folder_id: normalizeId(source.folder_id),
    type,
    source: source.source && typeof source.source === "object" ? cloneValue(source.source) : null,
    mime_type: String(source.mime_type || source.mimeType || "").trim(),
    size_bytes: Math.max(0, Number(source.size_bytes ?? source.size) || 0),
    width: Math.max(0, Number(source.width) || 0),
    height: Math.max(0, Number(source.height) || 0),
    duration: Math.max(0, Number(source.duration) || 0),
    tags: Array.isArray(source.tags) ? source.tags.map((tag) => String(tag || "").trim()).filter(Boolean) : [],
    display_order: Number.isFinite(Number(source.display_order)) ? Number(source.display_order) : index,
    created_at: String(source.created_at || now),
    updated_at: String(source.updated_at || now)
  };
}

function normalizeState(source = {}){
  return {
    version: RESOURCE_LOCAL_STORAGE_VERSION,
    folders: Array.isArray(source.folders) ? source.folders.map(normalizeFolder) : [],
    resources: Array.isArray(source.resources) ? source.resources.map(normalizeResource) : []
  };
}

function getStorage(){
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

export function loadResourceLocalState(){
  const storage = getStorage();
  if (!storage) return cloneValue(fallbackState);
  try {
    const raw = storage.getItem(RESOURCE_LOCAL_STORAGE_KEY);
    if (!raw) return cloneValue(fallbackState);
    fallbackState = normalizeState(JSON.parse(raw));
  } catch (error) {
    console.warn("Impossible de lire les ressources locales.", error);
  }
  return cloneValue(fallbackState);
}

export function saveResourceLocalState(source = {}){
  const next = normalizeState(source);
  fallbackState = cloneValue(next);
  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(RESOURCE_LOCAL_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn("Impossible d’enregistrer les ressources locales.", error);
      throw new Error("Le stockage local du navigateur est indisponible.");
    }
  }
  globalThis.dispatchEvent?.(new CustomEvent("resource-local-store-changed", { detail: cloneValue(next) }));
  return cloneValue(next);
}

export function upsertResourceFolderLocal(source = {}){
  const state = loadResourceLocalState();
  const existingIndex = state.folders.findIndex((folder) => String(folder.id) === String(source.id || ""));
  const existing = existingIndex >= 0 ? state.folders[existingIndex] : null;
  const now = new Date().toISOString();
  const nextFolder = normalizeFolder({
    ...existing,
    ...source,
    id: source.id || existing?.id || createLocalId("resource-folder"),
    created_at: existing?.created_at || source.created_at || now,
    updated_at: now,
    display_order: existing?.display_order ?? source.display_order ?? state.folders.length
  }, existingIndex >= 0 ? existingIndex : state.folders.length);

  if (existingIndex >= 0) state.folders.splice(existingIndex, 1, nextFolder);
  else state.folders.push(nextFolder);
  saveResourceLocalState(state);
  return cloneValue(nextFolder);
}

export function deleteResourceFolderLocal(folderId){
  const safeId = String(folderId || "");
  const state = loadResourceLocalState();
  if (state.folders.some((folder) => String(folder.parent_id || "") === safeId)) {
    throw new Error("Ce dossier contient encore un sous-dossier.");
  }
  if (state.resources.some((resource) => String(resource.folder_id || "") === safeId)) {
    throw new Error("Ce dossier contient encore une ressource.");
  }
  const next = state.folders.filter((folder) => String(folder.id) !== safeId);
  if (next.length === state.folders.length) return false;
  state.folders = next;
  saveResourceLocalState(state);
  return true;
}

export function upsertResourceLocal(source = {}){
  const state = loadResourceLocalState();
  const existingIndex = state.resources.findIndex((resource) => String(resource.id) === String(source.id || ""));
  const existing = existingIndex >= 0 ? state.resources[existingIndex] : null;
  const now = new Date().toISOString();
  const nextResource = normalizeResource({
    ...existing,
    ...source,
    id: source.id || existing?.id || createLocalId("resource"),
    created_at: existing?.created_at || source.created_at || now,
    updated_at: now,
    display_order: existing?.display_order ?? source.display_order ?? state.resources.length
  }, existingIndex >= 0 ? existingIndex : state.resources.length);

  if (existingIndex >= 0) state.resources.splice(existingIndex, 1, nextResource);
  else state.resources.push(nextResource);
  saveResourceLocalState(state);
  return cloneValue(nextResource);
}

export function deleteResourceLocal(resourceId){
  const safeId = String(resourceId || "");
  const state = loadResourceLocalState();
  const next = state.resources.filter((resource) => String(resource.id) !== safeId);
  if (next.length === state.resources.length) return false;
  state.resources = next;
  saveResourceLocalState(state);
  return true;
}

export { RESOURCE_LOCAL_STORAGE_KEY };
