import * as config from "./config.js";
import { createActivity as createQcmActivity } from "../qcm/activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Observe l’item, puis choisis la bonne réponse.";

export default defineTool("flash-qcm", "Flash-QCM", {
  version: "1",
  description: "QCM en mode flash : l’item est affiché brièvement puis masqué.",
  tags: ["flash", "qcm", "question", "choix", "banque", "projection"],
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
    return createQcmActivity({
      ...context,
      settings: normalizeSettings(context?.settings),
      flashRuntime: { enabled: true, kind: "qcm" },
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: true
    });
  }
});
