import { supabase } from "./supabase-client.js";

const DB_NAME = "site-outils-quiz-images";
const DB_VERSION = 1;
const STORE_NAME = "images";
const objectUrlCache = new Map();
const resourceUrlCache = new Map();
const RESOURCE_SIGNED_URL_LIFETIME_SECONDS = 3600;
const RESOURCE_SIGNED_URL_REFRESH_MARGIN_MS = 5 * 60 * 1000;
const PUBLIC_RESOURCE_BUCKETS = new Set(["images"]);

export function normalizeQuizImageSource(source){
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const rawKind = String(source.kind || source.type || "").trim().toLowerCase();
  const kind = rawKind === "local-upload" || rawKind === "upload" || rawKind === "local"
    ? "local-upload"
    : rawKind === "resource" || rawKind === "supabase-resource" || rawKind === "personal-resource" || rawKind === "system-resource"
      ? "resource"
      : "";
  if (!kind) return null;

  if (kind === "resource") {
    const resourceId = String(source.resourceId || source.resource_id || source.id || "").trim();
    if (!resourceId) return null;
    return {
      kind,
      resourceId,
      label: String(source.label || source.name || source.title || "Image").trim() || "Image",
      alt: String(source.alt || source.alt_text || source.label || source.name || source.title || "Image").trim() || "Image",
      mimeType: String(source.mimeType || source.mime_type || "image/*").trim() || "image/*"
    };
  }

  const imageId = String(source.imageId || source.image_id || source.id || "").trim();
  if (!imageId) return null;
  return {
    kind,
    imageId,
    name: String(source.name || source.label || "Image importée").trim() || "Image importée",
    mimeType: String(source.mimeType || source.mime_type || source.type || "image/*").trim() || "image/*",
    size: Math.max(0, Number(source.size) || 0),
    alt: String(source.alt || source.name || source.label || "Image importée").trim() || "Image importée"
  };
}

export async function saveQuizLocalImage(file){
  if (!(file instanceof Blob)) throw new Error("Le fichier image est invalide.");
  const mimeType = String(file.type || "").trim().toLowerCase();
  if (!mimeType.startsWith("image/")) throw new Error("Le fichier sélectionné n’est pas une image.");

  const imageId = createId("quiz-image");
  const name = String(file.name || "image").trim() || "image";
  const record = {
    id: imageId,
    blob: file,
    name,
    mimeType: mimeType || "image/*",
    size: Number(file.size) || 0,
    createdAt: new Date().toISOString()
  };
  const db = await openDatabase();
  await runRequest(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record));
  return normalizeQuizImageSource({
    kind: "local-upload",
    imageId,
    name,
    mimeType: record.mimeType,
    size: record.size,
    alt: name
  });
}

export async function resolveQuizImageSourceUrl(source){
  const normalized = normalizeQuizImageSource(source);
  if (!normalized) return "";

  if (normalized.kind === "resource") {
    return await resolveResourceImageUrl(normalized.resourceId);
  }

  if (objectUrlCache.has(normalized.imageId)) return objectUrlCache.get(normalized.imageId) || "";
  const db = await openDatabase();
  const record = await runRequest(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(normalized.imageId));
  if (!record?.blob) return "";
  const url = URL.createObjectURL(record.blob);
  objectUrlCache.set(normalized.imageId, url);
  return url;
}

async function resolveResourceImageUrl(resourceId){
  const id = String(resourceId || "").trim();
  if (!id) return "";

  const cached = resourceUrlCache.get(id);
  if (cached?.url && Number(cached.expiresAt) - RESOURCE_SIGNED_URL_REFRESH_MARGIN_MS > Date.now()) {
    return cached.url;
  }

  const { data: resource, error: resourceError } = await supabase
    .from("resources")
    .select("id, resource_type, storage_bucket, storage_path")
    .eq("id", id)
    .maybeSingle();
  if (resourceError) throw resourceError;
  if (!resource || String(resource.resource_type || "image") !== "image") return "";

  const bucket = String(resource.storage_bucket || "teacher-resources").trim();
  const path = String(resource.storage_path || "").trim();
  if (!bucket || !path) return "";

  if (PUBLIC_RESOURCE_BUCKETS.has(bucket)) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    const url = String(data?.publicUrl || "");
    if (url) {
      resourceUrlCache.set(id, {
        url,
        expiresAt: Number.MAX_SAFE_INTEGER
      });
    }
    return url;
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, RESOURCE_SIGNED_URL_LIFETIME_SECONDS);
  if (error) throw error;

  const url = String(data?.signedUrl || "");
  if (url) {
    resourceUrlCache.set(id, {
      url,
      expiresAt: Date.now() + RESOURCE_SIGNED_URL_LIFETIME_SECONDS * 1000
    });
  }
  return url;
}

export async function deleteQuizLocalImage(imageId){
  const id = String(imageId || "").trim();
  if (!id) return;
  const cached = objectUrlCache.get(id);
  if (cached) URL.revokeObjectURL(cached);
  objectUrlCache.delete(id);
  const db = await openDatabase();
  await runRequest(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).delete(id));
}

function createId(prefix){
  if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDatabase(){
  if (!globalThis.indexedDB) return Promise.reject(new Error("Le stockage local des images n’est pas disponible dans ce navigateur."));
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Impossible d’ouvrir le stockage local des images."));
    request.onblocked = () => reject(new Error("Le stockage local des images est momentanément bloqué."));
  });
}

function runRequest(request){
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Échec de l’accès au stockage local des images."));
  });
}
