import { getPedagogicalNodes } from "../../../../../shared/catalogue.js";
import { escapeAttr, escapeHtml } from "../../../dashboard/text-utils.js";
import {
  ACTIVITY_PROJECTION_MODE_SLIDESHOW,
  ACTIVITY_SLIDESHOW_ADVANCE_AUTO,
  applyProjectedActivityAction,
  normalizeProjectedActivityState
} from "./model.js";

function getActivityFolderId(activity){
  return String(activity?.folder_id ?? activity?.pedagogical_node_id ?? "").trim();
}

function getFolderLabel(folder){
  return String(folder?.name || folder?.label || folder?.title || folder?.id || "Dossier").trim();
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
  return labelGetter(a).localeCompare(labelGetter(b), "fr", { sensitivity: "base" });
}

function normalizeCatalogActivities(activities = []){
  return (Array.isArray(activities) ? activities : [])
    .filter((activity) => activity && activity.is_visible !== false && String(activity.status || "published") === "published")
    .slice()
    .sort((a, b) => compareByOrderThenLabel(a, b, getActivityLabel));
}

function normalizeFolders(folders = []){
  return (Array.isArray(folders) ? folders : [])
    .filter(Boolean)
    .map((folder) => ({ ...folder, id: String(folder.id || "").trim(), parent_id: String(folder.parent_id || "").trim() || null }))
    .filter((folder) => folder.id)
    .sort((a, b) => compareByOrderThenLabel(a, b, getFolderLabel));
}

export function createActivityControlPanel({
  host,
  getWidget,
  updateWidget,
  showToast,
  openProjector,
  setWidgetViewMode,
  getTeacherSpace,
  listCatalogActivitiesForTeacherSpace,
  listPedagogicalNodesForTeacher
} = {}){
  let pickerOverlay = null;
  let catalogActivities = [];
  let folders = [];
  let currentFolderId = null;
  let catalogLoaded = false;
  let catalogLoading = false;
  let selectedItemId = "";
  let draggedItemId = "";

  function getState(){
    return normalizeProjectedActivityState(getWidget?.()?.state);
  }

  function commitAction(action, payload = {}, { renderAfter = true } = {}){
    const result = applyProjectedActivityAction({ action, payload, state: getState() });
    if (!result?.patch) return false;
    updateWidget?.(result.patch, { renderPanel: renderAfter, sync: true });
    return true;
  }

  async function ensureCatalog(){
    if (catalogLoaded || catalogLoading) return catalogLoaded;
    catalogLoading = true;
    try {
      const teacherSpaceId = String(getTeacherSpace?.()?.id || "").trim();
      const [activitiesResult, foldersResult] = await Promise.all([
        teacherSpaceId && typeof listCatalogActivitiesForTeacherSpace === "function"
          ? listCatalogActivitiesForTeacherSpace(teacherSpaceId)
          : [],
        typeof listPedagogicalNodesForTeacher === "function"
          ? listPedagogicalNodesForTeacher()
          : getPedagogicalNodes()
      ]);
      catalogActivities = normalizeCatalogActivities(activitiesResult);
      folders = normalizeFolders(foldersResult?.length ? foldersResult : getPedagogicalNodes());
      catalogLoaded = true;
      return true;
    } catch (error) {
      console.error(error);
      showToast?.("Impossible de charger le Catalogue.", { isError: true });
      return false;
    } finally {
      catalogLoading = false;
    }
  }

  function getFolderById(folderId){
    const safeId = String(folderId || "").trim();
    return folders.find((folder) => folder.id === safeId) || null;
  }

  function getUsefulFolderIds(){
    const useful = new Set();
    const folderById = new Map(folders.map((folder) => [folder.id, folder]));
    catalogActivities.forEach((activity) => {
      let folderId = getActivityFolderId(activity);
      const seen = new Set();
      while (folderId && folderById.has(folderId) && !seen.has(folderId)) {
        useful.add(folderId);
        seen.add(folderId);
        folderId = String(folderById.get(folderId)?.parent_id || "").trim();
      }
    });
    return useful;
  }

  function getBreadcrumb(){
    const result = [];
    let cursor = getFolderById(currentFolderId);
    const seen = new Set();
    while (cursor && !seen.has(cursor.id)) {
      seen.add(cursor.id);
      result.unshift(cursor);
      cursor = getFolderById(cursor.parent_id);
    }
    return result;
  }

  function renderPickerContent(){
    if (!pickerOverlay) return;
    const body = pickerOverlay.querySelector("[data-activity-picker-body]");
    const crumbs = pickerOverlay.querySelector("[data-activity-picker-crumbs]");
    if (!body || !crumbs) return;

    const useful = getUsefulFolderIds();
    const parentKey = String(currentFolderId || "");
    const childFolders = folders.filter((folder) => String(folder.parent_id || "") === parentKey && useful.has(folder.id));
    const childActivities = catalogActivities.filter((activity) => getActivityFolderId(activity) === parentKey);
    const breadcrumb = getBreadcrumb();

    crumbs.innerHTML = `
      <button type="button" data-picker-folder="" class="tt-activity-picker-crumb">Exploration</button>
      ${breadcrumb.map((folder) => `
        <span class="dashboard-material-icon" aria-hidden="true">chevron_right</span>
        <button type="button" data-picker-folder="${escapeAttr(folder.id)}" class="tt-activity-picker-crumb">${escapeHtml(getFolderLabel(folder))}</button>
      `).join("")}
    `;

    const rows = [
      ...childFolders.map((folder) => `
        <button class="tt-activity-picker-entry is-folder" type="button" data-picker-folder="${escapeAttr(folder.id)}">
          <span class="dashboard-material-icon" aria-hidden="true">folder</span>
          <span><strong>${escapeHtml(getFolderLabel(folder))}</strong><small>Ouvrir le dossier</small></span>
          <span class="dashboard-material-icon tt-activity-picker-chevron" aria-hidden="true">chevron_right</span>
        </button>
      `),
      ...childActivities.map((activity) => `
        <button class="tt-activity-picker-entry is-activity" type="button" data-picker-activity="${escapeAttr(activity.id)}">
          <span class="dashboard-material-icon" aria-hidden="true">play_lesson</span>
          <span><strong>${escapeHtml(getActivityLabel(activity))}</strong><small>${escapeHtml(activity.description || "Activité du Catalogue")}</small></span>
        </button>
      `)
    ];

    body.innerHTML = rows.length
      ? rows.join("")
      : `<div class="tt-activity-picker-empty">Aucune activité dans ce dossier.</div>`;

    bindPickerEntries();
  }

  function bindPickerEntries(){
    pickerOverlay?.querySelectorAll?.("[data-picker-folder]").forEach((button) => {
      button.addEventListener("click", () => {
        currentFolderId = String(button.dataset.pickerFolder || "").trim() || null;
        renderPickerContent();
      });
    });

    pickerOverlay?.querySelectorAll?.("[data-picker-activity]").forEach((button) => {
      button.addEventListener("click", () => {
        const activityId = String(button.dataset.pickerActivity || "").trim();
        const activity = catalogActivities.find((item) => String(item.id) === activityId);
        if (!activity) return;
        selectedItemId = "";
        commitAction("add-activity", { activity });
        closePicker();
      });
    });
  }

  function closePicker(){
    pickerOverlay?.remove?.();
    pickerOverlay = null;
  }

  async function openPicker(){
    if (!(await ensureCatalog())) return;
    if (pickerOverlay?.isConnected) return;
    currentFolderId = null;

    const overlay = document.createElement("div");
    overlay.className = "modal tt-activity-picker-modal";
    overlay.innerHTML = `
      <div class="modal-content modal-content-wide tt-activity-picker-card" role="dialog" aria-modal="true" aria-labelledby="ttActivityPickerTitle">
        <div class="tt-activity-picker-head">
          <div>
            <div id="ttActivityPickerTitle" class="modal-title">Ajouter une activité</div>
            <div class="tt-activity-picker-crumbs" data-activity-picker-crumbs></div>
          </div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-activity-picker-close aria-label="Fermer">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </div>
        <div class="tt-activity-picker-body" data-activity-picker-body></div>
      </div>
    `;
    pickerOverlay = overlay;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target?.closest?.("[data-activity-picker-close]")) closePicker();
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePicker();
      }
    });
    renderPickerContent();
    overlay.querySelector("[data-activity-picker-close]")?.focus?.();
  }

  function projectActivity(){
    const widget = getWidget?.();
    const state = getState();
    if (!widget || !state.playlist.length) {
      showToast?.("Ajoute d’abord une activité.", { isError: true });
      return;
    }
    if (state.projectionMode === ACTIVITY_PROJECTION_MODE_SLIDESHOW) {
      commitAction("prepare-slideshow", {}, { renderAfter: true });
    }
    openProjector?.();
    setWidgetViewMode?.(widget.id, "stage");
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
        try {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", draggedItemId);
        } catch {}
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
        commitAction("reorder-activity", { itemId: draggedItemId, targetIndex });
      });
    });
  }

  function render(){
    if (!host) return;
    const state = getState();
    const selectedItem = getSelectedItem(state);
    const hasActivities = state.playlist.length > 0;

    host.innerHTML = `
      <section class="tt-control-panel tt-control-panel-compact tt-activity-control" aria-label="Contrôles du widget Activité">
        <div class="tt-control-panel-head">
          <div>
            <h3>Activités projetées</h3>
            <p>Une seule fenêtre de projection, avec une liste d’activités à enchaîner.</p>
          </div>
        </div>

        <div class="tt-activity-playlist ${hasActivities ? "has-activities" : "is-empty"}">
          ${hasActivities ? state.playlist.map((item, index) => `
            <div
              class="tt-activity-playlist-row ${item.id === selectedItem?.id ? "is-selected" : ""}"
              data-activity-playlist-item="${escapeAttr(item.id)}"
              draggable="true"
              role="button"
              tabindex="0"
              aria-label="${escapeAttr(`${item.activityLabel}, niveau ${item.level}`)}"
            >
              <span class="dashboard-material-icon tt-activity-drag" aria-hidden="true">drag_indicator</span>
              <span class="tt-activity-playlist-index">${index + 1}</span>
              <span class="tt-activity-playlist-main">
                <strong>${escapeHtml(item.activityLabel)}</strong>
                <small>Niveau ${item.level}</small>
              </span>
              <span class="tt-activity-playlist-level">N${item.level}</span>
              <button class="dashboard-icon-btn dashboard-material-icon-btn tt-activity-remove" type="button" data-remove-activity="${escapeAttr(item.id)}" aria-label="Retirer ${escapeAttr(item.activityLabel)}">
                <span class="dashboard-material-icon" aria-hidden="true">close</span>
              </button>
            </div>
          `).join("") : `
            <div class="tt-activity-playlist-empty">
              <span class="dashboard-material-icon" aria-hidden="true">playlist_add</span>
              <strong>Aucune activité</strong>
              <span>Ajoute les activités à projeter dans l’ordre souhaité.</span>
            </div>
          `}
        </div>

        <div class="tt-widget-action-bar tt-activity-primary-actions">
          <button id="ttActivityAdd" class="tt-widget-action-btn is-primary" type="button">
            <span class="dashboard-material-icon" aria-hidden="true">playlist_add</span>
            <span>Ajouter une activité</span>
          </button>
          ${hasActivities ? `
            <button id="ttActivityRestart" class="tt-widget-action-btn" type="button">
              <span class="dashboard-material-icon" aria-hidden="true">refresh</span>
              <span>Relancer depuis le début</span>
            </button>
          ` : ""}
        </div>

        ${selectedItem ? `
          <div class="tt-activity-level-block">
            <span class="tt-activity-level-label">Niveau de « ${escapeHtml(selectedItem.activityLabel)} »</span>
            <div class="tt-activity-levels" role="group" aria-label="Niveau de difficulté de l’activité sélectionnée">
              ${[1,2,3,4,5].map((level) => `
                <button class="tt-activity-level-btn ${selectedItem.level === level ? "is-active" : ""}" type="button" data-activity-level="${level}" aria-pressed="${selectedItem.level === level ? "true" : "false"}">${level}</button>
              `).join("")}
            </div>
          </div>
        ` : ""}

        ${hasActivities ? `
          <div class="tt-activity-projection-options">
            <div class="tt-activity-projection-mode-row">
              <div class="tt-activity-projection-mode-copy">
                <strong>Mode défilement</strong>
                <span>Afficher seulement les questions, sans réponse ni correction.</span>
              </div>
              <label class="tt-widget-action-toggle" title="Activer le mode défilement">
                <input id="ttActivitySlideshowToggle" type="checkbox" ${state.projectionMode === ACTIVITY_PROJECTION_MODE_SLIDESHOW ? "checked" : ""}>
                <span class="tt-widget-action-toggle-track" aria-hidden="true"></span>
              </label>
            </div>

            ${state.projectionMode === ACTIVITY_PROJECTION_MODE_SLIDESHOW ? `
              <div class="tt-activity-slideshow-settings">
                <span class="tt-activity-slideshow-label">Passage des questions</span>
                <div class="tt-activity-slideshow-mode-buttons" role="group" aria-label="Passage des questions">
                  <button class="tt-widget-action-btn ${state.slideshowAdvanceMode !== ACTIVITY_SLIDESHOW_ADVANCE_AUTO ? "is-primary" : ""}" type="button" data-slideshow-advance="manual">Manuel</button>
                  <button class="tt-widget-action-btn ${state.slideshowAdvanceMode === ACTIVITY_SLIDESHOW_ADVANCE_AUTO ? "is-primary" : ""}" type="button" data-slideshow-advance="auto">Automatique</button>
                </div>
                ${state.slideshowAdvanceMode === ACTIVITY_SLIDESHOW_ADVANCE_AUTO ? `
                  <label class="tt-activity-slideshow-duration">
                    <span>Durée par question</span>
                    <span class="tt-activity-slideshow-duration-input">
                      <input id="ttActivitySlideshowSeconds" type="number" min="2" max="300" step="1" value="${escapeAttr(state.slideshowSeconds)}">
                      <span>s</span>
                    </span>
                  </label>
                ` : ""}
                <div class="tt-activity-slideshow-live-actions">
                  <button id="ttActivitySlideshowStart" class="tt-widget-action-btn is-primary" type="button" ${state.slideshowStarted ? "disabled" : ""}>
                    <span class="dashboard-material-icon" aria-hidden="true">play_arrow</span>
                    <span>${state.slideshowStarted ? "Défilement démarré" : "Démarrer"}</span>
                  </button>
                  <button id="ttActivitySlideshowDockToggle" class="tt-widget-action-btn" type="button">
                    <span class="dashboard-material-icon" aria-hidden="true">${state.slideshowDockCollapsed ? "chevron_right" : "chevron_left"}</span>
                    <span>${state.slideshowDockCollapsed ? "Afficher la console" : "Replier la console"}</span>
                  </button>
                </div>
              </div>
            ` : ""}
          </div>
        ` : ""}

        <button id="ttActivityProject" class="tt-activity-project-btn" type="button" ${hasActivities ? "" : "disabled"}>
          <span class="dashboard-material-icon" aria-hidden="true">cast</span>
          <span>Projeter</span>
        </button>

        <div class="tt-activity-rule-note">
          <span class="dashboard-material-icon" aria-hidden="true">lock</span>
          <span>Un seul widget Activité peut exister. Le runtime ne fonctionne qu’en Scène complète et s’arrête totalement dès qu’on en sort.</span>
        </div>
      </section>
    `;

    host.querySelector("#ttActivityAdd")?.addEventListener("click", openPicker);
    host.querySelector("#ttActivityRestart")?.addEventListener("click", () => commitAction("restart"));
    host.querySelector("#ttActivityProject")?.addEventListener("click", projectActivity);

    host.querySelectorAll("[data-activity-playlist-item]").forEach((row) => {
      const select = (event) => {
        if (event?.target?.closest?.("button")) return;
        selectedItemId = String(row.dataset.activityPlaylistItem || "").trim();
        render();
      };
      row.addEventListener("click", select);
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        select(event);
      });
    });

    host.querySelectorAll("[data-remove-activity]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const itemId = String(button.dataset.removeActivity || "").trim();
        if (itemId === selectedItemId) selectedItemId = "";
        commitAction("remove-activity", { itemId });
      });
    });

    host.querySelectorAll("[data-activity-level]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!selectedItem) return;
        commitAction("set-item-level", { itemId: selectedItem.id, level: button.dataset.activityLevel });
      });
    });

    host.querySelector("#ttActivitySlideshowToggle")?.addEventListener("change", (event) => {
      commitAction("set-projection-mode", {
        mode: event.currentTarget.checked ? "slideshow" : "interactive"
      });
    });

    host.querySelectorAll("[data-slideshow-advance]").forEach((button) => {
      button.addEventListener("click", () => {
        commitAction("set-slideshow-advance-mode", { mode: button.dataset.slideshowAdvance });
      });
    });

    const slideshowSecondsInput = host.querySelector("#ttActivitySlideshowSeconds");
    slideshowSecondsInput?.addEventListener("change", () => {
      commitAction("set-slideshow-seconds", { seconds: slideshowSecondsInput.value });
    });

    host.querySelector("#ttActivitySlideshowStart")?.addEventListener("click", () => {
      commitAction("start-slideshow");
    });

    host.querySelector("#ttActivitySlideshowDockToggle")?.addEventListener("click", () => {
      commitAction("set-slideshow-dock-collapsed", { collapsed: !state.slideshowDockCollapsed });
    });

    bindPlaylistDnD();
  }

  render();
  return {
    render,
    destroy(){
      closePicker();
      if (host) host.innerHTML = "";
    }
  };
}
