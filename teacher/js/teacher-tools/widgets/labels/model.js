import {
  normalizeColorPickerValue
} from "../../../../../shared/color-picker.js";
import { stripSimpleMarkup } from "../../../../../shared/simple-markup.js";

export const LABELS_FONT_SIZE_MIN = 18;
export const LABELS_FONT_SIZE_MAX = 96;
export const LABELS_BORDER_WIDTH_MIN = 0;
export const LABELS_BORDER_WIDTH_MAX = 8;
export const LABELS_BORDER_RADIUS_MIN = 0;
export const LABELS_BORDER_RADIUS_MAX = 24;
export const LABELS_PADDING_X_MIN = 8;
export const LABELS_PADDING_X_MAX = 40;
export const LABELS_PADDING_Y_MIN = 4;
export const LABELS_PADDING_Y_MAX = 26;
export const LABELS_MAX_LABELS = 80;
export const LABELS_FONT_ANDIKA = "andika";
export const LABELS_FONT_BELLEALLURE = "belleallure";
export const LABELS_FONT_SYSTEM = "system";
export const LABELS_DEMO_TEXT = "étiquette simple\nétiquette sur§plusieurs lignes\nmot en *gras*\nmot en _italique_\nmot en [couleur]";

const DEFAULT_LINES = "";
const DEFAULT_TEXT_COLOR = "#111827";
const DEFAULT_COLORED_TEXT_COLOR = "#9a3412";
const DEFAULT_BACKGROUND_COLOR = "#fffbe8";
const DEFAULT_BORDER_COLOR = "#d1a12b";
const DEFAULT_FONT_SIZE = 34;
const DEFAULT_BORDER_WIDTH = 2;
const DEFAULT_BORDER_RADIUS = 8;
const DEFAULT_PADDING_X = 18;
const DEFAULT_PADDING_Y = 10;
const FLOW_SCENE_WIDTH = 1280;
const FLOW_SCENE_HEIGHT = 720;
const FLOW_GAP_PX = 20;
const FLOW_START_X = FLOW_GAP_PX / FLOW_SCENE_WIDTH;
const FLOW_START_Y = FLOW_GAP_PX / FLOW_SCENE_HEIGHT;
const FLOW_GAP_X = FLOW_GAP_PX / FLOW_SCENE_WIDTH;
const FLOW_GAP_Y = FLOW_GAP_PX / FLOW_SCENE_HEIGHT;
const LABEL_ESTIMATED_CHAR_WIDTH = 0.56;
const LABEL_ESTIMATED_MIN_WIDTH = 64;
const LABEL_ESTIMATED_MIN_HEIGHT = 42;
const LABEL_ESTIMATED_MAX_WIDTH = 720;
const RANDOM_POSITION_ATTEMPTS = 90;
const POSITION_EPSILON = 0.0001;

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function normalizeInteger(value, min, max, fallback){
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function round(value, digits = 4){
  const factor = 10 ** digits;
  return Math.round(Number(value || 0) * factor) / factor;
}

function normalizePosition(value, fallback = 0){
  const number = Number(value);
  const fallbackNumber = Number(fallback);
  const safeValue = Number.isFinite(number)
    ? number
    : (Number.isFinite(fallbackNumber) ? fallbackNumber : 0);
  return round(clamp(safeValue, 0, 0.98), 4);
}

function normalizeFontFamily(value){
  const safeValue = String(value || "").trim();
  if (safeValue === LABELS_FONT_BELLEALLURE || safeValue === LABELS_FONT_SYSTEM) return safeValue;
  return LABELS_FONT_ANDIKA;
}

function normalizeLabelsStyle(style = {}){
  const sourceStyle = style && typeof style === "object" ? style : {};
  return {
    fontFamily: normalizeFontFamily(sourceStyle.fontFamily),
    fontSize: normalizeInteger(sourceStyle.fontSize, LABELS_FONT_SIZE_MIN, LABELS_FONT_SIZE_MAX, DEFAULT_FONT_SIZE),
    textColor: normalizeColorPickerValue(sourceStyle.textColor, DEFAULT_TEXT_COLOR),
    coloredTextColor: normalizeColorPickerValue(sourceStyle.coloredTextColor, DEFAULT_COLORED_TEXT_COLOR),
    backgroundColor: normalizeColorPickerValue(sourceStyle.backgroundColor, DEFAULT_BACKGROUND_COLOR),
    borderColor: normalizeColorPickerValue(sourceStyle.borderColor, DEFAULT_BORDER_COLOR),
    borderWidth: normalizeInteger(sourceStyle.borderWidth, LABELS_BORDER_WIDTH_MIN, LABELS_BORDER_WIDTH_MAX, DEFAULT_BORDER_WIDTH),
    borderRadius: normalizeInteger(sourceStyle.borderRadius, LABELS_BORDER_RADIUS_MIN, LABELS_BORDER_RADIUS_MAX, DEFAULT_BORDER_RADIUS),
    paddingX: normalizeInteger(sourceStyle.paddingX, LABELS_PADDING_X_MIN, LABELS_PADDING_X_MAX, DEFAULT_PADDING_X),
    paddingY: normalizeInteger(sourceStyle.paddingY, LABELS_PADDING_Y_MIN, LABELS_PADDING_Y_MAX, DEFAULT_PADDING_Y),
    shadow: sourceStyle.shadow !== false
  };
}

function createLabelId(index = 0){
  const random = Math.random().toString(36).slice(2, 8);
  const time = Date.now().toString(36);
  return `label-${Math.max(0, index)}-${time}-${random}`;
}

function createPlacementRequest(type, labelIds = []){
  const safeType = String(type || "").trim();
  const safeLabelIds = Array.isArray(labelIds)
    ? labelIds.map((labelId) => String(labelId || "").trim()).filter(Boolean)
    : [];
  if (!safeType) return null;
  return {
    id: `labels-placement-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    type: safeType,
    labelIds: safeLabelIds
  };
}

function normalizePlacementRequest(value){
  if (!value || typeof value !== "object") return null;
  const type = String(value.type || "").trim();
  const id = String(value.id || "").trim();
  if (!id || !["align", "place-new", "random"].includes(type)) return null;
  const labelIds = Array.isArray(value.labelIds)
    ? value.labelIds.map((labelId) => String(labelId || "").trim()).filter(Boolean)
    : [];
  if (type === "place-new" && !labelIds.length) return null;
  return {
    id,
    type,
    labelIds
  };
}

function normalizeLabelText(value){
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

export function getLabelLinesFromText(text){
  return getAllLabelLinesFromText(text).slice(0, LABELS_MAX_LABELS);
}

function getAllLabelLinesFromText(text){
  return String(text ?? "")
    .split(/\r?\n/g)
    .map(normalizeLabelText)
    .filter(Boolean);
}

function getVisibleTextLines(text){
  const visibleText = stripSimpleMarkup(text).replace(/\r\n?/g, "\n");
  const lines = visibleText.split("\n").map((line) => line.trim()).filter(Boolean);
  return lines.length ? lines : [""];
}

function estimateLabelSize(text, style = normalizeLabelsStyle()){
  const safeStyle = normalizeLabelsStyle(style);
  const isBelleAllure = safeStyle.fontFamily === LABELS_FONT_BELLEALLURE;
  const lines = getVisibleTextLines(text);
  const longestLineLength = Math.max(1, ...lines.map((line) => line.length));
  const fontSize = Math.max(1, Number(safeStyle.fontSize) || DEFAULT_FONT_SIZE);
  const borderWidth = Math.max(0, Number(safeStyle.borderWidth) || 0);
  const paddingX = Math.max(0, Number(safeStyle.paddingX) || 0) + (isBelleAllure ? 8 : 0);
  const paddingY = Math.max(0, Number(safeStyle.paddingY) || 0) + (isBelleAllure ? 7 : 0);
  const textWidth = longestLineLength * fontSize * LABEL_ESTIMATED_CHAR_WIDTH;
  const lineHeight = fontSize * (isBelleAllure ? 2 : 1.1);
  const widthPx = clamp(textWidth + (paddingX * 2) + (borderWidth * 2), LABEL_ESTIMATED_MIN_WIDTH, LABEL_ESTIMATED_MAX_WIDTH);
  const heightPx = Math.max(LABEL_ESTIMATED_MIN_HEIGHT, (lineHeight * lines.length) + (paddingY * 2) + (borderWidth * 2));
  return {
    width: round(clamp(widthPx / FLOW_SCENE_WIDTH, 0.04, 0.96), 4),
    height: round(clamp(heightPx / FLOW_SCENE_HEIGHT, 0.04, 0.96), 4)
  };
}

function createLabelRect({ text, x, y, style } = {}){
  const size = estimateLabelSize(text, style);
  return {
    x: normalizePosition(x, FLOW_START_X),
    y: normalizePosition(y, FLOW_START_Y),
    width: size.width,
    height: size.height
  };
}

function rectsOverlap(a, b, gapX = 0, gapY = 0){
  if (!a || !b) return false;
  return (
    a.x < b.x + b.width + gapX - POSITION_EPSILON
    && a.x + a.width + gapX > b.x + POSITION_EPSILON
    && a.y < b.y + b.height + gapY - POSITION_EPSILON
    && a.y + a.height + gapY > b.y + POSITION_EPSILON
  );
}

function getFirstCollision(candidate, occupiedRects){
  return (Array.isArray(occupiedRects) ? occupiedRects : [])
    .filter((rect) => rectsOverlap(candidate, rect, FLOW_GAP_X, FLOW_GAP_Y))
    .sort((a, b) => ((a.x + a.width) - (b.x + b.width)) || (a.y - b.y))[0] || null;
}

function findFirstFreePosition(text, style, occupiedRects = []){
  const size = estimateLabelSize(text, style);
  const maxX = Math.max(FLOW_START_X, 1 - size.width - FLOW_START_X);
  const maxY = Math.max(FLOW_START_Y, 1 - size.height - FLOW_START_Y);
  const rowStep = Math.max(size.height + FLOW_GAP_Y, 0.05);
  let y = FLOW_START_Y;

  while (y <= maxY + 0.0001) {
    let x = FLOW_START_X;
    let guard = 0;
    while (x <= maxX + 0.0001 && guard < 200) {
      const candidate = {
        x: round(x, 4),
        y: round(y, 4),
        width: size.width,
        height: size.height
      };
      const collision = getFirstCollision(candidate, occupiedRects);
      if (!collision) {
        return {
          x: normalizePosition(candidate.x),
          y: normalizePosition(candidate.y),
          width: size.width,
          height: size.height
        };
      }
      x = round(collision.x + collision.width + FLOW_GAP_X + POSITION_EPSILON, 4);
      guard += 1;
    }
    y = round(y + rowStep, 4);
  }

  return {
    x: normalizePosition(FLOW_START_X),
    y: normalizePosition(maxY),
    width: size.width,
    height: size.height
  };
}

function findRandomFreePosition(text, style, occupiedRects = []){
  const size = estimateLabelSize(text, style);
  const maxX = Math.max(FLOW_START_X, 1 - size.width - FLOW_START_X);
  const maxY = Math.max(FLOW_START_Y, 1 - size.height - FLOW_START_Y);

  for (let attempt = 0; attempt < RANDOM_POSITION_ATTEMPTS; attempt += 1) {
    const candidate = {
      x: round(FLOW_START_X + (Math.random() * Math.max(0, maxX - FLOW_START_X)), 4),
      y: round(FLOW_START_Y + (Math.random() * Math.max(0, maxY - FLOW_START_Y)), 4),
      width: size.width,
      height: size.height
    };
    if (!getFirstCollision(candidate, occupiedRects)) {
      return {
        x: normalizePosition(candidate.x),
        y: normalizePosition(candidate.y),
        width: size.width,
        height: size.height
      };
    }
  }

  return findFirstFreePosition(text, style, occupiedRects);
}

function getUsedLabelMatch(previousItems, text, usedIds, preferredIndex){
  const byIndex = previousItems[preferredIndex];
  if (byIndex && !usedIds.has(byIndex.id) && normalizeLabelText(byIndex.text) === text) return byIndex;
  return previousItems.find((item) => item && !usedIds.has(item.id) && normalizeLabelText(item.text) === text) || null;
}

function createItemsFromLines(lines, previousItems = [], style = normalizeLabelsStyle()){
  const safeLines = Array.isArray(lines) ? lines.map(normalizeLabelText).filter(Boolean).slice(0, LABELS_MAX_LABELS) : [];
  const safePreviousItems = Array.isArray(previousItems) ? previousItems : [];
  const usedIds = new Set();
  const entries = safeLines.map((text, index) => {
    const match = getUsedLabelMatch(safePreviousItems, text, usedIds, index);
    const id = String(match?.id || createLabelId(index)).trim();
    usedIds.add(id);
    return { id, text, match };
  });
  const occupiedRects = entries
    .filter((entry) => entry.match)
    .map((entry) => createLabelRect({
      text: entry.text,
      x: entry.match.x,
      y: entry.match.y,
      style
    }));

  return entries.map((entry) => {
    if (entry.match) {
      return {
        id: entry.id,
        text: entry.text,
        x: normalizePosition(entry.match.x, FLOW_START_X),
        y: normalizePosition(entry.match.y, FLOW_START_Y)
      };
    }
    const position = findFirstFreePosition(entry.text, style, occupiedRects);
    occupiedRects.push(createLabelRect({ text: entry.text, x: position.x, y: position.y, style }));
    return {
      id: entry.id,
      text: entry.text,
      x: position.x,
      y: position.y
    };
  });
}

function normalizeItems(rawItems = [], fallbackText = DEFAULT_LINES, style = normalizeLabelsStyle()){
  const lines = getLabelLinesFromText(fallbackText);
  const sourceItems = Array.isArray(rawItems) ? rawItems : [];
  if (!sourceItems.length) return createItemsFromLines(lines, [], style);

  const seen = new Set();
  const occupiedRects = [];
  const items = sourceItems.map((item, index) => {
    const text = normalizeLabelText(item?.text);
    if (!text) return null;
    let id = String(item?.id || "").trim();
    if (!id || seen.has(id)) id = createLabelId(index);
    seen.add(id);
    const fallbackPosition = findFirstFreePosition(text, style, occupiedRects);
    const normalizedItem = {
      id,
      text,
      x: normalizePosition(item?.x, fallbackPosition.x),
      y: normalizePosition(item?.y, fallbackPosition.y)
    };
    occupiedRects.push(createLabelRect({ ...normalizedItem, style }));
    return normalizedItem;
  }).filter(Boolean).slice(0, LABELS_MAX_LABELS);

  if (items.length) return items;
  return createItemsFromLines(lines, [], style);
}

export function getLabelsFontFamilyCss(fontFamily){
  const safeFontFamily = normalizeFontFamily(fontFamily);
  if (safeFontFamily === LABELS_FONT_BELLEALLURE) return "BelleAllure, cursive";
  if (safeFontFamily === LABELS_FONT_SYSTEM) return "system-ui, sans-serif";
  return "Andika, system-ui, sans-serif";
}

export function normalizeLabelsState(rawState = {}){
  const sourceState = rawState && typeof rawState === "object" ? rawState : {};
  const hasText = Object.prototype.hasOwnProperty.call(sourceState, "text");
  const hasItems = Object.prototype.hasOwnProperty.call(sourceState, "items");
  const isFreshState = !hasText && !hasItems;
  const textSource = hasText
    ? String(sourceState.text ?? "").trim()
    : (isFreshState ? DEFAULT_LINES : "");
  const style = normalizeLabelsStyle(sourceState.style);
  const items = normalizeItems(sourceState.items, textSource, style);
  const text = items.map((item) => item.text).join("\n") || textSource;
  const itemIds = new Set(items.map((item) => item.id));
  const placementRequest = normalizePlacementRequest(sourceState.placementRequest);
  const placementLabelIds = placementRequest
    ? placementRequest.labelIds.filter((labelId) => itemIds.has(labelId))
    : [];
  const safePlacementRequest = placementRequest && (placementRequest.type !== "place-new" || placementLabelIds.length)
    ? {
        ...placementRequest,
        labelIds: placementLabelIds
      }
    : null;

  return {
    text,
    items,
    placementRequest: safePlacementRequest,
    style
  };
}

export function createInitialLabelsState(){
  return normalizeLabelsState();
}

export function createLabelsProjectorState({ state } = {}){
  return normalizeLabelsState(state);
}

export function cloneLabelsState(rawState = {}){
  return normalizeLabelsState(rawState);
}

function withItemsText(state, items){
  return normalizeLabelsState({
    ...state,
    text: items.map((item) => item.text).join("\n"),
    items
  });
}

function shuffleArray(values){
  const items = values.slice();
  for (let index = items.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [items[index], items[other]] = [items[other], items[index]];
  }
  return items;
}

function shuffleItemContents(items = []){
  const sourceItems = Array.isArray(items) ? items : [];
  const texts = shuffleArray(sourceItems.map((item) => item.text));
  return sourceItems.map((item, index) => ({
    ...item,
    text: texts[index] || item.text
  }));
}

function alignItems(items = [], style = normalizeLabelsStyle()){
  const sourceItems = Array.isArray(items) ? items : [];
  const occupiedRects = [];
  return sourceItems.map((item) => {
    const position = findFirstFreePosition(item.text, style, occupiedRects);
    occupiedRects.push(createLabelRect({ text: item.text, x: position.x, y: position.y, style }));
    return {
      ...item,
      x: position.x,
      y: position.y
    };
  });
}

function randomizeItemPositions(items = [], style = normalizeLabelsStyle()){
  const sourceItems = Array.isArray(items) ? items : [];
  const occupiedRects = [];
  return sourceItems.map((item) => {
    const position = findRandomFreePosition(item.text, style, occupiedRects);
    occupiedRects.push(createLabelRect({ text: item.text, x: position.x, y: position.y, style }));
    return {
      ...item,
      x: position.x,
      y: position.y
    };
  });
}

function alignAndShuffleItems(items = [], style = normalizeLabelsStyle()){
  return alignItems(shuffleItemContents(items), style);
}

export function applyLabelsAction({ action, payload = {}, state } = {}){
  const safeAction = String(action || "").trim();
  const currentState = normalizeLabelsState(state);

  if (safeAction === "set-lines") {
    const rawLines = getAllLabelLinesFromText(payload?.text);
    const lines = rawLines.slice(0, LABELS_MAX_LABELS);
    const previousIds = new Set(currentState.items.map((item) => item.id));
    const nextItems = createItemsFromLines(lines, currentState.items, currentState.style);
    const newLabelIds = nextItems
      .filter((item) => !previousIds.has(item.id))
      .map((item) => item.id);
    const ignoredCount = Math.max(0, rawLines.length - lines.length);
    return {
      patch: {
        state: normalizeLabelsState({
          ...currentState,
          text: lines.join("\n"),
          items: nextItems,
          placementRequest: newLabelIds.length ? createPlacementRequest("place-new", newLabelIds) : null
        })
      },
      message: ignoredCount
        ? `${LABELS_MAX_LABELS} étiquettes maximum : ${ignoredCount} ligne${ignoredCount > 1 ? "s" : ""} ignorée${ignoredCount > 1 ? "s" : ""}.`
        : ""
    };
  }

  if (safeAction === "set-style") {
    return {
      patch: {
        state: normalizeLabelsState({
          ...currentState,
          style: {
            ...currentState.style,
            ...(payload && typeof payload === "object" ? payload : {})
          }
        })
      }
    };
  }

  if (safeAction === "move-label") {
    const labelId = String(payload?.labelId || "").trim();
    if (!labelId) return null;
    const nextItems = currentState.items.map((item) => (
      item.id === labelId
        ? {
            ...item,
            x: normalizePosition(payload?.x, item.x),
            y: normalizePosition(payload?.y, item.y)
          }
        : item
    ));
    return {
      patch: {
        state: normalizeLabelsState({
          ...withItemsText(currentState, nextItems),
          placementRequest: null
        })
      }
    };
  }

  if (safeAction === "set-label-positions") {
    const requestId = String(payload?.requestId || "").trim();
    if (requestId && currentState.placementRequest?.id && requestId !== currentState.placementRequest.id) return null;
    const positions = Array.isArray(payload?.positions) ? payload.positions : [];
    const positionsById = new Map();
    positions.forEach((position) => {
      const labelId = String(position?.labelId || "").trim();
      if (!labelId) return;
      positionsById.set(labelId, {
        x: normalizePosition(position?.x),
        y: normalizePosition(position?.y)
      });
    });
    if (!positionsById.size) return null;
    const nextItems = currentState.items.map((item) => {
      const position = positionsById.get(item.id);
      return position ? { ...item, ...position } : item;
    });
    return {
      patch: {
        state: normalizeLabelsState({
          ...withItemsText(currentState, nextItems),
          placementRequest: null
        })
      }
    };
  }

  if (safeAction === "delete-label") {
    const labelId = String(payload?.labelId || "").trim();
    if (!labelId) return null;
    const nextItems = currentState.items.filter((item) => item.id !== labelId);
    return {
      patch: {
        state: normalizeLabelsState({
          ...withItemsText(currentState, nextItems),
          placementRequest: null
        })
      },
      message: "Étiquette supprimée."
    };
  }

  if (safeAction === "clear-labels") {
    return {
      patch: {
        state: normalizeLabelsState({
          ...currentState,
          text: "",
          items: [],
          placementRequest: null
        })
      },
      message: currentState.items.length ? "Toutes les étiquettes ont été supprimées." : ""
    };
  }

  if (safeAction === "load-demo-labels") {
    const lines = getLabelLinesFromText(LABELS_DEMO_TEXT);
    const previousIds = new Set(currentState.items.map((item) => item.id));
    const nextItems = createItemsFromLines(lines, currentState.items, currentState.style);
    const newLabelIds = nextItems
      .filter((item) => !previousIds.has(item.id))
      .map((item) => item.id);
    return {
      patch: {
        state: normalizeLabelsState({
          ...currentState,
          text: lines.join("\n"),
          items: nextItems,
          placementRequest: nextItems.length ? createPlacementRequest("place-new", newLabelIds.length ? newLabelIds : nextItems.map((item) => item.id)) : null
        })
      },
      message: "Mots de démo chargés."
    };
  }

  if (safeAction === "shuffle-label-content") {
    return {
      patch: {
        state: normalizeLabelsState({
          ...withItemsText(currentState, shuffleItemContents(currentState.items)),
          placementRequest: null
        })
      }
    };
  }

  if (safeAction === "align-labels") {
    const nextItems = alignItems(currentState.items, currentState.style);
    return {
      patch: {
        state: normalizeLabelsState({
          ...withItemsText(currentState, nextItems),
          placementRequest: nextItems.length ? createPlacementRequest("align", nextItems.map((item) => item.id)) : null
        })
      }
    };
  }

  if (safeAction === "randomize-label-positions") {
    const nextItems = randomizeItemPositions(currentState.items, currentState.style);
    return {
      patch: {
        state: normalizeLabelsState({
          ...withItemsText(currentState, nextItems),
          placementRequest: nextItems.length ? createPlacementRequest("random", nextItems.map((item) => item.id)) : null
        })
      }
    };
  }

  if (safeAction === "align-shuffle") {
    const nextItems = alignAndShuffleItems(currentState.items, currentState.style);
    return {
      patch: {
        state: normalizeLabelsState({
          ...withItemsText(currentState, nextItems),
          placementRequest: nextItems.length ? createPlacementRequest("align", nextItems.map((item) => item.id)) : null
        })
      }
    };
  }

  return null;
}
