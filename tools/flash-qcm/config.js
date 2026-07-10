import {
  renderToolSettings as renderQcmSettings,
  readToolSettings as readQcmSettings
} from "../qcm/config.js";
import { getDefaultSettings, normalizeSettings } from "./model.js";
import { appendFlashSettings, readFlashSettings } from "../flash-shared/config.js";

export function renderToolSettings(container, settings, context = {}) {
  const cfg = normalizeSettings(settings);
  renderQcmSettings(container, cfg, context);
  container.classList.add("flash-config-root", "flash-qcm-config-root");

  appendFlashSettings(container, cfg, {
    advancedContentSelector: "#qcm_advanced_content"
  });
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const qcmSettings = readQcmSettings(container, previous);
  const flashSettings = readFlashSettings(container, previous);
  return normalizeSettings({
    ...qcmSettings,
    ...flashSettings
  });
}

export { getDefaultSettings };
