const TIERS = [128, 256, 512, 1024];
const MAX_CACHE_ENTRIES = 180;
const cache = new Map();
const pendingTasks = [];
let activeTasks = 0;
const MAX_CONCURRENT_RENDITIONS = 4;

function pumpTasks(){
  while (activeTasks < MAX_CONCURRENT_RENDITIONS && pendingTasks.length) {
    const task = pendingTasks.shift();
    activeTasks += 1;
    Promise.resolve().then(task.run).then(task.resolve, task.reject).finally(() => {
      activeTasks = Math.max(0, activeTasks - 1);
      pumpTasks();
    });
  }
}

function scheduleTask(run){
  return new Promise((resolve, reject) => {
    pendingTasks.push({ run, resolve, reject });
    pumpTasks();
  });
}

function chooseTier(pixelWidth, pixelHeight){
  const requested = Math.max(1, Math.ceil(Math.max(Number(pixelWidth)||1, Number(pixelHeight)||1) * Math.min(2, Number(globalThis.devicePixelRatio)||1)));
  return TIERS.find((tier) => tier >= requested) || TIERS[TIERS.length - 1];
}

function canvasToBlob(canvas){
  return new Promise((resolve) => {
    if (typeof canvas?.toBlob !== "function") { resolve(null); return; }
    canvas.toBlob((blob) => resolve(blob || null), "image/webp", 0.84);
  });
}

function trimCache(){
  while (cache.size > MAX_CACHE_ENTRIES) {
    const firstKey = cache.keys().next().value;
    const entry = cache.get(firstKey);
    cache.delete(firstKey);
    if (entry?.url?.startsWith?.("blob:")) {
      try { URL.revokeObjectURL(entry.url); } catch {}
    }
  }
}

async function buildRendition(item, tier){
  const source = String(item?.source || "").trim();
  if (!source || typeof fetch !== "function" || typeof createImageBitmap !== "function") return source;
  try {
    const response = await fetch(source);
    if (!response.ok) return source;
    const blob = await response.blob();
    let naturalWidth = Math.max(0, Number(item?.naturalWidth) || 0);
    let naturalHeight = Math.max(0, Number(item?.naturalHeight) || 0);

    if (naturalWidth > 0 && naturalHeight > 0) {
      const maxNatural = Math.max(naturalWidth, naturalHeight);
      if (maxNatural <= tier * 1.15) return source;
      const scale = Math.min(1, tier / maxNatural);
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      let bitmap;
      try {
        bitmap = await createImageBitmap(blob, { resizeWidth:width, resizeHeight:height, resizeQuality:"high" });
      } catch {
        bitmap = await createImageBitmap(blob);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha:true });
      if (!context) { bitmap.close?.(); return source; }
      context.drawImage(bitmap, 0, 0, width, height);
      bitmap.close?.();
      const resized = await canvasToBlob(canvas);
      return resized ? URL.createObjectURL(resized) : source;
    }

    // Certaines ressources historiques n'ont pas leurs dimensions en base.
    // On les décode une seule fois pour connaître le ratio puis on fabrique
    // immédiatement une rendition légère ; l'original n'est jamais affecté.
    const original = await createImageBitmap(blob);
    naturalWidth = Math.max(1, original.width || 1);
    naturalHeight = Math.max(1, original.height || 1);
    const maxNatural = Math.max(naturalWidth, naturalHeight);
    if (maxNatural <= tier * 1.15) { original.close?.(); return source; }
    const scale = tier / maxNatural;
    const width = Math.max(1, Math.round(naturalWidth * scale));
    const height = Math.max(1, Math.round(naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha:true });
    if (!context) { original.close?.(); return source; }
    context.drawImage(original, 0, 0, width, height);
    original.close?.();
    const resized = await canvasToBlob(canvas);
    return resized ? URL.createObjectURL(resized) : source;
  } catch {
    return source;
  }
}

export async function getImageLabelRendition(item, pixelWidth, pixelHeight){
  const source = String(item?.source || "").trim();
  if (!source) return "";
  const tier = chooseTier(pixelWidth, pixelHeight);
  const key = `${source}::${tier}`;
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing.promise || existing.url || source;
  }
  const entry = { url:"", promise:null };
  entry.promise = scheduleTask(() => buildRendition(item, tier)).then((url) => {
    entry.url = url || source;
    entry.promise = null;
    trimCache();
    return entry.url;
  });
  cache.set(key, entry);
  trimCache();
  return entry.promise;
}

export function disposeImageLabelRenditions(){
  for (const entry of cache.values()) {
    if (entry?.url?.startsWith?.("blob:")) {
      try { URL.revokeObjectURL(entry.url); } catch {}
    }
  }
  cache.clear();
}
