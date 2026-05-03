import * as config from "./config.js";
import { createActivity as createOperationsTrousActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

export default defineTool("operations-trous", "Opérations à trous", {
  version: "1",
  description: "Retrouver le terme manquant dans une opération.",
  tags: ["maths", "calcul", "operation", "trou", "clavier", "projection"],
  defaultInstruction: "Retrouve le nombre manquant.",
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
      group: { supported: true },
      projection: { supported: true }
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
    return createOperationsTrousActivity({
      ...context,
      defaultInstruction: "Retrouve le nombre manquant.",
      supportsCustomInstruction: true
    });
  }
});
