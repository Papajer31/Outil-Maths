export function normalizeTreeId(value){
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function ensureTreeBucket(map, key){
  if (!map.has(key)) {
    map.set(key, []);
  }
  return map.get(key);
}

export function compareOrderedTreeNodes(a, b){
  const orderA = Number(a?.display_order);
  const orderB = Number(b?.display_order);
  if (Number.isFinite(orderA) && Number.isFinite(orderB) && orderA !== orderB) {
    return orderA - orderB;
  }

  if (a?.type !== b?.type) {
    return a?.type === "folder" ? -1 : 1;
  }

  const labelA = String(a?.label || "");
  const labelB = String(b?.label || "");
  const byLabel = labelA.localeCompare(labelB, "fr", { sensitivity: "base" });
  if (byLabel !== 0) return byLabel;

  return String(a?.id || "").localeCompare(String(b?.id || ""), "fr", { sensitivity: "base" });
}

export function buildActivityTreeState({ activitiesSource = [], foldersSource = [] } = {}){
  const folders = (foldersSource || []).map((folder, index) => ({
    ...folder,
    id: String(folder.id),
    parent_id: normalizeTreeId(folder.parent_id),
    display_order: Number.isFinite(Number(folder.display_order))
      ? Math.max(0, Math.trunc(Number(folder.display_order)))
      : index
  }));

  const folderById = new Map(folders.map((folder) => [folder.id, folder]));
  folders.forEach((folder) => {
    if (folder.parent_id && !folderById.has(folder.parent_id)) {
      folder.parent_id = null;
    }
  });

  const activities = (activitiesSource || []).map((activity, index) => ({
    ...activity,
    id: String(activity.id),
    folder_id: normalizeTreeId(activity.folder_id),
    display_order: Number.isFinite(Number(activity.display_order))
      ? Math.max(0, Math.trunc(Number(activity.display_order)))
      : index
  }));

  activities.forEach((activity) => {
    if (activity.folder_id && !folderById.has(activity.folder_id)) {
      activity.folder_id = null;
    }
  });

  const activityById = new Map(activities.map((activity) => [activity.id, activity]));
  const folderChildren = new Map();
  const activityChildren = new Map();

  folders.forEach((folder) => {
    ensureTreeBucket(folderChildren, folder.parent_id).push(folder);
  });

  activities.forEach((activity) => {
    ensureTreeBucket(activityChildren, activity.folder_id).push(activity);
  });

  folderChildren.forEach((items) => items.sort((a, b) => compareOrderedTreeNodes({
    type: "folder",
    id: a.id,
    label: a.name,
    display_order: a.display_order
  }, {
    type: "folder",
    id: b.id,
    label: b.name,
    display_order: b.display_order
  })));

  activityChildren.forEach((items) => items.sort((a, b) => compareOrderedTreeNodes({
    type: "activity",
    id: a.id,
    label: a.config_name,
    display_order: a.display_order
  }, {
    type: "activity",
    id: b.id,
    label: b.config_name,
    display_order: b.display_order
  })));

  return {
    folders,
    activities,
    folderById,
    activityById,
    folderChildren,
    activityChildren
  };
}

export function getOrderedChildNodes(state, parentId = null){
  const folderNodes = (state.folderChildren.get(parentId) || []).map((folder) => ({
    type: "folder",
    id: folder.id,
    label: folder.name,
    display_order: folder.display_order,
    item: folder,
    parentId
  }));

  const activityNodes = (state.activityChildren.get(parentId) || []).map((activity) => ({
    type: "activity",
    id: activity.id,
    label: activity.config_name,
    display_order: activity.display_order,
    item: activity,
    parentId
  }));

  return [...folderNodes, ...activityNodes].sort(compareOrderedTreeNodes);
}

export function getFolderLevel(state, folderId, cache = new Map()){
  const safeFolderId = normalizeTreeId(folderId);
  if (!safeFolderId) return 0;
  if (cache.has(safeFolderId)) return cache.get(safeFolderId);

  const folder = state.folderById.get(safeFolderId);
  if (!folder) return 0;

  const level = getFolderLevel(state, folder.parent_id, cache) + 1;
  cache.set(safeFolderId, level);
  return level;
}

export function getFolderSubtreeHeight(state, folderId, cache = new Map()){
  const safeFolderId = normalizeTreeId(folderId);
  if (!safeFolderId) return 0;
  if (cache.has(safeFolderId)) return cache.get(safeFolderId);

  const childFolders = state.folderChildren.get(safeFolderId) || [];
  let height = 1;
  childFolders.forEach((folder) => {
    height = Math.max(height, 1 + getFolderSubtreeHeight(state, folder.id, cache));
  });

  cache.set(safeFolderId, height);
  return height;
}

export function isFolderInSubtree(state, folderId, possibleAncestorId){
  const safeFolderId = normalizeTreeId(folderId);
  const safeAncestorId = normalizeTreeId(possibleAncestorId);
  if (!safeFolderId || !safeAncestorId) return false;
  if (safeFolderId === safeAncestorId) return true;

  let cursor = state.folderById.get(safeFolderId) || null;
  while (cursor) {
    const parentId = normalizeTreeId(cursor.parent_id);
    if (!parentId) return false;
    if (parentId === safeAncestorId) return true;
    cursor = state.folderById.get(parentId) || null;
  }

  return false;
}

export function buildVisibleActivityTree({
  activitiesSource = [],
  foldersSource = [],
  collapsedFolderIds = new Set(),
  currentActivityMode = ""
} = {}){
  const state = buildActivityTreeState({ activitiesSource, foldersSource });
  const visibleNodes = [];
  const levelCache = new Map();
  const collapsedIds = collapsedFolderIds instanceof Set
    ? collapsedFolderIds
    : new Set(Array.isArray(collapsedFolderIds) ? collapsedFolderIds.map((id) => String(id)) : []);

  function visit(parentId = null, depth = 0, ancestorFolderIds = []){
    const children = getOrderedChildNodes(state, parentId);
    children.forEach((node) => {
      if (node.type === "folder") {
        const folder = node.item;
        const folderId = String(folder.id);
        const nextAncestors = [...ancestorFolderIds, folderId];
        const folderLevel = getFolderLevel(state, folderId, levelCache);
        visibleNodes.push({
          type: "folder",
          depth,
          parentId,
          folderLevel,
          treePath: `|${nextAncestors.join("|")}|`,
          item: folder,
          isCollapsed: collapsedIds.has(folderId)
        });

        if (!collapsedIds.has(folderId)) {
          const visibleCountBeforeChildren = visibleNodes.length;
          visit(folderId, depth + 1, nextAncestors);
          if (visibleNodes.length === visibleCountBeforeChildren) {
            visibleNodes.push({
              type: "folder-empty",
              depth: depth + 1,
              parentId: folderId,
              folderLevel,
              treePath: `|${nextAncestors.join("|")}|`,
              item: folder,
              activityMode: currentActivityMode
            });
          }
        }
        return;
      }

      visibleNodes.push({
        type: "activity",
        depth,
        parentId,
        folderLevel: parentId ? getFolderLevel(state, parentId, levelCache) : 0,
        treePath: ancestorFolderIds.length ? `|${ancestorFolderIds.join("|")}|` : "",
        item: node.item
      });
    });
  }

  visit(null, 0, []);
  return { state, visibleNodes };
}

export function sortFoldersByDisplay(folders = []){
  return [...folders].sort((a, b) => compareOrderedTreeNodes({
    type: "folder",
    id: a?.id,
    label: a?.name,
    display_order: a?.display_order
  }, {
    type: "folder",
    id: b?.id,
    label: b?.name,
    display_order: b?.display_order
  }));
}

export function sortActivitiesByDisplay(activities = []){
  return [...activities].sort((a, b) => compareOrderedTreeNodes({
    type: "activity",
    id: a?.id,
    label: a?.config_name,
    display_order: a?.display_order
  }, {
    type: "activity",
    id: b?.id,
    label: b?.config_name,
    display_order: b?.display_order
  }));
}

export function buildActivitySiblingGroups(state){
  const groups = new Map();
  const parentKeys = [null, ...state.folders.map((folder) => String(folder.id))];
  parentKeys.forEach((parentId) => {
    groups.set(parentId, getOrderedChildNodes(state, parentId).map((node) => ({ type: node.type, id: String(node.id) })));
  });
  return groups;
}

export function computeMovedActivityTree({
  sourceNode,
  dropTarget,
  activitiesSource = [],
  foldersSource = [],
  maxFolderDepth = 3
} = {}){
  const sourceType = String(sourceNode?.type || "");
  const sourceId = normalizeTreeId(sourceNode?.id);
  if (!sourceType || !sourceId) return null;

  const state = buildActivityTreeState({ activitiesSource, foldersSource });
  const sourceFolder = sourceType === "folder" ? state.folderById.get(sourceId) : null;
  const sourceActivity = sourceType === "activity" ? state.activityById.get(sourceId) : null;
  if (!sourceFolder && !sourceActivity) return null;

  const groups = buildActivitySiblingGroups(state);
  const sourceParentId = sourceType === "folder"
    ? normalizeTreeId(sourceFolder?.parent_id)
    : normalizeTreeId(sourceActivity?.folder_id);

  groups.set(sourceParentId, (groups.get(sourceParentId) || []).filter((ref) => !(ref.type === sourceType && ref.id === sourceId)));

  let newParentId = null;
  let insertIndex = 0;

  if (!dropTarget || dropTarget.mode === "append-root") {
    newParentId = null;
    insertIndex = (groups.get(null) || []).length;
  } else if (dropTarget.mode === "inside") {
    newParentId = normalizeTreeId(dropTarget.targetId);
    insertIndex = (groups.get(newParentId) || []).length;
  } else {
    newParentId = normalizeTreeId(dropTarget.targetParentId);
    const targetGroup = groups.get(newParentId) || [];
    const targetIndex = targetGroup.findIndex((ref) => ref.type === dropTarget.targetType && ref.id === String(dropTarget.targetId));
    if (targetIndex < 0) return null;
    insertIndex = targetIndex + (dropTarget.mode === "after" ? 1 : 0);
  }

  if (sourceType === "folder") {
    if (newParentId === sourceId) return null;
    if (newParentId && isFolderInSubtree(state, newParentId, sourceId)) return null;

    const parentLevel = newParentId ? getFolderLevel(state, newParentId) : 0;
    const subtreeHeight = getFolderSubtreeHeight(state, sourceId);
    if ((parentLevel + subtreeHeight) > maxFolderDepth) {
      return null;
    }
  } else {
    const parentLevel = newParentId ? getFolderLevel(state, newParentId) : 0;
    if (parentLevel > maxFolderDepth) {
      return null;
    }
  }

  const targetGroup = [...(groups.get(newParentId) || [])];
  const safeInsertIndex = Math.max(0, Math.min(insertIndex, targetGroup.length));
  targetGroup.splice(safeInsertIndex, 0, { type: sourceType, id: sourceId });
  groups.set(newParentId, targetGroup);

  const nextFolders = state.folders.map((folder) => ({ ...folder }));
  const nextActivities = state.activities.map((activity) => ({ ...activity }));
  const nextFolderById = new Map(nextFolders.map((folder) => [folder.id, folder]));
  const nextActivityById = new Map(nextActivities.map((activity) => [activity.id, activity]));

  [null, ...nextFolders.map((folder) => folder.id)].forEach((parentId) => {
    const items = groups.get(parentId) || [];
    items.forEach((ref, index) => {
      if (ref.type === "folder") {
        const folder = nextFolderById.get(ref.id);
        if (!folder) return;
        folder.parent_id = parentId;
        folder.display_order = index;
        return;
      }

      const activity = nextActivityById.get(ref.id);
      if (!activity) return;
      activity.folder_id = parentId;
      activity.display_order = index;
    });
  });

  return {
    folders: sortFoldersByDisplay(nextFolders),
    activities: sortActivitiesByDisplay(nextActivities)
  };
}
