const DB_NAME = "site-outils-quiz-audios";
const DB_VERSION = 1;
const STORE_NAME = "audios";
const SYSTEM_ASSET_BASE_URL = new URL("./tool-assets/manifest.json", import.meta.url);
const objectUrlCache = new Map();

export function normalizeQuizAudioSource(source){
  if (!source || typeof source !== "object" || Array.isArray(source)) return null;
  const rawKind = String(source.kind || source.type || "").trim().toLowerCase();
  const kind = rawKind === "site-asset" || rawKind === "system" || rawKind === "asset"
    ? "site-asset"
    : rawKind === "local-upload" || rawKind === "local-recording" || rawKind === "upload" || rawKind === "recording" || rawKind === "local"
      ? rawKind === "local-recording" || rawKind === "recording" ? "local-recording" : "local-upload"
      : "";
  if (!kind) return null;

  if (kind === "site-asset") {
    const assetId = String(source.assetId || source.asset_id || source.id || "").trim();
    const src = String(source.src || source.path || "").trim();
    if (!assetId && !src) return null;
    return {
      kind,
      assetId,
      src,
      label: String(source.label || source.name || assetId || "Audio").trim() || "Audio",
      mimeType: String(source.mimeType || source.mime_type || "audio/*").trim() || "audio/*",
      duration: Math.max(0, Number(source.duration) || 0)
    };
  }

  const audioId = String(source.audioId || source.audio_id || source.id || "").trim();
  if (!audioId) return null;
  return {
    kind,
    audioId,
    name: String(source.name || source.label || (kind === "local-recording" ? "Enregistrement" : "Audio importé")).trim()
      || (kind === "local-recording" ? "Enregistrement" : "Audio importé"),
    mimeType: String(source.mimeType || source.mime_type || source.type || "audio/*").trim() || "audio/*",
    size: Math.max(0, Number(source.size) || 0),
    duration: Math.max(0, Number(source.duration) || 0)
  };
}

export async function saveQuizLocalAudio(blob, { name = "audio", kind = "local-upload", duration = 0 } = {}){
  if (!(blob instanceof Blob)) throw new Error("Le fichier audio est invalide.");
  const mimeType = String(blob.type || "").trim().toLowerCase();
  if (mimeType && !mimeType.startsWith("audio/")) throw new Error("Le fichier sélectionné n’est pas un audio.");

  const normalizedKind = kind === "local-recording" ? "local-recording" : "local-upload";
  const audioId = createId("quiz-audio");
  const safeName = String(name || blob.name || (normalizedKind === "local-recording" ? "enregistrement" : "audio")).trim()
    || (normalizedKind === "local-recording" ? "enregistrement" : "audio");
  const record = {
    id: audioId,
    blob,
    name: safeName,
    kind: normalizedKind,
    mimeType: mimeType || "audio/*",
    size: Number(blob.size) || 0,
    duration: Math.max(0, Number(duration) || 0),
    createdAt: new Date().toISOString()
  };
  const db = await openDatabase();
  await runRequest(db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(record));
  return normalizeQuizAudioSource({
    kind: normalizedKind,
    audioId,
    name: safeName,
    mimeType: record.mimeType,
    size: record.size,
    duration: record.duration
  });
}

export async function resolveQuizAudioSourceUrl(source){
  const normalized = normalizeQuizAudioSource(source);
  if (!normalized) return "";

  if (normalized.kind === "site-asset") {
    if (!normalized.src) return "";
    return new URL(normalized.src, SYSTEM_ASSET_BASE_URL).href;
  }

  if (objectUrlCache.has(normalized.audioId)) return objectUrlCache.get(normalized.audioId) || "";
  const db = await openDatabase();
  const record = await runRequest(db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(normalized.audioId));
  if (!record?.blob) return "";
  const url = URL.createObjectURL(record.blob);
  objectUrlCache.set(normalized.audioId, url);
  return url;
}

export async function deleteQuizLocalAudio(audioId){
  const id = String(audioId || "").trim();
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
  if (!globalThis.indexedDB) return Promise.reject(new Error("Le stockage local des audios n’est pas disponible dans ce navigateur."));
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Impossible d’ouvrir le stockage local des audios."));
    request.onblocked = () => reject(new Error("Le stockage local des audios est momentanément bloqué."));
  });
}

function runRequest(request){
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Échec de l’accès au stockage local des audios."));
  });
}
