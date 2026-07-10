import { backgroundTeacherTool } from "./widgets/background/tool.js";
import { randomStudentTeacherTool } from "./widgets/random-student/tool.js";
import { imageTeacherTool } from "./widgets/image/tool.js";
import { multiImagesTeacherTool } from "./widgets/multi-images/tool.js";
import { clockTeacherTool } from "./widgets/clock/tool.js";
import { geometryInstrumentsTeacherTool } from "./widgets/geometry-instruments/tool.js";
import { gridTeacherTool } from "./widgets/grid/tool.js";
import { labelsTeacherTool } from "./widgets/labels/tool.js";
import { drawingLayerTeacherTool } from "./widgets/drawing-layer/tool.js";

export const TEACHER_TOOLS = Object.freeze([
  backgroundTeacherTool,
  randomStudentTeacherTool,
  imageTeacherTool,
  multiImagesTeacherTool,
  clockTeacherTool,
  geometryInstrumentsTeacherTool,
  gridTeacherTool,
  labelsTeacherTool,
  drawingLayerTeacherTool
]);

export function listTeacherTools({ includeHidden = false } = {}){
  return TEACHER_TOOLS
    .filter((tool) => includeHidden || tool.hiddenFromPicker !== true)
    .slice();
}

export function getTeacherTool(toolId){
  const safeToolId = String(toolId || "").trim();
  return TEACHER_TOOLS.find((tool) => tool.id === safeToolId) || null;
}
