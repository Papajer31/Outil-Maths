import { getPedagogicalNodes, normalizeCatalogActivity } from "../../../../../shared/catalogue.js";
import { escapeAttr, escapeHtml } from "../../../dashboard/text-utils.js";
import {
  applyProjectedActivityAction,
  normalizeProjectedActivityState
} from "./model.js";

const LEVELS = [1,2,3,4,5];

function cloneValue(value){
  try { if (typeof structuredClone === "function") return structuredClone(value); } catch {}
  return JSON.parse(JSON.stringify(value ?? null));
}
function isPlainObject(value){ return !!value && typeof value === "object" && !Array.isArray(value); }
function normalizeSearch(value){
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}
function getActivityFolderId(activity){
  return String(activity?.folder_id ?? activity?.pedagogical_node_id ?? "").trim();
}
function getFolderLabel(folder){
  return String(folder?.name || folder?.student_label || folder?.label || folder?.title || folder?.id || "Dossier").trim();
}
function getActivityLabel(activity){
  return String(activity?.config_name || activity?.name || activity?.title || activity?.id || "Activité").trim();
}
function getActivityOrder(item){
  const value = Number(item?.display_order);
  return Number.isFinite(value) ? value : Number.MAX_SAFE_INTEGER;
}
function compareByOrderThenLabel(a, b, labelGetter){
  const orderDiff = getActivityOrder(a) - getActivityOrder(b);
  if (orderDiff) return orderDiff;
  return labelGetter(a).localeCompare(labelGetter(b), "fr", { sensitivity:"base" });
}
function normalizeCatalogActivities(activities = []){
  return (Array.isArray(activities) ? activities : [])
    .filter((activity) => activity && activity.is_visible !== false && String(activity.status || "published") === "published")
    .slice()
    .sort((a,b) => compareByOrderThenLabel(a,b,getActivityLabel));
}
function normalizeFolders(folders = []){
  return (Array.isArray(folders) ? folders : [])
    .filter(Boolean)
    .map((folder) => ({ ...folder, id:String(folder.id || "").trim(), parent_id:String(folder.parent_id || "").trim() || null }))
    .filter((folder) => folder.id)
    .sort((a,b) => compareByOrderThenLabel(a,b,getFolderLabel));
}
function getPersonalTypeIcon(activity){
  const type = String(activity?.activity_type || "tool");
  if (type === "series") return "view_list";
  if (type === "quiz") return "quiz";
  return "extension";
}
function teacherActivityToCatalogShape(activity = {}){
  const adaptive = String(activity?.difficulty_mode || "single") === "adaptive";
  const config = isPlainObject(activity?.config_json) ? activity.config_json : {};
  const single = isPlainObject(config.level) ? config.level : {};
  const levels = adaptive && isPlainObject(activity?.levels_json)
    ? activity.levels_json
    : Object.fromEntries(LEVELS.map((level) => [String(level), cloneValue(single)]));
  return normalizeCatalogActivity({
    id:`teacher-activity.${String(activity?.id || "")}`,
    config_name:getActivityLabel(activity),
    title:getActivityLabel(activity),
    tool_id:String(config.tool_id || "").trim(),
    levels_json:levels,
    difficulty_mode:adaptive ? "adaptive" : "single",
    activity_adaptive_available:adaptive,
    status:"published",
    default_visible:true
  });
}

export function createActivityControlPanel({
  host,
  getWidget,
  updateWidget,
  showToast,
  getTeacherSpace,
  listCatalogActivitiesForTeacherSpace,
  listPedagogicalNodesForTeacher,
  listTeacherActivitiesForSpace,
  listTeacherActivityFoldersForSpace
} = {}){
  let pickerOverlay = null;
  let catalogActivities = [];
  let catalogFolders = [];
  let teacherActivities = [];
  let teacherFolders = [];
  let pickerSourceType = null; // catalog_activity | teacher_activity
  let catalogFolderId = null;
  let teacherFolderId = null;
  let searchQuery = "";
  let catalogLoaded = false;
  let catalogLoading = false;
  let selectedItemId = "";
  let draggedItemId = "";

  function getState(){ return normalizeProjectedActivityState(getWidget?.()?.state); }
  function commitAction(action, payload = {}, { renderAfter = true } = {}){
    const result = applyProjectedActivityAction({ action, payload, state:getState() });
    if (!result?.patch) return false;
    updateWidget?.(result.patch, { renderPanel:renderAfter, sync:true });
    return true;
  }

  async function ensureCatalog(){
    if (catalogLoaded || catalogLoading) return catalogLoaded;
    catalogLoading = true;
    try {
      const teacherSpaceId = String(getTeacherSpace?.()?.id || "").trim();
      const [catalogResult, catalogFoldersResult, teacherResult, teacherFoldersResult] = await Promise.all([
        teacherSpaceId && typeof listCatalogActivitiesForTeacherSpace === "function"
          ? listCatalogActivitiesForTeacherSpace(teacherSpaceId)
          : [],
        typeof listPedagogicalNodesForTeacher === "function"
          ? listPedagogicalNodesForTeacher()
          : getPedagogicalNodes(),
        teacherSpaceId && typeof listTeacherActivitiesForSpace === "function"
          ? listTeacherActivitiesForSpace(teacherSpaceId)
          : [],
        teacherSpaceId && typeof listTeacherActivityFoldersForSpace === "function"
          ? listTeacherActivityFoldersForSpace(teacherSpaceId)
          : []
      ]);
      catalogActivities = normalizeCatalogActivities(catalogResult);
      catalogFolders = normalizeFolders(catalogFoldersResult?.length ? catalogFoldersResult : getPedagogicalNodes());
      teacherActivities = (Array.isArray(teacherResult) ? teacherResult : []).slice().sort((a,b) => compareByOrderThenLabel(a,b,getActivityLabel));
      teacherFolders = normalizeFolders(teacherFoldersResult);
      catalogLoaded = true;
      return true;
    } catch (error) {
      console.error(error);
      showToast?.("Impossible de charger les activités.", { isError:true });
      return false;
    } finally {
      catalogLoading = false;
    }
  }

  function getCatalogFolder(id){
    const safeId = String(id || "").trim();
    return catalogFolders.find((folder) => folder.id === safeId) || null;
  }
  function getTeacherFolder(id){
    const safeId = String(id || "").trim();
    return teacherFolders.find((folder) => folder.id === safeId) || null;
  }
  function getBreadcrumb(id, getFolder){
    const result = [];
    let cursor = getFolder(id);
    const seen = new Set();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      result.unshift(cursor);
      cursor = getFolder(cursor.parent_id);
    }
    return result;
  }
  function getCatalogBreadcrumb(id){ return getBreadcrumb(id, getCatalogFolder); }
  function getTeacherBreadcrumb(id){ return getBreadcrumb(id, getTeacherFolder); }
  function getCatalogActivityPath(activity){
    return ["Activités du site", ...getCatalogBreadcrumb(activity?.pedagogical_node_id || activity?.folder_id).map(getFolderLabel)]
      .filter(Boolean).join(" › ");
  }
  function getTeacherActivityPath(activity){
    return ["Mes activités", ...getTeacherBreadcrumb(activity?.folder_id).map(getFolderLabel)]
      .filter(Boolean).join(" › ");
  }

  function renderRoot(label, icon, sourceType){
    return `<button class="dashboard-mission-catalog-folder dashboard-sequence-source-root" type="button" data-activity-picker-action="open-source" data-source-type="${escapeAttr(sourceType)}"><span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(icon)}</span><span>${escapeHtml(label)}</span><span class="dashboard-material-icon dashboard-mission-catalog-chevron" aria-hidden="true">chevron_right</span></button>`;
  }
  function renderParent(action, folderId = ""){
    return `<button class="dashboard-mission-catalog-folder dashboard-mission-catalog-folder--parent" type="button" data-activity-picker-action="${escapeAttr(action)}" ${folderId ? `data-folder-id="${escapeAttr(folderId)}"` : ""}><span class="dashboard-material-icon" aria-hidden="true">arrow_upward</span><span>Dossier parent</span></button>`;
  }
  function renderFolder(folder, sourceType){
    return `<button class="dashboard-mission-catalog-folder" type="button" data-activity-picker-action="open-folder" data-source-type="${escapeAttr(sourceType)}" data-folder-id="${escapeAttr(folder.id)}"><span class="dashboard-material-icon" aria-hidden="true">folder</span><span>${escapeHtml(getFolderLabel(folder))}</span><span class="dashboard-material-icon dashboard-mission-catalog-chevron" aria-hidden="true">chevron_right</span></button>`;
  }
  function renderActivity(activity, sourceType, meta = ""){
    const icon = sourceType === "teacher_activity" ? getPersonalTypeIcon(activity) : "extension";
    return `<button class="dashboard-mission-catalog-activity dashboard-sequence-source-item activity-assignment-picker-item" type="button" data-activity-picker-action="choose-activity" data-source-type="${escapeAttr(sourceType)}" data-source-id="${escapeAttr(activity.id)}"><span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(icon)}</span><span class="dashboard-mission-catalog-activity-copy"><strong>${escapeHtml(getActivityLabel(activity))}</strong>${meta ? `<small>${escapeHtml(meta)}</small>` : ""}</span></button>`;
  }
  function renderBreadcrumb(crumbs){
    const safeCrumbs = crumbs.filter((crumb) => crumb?.label);
    if (!safeCrumbs.length) return "";
    const renderCrumb = (crumb, current = false) => `<button class="dashboard-breadcrumb-btn${current ? " is-current" : ""}" type="button" data-activity-picker-action="${escapeAttr(crumb.action)}" ${crumb.sourceType ? `data-source-type="${escapeAttr(crumb.sourceType)}"` : ""} ${crumb.folderId ? `data-folder-id="${escapeAttr(crumb.folderId)}"` : ""}>${escapeHtml(crumb.label)}</button>`;
    const separator = () => `<span class="dashboard-breadcrumb-separator" aria-hidden="true">›</span>`;
    const content = safeCrumbs.length > 3
      ? [
          `<details class="dashboard-breadcrumb-overflow"><summary class="dashboard-breadcrumb-btn dashboard-breadcrumb-overflow-trigger" aria-label="Afficher le chemin complet" title="Afficher le chemin complet">…</summary><div class="dashboard-breadcrumb-overflow-menu">${safeCrumbs.map((crumb,index) => renderCrumb(crumb,index === safeCrumbs.length - 1)).join("")}</div></details>`,
          separator(), renderCrumb(safeCrumbs[safeCrumbs.length - 2]), separator(), renderCrumb(safeCrumbs[safeCrumbs.length - 1], true)
        ].join("")
      : safeCrumbs.flatMap((crumb,index) => [index ? separator() : "", renderCrumb(crumb,index === safeCrumbs.length - 1)]).join("");
    return `<nav class="dashboard-breadcrumb dashboard-sequence-picker-breadcrumb" aria-label="Arborescence de la sélection">${content}</nav>`;
  }

  function renderPickerBreadcrumb(){
    if (searchQuery || !pickerSourceType) return "";
    const crumbs = [{ label:"Activités", action:"picker-root" }];
    if (pickerSourceType === "catalog_activity") {
      crumbs.push(
        { label:"Activités du site", action:"source-root", sourceType:"catalog_activity" },
        ...getCatalogBreadcrumb(catalogFolderId).map((folder) => ({ label:getFolderLabel(folder), action:"open-folder", sourceType:"catalog_activity", folderId:folder.id }))
      );
    } else {
      crumbs.push(
        { label:"Mes activités", action:"source-root", sourceType:"teacher_activity" },
        ...getTeacherBreadcrumb(teacherFolderId).map((folder) => ({ label:getFolderLabel(folder), action:"open-folder", sourceType:"teacher_activity", folderId:folder.id }))
      );
    }
    return renderBreadcrumb(crumbs);
  }

  function renderSearchResults(query){
    const rows = [];
    rows.push(...catalogActivities
      .filter((activity) => normalizeSearch(`${getActivityLabel(activity)} ${getCatalogActivityPath(activity)}`).includes(query))
      .map((activity) => renderActivity(activity, "catalog_activity", getCatalogActivityPath(activity))));
    rows.push(...teacherActivities
      .filter((activity) => normalizeSearch(`${getActivityLabel(activity)} ${getTeacherActivityPath(activity)}`).includes(query))
      .map((activity) => renderActivity(activity, "teacher_activity", getTeacherActivityPath(activity))));
    return rows.join("") || `<div class="dashboard-activity-empty-state">Aucun résultat.</div>`;
  }

  function renderPickerRows(){
    const query = normalizeSearch(searchQuery);
    if (query) return renderSearchResults(query);
    if (!pickerSourceType) {
      return [
        renderRoot("Activités du site", "account_tree", "catalog_activity"),
        renderRoot("Mes activités", "folder_shared", "teacher_activity")
      ].join("");
    }
    if (pickerSourceType === "catalog_activity") {
      const current = getCatalogFolder(catalogFolderId);
      const parentKey = String(current?.id || "");
      const folders = catalogFolders.filter((folder) => String(folder.parent_id || "") === parentKey);
      const activities = catalogActivities.filter((activity) => getActivityFolderId(activity) === parentKey);
      return [
        current ? renderParent(current.parent_id ? "open-folder" : "picker-root", current.parent_id || "") : renderParent("picker-root"),
        ...folders.map((folder) => renderFolder(folder, "catalog_activity")),
        ...activities.map((activity) => renderActivity(activity, "catalog_activity")),
        current && !folders.length && !activities.length ? `<div class="dashboard-activity-empty-state">Aucune activité dans ce dossier.</div>` : ""
      ].join("");
    }
    const current = getTeacherFolder(teacherFolderId);
    const parentKey = String(current?.id || "");
    const folders = teacherFolders.filter((folder) => String(folder.parent_id || "") === parentKey);
    const activities = teacherActivities.filter((activity) => String(activity?.folder_id || "") === parentKey);
    return [
      current ? renderParent(current.parent_id ? "open-folder" : "picker-root", current.parent_id || "") : renderParent("picker-root"),
      ...folders.map((folder) => renderFolder(folder, "teacher_activity")),
      ...activities.map((activity) => renderActivity(activity, "teacher_activity")),
      current && !folders.length && !activities.length ? `<div class="dashboard-activity-empty-state">Aucune activité dans ce dossier.</div>` : ""
    ].join("");
  }

  function refreshPicker(){
    if (!pickerOverlay) return;
    const breadcrumb = pickerOverlay.querySelector("[data-activity-picker-breadcrumb]");
    const results = pickerOverlay.querySelector("[data-activity-picker-results]");
    if (breadcrumb) breadcrumb.innerHTML = renderPickerBreadcrumb();
    if (results) results.innerHTML = renderPickerRows();
  }

  function chooseActivity(sourceType, sourceId){
    const safeType = sourceType === "teacher_activity" ? "teacher_activity" : "catalog_activity";
    const source = safeType === "teacher_activity"
      ? teacherActivities.find((item) => String(item?.id || "") === String(sourceId || ""))
      : catalogActivities.find((item) => String(item?.id || "") === String(sourceId || ""));
    if (!source) return;
    const runtimeActivity = safeType === "teacher_activity" ? teacherActivityToCatalogShape(source) : source;
    if (!runtimeActivity?.id) {
      showToast?.("Cette activité ne peut pas être projetée.", { isError:true });
      return;
    }
    selectedItemId = "";
    const adaptiveAvailable = safeType === "catalog_activity"
      ? true
      : String(source?.difficulty_mode || "single") === "adaptive";
    commitAction("add-activity", { activity:runtimeActivity, adaptiveAvailable });
    closePicker();
  }

  function handlePickerAction(button){
    const action = String(button?.dataset?.activityPickerAction || "");
    const sourceType = String(button?.dataset?.sourceType || "");
    const folderId = String(button?.dataset?.folderId || "").trim() || null;
    if (action === "picker-root") {
      pickerSourceType = null;
      catalogFolderId = null;
      teacherFolderId = null;
      refreshPicker();
      return;
    }
    if (action === "open-source" || action === "source-root") {
      pickerSourceType = sourceType === "teacher_activity" ? "teacher_activity" : "catalog_activity";
      if (pickerSourceType === "teacher_activity") teacherFolderId = null;
      else catalogFolderId = null;
      refreshPicker();
      return;
    }
    if (action === "open-folder") {
      const effectiveType = sourceType || pickerSourceType;
      if (effectiveType === "teacher_activity") {
        pickerSourceType = "teacher_activity";
        teacherFolderId = folderId;
      } else {
        pickerSourceType = "catalog_activity";
        catalogFolderId = folderId;
      }
      refreshPicker();
      return;
    }
    if (action === "choose-activity") chooseActivity(sourceType, button.dataset.sourceId);
  }

  function closePicker(){ pickerOverlay?.remove?.(); pickerOverlay = null; }
  async function openPicker(){
    if (!(await ensureCatalog()) || pickerOverlay?.isConnected) return;
    pickerSourceType = null;
    catalogFolderId = null;
    teacherFolderId = null;
    searchQuery = "";
    const overlay = document.createElement("div");
    overlay.className = "modal tt-activity-picker-modal";
    overlay.innerHTML = `
      <div class="modal-content modal-content-wide tt-activity-source-picker-card" role="dialog" aria-modal="true" aria-labelledby="ttActivityPickerTitle">
        <div class="tt-activity-source-picker-head">
          <div id="ttActivityPickerTitle" class="modal-title">Ajouter une activité</div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-activity-picker-close aria-label="Fermer"><span class="dashboard-material-icon" aria-hidden="true">close</span></button>
        </div>
        <section class="panel activity-assignment-source-column tt-activity-source-picker-panel">
          <label class="dashboard-mission-catalog-search">
            <span class="dashboard-material-icon" aria-hidden="true">search</span>
            <input class="modal-text-input" type="search" data-activity-picker-search placeholder="Rechercher une activité…" autocomplete="off">
          </label>
          <div class="dashboard-sequence-picker-breadcrumb-slot tt-activity-source-picker-breadcrumb" data-activity-picker-breadcrumb></div>
          <div class="dashboard-mission-catalog-results dashboard-sequence-source-results activity-assignment-source-list tt-activity-source-picker-results" data-activity-picker-results></div>
        </section>
      </div>`;
    pickerOverlay = overlay;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target?.closest?.("[data-activity-picker-close]")) { closePicker(); return; }
      const actionButton = event.target?.closest?.("[data-activity-picker-action]");
      if (actionButton) handlePickerAction(actionButton);
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") { event.preventDefault(); closePicker(); }
    });
    const search = overlay.querySelector("[data-activity-picker-search]");
    search?.addEventListener("input", () => {
      searchQuery = String(search.value || "");
      refreshPicker();
    });
    refreshPicker();
    search?.focus?.();
  }

  function getSelectedItem(state){
    let item = state.playlist.find((entry) => entry.id === selectedItemId) || null;
    if (!item && state.playlist.length) {
      item = state.playlist[state.playlist.length - 1];
      selectedItemId = item.id;
    }
    if (!item) selectedItemId = "";
    return item;
  }

  function bindPlaylistDnD(){
    host?.querySelectorAll?.("[data-activity-playlist-item]").forEach((row) => {
      row.addEventListener("dragstart", (event) => {
        draggedItemId = String(row.dataset.activityPlaylistItem || "").trim();
        row.classList.add("is-dragging");
        try { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", draggedItemId); } catch {}
      });
      row.addEventListener("dragend", () => {
        draggedItemId = "";
        host.querySelectorAll(".tt-activity-playlist-row").forEach((item) => item.classList.remove("is-dragging", "is-drop-target"));
      });
      row.addEventListener("dragover", (event) => {
        if (!draggedItemId || draggedItemId === row.dataset.activityPlaylistItem) return;
        event.preventDefault();
        row.classList.add("is-drop-target");
      });
      row.addEventListener("dragleave", () => row.classList.remove("is-drop-target"));
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        row.classList.remove("is-drop-target");
        const targetId = String(row.dataset.activityPlaylistItem || "").trim();
        const state = getState();
        const targetIndex = state.playlist.findIndex((item) => item.id === targetId);
        if (!draggedItemId || targetIndex < 0) return;
        commitAction("reorder-activity", { itemId:draggedItemId, targetIndex });
      });
    });
  }

  function render(){
    if (!host) return;
    const state = getState();
    const selectedItem = getSelectedItem(state);
    const hasActivities = state.playlist.length > 0;
    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-activity-control" aria-label="Contrôles de la mini-app Activité">
        <div class="tt-control-panel-head"><div><h3>Activité</h3></div></div>
        <div class="tt-activity-playlist ${hasActivities ? "has-activities" : "is-empty"}">
          ${hasActivities ? state.playlist.map((item,index) => `
            <div class="tt-activity-playlist-row${item.id === selectedItem?.id ? " is-selected" : ""}${item.adaptiveAvailable ? "" : " is-single-level"}" data-activity-playlist-item="${escapeAttr(item.id)}" draggable="true" role="button" tabindex="0" aria-label="${escapeAttr(item.adaptiveAvailable ? `${item.activityLabel}, niveau ${item.level}` : item.activityLabel)}">
              <span class="dashboard-material-icon tt-activity-drag" aria-hidden="true">drag_indicator</span>
              <span class="tt-activity-playlist-index">${index + 1}</span>
              <span class="tt-activity-playlist-main"><strong>${escapeHtml(item.activityLabel)}</strong>${item.adaptiveAvailable ? `<small>Niveau ${item.level}</small>` : ""}</span>
              ${item.adaptiveAvailable ? `<span class="tt-activity-playlist-level">N${item.level}</span>` : ""}
              <button class="dashboard-icon-btn dashboard-material-icon-btn tt-activity-remove" type="button" data-remove-activity="${escapeAttr(item.id)}" aria-label="Retirer ${escapeAttr(item.activityLabel)}"><span class="dashboard-material-icon" aria-hidden="true">close</span></button>
            </div>`).join("") : `
            <div class="tt-activity-playlist-empty"><span class="dashboard-material-icon" aria-hidden="true">playlist_add</span><strong>Aucune activité</strong><span>Ajoute une activité à afficher dans cette page.</span></div>`}
        </div>
        <div class="tt-widget-action-bar tt-activity-primary-actions">
          <button id="ttActivityAdd" class="tt-widget-action-btn is-primary" type="button"><span class="dashboard-material-icon" aria-hidden="true">playlist_add</span><span>Ajouter une activité</span></button>
          ${hasActivities ? `<button id="ttActivityRestart" class="tt-widget-action-btn" type="button"><span class="dashboard-material-icon" aria-hidden="true">refresh</span><span>Relancer depuis le début</span></button>` : ""}
        </div>
        ${selectedItem?.adaptiveAvailable ? `
          <div class="tt-activity-level-block"><span class="tt-activity-level-label">Niveau de « ${escapeHtml(selectedItem.activityLabel)} »</span><div class="tt-activity-levels" role="group" aria-label="Niveau de difficulté">
            ${[1,2,3,4,5].map((level) => `<button class="tt-activity-level-btn ${selectedItem.level === level ? "is-active" : ""}" type="button" data-activity-level="${level}" aria-pressed="${selectedItem.level === level ? "true" : "false"}">${level}</button>`).join("")}
          </div>` : ""}
      </section>`;

    host.querySelector("#ttActivityAdd")?.addEventListener("click", openPicker);
    host.querySelector("#ttActivityRestart")?.addEventListener("click", () => commitAction("restart"));
    host.querySelectorAll("[data-activity-playlist-item]").forEach((row) => {
      const select = (event) => {
        if (event?.target?.closest?.("button")) return;
        selectedItemId = String(row.dataset.activityPlaylistItem || "").trim();
        render();
      };
      row.addEventListener("click", select);
      row.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); select(event); } });
    });
    host.querySelectorAll("[data-remove-activity]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const itemId = String(button.dataset.removeActivity || "").trim();
      if (itemId === selectedItemId) selectedItemId = "";
      commitAction("remove-activity", { itemId });
    }));
    host.querySelectorAll("[data-activity-level]").forEach((button) => button.addEventListener("click", () => {
      if (selectedItem) commitAction("set-item-level", { itemId:selectedItem.id, level:button.dataset.activityLevel });
    }));
    bindPlaylistDnD();
  }

  render();
  return { render, destroy(){ closePicker(); if (host) host.innerHTML = ""; } };
}
