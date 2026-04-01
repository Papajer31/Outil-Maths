import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  clampInt,
  renderToolSettingsStack,
  refreshStepper,
  setMinMaxBounds
} from "../../../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  hasAtLeastOnePossibleSubtraction
} from "./model.js";

function getMaxAllowedValue(range, fallbackValue = 99) {
  const values = Array.isArray(range?.allowedValues) ? range.allowedValues : [];
  return values.length ? values[values.length - 1] : fallbackValue;
}

function getPossibleSubtractionResultBounds(n1Range, n2Range) {
  const n1Values = Array.isArray(n1Range?.allowedValues) ? n1Range.allowedValues : [];
  const n2Values = Array.isArray(n2Range?.allowedValues) ? n2Range.allowedValues : [];

  let min = Infinity;
  let max = -Infinity;

  for (const a of n1Values) {
    for (const b of n2Values) {
      if (b > a) continue;
      const diff = a - b;
      if (diff < min) min = diff;
      if (diff > max) max = diff;
    }
  }

  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    return {
      min: 0,
      max: getMaxAllowedValue(n1Range, 99)
    };
  }

  return { min, max };
}

function readN1Range(container) {
  return readMinMax(container, "ps_n1", {
    inputMin: 0,
    inputMax: 99,
    errorLabel: "Les bornes du premier terme"
  });
}

function readN2Range(container, n1EffectiveMax) {
  return readMinMax(container, "ps_n2", {
    inputMin: 0,
    inputMax: n1EffectiveMax,
    errorLabel: "Les bornes du deuxième terme"
  });
}

export function renderToolSettings(container, settings) {
  const cfg = normalizeSettings(settings);

  container.innerHTML = renderToolSettingsStack(
    renderMinMax({
      idPrefix: "ps_n1",
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
      idPrefix: "ps_n2",
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
      idPrefix: "ps_result",
      title: "Résultat",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.resultMin,
      maxValue: cfg.resultMax,
      inputMin: 0,
      inputMax: 99,
      step: 1,
      mode: cfg.resultMode,
      startValue: cfg.resultStart,
      stepValue: cfg.resultStep,
      values: cfg.resultList
    })
  );

  bindMinMax(container, "ps_n1", { inputMin: 0, inputMax: 99 });
  bindMinMax(container, "ps_n2", { inputMin: 0, inputMax: 99 });
  bindMinMax(container, "ps_result", { inputMin: 0, inputMax: 99 });

  const n1MinEl = container.querySelector("#ps_n1_min");
  const n1MaxEl = container.querySelector("#ps_n1_max");
  const n1StartEl = container.querySelector("#ps_n1_start");
  const n2MinEl = container.querySelector("#ps_n2_min");
  const n2MaxEl = container.querySelector("#ps_n2_max");
  const n2StartEl = container.querySelector("#ps_n2_start");

  const syncSpecific = () => {
    [n1MinEl, n1MaxEl, n1StartEl].forEach((el) => {
      if (!el) return;
      el.value = String(clampInt(el.value, 0, 99));
    });

    if (Number(n1MinEl?.value) > Number(n1MaxEl?.value)) {
      n1MinEl.value = n1MaxEl.value;
    }

    const n1Range = readN1Range(container);
    const currentN1Max = getMaxAllowedValue(n1Range, clampInt(n1MaxEl?.value, 0, 99));

    [n2MinEl, n2MaxEl, n2StartEl].forEach((el) => {
      if (!el) return;
      el.max = String(currentN1Max);
      el.value = String(clampInt(el.value, 0, currentN1Max));
    });

    if (Number(n2MinEl?.value) > Number(n2MaxEl?.value)) {
      n2MinEl.value = n2MaxEl.value;
    }

    [
      "ps_n1_min", "ps_n1_max", "ps_n1_start",
      "ps_n2_min", "ps_n2_max", "ps_n2_start"
    ].forEach((id) => {
      refreshStepper(container, id, {
        inputMin: 0,
        inputMax: id.startsWith("ps_n1") ? 99 : currentN1Max
      });
    });

    try {
      const n2Range = readN2Range(container, currentN1Max);
      const resultBounds = getPossibleSubtractionResultBounds(n1Range, n2Range);

      setMinMaxBounds(container, "ps_result", {
        inputMin: resultBounds.min,
        inputMax: resultBounds.max
      });
    } catch {
      setMinMaxBounds(container, "ps_result", {
        inputMin: 0,
        inputMax: currentN1Max
      });
    }
  };

  const n1Root = container.querySelector('[data-tv-minmax="ps_n1"]');
  const n2Root = container.querySelector('[data-tv-minmax="ps_n2"]');

  [n1Root, n2Root].forEach((root) => {
    root?.addEventListener("input", syncSpecific);
    root?.addEventListener("change", syncSpecific);
  });

  syncSpecific();
}

export function readToolSettings(container) {
  const n1Range = readN1Range(container);
  const n1EffectiveMax = getMaxAllowedValue(n1Range, n1Range.max);
  const n2Range = readN2Range(container, n1EffectiveMax);
  const resultBounds = getPossibleSubtractionResultBounds(n1Range, n2Range);

  const resultRange = readMinMax(container, "ps_result", {
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

  if (!hasAtLeastOnePossibleSubtraction(settings)) {
    throw new Error("Aucune soustraction possible avec ces réglages.");
  }

  return settings;
}

export { getDefaultSettings };
