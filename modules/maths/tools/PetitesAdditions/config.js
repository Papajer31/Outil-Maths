import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderToolSettingsStack
} from "../../../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  hasAtLeastOnePossibleAddition
} from "./model.js";

export function renderToolSettings(container, settings) {
  const cfg = normalizeSettings(settings);

  container.innerHTML = renderToolSettingsStack(
    renderMinMax({
      idPrefix: "pa_n1",
      title: "Premier terme",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.n1Min,
      maxValue: cfg.n1Max,
      inputMin: 0,
      inputMax: 99,
      step: 1
    }),

    renderMinMax({
      idPrefix: "pa_n2",
      title: "Deuxième terme",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.n2Min,
      maxValue: cfg.n2Max,
      inputMin: 0,
      inputMax: 99,
      step: 1
    }),

    renderMinMax({
      idPrefix: "pa_result",
      title: "Résultat",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.resultMin,
      maxValue: cfg.resultMax,
      inputMin: 0,
      inputMax: 198,
      step: 1
    })
  );

  bindMinMax(container, "pa_n1", { inputMin: 0, inputMax: 99 });
  bindMinMax(container, "pa_n2", { inputMin: 0, inputMax: 99 });
  bindMinMax(container, "pa_result", { inputMin: 0, inputMax: 198 });
}

export function readToolSettings(container) {
  const n1Range = readMinMax(container, "pa_n1", {
    inputMin: 0,
    inputMax: 99,
    errorLabel: "Les bornes du premier terme"
  });

  const n2Range = readMinMax(container, "pa_n2", {
    inputMin: 0,
    inputMax: 99,
    errorLabel: "Les bornes du deuxième terme"
  });

  const resultRange = readMinMax(container, "pa_result", {
    inputMin: 0,
    inputMax: 198,
    errorLabel: "Les bornes du résultat"
  });

  const settings = {
    n1Min: n1Range.min,
    n1Max: n1Range.max,
    n2Min: n2Range.min,
    n2Max: n2Range.max,
    resultMin: resultRange.min,
    resultMax: resultRange.max
  };

  if (!hasAtLeastOnePossibleAddition(settings)) {
    throw new Error("Aucune addition possible avec ces bornes de résultat.");
  }

  return settings;
}

export { getDefaultSettings };
