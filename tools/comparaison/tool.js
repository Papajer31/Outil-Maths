import * as config from "./config.js";
import { createActivity } from "./activity.js";
import { getDefaultInstruction, normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Combien de jetons faut-il donner à Minibille ?";

export default defineTool("comparaison", "Comparaison", {
  version: "1",
  description: "Comparer deux collections par correspondance terme à terme pour trouver la différence.",
  tags: ["maths", "nombres", "comparaison", "collections", "différence", "jetons", "tracé", "projection"],
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
    return createActivity({
      ...context,
      defaultInstruction: getDefaultInstruction(context?.settings),
      supportsCustomInstruction: true
    });
  }
});
