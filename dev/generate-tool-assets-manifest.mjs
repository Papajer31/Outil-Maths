import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const assetsRoot = path.join(rootDir, "shared", "tool-assets");
const imagesRoot = path.join(assetsRoot, "images");
const audioRoot = path.join(assetsRoot, "audio");
const manifestPath = path.join(assetsRoot, "manifest.json");

const SUPPORTED_IMAGES = new Set([".webp", ".png", ".jpg", ".jpeg", ".svg"]);
const SUPPORTED_AUDIO = new Set([".mp3", ".ogg", ".wav", ".m4a"]);

const assets = [
  ...(await collectAssets(imagesRoot, "images", "image", SUPPORTED_IMAGES)),
  ...(await collectAssets(audioRoot, "audio", "audio", SUPPORTED_AUDIO))
];

assets.sort((a, b) => a.category.localeCompare(b.category, "fr")
  || a.label.localeCompare(b.label, "fr")
  || a.id.localeCompare(b.id, "fr"));

const manifest = {
  version: 1,
  description: "Bibliothèque locale d'assets système utilisables par les outils.",
  generatedAt: new Date().toISOString(),
  assets
};

await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`Manifest généré : ${path.relative(rootDir, manifestPath)} (${assets.length} assets)`);

async function collectAssets(baseDir, baseSegment, type, supportedExtensions) {
  const found = [];
  try {
    await fs.access(baseDir);
  } catch {
    return found;
  }

  await walk(baseDir, async (filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    if (!supportedExtensions.has(ext)) return;

    const relativeFromBase = slash(path.relative(baseDir, filePath));
    const src = `${baseSegment}/${relativeFromBase}`;
    const withoutExt = src.replace(/\.[a-z0-9]+$/i, "");
    const id = slugify(withoutExt);
    const label = labelFromFilename(path.basename(filePath, ext));
    const category = categoryFromRelative(relativeFromBase);
    const tags = category ? category.split(" / ").filter(Boolean) : [];

    found.push({
      id,
      type,
      src,
      label,
      alt: label,
      category,
      tags
    });
  });

  return found;
}

async function walk(dir, onFile) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(fullPath, onFile);
    } else if (entry.isFile()) {
      await onFile(fullPath);
    }
  }
}

function categoryFromRelative(relativePath) {
  const parts = slash(relativePath).split("/").filter(Boolean);
  if (parts.length <= 1) return "";
  return parts.slice(0, -1).join(" / ");
}

function labelFromFilename(filename) {
  return String(filename || "")
    .replace(/^\d+[-_]/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function slash(value) {
  return String(value || "").replace(/\\/g, "/");
}
