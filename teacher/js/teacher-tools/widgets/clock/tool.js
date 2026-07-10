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

  defaultLayout: { x: 0.30, y: 0.12, width: 0.34, height: 0.46 },
  minLayout: { width: 0.20, height: 0.28 },
  layoutAspectRatio: 1,
  interaction: {
    moveMode: "body",
    resize: true,
    canCollapse: true,
    canStage: true
  },

  createInitialState(){
    return createInitialClockState();
  },

  createProjectorState({ state } = {}){
    return createClockProjectorState({ state });
  },

  cloneState({ state } = {}){
    return cloneClockState(state);
  },

  applyAction: applyClockAction,
  createControlPanel: createClockControlPanel,
  renderProjector: renderClockProjector
});

export default clockTeacherTool;
