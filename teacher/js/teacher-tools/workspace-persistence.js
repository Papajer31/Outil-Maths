const ASSET_SCHEME = "tableau-asset://";

function clonePlain(value){
  try { if (typeof structuredClone === "function") return structuredClone(value); } catch {}
  return JSON.parse(JSON.stringify(value ?? null));
}

function sanitizeName(value, fallback = "asset"){
  const source = String(value || fallback).trim() || fallback;
  return source.replace(/[\\/:*?"<>|]+/g, "-").slice(0, 160) || fallback;
}

function inferAssetName(node, fallback = "asset"){
  return sanitizeName(
    node?.imageName
      || node?.pdfName
      || node?.backgroundImageName
      || node?.title
      || fallback,
    fallback
  );
}

function isAssetPlaceholder(value){
  return String(value || "").startsWith(ASSET_SCHEME);
}

function placeholderFor(assetId){
  return `${ASSET_SCHEME}${String(assetId || "").trim()}`;
}

function assetIdFromPlaceholder(value){
  const source = String(value || "");
  return isAssetPlaceholder(source) ? source.slice(ASSET_SCHEME.length) : "";
}

async function sourceToBlob(source){
  const safeSource = String(source || "").trim();
  if (!safeSource) return null;
  try {
    const response = await fetch(safeSource);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.blob();
  } catch (error) {
    console.warn("Impossible de lire un asset local du Tableau.", error);
    return null;
  }
}

function normalizeAssetDescriptor(raw = {}){
  const id = String(raw?.id || "").trim();
  const bucket = String(raw?.bucket || raw?.storage_bucket || "").trim();
  const path = String(raw?.path || raw?.storage_path || "").trim();
  if (!id || !bucket || !path) return null;
  return {
    id,
    bucket,
    path,
    name: String(raw?.name || "asset").trim() || "asset",
    mimeType: String(raw?.mimeType || raw?.mime_type || "").trim(),
    sizeBytes: Math.max(0, Number(raw?.sizeBytes ?? raw?.size_bytes) || 0)
  };
}

function normalizeAssetManifest(raw = {}){
  const entries = Array.isArray(raw)
    ? raw.map((item) => [String(item?.id || ""), item])
    : Object.entries(raw && typeof raw === "object" ? raw : {});
  const result = {};
  for (const [key, value] of entries) {
    const descriptor = normalizeAssetDescriptor({ ...value, id: value?.id || key });
    if (descriptor) result[descriptor.id] = descriptor;
  }
  return result;
}

export function createWorkspacePersistence({
  uploadAsset,
  createAssetSignedUrl,
  cleanupAssets,
  listResourcesForSpace,
  createResourceSignedUrl
} = {}){
  const liveSourceAssets = new Map();

  function clearLiveRegistry(){
    liveSourceAssets.clear();
  }

  function rememberLiveSource(source, descriptor){
    const safeSource = String(source || "").trim();
    const safeDescriptor = normalizeAssetDescriptor(descriptor);
    if (safeSource && safeDescriptor) liveSourceAssets.set(safeSource, safeDescriptor);
  }

  function forgetAssetsByPaths(paths = []){
    const targets = new Set((Array.isArray(paths) ? paths : []).map((path) => String(path || "").trim()).filter(Boolean));
    if (!targets.size) return;
    for (const [source, descriptor] of liveSourceAssets.entries()) {
      if (targets.has(String(descriptor?.path || ""))) liveSourceAssets.delete(source);
    }
  }

  async function hydrateWorkspace(record){
    clearLiveRegistry();
    const workspace = clonePlain(record?.workspace || {});
    const manifest = normalizeAssetManifest(record?.assets);
    const signedById = new Map();
    const resourceSignedById = new Map();
    let resourceRowsPromise = null;

    async function getResourceRows(){
      if (!resourceRowsPromise) {
        resourceRowsPromise = typeof listResourcesForSpace === "function"
          ? Promise.resolve(listResourcesForSpace(record?.teacherSpaceId)).catch((error) => {
              console.warn("Impossible de charger les ressources du Tableau.", error);
              return [];
            })
          : Promise.resolve([]);
      }
      return await resourceRowsPromise;
    }

    async function resolveResourceSource(resourceId, fallbackSource = ""){
      const id = String(resourceId || "").trim();
      if (!id) return String(fallbackSource || "").trim();
      if (!resourceSignedById.has(id)) {
        try {
          const resources = await getResourceRows();
          const resource = (Array.isArray(resources) ? resources : []).find((item) => String(item?.id || "") === id);
          const signed = resource && typeof createResourceSignedUrl === "function"
            ? await createResourceSignedUrl(resource, 86400)
            : "";
          resourceSignedById.set(id, String(signed || ""));
        } catch (error) {
          console.warn("Impossible de restaurer une ressource du Tableau.", error);
          resourceSignedById.set(id, "");
        }
      }
      return resourceSignedById.get(id) || String(fallbackSource || "").trim();
    }

    async function resolvePlaceholder(value){
      const id = assetIdFromPlaceholder(value);
      if (!id) return value;
      const descriptor = manifest[id];
      if (!descriptor || typeof createAssetSignedUrl !== "function") return "";
      if (!signedById.has(id)) {
        try {
          const signed = await createAssetSignedUrl(descriptor);
          signedById.set(id, String(signed || ""));
        } catch (error) {
          console.warn("Impossible de restaurer un fichier du Tableau.", error);
          signedById.set(id, "");
        }
      }
      const signed = signedById.get(id) || "";
      if (signed) rememberLiveSource(signed, descriptor);
      return signed;
    }

    async function walk(value){
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) value[index] = await walk(value[index]);
        return value;
      }
      if (!value || typeof value !== "object") return value;

      if (value.sourceKind === "resource" && value.resourceId) {
        value.source = await resolveResourceSource(value.resourceId, value.source);
      }
      if (value.sourceKind === "file" && typeof value.source === "string" && isAssetPlaceholder(value.source)) {
        value.source = await resolvePlaceholder(value.source);
      }
      if (value.backgroundImageKind === "file"
        && typeof value.backgroundImageSource === "string"
        && isAssetPlaceholder(value.backgroundImageSource)) {
        value.backgroundImageSource = await resolvePlaceholder(value.backgroundImageSource);
      }

      for (const key of Object.keys(value)) {
        if (key === "source" && ["file", "resource"].includes(value.sourceKind)) continue;
        if (key === "backgroundImageSource" && value.backgroundImageKind === "file") continue;
        value[key] = await walk(value[key]);
      }
      return value;
    }

    return {
      workspace: await walk(workspace),
      assets: manifest
    };
  }

  async function serializeWorkspace(workspace, { teacherSpaceId } = {}){
    const persisted = clonePlain(workspace || {});
    const manifest = {};
    const uploadedPaths = [];

    async function persistSource(source, node, fallbackName){
      const safeSource = String(source || "").trim();
      if (!safeSource) return "";

      const known = liveSourceAssets.get(safeSource);
      if (known) {
        manifest[known.id] = known;
        return placeholderFor(known.id);
      }

      if (isAssetPlaceholder(safeSource)) return safeSource;
      if (typeof uploadAsset !== "function") throw new Error("Le stockage du Tableau est indisponible.");

      const blob = await sourceToBlob(safeSource);
      if (!(blob instanceof Blob)) throw new Error(`Impossible d’enregistrer « ${inferAssetName(node, fallbackName)} ».`);
      const uploaded = normalizeAssetDescriptor(await uploadAsset(
        teacherSpaceId,
        blob,
        { name: inferAssetName(node, fallbackName) }
      ));
      if (!uploaded) throw new Error("L’asset du Tableau n’a pas pu être enregistré.");
      manifest[uploaded.id] = uploaded;
      uploadedPaths.push(uploaded.path);
      rememberLiveSource(safeSource, uploaded);
      return placeholderFor(uploaded.id);
    }

    async function walk(value){
      if (Array.isArray(value)) {
        for (let index = 0; index < value.length; index += 1) value[index] = await walk(value[index]);
        return value;
      }
      if (!value || typeof value !== "object") return value;

      if (value.sourceKind === "resource" && value.resourceId) {
        // Une ressource du site reste référencée par son identifiant. L'URL signée
        // est volontairement retirée de la sauvegarde et sera régénérée au chargement.
        value.source = "";
      }
      if (value.sourceKind === "file" && typeof value.source === "string" && value.source) {
        value.source = await persistSource(value.source, value, "fichier");
      }
      if (value.backgroundImageKind === "file"
        && typeof value.backgroundImageSource === "string"
        && value.backgroundImageSource) {
        value.backgroundImageSource = await persistSource(value.backgroundImageSource, value, "fond");
      }

      for (const key of Object.keys(value)) {
        if (key === "source" && ["file", "resource"].includes(value.sourceKind)) continue;
        if (key === "backgroundImageSource" && value.backgroundImageKind === "file") continue;
        value[key] = await walk(value[key]);
      }
      return value;
    }

    try {
      await walk(persisted);
    } catch (error) {
      if (uploadedPaths.length && typeof cleanupAssets === "function") {
        try { await cleanupAssets(teacherSpaceId, { keepPaths: [], removePaths: uploadedPaths, exact: true }); } catch {}
      }
      forgetAssetsByPaths(uploadedPaths);
      throw error;
    }

    return { workspace: persisted, assets: manifest, uploadedPaths };
  }

  async function cleanupAfterSave(teacherSpaceId, manifest){
    const keepPaths = Object.values(normalizeAssetManifest(manifest)).map((asset) => asset.path);
    if (typeof cleanupAssets === "function") await cleanupAssets(teacherSpaceId, { keepPaths });
    const keepSet = new Set(keepPaths);
    for (const [source, descriptor] of liveSourceAssets.entries()) {
      if (!keepSet.has(String(descriptor?.path || ""))) liveSourceAssets.delete(source);
    }
  }

  async function cleanupFailedUploads(teacherSpaceId, uploadedPaths = []){
    if (!uploadedPaths.length) return;
    try {
      if (typeof cleanupAssets === "function") {
        await cleanupAssets(teacherSpaceId, { keepPaths: [], removePaths: uploadedPaths, exact: true });
      }
    } finally {
      forgetAssetsByPaths(uploadedPaths);
    }
  }

  return {
    hydrateWorkspace,
    serializeWorkspace,
    cleanupAfterSave,
    cleanupFailedUploads,
    clearLiveRegistry
  };
}
