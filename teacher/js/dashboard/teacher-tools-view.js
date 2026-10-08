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
import {
  imageEntriesFromPasteEvent,
  prepareImageFilePayload,
  prepareImageUrlPayload,
  readImageEntriesFromClipboard
} from "../teacher-tools/apps/image/source.js";
import { MULTI_IMAGES_MAX_IMAGES } from "../teacher-tools/apps/multi-images/model.js";
import { IMAGE_LABELS_MAX_IMAGES } from "../teacher-tools/apps/image-labels/model.js";

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
    label: rawToolId === "labels" && String(raw.label || "").trim() === "Étiquettes" ? tool.label : String(raw.label || tool.label),
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
  listTeacherActivitiesForSpace,
  listTeacherActivityFoldersForSpace,
  listResourcesForSpace,
  listResourceFoldersForSpace,
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
  let projectorChromeVisible = true;
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
  let clipboardImportVersion = 0;
  let fileDropDepth = 0;

  const persistence = createWorkspacePersistence({
    uploadAsset: uploadTeacherTableauAsset,
    createAssetSignedUrl: createTeacherTableauAssetSignedUrl,
    cleanupAssets: cleanupTeacherTableauAssetsForSpace,
    listResourcesForSpace,
    createResourceSignedUrl
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
        if (message?.type === "projector-chrome-visibility") {
          projectorChromeVisible = message.visible !== false;
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

  function toggleProjectorChrome(){
    if (!projectorConnected) return;
    projectorChromeVisible = !projectorChromeVisible;
    renderHeaderStatus();
    send("set-projector-chrome-visibility", { visible: projectorChromeVisible });
  }

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
    if (tool.singleton === true) {
      const existing = workspace.pages.find((page) => page.toolId === tool.id);
      if (existing) {
        selectPage(existing.id);
        showToast?.(`La page « ${tool.label} » est déjà ouverte.`);
        return;
      }
    }
    // Une page est une instance indépendante sauf si la mini-app se déclare singleton.
    const page = createPage(tool);
    workspace = normalizeWorkspace({ ...workspace, selectedPageId: page.id, pages: [...workspace.pages, page] });
    markDirty();
    renderView();
    syncProjector();
  }

  function resolveClipboardTargetPage(toolId){
    const safeToolId = String(toolId || "").trim();
    if (!safeToolId) return { tool: null, page: null };
    const tool = getTeacherTool(safeToolId);
    if (!tool) return { tool: null, page: null };
    const page = selectedPage()?.toolId === safeToolId
      ? selectedPage()
      : [...workspace.pages].reverse().find((item) => item.toolId === safeToolId) || null;
    return { tool, page };
  }

  function commitClipboardPage({ page, existingPage, result, errorMessage } = {}){
    if (result?.error) throw new Error(result.error);
    if (!result?.patch?.state) throw new Error(errorMessage || "Impossible d’afficher les images collées.");
    const updatedPage = { ...page, ...result.patch };
    const pages = existingPage
      ? workspace.pages.map((item) => item.id === existingPage.id ? updatedPage : item)
      : [...workspace.pages, updatedPage];
    workspace = normalizeWorkspace({ ...workspace, pages, selectedPageId: updatedPage.id });
    markDirty();
    renderView();
    syncProjector();
  }

  async function preparePastedImagePayloads(entries, { version, limit = Number.POSITIVE_INFINITY } = {}){
    const rawEntries = Array.from(entries || []).filter(Boolean);
    const numericLimit = Number(limit);
    const safeLimit = Number.isFinite(numericLimit)
      ? Math.max(0, Math.trunc(numericLimit))
      : Number.POSITIVE_INFINITY;
    const payloads = [];

    for (let index = 0; index < Math.min(rawEntries.length, safeLimit); index += 1) {
      const entry = rawEntries[index];
      try {
        let payload;
        if (entry.file) {
          payload = await prepareImageFilePayload(entry.file);
        } else if (entry.source?.startsWith("data:image/")) {
          // Un <img src="data:…"> collé depuis un éditeur doit devenir une
          // image locale persistable, et non une URL base64 conservée en état.
          const response = await fetch(entry.source);
          if (!response.ok) throw new Error("Image intégrée illisible.");
          const blob = await response.blob();
          const type = String(blob.type || "image/png");
          const extension = type === "image/jpeg" ? "jpg" : (type.split("/")[1] || "png").split("+")[0];
          payload = await prepareImageFilePayload(new File([blob], `Image collée ${index + 1}.${extension}`, { type }));
        } else if (entry.source) {
          payload = await prepareImageUrlPayload(entry.source);
        } else {
          continue;
        }
        if (version !== clipboardImportVersion || !isTableauVisible()) return null;
        // Renommer les captures tout en conservant le nom des fichiers copiés.
        if (entry.source || !entry.file?.name || /^image collée/i.test(entry.file.name)) {
          payload.imageName = `Image collée ${index + 1}`;
        }
        payloads.push(payload);
      } catch (error) {
        if (version === clipboardImportVersion) {
          showToast?.(`Image ${index + 1} : ${error?.message || "impossible à charger"}`, { isError: true });
        }
      }
    }

    return {
      payloads,
      ignoredCount: Math.max(0, rawEntries.length - safeLimit)
    };
  }

  /**
   * Dans Multimages, un collage reste dans Multimages et ajoute les images.
   * Hors de Multimages : 1 image -> Image ; 2+ images -> Multimages.
   * On ne prétend pas pouvoir séparer un presse-papiers déjà aplati en bitmap.
   */
  async function importPastedImages(entries){
    const rawEntries = Array.from(entries || []).filter(Boolean);
    if (!rawEntries.length) return;
    const version = ++clipboardImportVersion;
    try {
      const activeImageLabels = selectedPage()?.toolId === "image-labels";
      if (activeImageLabels) {
        const { tool, page } = resolveClipboardTargetPage("image-labels");
        if (!tool || !page) throw new Error("L’application Étiquettes Images est indisponible.");
        const existingCount = page.state?.items?.length || 0;
        const limit = Math.max(0, IMAGE_LABELS_MAX_IMAGES - existingCount);
        if (!limit) throw new Error(`Limite : ${IMAGE_LABELS_MAX_IMAGES} images.`);
        const prepared = await preparePastedImagePayloads(rawEntries, { version, limit });
        if (!prepared || version !== clipboardImportVersion || !isTableauVisible()) return;
        if (!prepared.payloads.length) throw new Error("Impossible d’ajouter ces images.");
        const result = tool.applyAction?.({ action:"add-images", payload:{ images:prepared.payloads }, state:page.state });
        commitClipboardPage({
          page,
          existingPage:page,
          result,
          errorMessage:"Impossible d’ajouter ces images à Étiquettes Images."
        });
        if (prepared.ignoredCount > 0) showToast?.(`Certaines images n’ont pas été ajoutées : limite à ${IMAGE_LABELS_MAX_IMAGES}.`);
        return;
      }

      const activeMultiImages = selectedPage()?.toolId === "multi-images";
      const useMultiImages = activeMultiImages || rawEntries.length > 1;

      if (!useMultiImages) {
        const prepared = await preparePastedImagePayloads(rawEntries, { version, limit: 1 });
        if (!prepared || version !== clipboardImportVersion || !isTableauVisible()) return;
        const payload = prepared.payloads[0];
        if (!payload) throw new Error("Impossible de coller cette image.");
        payload.imageName = "Image collée";

        const { tool, page } = resolveClipboardTargetPage("image");
        if (!tool) throw new Error("L’application Image est indisponible.");
        const nextPage = page || createPage(tool);
        const result = tool.applyAction?.({ action: "set-image", payload, state: nextPage.state });
        commitClipboardPage({
          page: nextPage,
          existingPage: page,
          result,
          errorMessage: "Impossible d’afficher l’image collée."
        });
        return;
      }

      const { tool, page } = resolveClipboardTargetPage("multi-images");
      if (!tool) throw new Error("L’application Multimages est indisponible.");
      const nextPage = page || createPage(tool);
      // Dans une page Multimages déjà active, Ctrl + V est un ajout et ne
      // détruit pas les images précédentes. Hors de cette page, on remplace.
      const append = Boolean(activeMultiImages && page);
      const existingCount = append ? (nextPage.state?.images?.length || 0) : 0;
      const limit = Math.max(0, MULTI_IMAGES_MAX_IMAGES - existingCount);
      if (!limit) throw new Error(`Limite : ${MULTI_IMAGES_MAX_IMAGES} images.`);
      const prepared = await preparePastedImagePayloads(rawEntries, { version, limit });
      if (!prepared || version !== clipboardImportVersion || !isTableauVisible()) return;
      if (!prepared.payloads.length) throw new Error("Impossible de coller ces images.");
      if (prepared.ignoredCount > 0) {
        showToast?.(`Certaines images n’ont pas été collées : limite à ${MULTI_IMAGES_MAX_IMAGES}.`);
      }
      let result = tool.applyAction?.({
        action: append ? "add-images" : "set-images",
        payload: { images: prepared.payloads },
        state: nextPage.state
      });
      if (result?.patch?.state) {
        result = {
          ...result,
          patch: {
            ...result.patch,
            state: { ...result.patch.state, mode: "board", activeIndex: -1 }
          }
        };
      }
      commitClipboardPage({
        page: nextPage,
        existingPage: page,
        result,
        errorMessage: "Impossible d’afficher les images collées."
      });
    } catch (error) {
      if (version === clipboardImportVersion) {
        showToast?.(error?.message || "Impossible de coller ces images.", { isError: true });
      }
    }
  }

  async function pasteImageFromClipboard(){
    try {
      const entries = await readImageEntriesFromClipboard();
      await importPastedImages(entries);
    } catch (error) {
      showToast?.(error?.message || "Impossible de lire le presse-papiers.", { isError: true });
    }
  }

  function isTableauVisible(){
    return Boolean(view?.isConnected && host?.isConnected && !view.hidden && !view.classList.contains("hidden"));
  }

  function handleImagePaste(event){
    if (!isTableauVisible() || event.defaultPrevented || pickerOverlay?.isConnected || closeConfirmOverlay?.isConnected) return;
    const target = event.target;
    // Ne jamais voler le collage destiné à un champ ou à un éditeur (Seyès, URL…).
    if (target?.closest?.('input, textarea, select, [contenteditable], [role="textbox"], dialog, .modal')) return;
    const entries = imageEntriesFromPasteEvent(event);
    if (!entries.length) return; // Collage de texte ordinaire : ne rien modifier.
    event.preventDefault();
    void importPastedImages(entries);
  }

  document.addEventListener("paste", handleImagePaste);

  function isLikelyImageFile(file){
    const type = String(file?.type || "").toLowerCase();
    if (type.startsWith("image/")) return true;
    return /\.(png|jpe?g|webp|gif|bmp|svg|avif|ico)$/i.test(String(file?.name || ""));
  }

  function dragEventCarriesFiles(event){
    const types = Array.from(event?.dataTransfer?.types || []).map((type) => String(type || ""));
    return types.includes("Files") || types.includes("application/x-moz-file");
  }

  function getDroppedImageEntries(event){
    const files = Array.from(event?.dataTransfer?.files || []).filter((file) => isLikelyImageFile(file));
    return files.map((file) => ({ file }));
  }

  function getFileDropMessage(){
    const toolId = selectedPage()?.toolId || "";
    if (toolId === "image-labels") {
      return "Dépose jusqu’à 100 images ici pour les ajouter à Étiquettes Images.";
    }
    if (toolId === "multi-images") {
      return "Dépose les images ici pour les ajouter à Multimages.";
    }
    return "Dépose 1 image pour l’app Image, ou plusieurs images pour ouvrir Multimages.";
  }

  function setFileDropActive(active){
    if (!host) return;
    host.classList.toggle("is-file-drop-active", Boolean(active));
    const overlay = host.querySelector("[data-file-drop-overlay]");
    if (!overlay) return;
    overlay.hidden = !active;
    const message = overlay.querySelector("[data-file-drop-message]");
    if (message) message.textContent = getFileDropMessage();
  }

  function clearFileDropState(){
    fileDropDepth = 0;
    setFileDropActive(false);
  }

  function handleHostDragEnter(event){
    if (!isTableauVisible() || pickerOverlay?.isConnected || closeConfirmOverlay?.isConnected) return;
    if (!dragEventCarriesFiles(event)) return;
    fileDropDepth += 1;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    setFileDropActive(true);
  }

  function handleHostDragOver(event){
    if (!isTableauVisible() || !dragEventCarriesFiles(event)) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    if (!host?.classList.contains("is-file-drop-active")) setFileDropActive(true);
  }

  function handleHostDragLeave(event){
    if (!dragEventCarriesFiles(event)) return;
    fileDropDepth = Math.max(0, fileDropDepth - 1);
    if (fileDropDepth === 0) setFileDropActive(false);
  }

  function handleHostDrop(event){
    if (!isTableauVisible() || !dragEventCarriesFiles(event)) return;
    event.preventDefault();
    const entries = getDroppedImageEntries(event);
    clearFileDropState();
    if (!entries.length) {
      showToast?.("Dépose un ou plusieurs fichiers image.", { isError: true });
      return;
    }
    void importPastedImages(entries);
  }

  host?.addEventListener("dragenter", handleHostDragEnter);
  host?.addEventListener("dragover", handleHostDragOver);
  host?.addEventListener("dragleave", handleHostDragLeave);
  host?.addEventListener("drop", handleHostDrop);

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
    const chromeButton = host?.querySelector("#btnTeacherToolsProjectorChrome");
    if (chromeButton) {
      chromeButton.disabled = !projectorConnected;
      chromeButton.setAttribute("aria-pressed", projectorChromeVisible ? "false" : "true");
      const label = projectorChromeVisible ? "Masquer les commandes de la projection" : "Afficher les commandes de la projection";
      chromeButton.setAttribute("aria-label", label);
      chromeButton.setAttribute("title", label);
      const icon = chromeButton.querySelector(".dashboard-material-icon");
      if (icon) icon.textContent = projectorChromeVisible ? "visibility" : "visibility_off";
    }
    const closeButton = host?.querySelector("#btnTeacherToolsCloseProjector");
    if (closeButton) closeButton.disabled = !projectorConnected && !(projectorWindow && !projectorWindow.closed);
    renderSaveStatus();
  }

  function pageListMarkup(){
    if (!workspace.pages.length) return `<div class="tt-page-list-empty-state"><span class="dashboard-material-icon" aria-hidden="true">dashboard_customize</span><strong>Aucune page</strong></div>`;
    return workspace.pages.map((page) => `
      <div class="tt-widget-row tt-page-row${page.id === workspace.selectedPageId ? " is-selected" : ""}" data-page-row="${escapeAttr(page.id)}" draggable="true">
        <button class="tt-widget-select tt-page-select" type="button" data-select-page="${escapeAttr(page.id)}">
          <span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(page.icon)}</span>
          <span class="tt-widget-row-main"><strong>${escapeHtml(page.label)}</strong><small>${page.id === workspace.selectedPageId ? "Affichée au tableau" : "Page ouverte"}</small></span>
        </button>
        <button class="tt-widget-row-icon-btn tt-page-close" type="button" data-close-page="${escapeAttr(page.id)}" aria-label="Fermer cette page" title="Fermer cette page"><span class="dashboard-material-icon" aria-hidden="true">close</span></button>
      </div>`).join("");
  }

  function reorderPage(pageId, insertionIndex){
    const id = String(pageId || "").trim();
    const fromIndex = workspace.pages.findIndex((page) => page.id === id);
    if (fromIndex < 0) return;
    const moved = workspace.pages[fromIndex];
    const remaining = workspace.pages.filter((page) => page.id !== id);
    const target = Math.max(0, Math.min(remaining.length, Math.trunc(Number(insertionIndex) || 0)));
    const pages = remaining.slice();
    pages.splice(target, 0, moved);
    if (pages.every((page, index) => page.id === workspace.pages[index]?.id)) return;
    workspace = normalizeWorkspace({ ...workspace, pages, selectedPageId:workspace.selectedPageId });
    markDirty();
    renderPageList();
    syncProjector();
  }

  function bindPageListDnD(){
    const list = host?.querySelector("[data-page-list]");
    if (!list || workspace.pages.length < 2) return;
    const rows = () => Array.from(list.querySelectorAll("[data-page-row]"));
    const marker = document.createElement("div");
    marker.className = "tt-page-drop-marker";
    marker.hidden = true;
    marker.setAttribute("aria-hidden", "true");
    list.appendChild(marker);
    let draggedId = "";
    let insertionIndex = -1;

    function clear(){
      rows().forEach((row) => row.classList.remove("is-dragging"));
      marker.hidden = true;
      insertionIndex = -1;
    }

    function computeCandidate(clientY){
      const remainingRows = rows().filter((row) => String(row.dataset.pageRow || "") !== draggedId);
      if (!remainingRows.length) return { index:0, y:0 };
      const listRect = list.getBoundingClientRect();
      const candidates = remainingRows.map((row, index) => {
        const rect = row.getBoundingClientRect();
        return { index, screenY:rect.top, y:rect.top - listRect.top + list.scrollTop };
      });
      const lastRect = remainingRows[remainingRows.length - 1].getBoundingClientRect();
      candidates.push({ index:remainingRows.length, screenY:lastRect.bottom, y:lastRect.bottom - listRect.top + list.scrollTop });
      return candidates.reduce((best, candidate) => {
        const distance = Math.abs(clientY - candidate.screenY);
        return !best || distance < best.distance ? { ...candidate, distance } : best;
      }, null);
    }

    rows().forEach((row) => {
      row.addEventListener("dragstart", (event) => {
        draggedId = String(row.dataset.pageRow || "").trim();
        if (!draggedId) return;
        row.classList.add("is-dragging");
        if (event.dataTransfer) {
          event.dataTransfer.effectAllowed = "move";
          try { event.dataTransfer.setData("text/plain", draggedId); } catch {}
        }
      });
      row.addEventListener("dragend", () => { draggedId = ""; clear(); });
    });

    list.addEventListener("dragover", (event) => {
      if (!draggedId) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
      const candidate = computeCandidate(event.clientY);
      if (!candidate) return;
      insertionIndex = candidate.index;
      marker.style.top = `${Math.round(candidate.y)}px`;
      marker.hidden = false;
    });
    list.addEventListener("dragleave", (event) => {
      if (!list.contains(event.relatedTarget)) marker.hidden = true;
    });
    list.addEventListener("drop", (event) => {
      if (!draggedId) return;
      event.preventDefault();
      const id = draggedId;
      const target = insertionIndex;
      draggedId = "";
      clear();
      if (target >= 0) reorderPage(id, target);
    });
  }

  function bindPageList(){
    host?.querySelectorAll("[data-select-page]").forEach((button) => button.addEventListener("click", () => selectPage(button.dataset.selectPage)));
    host?.querySelectorAll("[data-close-page]").forEach((button) => button.addEventListener("click", () => removePage(button.dataset.closePage)));
    bindPageListDnD();
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
      listTeacherActivitiesForSpace,
      listTeacherActivityFoldersForSpace,
      listResourcesForSpace,
      listResourceFoldersForSpace,
      uploadResourceForSpace,
      createResourceSignedUrl,
      showToast,
      openProjector,
      syncProjector,
      pasteImageFromClipboard
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
    const fileDropActive = host.classList.contains("is-file-drop-active");
    host.innerHTML = `
      <div class="dashboard-config-header tt-header tt-app-header">
        <div class="dashboard-config-header-main tt-header-main"><div><div class="dashboard-section-title">Tableau</div><div class="tt-app-header-subtitle" data-page-count></div></div></div>
        <div class="dashboard-config-header-center tt-header-center"><div class="tt-projector-status" data-projector-status></div></div>
        <div class="dashboard-config-header-actions tt-header-actions">
          <button id="btnTeacherToolsProjectorChrome" class="btn btn-icon" type="button" aria-pressed="false" aria-label="Masquer les commandes de la projection" title="Masquer les commandes de la projection" disabled><span class="dashboard-material-icon" aria-hidden="true">visibility</span></button>
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
      </div>
      <div class="tt-file-drop-overlay" data-file-drop-overlay ${fileDropActive ? "" : "hidden"}>
        <div class="tt-file-drop-card">
          <span class="dashboard-material-icon" aria-hidden="true">add_photo_alternate</span>
          <strong>Dépose les images ici</strong>
          <span data-file-drop-message>${escapeHtml(getFileDropMessage())}</span>
        </div>
      </div>`;
    host.querySelector("#btnTeacherToolsProjectorChrome")?.addEventListener("click", toggleProjectorChrome);
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
      clipboardImportVersion += 1;
      document.removeEventListener("paste", handleImagePaste);
      host?.removeEventListener("dragenter", handleHostDragEnter);
      host?.removeEventListener("dragover", handleHostDragOver);
      host?.removeEventListener("dragleave", handleHostDragLeave);
      host?.removeEventListener("drop", handleHostDrop);
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
