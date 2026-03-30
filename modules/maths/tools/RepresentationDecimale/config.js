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
      step: 1
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
    `
  );

  bindMinMax(container, "rd_range", {
    inputMin: 1,
    inputMax: 69
  });
}

export function readToolSettings(container) {
  const { min, max } = readMinMax(container, "rd_range", {
    inputMin: 1,
    inputMax: 69,
    errorLabel: "Les bornes"
  });

  const usePicbille = readCheckbox(container, "rd_use_picbille");
  const useDede = readCheckbox(container, "rd_use_dede");

  if (!usePicbille && !useDede) {
    throw new Error("Active au moins une représentation : Picbille ou Dédé.");
  }

  return {
    min,
    max,
    usePicbille,
    useDede
  };
}

export { getDefaultSettings };
