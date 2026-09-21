import * as config from "./config.js";
import { createActivity as createIdentifierVerbeActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Clique sur tous les verbes.";

export default defineTool("identifier-verbe", "Identifier le verbe", {
  version:"1",
  description:"Identifier des verbes à l’infinitif ou conjugués parmi des mots issus de la banque lexicale.",
  tags:["français", "grammaire", "verbe", "conjugaison", "mots", "sélection", "projection"],
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
    return createIdentifierVerbeActivity({
      ...context,
      defaultInstruction:DEFAULT_INSTRUCTION,
      supportsCustomInstruction:false
    });
  }
});
