import {
  getPublicImageAssetUrl,
  listPublicImageAssets
} from "./public-api.js";

const EMOJI_SLUG_PREFIX = "emoji_";
const EMOJI_IMAGE_BUCKET = "images";

let emojiAssetsPromise = null;

function normalizeSlug(value) {
  return String(value || "").trim().toLowerCase();
}

function labelFromEmojiSlug(slug) {
  return normalizeSlug(slug)
    .replace(/^emoji_/, "")
    .replace(/[_-]+/g, " ")
    .trim() || "objet";
}

function normalizeEmojiAsset(row) {
  const slug = normalizeSlug(row?.slug);
  const storagePath = String(row?.storage_path || "").trim();
  if (!slug.startsWith(EMOJI_SLUG_PREFIX) || !storagePath) return null;

  const url = getPublicImageAssetUrl(storagePath, { bucket: EMOJI_IMAGE_BUCKET });
  if (!url) return null;

  const label = labelFromEmojiSlug(slug);
  return {
    id: slug,
    slug,
    type: "image",
    category: "emojis",
    storagePath,
    url,
    src: url,
    label,
    alt: label
  };
}

export async function listPublicEmojiAssets({ force = false } = {}) {
  if (force) emojiAssetsPromise = null;
  if (emojiAssetsPromise) return emojiAssetsPromise;

  emojiAssetsPromise = listPublicImageAssets()
    .then((rows) => (Array.isArray(rows) ? rows : [])
      .map(normalizeEmojiAsset)
      .filter(Boolean))
    .catch((error) => {
      emojiAssetsPromise = null;
      throw error;
    });

  return emojiAssetsPromise;
}

export async function loadPublicEmojiAssetsById(options = {}) {
  const assets = await listPublicEmojiAssets(options);
  return new Map(assets.map((asset) => [asset.id, asset]));
}
