import {
  getDefaultSettings as getDefaultQuestionSettings,
  normalizeSettings as normalizeQuestionSettings
} from "../question-reponse/model.js";
import {
  getDefaultFlashSettings,
  normalizeFlashSettings
} from "../flash-shared/model.js";

export function getDefaultSettings() {
  return {
    ...getDefaultQuestionSettings(),
    ...getDefaultFlashSettings()
  };
}

export function normalizeSettings(settings = {}) {
  return {
    ...normalizeQuestionSettings(settings),
    ...normalizeFlashSettings(settings)
  };
}
