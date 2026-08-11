import * as config from "./config.js";
import { createActivity as createSegmenterMotsActivity } from "./activity.js";
import { normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const DEFAULT_INSTRUCTION = "Découpe la suite de lettres pour retrouver les mots.";

export default defineTool("segmenter-mots", "Segmenter les mots", {
  version: "1",
  description: "Segmenter une suite continue de lettres pour retrouver les mots sélectionnés dans la banque phonologique.",
  tags: ["français", "lecture", "étude-du-code", "segmentation", "mots", "phonologie", "graphèmes", "tablette", "manipulation", "projection"],
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
    return createSegmenterMotsActivity({
      ...context,
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: false
    });
  }
});
