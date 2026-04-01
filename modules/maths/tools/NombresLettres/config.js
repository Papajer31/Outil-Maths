import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderToolSettingsStack
} from "../../../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  NUMBERS
} from "./model.js";

export function renderToolSettings(container, settings) {
  const cfg = normalizeSettings(settings);

  container.innerHTML = renderToolSettingsStack(
    renderMinMax({
      idPrefix: "nl_values",
      title: "Nombres",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.min,
      maxValue: cfg.max,
      inputMin: 0,
      inputMax: NUMBERS.length - 1,
      step: 1,
      mode: cfg.valueMode,
      startValue: cfg.valueStart,
      stepValue: cfg.valueStep,
      values: cfg.valueList
    })
  );

  bindMinMax(container, "nl_values", {
    inputMin: 0,
    inputMax: NUMBERS.length - 1
  });
}

export function readToolSettings(container) {
  const values = readMinMax(container, "nl_values", {
    inputMin: 0,
    inputMax: NUMBERS.length - 1,
    errorLabel: "Les bornes des nombres"
  });

  return {
    min: values.min,
    max: values.max,
    valueMode: values.mode,
    valueStart: values.start,
    valueStep: values.step,
    valueList: values.values
  };
}

export { getDefaultSettings };
