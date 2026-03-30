import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderToolSettingsStack
} from "../../../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings
} from "./model.js";

export function renderToolSettings(container, settings) {
  const cfg = normalizeSettings(settings);

  container.innerHTML = renderToolSettingsStack(
    renderMinMax({
      idPrefix: "td_base",
      title: "Nombres de base",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.minBase,
      maxValue: cfg.maxBase,
      inputMin: 1,
      inputMax: 99,
      step: 1
    })
  );

  bindMinMax(container, "td_base", {
    inputMin: 1,
    inputMax: 99
  });
}

export function readToolSettings(container) {
  const base = readMinMax(container, "td_base", {
    inputMin: 1,
    inputMax: 99,
    errorLabel: "Les bornes des nombres de base"
  });

  return {
    minBase: base.min,
    maxBase: base.max
  };
}

export { getDefaultSettings };
