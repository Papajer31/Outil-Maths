import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderSelectGroup,
  bindSelect,
  readSelect,
  clampInt,
  renderToolSettingsStack,
  refreshStepper
} from "../../../../shared/config-widgets.js";
import {
  DRAW,
  getDefaultSettings,
  normalizeSettings
} from "./model.js";

export function renderToolSettings(container, settings) {
  const cfg = normalizeSettings(settings);

  container.innerHTML = renderToolSettingsStack(
    renderSelectGroup({
      title: "Nombre de boites",
      id: "fp_boxCount",
      value: cfg.boxCount,
      options: [
        { value: 2, label: "2 boites" },
        { value: 3, label: "3 boites" },
        { value: 4, label: "4 boites" },
        { value: 5, label: "5 boites" },
        { value: 6, label: "6 boites" }
      ]
    }),

    renderMinMax({
      idPrefix: "fp_values",
      title: "Valeurs cibles",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.minValue,
      maxValue: cfg.maxValue,
      inputMin: 1,
      inputMax: cfg.boxCount * DRAW.cellsPerBox,
      step: 1
    })
  );

  bindSelect(container, "fp_boxCount");

  bindMinMax(container, "fp_values", {
    inputMin: 1,
    inputMax: cfg.boxCount * DRAW.cellsPerBox
  });

  const boxCountEl = container.querySelector("#fp_boxCount");
  const minEl = container.querySelector("#fp_values_min");
  const maxEl = container.querySelector("#fp_values_max");

  const syncSpecific = () => {
    const boxCount = clampInt(boxCountEl?.value, 2, 6);
    const absoluteMax = boxCount * DRAW.cellsPerBox;

    minEl.max = String(absoluteMax);
    maxEl.max = String(absoluteMax);

    minEl.value = String(clampInt(minEl.value, 1, absoluteMax));
    maxEl.value = String(clampInt(maxEl.value, 1, absoluteMax));

    if (Number(minEl.value) > Number(maxEl.value)) {
      minEl.value = maxEl.value;
    }

    refreshStepper(container, "fp_values_min", {
      inputMin: 1,
      inputMax: absoluteMax
    });

    refreshStepper(container, "fp_values_max", {
      inputMin: 1,
      inputMax: absoluteMax
    });
  };

  boxCountEl?.addEventListener("change", syncSpecific);
  minEl?.addEventListener("input", syncSpecific);
  maxEl?.addEventListener("input", syncSpecific);
  minEl?.addEventListener("change", syncSpecific);
  maxEl?.addEventListener("change", syncSpecific);

  syncSpecific();
}

export function readToolSettings(container) {
  const boxCount = readSelect(container, "fp_boxCount", {
    parse: (v) => clampInt(v, 2, 6)
  });

  const absoluteMax = boxCount * DRAW.cellsPerBox;

  const values = readMinMax(container, "fp_values", {
    inputMin: 1,
    inputMax: absoluteMax,
    errorLabel: "Les bornes des valeurs cibles"
  });

  return {
    boxCount,
    minValue: values.min,
    maxValue: values.max
  };
}

export { getDefaultSettings };
