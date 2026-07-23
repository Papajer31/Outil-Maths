import * as config from "./config.js";
import { createActivity as createQuestionReponseActivity } from "../question-reponse/activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Observe l’item, puis réponds.";

export default defineTool("flash-question-reponse", "Flash-Question/Réponse", {
  version: "1",
  description: "Question/Réponse en mode flash : l’item est affiché brièvement puis masqué.",
  tags: ["flash", "questions", "reponses", "texte", "banque", "projection"],
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
    return createQuestionReponseActivity({
      ...context,
      settings: normalizeSettings(context?.settings),
      flashRuntime: { enabled: true, kind: "texte" },
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: true
    });
  }
});
