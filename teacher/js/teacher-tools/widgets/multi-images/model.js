import {
  normalizeColorPickerValue
} from "../../../../../shared/color-picker.js";

export const MULTI_IMAGES_MODE_GALLERY = "gallery";
export const MULTI_IMAGES_MODE_BOARD = "board";
export const MULTI_IMAGES_FIT_CONTAIN = "contain";
export const MULTI_IMAGES_BACKGROUND_COLOR = "color";
export const MULTI_IMAGES_BACKGROUND_TRANSPARENT = "transparent";
export const MULTI_IMAGES_BACKGROUND_WHITE = "white";
export const MULTI_IMAGES_DEFAULT_BACKGROUND_COLOR = "#ffffff";
export const MULTI_IMAGES_MAX_IMAGES = 80;
export const MULTI_IMAGES_GAP_DEFAULT = 10;

const ownedMultiImageObjectUrls = new Map();
const LEGACY_BACKGROUND_COLORS = Object.freeze({
  [MULTI_IMAGES_BACKGROUND_TRANSPARENT]: "rgba(255, 255, 255, 0)",
  [MULTI_IMAGES_BACKGROUND_WHITE]: MULTI_IMAGES_DEFAULT_BACKGROUND_COLOR
});

function normalizeInteger(value, fallback, min, max){
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function hasOwn(object, property){
  return Object.prototype.hasOwnProperty.call(object || {}, property);
}

function createImageId(){
  return `mi-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function isImageBlob(value){
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function createImageObjectUrl(blob){
  if (!isImageBlob(blob) || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") return "";
  const source = URL.createObjectURL(blob);
  ownedMultiImageObjectUrls.set(source, 1);
  return source;
}

function retainImageObjectUrl(source){
  if (!source || !ownedMultiImageObjectUrls.has(source)) return;
  ownedMultiImageObjectUrls.set(source, ownedMultiImageObjectUrls.get(source) + 1);
}

function releaseImageObjectUrl(source){
  if (!source || !ownedMultiImageObjectUrls.has(source)) return;
  const nextCount = Math.max(0, ownedMultiImageObjectUrls.get(source) - 1);
  if (nextCount > 0) {
    ownedMultiImageObjectUrls.set(source, nextCount);
    return;
  }
  ownedMultiImageObjectUrls.delete(source);
  if (typeof URL === "undefined" || typeof URL.revokeObjectURL !== "function") return;
  try { URL.revokeObjectURL(source); } catch {}
}

function releaseImages(images = []){
  (Array.isArray(images) ? images : []).forEach((image) => releaseImageObjectUrl(image?.source));
}

export function normalizeMultiImagesMode(value){
  return String(value || "").trim() === MULTI_IMAGES_MODE_BOARD
    ? MULTI_IMAGES_MODE_BOARD
    : MULTI_IMAGES_MODE_GALLERY;
}

export function normalizeMultiImagesFit(){
  return MULTI_IMAGES_FIT_CONTAIN;
}

export function normalizeMultiImagesBackground(value){
  return MULTI_IMAGES_BACKGROUND_COLOR;
}

export function normalizeMultiImagesBackgroundColor(rawState = {}){
  const source = hasOwn(rawState, "backgroundColor")
    ? rawState.backgroundColor
    : rawState.background;
  const safeSource = String(source || "").trim();
  return normalizeColorPickerValue(
    LEGACY_BACKGROUND_COLORS[safeSource] || safeSource,
    MULTI_IMAGES_DEFAULT_BACKGROUND_COLOR
  );
}

export function normalizeMultiImagesGap(){
  return MULTI_IMAGES_GAP_DEFAULT;
}

export function normalizeMultiImageItem(rawItem = {}){
  const source = String(rawItem?.source || "").trim();
  if (!source) return null;
  return {
    id: String(rawItem?.id || "").trim() || createImageId(),
    source,
    sourceKind: ["file", "url"].includes(String(rawItem?.sourceKind || "").trim())
      ? String(rawItem.sourceKind).trim()
      : "",
    imageName: String(rawItem?.imageName || "Image").trim() || "Image",
    naturalWidth: Math.max(0, Math.trunc(Number(rawItem?.naturalWidth) || 0)),
    naturalHeight: Math.max(0, Math.trunc(Number(rawItem?.naturalHeight) || 0)),
    loadError: String(rawItem?.loadError || "").trim(),
    updatedAt: Math.max(0, Math.trunc(Number(rawItem?.updatedAt) || 0))
  };
}

export function normalizeMultiImagesList(rawImages = []){
  return (Array.isArray(rawImages) ? rawImages : [])
    .map((item) => normalizeMultiImageItem(item))
    .filter(Boolean)
    .slice(0, MULTI_IMAGES_MAX_IMAGES);
}

export function normalizeMultiImagesState(rawState = {}){
  const images = normalizeMultiImagesList(rawState.images);
  const activeIndex = images.length
    ? normalizeInteger(rawState.activeIndex, 0, 0, images.length - 1)
    : 0;
  return {
    images,
    mode: normalizeMultiImagesMode(rawState.mode),
    fit: normalizeMultiImagesFit(rawState.fit),
    gap: normalizeMultiImagesGap(rawState.gap),
    background: normalizeMultiImagesBackground(rawState.background),
    backgroundColor: normalizeMultiImagesBackgroundColor(rawState),
    activeIndex,
    updatedAt: Math.max(0, Math.trunc(Number(rawState.updatedAt) || 0))
  };
}

export function createInitialMultiImagesState(){
  return normalizeMultiImagesState({
    images: [],
    mode: MULTI_IMAGES_MODE_GALLERY,
    fit: MULTI_IMAGES_FIT_CONTAIN,
    gap: MULTI_IMAGES_GAP_DEFAULT,
    background: MULTI_IMAGES_BACKGROUND_COLOR,
    backgroundColor: MULTI_IMAGES_DEFAULT_BACKGROUND_COLOR,
    activeIndex: 0,
    updatedAt: 0
  });
}

export function createMultiImagesProjectorState({ state } = {}){
  return normalizeMultiImagesState(state);
}

export function cloneMultiImagesState(rawState = {}){
  const state = normalizeMultiImagesState(rawState);
  state.images.forEach((image) => retainImageObjectUrl(image.source));
  return state;
}

export function disposeMultiImagesState(rawState = {}){
  const state = normalizeMultiImagesState(rawState);
  releaseImages(state.images);
}

function createItemFromPayload(payload = {}){
  const isLocalBlob = isImageBlob(payload?.blob);
  const source = isLocalBlob
    ? createImageObjectUrl(payload.blob)
    : String(payload?.source || "").trim();
  if (!source) return null;
  return normalizeMultiImageItem({
    id: payload?.id || createImageId(),
    source,
    sourceKind: isLocalBlob
      ? "file"
      : (["file", "url"].includes(String(payload?.sourceKind || "").trim()) ? String(payload.sourceKind).trim() : "url"),
    imageName: String(payload?.imageName || "Image").trim() || "Image",
    naturalWidth: payload?.naturalWidth,
    naturalHeight: payload?.naturalHeight,
    loadError: "",
    updatedAt: Date.now()
  });
}

function createItemsFromPayloads(payloads = [], { limit = Number.POSITIVE_INFINITY } = {}){
  const rawPayloads = Array.isArray(payloads) ? payloads : [];
  const numericLimit = Number(limit);
  const safeLimit = Number.isFinite(numericLimit)
    ? Math.max(0, Math.trunc(numericLimit))
    : Number.POSITIVE_INFINITY;
  if (safeLimit <= 0) return [];

  const items = [];
  for (const payload of rawPayloads) {
    if (items.length >= safeLimit) break;
    const item = createItemFromPayload(payload);
    if (item) items.push(item);
  }
  return items;
}

function patchState(currentState, patch = {}){
  return normalizeMultiImagesState({
    ...currentState,
    ...(patch && typeof patch === "object" ? patch : {}),
    updatedAt: Date.now()
  });
}

export function applyMultiImagesAction({ action, payload = {}, state } = {}){
  const safeAction = String(action || "").trim();
  const currentState = normalizeMultiImagesState(state);

  if (safeAction === "set-images") {
    const rawImages = Array.isArray(payload?.images) ? payload.images : [];
    const items = createItemsFromPayloads(rawImages, { limit: MULTI_IMAGES_MAX_IMAGES });
    if (!items.length) return { error: "Aucune image à charger." };
    releaseImages(currentState.images);
    return {
      patch: {
        state: patchState(currentState, {
          images: items,
          activeIndex: 0
        })
      },
      message: rawImages.length > MULTI_IMAGES_MAX_IMAGES
        ? `Certaines images n’ont pas été chargées : limite à ${MULTI_IMAGES_MAX_IMAGES}.`
        : ""
    };
  }

  if (safeAction === "add-images") {
    const availableSlots = Math.max(0, MULTI_IMAGES_MAX_IMAGES - currentState.images.length);
    if (availableSlots <= 0) return { error: `Limite : ${MULTI_IMAGES_MAX_IMAGES} images.` };
    const rawImages = Array.isArray(payload?.images) ? payload.images : [];
    const items = createItemsFromPayloads(rawImages, { limit: availableSlots });
    if (!items.length) return { error: currentState.images.length >= MULTI_IMAGES_MAX_IMAGES ? `Limite : ${MULTI_IMAGES_MAX_IMAGES} images.` : "Aucune image à ajouter." };
    const nextImages = [...currentState.images, ...items];
    return {
      patch: {
        state: patchState(currentState, {
          images: nextImages,
          activeIndex: currentState.images.length ? currentState.activeIndex : 0
        })
      },
      message: items.length < rawImages.length
        ? `Certaines images n’ont pas été ajoutées : limite à ${MULTI_IMAGES_MAX_IMAGES}.`
        : ""
    };
  }

  if (safeAction === "clear-images") {
    releaseImages(currentState.images);
    return { patch: { state: createInitialMultiImagesState() } };
  }

  if (safeAction === "remove-image") {
    if (!currentState.images.length) return null;
    const index = normalizeInteger(payload?.index, currentState.activeIndex, 0, currentState.images.length - 1);
    const removed = currentState.images[index];
    releaseImageObjectUrl(removed?.source);
    const nextImages = currentState.images.filter((_, itemIndex) => itemIndex !== index);
    return {
      patch: {
        state: patchState(currentState, {
          images: nextImages,
          activeIndex: nextImages.length ? Math.min(index, nextImages.length - 1) : 0
        })
      }
    };
  }

  if (safeAction === "remove-active") {
    return applyMultiImagesAction({
      action: "remove-image",
      payload: { index: currentState.activeIndex },
      state: currentState
    });
  }

  if (safeAction === "set-mode") {
    return { patch: { state: patchState(currentState, { mode: normalizeMultiImagesMode(payload?.mode) }) } };
  }

  if (safeAction === "set-background") {
    return { patch: { state: patchState(currentState, { backgroundColor: payload?.background }) } };
  }

  if (safeAction === "set-background-color") {
    return { patch: { state: patchState(currentState, { backgroundColor: payload?.backgroundColor }) } };
  }

  if (safeAction === "set-active-index") {
    if (!currentState.images.length) return null;
    return {
      patch: {
        state: patchState(currentState, {
          activeIndex: normalizeInteger(payload?.activeIndex, currentState.activeIndex, 0, currentState.images.length - 1)
        })
      }
    };
  }

  if (safeAction === "next-image" || safeAction === "previous-image") {
    if (currentState.images.length <= 1) return null;
    const direction = safeAction === "next-image" ? 1 : -1;
    const nextIndex = (currentState.activeIndex + direction + currentState.images.length) % currentState.images.length;
    return { patch: { state: patchState(currentState, { activeIndex: nextIndex }) } };
  }

  if (safeAction === "set-image-error") {
    const imageId = String(payload?.imageId || "").trim();
    const index = imageId
      ? currentState.images.findIndex((image) => image.id === imageId)
      : normalizeInteger(payload?.index, currentState.activeIndex, 0, Math.max(0, currentState.images.length - 1));
    if (index < 0 || index >= currentState.images.length) return null;
    const nextImages = currentState.images.map((image, itemIndex) => itemIndex === index
      ? { ...image, loadError: String(payload?.message || "Impossible de charger l’image.").trim(), updatedAt: Date.now() }
      : image);
    return { patch: { state: patchState(currentState, { images: nextImages }) } };
  }

  return null;
}
