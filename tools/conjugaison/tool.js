import * as config from "./config.js";
import { createActivity as createConjugaisonActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Conjugue le verbe demandé.";

export default defineTool("conjugaison", "Conjugaison", {
  version: "1",
  description: "Questions de conjugaison générées à partir d’une base interne de formes verbales.",
  tags: ["français", "conjugaison", "verbe", "texte", "projection"],
  defaultInstruction: DEFAULT_INSTRUCTION,
  supportsCustomInstruction: true,
  workAreaLayout: "stretch",

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
    return createConjugaisonActivity({
      ...context,
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: true
    });
  }
});
