import * as config from "./config.js";
import { createActivity as createQuizActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

function getDefaultInstruction(settings = {}){
  const normalized = normalizeSettings(settings);
  return String(normalized.sourceInstruction || normalized.quizSnapshot?.instruction || "").trim();
}

export default defineTool("quiz", "Quiz", {
  version: "1",
  description: "Questions composées librement sur un canevas de widgets.",
  tags: ["quiz", "question", "reponse", "texte", "canevas", "projection"],
  defaultInstruction: "",
  supportsCustomInstruction: false,
  workAreaLayout: "stretch",

  getDefaultSettings: config.getDefaultSettings,
  renderToolSettings: config.renderToolSettings,
  readToolSettings: config.readToolSettings,

  buildRuntimeConfig(settings = {}){
    return normalizeSettings(settings);
  },

  getActivityModeProfile(){
    return {
      individual: { supported: true },
      group: { supported: true }
    };
  },

  getRuntimeCapabilities(){
    return {
      questionPhase: "required",
      answerPhase: "required",
      transitionPhase: "required",
      supportedAdvanceModes: ["auto", "user", "tool"],
      supportedTimingModes: ["engine"],
      supportsCommonFlowSettings: true
    };
  },

  createActivity(context = {}){
    const defaultInstruction = getDefaultInstruction(context?.settings);
    return createQuizActivity({
      ...context,
      defaultInstruction,
      supportsCustomInstruction: false
    });
  }
});
