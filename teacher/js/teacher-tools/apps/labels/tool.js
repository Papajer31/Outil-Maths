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
  label: "Étiquettes Texte",
  icon: "label",
  description: "Créer, mettre en forme et déplacer librement des étiquettes texte sur le Tableau.",
  surface: {
    background: true,
    snap: false,
    annotations: true
  },

  createInitialState(){ return createInitialLabelsState(); },
  createProjectorState({ state } = {}){ return createLabelsProjectorState({ state }); },
  cloneState({ state } = {}){ return cloneLabelsState(state); },
  applyAction: applyLabelsAction,
  createControlPanel: createLabelsControlPanel,
  renderProjector: renderLabelsProjector
});

export default labelsTeacherTool;
