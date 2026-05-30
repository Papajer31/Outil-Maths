export const TEACHER_TOOL_VIEW_MODE_NORMAL = "normal";
export const TEACHER_TOOL_VIEW_MODE_COLLAPSED = "collapsed";
export const TEACHER_TOOL_VIEW_MODE_STAGE = "stage";

export const TEACHER_TOOL_MOVE_MODE_BODY = "body";
export const TEACHER_TOOL_MOVE_MODE_CHROME = "chrome";
export const TEACHER_TOOL_MOVE_MODE_NONE = "none";

export const TEACHER_TOOL_DEFAULT_LAYOUT = Object.freeze({
  x: 0.08,
  y: 0.10,
  width: 0.34,
  height: 0.24
});

export const TEACHER_TOOL_DEFAULT_MIN_LAYOUT = Object.freeze({
  width: 0.12,
  height: 0.10
});

export const TEACHER_TOOL_DEFAULT_INTERACTION = Object.freeze({
  moveMode: TEACHER_TOOL_MOVE_MODE_BODY,
  resize: true,
  canCollapse: true,
  canStage: true
});

export function normalizeTeacherToolViewMode(value){
  const safeValue = String(value || "").trim();
  return safeValue === TEACHER_TOOL_VIEW_MODE_COLLAPSED || safeValue === TEACHER_TOOL_VIEW_MODE_STAGE
    ? safeValue
    : TEACHER_TOOL_VIEW_MODE_NORMAL;
}

export function normalizeTeacherToolInteraction(interaction = {}){
  const moveMode = String(interaction?.moveMode || TEACHER_TOOL_DEFAULT_INTERACTION.moveMode).trim();
  return {
    moveMode: moveMode === TEACHER_TOOL_MOVE_MODE_CHROME || moveMode === TEACHER_TOOL_MOVE_MODE_NONE
      ? moveMode
      : TEACHER_TOOL_MOVE_MODE_BODY,
    resize: interaction?.resize !== false,
    canCollapse: interaction?.canCollapse !== false,
    canStage: interaction?.canStage !== false
  };
}

export function getTeacherToolLayout(tool = {}){
  const layout = tool?.defaultLayout && typeof tool.defaultLayout === "object"
    ? tool.defaultLayout
    : TEACHER_TOOL_DEFAULT_LAYOUT;
  return {
    x: Number(layout.x) || TEACHER_TOOL_DEFAULT_LAYOUT.x,
    y: Number(layout.y) || TEACHER_TOOL_DEFAULT_LAYOUT.y,
    width: Number(layout.width) || TEACHER_TOOL_DEFAULT_LAYOUT.width,
    height: Number(layout.height) || TEACHER_TOOL_DEFAULT_LAYOUT.height
  };
}

export function getTeacherToolMinLayout(tool = {}){
  const layout = tool?.minLayout && typeof tool.minLayout === "object"
    ? tool.minLayout
    : TEACHER_TOOL_DEFAULT_MIN_LAYOUT;
  return {
    width: Math.max(0.01, Number(layout.width) || TEACHER_TOOL_DEFAULT_MIN_LAYOUT.width),
    height: Math.max(0.01, Number(layout.height) || TEACHER_TOOL_DEFAULT_MIN_LAYOUT.height)
  };
}

export function getTeacherToolLayoutAspectRatio(tool = {}, context = {}){
  let ratio = 0;
  try {
    if (typeof tool?.getLayoutAspectRatio === "function") {
      ratio = Number(tool.getLayoutAspectRatio(context));
    } else {
      ratio = Number(tool?.layoutAspectRatio);
    }
  } catch {
    ratio = 0;
  }
  return Number.isFinite(ratio) && ratio > 0 ? ratio : 0;
}

export function defineTeacherTool(definition = {}){
  const id = String(definition?.id || "").trim();
  if (!id) {
    throw new Error("Teacher tool id is required.");
  }

  const label = String(definition?.label || id).trim();
  const interaction = normalizeTeacherToolInteraction(definition.interaction);

  return Object.freeze({
    ...definition,
    id,
    label,
    icon: String(definition?.icon || "widgets").trim(),
    description: String(definition?.description || "Widget de tableau interactif.").trim(),
    defaultLayout: getTeacherToolLayout(definition),
    minLayout: getTeacherToolMinLayout(definition),
    defaultLocked: definition?.defaultLocked === true,
    interaction
  });
}
