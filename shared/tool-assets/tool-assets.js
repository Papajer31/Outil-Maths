const MANIFEST_URL = new URL("./manifest.json", import.meta.url);
const DEFAULT_MANIFEST = Object.freeze({ version: 1, assets: [] });

let manifestPromise = null;
let manifestCache = null;

export async function loadToolAssetsManifest({ force = false } = {}) {
  if (manifestCache && !force) return manifestCache;
  if (manifestPromise && !force) return manifestPromise;

  manifestPromise = fetch(MANIFEST_URL, { cache: force ? "no-store" : "default" })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(`Manifest assets introuvable (${response.status}).`);
      }
      return response.json();
    })
    .then((manifest) => normalizeManifest(manifest))
    .catch((error) => {
      console.warn("[tool-assets] Impossible de charger le manifest.", error);
      return normalizeManifest(DEFAULT_MANIFEST);
    })
    .finally(() => {
      manifestPromise = null;
    });

  manifestCache = await manifestPromise;
  return manifestCache;
}

export function getCachedToolAssetsManifest() {
  return manifestCache;
}

export async function listToolAssets(filters = {}) {
  const manifest = await loadToolAssetsManifest();
  return filterAssets(manifest.assets, filters);
}

export async function searchToolAssets(query = "", filters = {}) {
  const manifest = await loadToolAssetsManifest();
  return filterAssets(manifest.assets, { ...filters, query });
}

export async function getToolAssetById(assetId) {
  const id = String(assetId || "").trim();
  if (!id) return null;
  const manifest = await loadToolAssetsManifest();
  return manifest.assetsById.get(id) || null;
}

export async function resolveToolAssetSrc(assetOrId) {
  const asset = typeof assetOrId === "string"
    ? await getToolAssetById(assetOrId)
    : normalizeAsset(assetOrId);
  return asset?.url || "";
}

export function resolveToolAssetSrcFromAsset(asset) {
  return normalizeAsset(asset)?.url || "";
}

export function normalizeToolAsset(asset) {
  return normalizeAsset(asset);
}

function normalizeManifest(manifest) {
  const rawAssets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  const assets = rawAssets
    .map((asset) => normalizeAsset(asset))
    .filter(Boolean)
    .sort(compareAssets);

  return {
    version: Number(manifest?.version) || 1,
    description: String(manifest?.description || "").trim(),
    generatedAt: manifest?.generatedAt || null,
    assets,
    assetsById: new Map(assets.map((asset) => [asset.id, asset]))
  };
}

function normalizeAsset(asset) {
  if (!asset || typeof asset !== "object") return null;

  const id = String(asset.id || "").trim();
  const type = String(asset.type || "image").trim().toLowerCase();
  const src = String(asset.src || "").trim();
  if (!id || !src) return null;

  const label = String(asset.label || inferLabelFromSrc(src) || id).trim();
  const category = String(asset.category || inferCategoryFromSrc(src) || "").trim();
  const tags = normalizeTags(asset.tags);
  const alt = String(asset.alt || label).trim();
  const url = new URL(src, MANIFEST_URL).href;

  return {
    ...asset,
    id,
    type,
    src,
    url,
    label,
    alt,
    category,
    tags,
    searchableText: normalizeSearchText([id, label, alt, category, ...tags].join(" "))
  };
}

function filterAssets(assets, filters = {}) {
  const type = String(filters.type || "").trim().toLowerCase();
  const category = normalizeSearchText(filters.category || "");
  const tag = normalizeSearchText(filters.tag || "");
  const query = normalizeSearchText(filters.query || "");

  return assets.filter((asset) => {
    if (type && asset.type !== type) return false;
    if (category && normalizeSearchText(asset.category) !== category) return false;
    if (tag && !asset.tags.some((item) => normalizeSearchText(item) === tag)) return false;
    if (query && !asset.searchableText.includes(query)) return false;
    return true;
  });
}

function compareAssets(a, b) {
  return String(a.category || "").localeCompare(String(b.category || ""), "fr")
    || String(a.label || "").localeCompare(String(b.label || ""), "fr")
    || String(a.id || "").localeCompare(String(b.id || ""), "fr");
}

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return [];
  const seen = new Set();
  const result = [];
  for (const tag of tags) {
    const value = String(tag || "").trim();
    const key = normalizeSearchText(value);
    if (!value || seen.has(key)) continue;
    seen.add(key);
    result.push(value);
  }
  return result;
}

function inferLabelFromSrc(src) {
  const filename = String(src || "").split("/").pop() || "";
  const withoutExtension = filename.replace(/\.[a-z0-9]+$/i, "");
  return withoutExtension
    .replace(/^\d+[-_]/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function inferCategoryFromSrc(src) {
  const parts = String(src || "").split("/").filter(Boolean);
  if (parts.length <= 2) return "";
  return parts.slice(1, -1).join(" / ");
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’']/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
