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
  surface: {
    background: false,
    snap: false,
    annotations: true
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
