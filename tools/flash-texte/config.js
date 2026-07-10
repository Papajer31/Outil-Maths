import {
  renderToolSettings as renderQuestionSettings,
  readToolSettings as readQuestionSettings
} from "../question-reponse/config.js";
import { getDefaultSettings, normalizeSettings } from "./model.js";
import { appendFlashSettings, readFlashSettings } from "../flash-shared/config.js";

export function renderToolSettings(container, settings, context = {}) {
  const cfg = normalizeSettings(settings);
  renderQuestionSettings(container, cfg, context);
  container.classList.add("flash-config-root", "flash-texte-config-root");

  appendFlashSettings(container, cfg);
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const questionSettings = readQuestionSettings(container, previous);
  const flashSettings = readFlashSettings(container, previous);
  return normalizeSettings({
    ...questionSettings,
    ...flashSettings
  });
}

export { getDefaultSettings };
