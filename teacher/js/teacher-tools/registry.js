import { randomStudentTeacherTool } from "./widgets/random-student/tool.js";
import { imageTeacherTool } from "./widgets/image/tool.js";
import { gridTeacherTool } from "./widgets/grid/tool.js";

export const TEACHER_TOOLS = Object.freeze([
  randomStudentTeacherTool,
  imageTeacherTool,
  gridTeacherTool
]);

export function listTeacherTools(){
  return TEACHER_TOOLS.slice();
}

export function getTeacherTool(toolId){
  const safeToolId = String(toolId || "").trim();
  return TEACHER_TOOLS.find((tool) => tool.id === safeToolId) || null;
}
