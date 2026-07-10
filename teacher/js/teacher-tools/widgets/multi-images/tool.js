import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  applyMultiImagesAction,
  cloneMultiImagesState,
  createInitialMultiImagesState,
  createMultiImagesProjectorState,
  disposeMultiImagesState
} from "./model.js";
import { createMultiImagesControlPanel } from "./control.js";
import { renderMultiImagesProjector } from "./projector.js";

export const multiImagesTeacherTool = defineTeacherTool({
  id: "multi-images",
  label: "Multimages",
  icon: "collections",
  description: "Afficher plusieurs images en galerie ou en tableau automatique.",

  defaultLayout: { x: 0.18, y: 0.14, width: 0.46, height: 0.36 },
  minLayout: { width: 0.18, height: 0.16 },
  interaction: {
    moveMode: "body",
    resize: true,
    canCollapse: true,
    canStage: true
  },

  createInitialState(){
    return createInitialMultiImagesState();
  },

  createProjectorState({ state } = {}){
    return createMultiImagesProjectorState({ state });
  },

  cloneState({ state } = {}){
    return cloneMultiImagesState(state);
  },

  disposeState({ state } = {}){
    disposeMultiImagesState(state);
  },

  applyAction: applyMultiImagesAction,
  createControlPanel: createMultiImagesControlPanel,
  renderProjector: renderMultiImagesProjector
});

export default multiImagesTeacherTool;
