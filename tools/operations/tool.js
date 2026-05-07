import * as config from "./config.js";
import { createActivity as createOperationsActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

export default defineTool("operations", "Opérations", {
  version: "1",
  description: "Opérations paramétrables avec saisie clavier.",
  tags: ["maths", "calcul", "clavier", "projection"],
  defaultInstruction: "Calcule cette opération.",
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

  supportsProjectionResponseUi() {
    return {
      boxed: true,
      free: true
    };
  },

  createActivity(context = {}) {
    return createOperationsActivity({
      ...context,
      defaultInstruction: "Calcule cette opération.",
      supportsCustomInstruction: true
    });
  }
});
