import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  applyImageAction,
  cloneImageState,
  createImageProjectorState,
  createInitialImageState,
  disposeImageState,
  getImageAspectRatio
} from "./model.js";
import { createImageControlPanel } from "./control.js";
import { renderImageProjector } from "./projector.js";

export const imageTeacherTool = defineTeacherTool({
  id: "image",
  label: "Image",
  icon: "image",
  description: "Afficher une image flottante, sans bordure, zoomable et redimensionnable.",

  defaultLayout: { x: 0.22, y: 0.16, width: 0.30, height: 0.27 },
  minLayout: { width: 0.12, height: 0.12 },
  interaction: {
    moveMode: "body",
    resize: true,
    canCollapse: true,
    canStage: true
  },

  createInitialState(){
    return createInitialImageState();
  },

  createProjectorState({ state } = {}){
    return createImageProjectorState({ state });
  },

  getLayoutAspectRatio({ state } = {}){
    return getImageAspectRatio(state);
  },

  cloneState({ state } = {}){
    return cloneImageState(state);
  },

  disposeState({ state } = {}){
    disposeImageState(state);
  },

  applyAction: applyImageAction,
  createControlPanel: createImageControlPanel,
  renderProjector: renderImageProjector
});

export default imageTeacherTool;
