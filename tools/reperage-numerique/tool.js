import * as config from "./config.js";
import { createActivity as createReperageNumeriqueActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Repère le nombre sur la droite.";

export default defineTool("reperage-numerique", "Repérage numérique", {
  version: "1",
  description: "Lire et placer des nombres sur une frise Picbille ou une droite graduée.",
  tags: ["maths", "nombres", "droite-graduee", "picbille", "projection"],
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
    return createReperageNumeriqueActivity({
      ...context,
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: true
    });
  }
});
