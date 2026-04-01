import {
  renderBasicMinMax,
  bindBasicMinMax,
  readBasicMinMax,
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderSelectGroup,
  bindSelect,
  readSelect,
  renderCheckbox,
  readCheckbox,
  renderSection,
  renderToolSettingsStack,
  clampInt
} from "../../../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  canGenerateQuestion
} from "./model.js";

export function renderToolSettings(container, settings) {
  const cfg = normalizeSettings(settings);

  container.innerHTML = renderToolSettingsStack(
    renderBasicMinMax({
      idPrefix: "furet_work",
      title: "Plage de travail",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.workMin,
      maxValue: cfg.workMax,
      inputMin: 0,
      inputMax: 999,
      step: 1
    }),

    renderSelectGroup({
      title: "Nombre de sauts",
      id: "furet_stepCount",
      value: cfg.stepCount,
      options: [2, 3, 4, 5, 6].map((value) => ({
        value,
        label: `${value} sauts`
      }))
    }),

    renderSection(
      "Opérations",
      `<div class="tv-stack">${[
        renderCheckbox({ id: "furet_add", label: "+ (ajout)", checked: cfg.allowAdd }),
        renderCheckbox({ id: "furet_subtract", label: "- (retrait)", checked: cfg.allowSubtract })
      ].join("")}</div>`
    ),

    renderMinMax({
      idPrefix: "furet_jumps",
      title: "Valeurs des sauts",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.jumpMin,
      maxValue: cfg.jumpMax,
      inputMin: 1,
      inputMax: 999,
      step: 1,
      mode: cfg.jumpMode,
      startValue: cfg.jumpStart,
      stepValue: cfg.jumpStep,
      values: cfg.jumpList
    })
  );

  bindBasicMinMax(container, "furet_work", { inputMin: 0, inputMax: 999 });
  bindMinMax(container, "furet_jumps", { inputMin: 1, inputMax: 999 });
  bindSelect(container, "furet_stepCount");
}

export function readToolSettings(container) {
  const work = readBasicMinMax(container, "furet_work", {
    inputMin: 0,
    inputMax: 999,
    errorLabel: "Les bornes de la plage de travail"
  });

  const allowAdd = readCheckbox(container, "furet_add");
  const allowSubtract = readCheckbox(container, "furet_subtract");
  if (!allowAdd && !allowSubtract) {
    throw new Error("Active au moins une opération.");
  }

  const jumps = readMinMax(container, "furet_jumps", {
    inputMin: 1,
    inputMax: 999,
    errorLabel: "Les bornes des valeurs des sauts"
  });

  const stepCount = readSelect(container, "furet_stepCount", {
    parse: (value) => clampInt(value, 2, 6)
  });

  const settings = {
    workMin: work.min,
    workMax: work.max,
    allowAdd,
    allowSubtract,
    jumpMin: jumps.min,
    jumpMax: jumps.max,
    jumpMode: jumps.mode,
    jumpStart: jumps.start,
    jumpStep: jumps.step,
    jumpList: jumps.values,
    stepCount
  };

  if (!canGenerateQuestion(settings)) {
    throw new Error("Impossible de générer un furet valide avec cette plage, ces opérations et ces sauts.");
  }

  return settings;
}

export { getDefaultSettings };
