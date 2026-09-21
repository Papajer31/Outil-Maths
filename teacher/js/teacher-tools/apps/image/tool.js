import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  applyImageAction,
  cloneImageState,
  createImageProjectorState,
  createInitialImageState,
  disposeImageState
} from "./model.js";
import { createImageControlPanel } from "./control.js";
import { renderImageProjector } from "./projector.js";

export const imageTeacherTool = defineTeacherTool({
  id: "image",
  label: "Image",
  icon: "image",
  description: "Afficher une image en plein écran, la zoomer et la déplacer.",
  surface: {
    background: true,
    snap: false,
    annotations: true
  },

  createInitialState(){ return createInitialImageState(); },
  createProjectorState({ state } = {}){ return createImageProjectorState({ state }); },
  cloneState({ state } = {}){ return cloneImageState(state); },
  disposeState({ state } = {}){ disposeImageState(state); },
  applyAction: applyImageAction,
  createControlPanel: createImageControlPanel,
  renderProjector: renderImageProjector
});

export default imageTeacherTool;
