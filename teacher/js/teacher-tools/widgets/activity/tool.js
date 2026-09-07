import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  applyProjectedActivityAction,
  createInitialProjectedActivityState,
  createProjectedActivityProjectorState,
  normalizeProjectedActivityState
} from "./model.js";
import { createActivityControlPanel } from "./control.js";
import {
  disposeActivityProjector,
  renderActivityProjector
} from "./projector.js";

export const activityTeacherTool = defineTeacherTool({
  id: "activity",
  label: "Activité",
  icon: "play_lesson",
  description: "Projeter une liste d’activités du Catalogue en scène complète.",

  singleton: true,
  canDuplicate: false,
  canLock: false,
  canReorder: false,
  exclusiveStage: true,
  defaultLayout: { x: 0.23, y: 0.28, width: 0.54, height: 0.34 },
  minLayout: { width: 0.36, height: 0.24 },
  interaction: {
    moveMode: "none",
    resize: false,
    canCollapse: false,
    canStage: true
  },

  createInitialState(){
    return createInitialProjectedActivityState();
  },

  createProjectorState({ state, teacherSpace } = {}){
    return createProjectedActivityProjectorState({ state, teacherSpace });
  },

  cloneState({ state } = {}){
    return normalizeProjectedActivityState(state);
  },

  applyAction: applyProjectedActivityAction,
  createControlPanel: createActivityControlPanel,
  renderProjector: renderActivityProjector,
  disposeProjector: disposeActivityProjector
});

export default activityTeacherTool;
