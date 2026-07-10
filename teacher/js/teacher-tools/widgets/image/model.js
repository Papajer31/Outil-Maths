export const IMAGE_ZOOM_MIN = 1;
export const IMAGE_ZOOM_MAX = 4;
export const IMAGE_ZOOM_STEP = 0.15;
export const IMAGE_EMPTY_LAYOUT_ASPECT_RATIO = 2;

const ownedImageObjectUrls = new Map();

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, digits = 3){
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

export function normalizeImageZoom(value){
  return round(clamp(value, IMAGE_ZOOM_MIN, IMAGE_ZOOM_MAX), 2);
}

export function getMaxImageOffset(zoom){
  const safeZoom = normalizeImageZoom(zoom);
  if (safeZoom <= 1) return 0;
  return round((safeZoom - 1) / 2, 3);
}

export function normalizeImageOffset(value, zoom){
  const maxOffset = getMaxImageOffset(zoom);
  return round(clamp(value, -maxOffset, maxOffset), 3);
}

export function normalizeImageSource(value){
  const source = String(value || "").trim();
  if (!source) return "";
  return source;
}

function isImageBlob(value){
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function createImageObjectUrl(blob){
  if (!isImageBlob(blob) || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return "";
  const source = URL.createObjectURL(blob);
  ownedImageObjectUrls.set(source, 1);
  return source;
}

function retainImageObjectUrl(source){
  if (!source || !ownedImageObjectUrls.has(source)) return;
  ownedImageObjectUrls.set(source, ownedImageObjectUrls.get(source) + 1);
}

function releaseImageObjectUrl(source){
  if (!source || !ownedImageObjectUrls.has(source)) return;
  const nextCount = Math.max(0, ownedImageObjectUrls.get(source) - 1);
  if (nextCount > 0) {
    ownedImageObjectUrls.set(source, nextCount);
    return;
  }
  ownedImageObjectUrls.delete(source);
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  try { URL.revokeObjectURL(source); } catch {}
}

export function normalizeImageState(rawState = {}){
  const zoom = normalizeImageZoom(rawState.zoom);
  const hasImage = Boolean(normalizeImageSource(rawState.source));

  return {
    source: normalizeImageSource(rawState.source),
    sourceKind: ["file", "url"].includes(String(rawState.sourceKind || "").trim())
      ? String(rawState.sourceKind).trim()
      : "",
    imageName: String(rawState.imageName || "").trim(),
    naturalWidth: Math.max(0, Math.trunc(Number(rawState.naturalWidth) || 0)),
    naturalHeight: Math.max(0, Math.trunc(Number(rawState.naturalHeight) || 0)),
    zoom: hasImage ? zoom : 1,
    offsetX: hasImage ? normalizeImageOffset(rawState.offsetX, zoom) : 0,
    offsetY: hasImage ? normalizeImageOffset(rawState.offsetY, zoom) : 0,
    preserveProportions: rawState.preserveProportions !== false,
    loadError: String(rawState.loadError || "").trim(),
    updatedAt: Math.max(0, Math.trunc(Number(rawState.updatedAt) || 0))
  };
}


export function getImageAspectRatio(rawState = {}){
  const state = normalizeImageState(rawState);
  if (!state.source) return IMAGE_EMPTY_LAYOUT_ASPECT_RATIO;
  if (!state.preserveProportions) return 0;
  if (state.naturalWidth <= 0 || state.naturalHeight <= 0) return 0;
  const ratio = state.naturalWidth / state.naturalHeight;
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
}

export function createInitialImageState(){
  return normalizeImageState();
}

export function createImageProjectorState({ state } = {}){
  return normalizeImageState(state);
}

export function cloneImageState(rawState = {}){
  const state = normalizeImageState(rawState);
  retainImageObjectUrl(state.source);
  return state;
}

export function disposeImageState(rawState = {}){
  const state = normalizeImageState(rawState);
  releaseImageObjectUrl(state.source);
}

export function applyImageAction({ action, payload = {}, state } = {}){
  const safeAction = String(action || "").trim();
  const currentState = normalizeImageState(state);

  if (safeAction === "set-image") {
    const isLocalBlob = isImageBlob(payload?.blob);
    const source = isLocalBlob
      ? createImageObjectUrl(payload.blob)
      : normalizeImageSource(payload?.source);
    if (!source) return { error: "Aucune image à charger." };

    releaseImageObjectUrl(currentState.source);

    return {
      patch: {
        state: normalizeImageState({
          source,
          sourceKind: isLocalBlob
            ? "file"
            : (
              ["file", "url"].includes(String(payload?.sourceKind || "").trim())
                ? String(payload.sourceKind).trim()
                : "url"
            ),
          imageName: String(payload?.imageName || "Image").trim(),
          naturalWidth: payload?.naturalWidth,
          naturalHeight: payload?.naturalHeight,
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
          preserveProportions: currentState.preserveProportions,
          loadError: "",
          updatedAt: Date.now()
        })
      }
    };
  }

  if (safeAction === "clear-image") {
    releaseImageObjectUrl(currentState.source);
    return { patch: { state: createInitialImageState() } };
  }

  if (safeAction === "set-load-error") {
    return {
      patch: {
        state: normalizeImageState({
          ...currentState,
          loadError: String(payload?.message || "Impossible de charger l’image.").trim(),
          updatedAt: Date.now()
        })
      }
    };
  }

  if (safeAction === "set-preserve-proportions") {
    return {
      patch: {
        state: normalizeImageState({
          ...currentState,
          preserveProportions: payload?.preserveProportions !== false,
          offsetX: 0,
          offsetY: 0,
          updatedAt: Date.now()
        })
      }
    };
  }

  if (!currentState.source) return null;

  if (safeAction === "adjust-zoom") {
    const delta = Number(payload?.delta) || 0;
    const nextZoom = normalizeImageZoom(currentState.zoom + delta);
    return {
      patch: {
        state: normalizeImageState({
          ...currentState,
          zoom: nextZoom,
          offsetX: normalizeImageOffset(currentState.offsetX, nextZoom),
          offsetY: normalizeImageOffset(currentState.offsetY, nextZoom),
          updatedAt: Date.now()
        })
      }
    };
  }

  if (safeAction === "center") {
    return {
      patch: {
        state: normalizeImageState({
          ...currentState,
          zoom: 1,
          offsetX: 0,
          offsetY: 0,
          loadError: "",
          updatedAt: Date.now()
        })
      }
    };
  }

  if (safeAction === "set-offset") {
    return {
      patch: {
        state: normalizeImageState({
          ...currentState,
          offsetX: normalizeImageOffset(payload?.offsetX, currentState.zoom),
          offsetY: normalizeImageOffset(payload?.offsetY, currentState.zoom),
          updatedAt: Date.now()
        })
      }
    };
  }

  return null;
}
