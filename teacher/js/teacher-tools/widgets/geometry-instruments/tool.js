import { defineTeacherTool } from "../../core/tool-contract.js";
import {
  applyGeometryInstrumentsAction,
  cloneGeometryInstrumentsState,
  createGeometryInstrumentsProjectorState,
  createInitialGeometryInstrumentsState
} from "./model.js";
import { createGeometryInstrumentsControlPanel } from "./control.js";
import { renderGeometryInstrumentsProjector } from "./projector.js";

export const geometryInstrumentsTeacherTool = defineTeacherTool({
  id: "geometry-instruments",
  label: "Instruments de géométrie",
  icon: "architecture",
  description: "Manipuler des instruments de géométrie sur la scène : règle, puis équerre, compas et rapporteur.",

  defaultLayout: { x: 0, y: 0, width: 1, height: 1 },
  minLayout: { width: 1, height: 1 },
  interaction: {
    moveMode: "none",
    resize: false,
    canCollapse: false,
    canStage: false
  },

  createInitialState(){
    return createInitialGeometryInstrumentsState();
  },

  createProjectorState({ state } = {}){
    return createGeometryInstrumentsProjectorState({ state });
  },

  cloneState({ state } = {}){
    return cloneGeometryInstrumentsState(state);
  },

  applyAction: applyGeometryInstrumentsAction,
  createControlPanel: createGeometryInstrumentsControlPanel,
  renderProjector: renderGeometryInstrumentsProjector
});

export default geometryInstrumentsTeacherTool;
