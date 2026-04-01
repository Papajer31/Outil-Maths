import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderCheckbox,
  readCheckbox,
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
      idPrefix: "rd_range",
      title: "Nombres",
      minValue: cfg.min,
      maxValue: cfg.max,
      inputMin: 1,
      inputMax: 69,
      step: 1,
      mode: cfg.valueMode,
      startValue: cfg.valueStart,
      stepValue: cfg.valueStep,
      values: cfg.valueList
    }),

    `
      <div class="tv-group">
        <div class="tv-group-title">Représentations</div>
        <div class="tv-stack">
          ${renderCheckbox({
            id: "rd_use_picbille",
            label: "Utiliser Picbille",
            checked: !!cfg.usePicbille
          })}
          ${renderCheckbox({
            id: "rd_use_dede",
            label: "Utiliser Dédé",
            checked: !!cfg.useDede
          })}
        </div>
      </div>

      <div class="tv-group">
        <div class="tv-group-title">Affichage</div>
        <div class="tv-stack">
          ${renderCheckbox({
            id: "rd_direction_number_to_repr",
            label: "Nombre → Représentation décimale",
            checked: !!cfg.allowNumberToRepresentation
          })}
          ${renderCheckbox({
            id: "rd_direction_repr_to_number",
            label: "Représentation décimale → Nombre",
            checked: !!cfg.allowRepresentationToNumber
          })}
        </div>
      </div>
    `
  );

  bindMinMax(container, "rd_range", {
    inputMin: 1,
    inputMax: 69
  });
}

export function readToolSettings(container) {
  const values = readMinMax(container, "rd_range", {
    inputMin: 1,
    inputMax: 69,
    errorLabel: "Les bornes"
  });

  const usePicbille = readCheckbox(container, "rd_use_picbille");
  const useDede = readCheckbox(container, "rd_use_dede");
  const allowNumberToRepresentation = readCheckbox(container, "rd_direction_number_to_repr");
  const allowRepresentationToNumber = readCheckbox(container, "rd_direction_repr_to_number");

  if (!usePicbille && !useDede) {
    throw new Error("Active au moins une représentation : Picbille ou Dédé.");
  }

  if (!allowNumberToRepresentation && !allowRepresentationToNumber) {
    throw new Error("Active au moins un mode d'affichage.");
  }

  return {
    min: values.min,
    max: values.max,
    valueMode: values.mode,
    valueStart: values.start,
    valueStep: values.step,
    valueList: values.values,
    usePicbille,
    useDede,
    allowNumberToRepresentation,
    allowRepresentationToNumber
  };
}

export { getDefaultSettings };
