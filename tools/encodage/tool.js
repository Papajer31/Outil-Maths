import * as config from "./config.js";
import { createActivity as createEncodageActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Encode ce mot.";

export default defineTool("encodage", "Encodage", {
  version: "1",
  description: "Encodage phonographique avec bibliothèque de graphèmes, réponse libre ou en cases et correction différenciée.",
  tags: ["phonologie", "encodage", "graphèmes", "drag-drop", "projection"],
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

  getRunProfile(context = {}) {
    const settings = normalizeSettings(context?.settings);
    if (!Array.isArray(settings.graphOrder) || settings.graphOrder.length === 0) {
      return {
        blockingMessage: "Aucun graphème n’est sélectionné pour cette activité."
      };
    }

    return {
      requiresStudent: false,
      allowedStudentIds: [],
      blockingMessage: ""
    };
  },

  createActivity(context = {}) {
    return createEncodageActivity({
      ...context,
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: true
    });
  }
});
