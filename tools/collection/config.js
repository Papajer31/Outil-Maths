import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderToolSettingsStack,
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderStepperField,
  bindStepperField,
  readStepper
} from "../../shared/config-widgets.js";
import {
  COLLECTION_MODES,
  COLLECTION_MODE_LABELS,
  LIMITS,
  getDefaultSettings,
  normalizeSettings
} from "./model.js";

const MODE_OPTIONS = Object.freeze([
  { value: COLLECTION_MODES.VERIFY, label: COLLECTION_MODE_LABELS[COLLECTION_MODES.VERIFY] },
  { value: COLLECTION_MODES.MATCH_COLLECTION, label: COLLECTION_MODE_LABELS[COLLECTION_MODES.MATCH_COLLECTION] },
  { value: COLLECTION_MODES.NUMBER_TO_COLLECTION, label: COLLECTION_MODE_LABELS[COLLECTION_MODES.NUMBER_TO_COLLECTION] },
  { value: COLLECTION_MODES.NUMBER_LINE, label: COLLECTION_MODE_LABELS[COLLECTION_MODES.NUMBER_LINE] },
  { value: COLLECTION_MODES.WRITE_NUMBER, label: COLLECTION_MODE_LABELS[COLLECTION_MODES.WRITE_NUMBER] }
]);

export function renderToolSettings(container, settings) {
  const cfg = normalizeSettings(settings);
  container.innerHTML = `
    <div class="collection-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Mode de réponse",
          id: "collection_mode",
          value: cfg.mode,
          options: MODE_OPTIONS
        }),
        renderMinMax({
          idPrefix: "collection_numberRange",
          title: "Nombre",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.numberRange.min,
          maxValue: cfg.numberRange.max,
          inputMin: LIMITS.minCount,
          inputMax: LIMITS.maxCount,
          step: 1,
          mode: cfg.numberRange.mode,
          startValue: cfg.numberRange.start,
          stepValue: cfg.numberRange.step,
          values: cfg.numberRange.values
        }),
        renderModeSpecificWidgets(cfg)
      )}
    </div>
  `;

  bindMinMax(container, "collection_numberRange", {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount
  });
  bindStepperField(container, "collection_distractorCount", {
    inputMin: LIMITS.distractorMin,
    inputMax: LIMITS.distractorMax
  });
  bindStepperField(container, "collection_numberLineAmplitude", {
    inputMin: LIMITS.numberLineAmplitudeMin,
    inputMax: LIMITS.numberLineAmplitudeMax
  });
  bindRadio(container, "collection_mode", {
    onChange: () => syncModeWidgets(container)
  });
  syncModeWidgets(container);
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const range = readMinMax(container, "collection_numberRange", {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    errorLabel: "Le nombre"
  });

  return normalizeSettings({
    ...previous,
    mode: readRadio(container, "collection_mode", previous.mode),
    numberRange: range,
    distractorCount: readStepper(container, "collection_distractorCount", {
      inputMin: LIMITS.distractorMin,
      inputMax: LIMITS.distractorMax
    }),
    numberLineAmplitude: readStepper(container, "collection_numberLineAmplitude", {
      inputMin: LIMITS.numberLineAmplitudeMin,
      inputMax: LIMITS.numberLineAmplitudeMax
    })
  });
}

export { getDefaultSettings };

function renderModeSpecificWidgets(cfg) {
  return `
    <div class="tv-group tv-group-inline collection-config-mode-widget" data-collection-mode-widget="${COLLECTION_MODES.MATCH_COLLECTION} ${COLLECTION_MODES.NUMBER_TO_COLLECTION}"${renderModeWidgetState(cfg.mode, COLLECTION_MODES.MATCH_COLLECTION, COLLECTION_MODES.NUMBER_TO_COLLECTION)}>
      ${renderStepperField({
        id: "collection_distractorCount",
        label: "Nombre de distracteurs",
        value: cfg.distractorCount,
        inputMin: LIMITS.distractorMin,
        inputMax: LIMITS.distractorMax,
        step: 1,
        fieldClassName: "tv-stepper-field-inline"
      })}
    </div>
    <div class="tv-group tv-group-inline collection-config-mode-widget" data-collection-mode-widget="${COLLECTION_MODES.NUMBER_LINE}"${renderModeWidgetState(cfg.mode, COLLECTION_MODES.NUMBER_LINE)}>
      ${renderStepperField({
        id: "collection_numberLineAmplitude",
        label: "Amplitude de la file numérique",
        value: cfg.numberLineAmplitude,
        inputMin: LIMITS.numberLineAmplitudeMin,
        inputMax: LIMITS.numberLineAmplitudeMax,
        step: 1,
        fieldClassName: "tv-stepper-field-inline"
      })}
    </div>
  `;
}

function renderModeWidgetState(currentMode, ...widgetModes) {
  return widgetModes.includes(currentMode) ? " aria-hidden=\"false\"" : " hidden aria-hidden=\"true\"";
}

function syncModeWidgets(container) {
  const mode = readRadio(container, "collection_mode", COLLECTION_MODES.VERIFY);
  container.querySelectorAll("[data-collection-mode-widget]").forEach((widget) => {
    const widgetModes = String(widget.dataset.collectionModeWidget || "").split(/\s+/).filter(Boolean);
    const isActive = widgetModes.includes(mode);
    widget.hidden = !isActive;
    widget.setAttribute("aria-hidden", isActive ? "false" : "true");
  });
}
