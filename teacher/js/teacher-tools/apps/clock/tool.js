import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  applyClockAction,
  cloneClockState,
  createClockProjectorState,
  createInitialClockState
} from "./model.js";
import { createClockControlPanel } from "./control.js";
import { renderClockProjector } from "./projector.js";

export const clockTeacherTool = defineTeacherTool({
  id: "clock",
  label: "Horloge",
  icon: "schedule",
  description: "Afficher une horloge analogique manipulable avec aiguilles synchrones.",
  surface: {
    background: true,
    snap: false,
    annotations: true
  },

  createInitialState(){ return createInitialClockState(); },
  createProjectorState({ state } = {}){ return createClockProjectorState({ state }); },
  cloneState({ state } = {}){ return cloneClockState(state); },
  applyAction: applyClockAction,
  createControlPanel: createClockControlPanel,
  renderProjector: renderClockProjector
});

export default clockTeacherTool;
