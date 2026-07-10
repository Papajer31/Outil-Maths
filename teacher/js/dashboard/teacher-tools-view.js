import {
  buildTeacherToolsProjectorUrl,
  createTeacherToolsChannel,
  createTeacherToolsChannelId
} from "../teacher-tools/channel.js";
import {
  getTeacherTool,
  listTeacherTools
} from "../teacher-tools/registry.js";
import {
  BACKGROUND_WIDGET_ID,
  SCENE_BACKGROUND_OPTIONS,
  normalizeSceneBackgroundState
} from "../teacher-tools/widgets/background/tool.js";
import {
  TEACHER_TOOL_DEFAULT_LAYOUT,
  TEACHER_TOOL_DEFAULT_MIN_LAYOUT,
  TEACHER_TOOL_VIEW_MODE_COLLAPSED,
  TEACHER_TOOL_VIEW_MODE_NORMAL,
  TEACHER_TOOL_VIEW_MODE_STAGE,
  getTeacherToolLayout,
  getTeacherToolLayoutAspectRatio,
  getTeacherToolMinLayout,
  normalizeTeacherToolViewMode
} from "../teacher-tools/core/tool-contract.js";
import { escapeAttr, escapeHtml } from "./text-utils.js";

const SCENE_BACKGROUNDS = SCENE_BACKGROUND_OPTIONS;

const SCENE_VERSION = 2;
const DEFAULT_SCENE_ASPECT_RATIO = 16 / 9;
const WIDGET_VIEW_MODE_NORMAL = TEACHER_TOOL_VIEW_MODE_NORMAL;
const WIDGET_VIEW_MODE_COLLAPSED = TEACHER_TOOL_VIEW_MODE_COLLAPSED;
const WIDGET_VIEW_MODE_STAGE = TEACHER_TOOL_VIEW_MODE_STAGE;
const WIDGET_LAYOUT_MAX_WIDTH = 1;
const WIDGET_LAYOUT_MAX_HEIGHT = 1;

function normalizeToolId(value){
  return String(value || "").trim();
}

function normalizeWidgetViewMode(value){
  return normalizeTeacherToolViewMode(value);
}

function normalizeWidgetLocked(value){
  return value === true;
}

function clamp01(value, fallback = 0){
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(0, Math.min(1, number));
}

function normalizeSceneAspectRatio(value, fallback = DEFAULT_SCENE_ASPECT_RATIO){
  const ratio = Number(value);
  if (!Number.isFinite(ratio) || ratio <= 0) return fallback;
  return ratio;
}

function getSceneAspectRatioFromPayload(payload = {}, fallback = DEFAULT_SCENE_ASPECT_RATIO){
  const explicitRatio = Number(payload?.sceneAspectRatio);
  if (Number.isFinite(explicitRatio) && explicitRatio > 0) return explicitRatio;

  const sceneWidth = Number(payload?.sceneWidth);
  const sceneHeight = Number(payload?.sceneHeight);
  if (Number.isFinite(sceneWidth) && Number.isFinite(sceneHeight) && sceneWidth > 0 && sceneHeight > 0) {
    return sceneWidth / sceneHeight;
  }

  return fallback;
}

function getToolDefaultLayout(toolId){
  return getTeacherToolLayout(getTeacherTool(toolId) || { defaultLayout: TEACHER_TOOL_DEFAULT_LAYOUT });
}

function getToolMinLayout(toolId){
  return getTeacherToolMinLayout(getTeacherTool(toolId) || { minLayout: TEACHER_TOOL_DEFAULT_MIN_LAYOUT });
}

function getToolLayoutAspectRatio(toolId, state = {}){
  return getTeacherToolLayoutAspectRatio(getTeacherTool(toolId) || {}, { state });
}

function constrainLayoutToAspect(layout, toolId, state = {}, { prefer = "width", sceneAspectRatio = DEFAULT_SCENE_ASPECT_RATIO } = {}){
  const ratio = getToolLayoutAspectRatio(toolId, state);
  if (!ratio) return layout;

  const safeSceneAspectRatio = normalizeSceneAspectRatio(sceneAspectRatio);
  const minLayout = getToolMinLayout(toolId);
  const maxWidth = WIDGET_LAYOUT_MAX_WIDTH;
  const maxHeight = WIDGET_LAYOUT_MAX_HEIGHT;

  const fromWidth = (width) => ({
    width,
    height: width * safeSceneAspectRatio / ratio
  });
  const fromHeight = (height) => ({
    width: height * ratio / safeSceneAspectRatio,
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
    width: Math.max(0.01, Math.min(maxWidth, size.width)),
    height: Math.max(0.01, Math.min(maxHeight, size.height))
  };
}

function normalizeLayout(layout, toolId, state = {}, options = {}){
  if (toolId === "drawing-layer") {
    const width = Math.max(0.0001, Math.abs(Number(layout?.width) || getToolDefaultLayout(toolId).width));
    const height = Math.max(0.0001, Math.abs(Number(layout?.height) || getToolDefaultLayout(toolId).height));
    const x = Number(layout?.x);
    const y = Number(layout?.y);
    return {
      x: Number.isFinite(x) ? x : getToolDefaultLayout(toolId).x,
      y: Number.isFinite(y) ? y : getToolDefaultLayout(toolId).y,
      width,
      height
    };
  }

  const fallback = getToolDefaultLayout(toolId);
  const minLayout = getToolMinLayout(toolId);
  let width = Math.max(minLayout.width, Math.min(WIDGET_LAYOUT_MAX_WIDTH, Number(layout?.width) || fallback.width));
  let height = Math.max(minLayout.height, Math.min(WIDGET_LAYOUT_MAX_HEIGHT, Number(layout?.height) || fallback.height));
  const ratioLayout = constrainLayoutToAspect({ width, height }, toolId, state, options);
  width = ratioLayout.width;
  height = ratioLayout.height;
  return {
    x: Math.min(1 - width, clamp01(layout?.x, fallback.x)),
    y: Math.min(1 - height, clamp01(layout?.y, fallback.y)),
    width,
    height
  };
}

function createWidgetId(toolId){
  return `${toolId}-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`;
}

function getNextWidgetZIndex(widgets = []){
  return (Array.isArray(widgets) ? widgets : []).reduce((max, widget, index) => (
    Math.max(max, Number(widget?.zIndex) || index + 1)
  ), 0) + 1;
}

function normalizeWidgetZIndex(widget, index = 0){
  return Math.max(1, Math.trunc(Number(widget?.zIndex) || index + 1));
}

function createWidget(toolId, { widgets = [] } = {}){
  const tool = getTeacherTool(toolId) || getTeacherTool("random-student") || listTeacherTools()[0] || null;
  const safeToolId = tool?.id || "random-student";
  return {
    id: createWidgetId(safeToolId),
    toolId: safeToolId,
    label: tool?.label || "Widget",
    icon: tool?.icon || "widgets",
    visible: true,
    locked: tool?.defaultLocked === true,
    viewMode: TEACHER_TOOL_VIEW_MODE_NORMAL,
    zIndex: getNextWidgetZIndex(widgets),
    layout: normalizeLayout(null, safeToolId),
    state: tool?.createInitialState?.() || {}
  };
}

function normalizeSceneMeta(sceneState = {}){
  const rawScene = sceneState?.scene && typeof sceneState.scene === "object" ? sceneState.scene : {};
  return normalizeSceneBackgroundState({
    ...sceneState,
    ...rawScene,
    locked: rawScene.locked === true || sceneState?.locked === true
  });
}

function isBackgroundWidget(widget = {}){
  return widget?.id === BACKGROUND_WIDGET_ID || widget?.toolId === "background";
}

function isSystemWidget(widget = {}){
  if (!widget) return false;
  return widget.systemWidget === true || isBackgroundWidget(widget) || getTeacherTool(widget.toolId)?.systemWidget === true;
}

function createBackgroundWidget(existing = null){
  const tool = getTeacherTool("background");
  return {
    id: BACKGROUND_WIDGET_ID,
    toolId: "background",
    label: tool?.label || "Arrière-plan",
    icon: tool?.icon || "wallpaper",
    visible: false,
    locked: true,
    systemWidget: true,
    viewMode: WIDGET_VIEW_MODE_NORMAL,
    zIndex: 0,
    layout: normalizeLayout(existing?.layout || { x: 0, y: 0, width: 0.01, height: 0.01 }, "background", existing?.state || {}),
    state: existing?.state && typeof existing.state === "object" ? cloneWidgetState(existing.state) : tool?.createInitialState?.() || {}
  };
}

function ensureSystemWidgets(rawState = {}){
  const widgets = Array.isArray(rawState?.widgets) ? rawState.widgets : [];
  const existingBackground = widgets.find(isBackgroundWidget) || null;
  const backgroundWidget = createBackgroundWidget(existingBackground);
  const regularWidgets = widgets.filter((widget) => !isBackgroundWidget(widget));
  const selectedWidgetId = String(rawState?.selectedWidgetId || "").trim();
  const selectedStillExists = selectedWidgetId === BACKGROUND_WIDGET_ID
    || regularWidgets.some((widget) => widget.id === selectedWidgetId);

  return {
    ...rawState,
    version: SCENE_VERSION,
    scene: normalizeSceneMeta(rawState),
    selectedWidgetId: selectedStillExists ? selectedWidgetId : BACKGROUND_WIDGET_ID,
    widgets: [...regularWidgets, backgroundWidget]
  };
}

function cloneWidgetState(rawState = {}){
  if (!rawState || typeof rawState !== "object") return {};
  try {
    if (typeof structuredClone === "function") return structuredClone(rawState);
  } catch {}
  return JSON.parse(JSON.stringify(rawState));
}

function cloneWidgetStateForTool(widget = {}){
  const tool = getTeacherTool(widget?.toolId);
  if (typeof tool?.cloneState === "function") {
    try {
      return tool.cloneState({ state: widget.state, widget });
    } catch {}
  }
  return cloneWidgetState(widget?.state);
}

function disposeWidgetState(widget = {}){
  const tool = getTeacherTool(widget?.toolId);
  if (typeof tool?.disposeState !== "function") return;
  try {
    tool.disposeState({ state: widget.state, widget });
  } catch {}
}

function cloneSceneState(sceneState, { getStudents, sceneAspectRatio = DEFAULT_SCENE_ASPECT_RATIO } = {}){
  const safeSceneState = ensureSystemWidgets(sceneState);
  const selectedWidget = safeSceneState.widgets.find((widget) => widget.id === safeSceneState.selectedWidgetId) || null;
  return {
    version: SCENE_VERSION,
    scene: normalizeSceneMeta(safeSceneState),
    selectedWidgetId: selectedWidget && !isSystemWidget(selectedWidget) ? selectedWidget.id : "",
    widgets: safeSceneState.widgets
      .filter((widget) => !isSystemWidget(widget))
      .map((widget, index) => {
        const { layer: _legacyLayer, systemWidget: _systemWidget, ...widgetWithoutLayer } = widget || {};
        const tool = getTeacherTool(widget?.toolId);
        const rawState = cloneWidgetState(widget?.state);
        const projectorState = tool?.createProjectorState?.({
          state: rawState,
          students: getStudents?.() || []
        }) || rawState;

        return {
          ...widgetWithoutLayer,
          locked: normalizeWidgetLocked(widget?.locked),
          viewMode: normalizeWidgetViewMode(widget?.viewMode),
          zIndex: normalizeWidgetZIndex(widget, index),
          layout: normalizeLayout(widget?.layout, widget?.toolId, projectorState, { sceneAspectRatio }),
          state: projectorState
        };
      })
  };
}

export function createTeacherToolsViewController({
  view,
  host,
  getCurrentTeacherSpace,
  getCurrentStudents,
  showToast
} = {}){
  const tools = listTeacherTools();
  let sceneState = ensureSystemWidgets({
    version: SCENE_VERSION,
    scene: {
      background: "white",
      locked: false
    },
    selectedWidgetId: BACKGROUND_WIDGET_ID,
    widgets: []
  });
  let channelId = createTeacherToolsChannelId();
  let channel = null;
  let channelTeacherSpaceId = "";
  let projectorWindow = null;
  let projectorSceneAspectRatio = DEFAULT_SCENE_ASPECT_RATIO;
  let activeControlSession = null;
  let widgetPickerOverlay = null;
  let draggedWidgetId = "";
  let widgetDropIndex = -1;
  let projectorStatus = {
    connected: false,
    lastSeenAt: 0
  };
  const scrollRestoreSelectors = Object.freeze([
    "[data-teacher-tool-panel]",
    ".tt-board-scene-pane .tt-board-pane-scroll",
    ".tt-view-scroll"
  ]);

  function captureScrollState(){
    return scrollRestoreSelectors
      .map((selector) => {
        const node = host?.querySelector?.(selector);
        if (!node) return null;
        return {
          selector,
          scrollTop: node.scrollTop,
          scrollLeft: node.scrollLeft
        };
      })
      .filter(Boolean);
  }

  function restoreScrollState(scrollState = []){
    scrollState.forEach((item) => {
      const node = host?.querySelector?.(item.selector);
      if (!node) return;
      node.scrollTop = item.scrollTop;
      node.scrollLeft = item.scrollLeft;
    });
  }

  function restoreScrollStateSoon(scrollState = []){
    if (!scrollState.length) return;
    restoreScrollState(scrollState);
    if (typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(() => restoreScrollState(scrollState));
  }

  function getTeacherSpaceId(){
    return String(getCurrentTeacherSpace?.()?.id || "").trim();
  }

  function getActiveSceneAspectRatio(){
    return projectorStatus.connected === true
      ? normalizeSceneAspectRatio(projectorSceneAspectRatio)
      : DEFAULT_SCENE_ASPECT_RATIO;
  }

  function updateProjectorSceneAspectRatioFromMessage(message = {}){
    projectorSceneAspectRatio = getSceneAspectRatioFromPayload(message, projectorSceneAspectRatio);
    return projectorSceneAspectRatio;
  }

  function getSelectedWidget(){
    const selectedWidgetId = String(sceneState.selectedWidgetId || "").trim();
    if (!selectedWidgetId) return null;
    return sceneState.widgets.find((widget) => widget.id === selectedWidgetId) || null;
  }

  function getWidgetsInStackOrder(){
    const entries = sceneState.widgets.map((widget, index) => ({ widget, index }));
    const systemEntries = entries.filter((entry) => isSystemWidget(entry.widget));
    const regularEntries = entries
      .filter((entry) => !isSystemWidget(entry.widget))
      .sort((a, b) => {
        const zDiff = (Number(b.widget.zIndex) || 0) - (Number(a.widget.zIndex) || 0);
        return zDiff || a.index - b.index;
      });
    return [...regularEntries, ...systemEntries].map((entry) => entry.widget);
  }

  function getWidgetViewMode(widgetId){
    const safeWidgetId = String(widgetId || "").trim();
    const widget = sceneState.widgets.find((item) => item.id === safeWidgetId) || null;
    return normalizeWidgetViewMode(widget?.viewMode);
  }


  function setWidgetViewMode(widgetId, mode, { sync = true, renderView = true } = {}){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) return;
    if (!sceneState.widgets.some((widget) => widget.id === safeWidgetId)) return;

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

    if (renderView) render();
    if (sync) sendToProjector("widget-view-mode", {
      widgetId: safeWidgetId,
      mode: safeMode
    });
  }


  function ensureSelection(){
    sceneState = ensureSystemWidgets(sceneState);
    if (getSelectedWidget()) return;
    sceneState.selectedWidgetId = BACKGROUND_WIDGET_ID;
  }

  function ensureChannel(){
    const teacherSpaceId = getTeacherSpaceId();
    if (!teacherSpaceId) return null;

    if (channel && channelTeacherSpaceId === teacherSpaceId) return channel;

    channel?.close?.();
    channelTeacherSpaceId = teacherSpaceId;
    channelId = createTeacherToolsChannelId();
    channel = createTeacherToolsChannel({
      teacherSpaceId,
      channelId,
      onMessage: (message) => {
        if (message?.type === "projector-ready") {
          updateProjectorSceneAspectRatioFromMessage(message);
          projectorStatus = {
            connected: true,
            lastSeenAt: Date.now()
          };
          renderProjectorStatusOnly();
          syncProjector();
          return;
        }
        if (message?.type === "projector-viewport") {
          updateProjectorSceneAspectRatioFromMessage(message);
          return;
        }
        if (message?.type === "projector-closed") {
          projectorStatus = {
            connected: false,
            lastSeenAt: Date.now()
          };
          projectorSceneAspectRatio = DEFAULT_SCENE_ASPECT_RATIO;
          renderProjectorStatusOnly();
          return;
        }
        if (message?.type === "request-status") {
          updateProjectorSceneAspectRatioFromMessage(message);
          syncProjector();
          return;
        }
        if (message?.type === "projector-widget-layout" || message?.type === "widget-layout") {
          updateProjectorSceneAspectRatioFromMessage(message);
          applyWidgetLayoutFromProjector(message.widgetId, message.layout, {
            sceneAspectRatio: projectorSceneAspectRatio
          });
          return;
        }
        if (message?.type === "widget-action") {
          applyWidgetActionFromProjector(message.widgetId, message.action, message.payload);
          return;
        }
        if (message?.type === "widget-meta") {
          applyWidgetMetaFromProjector(message.widgetId, message.patch);
          return;
        }
        if (message?.type === "remove-widget") {
          removeWidget(message.widgetId);
          return;
        }
        if (message?.type === "add-widget-from-projector") {
          updateProjectorSceneAspectRatioFromMessage(message);
          addWidgetFromProjector(message.widget, {
            sceneAspectRatio: projectorSceneAspectRatio
          });
          return;
        }
        if (message?.type === "widget-view-mode") {
          setWidgetViewMode(message.widgetId, message.mode, { sync: false });
          return;
        }
        if (message?.type === "widget-command") {
          applyWidgetCommandFromProjector(message.widgetId, message.command, message.payload);
          return;
        }
        if (message?.type === "scene-lock") {
          setSceneLocked(message.locked === true, { sync: false });
          return;
        }
        if (message?.type === "select-widget") {
          selectWidget(message.widgetId, { sync: false });
        }
      }
    });

    return channel;
  }

  function sendToProjector(type, payload = {}){
    const safeChannel = ensureChannel();
    if (!safeChannel) return false;
    safeChannel.send(type, payload);
    return true;
  }

  function syncProjector(){
    sendToProjector("scene-state", {
      scene: cloneSceneState(sceneState, {
        getStudents: () => getCurrentStudents?.() || [],
        sceneAspectRatio: getActiveSceneAspectRatio()
      })
    });
  }

  function openProjector(){
    const teacherSpaceId = getTeacherSpaceId();
    const safeChannel = ensureChannel();

    if (!teacherSpaceId) {
      showToast?.("Crée d’abord ton espace enseignant.", { isError: true });
      return null;
    }

    if (!safeChannel) {
      showToast?.("Le navigateur ne permet pas d’ouvrir le canal de projection.", { isError: true });
      return null;
    }

    const popupUrl = buildTeacherToolsProjectorUrl({
      teacherSpaceId,
      channelId
    });
    const popupFeatures = [
      "popup=yes",
      "width=1400",
      "height=900",
      "menubar=no",
      "toolbar=no",
      "location=no",
      "status=no",
      "resizable=yes",
      "scrollbars=no"
    ].join(",");

    projectorWindow = window.open(popupUrl, "teacherToolsProjector", popupFeatures);

    if (!projectorWindow) {
      showToast?.("La fenêtre de projection a été bloquée par le navigateur.", { isError: true });
      return null;
    }

    try {
      projectorWindow.focus();
    } catch {}

    window.setTimeout(syncProjector, 180);
    return projectorWindow;
  }

  function getWidgetById(widgetId){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) return null;
    return sceneState.widgets.find((widget) => widget.id === safeWidgetId) || null;
  }

  function updateWidget(widgetId, patch = {}, { renderPanel = true, sync = true } = {}){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) return;

    let didUpdate = false;
    sceneState = {
      ...sceneState,
      widgets: sceneState.widgets.map((widget, index) => {
        if (widget.id !== safeWidgetId) return widget;
        didUpdate = true;
        const nextToolId = patch.toolId || widget.toolId;
        const nextState = patch.state && typeof patch.state === "object" ? patch.state : widget.state;
        const { layer: _legacyWidgetLayer, ...widgetWithoutLayer } = widget;
        const { layer: _legacyPatchLayer, ...patchWithoutLayer } = patch;
        return {
          ...widgetWithoutLayer,
          ...patchWithoutLayer,
          locked: normalizeWidgetLocked(patch.locked ?? widget.locked),
          zIndex: Math.max(1, Math.trunc(Number(patch.zIndex ?? widget.zIndex) || index + 1)),
          layout: normalizeLayout(patch.layout || widget.layout, nextToolId, nextState, {
            sceneAspectRatio: getActiveSceneAspectRatio()
          }),
          state: nextState
        };
      })
    };

    if (!didUpdate) return;
    ensureSelection();
    if (renderPanel) render({ preserveScroll: true });
    if (sync) syncProjector();
  }

  function applyWidgetLayoutFromProjector(widgetId, layout, { sceneAspectRatio = getActiveSceneAspectRatio() } = {}){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) return;

    sceneState = {
      ...sceneState,
      widgets: sceneState.widgets.map((widget) => {
        if (widget.id !== safeWidgetId) return widget;
        return {
          ...widget,
          layout: normalizeLayout(layout, widget.toolId, widget.state, { sceneAspectRatio })
        };
      })
    };

    renderWidgetListOnly();
  }


  function applyWidgetMetaFromProjector(widgetId, patch = {}){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId || !patch || typeof patch !== "object") return;

    const safePatch = {};
    if (Object.prototype.hasOwnProperty.call(patch, "locked")) {
      safePatch.locked = normalizeWidgetLocked(patch.locked);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "zIndex")) {
      safePatch.zIndex = Math.max(1, Math.trunc(Number(patch.zIndex) || 1));
    }

    if (!Object.keys(safePatch).length) return;
    updateWidget(safeWidgetId, safePatch, { renderPanel: true, sync: true });
  }

  function applyWidgetActionFromProjector(widgetId, action, payload = {}){
    const widget = getWidgetById(widgetId);
    if (!widget) return;

    const tool = getTeacherTool(widget.toolId);
    if (typeof tool?.applyAction !== "function") return;

    const result = tool.applyAction({
      action: String(action || "").trim(),
      payload: payload && typeof payload === "object" ? payload : {},
      state: widget.state,
      widget,
      students: getCurrentStudents?.() || []
    });

    if (!result || typeof result !== "object") return;

    if (result.error) {
      showToast?.(String(result.error), { isError: true });
      return;
    }

    const patch = result.patch && typeof result.patch === "object" ? result.patch : null;
    if (patch) {
      sceneState = {
        ...sceneState,
        selectedWidgetId: widget.id
      };
      updateWidget(widget.id, patch, { renderPanel: true, sync: true });
    }

    if (result.message) {
      showToast?.(String(result.message), { isError: result.isError === true });
    }
  }

  function setBackground(backgroundPatch, { renderView = true } = {}){
    const currentScene = normalizeSceneMeta(sceneState);
    const patch = typeof backgroundPatch === "string"
      ? {
          backgroundMode: "preset",
          background: backgroundPatch,
          backgroundPreset: backgroundPatch
        }
      : (backgroundPatch && typeof backgroundPatch === "object" ? backgroundPatch : {});
    sceneState = {
      ...sceneState,
      scene: normalizeSceneMeta({
        ...currentScene,
        ...patch
      })
    };
    if (renderView) render({ preserveScroll: true });
    syncProjector();
  }

  function setSceneLocked(locked, { sync = true, renderView = true } = {}){
    const isLocked = locked === true;
    sceneState = {
      ...sceneState,
      scene: {
        ...normalizeSceneMeta(sceneState),
        locked: isLocked
      }
    };
    if (renderView) render();
    if (sync) sendToProjector("scene-lock", { locked: isLocked });
  }

  function toggleSceneLocked(){
    setSceneLocked(!normalizeSceneMeta(sceneState).locked);
  }

  function toggleWidgetLocked(widgetId){
    const widget = getWidgetById(widgetId);
    if (!widget || isSystemWidget(widget)) return;
    updateWidget(widget.id, { locked: !normalizeWidgetLocked(widget.locked) });
  }

  function toggleSelectedWidgetLocked(){
    const widget = getSelectedWidget();
    if (!widget) return;
    toggleWidgetLocked(widget.id);
  }

  function selectWidget(widgetId, { sync = true } = {}){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) {
      const hadSelection = Boolean(sceneState.selectedWidgetId);
      sceneState = {
        ...sceneState,
        selectedWidgetId: ""
      };
      render();
      if (sync && hadSelection) syncProjector();
      return;
    }

    if (!sceneState.widgets.some((widget) => widget.id === safeWidgetId)) return;
    sceneState = {
      ...sceneState,
      selectedWidgetId: safeWidgetId
    };
    render();
    if (sync) syncProjector();
  }

  function centerWidget(widgetId){
    const widget = getWidgetById(widgetId);
    if (!widget || isSystemWidget(widget)) return;
    sceneState = {
      ...sceneState,
      selectedWidgetId: widget.id
    };
    const layout = normalizeLayout(widget.layout, widget.toolId, widget.state, {
      sceneAspectRatio: getActiveSceneAspectRatio()
    });
    updateWidget(widget.id, {
      visible: true,
      layout: {
        ...layout,
        x: Math.max(0, (1 - layout.width) / 2),
        y: Math.max(0, (1 - layout.height) / 2)
      }
    });
  }

  function centerSelectedWidget(){
    const widget = getSelectedWidget();
    if (!widget) return;
    centerWidget(widget.id);
  }

  function duplicateWidget(widgetId){
    const widget = getWidgetById(widgetId);
    if (!widget || isSystemWidget(widget)) return;

    const clone = {
      ...widget,
      id: createWidgetId(widget.toolId),
      label: `${widget.label || "Widget"} copie`,
      zIndex: getNextWidgetZIndex(sceneState.widgets),
      layout: normalizeLayout({
        ...widget.layout,
        x: Math.min(WIDGET_LAYOUT_MAX_WIDTH - Number(widget.layout?.width || 0.34), Number(widget.layout?.x || 0) + 0.04),
        y: Math.min(WIDGET_LAYOUT_MAX_HEIGHT - Number(widget.layout?.height || 0.24), Number(widget.layout?.y || 0) + 0.04)
      }, widget.toolId, widget.state, {
        sceneAspectRatio: getActiveSceneAspectRatio()
      }),
      state: cloneWidgetStateForTool(widget)
    };

    sceneState = {
      ...sceneState,
      selectedWidgetId: clone.id,
      widgets: [...sceneState.widgets, clone]
    };
    render();
    syncProjector();
  }

  function duplicateSelectedWidget(){
    const widget = getSelectedWidget();
    if (!widget) return;
    duplicateWidget(widget.id);
  }

  function bringWidgetToFront(widgetId){
    const widget = getWidgetById(widgetId);
    if (!widget || isSystemWidget(widget)) return;
    sceneState = {
      ...sceneState,
      selectedWidgetId: widget.id
    };
    moveWidgetToStackIndex(widget.id, 0);
  }

  function bringSelectedWidgetToFront(){
    const widget = getSelectedWidget();
    if (!widget) return;
    bringWidgetToFront(widget.id);
  }

  function sendWidgetToBack(widgetId){
    const widget = getWidgetById(widgetId);
    if (!widget || isSystemWidget(widget)) return;
    sceneState = {
      ...sceneState,
      selectedWidgetId: widget.id
    };
    moveWidgetToStackIndex(widget.id, sceneState.widgets.length - 1);
  }

  function sendSelectedWidgetToBack(){
    const widget = getSelectedWidget();
    if (!widget) return;
    sendWidgetToBack(widget.id);
  }

  function applyWidgetCommandFromProjector(widgetId, command, payload = {}){
    const widget = getWidgetById(widgetId);
    if (!widget) return;
    const safeCommand = String(command || "").trim();
    if (safeCommand === "center-widget") {
      centerWidget(widget.id);
      return;
    }
    if (safeCommand === "duplicate-widget") {
      duplicateWidget(widget.id);
      return;
    }
    if (safeCommand === "bring-front") {
      bringWidgetToFront(widget.id);
      return;
    }
    if (safeCommand === "send-back") {
      sendWidgetToBack(widget.id);
    }
  }

  function moveWidgetToStackIndex(widgetId, dropIndex){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) return;

    const draggedWidget = getWidgetById(safeWidgetId);
    if (!draggedWidget || isSystemWidget(draggedWidget)) return;

    const currentStack = getWidgetsInStackOrder().filter((widget) => !isSystemWidget(widget));
    if (!currentStack.some((widget) => widget.id === safeWidgetId)) return;

    const remainingStack = currentStack.filter((widget) => widget.id !== safeWidgetId);
    const safeDropIndex = Math.max(0, Math.min(Math.trunc(Number(dropIndex) || 0), remainingStack.length));
    const nextStack = [
      ...remainingStack.slice(0, safeDropIndex),
      currentStack.find((widget) => widget.id === safeWidgetId),
      ...remainingStack.slice(safeDropIndex)
    ].filter(Boolean);

    const nextZIndexById = new Map();
    const stackLength = nextStack.length;
    nextStack.forEach((widget, index) => {
      nextZIndexById.set(widget.id, stackLength - index);
    });

    let didChange = false;
    sceneState = {
      ...sceneState,
      widgets: sceneState.widgets.map((widget) => {
        const nextZIndex = nextZIndexById.get(widget.id) || widget.zIndex;
        if (Number(widget.zIndex) === nextZIndex) return widget;
        didChange = true;
        return {
          ...widget,
          zIndex: nextZIndex
        };
      })
    };

    if (!didChange) return;
    render();
    syncProjector();
  }

  function toggleSelectedWidgetCollapse(){
    const widget = getSelectedWidget();
    if (!widget) return;
    const mode = getWidgetViewMode(widget.id);
    setWidgetViewMode(widget.id, mode === WIDGET_VIEW_MODE_COLLAPSED
      ? WIDGET_VIEW_MODE_NORMAL
      : WIDGET_VIEW_MODE_COLLAPSED);
  }

  function toggleSelectedWidgetStageMode(){
    const widget = getSelectedWidget();
    if (!widget) return;
    const mode = getWidgetViewMode(widget.id);
    setWidgetViewMode(widget.id, mode === WIDGET_VIEW_MODE_STAGE
      ? WIDGET_VIEW_MODE_NORMAL
      : WIDGET_VIEW_MODE_STAGE);
  }

  function removeWidget(widgetId){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) return;
    const removedWidget = sceneState.widgets.find((widget) => widget.id === safeWidgetId) || null;
    if (!removedWidget) return;
    if (isSystemWidget(removedWidget)) {
      showToast?.("L’arrière-plan ne peut pas être retiré.", { isError: true });
      return;
    }
    disposeWidgetState(removedWidget);

    sceneState = {
      ...sceneState,
      widgets: sceneState.widgets.filter((widget) => widget.id !== safeWidgetId)
    };
    ensureSelection();
    render();
    syncProjector();
  }

  function removeSelectedWidget(){
    const widget = getSelectedWidget();
    if (!widget) return;
    removeWidget(widget.id);
  }

  function renderAddWidgetButton(){
    return `
      <button
        id="ttOpenWidgetPicker"
        class="tt-add-widget-btn"
        type="button"
        aria-haspopup="dialog"
      >
        <span class="dashboard-material-icon" aria-hidden="true">add</span>
        <span>Ajouter widget</span>
      </button>
    `;
  }

  function renderWidgetPickerItems(){
    if (!tools.length) {
      return `<div class="tt-widget-picker-empty">Aucun widget disponible.</div>`;
    }

    return tools.map((tool) => `
      <button class="tt-widget-picker-option" type="button" data-teacher-tool-pick="${escapeAttr(tool.id)}">
        <span class="dashboard-material-icon tt-widget-picker-icon" aria-hidden="true">${escapeHtml(tool.icon || "widgets")}</span>
        <span class="tt-widget-picker-copy">
          <strong>${escapeHtml(tool.label || "Widget")}</strong>
          <small>${escapeHtml(tool.description || "Widget de tableau interactif.")}</small>
        </span>
      </button>
    `).join("");
  }

  function closeWidgetPickerOverlay({ restoreFocusTo = null } = {}){
    const overlay = widgetPickerOverlay;
    widgetPickerOverlay = null;
    overlay?.remove?.();

    if (restoreFocusTo?.isConnected) {
      restoreFocusTo.focus?.();
    }
  }

  function openWidgetPickerOverlay(){
    if (widgetPickerOverlay?.isConnected) {
      widgetPickerOverlay.querySelector("[data-teacher-tool-pick], [data-widget-picker-close]")?.focus?.();
      return;
    }

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overlay = document.createElement("div");
    overlay.className = "modal tt-widget-picker-modal";
    overlay.setAttribute("role", "presentation");
    overlay.innerHTML = `
      <div class="modal-content modal-content-wide tt-widget-picker-card" role="dialog" aria-modal="true" aria-labelledby="ttWidgetPickerTitle">
        <div class="tt-widget-picker-head">
          <div id="ttWidgetPickerTitle" class="modal-title">Ajouter un widget</div>
          <button class="dashboard-icon-btn dashboard-material-icon-btn tt-widget-picker-close" type="button" data-widget-picker-close aria-label="Fermer">
            <span class="dashboard-material-icon" aria-hidden="true">close</span>
          </button>
        </div>

        <div class="tt-widget-picker-grid">
          ${renderWidgetPickerItems()}
        </div>
      </div>
    `;

    widgetPickerOverlay = overlay;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", (event) => {
      const target = event.target;
      if (target === overlay || target?.closest?.("[data-widget-picker-close]")) {
        closeWidgetPickerOverlay({ restoreFocusTo: opener });
      }
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeWidgetPickerOverlay({ restoreFocusTo: opener });
      }
    });

    overlay.querySelectorAll("[data-teacher-tool-pick]").forEach((button) => {
      button.addEventListener("click", () => {
        const toolId = button.dataset.teacherToolPick;
        closeWidgetPickerOverlay();
        addWidget(toolId);
      });
    });

    overlay.querySelector("[data-teacher-tool-pick], [data-widget-picker-close]")?.focus?.();
  }

  function renderWidgetList(){
    sceneState = ensureSystemWidgets(sceneState);
    return getWidgetsInStackOrder().map((widget) => {
      const tool = getTeacherTool(widget.toolId);
      const isSelected = widget.id === sceneState.selectedWidgetId;
      const isLocked = normalizeWidgetLocked(widget.locked);
      const isSystem = isSystemWidget(widget);

      if (isSystem) {
        return `
          <div class="tt-widget-row is-system${isSelected ? " is-selected" : ""}" data-widget-row="${escapeAttr(widget.id)}" draggable="false">
            <button class="tt-widget-select" type="button" data-widget-select="${escapeAttr(widget.id)}" draggable="false">
              <span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(widget.icon || tool?.icon || "wallpaper")}</span>
              <span class="tt-widget-row-main">
                <strong>${escapeHtml(widget.label || tool?.label || "Arrière-plan")}</strong>
              </span>
            </button>
          </div>
        `;
      }

      return `
        <div class="tt-widget-row${isSelected ? " is-selected" : ""}${isLocked ? " is-locked" : ""}" data-widget-row="${escapeAttr(widget.id)}" draggable="true">
          <button class="tt-widget-select" type="button" data-widget-select="${escapeAttr(widget.id)}" draggable="false">
            <span class="dashboard-material-icon" aria-hidden="true">${escapeHtml(widget.icon || tool?.icon || "widgets")}</span>
            <span class="tt-widget-row-main">
              <strong>${escapeHtml(widget.label || tool?.label || "Widget")}</strong>
              ${isLocked ? `<small>Verrouillé</small>` : ""}
            </span>
          </button>
          <button class="tt-widget-row-icon-btn ${isLocked ? "is-locked" : ""}" type="button" data-widget-lock="${escapeAttr(widget.id)}" title="${isLocked ? "Déverrouiller ce widget" : "Verrouiller ce widget"}" aria-label="${isLocked ? "Déverrouiller ce widget" : "Verrouiller ce widget"}" aria-pressed="${isLocked ? "true" : "false"}" draggable="false">
            <span class="dashboard-material-icon" aria-hidden="true">${isLocked ? "lock" : "lock_open"}</span>
          </button>
          <button class="tt-widget-row-icon-btn" type="button" data-widget-remove="${escapeAttr(widget.id)}" title="Retirer ce widget" aria-label="Retirer ce widget" draggable="false">
            <span class="dashboard-material-icon" aria-hidden="true">delete</span>
          </button>
          <label class="tt-widget-toggle" title="Afficher ou masquer dans la projection" draggable="false">
            <input type="checkbox" data-widget-visible="${escapeAttr(widget.id)}" ${widget.visible ? "checked" : ""} draggable="false">
            <span aria-hidden="true"></span>
          </label>
        </div>
      `;
    }).join("");
  }

  function renderWidgetListOnly(){
    const listHost = host?.querySelector("[data-widget-list]");
    if (!listHost) return;
    listHost.innerHTML = renderWidgetList();
    bindWidgetListEvents(listHost);
  }

  function clearWidgetDropIndicator(listRoot = null){
    const root = listRoot || host?.querySelector("[data-widget-list]");
    root?.querySelector(".tt-widget-drop-indicator")?.remove();
    root?.querySelectorAll(".tt-widget-row.is-dragging").forEach((row) => {
      row.classList.remove("is-dragging");
    });
    widgetDropIndex = -1;
  }

  function getWidgetDropIndexFromEvent(listRoot, event){
    const rows = Array.from(listRoot?.querySelectorAll(".tt-widget-row[data-widget-row]") || [])
      .filter((row) => row.dataset.widgetRow !== draggedWidgetId)
      .filter((row) => !isSystemWidget(getWidgetById(row.dataset.widgetRow)));
    if (!rows.length) return 0;

    const pointerY = Number(event.clientY) || 0;
    for (let index = 0; index < rows.length; index += 1) {
      const rect = rows[index].getBoundingClientRect();
      if (pointerY < rect.top + rect.height / 2) return index;
    }
    return rows.length;
  }

  function renderWidgetDropIndicator(listRoot, dropIndex){
    if (!listRoot) return;
    listRoot.querySelector(".tt-widget-drop-indicator")?.remove();

    const indicator = document.createElement("div");
    indicator.className = "tt-widget-drop-indicator";
    indicator.setAttribute("aria-hidden", "true");

    const rows = Array.from(listRoot.querySelectorAll(".tt-widget-row[data-widget-row]"))
      .filter((row) => row.dataset.widgetRow !== draggedWidgetId)
      .filter((row) => !isSystemWidget(getWidgetById(row.dataset.widgetRow)));
    const targetRow = rows[Math.max(0, Math.min(dropIndex, rows.length))] || null;
    if (targetRow) {
      listRoot.insertBefore(indicator, targetRow);
      return;
    }
    const firstSystemRow = Array.from(listRoot.querySelectorAll(".tt-widget-row[data-widget-row]"))
      .find((row) => isSystemWidget(getWidgetById(row.dataset.widgetRow))) || null;
    if (firstSystemRow) {
      listRoot.insertBefore(indicator, firstSystemRow);
      return;
    }
    listRoot.append(indicator);
  }

  function findWidgetRow(listRoot, widgetId){
    const safeWidgetId = String(widgetId || "").trim();
    if (!safeWidgetId) return null;
    return Array.from(listRoot?.querySelectorAll(".tt-widget-row[data-widget-row]") || [])
      .find((row) => row.dataset.widgetRow === safeWidgetId) || null;
  }

  function handleWidgetDragStart(event){
    const row = event.currentTarget;
    const widgetId = String(row?.dataset?.widgetRow || "").trim();
    if (!widgetId || isSystemWidget(getWidgetById(widgetId))) {
      event.preventDefault();
      return;
    }

    draggedWidgetId = widgetId;
    row.classList.add("is-dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", widgetId);
    }
  }

  function handleWidgetDragOver(event){
    if (!draggedWidgetId) return;
    const listRoot = event.currentTarget;
    const dropIndex = getWidgetDropIndexFromEvent(listRoot, event);
    event.preventDefault();
    widgetDropIndex = dropIndex;
    renderWidgetDropIndicator(listRoot, dropIndex);
    findWidgetRow(listRoot, draggedWidgetId)?.classList.add("is-dragging");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  }

  function handleWidgetDrop(event){
    if (!draggedWidgetId) return;
    const listRoot = event.currentTarget;
    const dropIndex = widgetDropIndex >= 0
      ? widgetDropIndex
      : getWidgetDropIndexFromEvent(listRoot, event);
    const widgetId = draggedWidgetId;
    event.preventDefault();
    draggedWidgetId = "";
    clearWidgetDropIndicator(listRoot);
    moveWidgetToStackIndex(widgetId, dropIndex);
  }

  function handleWidgetDragEnd(event){
    const listRoot = event.currentTarget?.closest?.("[data-widget-list]") || host?.querySelector("[data-widget-list]");
    draggedWidgetId = "";
    clearWidgetDropIndicator(listRoot);
  }

  function handleWidgetDragLeave(event){
    const listRoot = event.currentTarget;
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && listRoot.contains(relatedTarget)) return;
    clearWidgetDropIndicator(listRoot);
  }

  function bindWidgetListEvents(root = host){
    root?.querySelectorAll("[data-widget-select]").forEach((button) => {
      button.addEventListener("click", () => {
        selectWidget(button.dataset.widgetSelect);
      });
    });

    root?.querySelectorAll("[data-widget-visible]").forEach((input) => {
      input.addEventListener("change", () => {
        updateWidget(input.dataset.widgetVisible, { visible: input.checked === true });
      });
    });

    root?.querySelectorAll("[data-widget-lock]").forEach((button) => {
      button.addEventListener("click", () => {
        toggleWidgetLocked(button.dataset.widgetLock);
      });
    });

    root?.querySelectorAll("[data-widget-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        removeWidget(button.dataset.widgetRemove);
      });
    });

    root?.querySelectorAll("[data-widget-row]").forEach((row) => {
      if (isSystemWidget(getWidgetById(row.dataset.widgetRow))) return;
      row.addEventListener("dragstart", handleWidgetDragStart);
      row.addEventListener("dragend", handleWidgetDragEnd);
    });

    const listRoot = root?.matches?.("[data-widget-list]")
      ? root
      : root?.querySelector?.("[data-widget-list]");
    if (listRoot && !listRoot.dataset.widgetDndBound) {
      listRoot.dataset.widgetDndBound = "true";
      listRoot.addEventListener("dragover", handleWidgetDragOver);
      listRoot.addEventListener("drop", handleWidgetDrop);
      listRoot.addEventListener("dragleave", handleWidgetDragLeave);
    }
  }

  function addWidget(toolId){
    const tool = getTeacherTool(toolId);
    if (!tool || tool.systemWidget === true) return;

    const widget = createWidget(tool.id, { widgets: sceneState.widgets });
    sceneState = {
      ...sceneState,
      selectedWidgetId: widget.id,
      widgets: [...sceneState.widgets, widget]
    };
    render();
    syncProjector();
  }
  function addWidgetFromProjector(rawWidget = {}, { sceneAspectRatio = getActiveSceneAspectRatio() } = {}){
    const tool = getTeacherTool(rawWidget?.toolId);
    const widgetId = String(rawWidget?.id || "").trim();
    if (!tool || !widgetId || tool.systemWidget === true) return;

    const widget = {
      id: widgetId,
      toolId: tool.id,
      label: String(rawWidget.label || tool.label || "Widget"),
      icon: String(rawWidget.icon || tool.icon || "widgets"),
      visible: rawWidget.visible !== false,
      locked: normalizeWidgetLocked(rawWidget.locked),
      viewMode: normalizeWidgetViewMode(rawWidget.viewMode),
      zIndex: Math.max(1, Math.trunc(Number(rawWidget.zIndex) || getNextWidgetZIndex(sceneState.widgets))),
      layout: normalizeLayout(rawWidget.layout, tool.id, rawWidget.state || {}, { sceneAspectRatio }),
      state: rawWidget.state && typeof rawWidget.state === "object" ? cloneWidgetState(rawWidget.state) : tool.createInitialState?.() || {}
    };

    sceneState = {
      ...sceneState,
      selectedWidgetId: widget.id,
      widgets: [
        ...sceneState.widgets.filter((item) => item.id !== widget.id),
        widget
      ]
    };
    render();
    syncProjector();
  }


  function renderActiveControlPanel(){
    const panelHost = host?.querySelector("[data-teacher-tool-panel]");
    if (!panelHost) return;

    activeControlSession?.destroy?.();
    activeControlSession = null;

    ensureSelection();
    const selectedWidget = getSelectedWidget();
    if (!selectedWidget) {
      panelHost.innerHTML = `<div class="dashboard-activity-empty-state">Sélectionne ou ajoute un widget.</div>`;
      return;
    }

    const tool = getTeacherTool(selectedWidget.toolId);
    if (!tool) {
      panelHost.innerHTML = `<div class="dashboard-activity-empty-state is-error">Widget introuvable.</div>`;
      return;
    }

    panelHost.innerHTML = `
      <div class="tt-selected-widget-shell">
        <section class="tt-widget-control-section" data-teacher-tool-control-slot aria-label="Contrôles du widget sélectionné"></section>
      </div>
    `;

    const toolPanelHost = panelHost.querySelector("[data-teacher-tool-control-slot]") || panelHost;

    activeControlSession = tool.createControlPanel?.({
      host: toolPanelHost,
      getWidget: () => getSelectedWidget(),
      updateWidget: (patch = {}, options = {}) => updateWidget(selectedWidget.id, patch, options),
      getStudents: () => getCurrentStudents?.() || [],
      sendToProjector,
      syncProjector,
      openProjector,
      showToast,
      sceneBackgrounds: SCENE_BACKGROUNDS,
      getSceneBackground: () => normalizeSceneMeta(sceneState),
      setSceneBackground: (background, options = {}) => setBackground(background, options),
      sceneState: cloneSceneState(sceneState, {
        getStudents: () => getCurrentStudents?.() || []
      })
    }) || null;
  }

  function renderProjectorStatus(){
    const isConnected = projectorStatus.connected === true;
    return `
      <div class="tt-projector-status ${isConnected ? "is-connected" : ""}" data-projector-status>
        <span class="dashboard-material-icon" aria-hidden="true">${isConnected ? "cast_connected" : "cast"}</span>
        <span>${isConnected ? "Projection connectée" : "Projection non connectée"}</span>
      </div>
    `;
  }

  function renderProjectorStatusOnly(){
    const node = host?.querySelector("[data-projector-status]");
    if (!node) return;
    const wrapper = document.createElement("div");
    wrapper.innerHTML = renderProjectorStatus().trim();
    node.replaceWith(wrapper.firstElementChild);
  }

  function render({ preserveScroll = false } = {}){
    if (!host) return;
    const scrollState = preserveScroll ? captureScrollState() : [];
    sceneState = ensureSystemWidgets(sceneState);
    ensureSelection();
    const selectedWidget = getSelectedWidget();
    const selectedWidgetViewMode = selectedWidget
      ? getWidgetViewMode(selectedWidget.id)
      : WIDGET_VIEW_MODE_NORMAL;
    const selectedWidgetTool = selectedWidget ? getTeacherTool(selectedWidget.toolId) : null;
    const selectedWidgetInteraction = selectedWidgetTool?.interaction || {};
    const selectedWidgetIsSystem = selectedWidget ? isSystemWidget(selectedWidget) : false;
    const canSelectedWidgetCollapse = selectedWidget && !selectedWidgetIsSystem && selectedWidgetInteraction.canCollapse !== false;
    const canSelectedWidgetStage = selectedWidget && !selectedWidgetIsSystem && selectedWidgetInteraction.canStage !== false;
    const canSelectedWidgetCenter = selectedWidget && !selectedWidgetIsSystem && selectedWidgetInteraction.moveMode !== "none";
    const canMutateSelectedWidget = selectedWidget && !selectedWidgetIsSystem;
    const isSelectedWidgetCollapsed = selectedWidgetViewMode === WIDGET_VIEW_MODE_COLLAPSED;
    const isSelectedWidgetStageMode = selectedWidgetViewMode === WIDGET_VIEW_MODE_STAGE;
    const isSelectedWidgetLocked = selectedWidget ? normalizeWidgetLocked(selectedWidget.locked) : false;
    const isSceneLocked = normalizeSceneMeta(sceneState).locked;

    host.innerHTML = `
      <div class="dashboard-config-header tt-header">
        <div class="dashboard-config-header-main tt-header-main">
          <div class="dashboard-section-title">Tableau interactif</div>
        </div>

        <div class="dashboard-config-header-center tt-header-center">
          ${renderProjectorStatus()}
        </div>

        <div class="dashboard-config-header-actions tt-header-actions">
          <button id="btnTeacherToolsOpenProjector" class="btn primary" type="button">
            <span class="dashboard-material-icon" aria-hidden="true">open_in_new</span>
            <span>Ouvrir la projection</span>
          </button>
          <button id="btnTeacherToolsToggleSceneLock" class="btn tt-header-action-btn ${isSceneLocked ? "is-locked" : ""}" type="button" title="${isSceneLocked ? "Déverrouiller la scène" : "Verrouiller la scène"}" aria-label="${isSceneLocked ? "Déverrouiller la scène" : "Verrouiller la scène"}" aria-pressed="${isSceneLocked ? "true" : "false"}">
            <span class="dashboard-material-icon" aria-hidden="true">${isSceneLocked ? "lock" : "lock_open"}</span>
            <span>${isSceneLocked ? "Déverrouiller" : "Verrouiller"}</span>
          </button>
        </div>
      </div>

      <div class="dashboard-content-scroll dashboard-explorer-host tt-view-scroll">
        <div class="dashboard-activities-explorer tt-board-explorer">
          <section class="dashboard-activity-tree-pane panel tt-board-pane tt-board-scene-pane" aria-label="Widgets de la scène">
            ${renderAddWidgetButton()}

            <div class="tt-board-pane-scroll">
              <div class="tt-widget-list tt-widget-list-board" data-widget-list>
                ${renderWidgetList()}
              </div>
            </div>
          </section>

          <div class="dashboard-activity-splitter" role="separator" aria-orientation="vertical" aria-label="Séparateur entre les panneaux"></div>

          <section class="dashboard-activity-tiles-pane panel tt-board-pane tt-board-control-pane" aria-label="Contrôle des widgets">
            <div class="tt-board-pane-header">
              <div class="tt-board-pane-title">
                <span class="dashboard-material-icon" aria-hidden="true">tune</span>
                <span>Contrôles</span>
              </div>
              <div class="tt-board-header-right">
                <div class="tt-board-actions">
                  <button id="ttToggleWidgetLock" class="tt-board-action-btn ${isSelectedWidgetLocked ? "is-locked" : ""}" type="button" title="${isSelectedWidgetLocked ? "Déverrouiller le widget" : "Verrouiller le widget"}" aria-label="${isSelectedWidgetLocked ? "Déverrouiller le widget" : "Verrouiller le widget"}" aria-pressed="${isSelectedWidgetLocked ? "true" : "false"}" ${canMutateSelectedWidget ? "" : "disabled"}>
                    <span class="dashboard-material-icon" aria-hidden="true">${isSelectedWidgetLocked ? "lock" : "lock_open"}</span>
                    <span>${isSelectedWidgetLocked ? "Déverrouiller" : "Verrouiller"}</span>
                  </button>
                  <button id="ttToggleWidgetCollapse" class="tt-board-action-btn" type="button" ${canSelectedWidgetCollapse ? "" : "disabled"}>
                    <span class="dashboard-material-icon" aria-hidden="true">${isSelectedWidgetCollapsed ? "expand_more" : "expand_less"}</span>
                    <span>${isSelectedWidgetCollapsed ? "Déployer" : "Replier"}</span>
                  </button>
                  <button id="ttToggleWidgetStageMode" class="tt-board-action-btn" type="button" ${canSelectedWidgetStage ? "" : "disabled"}>
                    <span class="dashboard-material-icon" aria-hidden="true">${isSelectedWidgetStageMode ? "fullscreen_exit" : "fullscreen"}</span>
                    <span>${isSelectedWidgetStageMode ? "Taille normale" : "Scène complète"}</span>
                  </button>
                  <button id="ttCenterWidget" class="tt-board-action-btn" type="button" title="Centrer le widget" aria-label="Centrer le widget" ${canSelectedWidgetCenter ? "" : "disabled"}>
                    <span class="dashboard-material-icon" aria-hidden="true">filter_center_focus</span>
                    <span>Centrer</span>
                  </button>
                  <button id="ttDuplicateWidget" class="tt-board-action-btn" type="button" title="Dupliquer le widget" aria-label="Dupliquer le widget" ${canMutateSelectedWidget ? "" : "disabled"}>
                    <span class="dashboard-material-icon" aria-hidden="true">content_copy</span>
                    <span>Dupliquer</span>
                  </button>
                  <button id="ttBringWidgetFront" class="tt-board-action-btn" type="button" title="Mettre le widget devant" aria-label="Mettre le widget devant" ${canMutateSelectedWidget ? "" : "disabled"}>
                    <span class="dashboard-material-icon" aria-hidden="true">flip_to_front</span>
                    <span>Devant</span>
                  </button>
                  <button id="ttSendWidgetBack" class="tt-board-action-btn" type="button" title="Mettre le widget derrière" aria-label="Mettre le widget derrière" ${canMutateSelectedWidget ? "" : "disabled"}>
                    <span class="dashboard-material-icon" aria-hidden="true">flip_to_back</span>
                    <span>Derrière</span>
                  </button>
                  <button id="ttRemoveWidget" class="tt-board-action-btn is-danger" type="button" title="Retirer le widget" aria-label="Retirer le widget" ${canMutateSelectedWidget ? "" : "disabled"}>
                    <span class="dashboard-material-icon" aria-hidden="true">delete</span>
                    <span>Retirer</span>
                  </button>
                </div>
              </div>
            </div>

            <main class="tt-tool-panel-host tt-board-pane-scroll" data-teacher-tool-panel>
              <div class="dashboard-activity-empty-state">Chargement du widget…</div>
            </main>
          </section>
        </div>
      </div>
    `;

    host.querySelector("#btnTeacherToolsOpenProjector")?.addEventListener("click", openProjector);
    host.querySelector("#btnTeacherToolsToggleSceneLock")?.addEventListener("click", toggleSceneLocked);
    host.querySelector("#ttOpenWidgetPicker")?.addEventListener("click", openWidgetPickerOverlay);
    host.querySelector("#ttToggleWidgetLock")?.addEventListener("click", toggleSelectedWidgetLocked);
    host.querySelector("#ttToggleWidgetCollapse")?.addEventListener("click", toggleSelectedWidgetCollapse);
    host.querySelector("#ttToggleWidgetStageMode")?.addEventListener("click", toggleSelectedWidgetStageMode);
    host.querySelector("#ttCenterWidget")?.addEventListener("click", centerSelectedWidget);
    host.querySelector("#ttDuplicateWidget")?.addEventListener("click", duplicateSelectedWidget);
    host.querySelector("#ttBringWidgetFront")?.addEventListener("click", bringSelectedWidgetToFront);
    host.querySelector("#ttSendWidgetBack")?.addEventListener("click", sendSelectedWidgetToBack);
    host.querySelector("#ttRemoveWidget")?.addEventListener("click", removeSelectedWidget);

    bindWidgetListEvents(host);
    renderActiveControlPanel();
    restoreScrollStateSoon(scrollState);
  }

  return {
    render,
    refresh(){
      const scrollState = captureScrollState();
      activeControlSession?.render?.();
      restoreScrollStateSoon(scrollState);
      syncProjector();
    },
    destroy(){
      activeControlSession?.destroy?.();
      activeControlSession = null;
      closeWidgetPickerOverlay();
        channel?.close?.();
      channel = null;
      if (view) view.innerHTML = "";
    }
  };
}
