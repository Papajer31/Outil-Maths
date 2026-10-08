export const IMAGE_LABELS_MAX_IMAGES = 100;
export const IMAGE_LABELS_MIN_PIXEL_SIZE = 28;

const STAGE_WIDTH = 1280;
const STAGE_HEIGHT = 720;
const INITIAL_LONG_EDGE_PX = 176;
const INITIAL_GAP_PX = 18;
const DUPLICATE_OFFSET_PX = 22;
const ownedObjectUrls = new Map();

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function round(value, digits = 5){
  const factor = 10 ** digits;
  return Math.round((Number(value) || 0) * factor) / factor;
}

function normalizeUnit(value, fallback = 0){
  const number = Number(value);
  return round(clamp(Number.isFinite(number) ? number : fallback, 0, 1), 5);
}

function createId(prefix = "image-label"){
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function isBlob(value){
  return typeof Blob !== "undefined" && value instanceof Blob;
}

function createObjectUrl(blob){
  if (!isBlob(blob) || typeof URL?.createObjectURL !== "function") return "";
  const source = URL.createObjectURL(blob);
  ownedObjectUrls.set(source, 1);
  return source;
}

function retainObjectUrl(source, count = 1){
  if (!ownedObjectUrls.has(source)) return;
  ownedObjectUrls.set(source, ownedObjectUrls.get(source) + Math.max(1, count));
}

function releaseObjectUrl(source, count = 1){
  if (!ownedObjectUrls.has(source)) return;
  const next = Math.max(0, ownedObjectUrls.get(source) - Math.max(1, count));
  if (next > 0) {
    ownedObjectUrls.set(source, next);
    return;
  }
  ownedObjectUrls.delete(source);
  try { URL.revokeObjectURL(source); } catch {}
}

function normalizeSourceKind(value){
  const kind = String(value || "").trim();
  return ["file", "resource", "url"].includes(kind) ? kind : "";
}

function normalizeDimensions(width, height){
  const naturalWidth = Math.max(0, Math.trunc(Number(width) || 0));
  const naturalHeight = Math.max(0, Math.trunc(Number(height) || 0));
  return { naturalWidth, naturalHeight };
}

function initialSize(naturalWidth, naturalHeight){
  const width = Math.max(1, Number(naturalWidth) || 1);
  const height = Math.max(1, Number(naturalHeight) || 1);
  const ratio = width / height;
  let pixelWidth;
  let pixelHeight;
  if (ratio >= 1) {
    pixelWidth = INITIAL_LONG_EDGE_PX;
    pixelHeight = INITIAL_LONG_EDGE_PX / ratio;
  } else {
    pixelHeight = INITIAL_LONG_EDGE_PX;
    pixelWidth = INITIAL_LONG_EDGE_PX * ratio;
  }
  const shortEdge = Math.min(pixelWidth, pixelHeight);
  if (shortEdge > 0 && shortEdge < IMAGE_LABELS_MIN_PIXEL_SIZE) {
    const minScale = IMAGE_LABELS_MIN_PIXEL_SIZE / shortEdge;
    pixelWidth *= minScale;
    pixelHeight *= minScale;
  }
  const maxScale = Math.min(1, (STAGE_WIDTH * 0.9) / pixelWidth, (STAGE_HEIGHT * 0.9) / pixelHeight);
  pixelWidth *= maxScale;
  pixelHeight *= maxScale;
  return {
    width: round(Math.max(0.0001, pixelWidth / STAGE_WIDTH), 5),
    height: round(Math.max(0.0001, pixelHeight / STAGE_HEIGHT), 5)
  };
}

function normalizeGeometry(item, fallback = {}){
  const dims = normalizeDimensions(item?.naturalWidth, item?.naturalHeight);
  const size = initialSize(dims.naturalWidth, dims.naturalHeight);
  const width = round(clamp(Number(item?.width) || Number(fallback.width) || size.width, 0.0001, 0.98), 5);
  const height = round(clamp(Number(item?.height) || Number(fallback.height) || size.height, 0.0001, 0.98), 5);
  return {
    x: round(clamp(Number(item?.x) || Number(fallback.x) || 0, 0, Math.max(0, 1 - width)), 5),
    y: round(clamp(Number(item?.y) || Number(fallback.y) || 0, 0, Math.max(0, 1 - height)), 5),
    width,
    height
  };
}

function normalizeItem(raw = {}, index = 0){
  const source = String(raw?.source || "").trim();
  if (!source) return null;
  const dimensions = normalizeDimensions(raw?.naturalWidth, raw?.naturalHeight);
  return {
    id:String(raw?.id || createId(`image-label-${index}`)).trim(),
    source,
    sourceKind:normalizeSourceKind(raw?.sourceKind),
    resourceId:String(raw?.resourceId || "").trim(),
    mimeType:String(raw?.mimeType || "").trim(),
    imageName:String(raw?.imageName || `Image ${index + 1}`).trim() || `Image ${index + 1}`,
    naturalWidth:dimensions.naturalWidth,
    naturalHeight:dimensions.naturalHeight,
    ...normalizeGeometry({ ...raw, ...dimensions }),
    visible:raw?.visible !== false,
    z:Math.trunc(Number(raw?.z) || index + 1)
  };
}

function normalizeZ(items = []){
  const sorted = items.slice().sort((a, b) => (Number(a.z) || 0) - (Number(b.z) || 0) || String(a.id).localeCompare(String(b.id)));
  const zById = new Map(sorted.map((item, index) => [item.id, index + 1]));
  return items.map((item) => ({ ...item, z:zById.get(item.id) || 1 }));
}

function normalizeGroups(rawGroups = [], items = []){
  const itemIds = new Set(items.map((item) => item.id));
  const assigned = new Set();
  const groups = [];
  for (const [index, raw] of (Array.isArray(rawGroups) ? rawGroups : []).entries()) {
    const groupId = String(raw?.id || createId(`image-group-${index}`)).trim();
    if (!groupId) continue;
    const members = [];
    for (const value of (Array.isArray(raw?.itemIds) ? raw.itemIds : [])) {
      const id = String(value || '').trim();
      if (!id || !itemIds.has(id) || assigned.has(id) || members.includes(id)) continue;
      members.push(id);
    }
    if (members.length < 2) continue;
    members.forEach((id) => assigned.add(id));
    groups.push({ id:groupId, itemIds:members });
  }
  const groupByItemId = new Map();
  groups.forEach((group) => group.itemIds.forEach((id) => groupByItemId.set(id, group.id)));
  return {
    groups,
    items:items.map((item) => ({ ...item, groupId:groupByItemId.get(item.id) || '' }))
  };
}

function getVisibleIdSet(state){
  return new Set(state.items.filter((item) => item.visible !== false).map((item) => item.id));
}

function getGroupById(state){
  return new Map((state.groups || []).map((group) => [group.id, group]));
}

function getGroupByItemId(state){
  const map = new Map();
  (state.groups || []).forEach((group) => group.itemIds.forEach((id) => map.set(id, group)));
  return map;
}

export function expandImageLabelSelection(rawState = {}, inputIds = [], { visibleOnly = true } = {}){
  const state = rawState && Array.isArray(rawState.items) && Array.isArray(rawState.groups) ? rawState : normalizeImageLabelsState(rawState);
  const visibleIds = getVisibleIdSet(state);
  const groupByItemId = getGroupByItemId(state);
  const result = [];
  const seen = new Set();
  const wanted = Array.isArray(inputIds) ? inputIds.map((id) => String(id || '').trim()).filter(Boolean) : [];
  const pushId = (id) => {
    if (!id || seen.has(id)) return;
    if (visibleOnly && !visibleIds.has(id)) return;
    if (!visibleOnly && !state.items.some((item) => item.id === id)) return;
    seen.add(id);
    result.push(id);
  };
  for (const id of wanted) {
    const group = groupByItemId.get(id);
    if (group) group.itemIds.forEach((memberId) => pushId(memberId));
    else pushId(id);
  }
  return result;
}

export function findImageLabelGroupForSelection(rawState = {}, inputIds = []){
  const state = rawState && Array.isArray(rawState.items) && Array.isArray(rawState.groups) ? rawState : normalizeImageLabelsState(rawState);
  const selected = expandImageLabelSelection(state, inputIds, { visibleOnly:false });
  if (selected.length < 2) return null;
  for (const group of state.groups) {
    if (group.itemIds.length !== selected.length) continue;
    if (group.itemIds.every((id) => selected.includes(id))) return group;
  }
  return null;
}

function rebuildState(state, patch = {}){
  return normalizeImageLabelsState({ ...state, ...patch });
}

export function normalizeImageLabelsState(rawState = {}){
  const source = rawState && typeof rawState === "object" ? rawState : {};
  const seen = new Set();
  let items = (Array.isArray(source.items) ? source.items : []).map(normalizeItem).filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, IMAGE_LABELS_MAX_IMAGES);
  items = normalizeZ(items);
  const grouped = normalizeGroups(source.groups, items);
  items = grouped.items;
  const visible = new Set(items.filter((item) => item.visible !== false).map((item) => item.id));
  let selectedIds = (Array.isArray(source.selectedIds) ? source.selectedIds : [])
    .map((id) => String(id || "").trim())
    .filter((id, index, values) => id && visible.has(id) && values.indexOf(id) === index);
  selectedIds = expandImageLabelSelection({ items, groups:grouped.groups }, selectedIds, { visibleOnly:true });
  return {
    items,
    groups:grouped.groups,
    selectedIds,
    snapEnabled:source.snapEnabled !== false
  };
}

export function createInitialImageLabelsState(){ return normalizeImageLabelsState(); }
export function createImageLabelsProjectorState({ state } = {}){ return normalizeImageLabelsState(state); }

export function cloneImageLabelsState(rawState = {}){
  const state = normalizeImageLabelsState(rawState);
  const counts = new Map();
  state.items.forEach((item) => counts.set(item.source, (counts.get(item.source) || 0) + 1));
  counts.forEach((count, source) => retainObjectUrl(source, count));
  return state;
}

export function disposeImageLabelsState(rawState = {}){
  const state = normalizeImageLabelsState(rawState);
  const counts = new Map();
  state.items.forEach((item) => counts.set(item.source, (counts.get(item.source) || 0) + 1));
  counts.forEach((count, source) => releaseObjectUrl(source, count));
}

function findPlacement(items, width, height, offsetIndex = 0){
  const gapX = INITIAL_GAP_PX / STAGE_WIDTH;
  const gapY = INITIAL_GAP_PX / STAGE_HEIGHT;
  const startX = gapX + ((offsetIndex % 4) * 0.008);
  const startY = gapY + ((offsetIndex % 4) * 0.008);
  for (let y = startY; y <= Math.max(startY, 1 - height - gapY); y += Math.max(height + gapY, 0.05)) {
    for (let x = startX; x <= Math.max(startX, 1 - width - gapX); x += Math.max(width + gapX, 0.05)) {
      const candidate = { x, y, width, height };
      const collision = items.some((item) => item.visible !== false
        && candidate.x < item.x + item.width + gapX
        && candidate.x + candidate.width + gapX > item.x
        && candidate.y < item.y + item.height + gapY
        && candidate.y + candidate.height + gapY > item.y);
      if (!collision) return { x:round(x), y:round(y) };
    }
  }
  return { x:round(clamp(startX + (offsetIndex * 0.014), 0, Math.max(0, 1 - width))), y:round(clamp(startY + (offsetIndex * 0.014), 0, Math.max(0, 1 - height))) };
}

function createItemFromPayload(payload, existing, index){
  const isLocal = isBlob(payload?.blob);
  const source = isLocal ? createObjectUrl(payload.blob) : String(payload?.source || "").trim();
  if (!source) return null;
  const dimensions = normalizeDimensions(payload?.naturalWidth, payload?.naturalHeight);
  const size = initialSize(dimensions.naturalWidth, dimensions.naturalHeight);
  const placement = findPlacement(existing, size.width, size.height, index);
  return normalizeItem({
    id:createId("image-label"),
    source,
    sourceKind:isLocal ? "file" : normalizeSourceKind(payload?.sourceKind),
    resourceId:String(payload?.resourceId || "").trim(),
    mimeType:String(payload?.mimeType || "").trim(),
    imageName:String(payload?.imageName || `Image ${existing.length + 1}`).trim(),
    ...dimensions,
    ...size,
    ...placement,
    visible:true,
    z:existing.length + 1
  }, existing.length);
}

function selectedOrVisibleIds(state, requested = []){
  const visible = state.items.filter((item) => item.visible !== false).map((item) => item.id);
  const input = Array.isArray(requested) && requested.length ? requested : (state.selectedIds.length ? state.selectedIds : visible);
  return expandImageLabelSelection(state, input, { visibleOnly:true });
}

function stripGroupsWithIds(groups = [], ids = []){
  const idSet = new Set(ids);
  return (Array.isArray(groups) ? groups : []).filter((group) => !group.itemIds.some((id) => idSet.has(id)));
}

function applyLayout(items, ids, command){
  const idSet = new Set(ids);
  const targets = items.filter((item) => idSet.has(item.id));
  if (targets.length < (command.startsWith("distribute-") ? 3 : 2)) return items;
  const left = Math.min(...targets.map((item) => item.x));
  const right = Math.max(...targets.map((item) => item.x + item.width));
  const top = Math.min(...targets.map((item) => item.y));
  const bottom = Math.max(...targets.map((item) => item.y + item.height));
  const cx = (left + right) / 2;
  const cy = (top + bottom) / 2;
  const patch = new Map();
  if (command === "align-left") targets.forEach((item) => patch.set(item.id, { x:left, y:item.y }));
  if (command === "align-right") targets.forEach((item) => patch.set(item.id, { x:right-item.width, y:item.y }));
  if (command === "align-top") targets.forEach((item) => patch.set(item.id, { x:item.x, y:top }));
  if (command === "align-bottom") targets.forEach((item) => patch.set(item.id, { x:item.x, y:bottom-item.height }));
  if (command === "align-center-x") targets.forEach((item) => patch.set(item.id, { x:cx-(item.width/2), y:item.y }));
  if (command === "align-center-y") targets.forEach((item) => patch.set(item.id, { x:item.x, y:cy-(item.height/2) }));
  if (command === "distribute-x") {
    const sorted = targets.slice().sort((a,b) => a.x-b.x);
    const occupied = sorted.reduce((sum, item) => sum + item.width, 0);
    const gap = Math.max(0, (right-left-occupied)/(sorted.length-1));
    let x = left;
    sorted.forEach((item) => { patch.set(item.id, { x, y:item.y }); x += item.width + gap; });
  }
  if (command === "distribute-y") {
    const sorted = targets.slice().sort((a,b) => a.y-b.y);
    const occupied = sorted.reduce((sum, item) => sum + item.height, 0);
    const gap = Math.max(0, (bottom-top-occupied)/(sorted.length-1));
    let y = top;
    sorted.forEach((item) => { patch.set(item.id, { x:item.x, y }); y += item.height + gap; });
  }
  return items.map((item) => patch.has(item.id) ? { ...item, ...normalizeGeometry({ ...item, ...patch.get(item.id) }, item) } : item);
}

function reorderZ(items, ids, command){
  const selected = new Set(ids);
  let ordered = items.slice().sort((a,b) => a.z-b.z);
  if (command === "front") ordered = [...ordered.filter((item) => !selected.has(item.id)), ...ordered.filter((item) => selected.has(item.id))];
  else if (command === "back") ordered = [...ordered.filter((item) => selected.has(item.id)), ...ordered.filter((item) => !selected.has(item.id))];
  else if (command === "forward") {
    for (let i = ordered.length - 2; i >= 0; i -= 1) if (selected.has(ordered[i].id) && !selected.has(ordered[i+1].id)) [ordered[i], ordered[i+1]] = [ordered[i+1], ordered[i]];
  } else if (command === "backward") {
    for (let i = 1; i < ordered.length; i += 1) if (selected.has(ordered[i].id) && !selected.has(ordered[i-1].id)) [ordered[i], ordered[i-1]] = [ordered[i-1], ordered[i]];
  }
  const zById = new Map(ordered.map((item,index) => [item.id,index+1]));
  return items.map((item) => ({ ...item, z:zById.get(item.id) || item.z }));
}

export function applyImageLabelsAction({ action, payload = {}, state } = {}){
  const safeAction = String(action || "").trim();
  const current = normalizeImageLabelsState(state);

  if (safeAction === "add-images") {
    const incoming = Array.isArray(payload?.images) ? payload.images : [];
    const remaining = Math.max(0, IMAGE_LABELS_MAX_IMAGES - current.items.length);
    const accepted = incoming.slice(0, remaining);
    const nextItems = current.items.slice();
    const newIds = [];
    accepted.forEach((image, index) => {
      const item = createItemFromPayload(image, nextItems, index);
      if (!item) return;
      nextItems.push({ ...item, z:nextItems.length + 1 });
      newIds.push(item.id);
    });
    if (!newIds.length) return { error: remaining ? "Aucune image valide à ajouter." : `Limite : ${IMAGE_LABELS_MAX_IMAGES} images.` };
    return {
      patch:{ state:rebuildState(current, { items:nextItems, selectedIds:newIds }) },
      message:incoming.length > accepted.length ? `${IMAGE_LABELS_MAX_IMAGES} images maximum : ${incoming.length-accepted.length} ignorée${incoming.length-accepted.length>1?"s":""}.` : ""
    };
  }

  if (safeAction === "set-selection") {
    const requested = Array.isArray(payload?.itemIds) ? payload.itemIds.map(String) : [];
    const ids = expandImageLabelSelection(current, requested, { visibleOnly:true });
    return { patch:{ state:rebuildState(current, { selectedIds:ids }) } };
  }

  if (safeAction === "set-visible") {
    const id = String(payload?.itemId || "").trim();
    if (!id) return null;
    const group = findImageLabelGroupForSelection(current, [id]);
    const targetIds = new Set(group?.itemIds || [id]);
    const visible = payload?.visible !== false;
    const items = current.items.map((item) => targetIds.has(item.id) ? { ...item, visible } : item);
    return { patch:{ state:rebuildState(current, { items, selectedIds:visible ? current.selectedIds : current.selectedIds.filter((itemId) => !targetIds.has(itemId)) }) } };
  }

  if (safeAction === "set-snap-enabled") return { patch:{ state:rebuildState(current, { snapEnabled:payload?.enabled !== false }) } };

  if (safeAction === "set-positions") {
    const byId = new Map((Array.isArray(payload?.positions) ? payload.positions : []).map((entry) => [String(entry?.id || entry?.itemId || ""), entry]));
    const items = current.items.map((item) => {
      const patch = byId.get(item.id);
      return patch ? { ...item, ...normalizeGeometry({ ...item, x:patch.x, y:patch.y }, item) } : item;
    });
    return { patch:{ state:rebuildState(current, { items, selectedIds:Array.isArray(payload?.selectedIds) ? payload.selectedIds : current.selectedIds }) } };
  }

  if (safeAction === "set-geometries") {
    const byId = new Map((Array.isArray(payload?.items) ? payload.items : []).map((entry) => [String(entry?.id || ""), entry]));
    const items = current.items.map((item) => byId.has(item.id) ? { ...item, ...normalizeGeometry({ ...item, ...byId.get(item.id) }, item) } : item);
    return { patch:{ state:rebuildState(current, { items, selectedIds:Array.isArray(payload?.selectedIds) ? payload.selectedIds : current.selectedIds }) } };
  }

  if (safeAction === "layout") {
    const ids = selectedOrVisibleIds(current, payload?.itemIds || []);
    const command = String(payload?.command || "").trim();
    const valid = new Set(["align-left","align-center-x","align-right","align-top","align-center-y","align-bottom","distribute-x","distribute-y"]);
    if (!valid.has(command)) return null;
    return { patch:{ state:rebuildState(current, { items:applyLayout(current.items, ids, command) }) } };
  }

  if (safeAction === "z-order") {
    const ids = selectedOrVisibleIds(current, payload?.itemIds || []);
    if (!ids.length) return null;
    const command = String(payload?.command || "").trim();
    if (!["front","forward","backward","back"].includes(command)) return null;
    return { patch:{ state:rebuildState(current, { items:reorderZ(current.items, ids, command) }) } };
  }

  if (safeAction === "duplicate-items") {
    const ids = selectedOrVisibleIds(current, payload?.itemIds || []);
    if (!ids.length) return null;
    const remaining = Math.max(0, IMAGE_LABELS_MAX_IMAGES-current.items.length);
    if (!remaining) return { error:`Limite : ${IMAGE_LABELS_MAX_IMAGES} images.` };
    const sourceItems = current.items.filter((item) => ids.includes(item.id)).slice(0, remaining).sort((a,b) => a.z-b.z);
    const sourceIds = sourceItems.map((item) => item.id);
    const dx = DUPLICATE_OFFSET_PX/STAGE_WIDTH;
    const dy = DUPLICATE_OFFSET_PX/STAGE_HEIGHT;
    const nextItems = current.items.slice();
    const idMap = new Map();
    const newIds = [];
    sourceItems.forEach((item) => {
      retainObjectUrl(item.source);
      const id = createId("image-label");
      idMap.set(item.id, id);
      const copy = {
        ...item,
        id,
        groupId:"",
        x:round(clamp(item.x+dx,0,Math.max(0,1-item.width))),
        y:round(clamp(item.y+dy,0,Math.max(0,1-item.height))),
        z:nextItems.length+1,
        visible:true
      };
      nextItems.push(copy);
      newIds.push(id);
    });
    const nextGroups = current.groups.slice();
    current.groups.forEach((group) => {
      const members = group.itemIds.filter((id) => sourceIds.includes(id));
      if (members.length >= 2 && members.length === group.itemIds.length) {
        nextGroups.push({ id:createId("image-group"), itemIds:members.map((id) => idMap.get(id)).filter(Boolean) });
      }
    });
    return { patch:{ state:rebuildState(current, { items:nextItems, groups:nextGroups, selectedIds:newIds }) }, message:`${newIds.length} image${newIds.length>1?"s":""} dupliquée${newIds.length>1?"s":""}.` };
  }

  if (safeAction === "group-items") {
    const ids = selectedOrVisibleIds(current, payload?.itemIds || []);
    if (ids.length < 2) return null;
    const groups = stripGroupsWithIds(current.groups, ids);
    groups.push({ id:createId("image-group"), itemIds:ids.slice() });
    return { patch:{ state:rebuildState(current, { groups, selectedIds:ids.slice() }) }, message:`${ids.length} images groupées.` };
  }

  if (safeAction === "ungroup-items") {
    const ids = selectedOrVisibleIds(current, payload?.itemIds || []);
    const selectedGroups = current.groups.filter((group) => group.itemIds.every((id) => ids.includes(id)));
    if (!selectedGroups.length) return null;
    const groupIds = new Set(selectedGroups.map((group) => group.id));
    const groups = current.groups.filter((group) => !groupIds.has(group.id));
    const selectedIds = selectedGroups.flatMap((group) => group.itemIds);
    return { patch:{ state:rebuildState(current, { groups, selectedIds }) }, message:`${selectedGroups.length} groupe${selectedGroups.length>1?"s":""} dissocié${selectedGroups.length>1?"s":"s"}.` };
  }

  if (safeAction === "delete-items") {
    const ids = new Set(Array.isArray(payload?.itemIds) ? selectedOrVisibleIds(current, payload.itemIds) : []);
    if (!ids.size) return null;
    const deleted = current.items.filter((item) => ids.has(item.id));
    deleted.forEach((item) => releaseObjectUrl(item.source));
    const items = current.items.filter((item) => !ids.has(item.id));
    const groups = current.groups.map((group) => ({ ...group, itemIds:group.itemIds.filter((id) => !ids.has(id)) })).filter((group) => group.itemIds.length >= 2);
    return { patch:{ state:rebuildState(current, { items, groups, selectedIds:current.selectedIds.filter((id) => !ids.has(id)) }) }, message:`${deleted.length} image${deleted.length>1?"s":""} supprimée${deleted.length>1?"s":""}.` };
  }

  if (safeAction === "clear") {
    current.items.forEach((item) => releaseObjectUrl(item.source));
    return { patch:{ state:createInitialImageLabelsState() }, message:current.items.length ? "Toutes les images ont été supprimées." : "" };
  }

  return null;
}
