import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  applyRandomStudentAction,
  createInitialRandomStudentState,
  createRandomStudentProjectorState,
  normalizeStudents
} from "./model.js";
import { createRandomStudentControlPanel } from "./control.js";
import { renderRandomStudentProjector } from "./projector.js";

export const randomStudentTeacherTool = defineTeacherTool({
  id: "random-student",
  label: "Tirage élève",
  icon: "casino",
  description: "Tirer au sort un élève de la classe, avec ou sans remise dans le tirage.",

  defaultLayout: { x: 0.30, y: 0.26, width: 0.40, height: 0.30 },
  minLayout: { width: 0.18, height: 0.14 },
  interaction: {
    moveMode: "body",
    resize: true,
    canCollapse: true,
    canStage: true
  },

  createInitialState(){
    return createInitialRandomStudentState();
  },

  createProjectorState({ state, students } = {}){
    return createRandomStudentProjectorState({
      state,
      students: normalizeStudents(students)
    });
  },

  applyAction: applyRandomStudentAction,
  createControlPanel: createRandomStudentControlPanel,
  renderProjector: renderRandomStudentProjector
});

export default randomStudentTeacherTool;
