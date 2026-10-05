import { createTeacherToolsChannel } from "./channel.js";
import { startMaterialIconHydration } from "../../../shared/material-icons-svg.js";
import { getTeacherTool, listTeacherTools } from "./registry.js";
import { applySurfaceAction, normalizeSurfaceState, resolveSurfaceBackground } from "./surface/state.js";
import { createSurfaceBackgroundProjector } from "./surface/background-projector.js";
import { createAnnotationProjector } from "./surface/annotation-projector.js";
import { applyOverlayWidgetAction, getTimerRemainingMs, normalizeOverlayWidgetsState } from "./overlay-widgets/state.js";
import { createTimerOverlayProjector } from "./overlay-widgets/timer/projector.js";

startMaterialIconHydration();

const params = new URLSearchParams(location.search);
const teacherSpaceId = String(params.get("space") || "").trim();
const channelId = String(params.get("channel") || "").trim();

const stage = document.getElementById("teacherToolsProjectorStage");
const appHost = document.getElementById("teacherToolsAppHost");
const widgetLayer = document.getElementById("teacherToolsWidgetLayer");
const starfieldHost = document.getElementById("teacherToolsProjectorStarfield");
const launchOverlay = document.getElementById("teacherToolsLaunchOverlay");
const btnLaunch = document.getElementById("btnTeacherToolsLaunch");
const btnChromeToggle = document.getElementById("btnTeacherToolsChromeToggle");
const btnPageMenu = document.getElementById("btnTeacherToolsPageMenu");
const btnWidgets = document.getElementById("btnTeacherToolsWidgets");
const btnAnnotations = document.getElementById("btnTeacherToolsAnnotations");
const widgetsDrawer = document.getElementById("teacherToolsWidgetsDrawer");
const widgetsList = document.getElementById("teacherToolsWidgetsList");
const btnWidgetsClose = document.getElementById("btnTeacherToolsWidgetsClose");
const pageDrawer = document.getElementById("teacherToolsPageDrawer");
const btnPageDrawerClose = document.getElementById("btnTeacherToolsPageDrawerClose");
const pageList = document.getElementById("teacherToolsPageList");
const btnPageAdd = document.getElementById("btnTeacherToolsPageAdd");
const btnPageFullscreen = document.getElementById("btnTeacherToolsPageFullscreen");
const btnPageClose = document.getElementById("btnTeacherToolsPageClose");
const appCatalog = document.getElementById("teacherToolsAppCatalog");
const appCatalogGrid = document.getElementById("teacherToolsAppCatalogGrid");
const btnAppCatalogClose = document.getElementById("btnTeacherToolsAppCatalogClose");
const btnAppControls = document.getElementById("btnTeacherToolsAppControls");
const appControls = document.getElementById("teacherToolsAppControls");
const appControlsTitle = document.getElementById("teacherToolsAppControlsTitle");
const appControlsContent = document.getElementById("teacherToolsAppControlsContent");
const quickActionsHost = document.getElementById("teacherToolsQuickActions");
const btnAppControlsClose = document.getElementById("btnTeacherToolsAppControlsClose");
const annotationLayer = document.getElementById("teacherToolsAnnotationLayer");
const annotationToolbar = document.getElementById("teacherToolsAnnotationToolbar");

let workspace = { version: 5, selectedPageId: "", sharedBackground: {}, widgets: normalizeOverlayWidgetsState(), pages: [] };
let channel = null;
let appControlsOpen = false;
let pageDrawerOpen = false;
let widgetsDrawerOpen = false;
let appCatalogOpen = false;
let projectionChromeVisible = true;
let workspaceBootstrapped = false;

function escapeHtml(value){
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function clonePlain(value){
  try { if (typeof structuredClone === "function") return structuredClone(value); } catch {}
  return JSON.parse(JSON.stringify(value ?? null));
}

const noteLauncherStorageKey = `ttp-note-launcher:${teacherSpaceId || "default"}`;

function loadNoteLauncherPosition(){
  try {
    const raw = JSON.parse(localStorage.getItem(noteLauncherStorageKey) || "null");
    const x = Number(raw?.x);
    const y = Number(raw?.y);
    if (Number.isFinite(x) && Number.isFinite(y)) return { x, y };
  } catch {}
  return { x: 0.04, y: 0.08 };
}

function saveNoteLauncherPosition(position){
  try { localStorage.setItem(noteLauncherStorageKey, JSON.stringify(position || {})); } catch {}
}

function normalizeWorkspace(raw = {}){
  const pages = (Array.isArray(raw.pages) ? raw.pages : [])
    .map((page) => {
      const rawToolId = String(page?.toolId || "").trim();
      if (!rawToolId) {
        return {
          id: String(page?.id || ""),
          toolId: "",
          label: String(page?.label || "Page vierge"),
          icon: String(page?.icon || "crop_square"),
          state: {},
          surface: normalizeSurfaceState(page?.surface)
        };
      }
      const tool = getTeacherTool(rawToolId);
      if (!tool) return null;
      return {
        id: String(page.id || ""),
        toolId: tool.id,
        label: String(page.label || tool.label),
        icon: String(page.icon || tool.icon || "widgets"),
        state: page.state && typeof page.state === "object" ? page.state : {},
        surface: normalizeSurfaceState(page.surface)
      };
    })
    .filter((page) => page?.id);
  const requested = String(raw.selectedPageId || "");
  return {
    version: 5,
    selectedPageId: pages.some((page) => page.id === requested) ? requested : (pages[0]?.id || ""),
    sharedBackground: raw.sharedBackground && typeof raw.sharedBackground === "object" ? raw.sharedBackground : {},
    widgets: normalizeOverlayWidgetsState(raw.widgets),
    pages
  };
}

function activePage(){ return workspace.pages.find((page) => page.id === workspace.selectedPageId) || null; }
function send(type, payload = {}){ channel?.send(type, payload); }

const backgroundProjector = createSurfaceBackgroundProjector({ stage, starfieldHost });
const annotationProjector = createAnnotationProjector({
  stage,
  layer: annotationLayer,
  toolbar: annotationToolbar,
  launcherPosition: loadNoteLauncherPosition(),
  onLauncherPositionChange(position){ saveNoteLauncherPosition(position); },
  onAction(action, payload = {}){
    const page = activePage();
    if (!page) return;
    page.surface = applySurfaceAction(page.surface, action, payload);
    annotationProjector.render(page.surface.annotations);
    send("surface-action", { pageId: page.id, action, payload });
  }
});

const timerOverlayProjector = createTimerOverlayProjector({
  stage,
  host: widgetLayer,
  getTimerState: () => workspace.widgets?.timer,
  onAction(action, payload = {}){ applyLocalWidgetAction("timer", action, payload); }
});

function setWidgetsDrawerOpen(open){
  widgetsDrawerOpen = open === true;
  if (widgetsDrawer) widgetsDrawer.hidden = !widgetsDrawerOpen;
  btnWidgets?.setAttribute("aria-expanded", widgetsDrawerOpen ? "true" : "false");
  if (widgetsDrawerOpen) renderWidgetsMenu();
}

function disableAnnotationDrawingLocally(){
  workspace = {
    ...workspace,
    pages: workspace.pages.map((page) => {
      const surface = normalizeSurfaceState(page.surface);
      return surface.annotations?.enabled === true
        ? { ...page, surface: applySurfaceAction(surface, "annotations:set-enabled", { enabled:false }) }
        : page;
    })
  };
}

function applyLocalWidgetAction(widgetId, action, payload = {}){
  const id = String(widgetId || "").trim();
  const safeAction = String(action || "").trim();
  if (id === "annotations" && safeAction === "set-visible" && payload?.visible !== true) {
    disableAnnotationDrawingLocally();
  }
  workspace = {
    ...workspace,
    widgets: applyOverlayWidgetAction(workspace.widgets, id, safeAction, payload || {})
  };
  renderWidgets();
  if (id === "annotations") renderSurface();
  send("widget-action", { widgetId:id, action:safeAction, payload:payload || {} });
}

function renderWidgetsMenu(){
  if (!widgetsList) return;
  const widgets = normalizeOverlayWidgetsState(workspace.widgets);
  const timerRemaining = Math.max(0, Math.ceil(getTimerRemainingMs(widgets.timer) / 1000));
  const timerStatus = widgets.timer.running
    ? `En cours · ${String(Math.floor(timerRemaining / 60)).padStart(2,"0")}:${String(timerRemaining % 60).padStart(2,"0")}`
    : "Compte à rebours déplaçable";
  widgetsList.innerHTML = `
    <button class="ttp-widget-menu-row${widgets.timer.visible ? " is-active" : ""}" type="button" data-widget-menu="timer" aria-pressed="${widgets.timer.visible ? "true" : "false"}">
      <span class="ttp-widget-menu-icon"><span class="ttp-material-icon" aria-hidden="true">timer</span></span>
      <span class="ttp-widget-menu-copy"><strong>Minuteur</strong><small>${escapeHtml(timerStatus)}</small></span>
      <span class="ttp-widget-menu-switch" aria-hidden="true"></span>
    </button>`;
  widgetsList.querySelector('[data-widget-menu="timer"]')?.addEventListener("click", () => {
    applyLocalWidgetAction("timer", "set-visible", { visible: !normalizeOverlayWidgetsState(workspace.widgets).timer.visible });
  });
}

function renderWidgets(){
  renderWidgetsMenu();
  const annotationsVisible = normalizeOverlayWidgetsState(workspace.widgets).annotations.visible === true;
  btnAnnotations?.setAttribute("aria-pressed", annotationsVisible ? "true" : "false");
  btnAnnotations?.setAttribute("aria-label", annotationsVisible ? "Masquer les annotations" : "Afficher les annotations");
  btnAnnotations?.setAttribute("title", annotationsVisible ? "Masquer les annotations" : "Annotations");
  timerOverlayProjector.render();
}

function setPageDrawerOpen(open){
  pageDrawerOpen = open === true;
  if (pageDrawer) pageDrawer.hidden = !pageDrawerOpen;
  btnPageMenu?.setAttribute("aria-expanded", pageDrawerOpen ? "true" : "false");
}


function setAppCatalogOpen(open){
  appCatalogOpen = open === true;
  if (appCatalog) appCatalog.hidden = !appCatalogOpen;
  if (!appCatalogOpen) return;
  setPageDrawerOpen(false);
  setWidgetsDrawerOpen(false);
  setAppControlsOpen(false);
  renderAppCatalog();
}

function renderAppCatalog(){
  if (!appCatalogGrid) return;
  const tools = listTeacherTools();
  appCatalogGrid.innerHTML = `
    <button class="ttp-catalog-tile" type="button" data-catalog-blank>
      <span class="ttp-material-icon" aria-hidden="true">crop_square</span>
      <strong>Page vierge</strong>
      <small>Surface libre</small>
    </button>
    ${tools.map((tool) => `
      <button class="ttp-catalog-tile" type="button" data-catalog-tool="${escapeHtml(tool.id)}">
        <span class="ttp-material-icon" aria-hidden="true">${escapeHtml(tool.icon || "widgets")}</span>
        <strong>${escapeHtml(tool.label)}</strong>
        <small>${escapeHtml(tool.description || "Mini-application")}</small>
      </button>`).join("")}
  `;
  appCatalogGrid.querySelector("[data-catalog-blank]")?.addEventListener("click", () => {
    send("add-page", { blank: true });
    setAppCatalogOpen(false);
  });
  appCatalogGrid.querySelectorAll("[data-catalog-tool]").forEach((button) => button.addEventListener("click", () => {
    send("add-page", { toolId: String(button.dataset.catalogTool || "") });
    setAppCatalogOpen(false);
  }));
}
function setAppControlsOpen(open){
  appControlsOpen = open === true;
  if (appControls) appControls.hidden = !appControlsOpen;
  btnAppControls?.setAttribute("aria-expanded", appControlsOpen ? "true" : "false");
}

function setProjectionChromeVisible(visible){
  projectionChromeVisible = visible !== false;
  stage?.classList.toggle("is-chrome-hidden", !projectionChromeVisible);

  if (!projectionChromeVisible) {
    setPageDrawerOpen(false);
    setWidgetsDrawerOpen(false);
    setAppControlsOpen(false);
    setAppCatalogOpen(false);

    // Un calque Notes actif intercepterait encore le stylet alors que son
    // bouton est caché. On le désactive sans effacer les annotations.
    const page = activePage();
    if (page?.surface?.annotations?.enabled === true) {
      page.surface = applySurfaceAction(page.surface, "annotations:set-enabled", { enabled:false });
      annotationProjector.render(page.surface.annotations);
      send("surface-action", { pageId:page.id, action:"annotations:set-enabled", payload:{ enabled:false } });
    }
  }

  if (btnChromeToggle) {
    btnChromeToggle.setAttribute("aria-pressed", projectionChromeVisible ? "false" : "true");
    const label = projectionChromeVisible ? "Masquer les commandes" : "Afficher les commandes";
    btnChromeToggle.setAttribute("aria-label", label);
    btnChromeToggle.setAttribute("title", label);
    const icon = btnChromeToggle.querySelector(".ttp-material-icon");
    if (icon) icon.textContent = projectionChromeVisible ? "visibility" : "visibility_off";
  }
}

async function toggleFullscreen(){
  try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    else await document.exitFullscreen();
  } catch {}
}

function renderNavigation(){
  const page = activePage();
  if (pageList) {
    pageList.innerHTML = workspace.pages.length
      ? workspace.pages.map((item) => `
        <div class="ttp-page-entry${item.id === page?.id ? " is-active" : ""}">
          <button class="ttp-page-item" type="button" data-page-id="${escapeHtml(item.id)}" aria-current="${item.id === page?.id ? "page" : "false"}">
            <span class="ttp-material-icon" aria-hidden="true">${escapeHtml(item.icon)}</span><span>${escapeHtml(item.label)}</span>
          </button>
          <button class="ttp-page-item-close" type="button" data-page-close="${escapeHtml(item.id)}" aria-label="Supprimer ${escapeHtml(item.label)}" title="Supprimer cette page"><span class="ttp-material-icon" aria-hidden="true">close</span></button>
        </div>`).join("")
      : `<div class="ttp-page-list-empty">Aucune page</div>`;
    pageList.querySelectorAll("[data-page-id]").forEach((button) => button.addEventListener("click", () => {
      const id = String(button.dataset.pageId || "");
      if (!workspace.pages.some((item) => item.id === id)) return;
      workspace = { ...workspace, selectedPageId: id };
      setPageDrawerOpen(false);
      setAppControlsOpen(false);
      render();
      send("select-page", { pageId: id });
    }));
    pageList.querySelectorAll("[data-page-close]").forEach((button) => button.addEventListener("click", (event) => {
      event.stopPropagation();
      const id = String(button.dataset.pageClose || "");
      if (!workspace.pages.some((item) => item.id === id)) return;
      send("close-page", { pageId: id });
    }));
  }
  const tool = page ? getTeacherTool(page.toolId) : null;
  btnAppControls.disabled = !tool;
  if (appControlsTitle) appControlsTitle.textContent = tool ? page.label : "Application";
}

function renderActiveApp(){
  const page = activePage();
  if (!appHost) return;
  if (quickActionsHost) {
    quickActionsHost.innerHTML = "";
    quickActionsHost.hidden = true;
  }
  if (!page) {
    appHost.innerHTML = `<div class="ttp-empty-workspace"><span class="ttp-material-icon" aria-hidden="true">dashboard_customize</span><strong>Aucune page</strong></div>`;
    if (appControlsContent) appControlsContent.innerHTML = "";
    return;
  }
  const tool = getTeacherTool(page.toolId);
  if (!tool) {
    appHost.innerHTML = "";
    if (appControlsContent) appControlsContent.innerHTML = "";
    return;
  }
  const sendAction = (action, payload = {}) => {
    send("app-action", { pageId: page.id, action, payload });
  };
  tool.renderProjector?.({
    host: appHost,
    chromeHost: appControlsContent,
    state: page.state,
    page,
    sendAction
  });
  if (quickActionsHost && typeof tool.renderQuickActions === "function") {
    tool.renderQuickActions({ host: quickActionsHost, state: page.state, page, sendAction });
    quickActionsHost.hidden = !quickActionsHost.children.length && !quickActionsHost.textContent.trim();
  }
}

function renderSurface(){
  const page = activePage();
  const surface = normalizeSurfaceState(page?.surface);
  const annotationsVisible = normalizeOverlayWidgetsState(workspace.widgets).annotations.visible === true;
  backgroundProjector.render(resolveSurfaceBackground(surface, workspace.sharedBackground));
  if (annotationToolbar) annotationToolbar.hidden = !page || !annotationsVisible;
  annotationProjector.render({
    ...surface.annotations,
    enabled: Boolean(page && annotationsVisible && surface.annotations?.enabled === true)
  });
}

function render(){
  renderNavigation();
  renderSurface();
  renderActiveApp();
  renderWidgets();
}

function handleWorkspaceState(next){
  const incoming = normalizeWorkspace(clonePlain(next));

  // Les widgets flottants sont globaux au Tableau et pilotés depuis la popup.
  // Le premier workspace reçu sert à les initialiser. Ensuite, un rerendu d'une
  // mini-app (zoom PDF/Image, changement de page, etc.) ne doit jamais pouvoir
  // réinjecter un snapshot global plus ancien et masquer les widgets.
  if (workspaceBootstrapped) {
    incoming.widgets = normalizeOverlayWidgetsState(workspace.widgets);
  } else {
    workspaceBootstrapped = true;
  }

  workspace = incoming;
  const page = activePage();
  if (!page || !getTeacherTool(page.toolId)) setAppControlsOpen(false);
  render();
}

channel = createTeacherToolsChannel({
  teacherSpaceId,
  channelId,
  onMessage(message){
    if (message?.type === "dashboard-ready") {
      if (workspaceBootstrapped) send("projector-workspace", { workspace: clonePlain(workspace), bootstrapped:true });
      send("projector-ready");
      send("request-workspace");
      return;
    }
    if (message?.type === "workspace-state") { handleWorkspaceState(message.workspace); return; }
    if (message?.type === "close-projector") window.close();
  }
});

btnLaunch?.addEventListener("click", async () => {
  await toggleFullscreen();
  if (launchOverlay) launchOverlay.hidden = true;
});
btnChromeToggle?.addEventListener("click", () => setProjectionChromeVisible(!projectionChromeVisible));
btnPageMenu?.addEventListener("click", () => { setPageDrawerOpen(!pageDrawerOpen); setWidgetsDrawerOpen(false); setAppControlsOpen(false); });
btnWidgets?.addEventListener("click", () => { setWidgetsDrawerOpen(!widgetsDrawerOpen); setPageDrawerOpen(false); setAppControlsOpen(false); });
btnAnnotations?.addEventListener("click", () => {
  const visible = normalizeOverlayWidgetsState(workspace.widgets).annotations.visible === true;
  if (visible) {
    applyLocalWidgetAction("annotations", "set-visible", { visible: false });
    return;
  }

  applyLocalWidgetAction("annotations", "set-visible", { visible: true });
  const page = activePage();
  if (!page) return;
  const surface = normalizeSurfaceState(page.surface);
  if (surface.annotations?.enabled === true) return;
  page.surface = applySurfaceAction(surface, "annotations:set-enabled", { enabled: true });
  annotationProjector.render(page.surface.annotations);
  send("surface-action", { pageId: page.id, action: "annotations:set-enabled", payload: { enabled: true } });
});
btnWidgetsClose?.addEventListener("click", () => setWidgetsDrawerOpen(false));
btnPageDrawerClose?.addEventListener("click", () => setPageDrawerOpen(false));
btnPageAdd?.addEventListener("click", () => setAppCatalogOpen(true));
btnAppCatalogClose?.addEventListener("click", () => setAppCatalogOpen(false));
appCatalog?.addEventListener("click", (event) => { if (event.target === appCatalog) setAppCatalogOpen(false); });
btnPageFullscreen?.addEventListener("click", toggleFullscreen);
btnPageClose?.addEventListener("click", () => window.close());
btnAppControls?.addEventListener("click", () => { setAppControlsOpen(!appControlsOpen); setPageDrawerOpen(false); setWidgetsDrawerOpen(false); });
btnAppControlsClose?.addEventListener("click", () => setAppControlsOpen(false));

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (appCatalogOpen) { setAppCatalogOpen(false); event.preventDefault(); return; }
    if (pageDrawerOpen) { setPageDrawerOpen(false); event.preventDefault(); return; }
    if (widgetsDrawerOpen) { setWidgetsDrawerOpen(false); event.preventDefault(); return; }
    if (appControlsOpen) { setAppControlsOpen(false); event.preventDefault(); }
  }
});
window.addEventListener("beforeunload", () => { timerOverlayProjector.destroy(); send("projector-closed"); });

if (!channel) {
  appHost.innerHTML = `<div class="ttp-empty-workspace is-error"><strong>Projection indisponible</strong><span>Le canal de communication n’a pas pu être ouvert.</span></div>`;
} else {
  send("projector-ready");
  send("request-workspace");
}

setProjectionChromeVisible(true);
render();
