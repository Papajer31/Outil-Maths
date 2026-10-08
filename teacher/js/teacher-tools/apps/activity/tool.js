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
  pauseActivityProjector,
  renderActivityProjector,
  setActivityProjectorChromeVisibility
} from "./projector.js";

export const activityTeacherTool = defineTeacherTool({
  id: "activity",
  label: "Activité",
  icon: "play_lesson",
  description: "Afficher le runtime de projection d’une activité directement dans le Tableau.",
  singleton: true,
  surface: {
    background: true,
    snap: false,
    annotations: true
  },

  createInitialState(){ return createInitialProjectedActivityState(); },
  createProjectorState({ state, teacherSpace } = {}){
    return createProjectedActivityProjectorState({ state, teacherSpace });
  },
  cloneState({ state } = {}){ return normalizeProjectedActivityState(state); },
  applyAction: applyProjectedActivityAction,
  createControlPanel: createActivityControlPanel,
  renderProjector: renderActivityProjector,
  onProjectorChromeVisibilityChange: setActivityProjectorChromeVisibility,
  onProjectorDeactivate: pauseActivityProjector,
  disposeProjector: disposeActivityProjector
});

export default activityTeacherTool;
