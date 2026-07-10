import * as config from "./config.js";
import { createActivity } from "./activity.js";
import { EXERCISE_TYPES, normalizeSettings } from "./model.js";
import { defineTool } from "../../shared/tool-contract.js";

const TOOL_ID = "compte-est-bon";
const TOOL_LABEL = "Compte est bon";
const TOOL_MODE = EXERCISE_TYPES.CLASSIC_CHALLENGE;
const DEFAULT_INSTRUCTION = "Atteins le nombre cible.";

export default defineTool(TOOL_ID, TOOL_LABEL, {
  version: "1",
  description: "Atteindre une cible avec six nombres proposés.",
  tags: ["maths", "calcul", "nombre-cible", "manipulation", "projection"],
  defaultInstruction: DEFAULT_INSTRUCTION,
  supportsCustomInstruction: true,
  workAreaLayout: "stretch",

  getDefaultSettings: config.getDefaultSettings,
  renderToolSettings: config.renderToolSettings,
  readToolSettings: config.readToolSettings,

  buildRuntimeConfig(settings = {}) {
    if (TOOL_MODE === EXERCISE_TYPES.TARGETED_CALCULATIONS) {
      return normalizeSettings({
        ...settings,
        exerciseType: EXERCISE_TYPES.TARGETED_CALCULATIONS,
        targetedCalculations: settings?.targetedCalculations ?? settings
      });
    }

    return normalizeSettings({
      ...settings,
      exerciseType: EXERCISE_TYPES.CLASSIC_CHALLENGE,
      classicChallenge: settings?.classicChallenge ?? settings
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
    return createActivity({
      ...context,
      defaultInstruction: DEFAULT_INSTRUCTION,
      supportsCustomInstruction: true
    });
  }
});
