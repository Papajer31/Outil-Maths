import * as config from "./config.js";
import { createActivity as createRepresentationDecimaleActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Donne la réponse.";

export default defineTool("representation-decimale", "Représentation décimale", {
  version: "1",
  description: "Faire correspondre un nombre et sa représentation décimale dans plusieurs thèmes visuels.",
  tags: ["maths", "nombres", "svg", "representation", "projection"],
  defaultInstruction: DEFAULT_INSTRUCTION,
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
    return createRepresentationDecimaleActivity({
      ...context,
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: true
    });
  }
});
