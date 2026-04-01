import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderSelectGroup,
  bindSelect,
  readSelect,
  clampInt,
  refreshStepper,
  renderToolSettingsStack
} from "../../../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  getTargetAbsoluteMax,
  hasEnoughDistinctValues,
  canGenerateQuestion
} from "./model.js";

export function renderToolSettings(container, settings) {
  const cfg = normalizeSettings(settings);
  const targetAbsMax = getTargetAbsoluteMax(cfg.boxCount);

  container.innerHTML = renderToolSettingsStack(
    renderSelectGroup({
      title: "Nombre de boites",
      id: "baj_boxCount",
      value: cfg.boxCount,
      options: [
        { value: 3, label: "3 boites" },
        { value: 4, label: "4 boites" },
        { value: 5, label: "5 boites" },
        { value: 6, label: "6 boites" }
      ]
    }),

    renderMinMax({
      idPrefix: "baj_values",
      title: "Jetons dans les boites",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.boxValueMin,
      maxValue: cfg.boxValueMax,
      inputMin: 1,
      inputMax: 99,
      step: 1
    }),

    renderMinMax({
      idPrefix: "baj_target",
      title: "Nombre cible",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.targetMin,
      maxValue: cfg.targetMax,
      inputMin: 1,
      inputMax: targetAbsMax,
      step: 1
    })
  );

  bindSelect(container, "baj_boxCount");
  bindMinMax(container, "baj_values", { inputMin: 1, inputMax: 99 });
  bindMinMax(container, "baj_target", { inputMin: 1, inputMax: targetAbsMax });

  const boxCountEl = container.querySelector("#baj_boxCount");
  const valueMinEl = container.querySelector("#baj_values_min");
  const valueMaxEl = container.querySelector("#baj_values_max");
  const targetMinEl = container.querySelector("#baj_target_min");
  const targetMaxEl = container.querySelector("#baj_target_max");

  const syncSpecific = () => {
    const boxCount = clampInt(boxCountEl?.value, 3, 6);
    const targetMax = getTargetAbsoluteMax(boxCount);

    targetMinEl.max = String(targetMax);
    targetMaxEl.max = String(targetMax);

    targetMinEl.value = String(clampInt(targetMinEl.value, 1, targetMax));
    targetMaxEl.value = String(clampInt(targetMaxEl.value, 1, targetMax));

    if (Number(targetMinEl.value) > Number(targetMaxEl.value)) {
      targetMinEl.value = targetMaxEl.value;
    }

    refreshStepper(container, "baj_target_min", {
      inputMin: 1,
      inputMax: targetMax
    });

    refreshStepper(container, "baj_target_max", {
      inputMin: 1,
      inputMax: targetMax
    });

  };

  boxCountEl?.addEventListener("change", syncSpecific);
  valueMinEl?.addEventListener("input", syncSpecific);
  valueMaxEl?.addEventListener("input", syncSpecific);
  valueMinEl?.addEventListener("change", syncSpecific);
  valueMaxEl?.addEventListener("change", syncSpecific);
  targetMinEl?.addEventListener("input", syncSpecific);
  targetMaxEl?.addEventListener("input", syncSpecific);
  targetMinEl?.addEventListener("change", syncSpecific);
  targetMaxEl?.addEventListener("change", syncSpecific);

  syncSpecific();
}

export function readToolSettings(container) {
  const boxCount = readSelect(container, "baj_boxCount", {
    parse: (v) => clampInt(v, 3, 6)
  });

  const values = readMinMax(container, "baj_values", {
    inputMin: 1,
    inputMax: 99,
    errorLabel: "Les bornes des jetons dans les boites"
  });

  const targetAbsMax = getTargetAbsoluteMax(boxCount);
  const target = readMinMax(container, "baj_target", {
    inputMin: 1,
    inputMax: targetAbsMax,
    errorLabel: "Les bornes du nombre cible"
  });

  const settings = {
    boxValueMin: values.min,
    boxValueMax: values.max,
    targetMin: target.min,
    targetMax: target.max,
    boxCount
  };

  if (!hasEnoughDistinctValues(settings)) {
    throw new Error(`Il faut au moins ${boxCount} valeurs distinctes pour ${boxCount} boites.`);
  }

  if (!canGenerateQuestion(settings)) {
    throw new Error("Impossible de générer une question avec exactement 3 solutions dans ces bornes.");
  }

  return settings;
}

export { getDefaultSettings };
