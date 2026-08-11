import * as config from "./config.js";
import { createActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Recompose les mots avec les syllabes.";

export default defineTool("recomposer-mots-syllabes", "Recomposer les mots", {
  version:"1",
  description:"Recomposer plusieurs mots en répartissant et en ordonnant leurs syllabes dans des zones de réponse.",
  tags:["français", "lecture", "étude-du-code", "syllabes", "mots", "phonologie", "graphèmes", "tablette", "manipulation", "projection"],
  defaultInstruction:DEFAULT_INSTRUCTION,
  supportsCustomInstruction:false,

  getDefaultSettings:config.getDefaultSettings,
  renderToolSettings:config.renderToolSettings,
  readToolSettings:config.readToolSettings,

  buildRuntimeConfig(settings = {}) {
    return normalizeSettings(settings);
  },

  getActivityModeProfile() {
    return {
      individual:{ supported:true },
      group:{ supported:true }
    };
  },

  getRuntimeCapabilities() {
    return {
      questionPhase:"required",
      answerPhase:"required",
      transitionPhase:"required",
      supportedAdvanceModes:["auto", "user", "tool"],
      supportedTimingModes:["engine"],
      supportsCommonFlowSettings:true
    };
  },

  createActivity(context = {}) {
    return createActivity({
      ...context,
      defaultInstruction:DEFAULT_INSTRUCTION,
      supportsCustomInstruction:false
    });
  }
});
