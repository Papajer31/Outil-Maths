import * as config from "./config.js";
import { createActivity as createReperageMotsActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Clique sur toutes les occurrences du mot demandé.";

export default defineTool("reperage-mots", "Repérage de mots", {
  version:"1",
  description:"Repérer toutes les occurrences d’un mot sélectionné dans la banque, parmi des distracteurs graphiquement proches.",
  tags:["français", "lecture", "étude-du-code", "phonologie", "graphèmes", "mots", "discrimination-visuelle", "sélection", "projection"],
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
    return createReperageMotsActivity({
      ...context,
      defaultInstruction:DEFAULT_INSTRUCTION,
      supportsCustomInstruction:false
    });
  }
});
