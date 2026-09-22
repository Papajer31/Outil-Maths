import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  QUESTION_TYPES,
  VALUE_LIMITS
} from "./model.js";

let stylesInjected = false;

export function renderToolSettings(container, settings) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="mm-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Type d’exercice",
          id: "mm_question_type",
          value: cfg.questionType,
          options: [
            { value: QUESTION_TYPES.READ, label: "Lire" },
            { value: QUESTION_TYPES.BUILD, label: "Construire" }
          ]
        }),
        renderMinMax({
          idPrefix: "mm_values",
          title: "Valeurs (en mm)",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.min,
          maxValue: cfg.max,
          inputMin: VALUE_LIMITS.min,
          inputMax: VALUE_LIMITS.max,
          step: 1,
          mode: cfg.valueMode,
          startValue: cfg.valueStart,
          stepValue: cfg.valueStep,
          values: cfg.valueList
        })
      )}
    </div>
  `;

  bindRadio(container, "mm_question_type");
  bindMinMax(container, "mm_values", {
    inputMin: VALUE_LIMITS.min,
    inputMax: VALUE_LIMITS.max
  });
}

export function readToolSettings(container, settings = {}) {
  const range = readMinMax(container, "mm_values", {
    inputMin: VALUE_LIMITS.min,
    inputMax: VALUE_LIMITS.max,
    errorLabel: "La plage de longueurs"
  });

  return normalizeSettings({
    ...getDefaultSettings(),
    ...(settings ?? {}),
    questionType: readRadio(container, "mm_question_type", QUESTION_TYPES.READ),
    min: range.min,
    max: range.max,
    valueMode: range.mode,
    valueStart: range.start,
    valueStep: range.step,
    valueList: range.values
  });
}

export { getDefaultSettings };

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-mm-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.mmConfigStyle = href;
  document.head.appendChild(link);
}
