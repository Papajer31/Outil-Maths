const IMAGE_FILE_MAX_BYTES = 12 * 1024 * 1024;
const IMAGE_OPTIMIZE_TRIGGER_BYTES = 2.5 * 1024 * 1024;
const IMAGE_OPTIMIZE_MAX_EDGE = 2560;
const IMAGE_OPTIMIZE_MIME = "image/webp";
const IMAGE_OPTIMIZE_QUALITY = 0.86;

function formatBytes(bytes){
  const value = Number(bytes) || 0;
  if (value >= 1024 * 1024) return `${Math.round(value / (1024 * 1024))} Mo`;
  if (value >= 1024) return `${Math.round(value / 1024)} Ko`;
  return `${Math.round(value)} o`;
}

function createObjectUrl(blob){
  if (!blob || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return "";
  return URL.createObjectURL(blob);
}

function revokeObjectUrl(source){
  if (!source || typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  try { URL.revokeObjectURL(source); } catch {}
}

function isCanvasOptimizable(file){
  const type = String(file?.type || "").toLowerCase();
  return type.startsWith("image/")
    && type !== "image/svg+xml"
    && type !== "image/gif"
    && typeof document !== "undefined"
    && typeof document.createElement === "function";
}

function shouldOptimizeImage(file, dimensions){
  const maxEdge = Math.max(Number(dimensions?.naturalWidth) || 0, Number(dimensions?.naturalHeight) || 0);
  return isCanvasOptimizable(file)
    && (Number(file?.size) > IMAGE_OPTIMIZE_TRIGGER_BYTES || maxEdge > IMAGE_OPTIMIZE_MAX_EDGE);
}

function getFittedSize(dimensions){
  const naturalWidth = Math.max(1, Number(dimensions?.naturalWidth) || 1);
  const naturalHeight = Math.max(1, Number(dimensions?.naturalHeight) || 1);
  const scale = Math.min(1, IMAGE_OPTIMIZE_MAX_EDGE / Math.max(naturalWidth, naturalHeight));
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale))
  };
}

function loadImageElement(source){
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => resolve({ image, ok: true }), { once: true });
    image.addEventListener("error", () => resolve({ image: null, ok: false }), { once: true });
    image.src = source;
  });
}

function canvasToBlob(canvas, type, quality){
  return new Promise((resolve) => {
    if (typeof canvas?.toBlob !== "function") {
      resolve(null);
      return;
    }
    canvas.toBlob((blob) => resolve(blob || null), type, quality);
  });
}

async function loadFileDimensions(file){
  const source = createObjectUrl(file);
  if (!source) return { naturalWidth: 0, naturalHeight: 0, ok: false };
  try {
    return await loadImageDimensions(source);
  } finally {
    revokeObjectUrl(source);
  }
}

async function optimizeImageFile(file, dimensions){
  if (!shouldOptimizeImage(file, dimensions)) {
    return {
      blob: file,
      naturalWidth: dimensions.naturalWidth,
      naturalHeight: dimensions.naturalHeight,
      optimized: false
    };
  }

  const source = createObjectUrl(file);
  if (!source) {
    return {
      blob: file,
      naturalWidth: dimensions.naturalWidth,
      naturalHeight: dimensions.naturalHeight,
      optimized: false
    };
  }

  try {
    const loaded = await loadImageElement(source);
    if (!loaded.ok || !loaded.image) {
      return {
        blob: file,
        naturalWidth: dimensions.naturalWidth,
        naturalHeight: dimensions.naturalHeight,
        optimized: false
      };
    }

    const fitted = getFittedSize(dimensions);
    const canvas = document.createElement("canvas");
    canvas.width = fitted.width;
    canvas.height = fitted.height;
    const context = canvas.getContext("2d");
    if (!context) {
      return {
        blob: file,
        naturalWidth: dimensions.naturalWidth,
        naturalHeight: dimensions.naturalHeight,
        optimized: false
      };
    }

    context.drawImage(loaded.image, 0, 0, fitted.width, fitted.height);
    const blob = await canvasToBlob(canvas, IMAGE_OPTIMIZE_MIME, IMAGE_OPTIMIZE_QUALITY);
    const isReduced = fitted.width < dimensions.naturalWidth || fitted.height < dimensions.naturalHeight;
    const shouldUseOptimized = blob && (isReduced || blob.size < file.size);
    return {
      blob: shouldUseOptimized ? blob : file,
      naturalWidth: shouldUseOptimized ? fitted.width : dimensions.naturalWidth,
      naturalHeight: shouldUseOptimized ? fitted.height : dimensions.naturalHeight,
      optimized: Boolean(shouldUseOptimized)
    };
  } finally {
    revokeObjectUrl(source);
  }
}

export function getImageFileTooLargeMessage(){
  return `Image trop lourde : limite à ${formatBytes(IMAGE_FILE_MAX_BYTES)}.`;
}

export function formatImageZoom(zoom){
  return `${Math.round((Number(zoom) || 1) * 100)} %`;
}

export function loadImageDimensions(source){
  return new Promise((resolve) => {
    const image = new Image();
    image.addEventListener("load", () => resolve({
      naturalWidth: image.naturalWidth || 0,
      naturalHeight: image.naturalHeight || 0,
      ok: true
    }), { once: true });
    image.addEventListener("error", () => resolve({ naturalWidth: 0, naturalHeight: 0, ok: false }), { once: true });
    image.src = String(source || "");
  });
}

const IMAGE_CLIPBOARD_EXTENSIONS = Object.freeze({
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "image/bmp": "bmp"
});

/** Plusieurs fichiers peuvent être présents dans files alors que items n'en expose qu'un. */
export function imageFilesFromPasteEvent(event){
  const clipboard = event?.clipboardData;
  if (!clipboard) return [];

  const itemFiles = [];
  for (const item of Array.from(clipboard.items || [])) {
    if (item.kind !== "file" || !String(item.type || "").startsWith("image/")) continue;
    const file = item.getAsFile?.();
    if (file) itemFiles.push(file);
  }
  const directFiles = Array.from(clipboard.files || [])
    .filter((file) => String(file?.type || "").startsWith("image/"));
  return directFiles.length > itemFiles.length ? directFiles : itemFiles;
}

export function imageFileFromPasteEvent(event){
  return imageFilesFromPasteEvent(event)[0] || null;
}

/**
 * Certains éditeurs copient plusieurs images dans du HTML, mais ne livrent
 * qu'une vignette bitmap dans le presse-papiers. Dans ce cas on récupère les
 * images distinctes du HTML (URL web ou image intégrée data:).
 */
function imageSourcesFromClipboardHtml(html){
  if (!html || typeof DOMParser === "undefined") return [];
  try {
    const document = new DOMParser().parseFromString(String(html), "text/html");
    return Array.from(document.querySelectorAll("img[src]"))
      .map((image) => String(image.getAttribute("src") || "").trim())
      .filter((src) => /^https?:\/\//i.test(src) || /^data:image\/[\w.+-]+(?:;[^,]*)?,/i.test(src));
  } catch {
    return [];
  }
}

function selectClipboardImageEntries(files, html){
  const fileEntries = (Array.isArray(files) ? files : []).map((file) => ({ file }));
  const htmlEntries = imageSourcesFromClipboardHtml(html).map((source) => ({ source }));
  // Ne jamais préférer une représentation HTML incomplète aux fichiers directs.
  return htmlEntries.length >= 2 && htmlEntries.length > fileEntries.length
    ? htmlEntries
    : fileEntries;
}

/** À appeler pendant paste : la lecture du DataTransfer ne peut pas attendre. */
export function imageEntriesFromPasteEvent(event){
  const clipboard = event?.clipboardData;
  if (!clipboard) return [];
  const html = typeof clipboard.getData === "function" ? clipboard.getData("text/html") : "";
  return selectClipboardImageEntries(imageFilesFromPasteEvent(event), html);
}

/** Bouton Coller : Clipboard API disponible sur HTTPS, avec autorisation du navigateur. */
export async function readImageEntriesFromClipboard(){
  if (typeof navigator === "undefined" || typeof navigator.clipboard?.read !== "function") {
    throw new Error("Lecture du presse-papiers indisponible. Utilise Ctrl + V dans le Tableau.");
  }
  const items = await navigator.clipboard.read();
  const files = [];
  let html = "";
  for (const item of items) {
    const mime = Array.from(item.types || []).find((type) => String(type).startsWith("image/"));
    if (mime) {
      const blob = await item.getType(mime);
      const extension = IMAGE_CLIPBOARD_EXTENSIONS[mime] || "png";
      files.push(new File([blob], `Image collée ${files.length + 1}.${extension}`, { type: mime }));
    }
    if (item.types?.includes("text/html")) {
      try { html += await (await item.getType("text/html")).text(); } catch {}
    }
  }
  const entries = selectClipboardImageEntries(files, html);
  if (!entries.length) throw new Error("Le presse-papiers ne contient pas d’image.");
  return entries;
}

export async function readImageFilesFromClipboard(){
  const entries = await readImageEntriesFromClipboard();
  const files = entries.map((entry) => entry.file).filter(Boolean);
  if (!files.length) throw new Error("Le presse-papiers ne contient pas de fichier image.");
  return files;
}

export async function readImageFileFromClipboard(){
  const files = await readImageFilesFromClipboard();
  return files[0] || null;
}

export async function prepareImageFilePayload(file){
  if (!file) throw new Error("Choisis un fichier image.");
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Choisis un fichier image.");
  }
  if (file.size > IMAGE_FILE_MAX_BYTES) {
    throw new Error(getImageFileTooLargeMessage());
  }

  const dimensions = await loadFileDimensions(file);
  if (!dimensions.ok) throw new Error("Impossible de charger cette image.");

  const optimized = await optimizeImageFile(file, dimensions);
  return {
    blob: optimized.blob,
    sourceKind: "file",
    imageName: file.name || "Image locale",
    naturalWidth: optimized.naturalWidth,
    naturalHeight: optimized.naturalHeight,
    optimized: optimized.optimized
  };
}

export async function prepareImageUrlPayload(value){
  const source = String(value || "").trim();
  if (!source) throw new Error("Colle d'abord une URL d'image.");

  const dimensions = await loadImageDimensions(source);
  if (!dimensions.ok) throw new Error("Impossible de charger cette URL d'image.");

  return {
    source,
    sourceKind: "url",
    imageName: source,
    naturalWidth: dimensions.naturalWidth,
    naturalHeight: dimensions.naturalHeight
  };
}

export async function prepareImageResourcePayload(resourceAsset){
  const source = String(resourceAsset?.url || resourceAsset?.src || "").trim();
  const resourceId = String(resourceAsset?.resourceId || resourceAsset?.resource_id || "").trim();
  if (!source || !resourceId) throw new Error("Ressource image indisponible.");
  return {
    source,
    sourceKind:"resource",
    resourceId,
    imageName:String(resourceAsset?.label || resourceAsset?.title || "Image").trim() || "Image",
    naturalWidth:Math.max(0, Number(resourceAsset?.width) || 0),
    naturalHeight:Math.max(0, Number(resourceAsset?.height) || 0),
    mimeType:String(resourceAsset?.mimeType || resourceAsset?.mime_type || "image/*")
  };
}
