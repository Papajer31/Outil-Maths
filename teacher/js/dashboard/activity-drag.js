import {
  computeMovedActivityTree as computeDashboardMovedActivityTree,
  normalizeTreeId
} from "./activity-tree.js";

function getTreeContainer(configsList){
  return configsList?.querySelector(".dashboard-activity-tree-list") || null;
}

function getRootRow(configsList){
  return configsList?.querySelector(".dashboard-activity-tree-root") || null;
}

function clearHighlightedDropTargets(configsList){
  configsList?.querySelectorAll(".dashboard-tree-node.is-dragging, .dashboard-tree-node.is-drop-inside, .dashboard-activity-tree-root.is-drop-inside, .dashboard-activity-tile.is-dragging, .dashboard-activity-tile.is-drop-inside").forEach((el) => {
    el.classList.remove("is-dragging", "is-drop-inside");
  });
}

export function createActivityDragController({
  configsList,
  getCurrentTeacherSpace,
  getCachedActivities,
  setCachedActivities,
  getCachedActivityFolders,
  setCachedActivityFolders,
  updateActivityFolder,
  updateActivityDashboardMeta,
  renderActivitiesForSpace,
  maxFolderDepth = 3
} = {}){
  let draggedActivityNode = null;
  let isSavingActivityOrder = false;
  let activityDropTarget = null;

  function clearActivityDropMarkers(){
    activityDropTarget = null;
    clearHighlightedDropTargets(configsList);
  }

  function getDropTargetFromEvent(event){
    const targetEl = event.target instanceof Element ? event.target : null;
    if (!targetEl) return null;

    const rootRow = targetEl.closest('.dashboard-activity-tree-root');
    if (rootRow) {
      return { mode: 'append-root' };
    }

    const folderTile = targetEl.closest('.dashboard-activity-tile[data-node-type="folder"][data-node-id]');
    if (folderTile) {
      return {
        mode: 'inside',
        targetType: 'folder',
        targetId: String(folderTile.dataset.nodeId || ''),
        targetParentId: null,
        targetSurface: 'tile'
      };
    }

    const folderRow = targetEl.closest('.dashboard-tree-node[data-node-type="folder"][data-node-id]');
    if (folderRow) {
      return {
        mode: 'inside',
        targetType: 'folder',
        targetId: String(folderRow.dataset.nodeId || ''),
        targetParentId: normalizeTreeId(folderRow.dataset.parentId),
        targetSurface: 'tree'
      };
    }

    return null;
  }

  function renderActivityDropTarget(dropTarget){
    clearHighlightedDropTargets(configsList);
    if (!dropTarget) return;

    if (dropTarget.mode === 'append-root') {
      getRootRow(configsList)?.classList.add('is-drop-inside');
      return;
    }

    if (dropTarget.mode !== 'inside') return;

    if (dropTarget.targetSurface === 'tile') {
      const tile = configsList?.querySelector(`.dashboard-activity-tile[data-node-type="folder"][data-node-id="${CSS.escape(String(dropTarget.targetId || ''))}"]`);
      tile?.classList.add('is-drop-inside');
      return;
    }

    const row = configsList?.querySelector(`.dashboard-tree-node[data-node-type="folder"][data-node-id="${CSS.escape(String(dropTarget.targetId || ''))}"]`);
    row?.classList.add('is-drop-inside');
  }

  function computeMovedActivityTree(sourceNode, dropTarget){
    return computeDashboardMovedActivityTree({
      sourceNode,
      dropTarget,
      activitiesSource: getCachedActivities?.(),
      foldersSource: getCachedActivityFolders?.(),
      maxFolderDepth
    });
  }

  async function persistActivityTreeState(nextTree){
    const folderUpdates = (nextTree?.folders || []).map((folder) => updateActivityFolder?.(folder.id, {
      parent_id: folder.parent_id,
      display_order: folder.display_order
    }));

    const activityUpdates = (nextTree?.activities || []).map((activity) => updateActivityDashboardMeta?.(activity.id, {
      folder_id: activity.folder_id,
      display_order: activity.display_order
    }));

    await Promise.all([...folderUpdates, ...activityUpdates]);
  }

  async function moveActivityNode(sourceNode, dropTarget){
    const currentTeacherSpace = getCurrentTeacherSpace?.();
    if (!currentTeacherSpace?.id) return;

    const currentActivities = getCachedActivities?.() || [];
    const currentFolders = getCachedActivityFolders?.() || [];
    const previousActivities = [...currentActivities];
    const previousFolders = [...currentFolders];
    const nextTree = computeMovedActivityTree(sourceNode, dropTarget);
    if (!nextTree) {
      clearActivityDropMarkers();
      return;
    }

    setCachedActivities?.(nextTree.activities);
    setCachedActivityFolders?.(nextTree.folders);
    isSavingActivityOrder = true;
    await renderActivitiesForSpace?.();

    try {
      await persistActivityTreeState(nextTree);
    } catch (err) {
      setCachedActivities?.(previousActivities);
      setCachedActivityFolders?.(previousFolders);
      alert(err?.message || 'Impossible d’enregistrer l’organisation des activités.');
    } finally {
      isSavingActivityOrder = false;
      draggedActivityNode = null;
      clearActivityDropMarkers();
      await renderActivitiesForSpace?.();
    }
  }

  function clearArmedHandle(){}

  function handleActivityDragStart(event){
    const card = event.currentTarget;
    const nodeType = String(card?.dataset?.nodeType || '');
    const nodeId = String(card?.dataset?.nodeId || '');

    if (!nodeType || !nodeId || isSavingActivityOrder) {
      event.preventDefault();
      return;
    }

    draggedActivityNode = { type: nodeType, id: nodeId };
    card.classList.add('is-dragging');

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${nodeType}:${nodeId}`);
    }
  }

  function handleActivityDragOver(event){
    if (!draggedActivityNode || isSavingActivityOrder) return;

    const dropTarget = getDropTargetFromEvent(event);
    if (!dropTarget) return;

    event.preventDefault();
    activityDropTarget = dropTarget;
    renderActivityDropTarget(dropTarget);

    configsList?.querySelector(`.dashboard-tree-node[data-node-type="${CSS.escape(draggedActivityNode.type)}"][data-node-id="${CSS.escape(draggedActivityNode.id)}"], .dashboard-activity-tile[data-node-type="${CSS.escape(draggedActivityNode.type)}"][data-node-id="${CSS.escape(draggedActivityNode.id)}"]`)?.classList.add('is-dragging');
  }

  function handleActivityDragLeave(event){
    if (!configsList) return;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && configsList.contains(relatedTarget)) return;
    clearActivityDropMarkers();
  }

  async function handleActivityDrop(event){
    if (!draggedActivityNode || isSavingActivityOrder) return;

    const dropTarget = activityDropTarget || getDropTargetFromEvent(event);
    if (!dropTarget) return;

    event.preventDefault();
    await moveActivityNode(draggedActivityNode, dropTarget);
  }

  function handleActivityDragEnd(){
    draggedActivityNode = null;
    clearActivityDropMarkers();
  }

  return {
    clearArmedHandle,
    handleActivityDragStart,
    handleActivityDragOver,
    handleActivityDragLeave,
    handleActivityDrop,
    handleActivityDragEnd
  };
}
