import * as config from "./config.js";
import { createActivity as createMotCacheActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Retrouve le mot caché dans la grille.";

export default defineTool("mot-cache", "Mot caché", {
  version:"1",
  description:"Retrouver dans une grille de lettres un mot sélectionné dans la banque phonologique.",
  tags:["français", "lecture", "étude-du-code", "phonologie", "graphèmes", "mots-mêlés", "grille", "tablette", "sélection", "projection"],
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
    return createMotCacheActivity({
      ...context,
      defaultInstruction:DEFAULT_INSTRUCTION,
      supportsCustomInstruction:false
    });
  }
});
