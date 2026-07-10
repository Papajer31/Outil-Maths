import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  applyLabelsAction,
  cloneLabelsState,
  createInitialLabelsState,
  createLabelsProjectorState
} from "./model.js";
import { createLabelsControlPanel } from "./control.js";
import { renderLabelsProjector } from "./projector.js";

export const labelsTeacherTool = defineTeacherTool({
  id: "labels",
  label: "Étiquettes",
  icon: "label",
  description: "Créer plusieurs étiquettes texte libres, déplaçables sur toute la scène.",

  defaultLayout: { x: 0, y: 0, width: 1, height: 1 },
  minLayout: { width: 1, height: 1 },
  interaction: {
    moveMode: "none",
    resize: false,
    canCollapse: false,
    canStage: false
  },

  createInitialState(){
    return createInitialLabelsState();
  },

  createProjectorState({ state } = {}){
    return createLabelsProjectorState({ state });
  },

  cloneState({ state } = {}){
    return cloneLabelsState(state);
  },

  applyAction: applyLabelsAction,
  createControlPanel: createLabelsControlPanel,
  renderProjector: renderLabelsProjector
});

export default labelsTeacherTool;
