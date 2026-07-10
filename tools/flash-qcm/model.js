import {
  getDefaultSettings as getDefaultQcmSettings,
  normalizeSettings as normalizeQcmSettings
} from "../qcm/model.js";
import {
  getDefaultFlashSettings,
  normalizeFlashSettings
} from "../flash-shared/model.js";

export function getDefaultSettings() {
  return {
    ...getDefaultQcmSettings(),
    ...getDefaultFlashSettings()
  };
}

export function normalizeSettings(settings = {}) {
  return {
    ...normalizeQcmSettings(settings),
    ...normalizeFlashSettings(settings)
  };
}
