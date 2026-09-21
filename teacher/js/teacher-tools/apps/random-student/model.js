const HISTORY_LIMIT = 10;
const TEXT_LIMIT = 20000;

export const RESULT_SCALE_MIN = 0.7;
export const RESULT_SCALE_MAX = 1.6;
export const RESULT_SCALE_STEP = 0.1;
export const RESULT_SCALE_DEFAULT = 1;
export const RESULT_POSITION_MIN = -1;
export const RESULT_POSITION_MAX = 1;

export function normalizeResultPosition(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(RESULT_POSITION_MIN, Math.min(RESULT_POSITION_MAX, number));
}

function clampText(value){
  return String(value ?? "").replace(/\r/g, "").slice(0, TEXT_LIMIT);
}

function uniqueStrings(values){
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter(Boolean)));
}

function stableHash(value){
  const text = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function normalizeResultScale(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return RESULT_SCALE_DEFAULT;
  const stepped = Math.round(number / RESULT_SCALE_STEP) * RESULT_SCALE_STEP;
  return Math.max(RESULT_SCALE_MIN, Math.min(RESULT_SCALE_MAX, Number(stepped.toFixed(2))));
}

export function parseRandomDrawItems(text){
  const occurrences = new Map();
  return clampText(text)
    .split("\n")
    .map((line) => String(line || "").trim())
    .filter(Boolean)
    .map((label) => {
      const occurrence = (occurrences.get(label) || 0) + 1;
      occurrences.set(label, occurrence);
      return {
        id: `item-${stableHash(label)}-${occurrence}`,
        label
      };
    });
}

function normalizeItemEntries(values, validItemsById, allowedIds){
  return (Array.isArray(values) ? values : [])
    .map((entry) => {
      const id = String(entry?.id || "").trim();
      const item = validItemsById.get(id);
      if (!item || (allowedIds && !allowedIds.has(id))) return null;
      return item;
    })
    .filter(Boolean);
}

export function normalizeRandomDrawState(rawState = {}){
  const itemsText = clampText(rawState.itemsText);
  const items = parseRandomDrawItems(itemsText);
  const validItemsById = new Map(items.map((item) => [item.id, item]));
  const validIds = new Set(validItemsById.keys());
  const excludedItemIds = uniqueStrings(rawState.excludedItemIds).filter((id) => validIds.has(id));
  const excluded = new Set(excludedItemIds);
  const activeIds = new Set(items.filter((item) => !excluded.has(item.id)).map((item) => item.id));
  const drawnIds = uniqueStrings(rawState.drawnIds).filter((id) => activeIds.has(id));
  const currentItemId = String(rawState.currentItem?.id || "").trim();
  const currentItem = activeIds.has(currentItemId) ? validItemsById.get(currentItemId) || null : null;
  const history = normalizeItemEntries(rawState.history, validItemsById, activeIds).slice(0, HISTORY_LIMIT);
  const lastDrawPool = normalizeItemEntries(rawState.lastDrawPool, validItemsById, activeIds);

  return {
    itemsText,
    avoidRepeats: rawState.avoidRepeats !== false,
    resultScale: normalizeResultScale(rawState.resultScale),
    resultPositionX: normalizeResultPosition(rawState.resultPositionX),
    resultPositionY: normalizeResultPosition(rawState.resultPositionY),
    drawSerial: Math.max(0, Math.trunc(Number(rawState.drawSerial) || 0)),
    excludedItemIds,
    drawnIds,
    currentItem,
    history,
    lastDrawPool
  };
}

export function createInitialRandomDrawState(){
  return normalizeRandomDrawState({ avoidRepeats: true, resultScale: RESULT_SCALE_DEFAULT });
}

export function createRandomDrawProjectorState({ state } = {}){
  const normalized = normalizeRandomDrawState(state);
  const items = parseRandomDrawItems(normalized.itemsText);
  const excluded = new Set(normalized.excludedItemIds);
  const activeItems = items.filter((item) => !excluded.has(item.id));
  const drawn = new Set(normalized.drawnIds);
  const remainingCount = normalized.avoidRepeats
    ? activeItems.filter((item) => !drawn.has(item.id)).length
    : activeItems.length;

  return {
    ...normalized,
    items,
    activeItems,
    sourceCount: items.length,
    totalCount: activeItems.length,
    disabledCount: Math.max(0, items.length - activeItems.length),
    remainingCount,
    updatedAt: Date.now()
  };
}

function pickRandom(items){
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)] || null;
}

function resetDrawState(state){
  return {
    ...state,
    drawnIds: [],
    currentItem: null,
    history: [],
    lastDrawPool: []
  };
}

export function applyRandomDrawAction({ action, payload = {}, state } = {}){
  const safeAction = String(action || "").trim();
  const current = normalizeRandomDrawState(state);

  if (safeAction === "set-items-text") {
    const itemsText = clampText(payload?.text);
    const nextItems = parseRandomDrawItems(itemsText);
    const validIds = new Set(nextItems.map((item) => item.id));
    return {
      patch: {
        state: normalizeRandomDrawState(resetDrawState({
          ...current,
          itemsText,
          excludedItemIds: current.excludedItemIds.filter((id) => validIds.has(id)),
          drawSerial: current.drawSerial
        }))
      }
    };
  }

  if (safeAction === "set-item-included") {
    const itemId = String(payload?.itemId || "").trim();
    const items = parseRandomDrawItems(current.itemsText);
    const validIds = new Set(items.map((item) => item.id));
    if (!itemId || !validIds.has(itemId)) return null;

    const excludedItemIds = new Set(current.excludedItemIds.filter((id) => validIds.has(id)));
    if (payload?.included === false) excludedItemIds.add(itemId);
    else excludedItemIds.delete(itemId);

    return {
      patch: {
        state: normalizeRandomDrawState({
          ...current,
          excludedItemIds: Array.from(excludedItemIds)
        })
      }
    };
  }

  if (safeAction === "set-avoid-repeats") {
    return {
      patch: {
        state: normalizeRandomDrawState({
          ...current,
          avoidRepeats: payload?.avoidRepeats !== false,
          drawnIds: payload?.avoidRepeats === false ? [] : current.drawnIds
        })
      }
    };
  }

  if (safeAction === "adjust-result-scale") {
    return {
      patch: {
        state: normalizeRandomDrawState({
          ...current,
          resultScale: normalizeResultScale(current.resultScale + (Number(payload?.delta) || 0))
        })
      }
    };
  }

  if (safeAction === "set-result-position") {
    return {
      patch: {
        state: normalizeRandomDrawState({
          ...current,
          resultPositionX: normalizeResultPosition(payload?.positionX),
          resultPositionY: normalizeResultPosition(payload?.positionY)
        })
      }
    };
  }

  if (safeAction === "center-result") {
    return {
      patch: { state: normalizeRandomDrawState({ ...current, resultPositionX: 0, resultPositionY: 0 }) }
    };
  }

  if (safeAction === "reset") {
    return {
      patch: { state: normalizeRandomDrawState({ ...resetDrawState(current), resultPositionX: 0, resultPositionY: 0 }) },
      message: "Tirage réinitialisé."
    };
  }

  const items = parseRandomDrawItems(current.itemsText);
  const excluded = new Set(current.excludedItemIds);
  const activeItems = items.filter((item) => !excluded.has(item.id));
  const activeIds = new Set(activeItems.map((item) => item.id));

  if (safeAction === "force-draw") {
    const itemId = String(payload?.itemId || "").trim();
    const picked = activeItems.find((item) => item.id === itemId) || null;
    if (!picked) return { error: "Cet élément doit être actif pour pouvoir être tiré." };

    const drawnIds = current.drawnIds.filter((id) => activeIds.has(id));
    const pool = current.avoidRepeats
      ? activeItems.filter((item) => !drawnIds.includes(item.id) || item.id === picked.id)
      : activeItems;

    return {
      patch: {
        state: normalizeRandomDrawState({
          ...current,
          drawSerial: current.drawSerial + 1,
          drawnIds: current.avoidRepeats ? uniqueStrings([...drawnIds, picked.id]) : [],
          currentItem: picked,
          lastDrawPool: pool,
          history: [picked, ...current.history].slice(0, HISTORY_LIMIT)
        })
      }
    };
  }

  if (safeAction !== "draw") return null;

  if (!items.length) return { error: "Ajoute au moins un élément à tirer au sort." };
  if (!activeItems.length) return { error: "Active au moins un élément dans la liste de tirage." };

  let drawnIds = current.drawnIds.filter((id) => activeIds.has(id));
  let pool = current.avoidRepeats
    ? activeItems.filter((item) => !drawnIds.includes(item.id))
    : activeItems;
  let message = "";

  if (!pool.length && current.avoidRepeats) {
    drawnIds = [];
    pool = activeItems;
    message = "Tous les éléments actifs avaient été tirés : le tirage repart du début.";
  }

  const picked = pickRandom(pool);
  if (!picked) return null;

  return {
    patch: {
      state: normalizeRandomDrawState({
        ...current,
        drawSerial: current.drawSerial + 1,
        drawnIds: current.avoidRepeats ? uniqueStrings([...drawnIds, picked.id]) : [],
        currentItem: picked,
        lastDrawPool: pool,
        history: [picked, ...current.history].slice(0, HISTORY_LIMIT)
      })
    },
    message
  };
}
