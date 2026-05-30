import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  applyGridAction,
  cloneGridState,
  createGridProjectorState,
  createInitialGridState
} from "./model.js";
import { createGridControlPanel } from "./control.js";
import { renderGridProjector } from "./projector.js";

export const gridTeacherTool = defineTeacherTool({
  id: "grid",
  label: "Grille",
  icon: "grid_on",
  description: "Afficher une grille redimensionnable, utile comme fond ou support de manipulation.",

  defaultLayout: { x: 0.18, y: 0.18, width: 0.56, height: 0.44 },
  minLayout: { width: 0.16, height: 0.12 },
  interaction: {
    moveMode: "body",
    resize: true,
    canCollapse: true,
    canStage: true
  },

  createInitialState(){
    return createInitialGridState();
  },

  createProjectorState({ state } = {}){
    return createGridProjectorState({ state });
  },

  cloneState({ state } = {}){
    return cloneGridState(state);
  },

  applyAction: applyGridAction,
  createControlPanel: createGridControlPanel,
  renderProjector: renderGridProjector
});

export default gridTeacherTool;
