import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  applyRandomDrawAction,
  createInitialRandomDrawState,
  createRandomDrawProjectorState
} from "./model.js";
import { createRandomStudentControlPanel } from "./control.js";
import { renderRandomStudentProjector, renderRandomStudentQuickActions } from "./projector.js";

export const randomStudentTeacherTool = defineTeacherTool({
  id: "random-draw",
  label: "Tirage au sort",
  icon: "casino",
  description: "Tirer au sort n’importe quelle liste, ou remplir la liste avec les élèves de la classe.",
  surface: {
    background: true,
    snap: false,
    annotations: true
  },

  createInitialState(){ return createInitialRandomDrawState(); },
  createProjectorState({ state } = {}){ return createRandomDrawProjectorState({ state }); },
  applyAction: applyRandomDrawAction,
  createControlPanel: createRandomStudentControlPanel,
  renderProjector: renderRandomStudentProjector,
  renderQuickActions: renderRandomStudentQuickActions
});

export default randomStudentTeacherTool;
