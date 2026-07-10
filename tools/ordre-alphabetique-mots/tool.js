import * as config from "./config.js";
import { createActivity as createOrdreAlphabetiqueMotsActivity } from "./activity.js";
import { LIST_TYPES, normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Range les mots dans l’ordre alphabétique.";

export default defineTool("ordre-alphabetique-mots", "Ordre alphabétique — Mots", {
  version: "1",
  description: "Ranger des mots dans l’ordre alphabétique par manipulation.",
  tags: ["vocabulaire", "alphabet", "mots", "glisser-deposer", "projection"],
  defaultInstruction: DEFAULT_INSTRUCTION,
  supportsCustomInstruction: true,

  getDefaultSettings: config.getDefaultSettings,
  renderToolSettings: config.renderToolSettings,
  readToolSettings: config.readToolSettings,

  buildRuntimeConfig(settings = {}) {
    return normalizeSettings({
      ...settings,
      listType: LIST_TYPES.WORDS
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
    return createOrdreAlphabetiqueMotsActivity({
      ...context,
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: true
    });
  }
});
