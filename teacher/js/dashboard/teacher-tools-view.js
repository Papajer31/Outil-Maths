import {
  buildTeacherToolsProjectorUrl,
  createTeacherToolsChannel,
  getOrCreateTeacherToolsSessionChannelId
} from "../teacher-tools/channel.js";
import { getTeacherTool, listTeacherTools } from "../teacher-tools/registry.js";
import {
  SURFACE_BACKGROUND_SCOPE_PAGE,
  SURFACE_BACKGROUND_SCOPE_SHARED,
  createInitialSurfaceState,
  applySurfaceAction,
  normalizeSurfaceState
} from "../teacher-tools/surface/state.js";
import { createSurfaceBackgroundPanel } from "../teacher-tools/surface/background-control.js";
import { normalizeSceneBackgroundState } from "../teacher-tools/widgets/background/tool.js";
import { applyOverlayWidgetAction, getTimerRemainingMs, normalizeOverlayWidgetsState } from "../teacher-tools/overlay-widgets/state.js";
import { createWorkspacePersistence } from "../teacher-tools/workspace-persistence.js";
import { createWorkspaceSessionDraftStore } from "../teacher-tools/workspace-session-draft.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";

const WORKSPACE_VERSION = 5;

function clonePlain(value){
  try { if (typeof structuredClone === "function") return structuredClone(value); } catch {}
  return JSON.parse(JSON.stringify(value ?? null));
}

function createPageId(toolId = "page"){
  const prefix = String(toolId || "page").trim() || "page";
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createPage(tool){
  return {
    id: createPageId(tool.id),
    toolId: tool.id,
    label: tool.label,
    icon: tool.icon,
    state: tool.createInitialState?.() || {},
    surface: createInitialSurfaceState()
  };
}

function createBlankPage(){
  return {
    id: createPageId("blank"),
    toolId: "",
    label: "Page vierge",
    icon: "crop_square",
    state: {},
    surface: createInitialSurfaceState()
  };
}

function normalizePage(raw = {}){
  const rawToolId = String(raw.toolId || "").trim();
  if (!rawToolId) {
    return {
      id: String(raw.id || createPageId("blank")),
      toolId: "",
      label: String(raw.label || "Page vierge"),
      icon: String(raw.icon || "crop_square"),
      state: {},
      surface: normalizeSurfaceState(raw.surface)
    };
  }
  const tool = getTeacherTool(rawToolId);
  if (!tool) return null;
  return {
    id: String(raw.id || createPageId(tool.id)),
    toolId: tool.id,
    label: String(raw.label || tool.label),
    icon: String(raw.icon || tool.icon || "widgets"),
    state: raw.state && typeof raw.state === "object" ? raw.state : (tool.createInitialState?.() || {}),
    surface: normalizeSurfaceState(raw.surface)
  };
}

function pageSupports(page, capability){
  if (!page) return false;
  if (!page.toolId) return capability === "background" || capability === "annotations";
  return getTeacherTool(page.toolId)?.surface?.[capability] === true;
}

function normalizeWorkspace(raw = {}){
  const pages = (Array.isArray(raw.pages) ? raw.pages : []).map(normalizePage).filter(Boolean);
  const requested = String(raw.selectedPageId || "");
  const selectedPageId = pages.some((page) => page.id === requested) ? requested : (pages[0]?.id || "");
  return {
    version: WORKSPACE_VERSION,
    selectedPageId,
    sharedBackground: normalizeSceneBackgroundState(raw.sharedBackground || { background: "white" }),
    widgets: normalizeOverlayWidgetsState(raw.widgets),
    pages
  };
}

export function createTeacherToolsViewController({
  view,
  host,
  getCurrentTeacherSpace,
  getCurrentStudents,
  listCatalogActivitiesForTeacherSpace,
  listPedagogicalNodesForTeacher,
  listResourcesForSpace,
  uploadResourceForSpace,
  createResourceSignedUrl,
  getTeacherTableauWorkspaceForSpace,
  saveTeacherTableauWorkspaceForSpace,
  uploadTeacherTableauAsset,
  createTeacherTableauAssetSignedUrl,
  cleanupTeacherTableauAssetsForSpace,
  showToast
} = {}){
  const tools = listTeacherTools();
  let workspace = normalizeWorkspace();
  let channelId = "";
  let channel = null;
  let channelTeacherSpaceId = "";
  let projectorWindow = null;
  let projectorConnected = false;
  let appControlSession = null;
  let backgroundPanelSession = null;
  let backgroundPanelOpen = false;
  let pickerOverlay = null;
  let closeConfirmOverlay = null;
  let workspaceLoadedSpaceId = "";
  let workspaceLoadPromise = null;
  let workspaceRevision = 0;
  let isDirty = false;
  let isSaving = false;
  let draftSaveTimer = 0;
  let draftSaveEpoch = 0;

  const persistence = createWorkspacePersistence({
    uploadAsset: uploadTeacherTableauAsset,
    createAssetSignedUrl: createTeacherTableauAssetSignedUrl,
    cleanupAssets: cleanupTeacherTableauAssetsForSpace
  });
  const sessionDraft = createWorkspaceSessionDraftStore();

  function teacherSpaceId(){ return String(getCurrentTeacherSpace?.()?.id || "").trim(); }
  function selectedPage(){ return workspace.pages.find((page) => page.id === workspace.selectedPageId) || null; }
  function getPage(pageId){ return workspace.pages.find((page) => page.id === String(pageId || "")) || null; }

  function sessionChannelId(spaceId = teacherSpaceId()){
    const safeSpaceId = String(spaceId || "").trim();
    if (!safeSpaceId) return "";
    const persistentId = getOrCreateTeacherToolsSessionChannelId(safeSpaceId);
    if (channelTeacherSpaceId === safeSpaceId || !channelTeacherSpaceId) channelId = persistentId;
    return persistentId;
  }

  function cancelSessionDraftSave(){
    if (!draftSaveTimer) return;
    clearTimeout(draftSaveTimer);
    draftSaveTimer = 0;
  }

  async function persistSessionDraftNow(){
    draftSaveTimer = 0;
    if (!isDirty) return;
    const spaceId = teacherSpaceId();
    const safeChannelId = sessionChannelId(spaceId);
    if (!spaceId || !safeChannelId) return;
    const epoch = draftSaveEpoch;
    const revision = workspaceRevision;
    const snapshot = normalizeWorkspace(clonePlain(workspace));
    await sessionDraft.save(spaceId, safeChannelId, snapshot, { revision });
    if (epoch !== draftSaveEpoch || !isDirty) {
      await sessionDraft.clear(spaceId, safeChannelId);
      return;
    }
    if (revision !== workspaceRevision) scheduleSessionDraftSave();
  }

  function scheduleSessionDraftSave(){
    cancelSessionDraftSave();
    draftSaveTimer = window.setTimeout(() => { void persistSessionDraftNow(); }, 180);
  }

  function markDirty(){
    workspaceRevision += 1;
    isDirty = true;
    renderSaveStatus();
    scheduleSessionDraftSave();
  }

  function handlePageHide(){
    if (!isDirty) return;
    cancelSessionDraftSave();
    void persistSessionDraftNow();
  }

  window.addEventListener("pagehide", handlePageHide);

  function setCleanIfUnchanged(revision){
    if (workspaceRevision !== revision) return;
    isDirty = false;
    renderSaveStatus();
  }

  function renderSaveStatus(){
    const button = host?.querySelector("#btnTeacherToolsSaveProjector");
    if (!button) return;
    button.disabled = isSaving || !isDirty;
    button.classList.toggle("is-saving", isSaving);
    const icon = button.querySelector(".dashboard-material-icon");
    const label = button.querySelector("span:last-child");
    if (icon) icon.textContent = isSaving ? "sync" : "save";
    if (label) label.textContent = isSaving ? "Enregistrement…" : "Enregistrer la projection";
  }

  function workspaceSnapshotForSave(){
    const snapshot = normalizeWorkspace(clonePlain(workspace));
    const widgets = normalizeOverlayWidgetsState(snapshot.widgets);
    const remainingMs = getTimerRemainingMs(widgets.timer);
    snapshot.widgets = normalizeOverlayWidgetsState({
      ...widgets,
      timer: {
        ...widgets.timer,
        remainingMs,
        running:false,
        deadlineAt:0
      }
    });
    return snapshot;
  }

  async function ensureWorkspaceLoaded(){
    const spaceId = teacherSpaceId();
    if (!spaceId) return;
    if (workspaceLoadedSpaceId === spaceId) return;
    if (workspaceLoadPromise) return workspaceLoadPromise;

    workspaceLoadPromise = (async () => {
      workspace = normalizeWorkspace();
      persistence.clearLiveRegistry();
      isDirty = false;
      workspaceRevision = 0;
      try {
        const safeChannelId = sessionChannelId(spaceId);
        let savedWorkspace = normalizeWorkspace();
        let savedWorkspaceError = null;

        try {
          const record = typeof getTeacherTableauWorkspaceForSpace === "function"
            ? await getTeacherTableauWorkspaceForSpace(spaceId)
            : null;
          if (record?.workspace) {
            const hydrated = await persistence.hydrateWorkspace(record);
            savedWorkspace = normalizeWorkspace(hydrated.workspace);
          }
        } catch (error) {
          savedWorkspaceError = error;
        }

        const draft = safeChannelId ? await sessionDraft.load(spaceId, safeChannelId) : null;
        if (draft?.workspace) {
          const draftWorkspace = normalizeWorkspace(draft.workspace);
          workspace = normalizeWorkspace(mergeProjectorStateKeepingLocalFiles(savedWorkspace, draftWorkspace));
          workspaceRevision = Math.max(1, Number(draft.revision) || 1);
          isDirty = true;
        } else {
          workspace = savedWorkspace;
          if (savedWorkspaceError) throw savedWorkspaceError;
        }
      } catch (error) {
        console.error("Impossible de restaurer le Tableau enregistré.", error);
        showToast?.("Impossible de restaurer le Tableau enregistré.", { isError:true });
      } finally {
        workspaceLoadedSpaceId = spaceId;
        workspaceLoadPromise = null;
      }
    })();
    return workspaceLoadPromise;
  }

  async function saveWorkspace(){
    const spaceId = teacherSpaceId();
    if (!spaceId) {
      showToast?.("Espace enseignant introuvable.", { isError:true });
      return false;
    }
    if (isSaving) return false;
    if (typeof saveTeacherTableauWorkspaceForSpace !== "function") {
      showToast?.("L’enregistrement du Tableau est indisponible.", { isError:true });
      return false;
    }

    isSaving = true;
    renderSaveStatus();
    const revisionAtStart = workspaceRevision;
    let serialized = null;
    try {
      serialized = await persistence.serializeWorkspace(workspaceSnapshotForSave(), { teacherSpaceId:spaceId });
      await saveTeacherTableauWorkspaceForSpace(spaceId, {
        workspace: serialized.workspace,
        assets: serialized.assets,
        workspaceVersion: WORKSPACE_VERSION
      });
      try {
        await persistence.cleanupAfterSave(spaceId, serialized.assets);
      } catch (cleanupError) {
        console.warn("Le Tableau est enregistré, mais certains anciens fichiers n’ont pas pu être nettoyés.", cleanupError);
      }
      const unchanged = workspaceRevision === revisionAtStart;
      setCleanIfUnchanged(revisionAtStart);
      if (unchanged) {
        cancelSessionDraftSave();
        draftSaveEpoch += 1;
        await sessionDraft.clear(spaceId, sessionChannelId(spaceId));
      } else {
        scheduleSessionDraftSave();
      }
      showToast?.("Projection enregistrée.");
      return true;
    } catch (error) {
      console.error("Impossible d’enregistrer la projection.", error);
      if (serialized?.uploadedPaths?.length) {
        try { await persistence.cleanupFailedUploads(spaceId, serialized.uploadedPaths); } catch {}
      }
      showToast?.(error?.message || "Impossible d’enregistrer la projection.", { isError:true });
      return false;
    } finally {
      isSaving = false;
      renderSaveStatus();
    }
  }

  function cloneWorkspaceForProjector(){
    return normalizeWorkspace({
      ...workspace,
      sharedBackground: clonePlain(workspace.sharedBackground),
      widgets: clonePlain(normalizeOverlayWidgetsState(workspace.widgets)),
      pages: workspace.pages.map((page) => {
        const tool = getTeacherTool(page.toolId);
        const rawState = clonePlain(page.state);
        const state = tool?.createProjectorState?.({
          state: rawState,
          students: getCurrentStudents?.() || [],
          teacherSpace: getCurrentTeacherSpace?.() || null
        }) || rawState;
        return { ...page, state, surface: clonePlain(normalizeSurfaceState(page.surface)) };
      })
    });
  }

  function representsSameLocalFile(currentObject, incomingObject){
    const currentSource = String(currentObject?.source || currentObject?.backgroundImageSource || "");
    const incomingSource = String(incomingObject?.source || incomingObject?.backgroundImageSource || "");
    const currentIsBlob = currentSource.startsWith("blob:");
    const incomingIsBlob = incomingSource.startsWith("blob:");
    if (incomingIsBlob && !currentIsBlob) return false;
    if (currentIsBlob && !incomingIsBlob) return true;

    const identityKeys = [
      "imageName", "pdfName", "backgroundImageName",
      "naturalWidth", "naturalHeight",
      "backgroundImageNaturalWidth", "backgroundImageNaturalHeight"
    ];
    const meaningfulKeys = identityKeys.filter((key) => currentObject?.[key] != null || incomingObject?.[key] != null);
    if (!meaningfulKeys.length) return true;
    return meaningfulKeys.every((key) => String(currentObject?.[key] ?? "") === String(incomingObject?.[key] ?? ""));
  }

  function mergeProjectorStateKeepingLocalFiles(currentValue, incomingValue){
    if (Array.isArray(incomingValue)) {
      const currentItems = Array.isArray(currentValue) ? currentValue : [];
      const currentById = new Map(currentItems
        .filter((item) => item && typeof item === "object" && String(item.id || "").trim())
        .map((item) => [String(item.id), item]));
      return incomingValue.map((item, index) => {
        const matching = item && typeof item === "object" && String(item.id || "").trim()
          ? currentById.get(String(item.id))
          : currentItems[index];
        return mergeProjectorStateKeepingLocalFiles(matching, item);
      });
    }
    if (!incomingValue || typeof incomingValue !== "object") return incomingValue;

    const currentObject = currentValue && typeof currentValue === "object" ? currentValue : {};
    const merged = {};
    for (const [key, value] of Object.entries(incomingValue)) {
      merged[key] = mergeProjectorStateKeepingLocalFiles(currentObject[key], value);
    }

    if (incomingValue.sourceKind === "file"
      && currentObject.sourceKind === "file"
      && representsSameLocalFile(currentObject, incomingValue)
      && typeof currentObject.source === "string"
      && currentObject.source) {
      merged.source = currentObject.source;
    }
    if (incomingValue.backgroundImageKind === "file"
      && currentObject.backgroundImageKind === "file"
      && representsSameLocalFile(currentObject, incomingValue)
      && typeof currentObject.backgroundImageSource === "string"
      && currentObject.backgroundImageSource) {
      merged.backgroundImageSource = currentObject.backgroundImageSource;
    }
    return merged;
  }

  function adoptProjectorWorkspace(rawWorkspace){
    if (!rawWorkspace || typeof rawWorkspace !== "object") return;
    const incoming = normalizeWorkspace(clonePlain(rawWorkspace));
    const merged = normalizeWorkspace(mergeProjectorStateKeepingLocalFiles(workspace, incoming));
    let changed = true;
    try { changed = JSON.stringify(workspace) !== JSON.stringify(merged); } catch {}
    if (!changed) return;
    workspace = merged;
    markDirty();
    renderPageList();
    renderControls();
    if (backgroundPanelOpen) renderBackgroundPanel();
  }

  function ensureChannel(){
    const spaceId = teacherSpaceId();
    if (!spaceId) return null;
    if (channel && channelTeacherSpaceId === spaceId) return channel;
    channel?.close?.();
    channelTeacherSpaceId = spaceId;
    channelId = sessionChannelId(spaceId);
    channel = createTeacherToolsChannel({
      teacherSpaceId: spaceId,
      channelId,
      onMessage(message){
        if (message?.type === "projector-workspace" && message?.bootstrapped === true) {
          adoptProjectorWorkspace(message.workspace);
          return;
        }
        if (message?.type === "projector-ready" || message?.type === "request-workspace") {
          projectorConnected = true;
          renderHeaderStatus();
          syncProjector();
          return;
        }
        if (message?.type === "projector-closed") {
          projectorConnected = false;
          renderHeaderStatus();
          return;
        }
        if (message?.type === "select-page") {
          selectPage(message.pageId, { sync: false });
          return;
        }
        if (message?.type === "add-page") {
          if (message.blank === true || !String(message.toolId || "").trim()) addBlankPage();
          else addPage(message.toolId);
          return;
        }
        if (message?.type === "close-page") {
          removePage(message.pageId);
          return;
        }
        if (message?.type === "app-action") {
          applyAppAction(message.pageId, message.action, message.payload);
          return;
        }
        if (message?.type === "surface-action") {
          applyPageSurfaceAction(message.pageId, message.action, message.payload);
          return;
        }
        if (message?.type === "widget-action") {
          applyGlobalWidgetAction(message.widgetId, message.action, message.payload);
        }
      }
    });
    return channel;
  }

  function send(type, payload = {}){
    return ensureChannel()?.send(type, payload);
  }

  function syncProjector(){ send("workspace-state", { workspace: cloneWorkspaceForProjector() }); }

  function openProjector(){
    const spaceId = teacherSpaceId();
    if (!spaceId) {
      showToast?.("Crée d’abord ton espace enseignant.", { isError: true });
      return;
    }
    const safeChannel = ensureChannel();
    if (!safeChannel) {
      showToast?.("Le navigateur ne permet pas d’ouvrir le canal de projection.", { isError: true });
      return;
    }
    if (projectorWindow && !projectorWindow.closed) {
      try { projectorWindow.focus(); } catch {}
      syncProjector();
      return;
    }
    if (projectorConnected) {
      try { projectorWindow = window.open("", "teacherToolsProjector"); } catch {}
      if (projectorWindow && !projectorWindow.closed) {
        try { projectorWindow.focus(); } catch {}
        syncProjector();
        return;
      }
    }
    const url = buildTeacherToolsProjectorUrl({ teacherSpaceId: spaceId, channelId });
    projectorWindow = window.open(url, "teacherToolsProjector", [
      "popup=yes", "width=1400", "height=900", "menubar=no", "toolbar=no",
      "location=no", "status=no", "resizable=yes", "scrollbars=no"
    ].join(","));
    if (!projectorWindow) {
      showToast?.("La fenêtre de projection a été bloquée par le navigateur.", { isError: true });
      return;
    }
    try { projectorWindow.focus(); } catch {}
    renderHeaderStatus();
    window.setTimeout(syncProjector, 160);
  }

  function closeProjectorNow(){
    // Le message couvre aussi le cas où la fenêtre principale a été rechargée
    // et ne possède plus la référence JS directe vers la popup.
    send("close-projector");
    if (projectorWindow && !projectorWindow.closed) {
      try { projectorWindow.close(); } catch {}
    }
    projectorWindow = null;
    projectorConnected = false;
    renderHeaderStatus();
  }

  function closeCloseConfirmOverlay(){
    closeConfirmOverlay?.remove?.();
    closeConfirmOverlay = null;
  }

  function askCloseProjectorAction(){
    return new Promise((resolve) => {
      closeCloseConfirmOverlay();
      const overlay = document.createElement("div");
      overlay.className = "modal dashboard-confirm-dialog tt-save-projector-dialog";
      overlay.innerHTML = `
        <section class="modal-content modal-content-wide" role="dialog" aria-modal="true" aria-labelledby="ttSaveProjectorDialogTitle">
          <header class="dashboard-confirm-dialog-header">
            <h2 class="modal-title" id="ttSaveProjectorDialogTitle">Enregistrer le Tableau ?</h2>
          </header>
          <p class="dashboard-confirm-dialog-message">Le Tableau a été modifié depuis le dernier enregistrement.</p>
          <footer class="modal-actions dashboard-confirm-dialog-actions">
            <button class="btn" type="button" data-tt-close-choice="cancel">Annuler</button>
            <button class="btn" type="button" data-tt-close-choice="discard">Fermer sans enregistrer</button>
            <button class="btn primary" type="button" data-tt-close-choice="save">Enregistrer et fermer</button>
          </footer>
        </section>`;
      document.body.appendChild(overlay);
      closeConfirmOverlay = overlay;
      let settled = false;
      const finish = (choice) => {
        if (settled) return;
        settled = true;
        closeCloseConfirmOverlay();
        resolve(choice);
      };
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) finish("cancel");
        const button = event.target.closest("[data-tt-close-choice]");
        if (button) finish(String(button.dataset.ttCloseChoice || "cancel"));
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); finish("cancel"); }
      });
      requestAnimationFrame(() => overlay.querySelector('[data-tt-close-choice="save"]')?.focus());
    });
  }

  async function requestCloseProjector(){
    if (!isDirty) { closeProjectorNow(); return; }
    const choice = await askCloseProjectorAction();
    if (choice === "discard") { closeProjectorNow(); return; }
    if (choice !== "save") return;
    if (await saveWorkspace()) closeProjectorNow();
  }

  function selectPage(pageId, { sync = true } = {}){
    const page = getPage(pageId);
    if (!page || workspace.selectedPageId === page.id) return;
    workspace = { ...workspace, selectedPageId: page.id };
    markDirty();
    if (!pageSupports(page, "background")) backgroundPanelOpen = false;
    renderPageList();
    renderControls();
    renderBackgroundPanel();
    if (sync) syncProjector();
  }

  function addPage(toolId){
    const tool = getTeacherTool(toolId);
    if (!tool) return;
    // Une page est une instance indépendante : un même type de mini-app peut
    // donc être ajouté plusieurs fois au Tableau, avec son propre état.
    const page = createPage(tool);
    workspace = normalizeWorkspace({ ...workspace, selectedPageId: page.id, pages: [...workspace.pages, page] });
    markDirty();
    renderView();
    syncProjector();
  }

  function addBlankPage(){
    const page = createBlankPage();
    workspace = normalizeWorkspace({ ...workspace, selectedPageId: page.id, pages: [...workspace.pages, page] });
    markDirty();
    renderView();
    syncProjector();
  }

  function removePage(pageId){
    const page = getPage(pageId);
    if (!page) return;
    try { getTeacherTool(page.toolId)?.disposeState?.({ state: page.state, page }); } catch {}
    const pages = workspace.pages.filter((item) => item.id !== page.id);
    const nextSelected = workspace.selectedPageId === page.id
      ? (pages[Math.max(0, workspace.pages.indexOf(page) - 1)]?.id || pages[0]?.id || "")
      : workspace.selectedPageId;
    workspace = normalizeWorkspace({ ...workspace, selectedPageId: nextSelected, pages });
    markDirty();
    if (!pages.length) backgroundPanelOpen = false;
    renderView();
    syncProjector();
  }

  function updatePage(pageId, patch = {}, { renderPanel = true, sync = true } = {}){
    const id = String(pageId || "");
    let changed = false;
    workspace = normalizeWorkspace({
      ...workspace,
      pages: workspace.pages.map((page) => {
        if (page.id !== id) return page;
        changed = true;
        return {
          ...page,
          ...patch,
          state: patch.state && typeof patch.state === "object" ? patch.state : page.state,
          surface: patch.surface ? normalizeSurfaceState(patch.surface) : page.surface
        };
      })
    });
    if (!changed) return;
    markDirty();
    if (renderPanel) renderControls();
    if (sync) syncProjector();
  }

  function applyAppAction(pageId, action, payload = {}){
    const page = getPage(pageId);
    const tool = page ? getTeacherTool(page.toolId) : null;
    if (!page || typeof tool?.applyAction !== "function") return;
    const result = tool.applyAction({
      action: String(action || ""), payload: payload || {}, state: page.state, page,
      students: getCurrentStudents?.() || []
    });
    if (!result || typeof result !== "object") return;
    if (result.error) {
      showToast?.(String(result.error), { isError: true });
      return;
    }
    if (result.patch) updatePage(page.id, result.patch, { renderPanel: true, sync: true });
    if (result.message) showToast?.(String(result.message), { isError: result.isError === true });
  }

  function setPageBackground(pageId, background, { renderView = true } = {}){
    const page = getPage(pageId);
    if (!page) return;
    const surface = normalizeSurfaceState(page.surface);
    updatePage(page.id, {
      surface: { ...surface, background: normalizeSceneBackgroundState(background) }
    }, { renderPanel: false, sync: true });
    if (renderView && backgroundPanelOpen) renderBackgroundPanel();
  }

  function setSharedBackground(background, { renderView = true } = {}){
    workspace = normalizeWorkspace({ ...workspace, sharedBackground: normalizeSceneBackgroundState(background) });
    markDirty();
    if (renderView && backgroundPanelOpen) renderBackgroundPanel();
    syncProjector();
  }

  function setBackgroundScope(pageId, scope){
    const page = getPage(pageId);
    if (!page) return;
    const surface = normalizeSurfaceState(page.surface);
    const nextScope = scope === SURFACE_BACKGROUND_SCOPE_SHARED
      ? SURFACE_BACKGROUND_SCOPE_SHARED
      : SURFACE_BACKGROUND_SCOPE_PAGE;
    const nextSurface = {
      ...surface,
      backgroundScope: nextScope,
      // En quittant le mode partagé, la page repart visuellement du fond partagé
      // courant au lieu de réapparaître avec un ancien fond local inattendu.
      background: nextScope === SURFACE_BACKGROUND_SCOPE_PAGE && surface.backgroundScope === SURFACE_BACKGROUND_SCOPE_SHARED
        ? normalizeSceneBackgroundState(workspace.sharedBackground)
        : surface.background
    };
    updatePage(page.id, { surface: nextSurface }, { renderPanel: false, sync: true });
    if (backgroundPanelOpen) renderBackgroundPanel();
  }

  function setPageSnapEnabled(pageId, enabled){
    const page = getPage(pageId);
    if (!page) return;
    const surface = applySurfaceAction(page.surface, "set-snap-enabled", { enabled });
    updatePage(page.id, { surface }, { renderPanel: false, sync: true });
    if (backgroundPanelOpen) renderBackgroundPanel();
  }

  function applyPageSurfaceAction(pageId, action, payload = {}){
    const page = getPage(pageId);
    if (!page) return;
    let surface = applySurfaceAction(page.surface, action, payload);
    let state = page.state;
    const tool = getTeacherTool(page.toolId);
    if (typeof tool?.onSurfaceAction === "function") {
      const result = tool.onSurfaceAction({
        action: String(action || ""),
        payload: payload || {},
        state,
        page,
        surface
      });
      if (result?.surface) surface = normalizeSurfaceState(result.surface);
      if (result?.state && typeof result.state === "object") state = result.state;
    }
    updatePage(page.id, { surface, state }, { renderPanel: false, sync: true });
  }

  function applyGlobalWidgetAction(widgetId, action, payload = {}){
    const safeWidgetId = String(widgetId || "").trim();
    const safeAction = String(action || "").trim();
    let pages = workspace.pages;

    // Masquer le widget Annotations doit rendre tous les calques inactifs sans
    // supprimer un seul trait. On évite ainsi qu'une page laissée en mode dessin
    // intercepte le stylet lorsque le widget est désactivé globalement.
    if (safeWidgetId === "annotations" && safeAction === "set-visible" && payload?.visible !== true) {
      pages = workspace.pages.map((page) => {
        const surface = normalizeSurfaceState(page.surface);
        if (surface.annotations?.enabled !== true) return page;
        return {
          ...page,
          surface: applySurfaceAction(surface, "annotations:set-enabled", { enabled:false })
        };
      });
    }

    workspace = normalizeWorkspace({
      ...workspace,
      pages,
      widgets: applyOverlayWidgetAction(workspace.widgets, safeWidgetId, safeAction, payload || {})
    });
    markDirty();
    syncProjector();
  }

  function closePicker(){ pickerOverlay?.remove?.(); pickerOverlay = null; }
  function openPicker(){
    if (pickerOverlay?.isConnected) return;
    const overlay = document.createElement("div");
    overlay.className = "modal tt-widget-picker-modal";
    overlay.innerHTML = `
      <div class="modal-content modal-content-wide tt-widget-picker-card" role="dialog" aria-modal="true" aria-labelledby="ttAppPickerTitle">
        <div class="tt-widget-picker-head">
          <div id="ttAppPickerTitle" class="modal-title">Ajouter une page</div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn" type="button" data-close-picker aria-label="Fermer"><span class="dashboard-material-icon">close</span></button>
        </div>
        <div class="tt-widget-picker-grid">
          <button class="tt-widget-picker-option" type="button" data-blank-page>
            <span class="dashboard-material-icon tt-widget-picker-icon" aria-hidden="true">crop_square</span>
            <span class="tt-widget-picker-copy"><strong>Page vierge</strong><small>Une surface libre, sans mini-application.</small></span>
          </button>
          ${tools.map((tool) => `
            <button class="tt-widget-picker-option" type="button" data-tool-id="${escapeAttr(tool.id)}">
              <span class="dashboard-material-icon tt-widget-picker-icon" aria-hidden="true">${escapeHtml(tool.icon)}</span>
              <span class="tt-widget-picker-copy"><strong>${escapeHtml(tool.label)}</strong><small>${escapeHtml(tool.description)}</small></span>
            </button>
          `).join("")}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    pickerOverlay = overlay;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay || event.target.closest("[data-close-picker]")) closePicker();
      const blankButton = event.target.closest("[data-blank-page]");
      if (blankButton) { closePicker(); addBlankPage(); return; }
      const button = event.target.closest("[data-tool-id]");
      if (button) { const id = button.dataset.toolId; closePicker(); addPage(id); }
    });
    overlay.addEventListener("keydown", (event) => { if (event.key === "Escape") closePicker(); });
  }

  function renderHeaderStatus(){
    const node = host?.querySelector("[data-projector-status]");
    if (!node) return;
    node.classList.toggle("is-connected", projectorConnected);
    node.innerHTML = `<span class="dashboard-material-icon" aria-hidden="true">${projectorConnected ? "cast_connected" : "cast"}</span><span>${projectorConnected ? "Projection connectée" : "Projection non connectée"}</span>`;
    const button = host?.querySelector("#btnTeacherToolsOpenProjector span:last-child");
    if (button) button.textContent = projectorConnected ? "Afficher la projection" : "Ouvrir la projection";
    const closeButton = host?.querySelector("#btnTeacherToolsCloseProjector");
    if (closeButton) closeButton.disabled = !projectorConnected && !(projectorWindow && !projectorWindow.closed);
    renderSaveStatus();
  }

  function pageListMarkup(){
    if (!workspace.pages.length) return `<div class="tt-page-list-empty-state"><span class="dashboard-material-icon" aria-hidden="true">dashboard_customize</span><strong>Aucune page</strong></div>`;
    return workspace.pages.map((page) => `
      <div class="tt-widget-row tt-page-row${page.id === workspace.selectedPageId ? " is-selected" : ""}" data-page-row="${escapeAttr(page.id)}">
        <button class="tt-widget-select tt-page-select" type="button" data-select-page="${escapeAttr(page.id)}">
          <span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(page.icon)}</span>
          <span class="tt-widget-row-main"><strong>${escapeHtml(page.label)}</strong><small>${page.id === workspace.selectedPageId ? "Affichée au tableau" : "Page ouverte"}</small></span>
        </button>
        <button class="tt-widget-row-icon-btn tt-page-close" type="button" data-close-page="${escapeAttr(page.id)}" aria-label="Fermer cette page" title="Fermer cette page"><span class="dashboard-material-icon" aria-hidden="true">close</span></button>
      </div>`).join("");
  }

  function bindPageList(){
    host?.querySelectorAll("[data-select-page]").forEach((button) => button.addEventListener("click", () => selectPage(button.dataset.selectPage)));
    host?.querySelectorAll("[data-close-page]").forEach((button) => button.addEventListener("click", () => removePage(button.dataset.closePage)));
  }

  function renderPageList(){
    const list = host?.querySelector("[data-page-list]");
    if (!list) return;
    list.innerHTML = pageListMarkup();
    bindPageList();
    const count = host?.querySelector("[data-page-count]");
    if (count) count.textContent = workspace.pages.length ? `${workspace.pages.length} page${workspace.pages.length > 1 ? "s" : ""} ouverte${workspace.pages.length > 1 ? "s" : ""}` : "Aucune page";
    const page = selectedPage();
    const titleIcon = host?.querySelector("[data-active-app-icon]");
    const titleLabel = host?.querySelector("[data-active-app-label]");
    if (titleIcon) titleIcon.textContent = page?.icon || "tune";
    if (titleLabel) titleLabel.textContent = page?.label || "Contrôles";
    const backgroundButton = host?.querySelector("[data-toggle-background]");
    const supportsBackground = pageSupports(page, "background");
    if (backgroundButton) {
      backgroundButton.disabled = !supportsBackground;
      backgroundButton.classList.toggle("is-active", supportsBackground && backgroundPanelOpen);
      backgroundButton.setAttribute("aria-expanded", supportsBackground && backgroundPanelOpen ? "true" : "false");
    }
  }

  function renderControls(){
    appControlSession?.destroy?.();
    appControlSession = null;
    const appHost = host?.querySelector("[data-app-control]");
    const page = selectedPage();
    const tool = page ? getTeacherTool(page.toolId) : null;
    if (!appHost) return;
    if (!page) {
      appHost.innerHTML = `<div class="dashboard-activity-empty-state">Ajoute une page pour commencer.</div>`;
      return;
    }
    if (!tool) {
      appHost.innerHTML = `<div class="dashboard-activity-empty-state"><strong>Page vierge</strong><span>Cette page utilise uniquement les fonctions communes du Tableau.</span></div>`;
      return;
    }
    appControlSession = tool.createControlPanel?.({
      host: appHost,
      getWidget: () => selectedPage(),
      updateWidget: (patch = {}, options = {}) => updatePage(page.id, patch, options),
      getStudents: () => getCurrentStudents?.() || [],
      getTeacherSpace: () => getCurrentTeacherSpace?.() || null,
      listCatalogActivitiesForTeacherSpace,
      listPedagogicalNodesForTeacher,
      listResourcesForSpace,
      uploadResourceForSpace,
      createResourceSignedUrl,
      showToast,
      openProjector,
      syncProjector
    }) || null;
  }

  function renderBackgroundPanel(){
    backgroundPanelSession?.destroy?.();
    backgroundPanelSession = null;
    const panel = host?.querySelector("[data-background-panel]");
    if (!panel) return;
    const page = selectedPage();
    const tool = page ? getTeacherTool(page.toolId) : null;
    const available = pageSupports(page, "background");
    if (!available || !backgroundPanelOpen) {
      panel.hidden = true;
      panel.innerHTML = "";
      renderPageList();
      return;
    }
    panel.hidden = false;
    backgroundPanelSession = createSurfaceBackgroundPanel({
      host: panel,
      getPageSurface: () => selectedPage()?.surface,
      getSharedBackground: () => workspace.sharedBackground,
      setBackgroundScope: (scope) => setBackgroundScope(page.id, scope),
      setPageBackground: (background, options = {}) => setPageBackground(page.id, background, options),
      setSharedBackground: (background, options = {}) => setSharedBackground(background, options),
      setSnapEnabled: (enabled) => setPageSnapEnabled(page.id, enabled),
      supportsSnap: tool?.surface?.snap === true,
      showToast,
      onClose(){ backgroundPanelOpen = false; renderBackgroundPanel(); }
    });
    renderPageList();
  }

  function toggleBackgroundPanel(){
    const page = selectedPage();
    const tool = page ? getTeacherTool(page.toolId) : null;
    if (!page || !pageSupports(page, "background")) return;
    backgroundPanelOpen = !backgroundPanelOpen;
    renderBackgroundPanel();
  }

  function renderView(){
    if (!host) return;
    workspace = normalizeWorkspace(workspace);
    const page = selectedPage();
    const supportsBackground = pageSupports(page, "background");
    host.innerHTML = `
      <div class="dashboard-config-header tt-header tt-app-header">
        <div class="dashboard-config-header-main tt-header-main"><div><div class="dashboard-section-title">Tableau</div><div class="tt-app-header-subtitle" data-page-count></div></div></div>
        <div class="dashboard-config-header-center tt-header-center"><div class="tt-projector-status" data-projector-status></div></div>
        <div class="dashboard-config-header-actions tt-header-actions">
          <button id="btnTeacherToolsOpenProjector" class="btn primary" type="button"><span class="dashboard-material-icon" aria-hidden="true">open_in_new</span><span>Ouvrir la projection</span></button>
          <button id="btnTeacherToolsSaveProjector" class="btn" type="button" disabled><span class="dashboard-material-icon" aria-hidden="true">save</span><span>Enregistrer la projection</span></button>
          <button id="btnTeacherToolsCloseProjector" class="btn" type="button" disabled><span class="dashboard-material-icon" aria-hidden="true">close</span><span>Fermer la projection</span></button>
        </div>
      </div>
      <div class="dashboard-content-scroll dashboard-explorer-host tt-view-scroll tt-app-view">
        <div class="dashboard-activities-explorer tt-board-explorer tt-app-explorer">
          <section class="dashboard-activity-tree-pane panel tt-board-pane tt-board-scene-pane tt-pages-pane" aria-label="Pages ouvertes">
            <div class="tt-pages-pane-head"><div><strong>Pages</strong><span>Une seule page est visible à la fois.</span></div><button id="ttOpenWidgetPicker" class="tt-add-widget-btn tt-add-app-btn" type="button"><span class="dashboard-material-icon" aria-hidden="true">add</span><span>Ajouter</span></button></div>
            <div class="tt-board-pane-scroll"><div class="tt-widget-list tt-widget-list-board tt-page-list" data-page-list>${pageListMarkup()}</div></div>
          </section>
          <div class="dashboard-activity-splitter" role="separator" aria-orientation="vertical"></div>
          <section class="dashboard-activity-tiles-pane panel tt-board-pane tt-board-control-pane tt-app-control-pane" aria-label="Contrôles">
            <div class="tt-board-pane-header tt-app-control-header">
              <div class="tt-board-pane-title"><span class="dashboard-material-icon" data-active-app-icon aria-hidden="true">${escapeHtml(page?.icon || "tune")}</span><span data-active-app-label>${escapeHtml(page?.label || "Contrôles")}</span></div>
              <div class="tt-board-header-right"><div class="tt-board-actions">
                <button class="tt-board-action-btn tt-background-panel-toggle${backgroundPanelOpen && supportsBackground ? " is-active" : ""}" type="button" data-toggle-background aria-expanded="${backgroundPanelOpen && supportsBackground ? "true" : "false"}" ${supportsBackground ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">wallpaper</span><span>Fond</span></button>
                <button class="tt-board-action-btn is-danger" type="button" data-close-active ${page ? "" : "disabled"}><span class="dashboard-material-icon" aria-hidden="true">close</span><span>Fermer la page</span></button>
              </div></div>
            </div>
            <main class="tt-tool-panel-host tt-board-pane-scroll">
              <section data-app-control></section>
            </main>
            <aside class="tt-surface-popover" data-background-panel hidden aria-label="Réglages du fond"></aside>
          </section>
        </div>
      </div>`;
    host.querySelector("#btnTeacherToolsOpenProjector")?.addEventListener("click", openProjector);
    host.querySelector("#btnTeacherToolsSaveProjector")?.addEventListener("click", () => { void saveWorkspace(); });
    host.querySelector("#btnTeacherToolsCloseProjector")?.addEventListener("click", () => { void requestCloseProjector(); });
    host.querySelector("#ttOpenWidgetPicker")?.addEventListener("click", openPicker);
    host.querySelector("[data-close-active]")?.addEventListener("click", () => { const current = selectedPage(); if (current) removePage(current.id); });
    host.querySelector("[data-toggle-background]")?.addEventListener("click", toggleBackgroundPanel);
    bindPageList();
    renderHeaderStatus();
    renderPageList();
    renderControls();
    renderBackgroundPanel();
  }

  return {
    async render(){
      await ensureWorkspaceLoaded();
      renderView();
      ensureChannel()?.send("dashboard-ready");
    },
    refresh(){ renderControls(); if (backgroundPanelOpen) renderBackgroundPanel(); syncProjector(); },
    destroy(){
      appControlSession?.destroy?.();
      backgroundPanelSession?.destroy?.();
      closePicker();
      closeCloseConfirmOverlay();
      window.removeEventListener("pagehide", handlePageHide);
      cancelSessionDraftSave();
      if (isDirty) void persistSessionDraftNow();
      channel?.close?.();
      channel = null;
      if (view) view.innerHTML = "";
    }
  };
}
