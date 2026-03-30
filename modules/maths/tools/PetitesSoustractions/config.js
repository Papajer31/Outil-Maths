import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  clampInt,
  renderToolSettingsStack
} from "../../../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  hasAtLeastOnePossibleSubtraction
} from "./model.js";

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
      step: 1
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
      step: 1
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
      step: 1
    })
  );

  bindMinMax(container, "ps_n1", { inputMin: 0, inputMax: 99 });
  bindMinMax(container, "ps_n2", { inputMin: 0, inputMax: 99 });
  bindMinMax(container, "ps_result", { inputMin: 0, inputMax: 99 });

  const n1MinEl = container.querySelector("#ps_n1_min");
  const n1MaxEl = container.querySelector("#ps_n1_max");
  const n2MinEl = container.querySelector("#ps_n2_min");
  const n2MaxEl = container.querySelector("#ps_n2_max");
  const resultMinEl = container.querySelector("#ps_result_min");
  const resultMaxEl = container.querySelector("#ps_result_max");

  const syncSpecific = () => {
    const currentN1Max = clampInt(n1MaxEl?.value, 0, 99);

    if (n2MinEl) n2MinEl.max = String(currentN1Max);
    if (n2MaxEl) n2MaxEl.max = String(currentN1Max);
    if (resultMinEl) resultMinEl.max = String(currentN1Max);
    if (resultMaxEl) resultMaxEl.max = String(currentN1Max);

    if (n2MinEl) n2MinEl.value = String(clampInt(n2MinEl.value, 0, currentN1Max));
    if (n2MaxEl) n2MaxEl.value = String(clampInt(n2MaxEl.value, 0, currentN1Max));
    if (resultMinEl) resultMinEl.value = String(clampInt(resultMinEl.value, 0, currentN1Max));
    if (resultMaxEl) resultMaxEl.value = String(clampInt(resultMaxEl.value, 0, currentN1Max));

    if (Number(n2MinEl?.value) > Number(n2MaxEl?.value)) {
      n2MinEl.value = n2MaxEl.value;
    }

    if (Number(resultMinEl?.value) > Number(resultMaxEl?.value)) {
      resultMinEl.value = resultMaxEl.value;
    }

    if (Number(n1MinEl?.value) > Number(n1MaxEl?.value)) {
      n1MinEl.value = n1MaxEl.value;
    }
  };

  [
    n1MinEl, n1MaxEl,
    n2MinEl, n2MaxEl,
    resultMinEl, resultMaxEl
  ].forEach((el) => {
    el?.addEventListener("input", syncSpecific);
    el?.addEventListener("change", syncSpecific);
  });

  syncSpecific();
}

export function readToolSettings(container) {
  const n1Range = readMinMax(container, "ps_n1", {
    inputMin: 0,
    inputMax: 99,
    errorLabel: "Les bornes du premier terme"
  });

  const n2Range = readMinMax(container, "ps_n2", {
    inputMin: 0,
    inputMax: 99,
    errorLabel: "Les bornes du deuxième terme"
  });

  const resultRange = readMinMax(container, "ps_result", {
    inputMin: 0,
    inputMax: 99,
    errorLabel: "Les bornes du résultat"
  });

  if (n2Range.min > n1Range.max) {
    throw new Error("Le minimum du deuxième terme ne peut pas dépasser le maximum du premier terme.");
  }

  if (resultRange.max > n1Range.max) {
    throw new Error("Le maximum du résultat ne peut pas dépasser le maximum du premier terme.");
  }

  const settings = {
    n1Min: n1Range.min,
    n1Max: n1Range.max,
    n2Min: n2Range.min,
    n2Max: n2Range.max,
    resultMin: resultRange.min,
    resultMax: resultRange.max
  };

  if (!hasAtLeastOnePossibleSubtraction(settings)) {
    throw new Error("Aucune soustraction possible avec ces réglages.");
  }

  return settings;
}

export { getDefaultSettings };
