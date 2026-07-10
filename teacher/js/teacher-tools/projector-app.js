import { createTeacherToolsChannel } from "./channel.js";
import { getTeacherTool } from "./registry.js";
import {
  EDITABLE_BACKGROUND_RENDER_BASE_SCALE,
  getBackgroundImageDisplayCss,
  getSceneBackgroundImagePresetSource,
  normalizeSceneBackgroundState
} from "./widgets/background/tool.js";
import { normalizeGeometryInstrumentsState } from "./widgets/geometry-instruments/model.js";
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
import {
  createColorPicker,
  normalizeColorPickerValue
} from "../../../shared/color-picker.js";
import { startMaterialIconHydration } from "../../../shared/material-icons-svg.js";

startMaterialIconHydration();

const params = new URLSearchParams(window.location.search);
const teacherSpaceId = String(params.get("space") || "").trim();
const channelId = String(params.get("channel") || "").trim();

const viewport = document.getElementById("teacherToolsProjectorViewport");
const fitHost = document.getElementById("teacherToolsProjectorFitHost");
const stage = document.getElementById("teacherToolsProjectorStage");
const starfieldHost = document.getElementById("teacherToolsProjectorStarfield");
const snapGrid = document.getElementById("teacherToolsSnapGrid");
const widgetHost = document.getElementById("teacherToolsWidgetHost");
const topbar = document.getElementById("teacherToolsTopbar");
const widgetbar = document.getElementById("teacherToolsWidgetbar");
const widgetbarContent = document.getElementById("teacherToolsWidgetbarContent");
const trashZone = document.getElementById("teacherToolsTrashZone");
const btnFullscreen = document.getElementById("btnTeacherToolsFullscreen");
const btnSceneLock = document.getElementById("btnTeacherToolsSceneLock");
const gridControl = document.getElementById("teacherToolsGridControl");
const btnGrid = document.getElementById("btnTeacherToolsGrid");
const gridPopover = document.getElementById("teacherToolsGridPopover");
const gridScaleRange = document.getElementById("teacherToolsGridScaleRange");
const gridScaleValue = document.getElementById("teacherToolsGridScaleValue");
const btnClose = document.getElementById("btnTeacherToolsClose");
const btnTopbarToggle = document.getElementById("btnTeacherToolsTopbarToggle");
const btnWidgetbarToggle = document.getElementById("btnTeacherToolsWidgetbarToggle");
const drawbar = document.getElementById("teacherToolsDrawbar");
const drawingCapture = document.getElementById("teacherToolsDrawingCapture");
const btnDrawSelect = document.getElementById("btnTeacherToolsDrawSelect");
const btnDrawPencil = document.getElementById("btnTeacherToolsDrawPencil");
const btnDrawHighlighter = document.getElementById("btnTeacherToolsDrawHighlighter");
const btnDrawLine = document.getElementById("btnTeacherToolsDrawLine");
const btnDrawRectGroup = document.getElementById("btnTeacherToolsDrawRectGroup");
const btnDrawTriangleGroup = document.getElementById("btnTeacherToolsDrawTriangleGroup");
const btnDrawRoundGroup = document.getElementById("btnTeacherToolsDrawRoundGroup");
const btnDrawbarToggle = document.getElementById("btnTeacherToolsDrawbarToggle");
const drawColorPickerHost = document.getElementById("teacherToolsDrawColorPicker");
const drawFillColorPickerHost = document.getElementById("teacherToolsDrawFillColorPicker");
const drawWidthControl = document.getElementById("teacherToolsDrawWidthControl");
const btnDrawWidth = document.getElementById("btnTeacherToolsDrawWidth");
const drawWidthPopover = document.getElementById("teacherToolsDrawWidthPopover");
const drawWidthRange = document.getElementById("teacherToolsDrawWidthRange");
const drawWidthValue = document.getElementById("teacherToolsDrawWidthValue");

const BASE_SCENE_WIDTH = 1920;
const BASE_SCENE_HEIGHT = 1080;
const DEFAULT_SCENE_ASPECT_RATIO = BASE_SCENE_WIDTH / BASE_SCENE_HEIGHT;
const SVG_NS = "http://www.w3.org/2000/svg";
const DRAG_START_THRESHOLD_PX = 5;
const DRAW_SHAPE_START_THRESHOLD_PX = 5;
const WIDGET_CHROME_DOUBLE_TAP_MS = 380;
const WIDGET_CHROME_DOUBLE_TAP_DISTANCE_PX = 32;
const DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX = 1;
const SNAP_GRID_DEFAULT_SIZE = 48;
const SNAP_GRID_MIN_SIZE = 20;
const SNAP_GRID_MAX_SIZE = 120;
const SNAP_GRID_STEP = 1;
const SNAP_GRID_VISIBLE_MS = 2000;
const GEOMETRY_EDGE_SNAP_TOLERANCE_SCREEN_PX = 30;
const GEOMETRY_RULER_MEASURE_LENGTH_MIN_PX = 261;
const WIDGET_VIEW_MODE_NORMAL = TEACHER_TOOL_VIEW_MODE_NORMAL;
const WIDGET_VIEW_MODE_COLLAPSED = TEACHER_TOOL_VIEW_MODE_COLLAPSED;
const WIDGET_VIEW_MODE_STAGE = TEACHER_TOOL_VIEW_MODE_STAGE;
const WIDGET_LAYOUT_MAX_WIDTH = 1;
const WIDGET_LAYOUT_MAX_HEIGHT = 1;

const DEFAULT_SCENE = Object.freeze({
  version: 2,
  scene: {
    background: "white",
    locked: false
  },
  selectedWidgetId: "",
  widgets: []
});

let sceneState = { ...DEFAULT_SCENE };
let visibleChromeWidgetId = "";
let channel = null;
let dragState = null;
let chromeTapState = null;
let fitResizeObserver = null;
let starfieldCleanup = null;
let isTopbarCollapsed = false;
let isWidgetbarCollapsed = false;
let isDrawbarCollapsed = false;
let activeDrawTool = "select";
let activeShapeVariant = "rectangle";
let activeShapeFamily = "";
let drawColor = normalizeColorPickerValue("#111827", "#111827");
let drawFillColor = normalizeColorPickerValue("rgba(255, 255, 255, 0)", "transparent");
let drawWidth = 5;
let drawingSession = null;
let drawingPointerState = null;
let currentSceneWidth = BASE_SCENE_WIDTH;
let currentSceneHeight = BASE_SCENE_HEIGHT;
let lastSentViewportSignature = "";
let stageBackgroundSvg = null;
let snapGridSize = SNAP_GRID_DEFAULT_SIZE;
let snapGridHideTimer = 0;
let isSnapGridEnabled = false;

function clamp(value, min, max){
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function getSafeAspectRatio(width, height, fallback = DEFAULT_SCENE_ASPECT_RATIO){
  const safeWidth = Number(width);
  const safeHeight = Number(height);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight) || safeWidth <= 0 || safeHeight <= 0) {
    return fallback;
  }
  return safeWidth / safeHeight;
}

function getCurrentSceneAspectRatio(){
  return getSafeAspectRatio(currentSceneWidth, currentSceneHeight);
}

function getSceneSizeForViewport(viewportWidth, viewportHeight){
  const viewportRatio = getSafeAspectRatio(viewportWidth, viewportHeight);
  if (viewportRatio >= DEFAULT_SCENE_ASPECT_RATIO) {
    return {
      width: BASE_SCENE_HEIGHT * viewportRatio,
      height: BASE_SCENE_HEIGHT
    };
  }

  return {
    width: BASE_SCENE_WIDTH,
    height: BASE_SCENE_WIDTH / viewportRatio
  };
}

function getProjectorViewportPayload(){
  return {
    sceneAspectRatio: getCurrentSceneAspectRatio(),
    sceneWidth: currentSceneWidth,
    sceneHeight: currentSceneHeight
  };
}

function sendProjectorViewport({ force = false } = {}){
  if (!channel) return;
  const payload = getProjectorViewportPayload();
  const signature = `${Math.round(payload.sceneWidth)}x${Math.round(payload.sceneHeight)}:${payload.sceneAspectRatio.toFixed(4)}`;
  if (!force && signature === lastSentViewportSignature) return;
  lastSentViewportSignature = signature;
  channel.send("projector-viewport", payload);
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

function getWidgetResizeAspectRatio(widget, layout = null){
  const toolRatio = getWidgetLayoutAspectRatio(widget);
  if (toolRatio) return toolRatio;
  if (widget?.toolId !== "drawing-layer") return 0;

  const layoutWidth = Number(layout?.width) || 0;
  const layoutHeight = Number(layout?.height) || 0;
  if (layoutWidth > 0 && layoutHeight > 0) {
    return (layoutWidth / layoutHeight) * getCurrentSceneAspectRatio();
  }

  const width = Number(widget?.state?.width) || 0;
  const height = Number(widget?.state?.height) || 0;
  return width > 0 && height > 0 ? width / height : 0;
}

function constrainLayoutToWidgetAspect(layout = {}, widget = null, { prefer = "width" } = {}){
  const ratio = getWidgetLayoutAspectRatio(widget);
  if (!ratio) return layout;

  const minLayout = getWidgetMinLayout(widget);
  const maxWidth = WIDGET_LAYOUT_MAX_WIDTH;
  const maxHeight = WIDGET_LAYOUT_MAX_HEIGHT;

  const sceneAspectRatio = getCurrentSceneAspectRatio();
  const fromWidth = (width) => ({
    width,
    height: width * sceneAspectRatio / ratio
  });
  const fromHeight = (height) => ({
    width: height * ratio / sceneAspectRatio,
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
  const minLayout = getWidgetMinLayout(widget);
  const baseLayout = {
    x: clamp(layout.x, 0, 1),
    y: clamp(layout.y, 0, 1),
    width: clamp(layout.width, minLayout.width, WIDGET_LAYOUT_MAX_WIDTH),
    height: clamp(layout.height, minLayout.height, WIDGET_LAYOUT_MAX_HEIGHT)
  };
  const constrained = constrainLayoutToWidgetAspect(baseLayout, widget, options);
  const width = clamp(constrained.width, minLayout.width, WIDGET_LAYOUT_MAX_WIDTH);
  const height = clamp(constrained.height, minLayout.height, WIDGET_LAYOUT_MAX_HEIGHT);
  return {
    x: clamp(constrained.x, 0, Math.max(0, 1 - width)),
    y: clamp(constrained.y, 0, Math.max(0, 1 - height)),
    width,
    height
  };
}

function normalizeFreeWidgetLayout(layout = {}, widget = null){
  const minLayout = getWidgetMinLayout(widget);
  const width = clamp(layout.width, minLayout.width, WIDGET_LAYOUT_MAX_WIDTH);
  const height = clamp(layout.height, minLayout.height, WIDGET_LAYOUT_MAX_HEIGHT);
  return {
    x: clamp(layout.x, 0, Math.max(0, 1 - width)),
    y: clamp(layout.y, 0, Math.max(0, 1 - height)),
    width,
    height
  };
}

function normalizeDrawingLayerTransformLayout(layout = {}){
  const minWidth = DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX / Math.max(1, currentSceneWidth);
  const minHeight = DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX / Math.max(1, currentSceneHeight);
  const width = Math.max(minWidth, Math.abs(Number(layout.width) || minWidth));
  const height = Math.max(minHeight, Math.abs(Number(layout.height) || minHeight));
  const x = Number(layout.x);
  const y = Number(layout.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
    width,
    height
  };
}

function getDrawingStateContentBounds(state = {}){
  const paths = (Array.isArray(state.paths) ? state.paths : []).filter((path) => Array.isArray(path.points) && path.points.length);
  const shapes = (Array.isArray(state.shapes) ? state.shapes : []).filter((shape) => Array.isArray(shape.points) && shape.points.length);
  if (!paths.length && !shapes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const includePoint = (point) => {
    minX = Math.min(minX, Number(point.x) || 0);
    minY = Math.min(minY, Number(point.y) || 0);
    maxX = Math.max(maxX, Number(point.x) || 0);
    maxY = Math.max(maxY, Number(point.y) || 0);
  };
  paths.forEach((path) => path.points.forEach(includePoint));
  shapes.forEach((shape) => shape.points.forEach(includePoint));
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
  return {
    x: minX,
    y: minY,
    width: Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, maxX - minX),
    height: Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, maxY - minY)
  };
}

function normalizeDrawingLayerGeometry(layout = {}, state = {}){
  const safeLayout = normalizeDrawingLayerTransformLayout(layout);
  if (!state || typeof state !== "object") return { layout: safeLayout, state: {} };
  const paths = Array.isArray(state.paths) ? state.paths : [];
  const shapes = Array.isArray(state.shapes) ? state.shapes : [];
  const rotation = ((getDrawingRotation(state) % 360) + 360) % 360;
  if (rotation > 0.0001 && Math.abs(rotation - 360) > 0.0001) {
    return { layout: safeLayout, state };
  }

  const bounds = getDrawingStateContentBounds(state);
  const stateWidth = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, Number(state.width) || 1);
  const stateHeight = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, Number(state.height) || 1);
  if (!bounds) return { layout: safeLayout, state };

  const isAlreadyTight = (
    Math.abs(bounds.x) < 0.001
    && Math.abs(bounds.y) < 0.001
    && Math.abs(bounds.width - stateWidth) < 0.001
    && Math.abs(bounds.height - stateHeight) < 0.001
  );
  if (isAlreadyTight) return { layout: safeLayout, state };

  const shiftPoint = (point) => ({
    x: (Number(point.x) || 0) - bounds.x,
    y: (Number(point.y) || 0) - bounds.y
  });
  return {
    layout: normalizeDrawingLayerTransformLayout({
      x: safeLayout.x + (bounds.x / stateWidth) * safeLayout.width,
      y: safeLayout.y + (bounds.y / stateHeight) * safeLayout.height,
      width: safeLayout.width * (bounds.width / stateWidth),
      height: safeLayout.height * (bounds.height / stateHeight)
    }),
    state: {
      ...state,
      width: bounds.width,
      height: bounds.height,
      paths: paths.map((path) => ({
        ...path,
        points: (Array.isArray(path.points) ? path.points : []).map(shiftPoint)
      })),
      shapes: shapes.map((shape) => ({
        ...shape,
        points: (Array.isArray(shape.points) ? shape.points : []).map(shiftPoint)
      }))
    }
  };
}

function getTightDrawingLayerGeometry(widget = {}, state = {}){
  if (widget?.toolId !== "drawing-layer" || !state || typeof state !== "object") return null;
  const safeLayout = normalizeDrawingLayerTransformLayout(widget.layout || {});
  const bounds = getDrawingStateContentBounds(state);
  if (!bounds) return { layout: safeLayout, state };

  const stateWidth = Math.max(
    DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX,
    Number(state.width) || safeLayout.width * currentSceneWidth || 1
  );
  const stateHeight = Math.max(
    DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX,
    Number(state.height) || safeLayout.height * currentSceneHeight || 1
  );
  const sceneWidth = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, safeLayout.width * currentSceneWidth);
  const sceneHeight = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, safeLayout.height * currentSceneHeight);
  const scaleX = sceneWidth / stateWidth;
  const scaleY = sceneHeight / stateHeight;
  const nextSceneWidth = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, bounds.width * scaleX);
  const nextSceneHeight = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, bounds.height * scaleY);
  const center = {
    x: (safeLayout.x + safeLayout.width / 2) * currentSceneWidth,
    y: (safeLayout.y + safeLayout.height / 2) * currentSceneHeight
  };
  const localCenterOffset = {
    x: (bounds.x + bounds.width / 2 - stateWidth / 2) * scaleX,
    y: (bounds.y + bounds.height / 2 - stateHeight / 2) * scaleY
  };
  const rotatedCenterOffset = rotateSceneVector(localCenterOffset, getDrawingRotation(state));
  const nextCenter = {
    x: center.x + rotatedCenterOffset.x,
    y: center.y + rotatedCenterOffset.y
  };
  const shiftPoint = (point) => ({
    x: (Number(point.x) || 0) - bounds.x,
    y: (Number(point.y) || 0) - bounds.y
  });

  return {
    layout: normalizeDrawingLayerTransformLayout({
      x: (nextCenter.x - nextSceneWidth / 2) / Math.max(1, currentSceneWidth),
      y: (nextCenter.y - nextSceneHeight / 2) / Math.max(1, currentSceneHeight),
      width: nextSceneWidth / Math.max(1, currentSceneWidth),
      height: nextSceneHeight / Math.max(1, currentSceneHeight)
    }),
    state: {
      ...state,
      width: bounds.width,
      height: bounds.height,
      paths: (Array.isArray(state.paths) ? state.paths : []).map((path) => ({
        ...path,
        points: (Array.isArray(path.points) ? path.points : []).map(shiftPoint)
      })),
      shapes: (Array.isArray(state.shapes) ? state.shapes : []).map((shape) => ({
        ...shape,
        points: (Array.isArray(shape.points) ? shape.points : []).map(shiftPoint)
      }))
    }
  };
}

function isCornerResizeHandle(handle){
  return handle === "nw" || handle === "ne" || handle === "se" || handle === "sw";
}

function resizeLayoutFromCornerWithAspect(layout = {}, widget = null, handle = "se", dxRatio = 0, dyRatio = 0){
  const ratio = getWidgetResizeAspectRatio(widget, layout);
  if (!ratio) return null;

  const sceneAspectRatio = getCurrentSceneAspectRatio();
  const widthFromHeight = (height) => height * ratio / sceneAspectRatio;
  const heightFromWidth = (width) => width * sceneAspectRatio / ratio;
  const minLayout = getWidgetMinLayout(widget);
  const anchorRight = Number(layout.x) + Number(layout.width);
  const anchorBottom = Number(layout.y) + Number(layout.height);
  const maxWidth = handle.includes("w") ? anchorRight : 1 - Number(layout.x);
  const maxHeight = handle.includes("n") ? anchorBottom : 1 - Number(layout.y);
  const minWidth = Math.min(minLayout.width, maxWidth);
  const minHeight = Math.min(minLayout.height, maxHeight);
  const allowedMinWidth = Math.max(minWidth, widthFromHeight(minHeight));
  const allowedMaxWidth = Math.min(maxWidth, widthFromHeight(maxHeight));

  if (!Number.isFinite(allowedMinWidth) || !Number.isFinite(allowedMaxWidth) || allowedMaxWidth < allowedMinWidth) {
    return null;
  }

  const allowedMinHeight = heightFromWidth(allowedMinWidth);
  const allowedMaxHeight = heightFromWidth(allowedMaxWidth);
  const proposedWidth = Number(layout.width) + (handle.includes("w") ? -dxRatio : dxRatio);
  const proposedHeight = Number(layout.height) + (handle.includes("n") ? -dyRatio : dyRatio);
  const widthDeltaWeight = Math.abs((proposedWidth - Number(layout.width)) / Math.max(Number(layout.width), 0.001));
  const heightDeltaWeight = Math.abs((proposedHeight - Number(layout.height)) / Math.max(Number(layout.height), 0.001));

  let width = Number(layout.width);
  let height = Number(layout.height);
  if (heightDeltaWeight > widthDeltaWeight) {
    height = clamp(proposedHeight, allowedMinHeight, allowedMaxHeight);
    width = widthFromHeight(height);
  } else {
    width = clamp(proposedWidth, allowedMinWidth, allowedMaxWidth);
    height = heightFromWidth(width);
  }

  const x = handle.includes("w") ? anchorRight - width : Number(layout.x);
  const y = handle.includes("n") ? anchorBottom - height : Number(layout.y);
  return normalizeFreeWidgetLayout({ x, y, width, height }, widget);
}

function resizeLayoutFreely(layout = {}, widget = null, handle = "se", dxRatio = 0, dyRatio = 0){
  const minLayout = getWidgetMinLayout(widget);
  let nextX = Number(layout.x) || 0;
  let nextY = Number(layout.y) || 0;
  let nextWidth = Number(layout.width) || minLayout.width;
  let nextHeight = Number(layout.height) || minLayout.height;

  if (handle.includes("e")) {
    nextWidth = clamp(nextWidth + dxRatio, minLayout.width, 1 - nextX);
  }
  if (handle.includes("s")) {
    nextHeight = clamp(nextHeight + dyRatio, minLayout.height, 1 - nextY);
  }
  if (handle.includes("w")) {
    const appliedDx = clamp(dxRatio, -nextX, nextWidth - minLayout.width);
    nextX += appliedDx;
    nextWidth -= appliedDx;
  }
  if (handle.includes("n")) {
    const appliedDy = clamp(dyRatio, -nextY, nextHeight - minLayout.height);
    nextY += appliedDy;
    nextHeight -= appliedDy;
  }

  return normalizeFreeWidgetLayout({
    x: nextX,
    y: nextY,
    width: nextWidth,
    height: nextHeight
  }, widget);
}

function resizeWidgetLayout(layout = {}, widget = null, handle = "se", dxRatio = 0, dyRatio = 0){
  const safeHandle = String(handle || "se").trim() || "se";
  if (isCornerResizeHandle(safeHandle)) {
    const aspectLayout = resizeLayoutFromCornerWithAspect(layout, widget, safeHandle, dxRatio, dyRatio);
    if (aspectLayout) return aspectLayout;
  }

  return resizeLayoutFreely(layout, widget, safeHandle, dxRatio, dyRatio);
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
  return normalizeSceneBackgroundState({
    ...rawScene,
    ...scene,
    locked: scene.locked === true || rawScene?.locked === true
  });
}

function normalizeScene(rawScene = {}){
  return {
    version: Math.max(1, Math.trunc(Number(rawScene.version) || 1)),
    scene: normalizeSceneMeta(rawScene),
    selectedWidgetId: String(rawScene.selectedWidgetId || ""),
    widgets: (Array.isArray(rawScene.widgets) ? rawScene.widgets : []).map((widget, index) => {
      const { layer: _legacyLayer, ...widgetWithoutLayer } = widget || {};
      const state = widget?.state && typeof widget.state === "object" ? widget.state : {};
      const geometry = widget?.toolId === "drawing-layer"
        ? normalizeDrawingLayerGeometry(widget?.layout || {}, state)
        : null;
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
        layout: widget?.toolId === "drawing-layer"
          ? geometry.layout
          : normalizeWidgetLayout(widget?.layout || {}, widget),
        state: widget?.toolId === "drawing-layer" ? geometry.state : state
      };
    }).filter((widget) => widget.id && widget.toolId)
  };
}

function isSceneLocked(){
  return sceneState?.scene?.locked === true;
}

function applyBackground(){
  if (!stage) return;
  const background = normalizeSceneBackgroundState(sceneState.scene);
  const backgroundMode = background.backgroundMode;
  const datasetBackground = backgroundMode === "color"
    ? "custom-color"
    : (backgroundMode === "image" ? "custom-image" : background.background);

  const presetImageSource = backgroundMode === "preset"
    ? getSceneBackgroundImagePresetSource(background.background, background.backgroundPresetSource)
    : "";
  const customImageSource = backgroundMode === "image" ? background.backgroundImageSource : "";
  const imageSource = customImageSource || presetImageSource;
  const imageDisplayCss = customImageSource
    ? getBackgroundImageDisplayCss(background.backgroundImageDisplay)
    : getBackgroundImageDisplayCss("fill");

  stage.dataset.background = datasetBackground;
  if (imageSource) {
    stage.dataset.backgroundKind = "image";
  } else {
    delete stage.dataset.backgroundKind;
  }
  stage.style.setProperty("--ttp-scene-background-color", background.backgroundColor);
  renderEditableBackgroundSvg(backgroundMode === "preset" ? background : null);
  if (imageSource) {
    stage.style.setProperty("--ttp-scene-background-image", formatCssUrl(imageSource));
    stage.style.setProperty("--ttp-scene-background-size", imageDisplayCss.size);
    stage.style.setProperty("--ttp-scene-background-repeat", imageDisplayCss.repeat);
    stage.style.setProperty("--ttp-scene-background-position", imageDisplayCss.position);
  } else {
    stage.style.removeProperty("--ttp-scene-background-image");
    stage.style.removeProperty("--ttp-scene-background-size");
    stage.style.removeProperty("--ttp-scene-background-repeat");
    stage.style.removeProperty("--ttp-scene-background-position");
  }
  stage.classList.toggle("is-scene-locked", isSceneLocked());
  widgetHost?.classList.toggle("is-scene-locked", isSceneLocked());
  syncSpaceStarfield();
  updateProjectionChromeState();
}

function getEditableBackgroundRenderScale(scale){
  const value = Number(scale);
  return (Number.isFinite(value) && value > 0 ? value : 1) * EDITABLE_BACKGROUND_RENDER_BASE_SCALE;
}

function renderEditableBackgroundSvg(background = null){
  const svg = ensureStageBackgroundSvg();
  if (!svg) return;

  const markup = getEditableBackgroundSvgMarkup(background);
  if (!markup) {
    svg.innerHTML = "";
    svg.dataset.patternSignature = "";
    svg.style.removeProperty("--ttp-svg-pattern-color");
    svg.hidden = true;
    return;
  }

  svg.style.setProperty("--ttp-svg-pattern-color", getEditableBackgroundPatternColor(background));

  if (svg.dataset.patternSignature !== markup.signature) {
    svg.innerHTML = markup.content;
    svg.dataset.patternSignature = markup.signature;
  }
  svg.hidden = false;
}

function ensureStageBackgroundSvg(){
  if (!stage) return null;
  if (stageBackgroundSvg?.isConnected) return stageBackgroundSvg;

  stageBackgroundSvg = document.createElementNS(SVG_NS, "svg");
  stageBackgroundSvg.classList.add("ttp-stage-background-svg");
  stageBackgroundSvg.setAttribute("aria-hidden", "true");
  stageBackgroundSvg.setAttribute("focusable", "false");
  stageBackgroundSvg.setAttribute("preserveAspectRatio", "none");
  stageBackgroundSvg.hidden = true;
  stage.insertBefore(stageBackgroundSvg, stage.firstChild);
  return stageBackgroundSvg;
}

function getEditableBackgroundSvgMarkup(background = null){
  if (!background || background.backgroundMode === "color" || background.backgroundMode === "image") return null;
  if (background.background === "seyes") return getSeyesBackgroundSvgMarkup(background.seyesScale, background);
  if (background.background === "small-grid") return getSmallGridBackgroundSvgMarkup(background.smallGridScale, background);
  if (background.background === "lines") return getLinesBackgroundSvgMarkup(background.linesScale, background);
  if (background.background === "dotted") return getDottedBackgroundSvgMarkup(background.dottedScale, background);
  if (background.background === "dotted-60") return getDotted60BackgroundSvgMarkup(background.dotted60Scale, background);
  return null;
}

function getSeyesBackgroundSvgMarkup(scaleValue, background = {}){
  const scale = getEditableBackgroundRenderScale(scaleValue);
  const major = 32 * scale;
  const minor = 8 * scale;
  const patternColor = getEditableBackgroundPatternColor(background);
  const baseColor = getEditableBackgroundBaseColor(background);
  const minorLines = [];
  for (let y = minor; y < major - 0.01; y += minor) {
    minorLines.push(`<line class="ttp-svg-paper-line is-seyes-minor" x1="0" y1="${formatCssNumber(y)}" x2="${formatCssNumber(major)}" y2="${formatCssNumber(y)}"></line>`);
  }
  const majorSize = formatCssNumber(major);
  const content = `
    <defs>
      <pattern id="ttpStageBackgroundPattern" width="${majorSize}" height="${majorSize}" patternUnits="userSpaceOnUse" overflow="visible" style="--ttp-svg-pattern-color:${formatSvgAttribute(patternColor)}">
        <rect width="${majorSize}" height="${majorSize}" fill="${formatSvgAttribute(baseColor)}"></rect>
        ${minorLines.join("")}
        <line class="ttp-svg-paper-line is-seyes-major" x1="0" y1="0" x2="${majorSize}" y2="0"></line>
        <line class="ttp-svg-paper-line is-seyes-vertical" x1="0" y1="0" x2="0" y2="${majorSize}"></line>
      </pattern>
    </defs>
    <rect class="ttp-svg-paper-fill" width="100%" height="100%" fill="url(#ttpStageBackgroundPattern)"></rect>
  `;
  return { signature: `seyes:${majorSize}:${baseColor}:${patternColor}`, content };
}

function getSmallGridBackgroundSvgMarkup(scaleValue, background = {}){
  const scale = getEditableBackgroundRenderScale(scaleValue);
  const size = formatCssNumber(20 * scale);
  const patternColor = getEditableBackgroundPatternColor(background);
  const baseColor = getEditableBackgroundBaseColor(background);
  const content = `
    <defs>
      <pattern id="ttpStageBackgroundPattern" width="${size}" height="${size}" patternUnits="userSpaceOnUse" overflow="visible" style="--ttp-svg-pattern-color:${formatSvgAttribute(patternColor)}">
        <rect width="${size}" height="${size}" fill="${formatSvgAttribute(baseColor)}"></rect>
        <path class="ttp-svg-paper-line is-grid" d="M 0 0 H ${size} M 0 0 V ${size}"></path>
      </pattern>
    </defs>
    <rect class="ttp-svg-paper-fill" width="100%" height="100%" fill="url(#ttpStageBackgroundPattern)"></rect>
  `;
  return { signature: `small-grid:${size}:${baseColor}:${patternColor}`, content };
}

function getLinesBackgroundSvgMarkup(scaleValue, background = {}){
  const scale = getEditableBackgroundRenderScale(scaleValue);
  const size = formatCssNumber(32 * scale);
  const patternColor = getEditableBackgroundPatternColor(background);
  const baseColor = getEditableBackgroundBaseColor(background);
  const content = `
    <defs>
      <pattern id="ttpStageBackgroundPattern" width="100" height="${size}" patternUnits="userSpaceOnUse" overflow="visible" style="--ttp-svg-pattern-color:${formatSvgAttribute(patternColor)}">
        <rect width="100" height="${size}" fill="${formatSvgAttribute(baseColor)}"></rect>
        <line class="ttp-svg-paper-line is-lines" x1="0" y1="0" x2="100" y2="0"></line>
      </pattern>
    </defs>
    <rect class="ttp-svg-paper-fill" width="100%" height="100%" fill="url(#ttpStageBackgroundPattern)"></rect>
  `;
  return { signature: `lines:${size}:${baseColor}:${patternColor}`, content };
}

function getDottedBackgroundSvgMarkup(scaleValue, background = {}){
  const scale = getEditableBackgroundRenderScale(scaleValue);
  const size = 20 * scale;
  const dotSize = getPaperDotRadius(scale);
  const patternColor = getEditableBackgroundPatternColor(background);
  const baseColor = getEditableBackgroundBaseColor(background);
  const formattedSize = formatCssNumber(size);
  const formattedDotSize = formatCssNumber(dotSize);
  const content = `
    <defs>
      <pattern id="ttpStageBackgroundPattern" width="${formattedSize}" height="${formattedSize}" patternUnits="userSpaceOnUse" style="--ttp-svg-pattern-color:${formatSvgAttribute(patternColor)}">
        <rect width="${formattedSize}" height="${formattedSize}" fill="${formatSvgAttribute(baseColor)}"></rect>
        <circle class="ttp-svg-paper-dot" cx="${formatCssNumber(size / 2)}" cy="${formatCssNumber(size / 2)}" r="${formattedDotSize}"></circle>
      </pattern>
    </defs>
    <rect class="ttp-svg-paper-fill" width="100%" height="100%" fill="url(#ttpStageBackgroundPattern)"></rect>
  `;
  return { signature: `dotted:${formattedSize}:${formattedDotSize}:${baseColor}:${patternColor}`, content };
}

function getDotted60BackgroundSvgMarkup(scaleValue, background = {}){
  const scale = getEditableBackgroundRenderScale(scaleValue);
  const x = 20 * scale;
  const y = x * 0.8660254;
  const tileWidth = x * 2;
  const tileHeight = y * 2;
  const dotSize = getPaperDotRadius(scale);
  const patternColor = getEditableBackgroundPatternColor(background);
  const baseColor = getEditableBackgroundBaseColor(background);
  const formattedTileWidth = formatCssNumber(tileWidth);
  const formattedTileHeight = formatCssNumber(tileHeight);
  const formattedDotSize = formatCssNumber(dotSize);
  const dotCoordinates = [
    [x * 0.25, y * 0.5],
    [x * 1.25, y * 0.5],
    [x * 0.75, y * 1.5],
    [x * 1.75, y * 1.5]
  ];
  const dots = dotCoordinates
    .map(([cx, cy]) => `<circle class="ttp-svg-paper-dot" cx="${formatCssNumber(cx)}" cy="${formatCssNumber(cy)}" r="${formattedDotSize}"></circle>`)
    .join("");
  const content = `
    <defs>
      <pattern id="ttpStageBackgroundPattern" width="${formattedTileWidth}" height="${formattedTileHeight}" patternUnits="userSpaceOnUse" style="--ttp-svg-pattern-color:${formatSvgAttribute(patternColor)}">
        <rect width="${formattedTileWidth}" height="${formattedTileHeight}" fill="${formatSvgAttribute(baseColor)}"></rect>
        ${dots}
      </pattern>
    </defs>
    <rect class="ttp-svg-paper-fill" width="100%" height="100%" fill="url(#ttpStageBackgroundPattern)"></rect>
  `;
  return { signature: `dotted-60:${formattedTileWidth}:${formattedTileHeight}:${formattedDotSize}:${baseColor}:${patternColor}`, content };
}

function getEditableBackgroundBaseColor(background = {}){
  return normalizeColorPickerValue(background.backgroundColor, "#ffffff");
}

function getEditableBackgroundPatternColor(background = {}){
  return normalizeColorPickerValue(background.backgroundPatternColor, "#bac2f3");
}

function formatSvgAttribute(value){
  return String(value || "").replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}

function getPaperDotRadius(scale){
  return clamp(1.75 * Math.sqrt(scale), 1.8, 3.8);
}

function syncSpaceStarfield(){
  if (!starfieldHost) return;
  const background = normalizeSceneBackgroundState(sceneState.scene);
  const isSpaceBackground = background.backgroundMode === "preset" && background.background === "space";
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

function formatCssUrl(value){
  const source = String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, "\\\"")
    .replace(/\r?\n/g, "");
  return `url("${source}")`;
}

function formatCssNumber(value){
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return Number(number.toFixed(2)).toString();
}

function normalizeSnapGridSize(value){
  const number = Number(value);
  const clamped = clamp(Number.isFinite(number) ? number : SNAP_GRID_DEFAULT_SIZE, SNAP_GRID_MIN_SIZE, SNAP_GRID_MAX_SIZE);
  return Math.round(clamped / SNAP_GRID_STEP) * SNAP_GRID_STEP;
}

function syncSnapGridControls(){
  snapGridSize = normalizeSnapGridSize(snapGridSize);
  snapGrid?.style.setProperty("--ttp-snap-grid-size", `${snapGridSize}px`);
  if (gridScaleRange && gridScaleRange.value !== String(snapGridSize)) {
    gridScaleRange.value = String(snapGridSize);
  }
  gridScaleRange?.setAttribute("aria-valuetext", `${snapGridSize} px`);
  if (gridScaleValue) gridScaleValue.textContent = `${snapGridSize} px`;
}

function syncSnapGridButtonState(){
  if (!btnGrid) return;
  const popoverOpen = isSnapGridPopoverOpen();
  btnGrid.setAttribute("aria-pressed", isSnapGridEnabled ? "true" : "false");
  btnGrid.setAttribute("aria-expanded", popoverOpen ? "true" : "false");
  btnGrid.setAttribute("aria-label", isSnapGridEnabled ? "Désactiver la grille magnétique" : "Activer la grille magnétique");
  btnGrid.title = isSnapGridEnabled ? "Désactiver la grille magnétique" : "Activer la grille magnétique";
}

function hideSnapGrid(){
  if (snapGridHideTimer) {
    window.clearTimeout(snapGridHideTimer);
    snapGridHideTimer = 0;
  }
  stage?.classList.remove("is-snap-grid-visible");
}

function showSnapGrid(){
  if (!isSnapGridEnabled) return;
  syncSnapGridControls();
  stage?.classList.add("is-snap-grid-visible");
  if (snapGridHideTimer) window.clearTimeout(snapGridHideTimer);
  snapGridHideTimer = window.setTimeout(hideSnapGrid, SNAP_GRID_VISIBLE_MS);
}

function isSnapGridPopoverOpen(){
  return Boolean(gridPopover && gridPopover.hidden === false);
}

function setSnapGridPopoverOpen(open){
  if (!gridPopover || !btnGrid) return;
  const nextOpen = open === true;
  gridPopover.hidden = !nextOpen;
  syncSnapGridButtonState();
  if (nextOpen) showSnapGrid();
}

function setSnapGridEnabled(enabled){
  isSnapGridEnabled = enabled === true;
  syncSnapGridControls();
  setSnapGridPopoverOpen(isSnapGridEnabled);
  syncSnapGridButtonState();
  if (isSnapGridEnabled) {
    showSnapGrid();
  } else {
    hideSnapGrid();
  }
}

function toggleSnapGridEnabled(){
  setSnapGridEnabled(!isSnapGridEnabled);
}

function setSnapGridSize(value){
  snapGridSize = normalizeSnapGridSize(value);
  syncSnapGridControls();
  showSnapGrid();
}

function closeSnapGridPopoverFromOutside(event){
  if (!isSnapGridPopoverOpen()) return;
  if (gridControl?.contains?.(event.target)) return;
  setSnapGridPopoverOpen(false);
}

function getSnapGridStepRatios(){
  if (!isSnapGridEnabled) return null;
  const size = normalizeSnapGridSize(snapGridSize);
  if (!Number.isFinite(size) || size <= 0 || currentSceneWidth <= 0 || currentSceneHeight <= 0) return null;
  return {
    x: size / Math.max(1, currentSceneWidth),
    y: size / Math.max(1, currentSceneHeight)
  };
}

function snapRatioToGrid(value, step){
  const number = Number(value);
  const safeStep = Number(step);
  if (!Number.isFinite(number) || !Number.isFinite(safeStep) || safeStep <= 0) return Number.isFinite(number) ? number : 0;
  return Math.round(number / safeStep) * safeStep;
}

function snapStagePointToGrid(point = {}){
  if (!isSnapGridEnabled) return point;
  const size = normalizeSnapGridSize(snapGridSize);
  if (!Number.isFinite(size) || size <= 0) return point;
  return {
    x: Math.round((Number(point.x) || 0) / size) * size,
    y: Math.round((Number(point.y) || 0) / size) * size
  };
}

function snapMoveLayoutToGrid(layout = {}, widget = null, { bounds = null, free = false } = {}){
  const steps = getSnapGridStepRatios();
  if (!steps) return layout;
  const snapped = {
    ...layout,
    x: snapRatioToGrid(layout.x, steps.x),
    y: snapRatioToGrid(layout.y, steps.y)
  };
  if (free) return normalizeDrawingLayerTransformLayout(snapped);
  if (bounds) return normalizeLayoutForBounds(snapped, bounds);
  return normalizeWidgetLayout(snapped, widget);
}

function snapResizeLayoutToGrid(layout = {}, widget = null, handle = "se"){
  const steps = getSnapGridStepRatios();
  if (!steps) return layout;

  const safeHandle = String(handle || "se").trim() || "se";
  const minLayout = getWidgetMinLayout(widget);
  let left = Number(layout.x) || 0;
  let top = Number(layout.y) || 0;
  let right = left + (Number(layout.width) || minLayout.width);
  let bottom = top + (Number(layout.height) || minLayout.height);

  if (safeHandle.includes("w")) left = snapRatioToGrid(left, steps.x);
  if (safeHandle.includes("e")) right = snapRatioToGrid(right, steps.x);
  if (safeHandle.includes("n")) top = snapRatioToGrid(top, steps.y);
  if (safeHandle.includes("s")) bottom = snapRatioToGrid(bottom, steps.y);

  left = clamp(left, 0, 1);
  top = clamp(top, 0, 1);
  right = clamp(right, 0, 1);
  bottom = clamp(bottom, 0, 1);

  if (right - left < minLayout.width) {
    if (safeHandle.includes("w")) left = Math.max(0, right - minLayout.width);
    else right = Math.min(1, left + minLayout.width);
  }
  if (bottom - top < minLayout.height) {
    if (safeHandle.includes("n")) top = Math.max(0, bottom - minLayout.height);
    else bottom = Math.min(1, top + minLayout.height);
  }

  return normalizeFreeWidgetLayout({
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  }, widget);
}

function snapWidgetLayoutToGrid(layout = {}, widget = null, options = {}){
  if (options.mode === "resize") {
    if (widget?.toolId === "drawing-layer") return layout;
    return snapResizeLayoutToGrid(layout, widget, options.handle);
  }
  return snapMoveLayoutToGrid(layout, widget, options);
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
  syncTrashVisibility();
  renderWidgetbar();
}

function hasVisibleLabelsWidget(){
  return sceneState.widgets.some((widget) => widget.visible !== false && widget.toolId === "labels");
}

function syncTrashVisibility(){
  const shouldShowTrash = hasVisibleLabelsWidget();
  topbar?.classList.toggle("has-labels-widget", shouldShowTrash);
  if (!trashZone) return;
  trashZone.hidden = !shouldShowTrash;
  if (!shouldShowTrash) {
    trashZone.classList.remove("is-delete-ready", "is-delete-hot");
    trashZone.setAttribute("aria-pressed", "false");
  }
}

function setTopbarCollapsed(collapsed){
  isTopbarCollapsed = collapsed === true;
  if (isTopbarCollapsed) setSnapGridPopoverOpen(false);
  topbar?.classList.toggle("is-collapsed", isTopbarCollapsed);
  if (!btnTopbarToggle) return;

  btnTopbarToggle.setAttribute("aria-expanded", isTopbarCollapsed ? "false" : "true");
  btnTopbarToggle.setAttribute("aria-label", isTopbarCollapsed ? "Déplier les commandes" : "Replier les commandes");
  btnTopbarToggle.title = isTopbarCollapsed ? "Déplier les commandes" : "Replier les commandes";
  btnTopbarToggle.innerHTML = `
    <span class="ttp-material-icon" aria-hidden="true">${isTopbarCollapsed ? "keyboard_arrow_left" : "keyboard_arrow_right"}</span>
  `;
}

function toggleTopbarCollapsed(){
  setTopbarCollapsed(!isTopbarCollapsed);
}

function setWidgetbarCollapsed(collapsed){
  isWidgetbarCollapsed = collapsed === true;
  widgetbar?.classList.toggle("is-collapsed", isWidgetbarCollapsed);
  if (!btnWidgetbarToggle) return;

  btnWidgetbarToggle.setAttribute("aria-expanded", isWidgetbarCollapsed ? "false" : "true");
  btnWidgetbarToggle.setAttribute("aria-label", isWidgetbarCollapsed ? "Afficher la barre du widget actif" : "Masquer la barre du widget actif");
  btnWidgetbarToggle.title = isWidgetbarCollapsed ? "Afficher la barre du widget actif" : "Masquer la barre du widget actif";
  btnWidgetbarToggle.innerHTML = `
    <span class="ttp-material-icon" aria-hidden="true">${isWidgetbarCollapsed ? "keyboard_arrow_up" : "keyboard_arrow_down"}</span>
  `;
}

function toggleWidgetbarCollapsed(){
  setWidgetbarCollapsed(!isWidgetbarCollapsed);
}


function getSafeDrawColor(){
  drawColor = normalizeColorPickerValue(drawColor, "#111827");
  syncActiveDrawColorCss();
  return drawColor;
}

function syncActiveDrawColorCss(){
  stage?.style?.setProperty?.("--ttp-active-draw-color", normalizeColorPickerValue(drawColor, "#111827"));
}

function getSafeDrawWidth(){
  drawWidth = clamp(drawWidth, 1, 32);
  return drawWidth;
}

function getSafeDrawFillColor(){
  drawFillColor = normalizeColorPickerValue(drawFillColor, "transparent");
  return drawFillColor;
}

function isFreehandDrawTool(tool = activeDrawTool){
  return tool === "pencil" || tool === "highlighter";
}

function isShapeDrawTool(tool = activeDrawTool){
  return tool === "line" || tool === "shape";
}

function isDrawingTool(tool = activeDrawTool){
  return isFreehandDrawTool(tool) || isShapeDrawTool(tool);
}

function canUseFillColor(){
  return activeDrawTool === "shape" && !["line"].includes(activeShapeVariant);
}

function getSafeDrawStrokeWidthForTool(tool = activeDrawTool){
  const baseWidth = getSafeDrawWidth();
  return tool === "highlighter" ? Math.max(2, Math.round(baseWidth * 1.5)) : baseWidth;
}

function getSafeDrawOpacityForTool(tool = activeDrawTool){
  return tool === "highlighter" ? 0.5 : 1;
}

function getSelectedDrawingLayerWidget(){
  const widget = getSelectedWidget();
  if (!widget || widget.toolId !== "drawing-layer") return null;
  if (isSceneLocked() || isWidgetLocked(widget)) return null;
  return widget;
}

function selectedDrawingLayerSupportsFill(widget = getSelectedDrawingLayerWidget()){
  const shapes = Array.isArray(widget?.state?.shapes) ? widget.state.shapes : [];
  return shapes.some((shape) => shape?.kind && shape.kind !== "line");
}

function getStyledDrawingLayerState(state = {}, stylePatch = {}){
  const hasColor = Object.prototype.hasOwnProperty.call(stylePatch, "color");
  const hasFill = Object.prototype.hasOwnProperty.call(stylePatch, "fill");
  const hasWidth = Object.prototype.hasOwnProperty.call(stylePatch, "width");
  const nextWidth = Math.round(clamp(stylePatch.width, 1, 96));
  let didApply = false;

  const paths = (Array.isArray(state.paths) ? state.paths : []).map((path) => {
    let nextPath = path;
    if (hasColor) {
      nextPath = { ...nextPath, color: stylePatch.color };
      didApply = true;
    }
    if (hasWidth) {
      nextPath = { ...nextPath, width: nextWidth };
      didApply = true;
    }
    return nextPath;
  });

  const shapes = (Array.isArray(state.shapes) ? state.shapes : []).map((shape) => {
    let nextShape = shape;
    if (hasColor) {
      nextShape = { ...nextShape, color: stylePatch.color };
      didApply = true;
    }
    if (hasWidth) {
      nextShape = { ...nextShape, width: nextWidth };
      didApply = true;
    }
    if (hasFill && shape?.kind !== "line") {
      nextShape = { ...nextShape, fill: stylePatch.fill };
      didApply = true;
    }
    return nextShape;
  });

  return {
    didApply,
    state: {
      ...state,
      paths,
      shapes
    }
  };
}

function applyDrawingStyleToSelectedLayer(stylePatch = {}){
  const widget = getSelectedDrawingLayerWidget();
  if (!widget) return;
  if (Object.prototype.hasOwnProperty.call(stylePatch, "fill") && !selectedDrawingLayerSupportsFill(widget)) return;

  const result = getStyledDrawingLayerState(widget.state || {}, stylePatch);
  if (!result.didApply) return;

  const styledWidget = { ...widget, state: result.state };
  const styledShape = getPrimaryDrawingShape(styledWidget);
  if (styledShape?.kind === "line" && Object.prototype.hasOwnProperty.call(stylePatch, "width")) {
    const geometry = getLineGeometryForShape(styledWidget, styledShape);
    if (geometry) {
      setDrawingLayerGeometryLocally(widget.id, geometry);
      sendWidgetAction(widget.id, "set-line-geometry", {
        shapeId: styledShape.id,
        layout: geometry.layout,
        state: geometry.state
      });
      return;
    }
  }

  setDrawingLayerStateLocally(widget.id, () => result.state);
  sendWidgetAction(widget.id, "apply-drawing-style", stylePatch);
}

function updateDrawFillColorAvailability(){
  const selectedSupportsFill = selectedDrawingLayerSupportsFill();
  const enabled = canUseFillColor() || selectedSupportsFill;
  drawFillColorPickerHost?.classList.toggle("is-disabled", !enabled);
  drawFillColorPickerHost?.setAttribute("aria-disabled", enabled ? "false" : "true");
  const trigger = drawFillColorPickerHost?.querySelector?.(".ui-color-picker-trigger");
  if (trigger) {
    trigger.disabled = !enabled;
    trigger.title = enabled ? "Couleur intérieure" : "Couleur intérieure — disponible pour les formes";
  }
}

function setDrawWidth(value, { applyToSelection = false } = {}){
  drawWidth = Math.round(clamp(value, 1, 32));
  if (drawWidthRange && Number(drawWidthRange.value) !== drawWidth) {
    drawWidthRange.value = String(drawWidth);
  }
  if (drawWidthValue) drawWidthValue.textContent = `${drawWidth} px`;
  if (btnDrawWidth) {
    const previewSize = Math.max(2, Math.min(14, drawWidth));
    btnDrawWidth.style.setProperty("--ttp-draw-width-preview-size", `${previewSize}px`);
    btnDrawWidth.setAttribute("aria-label", `Épaisseur du tracé : ${drawWidth} px`);
    btnDrawWidth.title = `Épaisseur du tracé : ${drawWidth} px`;
  }
  if (applyToSelection) {
    applyDrawingStyleToSelectedLayer({ width: drawWidth });
  }
}

function isDrawWidthPopoverOpen(){
  return Boolean(drawWidthPopover && drawWidthPopover.hidden === false);
}

function setDrawWidthPopoverOpen(open){
  if (!drawWidthPopover || !btnDrawWidth) return;
  drawWidthPopover.hidden = open !== true;
  btnDrawWidth.setAttribute("aria-expanded", open === true ? "true" : "false");
}

function toggleDrawWidthPopover(){
  setDrawWidthPopoverOpen(!isDrawWidthPopoverOpen());
}

function initializeDrawbarControls(){
  renderDrawShapeIcons();

  if (drawColorPickerHost) {
    createColorPicker({
      host: drawColorPickerHost,
      value: drawColor,
      label: "Couleur",
      headerLabel: "Couleur du tracé",
      popup: true,
      popupPosition: "local",
      onChange(value){
        drawColor = normalizeColorPickerValue(value, "#111827");
        syncActiveDrawColorCss();
        applyDrawingStyleToSelectedLayer({ color: drawColor });
      }
    });
    const trigger = drawColorPickerHost.querySelector(".ui-color-picker-trigger");
    trigger?.setAttribute("aria-label", "Couleur du tracé");
    if (trigger) trigger.title = "Couleur du tracé";
  }

  if (drawFillColorPickerHost) {
    createColorPicker({
      host: drawFillColorPickerHost,
      value: drawFillColor,
      label: "Couleur intérieure",
      headerLabel: "Couleur intérieure",
      popup: true,
      popupPosition: "local",
      onChange(value){
        drawFillColor = normalizeColorPickerValue(value, "transparent");
        applyDrawingStyleToSelectedLayer({ fill: drawFillColor });
      }
    });
    const trigger = drawFillColorPickerHost.querySelector(".ui-color-picker-trigger");
    trigger?.setAttribute("aria-label", "Couleur intérieure");
    if (trigger) trigger.title = "Couleur intérieure — disponible pour les formes";
  }

  updateDrawFillColorAvailability();
  syncActiveDrawColorCss();
  setActiveShapeVariant(activeShapeVariant);
  setDrawWidth(drawWidthRange?.value || drawWidth);
  drawWidthRange?.addEventListener("input", () => setDrawWidth(drawWidthRange.value, { applyToSelection: true }));
  btnDrawWidth?.addEventListener("click", (event) => {
    event.preventDefault();
    toggleDrawWidthPopover();
  });
}

function closeDrawWidthPopoverFromOutside(event){
  if (!isDrawWidthPopoverOpen()) return;
  if (drawWidthControl?.contains?.(event.target)) return;
  setDrawWidthPopoverOpen(false);
}

function setDrawbarCollapsed(collapsed){
  isDrawbarCollapsed = collapsed === true;
  if (isDrawbarCollapsed) setDrawWidthPopoverOpen(false);
  drawbar?.classList.toggle("is-collapsed", isDrawbarCollapsed);
  if (!btnDrawbarToggle) return;

  btnDrawbarToggle.setAttribute("aria-expanded", isDrawbarCollapsed ? "false" : "true");
  btnDrawbarToggle.setAttribute("aria-label", isDrawbarCollapsed ? "Déplier les outils de dessin" : "Replier les outils de dessin");
  btnDrawbarToggle.title = isDrawbarCollapsed ? "Déplier les outils de dessin" : "Replier les outils de dessin";
  btnDrawbarToggle.innerHTML = `
    <span class="ttp-material-icon" aria-hidden="true">${isDrawbarCollapsed ? "keyboard_arrow_right" : "keyboard_arrow_left"}</span>
  `;
}

const DRAW_SHAPE_ICON_SVGS = Object.freeze({
  rectangle: '<rect x="4" y="6" width="24" height="12" rx="1.5"></rect>',
  square: '<rect x="8" y="4" width="16" height="16" rx="1.5"></rect>',
  diamond: '<polygon points="16 3.5 27 12 16 20.5 5 12"></polygon>',
  parallelogram: '<polygon points="10 5 28 5 22 19 4 19"></polygon>',
  trapezoid: '<polygon points="10 5 22 5 28 19 4 19"></polygon>',
  "triangle-free": '<polygon points="5 19 12 5 27 19"></polygon>',
  "triangle-isosceles": '<polygon points="9 20 16 4 23 20"></polygon>',
  "triangle-equilateral": '<polygon points="6 20.5 26 20.5 16 3.2"></polygon>',
  "triangle-right": '<polygon points="7 5 7 19 27 19"></polygon>',
  "triangle-right-isosceles": '<polygon points="8 4 8 20 24 20"></polygon>',
  ellipse: '<ellipse cx="16" cy="12" rx="12" ry="6.5"></ellipse>',
  circle: '<circle cx="16" cy="12" r="8"></circle>'
});

function renderDrawShapeIcons(){
  drawbar?.querySelectorAll?.(".ttp-draw-shape-icon[data-shape-icon]").forEach((host) => {
    const iconName = String(host.dataset.shapeIcon || "").trim();
    const shapeMarkup = DRAW_SHAPE_ICON_SVGS[iconName];
    if (!shapeMarkup) return;
    host.innerHTML = `<svg viewBox="0 0 32 24" aria-hidden="true" focusable="false">${shapeMarkup}</svg>`;
  });
}

function getShapeFamilyForVariant(variant){
  if (["rectangle", "square", "diamond", "parallelogram", "trapezoid"].includes(variant)) return "rectangle";
  if (["triangle-free", "triangle-isosceles", "triangle-equilateral", "triangle-right", "triangle-right-isosceles"].includes(variant)) return "triangle";
  if (["ellipse", "circle"].includes(variant)) return "round";
  return "";
}

function updateDrawbarVariantRows(openFamily = activeShapeFamily){
  drawbar?.querySelectorAll?.("[data-drawbar-variants]").forEach((row) => {
    const family = row.dataset.drawbarVariants || "";
    row.hidden = family !== openFamily;
  });
  [btnDrawRectGroup, btnDrawTriangleGroup, btnDrawRoundGroup].forEach((button) => {
    const family = button === btnDrawRectGroup ? "rectangle" : button === btnDrawTriangleGroup ? "triangle" : "round";
    button?.setAttribute("aria-expanded", family === openFamily ? "true" : "false");
  });
}

function setActiveShapeVariant(variant){
  const safeVariant = String(variant || "rectangle").trim();
  activeShapeVariant = safeVariant;
  activeShapeFamily = getShapeFamilyForVariant(safeVariant);
  drawbar?.querySelectorAll?.("[data-draw-variant]").forEach((button) => {
    button.setAttribute("aria-pressed", button.dataset.drawVariant === activeShapeVariant ? "true" : "false");
  });
  updateDrawbarVariantRows(activeDrawTool === "shape" ? activeShapeFamily : "");
  updateDrawFillColorAvailability();
}

function setActiveDrawTool(tool){
  const safeTool = ["pencil", "highlighter", "line", "shape"].includes(tool) ? tool : "select";
  if (safeTool !== activeDrawTool && isFreehandDrawTool(activeDrawTool)) finalizeDrawingSession();
  if (safeTool !== "shape") activeShapeFamily = "";
  activeDrawTool = safeTool;
  const drawingActive = isDrawingTool(activeDrawTool) && !isDrawbarCollapsed;
  stage?.classList.toggle("is-draw-pencil", drawingActive);
  stage?.classList.toggle("is-draw-active", drawingActive);
  btnDrawSelect?.setAttribute("aria-pressed", activeDrawTool === "select" ? "true" : "false");
  btnDrawPencil?.setAttribute("aria-pressed", activeDrawTool === "pencil" ? "true" : "false");
  btnDrawHighlighter?.setAttribute("aria-pressed", activeDrawTool === "highlighter" ? "true" : "false");
  btnDrawLine?.setAttribute("aria-pressed", activeDrawTool === "line" ? "true" : "false");
  btnDrawRectGroup?.setAttribute("aria-pressed", activeDrawTool === "shape" && activeShapeFamily === "rectangle" ? "true" : "false");
  btnDrawTriangleGroup?.setAttribute("aria-pressed", activeDrawTool === "shape" && activeShapeFamily === "triangle" ? "true" : "false");
  btnDrawRoundGroup?.setAttribute("aria-pressed", activeDrawTool === "shape" && activeShapeFamily === "round" ? "true" : "false");
  updateDrawbarVariantRows(activeDrawTool === "shape" ? activeShapeFamily : "");
  updateDrawFillColorAvailability();
}

function activateShapeVariant(variant){
  finalizeDrawingSession();
  setActiveShapeVariant(variant);
  setActiveDrawTool("shape");
}

function toggleDrawbarCollapsed(){
  const nextCollapsed = !isDrawbarCollapsed;
  if (nextCollapsed) {
    finalizeDrawingSession();
    activeDrawTool = "select";
  }
  setDrawbarCollapsed(nextCollapsed);
  setActiveDrawTool(activeDrawTool);
}

function getStagePointFromEvent(event, { clampToScene = true } = {}){
  const rect = stage?.getBoundingClientRect?.();
  if (!rect?.width || !rect?.height) return { x: 0, y: 0 };
  const x = ((Number(event.clientX) || 0) - rect.left) / rect.width * currentSceneWidth;
  const y = ((Number(event.clientY) || 0) - rect.top) / rect.height * currentSceneHeight;
  if (!clampToScene) {
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0
    };
  }
  return {
    x: clamp(x, 0, currentSceneWidth),
    y: clamp(y, 0, currentSceneHeight)
  };
}

function getStageScreenScale(){
  const rect = stage?.getBoundingClientRect?.();
  const scaleX = rect?.width ? rect.width / Math.max(1, currentSceneWidth) : 1;
  const scaleY = rect?.height ? rect.height / Math.max(1, currentSceneHeight) : scaleX;
  const scale = Math.min(
    Number.isFinite(scaleX) && scaleX > 0 ? scaleX : 1,
    Number.isFinite(scaleY) && scaleY > 0 ? scaleY : 1
  );
  return Number.isFinite(scale) && scale > 0 ? scale : 1;
}

function getGeometrySnapToleranceScenePx(){
  return GEOMETRY_EDGE_SNAP_TOLERANCE_SCREEN_PX / getStageScreenScale();
}

function getWidgetSceneBox(widget = {}){
  const layout = normalizeWidgetLayout(widget.layout || {}, widget);
  return {
    x: layout.x * currentSceneWidth,
    y: layout.y * currentSceneHeight,
    width: layout.width * currentSceneWidth,
    height: layout.height * currentSceneHeight
  };
}

function getRotatedScenePoint(origin, localPoint = {}, degrees = 0){
  const vector = rotateSceneVector(localPoint, degrees);
  return {
    x: origin.x + vector.x,
    y: origin.y + vector.y
  };
}

function getGeometryInstrumentSnapEdges(){
  const edges = [];
  sceneState.widgets
    .filter((widget) => widget?.visible !== false && widget?.toolId === "geometry-instruments")
    .forEach((widget) => {
      const state = normalizeGeometryInstrumentsState(widget.state || {});
      const box = getWidgetSceneBox(widget);

      if (state.ruler.enabled) {
        const pivot = {
          x: box.x + state.ruler.x * box.width,
          y: box.y + state.ruler.y * box.height
        };
        const measureLength = Math.max(
          GEOMETRY_RULER_MEASURE_LENGTH_MIN_PX,
          Number(state.ruler.unitSize) * Number(state.ruler.lengthUnits) || 0
        );
        edges.push({
          kind: "ruler",
          a: pivot,
          b: getRotatedScenePoint(pivot, { x: measureLength, y: 0 }, state.ruler.rotation)
        });
      }

      if (state.setSquare.enabled) {
        const pivot = {
          x: box.x + state.setSquare.x * box.width,
          y: box.y + state.setSquare.y * box.height
        };
        const horizontalLength = Math.max(1, Number(state.setSquare.horizontalLength) || 1);
        const verticalLength = Math.max(1, Number(state.setSquare.verticalLength) || 1);
        edges.push({
          kind: "set-square-horizontal",
          a: pivot,
          b: getRotatedScenePoint(pivot, { x: horizontalLength, y: 0 }, state.setSquare.rotation)
        });
        edges.push({
          kind: "set-square-vertical",
          a: pivot,
          b: getRotatedScenePoint(pivot, { x: 0, y: verticalLength }, state.setSquare.rotation)
        });
      }
    });
  return edges;
}

function getClosestPointOnSegment(point = {}, edge = {}){
  const ax = Number(edge.a?.x) || 0;
  const ay = Number(edge.a?.y) || 0;
  const bx = Number(edge.b?.x) || 0;
  const by = Number(edge.b?.y) || 0;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq <= 0.0001) {
    return {
      point: { x: ax, y: ay },
      distance: Math.hypot((Number(point.x) || 0) - ax, (Number(point.y) || 0) - ay)
    };
  }

  const t = clamp((((Number(point.x) || 0) - ax) * dx + ((Number(point.y) || 0) - ay) * dy) / lengthSq, 0, 1);
  const closest = {
    x: ax + dx * t,
    y: ay + dy * t
  };
  return {
    point: closest,
    distance: Math.hypot((Number(point.x) || 0) - closest.x, (Number(point.y) || 0) - closest.y)
  };
}

function snapFreehandPointToGeometryInstrument(point = {}){
  const edges = getGeometryInstrumentSnapEdges();
  if (!edges.length) return point;

  const tolerance = getGeometrySnapToleranceScenePx();
  let best = null;
  edges.forEach((edge) => {
    const candidate = getClosestPointOnSegment(point, edge);
    if (!best || candidate.distance < best.distance) {
      best = candidate;
    }
  });

  if (!best || best.distance > tolerance) return point;
  return {
    x: clamp(best.point.x, 0, currentSceneWidth),
    y: clamp(best.point.y, 0, currentSceneHeight)
  };
}

function getPathD(points = []){
  if (!points.length) return "";
  const [first, ...rest] = points;
  if (!rest.length) return `M ${first.x.toFixed(1)} ${first.y.toFixed(1)} l 0.1 0`;
  return [
    `M ${first.x.toFixed(1)} ${first.y.toFixed(1)}`,
    ...rest.map((point) => `L ${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
  ].join(" ");
}


function makeShapeId(){
  return `shape-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makePathId(){
  return `path-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function getBoundsFromTwoPoints(a, b, { square = false } = {}){
  const start = a || { x: 0, y: 0 };
  const end = b || start;
  let dx = end.x - start.x;
  let dy = end.y - start.y;
  if (Math.abs(dx) < 1) dx = dx < 0 ? -1 : 1;
  if (Math.abs(dy) < 1) dy = dy < 0 ? -1 : 1;
  if (square) {
    const signX = Math.sign(dx || 1);
    const signY = Math.sign(dy || 1);
    const maxSideX = signX > 0 ? currentSceneWidth - start.x : start.x;
    const maxSideY = signY > 0 ? currentSceneHeight - start.y : start.y;
    const side = clamp(Math.max(Math.abs(dx), Math.abs(dy)), 1, Math.max(1, Math.min(maxSideX, maxSideY)));
    dx = signX * side;
    dy = signY * side;
  }
  const x1 = start.x;
  const y1 = start.y;
  const x2 = start.x + dx;
  const y2 = start.y + dy;
  return {
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.max(1, Math.abs(x2 - x1)),
    height: Math.max(1, Math.abs(y2 - y1))
  };
}

function pointsFromRect(bounds, variant){
  const x = bounds.x;
  const y = bounds.y;
  const w = bounds.width;
  const h = bounds.height;
  if (variant === "diamond") {
    return [
      { x: x + w / 2, y },
      { x: x + w, y: y + h / 2 },
      { x: x + w / 2, y: y + h },
      { x, y: y + h / 2 }
    ];
  }
  if (variant === "parallelogram") {
    const skew = w * 0.22;
    return [
      { x: x + skew, y },
      { x: x + w, y },
      { x: x + w - skew, y: y + h },
      { x, y: y + h }
    ];
  }
  if (variant === "trapezoid") {
    const inset = w * 0.22;
    return [
      { x: x + inset, y },
      { x: x + w - inset, y },
      { x: x + w, y: y + h },
      { x, y: y + h }
    ];
  }
  return [
    { x, y },
    { x: x + w, y },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ];
}

function pointsFromTriangle(bounds, variant){
  const x = bounds.x;
  const y = bounds.y;
  const w = bounds.width;
  const h = bounds.height;
  if (variant === "triangle-free") {
    return [
      { x: x + w * 0.16, y: y + h },
      { x: x + w * 0.90, y: y + h },
      { x: x + w * 0.58, y }
    ];
  }
  if (variant === "triangle-right") {
    return [
      { x, y },
      { x, y: y + h },
      { x: x + w, y: y + h }
    ];
  }
  if (variant === "triangle-right-isosceles") {
    const side = Math.min(w, h);
    return [
      { x, y },
      { x, y: y + side },
      { x: x + side, y: y + side }
    ];
  }
  if (variant === "triangle-equilateral") {
    const side = Math.min(w, h * 2 / Math.sqrt(3));
    const height = side * Math.sqrt(3) / 2;
    return [
      { x: x + side / 2, y },
      { x: x + side, y: y + height },
      { x, y: y + height }
    ];
  }
  return [
    { x: x + w / 2, y },
    { x: x + w, y: y + h },
    { x, y: y + h }
  ];
}

function createShapeFromPoints(start, end, variant){
  const strokeWidth = getSafeDrawStrokeWidthForTool("shape");
  const base = {
    id: makeShapeId(),
    color: getSafeDrawColor(),
    width: strokeWidth,
    opacity: 1,
    fill: canUseFillColor() ? getSafeDrawFillColor() : "none",
    arrowMode: "none"
  };
  if (activeDrawTool === "line" || variant === "line") {
    return {
      ...base,
      kind: "line",
      variant: "line",
      fill: "none",
      arrowMode: "none",
      points: [start, end]
    };
  }
  if (variant === "ellipse" || variant === "circle") {
    const bounds = getBoundsFromTwoPoints(start, end, { square: variant === "circle" });
    return {
      ...base,
      kind: "ellipse",
      variant,
      points: [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height }
      ]
    };
  }
  const square = variant === "square" || variant === "triangle-equilateral" || variant === "triangle-right-isosceles";
  const bounds = getBoundsFromTwoPoints(start, end, { square });
  const family = getShapeFamilyForVariant(variant);
  return {
    ...base,
    kind: "polygon",
    variant,
    points: family === "triangle"
      ? pointsFromTriangle(bounds, variant)
      : pointsFromRect(bounds, variant)
  };
}

function getPolygonPoints(points = []){
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function isTransparentSvgColor(value){
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw || raw === "none" || raw === "transparent") return true;
  const rgba = raw.match(/^rgba?\(([^)]+)\)$/i);
  if (rgba) {
    const parts = rgba[1].split(/[,\s/]+/).filter(Boolean);
    return parts.length >= 4 && Number(parts[3]) <= 0.001;
  }
  const hex = raw.match(/^#([0-9a-f]{8})$/i);
  return Boolean(hex && parseInt(hex[1].slice(6, 8), 16) <= 0);
}

function getSvgFill(value){
  return isTransparentSvgColor(value) ? "none" : String(value);
}

function renderCaptureShape(shape){
  if (!shape) return "";
  if (shape.kind === "line") {
    const [a, b] = shape.points || [];
    if (!a || !b) return "";
    return `<line class="ttp-drawing-capture-path" x1="${escapeHtml(a.x.toFixed(1))}" y1="${escapeHtml(a.y.toFixed(1))}" x2="${escapeHtml(b.x.toFixed(1))}" y2="${escapeHtml(b.y.toFixed(1))}" stroke="${escapeHtml(shape.color)}" stroke-width="${escapeHtml(shape.width)}" opacity="${escapeHtml(shape.opacity)}"></line>`;
  }
  if (shape.kind === "ellipse") {
    const [a, b] = shape.points || [];
    if (!a || !b) return "";
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    return `<ellipse class="ttp-drawing-capture-shape" cx="${escapeHtml((x + w / 2).toFixed(1))}" cy="${escapeHtml((y + h / 2).toFixed(1))}" rx="${escapeHtml(Math.max(0.5, w / 2).toFixed(1))}" ry="${escapeHtml(Math.max(0.5, h / 2).toFixed(1))}" fill="${escapeHtml(getSvgFill(shape.fill))}" stroke="${escapeHtml(shape.color)}" stroke-width="${escapeHtml(shape.width)}" opacity="${escapeHtml(shape.opacity)}"></ellipse>`;
  }
  const points = getPolygonPoints(shape.points || []);
  if (!points) return "";
  return `<polygon class="ttp-drawing-capture-shape" points="${escapeHtml(points)}" fill="${escapeHtml(getSvgFill(shape.fill))}" stroke="${escapeHtml(shape.color)}" stroke-width="${escapeHtml(shape.width)}" opacity="${escapeHtml(shape.opacity)}"></polygon>`;
}

function ensureDrawingSession(){
  if (drawingSession) return drawingSession;
  drawingSession = {
    id: `draw-session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    paths: [],
    shapes: []
  };
  return drawingSession;
}

function renderDrawingSession(){
  if (!drawingCapture) return;
  drawingCapture.setAttribute("viewBox", `0 0 ${currentSceneWidth} ${currentSceneHeight}`);
  const paths = drawingSession?.paths || [];
  const shapes = drawingSession?.shapes || [];
  drawingCapture.innerHTML = [
    ...paths.map((path) => `
      <path
        class="ttp-drawing-capture-path ${path.tool === "highlighter" ? "is-highlighter" : ""}"
        d="${escapeHtml(getPathD(path.points))}"
        stroke="${escapeHtml(path.color)}"
        stroke-width="${escapeHtml(path.width)}"
        opacity="${escapeHtml(path.opacity)}"
      ></path>
    `),
    ...shapes.map(renderCaptureShape)
  ].join("");
}

function startDrawingPointer(event){
  if (!isDrawingTool(activeDrawTool) || isDrawbarCollapsed || isSceneLocked()) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const rawPoint = getStagePointFromEvent(event);
  const point = isFreehandDrawTool(activeDrawTool)
    ? snapFreehandPointToGeometryInstrument(rawPoint)
    : rawPoint;
  const session = ensureDrawingSession();

  if (isFreehandDrawTool(activeDrawTool)) {
    const path = {
      id: makePathId(),
      tool: activeDrawTool,
      color: getSafeDrawColor(),
      width: getSafeDrawStrokeWidthForTool(activeDrawTool),
      opacity: getSafeDrawOpacityForTool(activeDrawTool),
      points: [point]
    };
    session.paths.push(path);
    drawingPointerState = {
      mode: "freehand",
      pointerId: event.pointerId,
      path,
      lastPoint: point
    };
  } else {
    const variant = activeDrawTool === "line" ? "line" : activeShapeVariant;
    const shape = createShapeFromPoints(point, point, variant);
    session.shapes = [shape];
    drawingPointerState = {
      mode: "shape",
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPoint: point,
      shape,
      variant,
      hasMoved: false
    };
  }

  drawingCapture?.setPointerCapture?.(event.pointerId);
  renderDrawingSession();
  event.preventDefault();
}

function moveDrawingPointer(event){
  if (!drawingPointerState || event.pointerId !== drawingPointerState.pointerId) return;
  const rawPoint = getStagePointFromEvent(event);
  const point = drawingPointerState.mode === "freehand"
    ? snapFreehandPointToGeometryInstrument(rawPoint)
    : rawPoint;

  if (drawingPointerState.mode === "shape") {
    const dx = (Number(event.clientX) || 0) - (Number(drawingPointerState.startClientX) || 0);
    const dy = (Number(event.clientY) || 0) - (Number(drawingPointerState.startClientY) || 0);
    if (Math.hypot(dx, dy) >= DRAW_SHAPE_START_THRESHOLD_PX) {
      drawingPointerState.hasMoved = true;
    }
    const shape = createShapeFromPoints(drawingPointerState.startPoint, point, drawingPointerState.variant);
    shape.id = drawingPointerState.shape.id;
    drawingPointerState.shape = shape;
    if (drawingSession) drawingSession.shapes = [shape];
    renderDrawingSession();
    event.preventDefault();
    return;
  }

  const last = drawingPointerState.lastPoint;
  if (last && Math.hypot(point.x - last.x, point.y - last.y) < 1.5) {
    event.preventDefault();
    return;
  }
  drawingPointerState.path.points.push(point);
  drawingPointerState.lastPoint = point;
  renderDrawingSession();
  event.preventDefault();
}

function endDrawingPointer(event){
  if (!drawingPointerState || event.pointerId !== drawingPointerState.pointerId) return;
  const wasShape = drawingPointerState.mode === "shape";
  const shouldFinalizeShape = wasShape && event.type !== "pointercancel" && drawingPointerState.hasMoved === true;
  try {
    drawingCapture?.releasePointerCapture?.(event.pointerId);
  } catch {}
  if (wasShape && !shouldFinalizeShape && drawingSession) {
    drawingSession.shapes = [];
  }
  drawingPointerState = null;
  renderDrawingSession();
  if (shouldFinalizeShape) finalizeDrawingSession();
  event.preventDefault();
}

function getDrawingSessionBounds(session = drawingSession){
  const paths = (session?.paths || []).filter((path) => Array.isArray(path.points) && path.points.length);
  const shapes = (session?.shapes || []).filter((shape) => Array.isArray(shape.points) && shape.points.length);
  if (!paths.length && !shapes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const includePoint = (point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };
  paths.forEach((path) => {
    path.points.forEach(includePoint);
  });
  shapes.forEach((shape) => {
    shape.points.forEach(includePoint);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  };
}

function getNextWidgetZIndex(){
  return sceneState.widgets.reduce((max, widget, index) => Math.max(max, Number(widget?.zIndex) || index + 1), 0) + 1;
}

function createDrawingLayerWidgetFromSession(session){
  const bounds = getDrawingSessionBounds(session);
  if (!bounds) return null;
  const state = {
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
    paths: (session.paths || []).map((path) => ({
      ...path,
      points: path.points.map((point) => ({
        x: point.x - bounds.x,
        y: point.y - bounds.y
      }))
    })),
    shapes: (session.shapes || []).map((shape) => ({
      ...shape,
      points: shape.points.map((point) => ({
        x: point.x - bounds.x,
        y: point.y - bounds.y
      }))
    }))
  };
  const widget = {
    id: `drawing-layer-${Math.random().toString(36).slice(2, 8)}-${Date.now().toString(36)}`,
    toolId: "drawing-layer",
    label: "Dessin",
    icon: "gesture",
    visible: true,
    locked: false,
    viewMode: WIDGET_VIEW_MODE_NORMAL,
    zIndex: getNextWidgetZIndex(),
    layout: normalizeDrawingLayerTransformLayout({
      x: bounds.x / Math.max(1, currentSceneWidth),
      y: bounds.y / Math.max(1, currentSceneHeight),
      width: bounds.width / Math.max(1, currentSceneWidth),
      height: bounds.height / Math.max(1, currentSceneHeight)
    }),
    state
  };
  return widget;
}

function addWidgetFromProjector(widget){
  if (!widget?.id || !widget?.toolId) return;
  sceneState = {
    ...sceneState,
    selectedWidgetId: widget.id,
    widgets: [
      ...sceneState.widgets.filter((item) => item.id !== widget.id),
      widget
    ]
  };
  visibleChromeWidgetId = widget.id;
  render();
  channel?.send?.("add-widget-from-projector", {
    widget,
    ...getProjectorViewportPayload()
  });
}

function finalizeDrawingSession(){
  const session = drawingSession;
  drawingSession = null;
  drawingPointerState = null;
  if (drawingCapture) drawingCapture.innerHTML = "";
  if (!session?.paths?.length && !session?.shapes?.length) return;
  const widget = createDrawingLayerWidgetFromSession(session);
  if (widget) addWidgetFromProjector(widget);
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

function setFrameLayout(frame, layout, bounds = null, { free = false } = {}){
  const width = clamp(layout?.width, 0.01, WIDGET_LAYOUT_MAX_WIDTH);
  const height = clamp(layout?.height, 0.01, WIDGET_LAYOUT_MAX_HEIGHT);
  const safeLayout = free
    ? {
        x: Number.isFinite(Number(layout?.x)) ? Number(layout.x) : 0,
        y: Number.isFinite(Number(layout?.y)) ? Number(layout.y) : 0,
        width: Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX / Math.max(1, currentSceneWidth), Math.abs(Number(layout?.width) || 0.01)),
        height: Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX / Math.max(1, currentSceneHeight), Math.abs(Number(layout?.height) || 0.01))
      }
    : bounds
    ? normalizeLayoutForBounds(layout, bounds)
    : {
        x: clamp(layout?.x, 0, Math.max(0, 1 - width)),
        y: clamp(layout?.y, 0, Math.max(0, 1 - height)),
        width,
        height
      };
  frame.style.left = `${safeLayout.x * 100}%`;
  frame.style.top = `${safeLayout.y * 100}%`;
  frame.style.width = `${safeLayout.width * 100}%`;
  frame.style.height = `${safeLayout.height * 100}%`;
}

function setFrameRotation(frame, degrees = 0){
  if (!frame) return;
  const rotation = Number(degrees) || 0;
  frame.style.transformOrigin = "50% 50%";
  frame.style.transform = Math.abs(rotation) > 0.0001 ? `rotate(${rotation}deg)` : "";
}

function clearFrameRotation(frame){
  if (!frame) return;
  frame.style.transform = "";
  frame.style.transformOrigin = "";
}

function sendWidgetLayout(widgetId, layout){
  const widget = getWidgetById(widgetId);
  channel?.send?.("widget-layout", {
    widgetId,
    layout: widget ? normalizeWidgetLayout(layout, widget) : normalizeLayout(layout),
    ...getProjectorViewportPayload()
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

function sendWidgetCommand(widgetId, command, payload = {}){
  channel?.send?.("widget-command", {
    widgetId,
    command: String(command || "").trim(),
    payload: payload && typeof payload === "object" ? payload : {}
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

function getSelectedWidget(){
  return getWidgetById(sceneState.selectedWidgetId);
}

function getWidgetbarButton({ action, icon, label, disabled = false, pressed = false, danger = false } = {}){
  return `
    <button
      class="ttp-widgetbar-btn${danger ? " is-danger" : ""}"
      type="button"
      data-widgetbar-action="${escapeHtml(action)}"
      aria-pressed="${pressed ? "true" : "false"}"
      ${disabled ? "disabled" : ""}
    >
      <span class="ttp-material-icon" aria-hidden="true">${escapeHtml(icon)}</span>
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderWidgetbar(){
  if (!widgetbar || !widgetbarContent) return;

  const widget = getSelectedWidget();
  const tool = getTeacherTool(widget?.toolId);
  const interaction = normalizeTeacherToolInteraction(tool?.interaction);
  const sceneLocked = isSceneLocked();
  const widgetLocked = isWidgetLocked(widget);
  const viewMode = getWidgetViewMode(widget?.id);
  const hasWidget = Boolean(widget);
  const isCollapsed = viewMode === WIDGET_VIEW_MODE_COLLAPSED;
  const isStageMaximized = viewMode === WIDGET_VIEW_MODE_STAGE;
  const canMutateWidget = hasWidget && !sceneLocked && !widgetLocked;
  const canMoveWidget = canMutateWidget && interaction.moveMode !== TEACHER_TOOL_MOVE_MODE_NONE;
  const canCollapse = canMutateWidget && interaction.canCollapse !== false;
  const canStage = canMutateWidget && !isCollapsed && interaction.canStage !== false;
  const canRemove = canMutateWidget;
  const specificControlsHtml = hasWidget && typeof tool?.renderWidgetbarControls === "function"
    ? String(tool.renderWidgetbarControls({ state: widget.state, widget, disabled: !canMutateWidget }) || "").trim()
    : "";

  widgetbar.classList.toggle("has-active-widget", hasWidget);

  if (!hasWidget) {
    widgetbarContent.innerHTML = `
      <div class="ttp-widgetbar-empty">
        <span class="ttp-material-icon" aria-hidden="true">touch_app</span>
        <span>Sélectionne un widget pour afficher ses contrôles.</span>
      </div>
    `;
    return;
  }

  widgetbarContent.innerHTML = `
    <div class="ttp-widgetbar-title" title="${escapeHtml(widget.label || tool?.label || "Widget")}">
      <span class="ttp-material-icon" aria-hidden="true">${escapeHtml(widget.icon || tool?.icon || "widgets")}</span>
      <strong>${escapeHtml(widget.label || tool?.label || "Widget")}</strong>
    </div>
    <div class="ttp-widgetbar-actions">
      ${getWidgetbarButton({
        action: "toggle-lock",
        icon: widgetLocked ? "lock" : "lock_open",
        label: widgetLocked ? "Déverrouiller" : "Verrouiller",
        disabled: !hasWidget,
        pressed: widgetLocked
      })}
      ${getWidgetbarButton({
        action: isCollapsed ? "expand" : "collapse",
        icon: isCollapsed ? "expand_more" : "expand_less",
        label: isCollapsed ? "Déployer" : "Replier",
        disabled: !canCollapse && !(canMutateWidget && isCollapsed)
      })}
      ${getWidgetbarButton({
        action: isStageMaximized ? "restore" : "stage",
        icon: isStageMaximized ? "fullscreen_exit" : "fullscreen",
        label: isStageMaximized ? "Taille normale" : "Scène complète",
        disabled: !canMutateWidget || (!isStageMaximized && !canStage)
      })}
      ${getWidgetbarButton({ action: "center", icon: "filter_center_focus", label: "Centrer", disabled: !canMoveWidget })}
      ${getWidgetbarButton({ action: "duplicate", icon: "content_copy", label: "Dupliquer", disabled: !canMutateWidget })}
      ${getWidgetbarButton({ action: "front", icon: "flip_to_front", label: "Devant", disabled: !canMutateWidget })}
      ${getWidgetbarButton({ action: "back", icon: "flip_to_back", label: "Derrière", disabled: !canMutateWidget })}
      ${getWidgetbarButton({ action: "remove", icon: "delete", label: "Retirer", disabled: !canRemove, danger: true })}
    </div>
    ${specificControlsHtml ? `
      <span class="ttp-widgetbar-separator" aria-hidden="true"></span>
      <div class="ttp-widgetbar-specific-actions" data-widgetbar-specific-actions>
        ${specificControlsHtml}
      </div>
    ` : ""}
  `;

  widgetbarContent.querySelectorAll("[data-widgetbar-action]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      const action = button.dataset.widgetbarAction;
      handleWidgetbarAction(action);
    });
  });

  const specificHost = widgetbarContent.querySelector("[data-widgetbar-specific-actions]");
  if (specificHost && typeof tool?.bindWidgetbarControls === "function") {
    tool.bindWidgetbarControls({
      host: specificHost,
      state: widget.state,
      widget,
      sendAction: (action, payload = {}) => sendWidgetAction(widget.id, action, payload)
    });
  }
}

function setWidgetLockedFromProjector(widgetId, locked){
  const safeWidgetId = String(widgetId || "").trim();
  if (!safeWidgetId) return;
  sceneState = {
    ...sceneState,
    widgets: sceneState.widgets.map((item) => (item.id === safeWidgetId ? { ...item, locked: locked === true } : item))
  };
  visibleChromeWidgetId = safeWidgetId;
  selectWidgetLocally(safeWidgetId, { notify: false });
  sendWidgetMeta(safeWidgetId, { locked: locked === true });
  render();
}

function removeWidgetFromProjector(widgetId){
  const safeWidgetId = String(widgetId || "").trim();
  if (!safeWidgetId) return;
  if (visibleChromeWidgetId === safeWidgetId) visibleChromeWidgetId = "";
  const wasSelected = sceneState.selectedWidgetId === safeWidgetId;
  sceneState = {
    ...sceneState,
    selectedWidgetId: wasSelected ? "" : sceneState.selectedWidgetId,
    widgets: sceneState.widgets.filter((item) => item.id !== safeWidgetId)
  };
  sendWidgetRemoval(safeWidgetId);
  render();
}

function handleWidgetbarAction(action){
  const widget = getSelectedWidget();
  if (!widget) return;
  const safeAction = String(action || "").trim();
  const widgetLocked = isWidgetLocked(widget);
  const sceneLocked = isSceneLocked();

  if (safeAction === "toggle-lock") {
    setWidgetLockedFromProjector(widget.id, !widgetLocked);
    return;
  }

  if (sceneLocked || widgetLocked) return;

  if (safeAction === "collapse") {
    setWidgetViewMode(widget.id, WIDGET_VIEW_MODE_COLLAPSED);
    return;
  }
  if (safeAction === "expand" || safeAction === "restore") {
    setWidgetViewMode(widget.id, WIDGET_VIEW_MODE_NORMAL);
    return;
  }
  if (safeAction === "stage") {
    setWidgetViewMode(widget.id, WIDGET_VIEW_MODE_STAGE);
    return;
  }
  if (safeAction === "remove") {
    removeWidgetFromProjector(widget.id);
    return;
  }

  const commandByAction = {
    center: "center-widget",
    duplicate: "duplicate-widget",
    front: "bring-front",
    back: "send-back"
  };
  const command = commandByAction[safeAction];
  if (!command) return;
  sendWidgetCommand(widget.id, command);
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
      const normalized = widget.toolId === "drawing-layer"
        ? normalizeDrawingLayerTransformLayout(widget.layout)
        : normalizeWidgetLayout(widget.layout, widget);
      const current = widget.layout || {};
      const changed = (
        Math.abs(Number(current.x) - normalized.x) > 0.0001
        || Math.abs(Number(current.y) - normalized.y) > 0.0001
        || Math.abs(Number(current.width) - normalized.width) > 0.0001
        || Math.abs(Number(current.height) - normalized.height) > 0.0001
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
  renderWidgetbar();
  updateDrawFillColorAvailability();
}

function selectWidgetLocally(widgetId, { notify = true } = {}){
  const safeWidgetId = String(widgetId || "").trim();
  if (!safeWidgetId) return;
  const wasSelected = sceneState.selectedWidgetId === safeWidgetId;
  if (!wasSelected && visibleChromeWidgetId && visibleChromeWidgetId !== safeWidgetId) {
    visibleChromeWidgetId = "";
    chromeTapState = null;
  }

  sceneState = {
    ...sceneState,
    selectedWidgetId: safeWidgetId
  };

  updateWidgetFrameState();

  if (notify && !wasSelected) sendWidgetSelection(safeWidgetId);
}

function deselectWidgetLocally({ notify = false } = {}){
  const hadSelection = Boolean(sceneState.selectedWidgetId);
  chromeTapState = null;
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

function handleWidgetChromeTap(widgetId, event = {}){
  const safeWidgetId = String(widgetId || "").trim();
  if (!safeWidgetId) return;

  const now = Date.now();
  const clientX = Number(event.clientX) || 0;
  const clientY = Number(event.clientY) || 0;
  const pointerType = String(event.pointerType || "mouse");
  const previous = chromeTapState;
  const isDoubleTap = Boolean(previous
    && previous.widgetId === safeWidgetId
    && previous.pointerType === pointerType
    && now - previous.time <= WIDGET_CHROME_DOUBLE_TAP_MS
    && Math.hypot(clientX - previous.clientX, clientY - previous.clientY) <= WIDGET_CHROME_DOUBLE_TAP_DISTANCE_PX);

  if (sceneState.selectedWidgetId !== safeWidgetId) {
    visibleChromeWidgetId = "";
  }
  selectWidgetLocally(safeWidgetId);

  chromeTapState = isDoubleTap
    ? null
    : {
        widgetId: safeWidgetId,
        pointerType,
        time: now,
        clientX,
        clientY
      };

  if (isDoubleTap) toggleWidgetChrome(safeWidgetId);
}

function updateStageFitLayout(){
  if (!viewport || !fitHost || !stage) return;

  const rect = viewport.getBoundingClientRect();
  const viewportWidth = Math.max(0, rect.width || viewport.clientWidth || 0);
  const viewportHeight = Math.max(0, rect.height || viewport.clientHeight || 0);
  if (viewportWidth <= 0 || viewportHeight <= 0) return;

  const sceneSize = getSceneSizeForViewport(viewportWidth, viewportHeight);
  currentSceneWidth = Math.max(1, sceneSize.width);
  currentSceneHeight = Math.max(1, sceneSize.height);

  const scale = Math.min(
    viewportWidth / currentSceneWidth,
    viewportHeight / currentSceneHeight
  );
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const scaledWidth = Math.max(1, currentSceneWidth * safeScale);
  const scaledHeight = Math.max(1, currentSceneHeight * safeScale);

  fitHost.style.setProperty("--ttp-fit-width", `${scaledWidth}px`);
  fitHost.style.setProperty("--ttp-fit-height", `${scaledHeight}px`);
  fitHost.style.setProperty("--ttp-fit-scale", String(safeScale));
  stage.style.setProperty("--ttp-scene-width", `${currentSceneWidth}px`);
  stage.style.setProperty("--ttp-scene-height", `${currentSceneHeight}px`);
  syncSnapGridControls();

  stage.style.zoom = "";
  stage.style.transform = safeScale === 1 ? "" : `scale(${safeScale})`;

  syncRenderedWidgetLayoutsForScene();
  renderDrawingSession();
  sendProjectorViewport();

  viewport.classList.toggle("ttp-fit-active", Math.abs(safeScale - 1) > 0.001);
  viewport.classList.toggle("ttp-fit-fallback", Math.abs(safeScale - 1) > 0.001);
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
      handleWidgetChromeTap(widget.id, event);
      event.preventDefault();
    }
    return;
  }

  const interaction = getWidgetInteraction(widget);
  if (interaction.moveMode === TEACHER_TOOL_MOVE_MODE_NONE) {
    if (!isInteractiveDragTarget(event.target)) {
      handleWidgetChromeTap(widget.id, event);
      event.preventDefault();
    }
    return;
  }
  if (interaction.moveMode === TEACHER_TOOL_MOVE_MODE_CHROME && !event.target?.closest?.("[data-drag-handle]")) {
    if (!isInteractiveDragTarget(event.target)) {
      handleWidgetChromeTap(widget.id, event);
      event.preventDefault();
    }
    return;
  }
  if (interaction.moveMode === TEACHER_TOOL_MOVE_MODE_BODY && isInteractiveDragTarget(event.target)) return;
  if (interaction.moveMode === TEACHER_TOOL_MOVE_MODE_CHROME && isInteractiveDragTarget(event.target)) return;

  const viewMode = getWidgetViewMode(widget.id);
  const stageRect = stage.getBoundingClientRect();
  const liveWidget = sceneState.widgets.find((item) => item.id === widget.id) || widget;
  const dragBounds = getWidgetDragBounds(frame, liveWidget, viewMode);
  const layout = liveWidget.toolId === "drawing-layer" && viewMode !== WIDGET_VIEW_MODE_COLLAPSED
    ? normalizeDrawingLayerTransformLayout(liveWidget.layout)
    : normalizeLayoutForBounds(liveWidget.layout, dragBounds);

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

function startWidgetResize(event, frame, widget, resizeHandle = "se"){
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
  const layout = liveWidget.toolId === "drawing-layer"
    ? normalizeDrawingLayerTransformLayout(liveWidget.layout)
    : normalizeWidgetLayout(liveWidget.layout, liveWidget);
  const drawingLayerStartState = liveWidget.toolId === "drawing-layer"
    ? JSON.parse(JSON.stringify(liveWidget.state || {}))
    : null;
  const drawingLayerResizeSnapshot = liveWidget.toolId === "drawing-layer"
    ? getDrawingLayerResizeSnapshot(liveWidget, layout, drawingLayerStartState, resizeHandle)
    : null;

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
    didMove: false,
    resizeHandle: String(resizeHandle || "se").trim() || "se",
    drawingLayerStartState,
    drawingLayerResizeSnapshot
  };

  chromeTapState = null;
  frame.classList.add("is-dragging");
  showSnapGrid();
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

  if (dragState.mode === "drawing-point") {
    const widget = getWidgetById(dragState.widgetId);
    if (dragState.isLinePointDrag) {
      const point = getLocalDrawingPointFromClient(dragState.frame, widget, event);
      const geometry = getLineGeometryForPoint(widget, dragState.shapeId, dragState.pointIndex, point);
      if (geometry) {
        setDrawingLayerGeometryLocally(dragState.widgetId, geometry);
        dragState.currentGeometry = geometry;
        dragState.didMove = true;
        event.preventDefault();
        return;
      }
    }

    if (dragState.variant === "triangle-free") {
      const snapshotWidget = {
        toolId: "drawing-layer",
        layout: dragState.startLayout,
        state: dragState.startState
      };
      const point = getLocalDrawingPointFromClient(dragState.frame, snapshotWidget, event);
      const geometry = getDrawingLayerGeometryForShapePoint(snapshotWidget, dragState.shapeId, dragState.pointIndex, point);
      if (geometry) {
        setDrawingLayerGeometryLocally(dragState.widgetId, geometry);
        dragState.currentGeometry = geometry;
        dragState.didMove = true;
        event.preventDefault();
        return;
      }
    }

    const point = getLocalDrawingPointFromClient(dragState.frame, widget, event);
    updateShapePointInWidget(dragState.widgetId, dragState.shapeId, dragState.pointIndex, point);
    dragState.didMove = true;
    event.preventDefault();
    return;
  }

  if (dragState.mode === "drawing-adjust") {
    const points = getAdjustedShapePoints(dragState, event);
    const geometry = getDrawingLayerGeometryForShapePoints({
      toolId: "drawing-layer",
      layout: dragState.startLayout,
      state: dragState.startState
    }, dragState.shapeId, points);
    if (geometry) {
      setDrawingLayerGeometryLocally(dragState.widgetId, geometry);
      dragState.currentGeometry = geometry;
      dragState.currentPoints = points;
      dragState.didMove = true;
    }
    event.preventDefault();
    return;
  }

  if (dragState.mode === "drawing-rotate") {
    const angle = Math.atan2(event.clientY - dragState.centerY, event.clientX - dragState.centerX) * 180 / Math.PI;
    const rotation = dragState.startRotation + (angle - dragState.startAngle);
    dragState.currentRotation = rotation;
    setDrawingRotationLocally(dragState.widgetId, rotation);
    dragState.didMove = true;
    event.preventDefault();
    return;
  }

  const activeWidget = getWidgetById(dragState.widgetId);
  const layout = dragState.viewMode === WIDGET_VIEW_MODE_COLLAPSED
    ? normalizeLayoutForBounds(dragState.layout, dragBounds)
    : activeWidget?.toolId === "drawing-layer"
      ? normalizeDrawingLayerTransformLayout(dragState.layout)
      : normalizeWidgetLayout(dragState.layout, activeWidget);

  let nextLayout = layout;
  if (dragState.mode === "move" && dragState.viewMode === WIDGET_VIEW_MODE_STAGE) {
    const movedEnough = Math.hypot(dx, dy) >= DRAG_START_THRESHOLD_PX;
    if (movedEnough) {
      dragState.hasStarted = true;
      chromeTapState = null;
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
    chromeTapState = null;
    dragState.frame.classList.add("is-dragging");
    showSnapGrid();
    if (sceneState.selectedWidgetId !== dragState.widgetId) {
      selectWidgetLocally(dragState.widgetId);
    }
  }

  if (dragState.mode === "resize") {
    const widget = activeWidget;
    if (widget?.toolId === "drawing-layer" && dragState.drawingLayerResizeSnapshot) {
      const geometry = getDrawingLayerResizeGeometryFromEvent(widget, dragState.drawingLayerResizeSnapshot, event);
      if (geometry) {
        dragState.currentGeometry = geometry;
        dragState.currentLayout = geometry.layout;
        setDrawingLayerGeometryLocally(dragState.widgetId, geometry);
        dragState.didMove = true;
        showSnapGrid();
        event.preventDefault();
        return;
      }
    }
    const handle = String(dragState.resizeHandle || "se");
    const resizeBaseLayout = normalizeFreeWidgetLayout(dragState.layout, widget);
    nextLayout = resizeWidgetLayout(resizeBaseLayout, widget, handle, dxRatio, dyRatio);
    nextLayout = snapWidgetLayoutToGrid(nextLayout, widget, {
      mode: "resize",
      handle
    });
    dragState.didMove = true;
    dragState.currentLayout = nextLayout;
    setFrameLayout(dragState.frame, nextLayout);
    showSnapGrid();
    event.preventDefault();
    return;
  }

  if (dragState.viewMode === WIDGET_VIEW_MODE_COLLAPSED) {
    nextLayout = normalizeLayoutForBounds({
      ...layout,
      x: layout.x + dxRatio,
      y: layout.y + dyRatio
    }, dragBounds);
  } else if (activeWidget?.toolId === "drawing-layer") {
    nextLayout = normalizeDrawingLayerTransformLayout({
      ...layout,
      x: layout.x + dxRatio,
      y: layout.y + dyRatio
    });
  } else {
    nextLayout = normalizeLayout({
      ...layout,
      x: clamp(layout.x + dxRatio, 0, 1 - layout.width),
      y: clamp(layout.y + dyRatio, 0, 1 - layout.height)
    });
  }
  nextLayout = snapWidgetLayoutToGrid(nextLayout, activeWidget, {
    mode: "move",
    bounds: dragState.viewMode === WIDGET_VIEW_MODE_COLLAPSED ? dragBounds : null,
    free: activeWidget?.toolId === "drawing-layer" && dragState.viewMode !== WIDGET_VIEW_MODE_COLLAPSED
  });
  dragState.didMove = true;
  dragState.currentLayout = nextLayout;
  setFrameLayout(dragState.frame, nextLayout, dragBounds, {
    free: activeWidget?.toolId === "drawing-layer" && dragState.viewMode !== WIDGET_VIEW_MODE_COLLAPSED
  });
  showSnapGrid();
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

  if (["drawing-point", "drawing-adjust", "drawing-rotate"].includes(finishedDrag.mode)) {
    finishedDrag.frame.classList.remove("is-dragging", "is-rotating");
    try {
      finishedDrag.frame.releasePointerCapture?.(event.pointerId);
    } catch {}
    unbindDragListeners();
    dragState = null;

    if (finishedDrag.mode === "drawing-point" && finishedDrag.didMove && finishedDrag.isLinePointDrag) {
      const liveWidget = getWidgetById(finishedDrag.widgetId);
      const point = getLocalDrawingPointFromClient(finishedDrag.frame, liveWidget, event);
      const geometry = getLineGeometryForPoint(liveWidget, finishedDrag.shapeId, finishedDrag.pointIndex, point)
        || finishedDrag.currentGeometry;
      if (geometry) {
        sendWidgetAction(finishedDrag.widgetId, "set-line-geometry", {
          shapeId: finishedDrag.shapeId,
          layout: geometry.layout,
          state: geometry.state
        });
      }
    } else if (finishedDrag.mode === "drawing-point" && finishedDrag.didMove) {
      if (finishedDrag.currentGeometry) {
        sendWidgetAction(finishedDrag.widgetId, "set-drawing-geometry", {
          layout: finishedDrag.currentGeometry.layout,
          state: finishedDrag.currentGeometry.state
        });
      } else {
        const point = getLocalDrawingPointFromClient(finishedDrag.frame, widget, event);
        sendWidgetAction(finishedDrag.widgetId, "move-shape-point", {
          shapeId: finishedDrag.shapeId,
          pointIndex: finishedDrag.pointIndex,
          point
        });
      }
    }
    if (finishedDrag.mode === "drawing-adjust" && finishedDrag.didMove) {
      if (finishedDrag.currentGeometry) {
        sendWidgetAction(finishedDrag.widgetId, "set-drawing-geometry", {
          layout: finishedDrag.currentGeometry.layout,
          state: finishedDrag.currentGeometry.state
        });
      } else {
        sendWidgetAction(finishedDrag.widgetId, "set-shape-points", {
          shapeId: finishedDrag.shapeId,
          points: finishedDrag.currentPoints || finishedDrag.startPoints || []
        });
      }
    }
    if (finishedDrag.mode === "drawing-rotate" && finishedDrag.didMove) {
      sendWidgetAction(finishedDrag.widgetId, "set-rotation", {
        rotation: finishedDrag.currentRotation ?? finishedDrag.startRotation ?? 0
      });
    }
    event.preventDefault();
    return;
  }

  let nextLayout = finishedDrag.viewMode === WIDGET_VIEW_MODE_COLLAPSED
    ? normalizeLayoutForBounds(dragState.currentLayout || dragState.layout, dragBounds)
    : widget?.toolId === "drawing-layer"
      ? normalizeDrawingLayerTransformLayout(dragState.currentLayout || dragState.layout)
      : normalizeWidgetLayout(dragState.currentLayout || dragState.layout, widget);
  const shouldHandleChromeTap = (
    finishedDrag.mode === "move"
    && !finishedDrag.hasStarted
    && event.type !== "pointercancel"
  );

  if (!shouldHandleChromeTap && !(widget?.toolId === "drawing-layer" && finishedDrag.mode === "resize")) {
    nextLayout = snapWidgetLayoutToGrid(nextLayout, widget, {
      mode: finishedDrag.mode,
      handle: finishedDrag.resizeHandle,
      bounds: finishedDrag.viewMode === WIDGET_VIEW_MODE_COLLAPSED ? dragBounds : null,
      free: widget?.toolId === "drawing-layer" && finishedDrag.viewMode !== WIDGET_VIEW_MODE_COLLAPSED
    });
  }

  if (!shouldHandleChromeTap) {
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

    setFrameLayout(finishedDrag.frame, nextLayout, dragBounds, {
      free: widget?.toolId === "drawing-layer" && finishedDrag.viewMode !== WIDGET_VIEW_MODE_COLLAPSED
    });
  }

  finishedDrag.frame.classList.remove("is-dragging");
  try {
    finishedDrag.frame.releasePointerCapture?.(event.pointerId);
  } catch {}
  unbindDragListeners();
  dragState = null;

  if (shouldHandleChromeTap) {
    handleWidgetChromeTap(finishedDrag.widgetId, event);
    event.preventDefault();
    return;
  }

  if (finishedDrag.didMove
    && finishedDrag.mode === "resize"
    && widget?.toolId === "drawing-layer"
    && finishedDrag.currentGeometry
    && finishedDrag.viewMode !== WIDGET_VIEW_MODE_COLLAPSED) {
    sendWidgetAction(finishedDrag.widgetId, "set-drawing-geometry", {
      layout: finishedDrag.currentGeometry.layout,
      state: finishedDrag.currentGeometry.state
    });
  } else if (finishedDrag.didMove && finishedDrag.viewMode !== WIDGET_VIEW_MODE_COLLAPSED) {
    sendWidgetLayout(finishedDrag.widgetId, nextLayout);
  }
  event.preventDefault();
}

function syncFrameLayoutForView(frame, widget){
  if (!frame || !widget) return;
  const viewMode = getWidgetViewMode(widget.id);
  if (widget.toolId === "drawing-layer" && viewMode !== WIDGET_VIEW_MODE_COLLAPSED) {
    setFrameLayout(frame, normalizeDrawingLayerTransformLayout(widget.layout), null, { free: true });
    setFrameRotation(frame, getDrawingRotation(widget.state || {}));
    return;
  }
  clearFrameRotation(frame);
  if (viewMode !== WIDGET_VIEW_MODE_COLLAPSED) {
    setFrameLayout(frame, normalizeWidgetLayout(widget.layout, widget));
    return;
  }

  setFrameLayout(frame, widget.layout, getFrameSizeBounds(frame, widget.layout));
}

function syncRenderedWidgetLayoutsForScene(){
  widgetHost?.querySelectorAll(".ttp-widget-frame[data-widget-id]").forEach((frame) => {
    const widget = getWidgetById(frame.dataset.widgetId);
    if (!widget) return;
    syncFrameLayoutForView(frame, widget);
  });
}



function getPrimaryDrawingShape(widget){
  const state = widget?.state || {};
  const shapes = Array.isArray(state.shapes) ? state.shapes : [];
  const paths = Array.isArray(state.paths) ? state.paths : [];
  return shapes.length === 1 && paths.length === 0 ? shapes[0] : null;
}

function isFixedRatioDrawingShape(shape){
  return shape?.variant === "square"
    || shape?.variant === "circle"
    || shape?.variant === "triangle-equilateral"
    || shape?.variant === "triangle-right-isosceles";
}

function isOneToOneDrawingShape(shape){
  return shape?.variant === "square"
    || shape?.variant === "circle"
    || shape?.variant === "triangle-right-isosceles";
}

function getPointHandlePosition(state = {}, point = {}){
  const width = Math.max(1, Number(state.width) || 1);
  const height = Math.max(1, Number(state.height) || 1);
  const displayPoint = {
    x: Number(point.x) || 0,
    y: Number(point.y) || 0
  };
  return {
    left: `${displayPoint.x / width * 100}%`,
    top: `${displayPoint.y / height * 100}%`
  };
}

function getShapeCenterPoint(shape, state = {}){
  if (!shape?.points?.length) return { x: (Number(state.width) || 1) / 2, y: (Number(state.height) || 1) / 2 };
  const points = shape.points;
  return {
    x: points.reduce((sum, point) => sum + Number(point.x || 0), 0) / points.length,
    y: points.reduce((sum, point) => sum + Number(point.y || 0), 0) / points.length
  };
}

function getStagePointFromDrawingPoint(widget, point = {}, { rotate = true } = {}){
  const state = widget?.state || {};
  const layout = widget?.toolId === "drawing-layer"
    ? normalizeDrawingLayerTransformLayout(widget?.layout || {})
    : normalizeFreeWidgetLayout(widget?.layout || {}, widget);
  const width = Math.max(1, Number(state.width) || 1);
  const height = Math.max(1, Number(state.height) || 1);
  const displayPoint = rotate
    ? rotateDrawingPoint(point, state, getDrawingRotation(state))
    : {
        x: Number(point.x) || 0,
        y: Number(point.y) || 0
      };

  return {
    x: (layout.x + (displayPoint.x / width) * layout.width) * currentSceneWidth,
    y: (layout.y + (displayPoint.y / height) * layout.height) * currentSceneHeight
  };
}

function expandStageBounds(bounds = {}, widget = null){
  const minLayout = getWidgetMinLayout(widget);
  const minWidth = minLayout.width * currentSceneWidth;
  const minHeight = minLayout.height * currentSceneHeight;
  let width = Math.max(1, Number(bounds.width) || 1);
  let height = Math.max(1, Number(bounds.height) || 1);
  let centerX = (Number(bounds.x) || 0) + width / 2;
  let centerY = (Number(bounds.y) || 0) + height / 2;

  if (widget?.toolId === "drawing-layer") {
    return {
      x: Number.isFinite(Number(bounds.x)) ? Number(bounds.x) : 0,
      y: Number.isFinite(Number(bounds.y)) ? Number(bounds.y) : 0,
      width,
      height
    };
  }

  width = Math.min(currentSceneWidth, Math.max(width, minWidth));
  height = Math.min(currentSceneHeight, Math.max(height, minHeight));

  return {
    x: clamp(centerX - width / 2, 0, Math.max(0, currentSceneWidth - width)),
    y: clamp(centerY - height / 2, 0, Math.max(0, currentSceneHeight - height)),
    width,
    height
  };
}

function getLineStageBounds(stagePoints = [], widget = null){
  if (!stagePoints.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  stagePoints.forEach((point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) return null;
  return expandStageBounds({
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY)
  }, widget);
}

function getLineGeometryForShape(widget, shapeOverride = null){
  const state = widget?.state || {};
  const shape = shapeOverride || getPrimaryDrawingShape(widget);
  if (!shape || shape.kind !== "line") return null;
  const points = (shape.points || []).slice(0, 2).map((item) => ({ ...item }));
  if (points.length < 2) return null;
  const stagePoints = points.map((item) => getStagePointFromDrawingPoint(widget, item));
  const bounds = getLineStageBounds(stagePoints, widget);
  if (!bounds) return null;

  const nextShape = {
    ...shape,
    points: stagePoints.map((item) => ({
      x: item.x - bounds.x,
      y: item.y - bounds.y
    }))
  };
  const nextState = {
    ...state,
    width: bounds.width,
    height: bounds.height,
    rotation: 0,
    paths: [],
    shapes: [nextShape]
  };
  const nextLayout = {
    x: bounds.x / Math.max(1, currentSceneWidth),
    y: bounds.y / Math.max(1, currentSceneHeight),
    width: bounds.width / Math.max(1, currentSceneWidth),
    height: bounds.height / Math.max(1, currentSceneHeight)
  };

  return {
    layout: normalizeDrawingLayerTransformLayout(nextLayout),
    state: nextState
  };
}

function getLineGeometryForPoint(widget, shapeId, pointIndex, point){
  const shape = getPrimaryDrawingShape(widget);
  if (!shape || shape.id !== shapeId || shape.kind !== "line") return null;
  const points = (shape.points || []).slice(0, 2).map((item) => ({ ...item }));
  if (!points[pointIndex]) return null;
  points[pointIndex] = { x: Number(point.x) || 0, y: Number(point.y) || 0 };
  return getLineGeometryForShape(widget, { ...shape, points });
}

function getDrawingStateCenter(state = {}){
  return {
    x: Math.max(1, Number(state.width) || 1) / 2,
    y: Math.max(1, Number(state.height) || 1) / 2
  };
}

function rotateDrawingPoint(point = {}, state = {}, degrees = 0){
  const angle = Number(degrees) * Math.PI / 180;
  if (!Number.isFinite(angle) || Math.abs(angle) < 0.000001) {
    return {
      x: Number(point.x) || 0,
      y: Number(point.y) || 0
    };
  }

  const center = getDrawingStateCenter(state);
  const dx = (Number(point.x) || 0) - center.x;
  const dy = (Number(point.y) || 0) - center.y;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos
  };
}

function rotateSceneVector(vector = {}, degrees = 0){
  const angle = Number(degrees) * Math.PI / 180;
  const x = Number(vector.x) || 0;
  const y = Number(vector.y) || 0;
  if (!Number.isFinite(angle) || Math.abs(angle) < 0.000001) return { x, y };
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos
  };
}

function getDrawingRotation(state = {}){
  const rotation = Number(state.rotation) || 0;
  return Number.isFinite(rotation) ? rotation : 0;
}

function hasVisibleDrawingRotation(state = {}){
  const normalized = ((getDrawingRotation(state) % 360) + 360) % 360;
  return normalized > 0.05 && normalized < 359.95;
}

function formatDrawingRotationLabel(rotation){
  const normalized = ((Number(rotation) || 0) % 360 + 360) % 360;
  const rounded = Math.round(normalized * 10) / 10;
  const displayValue = rounded >= 360 ? 0 : rounded;
  return `${displayValue.toFixed(1).replace(".", ",")}°`;
}

function setDrawingLayerStateLocally(widgetId, updater){
  const safeWidgetId = String(widgetId || "").trim();
  if (!safeWidgetId || typeof updater !== "function") return null;
  let nextState = null;
  sceneState = {
    ...sceneState,
    widgets: sceneState.widgets.map((widget) => {
      if (widget.id !== safeWidgetId) return widget;
      nextState = updater(widget.state || {}, widget);
      return {
        ...widget,
        state: nextState
      };
    })
  };
  render();
  return nextState;
}

function setDrawingLayerGeometryLocally(widgetId, geometry = {}){
  const safeWidgetId = String(widgetId || "").trim();
  if (!safeWidgetId || !geometry.state || !geometry.layout) return null;
  let nextWidget = null;
  sceneState = {
    ...sceneState,
    widgets: sceneState.widgets.map((widget) => {
      if (widget.id !== safeWidgetId) return widget;
      nextWidget = {
        ...widget,
        layout: widget.toolId === "drawing-layer"
          ? normalizeDrawingLayerTransformLayout(geometry.layout)
          : normalizeFreeWidgetLayout(geometry.layout, widget),
        state: geometry.state
      };
      return nextWidget;
    })
  };
  render();
  return nextWidget;
}

function getLocalDrawingPointFromClient(frame, widget, event){
  const state = widget?.state || {};
  const layout = normalizeDrawingLayerTransformLayout(widget?.layout || {});
  const stateWidth = Math.max(1, Number(state.width) || 1);
  const stateHeight = Math.max(1, Number(state.height) || 1);
  const layoutWidth = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, layout.width * currentSceneWidth);
  const layoutHeight = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, layout.height * currentSceneHeight);
  const stagePoint = getStagePointFromEvent(event, { clampToScene: false });
  const center = {
    x: (layout.x + layout.width / 2) * currentSceneWidth,
    y: (layout.y + layout.height / 2) * currentSceneHeight
  };
  const localVector = rotateSceneVector({
    x: stagePoint.x - center.x,
    y: stagePoint.y - center.y
  }, -getDrawingRotation(state));
  return {
    x: clamp((localVector.x / layoutWidth + 0.5) * stateWidth, -100000, 100000),
    y: clamp((localVector.y / layoutHeight + 0.5) * stateHeight, -100000, 100000)
  };
}

function updateShapePointInWidget(widgetId, shapeId, pointIndex, point){
  return setDrawingLayerStateLocally(widgetId, (state) => ({
    ...state,
    shapes: (Array.isArray(state.shapes) ? state.shapes : []).map((shape) => {
      if (shape.id !== shapeId) return shape;
      const points = Array.isArray(shape.points) ? shape.points.slice() : [];
      if (!points[pointIndex]) return shape;
      points[pointIndex] = { x: point.x, y: point.y };
      return { ...shape, points };
    })
  }));
}

function updateShapePointsInWidget(widgetId, shapeId, points){
  return setDrawingLayerStateLocally(widgetId, (state) => ({
    ...state,
    shapes: (Array.isArray(state.shapes) ? state.shapes : []).map((shape) => (
      shape.id === shapeId ? { ...shape, points } : shape
    ))
  }));
}

function getDrawingLayerGeometryForShapePoints(widget = {}, shapeId, points = []){
  if (widget?.toolId !== "drawing-layer") return null;
  const safeShapeId = String(shapeId || "").trim();
  if (!safeShapeId) return null;
  const state = widget.state || {};
  const shapes = Array.isArray(state.shapes) ? state.shapes : [];
  const nextState = {
    ...state,
    shapes: shapes.map((shape) => (
      shape.id === safeShapeId ? { ...shape, points: points.map((point) => ({ ...point })) } : shape
    ))
  };
  return getTightDrawingLayerGeometry(widget, nextState);
}

function getDrawingLayerGeometryForShapePoint(widget = {}, shapeId, pointIndex, point = {}){
  const safeShapeId = String(shapeId || "").trim();
  const safePointIndex = Math.trunc(Number(pointIndex));
  if (!safeShapeId || !Number.isFinite(safePointIndex) || safePointIndex < 0) return null;
  const shape = (Array.isArray(widget?.state?.shapes) ? widget.state.shapes : [])
    .find((shape) => shape.id === safeShapeId);
  const points = (Array.isArray(shape?.points) ? shape.points : []).map((item) => ({ ...item }));
  if (!points[safePointIndex]) return null;
  points[safePointIndex] = {
    x: Number(point.x) || 0,
    y: Number(point.y) || 0
  };
  return getDrawingLayerGeometryForShapePoints(widget, safeShapeId, points);
}

function scaleDrawingPoint(point = {}, scaleX = 1, scaleY = 1){
  return {
    x: (Number(point.x) || 0) * scaleX,
    y: (Number(point.y) || 0) * scaleY
  };
}

function getScaledDrawingLayerState(state = {}, nextLayout = {}){
  const nextWidth = Math.max(1, (Number(nextLayout.width) || 0) * currentSceneWidth);
  const nextHeight = Math.max(1, (Number(nextLayout.height) || 0) * currentSceneHeight);
  const startWidth = Math.max(1, Number(state.width) || nextWidth);
  const startHeight = Math.max(1, Number(state.height) || nextHeight);
  const scaleX = nextWidth / startWidth;
  const scaleY = nextHeight / startHeight;

  return {
    ...state,
    width: nextWidth,
    height: nextHeight,
    paths: (Array.isArray(state.paths) ? state.paths : []).map((path) => ({
      ...path,
      points: (Array.isArray(path.points) ? path.points : []).map((point) => scaleDrawingPoint(point, scaleX, scaleY))
    })),
    shapes: (Array.isArray(state.shapes) ? state.shapes : []).map((shape) => ({
      ...shape,
      points: (Array.isArray(shape.points) ? shape.points : []).map((point) => scaleDrawingPoint(point, scaleX, scaleY))
    }))
  };
}

function getDrawingLayerGeometryForLayout(widget, nextLayout = {}, startState = null){
  if (widget?.toolId !== "drawing-layer") return null;
  const layout = normalizeDrawingLayerTransformLayout(nextLayout);
  const state = getScaledDrawingLayerState(startState || widget.state || {}, layout);
  return { layout, state };
}

function getResizeHandleSigns(handle = ""){
  const safeHandle = String(handle || "").trim();
  return {
    signX: safeHandle.includes("e") ? 1 : (safeHandle.includes("w") ? -1 : 0),
    signY: safeHandle.includes("s") ? 1 : (safeHandle.includes("n") ? -1 : 0)
  };
}

function getDrawingLayerResizeSnapshot(widget, layout = {}, state = {}, handle = "se"){
  if (widget?.toolId !== "drawing-layer") return null;
  const { signX, signY } = getResizeHandleSigns(handle);
  if (!signX && !signY) return null;

  const safeLayout = normalizeDrawingLayerTransformLayout(layout);
  const startWidth = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, Number(state.width) || safeLayout.width * currentSceneWidth);
  const startHeight = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, Number(state.height) || safeLayout.height * currentSceneHeight);
  const center = {
    x: (safeLayout.x + safeLayout.width / 2) * currentSceneWidth,
    y: (safeLayout.y + safeLayout.height / 2) * currentSceneHeight
  };
  const rotation = getDrawingRotation(state);
  const anchorLocal = {
    x: signX > 0 ? 0 : (signX < 0 ? startWidth : startWidth / 2),
    y: signY > 0 ? 0 : (signY < 0 ? startHeight : startHeight / 2)
  };
  const anchorOffset = {
    x: anchorLocal.x - startWidth / 2,
    y: anchorLocal.y - startHeight / 2
  };
  const rotatedAnchorOffset = rotateSceneVector(anchorOffset, rotation);

  return {
    signX,
    signY,
    rotation,
    startState: JSON.parse(JSON.stringify(state || {})),
    startWidth,
    startHeight,
    anchorLocal,
    ratio: isOneToOneDrawingShape(getPrimaryDrawingShape(widget))
      ? 1
      : startWidth / Math.max(1, startHeight),
    anchorScene: {
      x: center.x + rotatedAnchorOffset.x,
      y: center.y + rotatedAnchorOffset.y
    }
  };
}

function getCornerResizeSize(snapshot, proposedWidth, proposedHeight){
  const ratio = Number(snapshot.ratio) > 0 ? Number(snapshot.ratio) : 1;
  const rawSignX = Math.sign(proposedWidth || 1);
  const rawSignY = Math.sign(proposedHeight || 1);
  const widthMagnitude = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, Math.abs(proposedWidth));
  const heightMagnitude = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, Math.abs(proposedHeight));
  const widthChange = Math.abs((widthMagnitude - snapshot.startWidth) / Math.max(1, snapshot.startWidth));
  const heightChange = Math.abs((heightMagnitude - snapshot.startHeight) / Math.max(1, snapshot.startHeight));
  let width = widthMagnitude;
  let height = heightMagnitude;

  if (heightChange > widthChange) {
    height = heightMagnitude;
    width = height * ratio;
  } else {
    width = widthMagnitude;
    height = width / ratio;
  }

  return {
    width: rawSignX * Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, width),
    height: rawSignY * Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, height)
  };
}

function transformDrawingLayerStateForResize(snapshot, signedWidth, signedHeight){
  const nextWidth = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, Math.abs(signedWidth));
  const nextHeight = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, Math.abs(signedHeight));
  const scaleX = snapshot.signX ? signedWidth / Math.max(1, snapshot.startWidth) : 1;
  const scaleY = snapshot.signY ? signedHeight / Math.max(1, snapshot.startHeight) : 1;
  const offsetX = snapshot.signX
    ? (snapshot.signX > 0
        ? (signedWidth < 0 ? nextWidth : 0)
        : (signedWidth < 0 ? 0 : nextWidth))
    : 0;
  const offsetY = snapshot.signY
    ? (snapshot.signY > 0
        ? (signedHeight < 0 ? nextHeight : 0)
        : (signedHeight < 0 ? 0 : nextHeight))
    : 0;
  const transformPoint = (point) => ({
    x: snapshot.signX
      ? ((Number(point.x) || 0) - snapshot.anchorLocal.x) * scaleX + offsetX
      : (Number(point.x) || 0),
    y: snapshot.signY
      ? ((Number(point.y) || 0) - snapshot.anchorLocal.y) * scaleY + offsetY
      : (Number(point.y) || 0)
  });
  return {
    ...snapshot.startState,
    width: nextWidth,
    height: nextHeight,
    paths: (Array.isArray(snapshot.startState.paths) ? snapshot.startState.paths : []).map((path) => ({
      ...path,
      points: (Array.isArray(path.points) ? path.points : []).map(transformPoint)
    })),
    shapes: (Array.isArray(snapshot.startState.shapes) ? snapshot.startState.shapes : []).map((shape) => ({
      ...shape,
      points: (Array.isArray(shape.points) ? shape.points : []).map(transformPoint)
    }))
  };
}

function getDrawingLayerResizeGeometryFromEvent(widget, snapshot, event){
  if (!widget || !snapshot) return null;
  const pointer = snapStagePointToGrid(getStagePointFromEvent(event, { clampToScene: false }));
  const localVector = rotateSceneVector({
    x: pointer.x - snapshot.anchorScene.x,
    y: pointer.y - snapshot.anchorScene.y
  }, -snapshot.rotation);

  let nextWidth = snapshot.signX
    ? snapshot.signX * localVector.x
    : snapshot.startWidth;
  let nextHeight = snapshot.signY
    ? snapshot.signY * localVector.y
    : snapshot.startHeight;

  if (snapshot.signX && snapshot.signY) {
    const size = getCornerResizeSize(snapshot, nextWidth, nextHeight);
    nextWidth = size.width;
    nextHeight = size.height;
  }

  if (!snapshot.signX) nextWidth = snapshot.startWidth;
  if (!snapshot.signY) nextHeight = snapshot.startHeight;
  const nextState = transformDrawingLayerStateForResize(snapshot, nextWidth, nextHeight);
  const safeWidth = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, Math.abs(nextWidth));
  const safeHeight = Math.max(DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX, Math.abs(nextHeight));
  const anchorNew = {
    x: snapshot.signX
      ? (snapshot.signX > 0
          ? (nextWidth < 0 ? safeWidth : 0)
          : (nextWidth < 0 ? 0 : safeWidth))
      : safeWidth / 2,
    y: snapshot.signY
      ? (snapshot.signY > 0
          ? (nextHeight < 0 ? safeHeight : 0)
          : (nextHeight < 0 ? 0 : safeHeight))
      : safeHeight / 2
  };
  const nextAnchorOffset = {
    x: anchorNew.x - safeWidth / 2,
    y: anchorNew.y - safeHeight / 2
  };
  const rotatedAnchorOffset = rotateSceneVector(nextAnchorOffset, snapshot.rotation);
  const center = {
    x: snapshot.anchorScene.x - rotatedAnchorOffset.x,
    y: snapshot.anchorScene.y - rotatedAnchorOffset.y
  };
  const layout = normalizeDrawingLayerTransformLayout({
    x: (center.x - safeWidth / 2) / Math.max(1, currentSceneWidth),
    y: (center.y - safeHeight / 2) / Math.max(1, currentSceneHeight),
    width: safeWidth / Math.max(1, currentSceneWidth),
    height: safeHeight / Math.max(1, currentSceneHeight)
  });

  return { layout, state: nextState };
}

function cycleLineArrowLocally(widgetId, shapeId){
  const modes = ["none", "end", "start", "both"];
  return setDrawingLayerStateLocally(widgetId, (state) => ({
    ...state,
    shapes: (Array.isArray(state.shapes) ? state.shapes : []).map((shape) => {
      if (shape.id !== shapeId || shape.kind !== "line") return shape;
      const index = modes.indexOf(String(shape.arrowMode || "none"));
      return { ...shape, arrowMode: modes[(index + 1 + modes.length) % modes.length] };
    })
  }));
}

function setDrawingRotationLocally(widgetId, rotation){
  return setDrawingLayerStateLocally(widgetId, (state) => ({
    ...state,
    rotation: clamp(rotation, -3600, 3600)
  }));
}

function startDrawingPointDrag(event, frame, widget, shapeId, pointIndex){
  if (!frame || !widget || isSceneLocked() || isWidgetLocked(widget)) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const liveWidget = getWidgetById(widget.id) || widget;
  const shape = getPrimaryDrawingShape(liveWidget);
  const startState = JSON.parse(JSON.stringify(liveWidget.state || {}));
  dragState = {
    mode: "drawing-point",
    pointerId: event.pointerId,
    frame,
    widgetId: widget.id,
    shapeId,
    pointIndex,
    isLinePointDrag: shape?.id === shapeId && shape.kind === "line",
    variant: shape?.variant || "",
    startLayout: normalizeDrawingLayerTransformLayout(liveWidget.layout || {}),
    startState,
    hasStarted: true,
    didMove: false
  };
  selectWidgetLocally(widget.id);
  frame.classList.add("is-dragging");
  bindDragListeners();
  try { frame.setPointerCapture?.(event.pointerId); } catch {}
  event.preventDefault();
}

function startDrawingAdjustDrag(event, frame, widget, shapeId, adjustMode = "move-top"){
  if (!frame || !widget || isSceneLocked() || isWidgetLocked(widget)) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const liveWidget = getWidgetById(widget.id) || widget;
  const shape = getPrimaryDrawingShape(liveWidget);
  if (!shape) return;
  const startState = JSON.parse(JSON.stringify(liveWidget.state || {}));
  dragState = {
    mode: "drawing-adjust",
    pointerId: event.pointerId,
    frame,
    widgetId: widget.id,
    shapeId,
    variant: shape.variant,
    adjustMode: String(adjustMode || "move-top").trim() || "move-top",
    startLocalPoint: getLocalDrawingPointFromClient(frame, liveWidget, event),
    startLayout: normalizeDrawingLayerTransformLayout(liveWidget.layout || {}),
    startState,
    startPoints: (shape.points || []).map((point) => ({ ...point })),
    hasStarted: true,
    didMove: false
  };
  selectWidgetLocally(widget.id);
  frame.classList.add("is-dragging");
  bindDragListeners();
  try { frame.setPointerCapture?.(event.pointerId); } catch {}
  event.preventDefault();
}

function startDrawingRotateDrag(event, frame, widget){
  if (!frame || !widget || isSceneLocked() || isWidgetLocked(widget)) return;
  if (event.pointerType === "mouse" && event.button !== 0) return;
  const rect = frame.getBoundingClientRect();
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI;
  dragState = {
    mode: "drawing-rotate",
    pointerId: event.pointerId,
    frame,
    widgetId: widget.id,
    centerX,
    centerY,
    startAngle,
    startRotation: Number(widget.state?.rotation) || 0,
    currentRotation: Number(widget.state?.rotation) || 0,
    hasStarted: true,
    didMove: false
  };
  selectWidgetLocally(widget.id);
  frame.classList.add("is-dragging", "is-rotating");
  bindDragListeners();
  try { frame.setPointerCapture?.(event.pointerId); } catch {}
  event.preventDefault();
}

function getAdjustedShapePoints(drag, event){
  const widget = {
    toolId: "drawing-layer",
    layout: drag.startLayout,
    state: drag.startState
  };
  const currentPoint = getLocalDrawingPointFromClient(drag.frame, widget, event);
  const dxLocal = currentPoint.x - Number(drag.startLocalPoint?.x ?? currentPoint.x);
  const points = (drag.startPoints || []).map((point) => ({ ...point }));
  if (points.length < 4) return points;
  if (drag.variant === "parallelogram") {
    points[0].x += dxLocal;
    points[1].x += dxLocal;
  } else if (drag.variant === "trapezoid") {
    if (drag.adjustMode === "resize-top-right") {
      const minTopWidth = DRAWING_LAYER_TRANSFORM_MIN_SIZE_PX;
      points[1].x = Math.max(points[0].x + minTopWidth, points[1].x + dxLocal);
    } else {
      points[0].x += dxLocal;
      points[1].x += dxLocal;
    }
  }
  return points;
}

function syncDrawingLayerResizeHandles(frame, widget, disabled){
  const managedSelector = [
    ".ttp-drawing-transform-box",
    ".ttp-drawing-selection-outline",
    ".ttp-drawing-resize-handle",
    ".ttp-drawing-point-handle",
    ".ttp-drawing-adjust-handle",
    ".ttp-drawing-arrow-toggle",
    ".ttp-drawing-rotation-pill",
    ".ttp-drawing-rotate-handle"
  ].join(",");

  if (!frame || widget?.toolId !== "drawing-layer") {
    frame?.querySelectorAll?.(managedSelector)?.forEach((handle) => handle.remove());
    return;
  }

  frame.querySelectorAll(managedSelector).forEach((handle) => handle.remove());
  if (disabled === true) return;

  const state = widget.state || {};
  const primaryShape = getPrimaryDrawingShape(widget);
  const transformBox = document.createElement("span");
  transformBox.className = "ttp-drawing-transform-box";
  frame.append(transformBox);

  const addSelectionOutline = () => {
    const outline = document.createElement("span");
    outline.className = "ttp-drawing-selection-outline";
    transformBox.append(outline);
  };
  const addRotationPill = () => {
    const rotation = getDrawingRotation(state);
    const pill = document.createElement("span");
    pill.className = "ttp-drawing-rotation-pill";
    pill.textContent = formatDrawingRotationLabel(rotation);
    pill.setAttribute("aria-hidden", "true");
    pill.style.transform = `translate(-50%, -50%) rotate(${-rotation}deg)`;
    transformBox.append(pill);
  };
  const addButton = (className, label) => {
    const button = document.createElement("button");
    button.className = className;
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.dataset.noWidgetDrag = "true";
    transformBox.append(button);
    return button;
  };

  const addResizeHandles = () => {
    const width = Math.max(1, Number(state.width) || 1);
    const height = Math.max(1, Number(state.height) || 1);
    const handles = [
      ["n", { x: width / 2, y: 0 }],
      ["ne", { x: width, y: 0 }],
      ["e", { x: width, y: height / 2 }],
      ["se", { x: width, y: height }],
      ["s", { x: width / 2, y: height }],
      ["sw", { x: 0, y: height }],
      ["w", { x: 0, y: height / 2 }],
      ["nw", { x: 0, y: 0 }]
    ];
    const visibleHandles = isFixedRatioDrawingShape(primaryShape)
      ? handles.filter(([handleId]) => isCornerResizeHandle(handleId))
      : handles;
    visibleHandles.forEach(([handleId, point]) => {
      const handle = addButton("ttp-drawing-resize-handle", `Redimensionner le dessin ${handleId}`);
      handle.dataset.resizeHandle = handleId;
      const position = getPointHandlePosition(state, point);
      handle.style.left = position.left;
      handle.style.top = position.top;
      handle.onpointerdown = (event) => startWidgetResize(event, frame, widget, handleId);
    });
  };

  const addRotationHandle = () => {
    const handle = addButton("ttp-drawing-rotate-handle ttp-material-icon", "Tourner librement le dessin");
    handle.style.left = "50%";
    handle.style.top = "0";
    handle.textContent = "rotate_right";
    handle.onpointerdown = (event) => startDrawingRotateDrag(event, frame, widget);
  };

  addSelectionOutline();
  addRotationPill();

  if (primaryShape?.kind === "line") {
    primaryShape.points.slice(0, 2).forEach((point, index) => {
      const handle = addButton("ttp-drawing-point-handle", index === 0 ? "Déplacer le début du trait" : "Déplacer la fin du trait");
      handle.dataset.pointIndex = String(index);
      const position = getPointHandlePosition(state, point);
      handle.style.left = position.left;
      handle.style.top = position.top;
      handle.onpointerdown = (event) => startDrawingPointDrag(event, frame, widget, primaryShape.id, index);
    });
    const center = getShapeCenterPoint(primaryShape, state);
    const toggle = addButton("ttp-drawing-arrow-toggle ttp-material-icon", "Changer les flèches du trait");
    toggle.textContent = primaryShape.arrowMode === "both" ? "multiple_stop" : primaryShape.arrowMode === "start" ? "keyboard_backspace" : primaryShape.arrowMode === "end" ? "trending_flat" : "remove";
    const position = getPointHandlePosition(state, center);
    toggle.style.left = position.left;
    toggle.style.top = position.top;
    toggle.onclick = (event) => {
      event.preventDefault();
      cycleLineArrowLocally(widget.id, primaryShape.id);
      sendWidgetAction(widget.id, "cycle-line-arrow", { shapeId: primaryShape.id });
    };
    return;
  }

  if (primaryShape?.variant === "triangle-free") {
    primaryShape.points.slice(0, 3).forEach((point, index) => {
      const handle = addButton("ttp-drawing-point-handle", `Déplacer le sommet ${index + 1}`);
      handle.dataset.pointIndex = String(index);
      const position = getPointHandlePosition(state, point);
      handle.style.left = position.left;
      handle.style.top = position.top;
      handle.onpointerdown = (event) => startDrawingPointDrag(event, frame, widget, primaryShape.id, index);
    });
    addRotationHandle();
    return;
  }

  addResizeHandles();

  if (primaryShape?.variant === "parallelogram" || primaryShape?.variant === "trapezoid") {
    const topCenter = primaryShape.points?.[0] && primaryShape.points?.[1]
      ? {
          x: (primaryShape.points[0].x + primaryShape.points[1].x) / 2,
          y: (primaryShape.points[0].y + primaryShape.points[1].y) / 2
        }
      : getShapeCenterPoint(primaryShape, state);
    const adjust = addButton("ttp-drawing-adjust-handle", primaryShape.variant === "parallelogram" ? "Régler l’inclinaison" : "Régler la petite base");
    const position = getPointHandlePosition(state, topCenter);
    adjust.style.left = position.left;
    adjust.style.top = position.top;
    adjust.dataset.adjustMode = "move-top";
    adjust.onpointerdown = (event) => startDrawingAdjustDrag(event, frame, widget, primaryShape.id, "move-top");

    if (primaryShape.variant === "trapezoid" && primaryShape.points?.[1]) {
      const cornerAdjust = addButton("ttp-drawing-adjust-handle", "Régler la longueur de la petite base");
      const cornerPosition = getPointHandlePosition(state, primaryShape.points[1]);
      cornerAdjust.style.left = cornerPosition.left;
      cornerAdjust.style.top = cornerPosition.top;
      cornerAdjust.dataset.adjustMode = "resize-top-right";
      cornerAdjust.onpointerdown = (event) => startDrawingAdjustDrag(event, frame, widget, primaryShape.id, "resize-top-right");
    }
  }

  if (primaryShape?.variant !== "circle") {
    addRotationHandle();
  }
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
  const isActiveDrag = dragState?.widgetId === widget.id && dragState?.hasStarted === true;
  frame.classList.toggle("is-dragging", isActiveDrag);
  frame.classList.toggle("is-rotating", isActiveDrag && dragState?.mode === "drawing-rotate");
  frame.classList.toggle("is-rotated", widget.toolId === "drawing-layer" && hasVisibleDrawingRotation(widget.state || {}));
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
  syncFrameLayoutForView(frame, widget);

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
  `;
  const chromeActions = chrome.querySelector("[data-widget-chrome-actions]");

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
  syncDrawingLayerResizeHandles(frame, widget, sceneLocked || interaction.resize === false || widgetLocked);
  tool.renderProjector?.({
    host: body,
    chromeHost: chromeActions,
    widgetInfoHost: widgetInfo,
    bottomChromeHost: bottomChromeActions,
    state: widget.state,
    widget,
    scene: sceneState,
    sendAction: (action, payload = {}) => sendWidgetAction(widget.id, action, payload),
    selectWidget: () => selectWidgetLocally(widget.id, { notify: true })
  });

  resizeHandle.dataset.resizeHandle = "se";
  resizeHandle.onpointerdown = (event) => startWidgetResize(event, frame, widget, "se");
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
    updateDrawFillColorAvailability();
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
  updateDrawFillColorAvailability();
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
        const messageSelection = nextScene.selectedWidgetId
          && nextScene.widgets.some((widget) => widget.id === nextScene.selectedWidgetId)
          ? nextScene.selectedWidgetId
          : "";
        const keepLocalSelection = sceneState.selectedWidgetId
          && nextScene.widgets.some((widget) => widget.id === sceneState.selectedWidgetId);
        const keepVisibleChrome = visibleChromeWidgetId
          && nextScene.widgets.some((widget) => widget.id === visibleChromeWidgetId && widget.visible !== false);
        sceneState = {
          ...nextScene,
          selectedWidgetId: messageSelection || (keepLocalSelection ? sceneState.selectedWidgetId : "")
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

  channel.send("projector-ready", getProjectorViewportPayload());
  channel.send("request-status", getProjectorViewportPayload());
  sendProjectorViewport({ force: true });
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
btnGrid?.addEventListener("click", (event) => {
  event.preventDefault();
  toggleSnapGridEnabled();
});
gridScaleRange?.addEventListener("input", () => {
  setSnapGridSize(gridScaleRange.value);
});
gridControl?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  setSnapGridPopoverOpen(false);
  btnGrid?.focus?.();
});
btnWidgetbarToggle?.addEventListener("click", toggleWidgetbarCollapsed);
btnDrawbarToggle?.addEventListener("click", toggleDrawbarCollapsed);
btnDrawSelect?.addEventListener("click", () => setActiveDrawTool("select"));
btnDrawPencil?.addEventListener("click", () => setActiveDrawTool("pencil"));
btnDrawHighlighter?.addEventListener("click", () => setActiveDrawTool("highlighter"));
btnDrawLine?.addEventListener("click", () => {
  finalizeDrawingSession();
  setActiveDrawTool("line");
});
btnDrawRectGroup?.addEventListener("click", () => activateShapeVariant(getShapeFamilyForVariant(activeShapeVariant) === "rectangle" ? activeShapeVariant : "rectangle"));
btnDrawTriangleGroup?.addEventListener("click", () => activateShapeVariant(getShapeFamilyForVariant(activeShapeVariant) === "triangle" ? activeShapeVariant : "triangle-free"));
btnDrawRoundGroup?.addEventListener("click", () => activateShapeVariant(getShapeFamilyForVariant(activeShapeVariant) === "round" ? activeShapeVariant : "ellipse"));
drawbar?.querySelectorAll?.("[data-draw-variant]").forEach((button) => {
  button.addEventListener("click", (event) => {
    event.preventDefault();
    activateShapeVariant(button.dataset.drawVariant);
  });
});
drawingCapture?.addEventListener("pointerdown", startDrawingPointer);
drawingCapture?.addEventListener("pointermove", moveDrawingPointer);
drawingCapture?.addEventListener("pointerup", endDrawingPointer);
drawingCapture?.addEventListener("pointercancel", endDrawingPointer);
document.addEventListener("pointerdown", closeSnapGridPopoverFromOutside, true);
document.addEventListener("pointerdown", closeDrawWidthPopoverFromOutside, true);
drawWidthControl?.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  setDrawWidthPopoverOpen(false);
  btnDrawWidth?.focus?.();
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

setDrawbarCollapsed(false);
setActiveDrawTool("select");
syncSnapGridControls();
syncSnapGridButtonState();
initializeDrawbarControls();
startStageFitObserver();
connect();
