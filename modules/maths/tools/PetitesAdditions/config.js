import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderToolSettingsStack,
  setMinMaxBounds
} from "../../../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  hasAtLeastOnePossibleAddition
} from "./model.js";

function getPossibleAdditionResultBounds(n1Range, n2Range) {
  const n1Values = Array.isArray(n1Range?.allowedValues) ? n1Range.allowedValues : [];
  const n2Values = Array.isArray(n2Range?.allowedValues) ? n2Range.allowedValues : [];

  if (!n1Values.length || !n2Values.length) {
    return { min: 0, max: 198 };
  }

  return {
    min: n1Values[0] + n2Values[0],
    max: n1Values[n1Values.length - 1] + n2Values[n2Values.length - 1]
  };
}

function readTermRange(container, idPrefix, errorLabel) {
  return readMinMax(container, idPrefix, {
    inputMin: 0,
    inputMax: 99,
    errorLabel
  });
}

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
      step: 1,
      mode: cfg.n1Mode,
      startValue: cfg.n1Start,
      stepValue: cfg.n1Step,
      values: cfg.n1List
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
      step: 1,
      mode: cfg.n2Mode,
      startValue: cfg.n2Start,
      stepValue: cfg.n2Step,
      values: cfg.n2List
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
      step: 1,
      mode: cfg.resultMode,
      startValue: cfg.resultStart,
      stepValue: cfg.resultStep,
      values: cfg.resultList
    })
  );

  bindMinMax(container, "pa_n1", { inputMin: 0, inputMax: 99 });
  bindMinMax(container, "pa_n2", { inputMin: 0, inputMax: 99 });
  bindMinMax(container, "pa_result", { inputMin: 0, inputMax: 198 });

  const syncResultBounds = () => {
    try {
      const n1Range = readTermRange(container, "pa_n1", "Les bornes du premier terme");
      const n2Range = readTermRange(container, "pa_n2", "Les bornes du deuxième terme");
      const resultBounds = getPossibleAdditionResultBounds(n1Range, n2Range);

      setMinMaxBounds(container, "pa_result", {
        inputMin: resultBounds.min,
        inputMax: resultBounds.max
      });
    } catch {
      setMinMaxBounds(container, "pa_result", {
        inputMin: 0,
        inputMax: 198
      });
    }
  };

  const n1Root = container.querySelector('[data-tv-minmax="pa_n1"]');
  const n2Root = container.querySelector('[data-tv-minmax="pa_n2"]');

  [n1Root, n2Root].forEach((root) => {
    root?.addEventListener("input", syncResultBounds);
    root?.addEventListener("change", syncResultBounds);
  });

  syncResultBounds();
}

export function readToolSettings(container) {
  const n1Range = readTermRange(container, "pa_n1", "Les bornes du premier terme");
  const n2Range = readTermRange(container, "pa_n2", "Les bornes du deuxième terme");
  const resultBounds = getPossibleAdditionResultBounds(n1Range, n2Range);

  const resultRange = readMinMax(container, "pa_result", {
    inputMin: resultBounds.min,
    inputMax: resultBounds.max,
    errorLabel: "Les bornes du résultat"
  });

  const settings = {
    n1Min: n1Range.min,
    n1Max: n1Range.max,
    n1Mode: n1Range.mode,
    n1Start: n1Range.start,
    n1Step: n1Range.step,
    n1List: n1Range.values,
    n2Min: n2Range.min,
    n2Max: n2Range.max,
    n2Mode: n2Range.mode,
    n2Start: n2Range.start,
    n2Step: n2Range.step,
    n2List: n2Range.values,
    resultMin: resultRange.min,
    resultMax: resultRange.max,
    resultMode: resultRange.mode,
    resultStart: resultRange.start,
    resultStep: resultRange.step,
    resultList: resultRange.values
  };

  if (!hasAtLeastOnePossibleAddition(settings)) {
    throw new Error("Aucune addition possible avec ces bornes de résultat.");
  }

  return settings;
}

export { getDefaultSettings };
