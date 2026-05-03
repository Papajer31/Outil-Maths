import * as config from "./config.js";
import { createActivity as createQuestionReponseActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Réponds à la question.";

export default defineTool("question-reponse", "Question/Réponse", {
  version: "1",
  description: "Questions à réponse textuelle courte issues d’une banque de contenus.",
  tags: ["question", "reponse", "texte", "banque", "projection"],
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
    return createQuestionReponseActivity({
      ...context,
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: true
    });
  }
});
