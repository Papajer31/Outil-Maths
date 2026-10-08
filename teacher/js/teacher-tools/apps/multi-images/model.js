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
export const MULTI_IMAGES_DEFAULT_GRID_COLOR = "#64748b";
export const MULTI_IMAGES_MAX_IMAGES = 80;
export const MULTI_IMAGES_GAP_DEFAULT = 10;
export const MULTI_IMAGES_BOARD_LAYOUT_AUTO = "auto";
export const MULTI_IMAGES_BOARD_LAYOUT_CUSTOM = "custom";
export const MULTI_IMAGES_BOARD_DIMENSION_MIN = 1;
export const MULTI_IMAGES_BOARD_DIMENSION_MAX = MULTI_IMAGES_MAX_IMAGES;

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
  return String(value || "").trim() === MULTI_IMAGES_MODE_GALLERY
    ? MULTI_IMAGES_MODE_GALLERY
    : MULTI_IMAGES_MODE_BOARD;
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

export function normalizeMultiImagesBoardLayout(value){
  return String(value || "").trim() === MULTI_IMAGES_BOARD_LAYOUT_CUSTOM
    ? MULTI_IMAGES_BOARD_LAYOUT_CUSTOM
    : MULTI_IMAGES_BOARD_LAYOUT_AUTO;
}

function normalizeBoardDimension(value, fallback = MULTI_IMAGES_BOARD_DIMENSION_MIN){
  return normalizeInteger(
    value,
    fallback,
    MULTI_IMAGES_BOARD_DIMENSION_MIN,
    MULTI_IMAGES_BOARD_DIMENSION_MAX
  );
}

function ensureCustomGridCapacity({ rows, columns, count } = {}){
  const safeRows = normalizeBoardDimension(rows);
  const safeColumns = normalizeBoardDimension(columns);
  const safeCount = Math.max(0, Math.trunc(Number(count) || 0));
  if (!safeCount || safeRows * safeColumns >= safeCount) {
    return { rows: safeRows, columns: safeColumns };
  }
  return {
    rows: Math.min(
      MULTI_IMAGES_BOARD_DIMENSION_MAX,
      Math.max(safeRows, Math.ceil(safeCount / safeColumns))
    ),
    columns: safeColumns
  };
}

function computeDefaultCustomGrid(count, ratio = 16 / 9){
  const safeCount = Math.max(1, Math.trunc(Number(count) || 1));
  const safeRatio = Number.isFinite(Number(ratio)) && Number(ratio) > 0 ? Number(ratio) : 16 / 9;
  let best = { columns: safeCount, rows: 1, score: Number.POSITIVE_INFINITY };

  for (let columns = 1; columns <= safeCount; columns += 1) {
    const rows = Math.ceil(safeCount / columns);
    const gridRatio = columns / rows;
    const emptyCells = (columns * rows) - safeCount;
    const score = Math.abs(Math.log(gridRatio / safeRatio)) + emptyCells * 0.055;
    if (score < best.score) best = { columns, rows, score };
  }

  return { rows: best.rows, columns: best.columns };
}

export function normalizeMultiImageItem(rawItem = {}){
  const source = String(rawItem?.source || "").trim();
  if (!source) return null;
  return {
    id: String(rawItem?.id || "").trim() || createImageId(),
    source,
    sourceKind: ["file", "url", "resource"].includes(String(rawItem?.sourceKind || "").trim())
      ? String(rawItem.sourceKind).trim()
      : "",
    resourceId: String(rawItem?.resourceId || "").trim(),
    mimeType: String(rawItem?.mimeType || "").trim(),
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
  const mode = normalizeMultiImagesMode(rawState.mode);
  const boardLayout = normalizeMultiImagesBoardLayout(rawState.boardLayout);
  const baseBoardGrid = {
    rows: normalizeBoardDimension(rawState.boardRows),
    columns: normalizeBoardDimension(rawState.boardColumns)
  };
  const boardGrid = boardLayout === MULTI_IMAGES_BOARD_LAYOUT_CUSTOM
    ? ensureCustomGridCapacity({ ...baseBoardGrid, count: images.length })
    : baseBoardGrid;
  const hasExplicitActiveIndex = rawState.activeIndex !== null
    && rawState.activeIndex !== undefined
    && Number.isFinite(Number(rawState.activeIndex));
  let activeIndex = -1;

  if (images.length) {
    if (hasExplicitActiveIndex) {
      const requestedIndex = Math.trunc(Number(rawState.activeIndex));
      activeIndex = requestedIndex < 0
        ? -1
        : Math.max(0, Math.min(images.length - 1, requestedIndex));
    } else if (mode === MULTI_IMAGES_MODE_GALLERY) {
      activeIndex = 0;
    }
  }

  if (mode === MULTI_IMAGES_MODE_GALLERY && images.length && activeIndex < 0) {
    activeIndex = 0;
  }

  return {
    images,
    mode,
    fit: normalizeMultiImagesFit(rawState.fit),
    gap: normalizeMultiImagesGap(rawState.gap),
    background: normalizeMultiImagesBackground(rawState.background),
    backgroundColor: normalizeMultiImagesBackgroundColor(rawState),
    gridColor: normalizeColorPickerValue(rawState.gridColor, MULTI_IMAGES_DEFAULT_GRID_COLOR),
    boardLayout,
    boardRows: boardGrid.rows,
    boardColumns: boardGrid.columns,
    activeIndex,
    updatedAt: Math.max(0, Math.trunc(Number(rawState.updatedAt) || 0))
  };
}

export function createInitialMultiImagesState(){
  return normalizeMultiImagesState({
    images: [],
    mode: MULTI_IMAGES_MODE_BOARD,
    fit: MULTI_IMAGES_FIT_CONTAIN,
    gap: MULTI_IMAGES_GAP_DEFAULT,
    background: MULTI_IMAGES_BACKGROUND_COLOR,
    backgroundColor: MULTI_IMAGES_DEFAULT_BACKGROUND_COLOR,
    boardLayout: MULTI_IMAGES_BOARD_LAYOUT_AUTO,
    boardRows: MULTI_IMAGES_BOARD_DIMENSION_MIN,
    boardColumns: MULTI_IMAGES_BOARD_DIMENSION_MIN,
    activeIndex: -1,
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
      : (["file", "url", "resource"].includes(String(payload?.sourceKind || "").trim()) ? String(payload.sourceKind).trim() : "url"),
    resourceId: String(payload?.resourceId || "").trim(),
    mimeType: String(payload?.mimeType || "").trim(),
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
          activeIndex: currentState.mode === MULTI_IMAGES_MODE_GALLERY ? 0 : -1
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
          activeIndex: currentState.images.length
            ? currentState.activeIndex
            : (currentState.mode === MULTI_IMAGES_MODE_GALLERY ? 0 : -1)
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
    const rawIndex = Number(payload?.index);
    const index = Number.isFinite(rawIndex)
      ? Math.max(0, Math.min(currentState.images.length - 1, Math.trunc(rawIndex)))
      : currentState.activeIndex;
    if (index < 0 || index >= currentState.images.length) return null;

    const activeImageId = currentState.activeIndex >= 0
      ? currentState.images[currentState.activeIndex]?.id || ""
      : "";
    const removed = currentState.images[index];
    releaseImageObjectUrl(removed?.source);
    const nextImages = currentState.images.filter((_, itemIndex) => itemIndex !== index);

    let nextActiveIndex = -1;
    if (activeImageId && activeImageId !== removed?.id) {
      nextActiveIndex = nextImages.findIndex((image) => image.id === activeImageId);
    } else if (currentState.mode === MULTI_IMAGES_MODE_GALLERY && nextImages.length) {
      nextActiveIndex = Math.min(index, nextImages.length - 1);
    }

    return {
      patch: {
        state: patchState(currentState, {
          images: nextImages,
          activeIndex: nextActiveIndex
        })
      }
    };
  }

  if (safeAction === "remove-active") {
    if (currentState.activeIndex < 0) return null;
    return applyMultiImagesAction({
      action: "remove-image",
      payload: { index: currentState.activeIndex },
      state: currentState
    });
  }

  if (safeAction === "move-image") {
    if (currentState.images.length <= 1) return null;
    const fromIndex = normalizeInteger(payload?.fromIndex, currentState.activeIndex, 0, currentState.images.length - 1);
    const toIndex = normalizeInteger(payload?.toIndex, fromIndex, 0, currentState.images.length - 1);
    if (fromIndex === toIndex) return null;

    const activeImageId = currentState.activeIndex >= 0
      ? currentState.images[currentState.activeIndex]?.id || ""
      : "";
    const nextImages = [...currentState.images];
    const [movedImage] = nextImages.splice(fromIndex, 1);
    nextImages.splice(toIndex, 0, movedImage);
    const nextActiveIndex = activeImageId
      ? nextImages.findIndex((image) => image.id === activeImageId)
      : -1;

    return {
      patch: {
        state: patchState(currentState, {
          images: nextImages,
          activeIndex: nextActiveIndex
        })
      }
    };
  }

  if (safeAction === "shuffle-images") {
    if (currentState.images.length <= 1) return null;

    const activeImageId = currentState.activeIndex >= 0
      ? currentState.images[currentState.activeIndex]?.id || ""
      : "";
    const nextImages = [...currentState.images];
    for (let index = nextImages.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [nextImages[index], nextImages[swapIndex]] = [nextImages[swapIndex], nextImages[index]];
    }

    const orderUnchanged = nextImages.every((image, index) => image.id === currentState.images[index]?.id);
    if (orderUnchanged && nextImages.length > 1) {
      [nextImages[0], nextImages[1]] = [nextImages[1], nextImages[0]];
    }

    const nextActiveIndex = activeImageId
      ? nextImages.findIndex((image) => image.id === activeImageId)
      : -1;
    return {
      patch: {
        state: patchState(currentState, {
          images: nextImages,
          activeIndex: nextActiveIndex
        })
      }
    };
  }

  if (safeAction === "set-mode") {
    const mode = normalizeMultiImagesMode(payload?.mode);
    const activeIndex = mode === MULTI_IMAGES_MODE_GALLERY
      && currentState.images.length
      && currentState.activeIndex < 0
      ? 0
      : currentState.activeIndex;
    return { patch: { state: patchState(currentState, { mode, activeIndex }) } };
  }

  if (safeAction === "set-board-layout") {
    const boardLayout = normalizeMultiImagesBoardLayout(payload?.boardLayout);
    let boardRows = currentState.boardRows;
    let boardColumns = currentState.boardColumns;

    if (boardLayout === MULTI_IMAGES_BOARD_LAYOUT_CUSTOM
      && currentState.boardLayout !== MULTI_IMAGES_BOARD_LAYOUT_CUSTOM
      && currentState.images.length
      && boardRows * boardColumns < currentState.images.length) {
      const defaultGrid = computeDefaultCustomGrid(currentState.images.length);
      boardRows = defaultGrid.rows;
      boardColumns = defaultGrid.columns;
    }

    return {
      patch: {
        state: patchState(currentState, { boardLayout, boardRows, boardColumns })
      }
    };
  }

  if (safeAction === "set-board-rows") {
    const boardRows = normalizeBoardDimension(payload?.boardRows, currentState.boardRows);
    const minimumColumns = currentState.images.length
      ? Math.ceil(currentState.images.length / boardRows)
      : MULTI_IMAGES_BOARD_DIMENSION_MIN;
    const boardColumns = Math.min(
      MULTI_IMAGES_BOARD_DIMENSION_MAX,
      Math.max(currentState.boardColumns, minimumColumns)
    );
    return {
      patch: {
        state: patchState(currentState, {
          boardLayout: MULTI_IMAGES_BOARD_LAYOUT_CUSTOM,
          boardRows,
          boardColumns
        })
      }
    };
  }

  if (safeAction === "set-board-columns") {
    const boardColumns = normalizeBoardDimension(payload?.boardColumns, currentState.boardColumns);
    const minimumRows = currentState.images.length
      ? Math.ceil(currentState.images.length / boardColumns)
      : MULTI_IMAGES_BOARD_DIMENSION_MIN;
    const boardRows = Math.min(
      MULTI_IMAGES_BOARD_DIMENSION_MAX,
      Math.max(currentState.boardRows, minimumRows)
    );
    return {
      patch: {
        state: patchState(currentState, {
          boardLayout: MULTI_IMAGES_BOARD_LAYOUT_CUSTOM,
          boardRows,
          boardColumns
        })
      }
    };
  }

  if (safeAction === "open-gallery") {
    if (!currentState.images.length) return null;
    const activeIndex = normalizeInteger(payload?.activeIndex, 0, 0, currentState.images.length - 1);
    return {
      patch: {
        state: patchState(currentState, {
          mode: MULTI_IMAGES_MODE_GALLERY,
          activeIndex
        })
      }
    };
  }

  if (safeAction === "set-background") {
    return { patch: { state: patchState(currentState, { backgroundColor: payload?.background }) } };
  }

  if (safeAction === "set-background-color") {
    return { patch: { state: patchState(currentState, { backgroundColor: payload?.backgroundColor }) } };
  }

  if (safeAction === "set-grid-color") {
    return { patch: { state: patchState(currentState, { gridColor: payload?.gridColor }) } };
  }

  if (safeAction === "set-active-index") {
    if (!currentState.images.length) return null;
    const requestedIndex = Math.trunc(Number(payload?.activeIndex));
    const activeIndex = Number.isFinite(requestedIndex)
      ? (requestedIndex < 0
        ? (currentState.mode === MULTI_IMAGES_MODE_GALLERY ? 0 : -1)
        : Math.max(0, Math.min(currentState.images.length - 1, requestedIndex)))
      : currentState.activeIndex;
    return {
      patch: {
        state: patchState(currentState, { activeIndex })
      }
    };
  }

  if (safeAction === "toggle-active-index") {
    if (!currentState.images.length) return null;
    const requestedIndex = normalizeInteger(payload?.activeIndex, -1, 0, currentState.images.length - 1);
    if (requestedIndex < 0) return null;
    const activeIndex = currentState.activeIndex === requestedIndex ? -1 : requestedIndex;
    return {
      patch: {
        state: patchState(currentState, {
          activeIndex: currentState.mode === MULTI_IMAGES_MODE_GALLERY ? requestedIndex : activeIndex
        })
      }
    };
  }

  if (safeAction === "next-image" || safeAction === "previous-image") {
    if (currentState.images.length <= 1) return null;
    const direction = safeAction === "next-image" ? 1 : -1;
    const baseIndex = currentState.activeIndex >= 0 ? currentState.activeIndex : 0;
    const nextIndex = (baseIndex + direction + currentState.images.length) % currentState.images.length;
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
