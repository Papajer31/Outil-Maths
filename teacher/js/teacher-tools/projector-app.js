import { createTeacherToolsChannel } from "./channel.js";
import { getTeacherTool } from "./registry.js";
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
const btnFullscreen = document.getElementById("btnTeacherToolsFullscreen");
const btnClose = document.getElementById("btnTeacherToolsClose");

const SCENE_WIDTH = 1920;
const SCENE_HEIGHT = 1080;
const supportsCssZoom = typeof document?.documentElement?.style?.zoom !== "undefined";

const DEFAULT_SCENE = Object.freeze({
  background: "space",
  selectedWidgetId: "",
  widgets: []
});

let sceneState = { ...DEFAULT_SCENE };
let channel = null;
let dragState = null;
let fitResizeObserver = null;
let starfieldCleanup = null;

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

function normalizeLayout(layout = {}){
  const width = clamp(layout.width, 0.12, 0.96);
  const height = clamp(layout.height, 0.10, 0.90);
  return {
    x: clamp(layout.x, 0, 1 - width),
    y: clamp(layout.y, 0, 1 - height),
    width,
    height
  };
}

function normalizeScene(rawScene = {}){
  return {
    version: Math.max(1, Math.trunc(Number(rawScene.version) || 1)),
    background: String(rawScene.background || "space"),
    selectedWidgetId: String(rawScene.selectedWidgetId || ""),
    widgets: (Array.isArray(rawScene.widgets) ? rawScene.widgets : []).map((widget, index) => ({
      ...widget,
      id: String(widget?.id || ""),
      toolId: String(widget?.toolId || ""),
      label: String(widget?.label || "Widget"),
      icon: String(widget?.icon || "widgets"),
      visible: widget?.visible !== false,
      zIndex: Math.max(1, Math.trunc(Number(widget?.zIndex) || index + 1)),
      layout: normalizeLayout(widget?.layout || {}),
      state: widget?.state && typeof widget.state === "object" ? widget.state : {}
    })).filter((widget) => widget.id && widget.toolId)
  };
}

function applyBackground(){
  if (!stage) return;
  stage.dataset.background = sceneState.background || "space";
  syncSpaceStarfield();
}

function syncSpaceStarfield(){
  if (!starfieldHost) return;
  const isSpaceBackground = (sceneState.background || "space") === "space";
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

function setFrameLayout(frame, layout){
  const safeLayout = normalizeLayout(layout);
  frame.style.left = `${safeLayout.x * 100}%`;
  frame.style.top = `${safeLayout.y * 100}%`;
  frame.style.width = `${safeLayout.width * 100}%`;
  frame.style.height = `${safeLayout.height * 100}%`;
}

function sendWidgetLayout(widgetId, layout){
  channel?.send?.("widget-layout", {
    widgetId,
    layout: normalizeLayout(layout)
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

function selectWidgetLocally(widgetId, { notify = true } = {}){
  const safeWidgetId = String(widgetId || "").trim();
  if (!safeWidgetId) return;
  const wasSelected = sceneState.selectedWidgetId === safeWidgetId;

  sceneState = {
    ...sceneState,
    selectedWidgetId: safeWidgetId
  };

  widgetHost?.querySelectorAll(".ttp-widget-frame").forEach((frame) => {
    frame.classList.toggle("is-selected", frame.dataset.widgetId === safeWidgetId);
  });

  if (notify && !wasSelected) sendWidgetSelection(safeWidgetId);
}

function deselectWidgetLocally({ notify = false } = {}){
  const hadSelection = Boolean(sceneState.selectedWidgetId);
  sceneState = {
    ...sceneState,
    selectedWidgetId: ""
  };

  widgetHost?.querySelectorAll(".ttp-widget-frame.is-selected").forEach((frame) => {
    frame.classList.remove("is-selected");
  });

  if (notify && hadSelection) sendWidgetSelection("");
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
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (isInteractiveDragTarget(event.target)) return;

  if (sceneState.selectedWidgetId !== widget.id) {
    selectWidgetLocally(widget.id);
    event.preventDefault();
    return;
  }

  const stageRect = stage.getBoundingClientRect();
  const liveWidget = sceneState.widgets.find((item) => item.id === widget.id) || widget;
  const layout = normalizeLayout(liveWidget.layout);

  dragState = {
    mode: "move",
    pointerId: event.pointerId,
    frame,
    widgetId: widget.id,
    startClientX: event.clientX,
    startClientY: event.clientY,
    stageWidth: Math.max(1, stageRect.width),
    stageHeight: Math.max(1, stageRect.height),
    layout,
    currentLayout: layout
  };

  frame.classList.add("is-dragging");
  bindDragListeners();
  try {
    frame.setPointerCapture?.(event.pointerId);
  } catch {}
  event.preventDefault();
}

function startWidgetResize(event, frame, widget){
  if (!stage || !frame || !widget) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  if (sceneState.selectedWidgetId !== widget.id) {
    selectWidgetLocally(widget.id);
    event.preventDefault();
    return;
  }

  const stageRect = stage.getBoundingClientRect();
  const liveWidget = sceneState.widgets.find((item) => item.id === widget.id) || widget;
  const layout = normalizeLayout(liveWidget.layout);

  dragState = {
    mode: "resize",
    pointerId: event.pointerId,
    frame,
    widgetId: widget.id,
    startClientX: event.clientX,
    startClientY: event.clientY,
    stageWidth: Math.max(1, stageRect.width),
    stageHeight: Math.max(1, stageRect.height),
    layout,
    currentLayout: layout
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
  const layout = normalizeLayout(dragState.layout);

  let nextLayout = layout;
  if (dragState.mode === "resize") {
    nextLayout = normalizeLayout({
      ...layout,
      width: clamp(layout.width + dxRatio, 0.12, 1 - layout.x),
      height: clamp(layout.height + dyRatio, 0.10, 1 - layout.y)
    });
    dragState.currentLayout = nextLayout;
    setFrameLayout(dragState.frame, nextLayout);
    event.preventDefault();
    return;
  }

  nextLayout = normalizeLayout({
    ...layout,
    x: clamp(layout.x + dxRatio, 0, 1 - layout.width),
    y: clamp(layout.y + dyRatio, 0, 1 - layout.height)
  });
  dragState.currentLayout = nextLayout;
  setFrameLayout(dragState.frame, nextLayout);
  event.preventDefault();
}

function endWidgetDrag(event){
  if (!dragState || event.pointerId !== dragState.pointerId) return;

  const nextLayout = normalizeLayout(dragState.currentLayout || dragState.layout);

  sceneState = {
    ...sceneState,
    widgets: sceneState.widgets.map((widget) => {
      if (widget.id !== dragState.widgetId) return widget;
      return {
        ...widget,
        layout: nextLayout
      };
    })
  };

  setFrameLayout(dragState.frame, nextLayout);
  dragState.frame.classList.remove("is-dragging");
  try {
    dragState.frame.releasePointerCapture?.(event.pointerId);
  } catch {}
  unbindDragListeners();
  sendWidgetLayout(dragState.widgetId, nextLayout);
  dragState = null;
  event.preventDefault();
}

function renderWidget(widget){
  const tool = getTeacherTool(widget.toolId);
  if (!tool) return null;

  const frame = document.createElement("article");
  frame.className = "ttp-widget-frame";
  frame.classList.toggle("is-selected", widget.id === sceneState.selectedWidgetId);
  frame.dataset.widgetId = widget.id;
  frame.dataset.toolId = widget.toolId;
  frame.style.zIndex = String(Math.max(1, Math.trunc(Number(widget.zIndex) || 1)));
  setFrameLayout(frame, widget.layout);

  const chrome = document.createElement("header");
  chrome.className = "ttp-widget-chrome";
  chrome.dataset.dragHandle = "true";
  chrome.innerHTML = `
    <span class="ttp-widget-chrome-title">
      <span class="ttp-material-icon" aria-hidden="true">${escapeHtml(widget.icon || tool.icon || "widgets")}</span>
      <strong>${escapeHtml(widget.label || tool.label || "Widget")}</strong>
    </span>
    <span class="ttp-widget-chrome-actions" data-widget-chrome-actions></span>
  `;
  const chromeActions = chrome.querySelector("[data-widget-chrome-actions]");

  const body = document.createElement("div");
  body.className = "ttp-widget-body";

  const bottomChrome = document.createElement("footer");
  bottomChrome.className = "ttp-widget-bottom-chrome";
  bottomChrome.dataset.dragHandle = "true";
  bottomChrome.innerHTML = `
    <span class="ttp-widget-info" data-widget-info></span>
    <span class="ttp-widget-bottom-actions" data-widget-bottom-chrome-actions></span>
  `;
  const widgetInfo = bottomChrome.querySelector("[data-widget-info]");
  const bottomChromeActions = bottomChrome.querySelector("[data-widget-bottom-chrome-actions]");

  const resizeHandle = document.createElement("button");
  resizeHandle.className = "ttp-widget-resize ttp-material-icon";
  resizeHandle.type = "button";
  resizeHandle.title = "Redimensionner";
  resizeHandle.setAttribute("aria-label", "Redimensionner le widget");
  resizeHandle.textContent = "open_in_full";

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

  chromeActions?.addEventListener("pointerdown", (event) => {
    event.stopPropagation();
  });
  chrome.addEventListener("pointerdown", (event) => startWidgetDrag(event, frame, widget));
  bottomChrome.addEventListener("pointerdown", (event) => startWidgetDrag(event, frame, widget));
  resizeHandle.addEventListener("pointerdown", (event) => startWidgetResize(event, frame, widget));
  frame.addEventListener("pointerdown", (event) => {
    if (isInteractiveDragTarget(event.target)) return;
    selectWidgetLocally(widget.id);
  });

  return frame;
}

function render(){
  if (!widgetHost) return;
  applyBackground();

  const visibleWidgets = sceneState.widgets.filter((widget) => widget.visible !== false);
  if (!visibleWidgets.length) {
    widgetHost.innerHTML = "";
    return;
  }

  widgetHost.innerHTML = "";
  visibleWidgets
    .slice()
    .sort((a, b) => (Number(a.zIndex) || 0) - (Number(b.zIndex) || 0))
    .forEach((widget) => {
      const frame = renderWidget(widget);
      if (frame) widgetHost.append(frame);
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
        sceneState = normalizeScene(message.scene || DEFAULT_SCENE);
        render();
        return;
      }

      // Compatibilité avec le tout premier patch : ancien message outil unique.
      if (message?.type === "tool-state") {
        const fallbackToolId = String(message.toolId || "random-student");
        sceneState = normalizeScene({
          background: "space",
          widgets: [{
            id: "legacy-random-student",
            toolId: fallbackToolId,
            label: getTeacherTool(fallbackToolId)?.label || "Widget",
            icon: getTeacherTool(fallbackToolId)?.icon || "widgets",
            visible: true,
            layout: { x: 0.30, y: 0.26, width: 0.40, height: 0.30 },
            state: message.state || {}
          }]
        });
        render();
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

btnClose?.addEventListener("click", () => {
  notifyProjectorClosed();
  try {
    window.close();
  } catch {}
});

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
