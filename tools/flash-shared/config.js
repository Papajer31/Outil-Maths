import {
  renderRadioGroup,
  renderSection,
  renderStepperField,
  bindCollapsibleSection,
  bindRadio,
  bindStepperField,
  readRadio,
  readStepper
} from "../../shared/config-widgets.js";
import {
  FLASH_DISPLAY_MS_MIN,
  FLASH_DISPLAY_MS_MAX,
  DEFAULT_FLASH_DISPLAY_MS,
  FLASH_PREPARATION_SECONDS_MIN,
  FLASH_PREPARATION_SECONDS_MAX,
  DEFAULT_FLASH_PREPARATION_SECONDS,
  DEFAULT_FLASH_ANSWER_APPEARANCE,
  DEFAULT_FLASH_ALLOW_REPLAY_ONCE,
  normalizeFlashSettings
} from "./model.js";

const FLASH_DISPLAY_STEP_MS = 100;
const FLASH_PREPARATION_STEP_SECONDS = 1;

export function appendFlashSettings(container, settings = {}, {
  advancedContentSelector = "",
  advancedIdPrefix = "flash_advanced"
} = {}) {
  const stack = container?.querySelector?.(".tv-settings-stack");
  if (!stack) return;

  const cfg = normalizeFlashSettings(settings);
  const advancedContent = advancedContentSelector
    ? container.querySelector(advancedContentSelector)
    : null;
  const advancedSection = advancedContent?.closest?.(".tv-group-collapsible") || null;
  const basicHtml = renderFlashDisplaySettings(cfg) + renderFlashPreparationSettings(cfg);

  if (advancedSection) {
    advancedSection.insertAdjacentHTML("beforebegin", basicHtml);
  } else {
    stack.insertAdjacentHTML("beforeend", basicHtml);
  }

  const advancedHtml = renderFlashAdvancedSettings(cfg);
  if (advancedContent) {
    advancedContent.insertAdjacentHTML("beforeend", advancedHtml);
  } else {
    stack.insertAdjacentHTML("beforeend", renderSection("Réglages avancés", advancedHtml, {
      collapsible: true,
      expanded: false,
      idPrefix: advancedIdPrefix
    }));
    bindCollapsibleSection(container, advancedIdPrefix);
  }

  bindFlashSettings(container);
}

export function renderFlashDisplaySettings(settings = {}) {
  const cfg = normalizeFlashSettings(settings);
  return `
    <div class="tv-group tv-group-inline flash-config-display-group">
      ${renderStepperField({
        id: "flash_displayMs",
        label: "Temps d’affichage de l’item (ms)",
        value: cfg.flashDisplayMs || DEFAULT_FLASH_DISPLAY_MS,
        inputMin: FLASH_DISPLAY_MS_MIN,
        inputMax: FLASH_DISPLAY_MS_MAX,
        step: FLASH_DISPLAY_STEP_MS,
        fieldClassName: "flash-config-display-field"
      })}
    </div>
  `;
}

export function renderFlashPreparationSettings(settings = {}) {
  const cfg = normalizeFlashSettings(settings);
  return `
    <div class="tv-group tv-group-inline flash-config-preparation-group">
      ${renderStepperField({
        id: "flash_preparationSeconds",
        label: "Affichage préparatif (s)",
        value: cfg.flashPreparationSeconds || DEFAULT_FLASH_PREPARATION_SECONDS,
        inputMin: FLASH_PREPARATION_SECONDS_MIN,
        inputMax: FLASH_PREPARATION_SECONDS_MAX,
        step: FLASH_PREPARATION_STEP_SECONDS,
        fieldClassName: "flash-config-preparation-field"
      })}
    </div>
  `;
}

export function renderFlashAdvancedSettings(settings = {}) {
  const cfg = normalizeFlashSettings(settings);
  return `
    ${renderRadioGroup({
      title: "Apparition des réponses",
      id: "flash_answerAppearance",
      value: cfg.flashAnswerAppearance,
      options: [
        { value: "direct", label: "Directement" },
        { value: "after_question", label: "Après la question" }
      ]
    })}
    ${renderRadioGroup({
      title: "Revoir l’item une fois",
      id: "flash_allowReplayOnce",
      value: cfg.flashAllowReplayOnce ? "yes" : "no",
      options: [
        { value: "yes", label: "Oui" },
        { value: "no", label: "Non" }
      ]
    })}
  `;
}

export function bindFlashSettings(container) {
  bindStepperField(container, "flash_displayMs", {
    inputMin: FLASH_DISPLAY_MS_MIN,
    inputMax: FLASH_DISPLAY_MS_MAX
  });
  bindStepperField(container, "flash_preparationSeconds", {
    inputMin: FLASH_PREPARATION_SECONDS_MIN,
    inputMax: FLASH_PREPARATION_SECONDS_MAX
  });
  bindRadio(container, "flash_answerAppearance");
  bindRadio(container, "flash_allowReplayOnce");
}

export function readFlashSettings(container, previous = {}) {
  return normalizeFlashSettings({
    ...previous,
    flashDisplayMs: readStepper(container, "flash_displayMs", {
      inputMin: FLASH_DISPLAY_MS_MIN,
      inputMax: FLASH_DISPLAY_MS_MAX
    }),
    flashPreparationSeconds: readStepper(container, "flash_preparationSeconds", {
      inputMin: FLASH_PREPARATION_SECONDS_MIN,
      inputMax: FLASH_PREPARATION_SECONDS_MAX
    }),
    flashAnswerAppearance: readRadio(container, "flash_answerAppearance", DEFAULT_FLASH_ANSWER_APPEARANCE),
    flashAllowReplayOnce: readRadio(
      container,
      "flash_allowReplayOnce",
      DEFAULT_FLASH_ALLOW_REPLAY_ONCE ? "yes" : "no"
    ) === "yes"
  });
}
