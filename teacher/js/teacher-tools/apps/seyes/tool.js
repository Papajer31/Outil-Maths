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
  description: "Écrire et préparer un document sur lignage scolaire.",
  surface: {
    background: false,
    snap: false,
    annotations: true
  },

  createInitialState(){ return createInitialSeyesState(); },
  createProjectorState({ state } = {}){ return createSeyesProjectorState({ state }); },
  cloneState({ state } = {}){ return cloneSeyesState(state); },
  applyAction: applySeyesAction,
  createControlPanel: createSeyesControlPanel,
  renderProjector: renderSeyesProjector
});

export default seyesTeacherTool;
