import * as config from "./config.js";
import { createActivity as createTablesMultiplicationActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

export default defineTool("tables-multiplication", "Tables de multiplication", {
  version: "1",
  description: "Travailler les tables de multiplication avec une réponse numérique simple.",
  tags: ["maths", "calcul", "tables", "multiplication", "clavier", "projection"],
  defaultInstruction: "Écris le résultat.",
  supportsCustomInstruction: true,

  getDefaultSettings: config.getDefaultSettings,
  renderToolSettings: config.renderToolSettings,
  readToolSettings: config.readToolSettings,

  buildRuntimeConfig(settings = {}) {
    return normalizeSettings(settings);
  },

  getActivityModeProfile() {
    return {
      individual: { supported: true },
      group: { supported: true }
    };
  },

  getRuntimeCapabilities() {
    return {
      questionPhase: "required",
      answerPhase: "required",
      transitionPhase: "required",
      supportedAdvanceModes: ["auto", "user", "tool"],
      supportedTimingModes: ["engine"],
      supportsCommonFlowSettings: true
    };
  },

  createActivity(context = {}) {
    return createTablesMultiplicationActivity({
      ...context,
      defaultInstruction: "Écris le résultat.",
      supportsCustomInstruction: true
    });
  }
});
