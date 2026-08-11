import * as config from "./config.js";
import { createActivity as createDicteeMuetteActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Écris le mot qui correspond à l’image.";

export default defineTool("dictee-muette", "Dictée muette", {
  version: "1",
  description: "Écrire le mot correspondant à une image de l’Imagier avec plusieurs niveaux d’aide.",
  tags: ["français", "étude-du-code", "encodage", "dictée", "orthographe", "image", "clavier", "projection"],
  defaultInstruction: DEFAULT_INSTRUCTION,
  supportsCustomInstruction: false,

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
    return createDicteeMuetteActivity({
      ...context,
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: false
    });
  }
});
