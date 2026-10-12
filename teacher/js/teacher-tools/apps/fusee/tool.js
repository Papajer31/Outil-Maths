import { defineTeacherTool } from "../../core/tool-contract.js";
import { applyFuseeAction, normalizeFuseeState } from "./model.js";
import { createFuseeControlPanel } from "./control.js";
import {
  renderFuseeProjector, pauseFuseeProjector, disposeFuseeProjector,
  setFuseeProjectorChromeVisibility
} from "./projector.js";

export const fuseeTeacherTool = defineTeacherTool({
  id:"fusee", label:"La Fusée", icon:"rocket_launch",
  description:"Préparer et projeter le jeu coopératif La Fusée.",
  singleton:true,
  surface:{ background:false, snap:false, annotations:true },
  createInitialState(){ return normalizeFuseeState(); },
  cloneState({ state } = {}){ return normalizeFuseeState(state); },
  applyAction:applyFuseeAction,
  createControlPanel:createFuseeControlPanel,
  renderProjector:renderFuseeProjector,
  onProjectorDeactivate:pauseFuseeProjector,
  disposeProjector:disposeFuseeProjector,
  onProjectorChromeVisibilityChange:setFuseeProjectorChromeVisibility
});
