import { randomStudentTeacherTool } from "./random-student.js";

export const TEACHER_TOOLS = Object.freeze([
  randomStudentTeacherTool
]);

export function listTeacherTools(){
  return TEACHER_TOOLS.slice();
}

export function getTeacherTool(toolId){
  const safeToolId = String(toolId || "").trim();
  return TEACHER_TOOLS.find((tool) => tool.id === safeToolId) || null;
}
