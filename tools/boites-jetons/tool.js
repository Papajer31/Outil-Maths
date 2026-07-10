import * as config from "./config.js";
import { createActivity as createBoitesJetonsActivity } from "./activity.js";
import { EXERCISE_TYPES, normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Clique sur les boites pour trouver 3 solutions.";

export default defineTool("boites-jetons", "Boites à jetons", {
  version: "1",
  description: "Composer une cible en cliquant sur des boites de jetons.",
  tags: ["maths", "calcul", "décomposition", "jetons", "manipulation", "projection"],
  defaultInstruction: DEFAULT_INSTRUCTION,
  supportsCustomInstruction: true,
  workAreaLayout: "stretch",

  getDefaultSettings: config.getDefaultSettings,
  renderToolSettings: config.renderToolSettings,
  readToolSettings: config.readToolSettings,

  buildRuntimeConfig(settings = {}) {
    return normalizeSettings({
      ...settings,
      exerciseType: EXERCISE_TYPES.TOKEN_BOXES,
      tokenBoxes: settings?.tokenBoxes ?? settings
    });
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
    return createBoitesJetonsActivity({
      ...context,
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: true
    });
  }
});
