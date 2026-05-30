import { createTeacherToolsChannel } from "./channel.js";
import { getTeacherTool } from "./registry.js";
import {
  TEACHER_TOOL_MOVE_MODE_BODY,
  TEACHER_TOOL_MOVE_MODE_CHROME,
  TEACHER_TOOL_MOVE_MODE_NONE,
  TEACHER_TOOL_VIEW_MODE_COLLAPSED,
  TEACHER_TOOL_VIEW_MODE_NORMAL,
  TEACHER_TOOL_VIEW_MODE_STAGE,
  getTeacherToolLayoutAspectRatio,
  getTeacherToolMinLayout,
  normalizeTeacherToolInteraction,
  normalizeTeacherToolViewMode
} from "./core/tool-contract.js";
import {
  mountStudentStarDrift,
  renderStudentStars
} from "../../../student/student-stars.js";

const params = new URLSearchParams(window.location.search);
const teacherSpaceId = String(params.get("space") || "").trim();
const channelId = String(params.get("channel") || "").trim();

const viewport = document.getElementById("teacherToolsProjectorViewport");
const fitHost = document.getElementById("teacherToolsProjectorFitHost");
const stage = document.getElementById("teacherToolsProjectorStage");
const starfieldHost = document.getElementById("teacherToolsProjectorStarfield");
const widgetHost = document.getElementById("teacherToolsWidgetHost");
const topbar = document.getElementById("teacherToolsTopbar");
const btnFullscreen = document.getElementById("btnTeacherToolsFullscreen");
const btnSceneLock = document.getElementById("btnTeacherToolsSceneLock");
const btnClose = document.getElementById("btnTeacherToolsClose");
const btnTopbarToggle = document.getElementById("btnTeacherToolsTopbarToggle");

const SCENE_WIDTH = 1920;
const SCENE_HEIGHT = 1080;
const DRAG_START_THRESHOLD_PX = 5;
const WIDGET_VIEW_MODE_NORMAL = TEACHER_TOOL_VIEW_MODE_NORMAL;
const WIDGET_VIEW_MODE_COLLAPSED = TEACHER_TOOL_VIEW_MODE_COLLAPSED;
const WIDGET_VIEW_MODE_STAGE = TEACHER_TOOL_VIEW_MODE_STAGE;
const supportsCssZoom = typeof document?.documentElement?.style?.zoom !== "undefined";
const SCENE_ASPECT_RATIO = SCENE_WIDTH / SCENE_HEIGHT;
const WIDGET_LAYOUT_MAX_WIDTH = 1;
const WIDGET_LAYOUT_MAX_HEIGHT = 1;

const DEFAULT_SCENE = Object.freeze({
  version: 2,
  scene: {
    background: "space",
    locked: false
  },
  selectedWidgetId: "",
  widgets: []
});

let sceneState = { ...DEFAULT_SCENE };
let visibleChromeWidgetId = "";
let channel = null;
let dragState = null;
let fitResizeObserver = null;
let starfieldCleanup = null;
let isTopbarCollapsed = false;

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function escapeHtml(s){
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeWidgetViewMode(value){
  return normalizeTeacherToolViewMode(value);
}

function normalizeWidgetLocked(value){
  return value === true;
}

function normalizeLayoutSize(layout = {}){
  const width = clamp(layout.width, 0.12, WIDGET_LAYOUT_MAX_WIDTH);
  const height = clamp(layout.height, 0.10, WIDGET_LAYOUT_MAX_HEIGHT);
  return { width, height };
}

function getWidgetLayoutAspectRatio(widget){
  return getTeacherToolLayoutAspectRatio(getTeacherTool(widget?.toolId) || {}, {
    state: widget?.state,
    widget
  });
}

function constrainLayoutToWidgetAspect(layout = {}, widget = null, { prefer = "width" } = {}){
  const ratio = getWidgetLayoutAspectRatio(widget);
  if (!ratio) return layout;

  const minLayout = getWidgetMinLayout(widget);
  const maxWidth = WIDGET_LAYOUT_MAX_WIDTH;
  const maxHeight = WIDGET_LAYOUT_MAX_HEIGHT;

  const fromWidth = (width) => ({
    width,
    height: width * SCENE_ASPECT_RATIO / ratio
  });
  const fromHeight = (height) => ({
    width: height * ratio / SCENE_ASPECT_RATIO,
    height
  });

  let size = prefer === "height"
    ? fromHeight(Number(layout.height) || minLayout.height)
    : fromWidth(Number(layout.width) || minLayout.width);

  if (size.width < minLayout.width) size = fromWidth(minLayout.width);
  if (size.height < minLayout.height) size = fromHeight(minLayout.height);
  if (size.width > maxWidth) size = fromWidth(maxWidth);
  if (size.height > maxHeight) size = fromHeight(maxHeight);

  return {
    ...layout,
    width: clamp(size.width, 0.01, maxWidth),
    height: clamp(size.height, 0.01, maxHeight)
  };
}

function normalizeWidgetLayout(layout = {}, widget = null, options = {}){
  const baseLayout = normalizeLayout(layout);
  const constrained = constrainLayoutToWidgetAspect(baseLayout, widget, options);
  const width = clamp(constrained.width, 0.01, WIDGET_LAYOUT_MAX_WIDTH);
  const height = clamp(constrained.height, 0.01, WIDGET_LAYOUT_MAX_HEIGHT);
  return {
    x: clamp(constrained.x, 0, Math.max(0, 1 - width)),
    y: clamp(constrained.y, 0, Math.max(0, 1 - height)),
    width,
    height
  };
}

function normalizeLayoutForBounds(layout = {}, bounds = {}){
  const { width, height } = normalizeLayoutSize(layout);
  const boundsWidth = clamp(bounds.width ?? width, 0.01, 1);
  const boundsHeight = clamp(bounds.height ?? height, 0.01, 1);
  return {
    x: clamp(layout.x, 0, Math.max(0, 1 - boundsWidth)),
    y: clamp(layout.y, 0, Math.max(0, 1 - boundsHeight)),
    width,
    height
  };
}

function normalizeLayout(layout = {}){
  return normalizeLayoutForBounds(layout);
}

function normalizeSceneMeta(rawScene = {}){
  const scene = rawScene?.scene && typeof rawScene.scene === "object" ? rawScene.scene : {};
  return {
    background: String(scene.background || rawScene?.background || "space"),
    locked: scene.locked === true || rawScene?.locked === true
  };
}

function normalizeScene(rawScene = {}){
  return {
    version: Math.max(1, Math.trunc(Number(rawScene.version) || 1)),
    scene: normalizeSceneMeta(rawScene),
    selectedWidgetId: String(rawScene.selectedWidgetId || ""),
    widgets: (Array.isArray(rawScene.widgets) ? rawScene.widgets : []).map((widget, index) => {
      const { layer: _legacyLayer, ...widgetWithoutLayer } = widget || {};
      return {
        ...widgetWithoutLayer,
        id: String(widget?.id || ""),
        toolId: String(widget?.toolId || ""),
        label: String(widget?.label || "Widget"),
        icon: String(widget?.icon || "widgets"),
        visible: widget?.visible !== false,
        locked: normalizeWidgetLocked(widget?.locked),
        viewMode: normalizeWidgetViewMode(widget?.viewMode),
        zIndex: Math.max(1, Math.trunc(Number(widget?.zIndex) || index + 1)),
        layout: normalizeWidgetLayout(widget?.layout || {}, widget),
        state: widget?.state && typeof widget.state === "object" ? widget.state : {}
      };
    }).filter((widget) => widget.id && widget.toolId)
  };
}

function isSceneLocked(){
  return sceneState?.scene?.locked === true;
}

function applyBackground(){
  if (!stage) return;
  stage.dataset.background = sceneState.scene?.background || "space";
  stage.classList.toggle("is-scene-locked", isSceneLocked());
  widgetHost?.classList.toggle("is-scene-locked", isSceneLocked());
  syncSpaceStarfield();
  updateProjectionChromeState();
}

function syncSpaceStarfield(){
  if (!starfieldHost) return;
  const isSpaceBackground = (sceneState.scene?.background || "space") === "space";
  starfieldHost.toggleAttribute("hidden", !isSpaceBackground);

  if (!isSpaceBackground) {
    stopSpaceStarfield();
    return;
  }

  if (!starfieldHost.firstElementChild) {
    starfieldHost.innerHTML = renderStudentStars("global");
  }

  if (!starfieldCleanup) {
    starfieldCleanup = mountStudentStarDrift(starfieldHost, "global", {
      measureFromLayout: true
    });
  }
}

function stopSpaceStarfield(){
  starfieldCleanup?.();
  starfieldCleanup = null;
}

function updateProjectionChromeState(){
  const locked = isSceneLocked();
  if (btnSceneLock) {
    btnSceneLock.setAttribute("aria-pressed", locked ? "true" : "false");
    btnSceneLock.setAttribute("aria-label", locked ? "Déverrouiller la scène" : "Verrouiller la scène");
    btnSceneLock.title = locked ? "Déverrouiller la scène" : "Verrouiller la scène";
    btnSceneLock.innerHTML = `
      <span class="ttp-material-icon" aria-hidden="true">${locked ? "lock" : "lock_open"}</span>
    `;
  }
}

function setTopbarCollapsed(collapsed){
  isTopbarCollapsed = collapsed === true;
  topbar?.classList.toggle("is-collapsed", isTopbarCollapsed);
  if (!btnTopbarToggle) return;

  btnTopbarToggle.setAttribute("aria-expanded", isTopbarCollapsed ? "false" : "true");
  btnTopbarToggle.setAttribute("aria-label", isTopbarCollapsed ? "Déplier les commandes" : "Replier les commandes");
  btnTopbarToggle.title = isTopbarCollapsed ? "Déplier les commandes" : "Replier les commandes";
  btnTopbarToggle.innerHTML = `
    <span class="ttp-material-icon" aria-hidden="true">${isTopbarCollapsed ? "keyboard_arrow_up" : "keyboard_arrow_down"}</span>
  `;
}

function toggleTopbarCollapsed(){
  setTopbarCollapsed(!isTopbarCollapsed);
}

function setSceneLocked(locked, { notify = true, renderScene = true } = {}){
  sceneState = {
    ...sceneState,
    scene: {
      ...(sceneState.scene || {}),
      locked: locked === true
    }
  };
  if (renderScene) render();
  else applyBackground();
  if (notify) {
    channel?.send?.("scene-lock", { locked: sceneState.scene.locked === true });
  }
}

function toggleSceneLocked(){
  setSceneLocked(!isSceneLocked());
}

function setFrameLayout(frame, layout, bounds = null){
  const safeLayout = bounds ? normalizeLayoutForBounds(layout, bounds) : normalizeLayout(layout);
  frame.style.left = `${safeLayout.x * 100}%`;
  frame.style.top = `${safeLayout.y * 100}%`;
  frame.style.width = `${safeLayout.width * 100}%`;
  frame.style.height = `${safeLayout.height * 100}%`;
}

function sendWidgetLayout(widgetId, layout){
  const widget = getWidgetById(widgetId);
  channel?.send?.("widget-layout", {
    widgetId,
    layout: widget ? normalizeWidgetLayout(layout, widget) : normalizeLayout(layout)
  });
}

function sendWidgetAction(widgetId, action, payload = {}){
  channel?.send?.("widget-action", {
    widgetId,
    action: String(action || "").trim(),
    payload: payload && typeof payload === "object" ? payload : {}
  });
}

function sendWidgetSelection(widgetId){
  channel?.send?.("select-widget", {
    widgetId
  });
}

function sendWidgetMeta(widgetId, patch = {}){
  channel?.send?.("widget-meta", {
    widgetId,
    patch: patch && typeof patch === "object" ? patch : {}
  });
}

function sendWidgetViewMode(widgetId, mode){
  channel?.send?.("widget-view-mode", {
    widgetId,
    mode: normalizeWidgetViewMode(mode)
  });
}

function sendWidgetRemoval(widgetId){
  channel?.send?.("remove-widget", {
    widgetId
  });
}

function getFrameSizeBounds(frame, fallbackLayout = {}){
  const fallbackSize = normalizeLayoutSize(fallbackLayout);
  const stageRect = stage?.getBoundingClientRect?.();
  const frameRect = frame?.getBoundingClientRect?.();

  if (!stageRect?.width || !stageRect?.height || !frameRect?.width || !frameRect?.height) {
    return fallbackSize;
  }

  return {
    width: clamp(frameRect.width / stageRect.width, 0.01, 1),
    height: clamp(frameRect.height / stageRect.height, 0.01, 1)
  };
}

function getWidgetDragBounds(frame, widget, viewMode){
  const layoutSize = normalizeLayoutSize(widget?.layout || {});
  if (viewMode === WIDGET_VIEW_MODE_COLLAPSED) {
    return getFrameSizeBounds(frame, layoutSize);
  }
  if (viewMode === WIDGET_VIEW_MODE_STAGE) {
    return { width: 1, height: 1 };
  }
  return layoutSize;
}

function getWidgetById(widgetId){
  const safeWidgetId = String(widgetId || "").trim();
  if (!safeWidgetId) return null;
  return sceneState.widgets.find((widget) => widget.id === safeWidgetId) || null;
}

function getWidgetViewMode(widgetId){
  return normalizeWidgetViewMode(getWidgetById(widgetId)?.viewMode);
}

function getWidgetInteraction(widget){
  return normalizeTeacherToolInteraction(getTeacherTool(widget?.toolId)?.interaction);
}

function isWidgetLocked(widget){
  return normalizeWidgetLocked(widget?.locked);
}

function getWidgetRenderZIndex(widget){
  return Math.max(1, Math.trunc(Number(widget?.zIndex) || 1));
}

function getWidgetMinLayout(widget){
  return getTeacherToolMinLayout(getTeacherTool(widget?.toolId) || {});
}

function getDirectWidgetChild(frame, className){
  return Array.from(frame?.children || []).find((child) => child.classList?.contains?.(className)) || null;
}


function clampWidgetLayoutToNormalBounds(widgetId, { sync = false } = {}){
  const safeWidgetId = String(widgetId || "").trim();
  if (!safeWidgetId) return;

  let nextLayout = null;
  let didChange = false;
  sceneState = {
    ...sceneState,
    widgets: sceneState.widgets.map((widget) => {
      if (widget.id !== safeWidgetId) return widget;
      const normalized = normalizeWidgetLayout(widget.layout, widget);
      const current = widget.layout || {};
      const changed = (
        Math.abs(Number(current.x) - normalized.x) > 0.0001
        || Math.abs(Number(current.y) - normalized.y) > 0.0001
      );
      if (!changed) return widget;
      didChange = true;
      nextLayout = normalized;
      return {
        ...widget,
        layout: normalized
      };
    })
  };

  if (sync && didChange && nextLayout) sendWidgetLayout(safeWidgetId, nextLayout);
}

function setWidgetViewMode(widgetId, mode, { notify = true } = {}){
  const safeWidgetId = String(widgetId || "").trim();
  if (!safeWidgetId) return;
  const previousMode = getWidgetViewMode(safeWidgetId);
  const safeMode = normalizeWidgetViewMode(mode);

  sceneState = {
    ...sceneState,
    widgets: sceneState.widgets.map((widget) => {
      if (safeMode === WIDGET_VIEW_MODE_STAGE && widget.id !== safeWidgetId && normalizeWidgetViewMode(widget.viewMode) === WIDGET_VIEW_MODE_STAGE) {
        return { ...widget, viewMode: WIDGET_VIEW_MODE_NORMAL };
      }
      if (widget.id !== safeWidgetId) return widget;
      return { ...widget, viewMode: safeMode };
    })
  };

  if (previousMode === WIDGET_VIEW_MODE_COLLAPSED && safeMode === WIDGET_VIEW_MODE_NORMAL) {
    clampWidgetLayoutToNormalBounds(safeWidgetId, { sync: true });
  }

  visibleChromeWidgetId = safeWidgetId;
  selectWidgetLocally(safeWidgetId);
  render();
  if (notify) sendWidgetViewMode(safeWidgetId, safeMode);
}



function updateWidgetFrameState(){
  let hasStageMaximizedWidget = false;
  widgetHost?.querySelectorAll(".ttp-widget-frame").forEach((frame) => {
    const widgetId = frame.dataset.widgetId;
    const viewMode = getWidgetViewMode(widgetId);
    if (viewMode === WIDGET_VIEW_MODE_STAGE) hasStageMaximizedWidget = true;
    frame.classList.toggle("is-selected", widgetId === sceneState.selectedWidgetId);
    frame.classList.toggle("is-chrome-visible", widgetId === visibleChromeWidgetId);
    frame.classList.toggle("is-collapsed", viewMode === WIDGET_VIEW_MODE_COLLAPSED);
    frame.classList.toggle("is-stage-maximized", viewMode === WIDGET_VIEW_MODE_STAGE);
    const widget = getWidgetById(widgetId);
    const interaction = getWidgetInteraction(widget);
    const widgetLocked = isWidgetLocked(widget);
    frame.classList.toggle("is-widget-locked", widgetLocked);
    frame.classList.toggle("is-resizable", interaction.resize !== false && !widgetLocked);
    frame.dataset.widgetViewMode = viewMode;
    frame.dataset.moveMode = interaction.moveMode;
    frame.dataset.widgetLocked = widgetLocked ? "true" : "false";
    frame.style.zIndex = String(getWidgetRenderZIndex(widget));
  });
  widgetHost?.classList.toggle("has-stage-maximized-widget", hasStageMaximizedWidget);
}

function selectWidgetLocally(widgetId, { notify = true } = {}){
  const safeWidgetId = String(widgetId || "").trim();
  if (!safeWidgetId) return;
  const wasSelected = sceneState.selectedWidgetId === safeWidgetId;

  sceneState = {
    ...sceneState,
    selectedWidgetId: safeWidgetId
  };

  updateWidgetFrameState();

  if (notify && !wasSelected) sendWidgetSelection(safeWidgetId);
}

function deselectWidgetLocally({ notify = false } = {}){
  const hadSelection = Boolean(sceneState.selectedWidgetId);
  visibleChromeWidgetId = "";
  sceneState = {
    ...sceneState,
    selectedWidgetId: ""
  };

  updateWidgetFrameState();

  if (notify && hadSelection) sendWidgetSelection("");
}

function toggleWidgetChrome(widgetId){
  const safeWidgetId = String(widgetId || "").trim();
  if (!safeWidgetId) return;

  if (visibleChromeWidgetId === safeWidgetId) {
    visibleChromeWidgetId = "";
    updateWidgetFrameState();
    return;
  }

  visibleChromeWidgetId = safeWidgetId;
  selectWidgetLocally(safeWidgetId);
}

function updateStageFitLayout(){
  if (!viewport || !fitHost || !stage) return;

  const rect = viewport.getBoundingClientRect();
  const viewportWidth = Math.max(0, rect.width || viewport.clientWidth || 0);
  const viewportHeight = Math.max(0, rect.height || viewport.clientHeight || 0);
  if (viewportWidth <= 0 || viewportHeight <= 0) return;

  const scale = Math.min(
    viewportWidth / SCENE_WIDTH,
    viewportHeight / SCENE_HEIGHT,
    1
  );
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const scaledWidth = Math.max(1, Math.round(SCENE_WIDTH * safeScale));
  const scaledHeight = Math.max(1, Math.round(SCENE_HEIGHT * safeScale));

  fitHost.style.setProperty("--ttp-fit-width", `${scaledWidth}px`);
  fitHost.style.setProperty("--ttp-fit-height", `${scaledHeight}px`);
  fitHost.style.setProperty("--ttp-fit-scale", String(safeScale));
  stage.style.setProperty("--ttp-scene-width", `${SCENE_WIDTH}px`);
  stage.style.setProperty("--ttp-scene-height", `${SCENE_HEIGHT}px`);

  if (supportsCssZoom) {
    stage.style.zoom = String(safeScale);
    stage.style.transform = "";
  } else {
    stage.style.zoom = "";
    stage.style.transform = safeScale === 1 ? "" : `scale(${safeScale})`;
  }

  viewport.classList.toggle("ttp-fit-active", safeScale < 0.999);
  viewport.classList.toggle("ttp-fit-fallback", !supportsCssZoom);
}

function startStageFitObserver(){
  updateStageFitLayout();

  if (typeof ResizeObserver === "function" && viewport) {
    fitResizeObserver = new ResizeObserver(updateStageFitLayout);
    fitResizeObserver.observe(viewport);
  }

  window.addEventListener("resize", updateStageFitLayout, { passive: true });
  window.addEventListener("orientationchange", updateStageFitLayout, { passive: true });
}

function stopStageFitObserver(){
  if (!fitResizeObserver) return;
  fitResizeObserver.disconnect();
  fitResizeObserver = null;
}

function bindDragListeners(){
  window.addEventListener("pointermove", moveWidgetDrag, { passive: false });
  window.addEventListener("pointerup", endWidgetDrag);
  window.addEventListener("pointercancel", endWidgetDrag);
}

function unbindDragListeners(){
  window.removeEventListener("pointermove", moveWidgetDrag);
  window.removeEventListener("pointerup", endWidgetDrag);
  window.removeEventListener("pointercancel", endWidgetDrag);
}

function isInteractiveDragTarget(target){
  return Boolean(target?.closest?.(
    "button, input, select, textarea, label, a, [data-widget-action], [data-no-widget-drag]"
  ));
}

function startWidgetDrag(event, frame, widget){
  if (!stage || !frame || !widget) return;
  if (dragState) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (isSceneLocked() || isWidgetLocked(widget)) {
    if (!isInteractiveDragTarget(event.target)) {
      toggleWidgetChrome(widget.id);
      event.preventDefault();
    }
    return;
  }

  const interaction = getWidgetInteraction(widget);
  if (interaction.moveMode === TEACHER_TOOL_MOVE_MODE_NONE) return;
  if (interaction.moveMode === TEACHER_TOOL_MOVE_MODE_CHROME && !event.target?.closest?.("[data-drag-handle]")) return;
  if (interaction.moveMode === TEACHER_TOOL_MOVE_MODE_BODY && isInteractiveDragTarget(event.target)) return;
  if (interaction.moveMode === TEACHER_TOOL_MOVE_MODE_CHROME && isInteractiveDragTarget(event.target)) return;

  const viewMode = getWidgetViewMode(widget.id);
  const stageRect = stage.getBoundingClientRect();
  const liveWidget = sceneState.widgets.find((item) => item.id === widget.id) || widget;
  const dragBounds = getWidgetDragBounds(frame, liveWidget, viewMode);
  const layout = normalizeLayoutForBounds(liveWidget.layout, dragBounds);

  dragState = {
    mode: "move",
    pointerId: event.pointerId,
    frame,
    widgetId: widget.id,
    startClientX: event.clientX,
    startClientY: event.clientY,
    stageWidth: Math.max(1, stageRect.width),
    stageHeight: Math.max(1, stageRect.height),
    boundsWidth: dragBounds.width,
    boundsHeight: dragBounds.height,
    layout,
    currentLayout: layout,
    viewMode,
    hasStarted: false,
    didMove: false
  };

  bindDragListeners();
  try {
    frame.setPointerCapture?.(event.pointerId);
  } catch {}
  event.preventDefault();
}

function startWidgetResize(event, frame, widget){
  if (!stage || !frame || !widget) return;
  if (dragState) return;
  if (isSceneLocked() || isWidgetLocked(widget)) return;
  if (getWidgetInteraction(widget).resize === false) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (sceneState.selectedWidgetId !== widget.id) {
    selectWidgetLocally(widget.id);
  }

  const stageRect = stage.getBoundingClientRect();
  const liveWidget = sceneState.widgets.find((item) => item.id === widget.id) || widget;
  const layout = normalizeWidgetLayout(liveWidget.layout, liveWidget);

  dragState = {
    mode: "resize",
    pointerId: event.pointerId,
    frame,
    widgetId: widget.id,
    startClientX: event.clientX,
    startClientY: event.clientY,
    stageWidth: Math.max(1, stageRect.width),
    stageHeight: Math.max(1, stageRect.height),
    boundsWidth: layout.width,
    boundsHeight: layout.height,
    layout,
    currentLayout: layout,
    viewMode: getWidgetViewMode(widget.id),
    hasStarted: true,
    didMove: false
  };

  frame.classList.add("is-dragging");
  bindDragListeners();
  try {
    frame.setPointerCapture?.(event.pointerId);
  } catch {}
  event.preventDefault();
}

function moveWidgetDrag(event){
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  const dx = event.clientX - dragState.startClientX;
  const dy = event.clientY - dragState.startClientY;
  const dxRatio = dx / Math.max(1, dragState.stageWidth);
  const dyRatio = dy / Math.max(1, dragState.stageHeight);
  const dragBounds = {
    width: dragState.boundsWidth,
    height: dragState.boundsHeight
  };
  const layout = dragState.viewMode === WIDGET_VIEW_MODE_COLLAPSED
    ? normalizeLayoutForBounds(dragState.layout, dragBounds)
    : normalizeLayout(dragState.layout);

  let nextLayout = layout;
  if (dragState.mode === "move" && dragState.viewMode === WIDGET_VIEW_MODE_STAGE) {
    const movedEnough = Math.hypot(dx, dy) >= DRAG_START_THRESHOLD_PX;
    if (movedEnough) {
      dragState.hasStarted = true;
      if (sceneState.selectedWidgetId !== dragState.widgetId) {
        selectWidgetLocally(dragState.widgetId);
      }
    }
    event.preventDefault();
    return;
  }

  if (dragState.mode === "move" && !dragState.hasStarted) {
    const movedEnough = Math.hypot(dx, dy) >= DRAG_START_THRESHOLD_PX;
    if (!movedEnough) {
      event.preventDefault();
      return;
    }
    dragState.hasStarted = true;
    dragState.didMove = true;
    dragState.frame.classList.add("is-dragging");
    if (sceneState.selectedWidgetId !== dragState.widgetId) {
      selectWidgetLocally(dragState.widgetId);
    }
  }

  if (dragState.mode === "resize") {
    const widget = getWidgetById(dragState.widgetId);
    const minLayout = getWidgetMinLayout(widget);
    const prefer = Math.abs(dxRatio / Math.max(layout.width, 0.001)) >= Math.abs(dyRatio / Math.max(layout.height, 0.001))
      ? "width"
      : "height";
    nextLayout = normalizeWidgetLayout({
      ...layout,
      width: clamp(layout.width + dxRatio, minLayout.width, 1 - layout.x),
      height: clamp(layout.height + dyRatio, minLayout.height, 1 - layout.y)
    }, widget, { prefer });
    dragState.didMove = true;
    dragState.currentLayout = nextLayout;
    setFrameLayout(dragState.frame, nextLayout);
    event.preventDefault();
    return;
  }

  if (dragState.viewMode === WIDGET_VIEW_MODE_COLLAPSED) {
    nextLayout = normalizeLayoutForBounds({
      ...layout,
      x: layout.x + dxRatio,
      y: layout.y + dyRatio
    }, dragBounds);
  } else {
    nextLayout = normalizeLayout({
      ...layout,
      x: clamp(layout.x + dxRatio, 0, 1 - layout.width),
      y: clamp(layout.y + dyRatio, 0, 1 - layout.height)
    });
  }
  dragState.didMove = true;
  dragState.currentLayout = nextLayout;
  setFrameLayout(dragState.frame, nextLayout, dragBounds);
  event.preventDefault();
}

function endWidgetDrag(event){
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  const finishedDrag = dragState;
  const dragBounds = {
    width: finishedDrag.boundsWidth,
    height: finishedDrag.boundsHeight
  };
  const widget = getWidgetById(finishedDrag.widgetId);
  const nextLayout = finishedDrag.viewMode === WIDGET_VIEW_MODE_COLLAPSED
    ? normalizeLayoutForBounds(dragState.currentLayout || dragState.layout, dragBounds)
    : normalizeWidgetLayout(dragState.currentLayout || dragState.layout, widget);
  const shouldToggleChrome = (
    finishedDrag.mode === "move"
    && !finishedDrag.hasStarted
    && event.type !== "pointercancel"
  );

  if (!shouldToggleChrome) {
    sceneState = {
      ...sceneState,
      widgets: sceneState.widgets.map((widget) => {
        if (widget.id !== finishedDrag.widgetId) return widget;
        return {
          ...widget,
          layout: nextLayout
        };
      })
    };

    setFrameLayout(finishedDrag.frame, nextLayout, dragBounds);
  }

  finishedDrag.frame.classList.remove("is-dragging");
  try {
    finishedDrag.frame.releasePointerCapture?.(event.pointerId);
  } catch {}
  unbindDragListeners();
  dragState = null;

  if (shouldToggleChrome) {
    toggleWidgetChrome(finishedDrag.widgetId);
    event.preventDefault();
    return;
  }

  if (finishedDrag.didMove && finishedDrag.viewMode !== WIDGET_VIEW_MODE_COLLAPSED) {
    sendWidgetLayout(finishedDrag.widgetId, nextLayout);
  }
  event.preventDefault();
}

function syncFrameLayoutForView(frame, widget){
  if (!frame || !widget) return;
  const viewMode = getWidgetViewMode(widget.id);
  if (viewMode !== WIDGET_VIEW_MODE_COLLAPSED) {
    setFrameLayout(frame, normalizeWidgetLayout(widget.layout, widget));
    return;
  }

  setFrameLayout(frame, widget.layout, getFrameSizeBounds(frame, widget.layout));
}

function renderWidget(widget, existingFrame = null){
  const tool = getTeacherTool(widget.toolId);
  if (!tool) return null;

  const viewMode = getWidgetViewMode(widget.id);
  const interaction = getWidgetInteraction(widget);
  const sceneLocked = isSceneLocked();
  const frame = existingFrame || document.createElement("article");
  frame.className = "ttp-widget-frame";
  frame.classList.toggle("is-selected", widget.id === sceneState.selectedWidgetId);
  frame.classList.toggle("is-chrome-visible", widget.id === visibleChromeWidgetId);
  frame.classList.toggle("is-collapsed", viewMode === WIDGET_VIEW_MODE_COLLAPSED);
  frame.classList.toggle("is-stage-maximized", viewMode === WIDGET_VIEW_MODE_STAGE);
  const widgetLocked = isWidgetLocked(widget);
  frame.classList.toggle("is-scene-locked", sceneLocked);
  frame.classList.toggle("is-widget-locked", widgetLocked);
  frame.classList.toggle("is-resizable", interaction.resize !== false && !widgetLocked);
  frame.dataset.widgetId = widget.id;
  frame.dataset.toolId = widget.toolId;
  frame.dataset.widgetViewMode = viewMode;
  frame.dataset.moveMode = interaction.moveMode;
  frame.dataset.widgetLocked = widgetLocked ? "true" : "false";
  frame.style.zIndex = String(getWidgetRenderZIndex(widget));
  setFrameLayout(frame, normalizeWidgetLayout(widget.layout, widget));

  let chrome = getDirectWidgetChild(frame, "ttp-widget-chrome");
  if (!chrome) chrome = document.createElement("header");
  chrome.className = "ttp-widget-chrome";
  chrome.dataset.dragHandle = "true";
  const isCollapsed = viewMode === WIDGET_VIEW_MODE_COLLAPSED;
  const isStageMaximized = viewMode === WIDGET_VIEW_MODE_STAGE;
  chrome.innerHTML = `
    <span class="ttp-widget-chrome-title">
      <span class="ttp-material-icon" aria-hidden="true">${escapeHtml(widget.icon || tool.icon || "widgets")}</span>
      <strong>${escapeHtml(widget.label || tool.label || "Widget")}</strong>
    </span>
    <span class="ttp-widget-chrome-actions" data-widget-chrome-actions></span>
    <span class="ttp-widget-window-actions" data-widget-window-actions>
      <button class="ttp-widget-icon-btn ttp-material-icon" type="button" data-widget-action data-widget-display-action="toggle-lock" title="${widgetLocked ? "Déverrouiller ce widget" : "Verrouiller ce widget"}" aria-label="${widgetLocked ? "Déverrouiller ce widget" : "Verrouiller ce widget"}" aria-pressed="${widgetLocked ? "true" : "false"}">
        ${widgetLocked ? "lock" : "lock_open"}
      </button>
      ${widgetLocked || interaction.canCollapse === false ? "" : `
        <button class="ttp-widget-icon-btn ttp-material-icon" type="button" data-widget-action data-widget-display-action="${isCollapsed ? "expand" : "collapse"}" title="${isCollapsed ? "Déplier le widget" : "Réduire le widget"}" aria-label="${isCollapsed ? "Déplier le widget" : "Réduire le widget"}">
          ${isCollapsed ? "expand_more" : "expand_less"}
        </button>
      `}
      ${widgetLocked || isCollapsed || interaction.canStage === false ? "" : `
        <button class="ttp-widget-icon-btn ttp-material-icon" type="button" data-widget-action data-widget-display-action="${isStageMaximized ? "restore" : "stage"}" title="${isStageMaximized ? "Restaurer le widget" : "Agrandir sur toute la scène"}" aria-label="${isStageMaximized ? "Restaurer le widget" : "Agrandir sur toute la scène"}">
          ${isStageMaximized ? "fullscreen_exit" : "fullscreen"}
        </button>
      `}
      ${widgetLocked ? "" : `
        <button class="ttp-widget-icon-btn ttp-material-icon" type="button" data-widget-action data-widget-display-action="remove" title="Supprimer le widget" aria-label="Supprimer le widget">
          close
        </button>
      `}
    </span>
  `;
  const chromeActions = chrome.querySelector("[data-widget-chrome-actions]");
  const windowActions = chrome.querySelector("[data-widget-window-actions]");

  let body = getDirectWidgetChild(frame, "ttp-widget-body");
  if (!body) body = document.createElement("div");
  body.className = "ttp-widget-body";

  let bottomChrome = getDirectWidgetChild(frame, "ttp-widget-bottom-chrome");
  if (!bottomChrome) bottomChrome = document.createElement("footer");
  bottomChrome.className = "ttp-widget-bottom-chrome";
  bottomChrome.dataset.dragHandle = "true";
  bottomChrome.innerHTML = `
    <span class="ttp-widget-info" data-widget-info></span>
    <span class="ttp-widget-bottom-actions" data-widget-bottom-chrome-actions></span>
  `;
  const widgetInfo = bottomChrome.querySelector("[data-widget-info]");
  const bottomChromeActions = bottomChrome.querySelector("[data-widget-bottom-chrome-actions]");

  let resizeHandle = getDirectWidgetChild(frame, "ttp-widget-resize");
  if (!resizeHandle) resizeHandle = document.createElement("button");
  resizeHandle.className = "ttp-widget-resize ttp-material-icon";
  resizeHandle.type = "button";
  resizeHandle.title = "Redimensionner";
  resizeHandle.setAttribute("aria-label", "Redimensionner le widget");
  resizeHandle.textContent = "open_in_full";

  if (interaction.resize === false || widgetLocked) {
    resizeHandle.hidden = true;
  }
  else {
    resizeHandle.hidden = false;
  }
  frame.append(chrome, body, bottomChrome, resizeHandle);
  tool.renderProjector?.({
    host: body,
    chromeHost: chromeActions,
    widgetInfoHost: widgetInfo,
    bottomChromeHost: bottomChromeActions,
    state: widget.state,
    widget,
    scene: sceneState,
    sendAction: (action, payload = {}) => sendWidgetAction(widget.id, action, payload)
  });

  windowActions?.querySelectorAll("[data-widget-display-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const action = button.dataset.widgetDisplayAction;
      if (action === "toggle-lock") {
        const nextLocked = !isWidgetLocked(getWidgetById(widget.id) || widget);
        sceneState = {
          ...sceneState,
          widgets: sceneState.widgets.map((item) => (item.id === widget.id ? { ...item, locked: nextLocked } : item))
        };
        visibleChromeWidgetId = widget.id;
        sendWidgetMeta(widget.id, { locked: nextLocked });
        render();
        return;
      }
      if (isSceneLocked() || isWidgetLocked(getWidgetById(widget.id) || widget)) return;
      if (action === "collapse") {
        setWidgetViewMode(widget.id, WIDGET_VIEW_MODE_COLLAPSED);
        return;
      }
      if (action === "expand" || action === "restore") {
        setWidgetViewMode(widget.id, WIDGET_VIEW_MODE_NORMAL);
        return;
      }
      if (action === "stage") {
        setWidgetViewMode(widget.id, WIDGET_VIEW_MODE_STAGE);
        return;
      }
      if (action === "remove") {
        if (visibleChromeWidgetId === widget.id) visibleChromeWidgetId = "";
        sceneState = {
          ...sceneState,
          widgets: sceneState.widgets.filter((item) => item.id !== widget.id)
        };
        sendWidgetRemoval(widget.id);
        render();
      }
    });
  });

  resizeHandle.onpointerdown = (event) => startWidgetResize(event, frame, widget);
  frame.onpointerdown = (event) => {
    startWidgetDrag(event, frame, widget);
  };

  return frame;
}

function render(){
  if (!widgetHost) return;
  applyBackground();

  const visibleWidgets = sceneState.widgets.filter((widget) => widget.visible !== false);
  widgetHost.classList.toggle("has-stage-maximized-widget", visibleWidgets.some((widget) => (
    getWidgetViewMode(widget.id) === WIDGET_VIEW_MODE_STAGE
  )));

  if (visibleChromeWidgetId && !visibleWidgets.some((widget) => widget.id === visibleChromeWidgetId)) {
    visibleChromeWidgetId = "";
  }

  if (!visibleWidgets.length) {
    widgetHost.innerHTML = "";
    return;
  }

  const existingFrames = new Map();
  widgetHost.querySelectorAll(".ttp-widget-frame[data-widget-id]").forEach((frame) => {
    existingFrames.set(frame.dataset.widgetId, frame);
  });
  const renderedWidgetIds = new Set();

  visibleWidgets
    .slice()
    .sort((a, b) => {
      return (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0);
    })
    .forEach((widget) => {
      const existingFrame = existingFrames.get(widget.id);
      const reusableFrame = existingFrame?.dataset?.toolId === widget.toolId ? existingFrame : null;
      const frame = renderWidget(widget, reusableFrame);
      if (frame) {
        renderedWidgetIds.add(widget.id);
        if (existingFrame && existingFrame !== frame) existingFrame.remove();
        widgetHost.append(frame);
        syncFrameLayoutForView(frame, widget);
      }
    });

  existingFrames.forEach((frame, widgetId) => {
    if (!renderedWidgetIds.has(widgetId)) frame.remove();
  });
}

function connect(){
  if (!teacherSpaceId || !channelId) {
    render();
    return;
  }

  channel = createTeacherToolsChannel({
    teacherSpaceId,
    channelId,
    onMessage: (message) => {
      if (message?.type === "scene-state") {
        const nextScene = normalizeScene(message.scene || DEFAULT_SCENE);
        const keepLocalSelection = sceneState.selectedWidgetId
          && nextScene.widgets.some((widget) => widget.id === sceneState.selectedWidgetId);
        const keepVisibleChrome = visibleChromeWidgetId
          && nextScene.widgets.some((widget) => widget.id === visibleChromeWidgetId && widget.visible !== false);
        sceneState = {
          ...nextScene,
          selectedWidgetId: keepLocalSelection ? sceneState.selectedWidgetId : ""
        };
        visibleChromeWidgetId = keepVisibleChrome ? visibleChromeWidgetId : "";
        render();
        return;
      }

      if (message?.type === "widget-view-mode") {
        setWidgetViewMode(message.widgetId, message.mode, { notify: false });
        return;
      }

      if (message?.type === "scene-lock") {
        setSceneLocked(message.locked === true, { notify: false });
        return;
      }
    }
  });

  if (!channel) {
    render();
    return;
  }

  channel.send("projector-ready", {});
  channel.send("request-status", {});
  render();
}

function notifyProjectorClosed(){
  try {
    channel?.send?.("projector-closed", { active: false });
  } catch {}
}

btnFullscreen?.addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      return;
    }
    await document.exitFullscreen();
  } catch {}
});

btnSceneLock?.addEventListener("click", () => {
  toggleSceneLocked();
});

btnClose?.addEventListener("click", () => {
  notifyProjectorClosed();
  try {
    window.close();
  } catch {}
});

btnTopbarToggle?.addEventListener("click", toggleTopbarCollapsed);

widgetHost?.addEventListener("pointerdown", (event) => {
  if (dragState || event.target !== widgetHost) return;
  deselectWidgetLocally({ notify: true });
});

window.addEventListener("beforeunload", () => {
  notifyProjectorClosed();
  stopSpaceStarfield();
  stopStageFitObserver();
  channel?.close?.();
});

window.addEventListener("pagehide", () => {
  notifyProjectorClosed();
  stopSpaceStarfield();
});

document.addEventListener("fullscreenchange", () => {
  stage?.classList.toggle("is-fullscreen", Boolean(document.fullscreenElement));
  updateStageFitLayout();
});

startStageFitObserver();
connect();
