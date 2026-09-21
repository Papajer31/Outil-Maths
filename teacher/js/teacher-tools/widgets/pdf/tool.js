import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  applyPdfAction,
  clonePdfState,
  createInitialPdfState,
  createPdfProjectorState,
  disposePdfState,
  onPdfSurfaceAction
} from "./model.js";
import { createPdfControlPanel } from "./control.js";
import { renderPdfProjector, renderPdfQuickActions } from "./projector.js";

export const pdfTeacherTool = defineTeacherTool({
  id: "pdf",
  label: "PDF",
  icon: "text_snippet",
  description: "Afficher un PDF, changer de page, zoomer et annoter.",
  surface: {
    background: true,
    snap: false,
    annotations: true
  },

  createInitialState(){ return createInitialPdfState(); },
  createProjectorState({ state } = {}){ return createPdfProjectorState({ state }); },
  cloneState({ state } = {}){ return clonePdfState(state); },
  disposeState({ state } = {}){ disposePdfState(state); },
  applyAction: applyPdfAction,
  onSurfaceAction: onPdfSurfaceAction,
  createControlPanel: createPdfControlPanel,
  renderProjector: renderPdfProjector,
  renderQuickActions: renderPdfQuickActions
});

export default pdfTeacherTool;
