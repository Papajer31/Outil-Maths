import * as config from "./config.js";
import { createActivity } from "./activity.js";
import { getInstruction, normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Que va manger le crocodile ?";

export default defineTool("comparaison-signes", "Comparaison (introduction)", {
  version: "1",
  description: "Comparer deux valeurs, représentées par des collections ou des nombres, avec le crocodile ou les signes < et >.",
  tags: ["maths", "nombres", "comparaison", "collections", "crocodile", "inferieur", "superieur", "projection"],
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
    const settings = normalizeSettings(context?.settings);
    return createActivity({
      ...context,
      defaultInstruction: getInstruction(settings.mode),
      supportsCustomInstruction: true
    });
  }
});
