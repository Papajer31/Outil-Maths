import * as config from "./config.js";
import { createActivity as createReperageOccurrencesActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Clique sur toutes les occurrences de la chaîne demandée.";

export default defineTool("reperage-occurrences", "Repérage personnalisé", {
  version:"2",
  description:"Repérer toutes les occurrences d’une cible tirée parmi plusieurs possibilités personnalisées.",
  tags:["français", "lecture", "étude-du-code", "discrimination-visuelle", "lettres", "graphèmes", "mots", "sélection", "projection"],
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
    return createReperageOccurrencesActivity({
      ...context,
      defaultInstruction:DEFAULT_INSTRUCTION,
      supportsCustomInstruction:false
    });
  }
});
