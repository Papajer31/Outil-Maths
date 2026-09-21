import { imageTeacherTool } from "./apps/image/tool.js";
import { pdfTeacherTool } from "./apps/pdf/tool.js";
import { randomStudentTeacherTool } from "./apps/random-student/tool.js";
import { seyesTeacherTool } from "./apps/seyes/tool.js";

// Refonte Tableau : seules les mini-apps déjà remigrées sont enregistrées ici.
// Les anciennes restent dans le projet mais demeurent désactivées jusqu’à leur
// reconstruction sur le contrat commun (page + surface).
export const TEACHER_TOOLS = Object.freeze([
  imageTeacherTool,
  pdfTeacherTool,
  randomStudentTeacherTool,
  seyesTeacherTool
]);

export function listTeacherTools(){
  return TEACHER_TOOLS.slice();
}

export function getTeacherTool(toolId){
  const safeToolId = String(toolId || "").trim();
  return TEACHER_TOOLS.find((tool) => tool.id === safeToolId) || null;
}
