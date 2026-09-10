import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  applySeyesAction,
  cloneSeyesState,
  createInitialSeyesState,
  createSeyesProjectorState
} from "./model.js";
import { createSeyesControlPanel } from "./control.js";
import { renderSeyesProjector } from "./projector.js";

export const seyesTeacherTool = defineTeacherTool({
  id: "seyes",
  label: "Seyès",
  icon: "edit_note",
  description: "Écrire en Belle Allure sur un cahier Seyès zoomable.",

  defaultLayout: { x: 0.14, y: 0.10, width: 0.68, height: 0.68 },
  minLayout: { width: 0.28, height: 0.28 },
  interaction: {
    moveMode: "chrome",
    resize: true,
    canCollapse: true,
    canStage: true
  },

  createInitialState(){
    return createInitialSeyesState();
  },

  createProjectorState({ state } = {}){
    return createSeyesProjectorState({ state });
  },

  cloneState({ state } = {}){
    return cloneSeyesState(state);
  },

  applyAction: applySeyesAction,
  createControlPanel: createSeyesControlPanel,
  renderProjector: renderSeyesProjector
});

export default seyesTeacherTool;
