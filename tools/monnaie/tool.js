import * as config from "./config.js";
import { createActivity as createMonnaieActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Manipule les pièces et les billets pour répondre.";

export default defineTool("monnaie", "Monnaie", {
  version: "1",
  description: "Lire, composer et comparer des sommes avec des pièces et billets manipulables.",
  tags: ["maths", "monnaie", "argent", "manipulation", "projection"],
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

  supportsProjectionResponseUi() {
    return {
      boxed: true,
      free: true
    };
  },

  createActivity(context = {}) {
    return createMonnaieActivity({
      ...context,
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: true
    });
  }
});
