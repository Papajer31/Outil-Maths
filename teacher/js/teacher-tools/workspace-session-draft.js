const DB_NAME = "tujer-teacher-tools-session";
const DB_VERSION = 1;
const STORE_NAME = "tableau-workspace-drafts";
const ASSET_SCHEME = "tableau-session-asset://";
const MAX_DRAFT_AGE_MS = 2 * 24 * 60 * 60 * 1000;

function cloneValue(value){
  try { if (typeof structuredClone === "function") return structuredClone(value); } catch {}
  return JSON.parse(JSON.stringify(value ?? null));
}

function draftKey(teacherSpaceId, channelId){
  const spaceId = String(teacherSpaceId || "").trim();
  const safeChannelId = String(channelId || "").trim();
  return spaceId && safeChannelId ? `${spaceId}::${safeChannelId}` : "";
}

function placeholderFor(assetId){
  return `${ASSET_SCHEME}${String(assetId || "").trim()}`;
}

function assetIdFromPlaceholder(value){
  const source = String(value || "");
  return source.startsWith(ASSET_SCHEME) ? source.slice(ASSET_SCHEME.length) : "";
}

function createAssetId(){
  try {
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  } catch {}
  return `draft-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

function openDatabase(){
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath:"key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB indisponible."));
  });
}

function requestResult(request){
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB indisponible."));
  });
}

async function sourceToBlob(source){
  const safeSource = String(source || "").trim();
  if (!safeSource) return null;
  try {
    const response = await fetch(safeSource);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.blob();
  } catch (error) {
    console.warn("Impossible de mettre en cache un fichier local du Tableau pour la session.", error);
    return null;
  }
}

export function createWorkspaceSessionDraftStore(){
  let dbPromise = null;
  const sourceAssets = new Map();
  const restoredObjectUrls = new Set();

  function getDb(){
    if (!dbPromise) dbPromise = openDatabase().catch((error) => {
      console.warn("La restauration temporaire du Tableau est indisponible.", error);
      return null;
    });
    return dbPromise;
  }

  async function cleanupExpired(db){
    if (!db) return;
    const cutoff = Date.now() - MAX_DRAFT_AGE_MS;
    try {
      await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const cursorRequest = store.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (Number(cursor.value?.updatedAt || 0) < cutoff) cursor.delete();
          cursor.continue();
        };
        cursorRequest.onerror = () => reject(cursorRequest.error || new Error("Nettoyage impossible."));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("Nettoyage impossible."));
        transaction.onabort = () => reject(transaction.error || new Error("Nettoyage interrompu."));
      });
    } catch {}
  }

  async function serializeWorkspace(workspace){
    const snapshot = cloneValue(workspace || {});
    const assets = {};

    async function persistSource(source){
      const safeSource = String(source || "").trim();
      if (!safeSource) return "";
      if (!safeSource.startsWith("blob:")) return safeSource;
      const known = sourceAssets.get(safeSource);
      if (known?.blob instanceof Blob) {
        assets[known.id] = known.blob;
        return placeholderFor(known.id);
      }
      const blob = await sourceToBlob(safeSource);
      if (!(blob instanceof Blob)) return safeSource;
      const asset = { id:createAssetId(), blob };
      sourceAssets.set(safeSource, asset);
      assets[asset.id] = blob;
      return placeholderFor(asset.id);
    }

    async function walk(value){
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) value[index] = await walk(value[index]);
        return value;
      }
      if (!value || typeof value !== "object") return value;

      if (value.sourceKind === "file" && typeof value.source === "string" && value.source) {
        value.source = await persistSource(value.source);
      }
      if (value.backgroundImageKind === "file"
        && typeof value.backgroundImageSource === "string"
        && value.backgroundImageSource) {
        value.backgroundImageSource = await persistSource(value.backgroundImageSource);
      }

      for (const key of Object.keys(value)) {
        if (key === "source" && value.sourceKind === "file") continue;
        if (key === "backgroundImageSource" && value.backgroundImageKind === "file") continue;
        value[key] = await walk(value[key]);
      }
      return value;
    }

    return { workspace:await walk(snapshot), assets };
  }

  function hydrateWorkspace(record){
    const snapshot = cloneValue(record?.workspace || {});
    const assets = record?.assets && typeof record.assets === "object" ? record.assets : {};

    function restoreSource(value){
      const assetId = assetIdFromPlaceholder(value);
      if (!assetId) return value;
      const blob = assets[assetId];
      if (!(blob instanceof Blob) || typeof URL?.createObjectURL !== "function") return "";
      const source = URL.createObjectURL(blob);
      restoredObjectUrls.add(source);
      sourceAssets.set(source, { id:assetId, blob });
      return source;
    }

    function walk(value){
      if (Array.isArray(value)) return value.map(walk);
      if (!value || typeof value !== "object") return value;
      if (value.sourceKind === "file" && typeof value.source === "string") value.source = restoreSource(value.source);
      if (value.backgroundImageKind === "file" && typeof value.backgroundImageSource === "string") {
        value.backgroundImageSource = restoreSource(value.backgroundImageSource);
      }
      for (const key of Object.keys(value)) {
        if (key === "source" && value.sourceKind === "file") continue;
        if (key === "backgroundImageSource" && value.backgroundImageKind === "file") continue;
        value[key] = walk(value[key]);
      }
      return value;
    }

    return walk(snapshot);
  }

  async function load(teacherSpaceId, channelId){
    const key = draftKey(teacherSpaceId, channelId);
    if (!key) return null;
    const db = await getDb();
    if (!db) return null;
    void cleanupExpired(db);
    try {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const record = await requestResult(transaction.objectStore(STORE_NAME).get(key));
      if (!record?.workspace) return null;
      return {
        workspace: hydrateWorkspace(record),
        revision: Math.max(1, Number(record.revision) || 1),
        updatedAt: Number(record.updatedAt) || 0
      };
    } catch (error) {
      console.warn("Impossible de restaurer le brouillon temporaire du Tableau.", error);
      return null;
    }
  }

  async function save(teacherSpaceId, channelId, workspace, { revision = 1 } = {}){
    const key = draftKey(teacherSpaceId, channelId);
    if (!key) return false;
    const db = await getDb();
    if (!db) return false;
    try {
      const serialized = await serializeWorkspace(workspace);
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put({
        key,
        updatedAt: Date.now(),
        revision: Math.max(1, Number(revision) || 1),
        workspace: serialized.workspace,
        assets: serialized.assets
      });
      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("Enregistrement temporaire impossible."));
        transaction.onabort = () => reject(transaction.error || new Error("Enregistrement temporaire interrompu."));
      });
      return true;
    } catch (error) {
      console.warn("Impossible d’enregistrer le brouillon temporaire du Tableau.", error);
      return false;
    }
  }

  async function clear(teacherSpaceId, channelId){
    const key = draftKey(teacherSpaceId, channelId);
    if (!key) return;
    const db = await getDb();
    if (!db) return;
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(key);
      await new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error("Suppression temporaire impossible."));
        transaction.onabort = () => reject(transaction.error || new Error("Suppression temporaire interrompue."));
      });
    } catch {}
  }

  function destroy(){
    for (const source of restoredObjectUrls) {
      try { URL.revokeObjectURL(source); } catch {}
    }
    restoredObjectUrls.clear();
    sourceAssets.clear();
  }

  return { load, save, clear, destroy };
}
