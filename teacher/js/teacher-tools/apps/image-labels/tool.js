import { defineTeacherTool } from "../../core/tool-contract.js";
import { applyImageLabelsAction, cloneImageLabelsState, createImageLabelsProjectorState, createInitialImageLabelsState, disposeImageLabelsState } from "./model.js";
import { createImageLabelsControlPanel } from "./control.js";
import { disposeImageLabelsProjector, renderImageLabelsProjector } from "./projector.js";

export const imageLabelsTeacherTool = defineTeacherTool({
  id:"image-labels",
  label:"Étiquettes Images",
  icon:"collections",
  description:"Placer, redimensionner, superposer et organiser librement des images sur le Tableau.",
  surface:{ background:true, snap:false, annotations:true },
  createInitialState(){ return createInitialImageLabelsState(); },
  createProjectorState({ state } = {}){ return createImageLabelsProjectorState({ state }); },
  cloneState({ state } = {}){ return cloneImageLabelsState(state); },
  disposeState({ state } = {}){ disposeImageLabelsState(state); },
  applyAction:applyImageLabelsAction,
  createControlPanel:createImageLabelsControlPanel,
  renderProjector:renderImageLabelsProjector,
  onProjectorDeactivate:disposeImageLabelsProjector,
  disposeProjector:disposeImageLabelsProjector
});

export default imageLabelsTeacherTool;
