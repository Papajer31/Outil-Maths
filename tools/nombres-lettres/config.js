import {
  renderBasicMinMax,
  bindBasicMinMax,
  readBasicMinMax,
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  QUESTION_DIRECTIONS,
  NUMBER_LIMITS
} from "./model.js";

let stylesInjected = false;

export function renderToolSettings(container, settings) {
  injectStyles();
  container.classList.add("nl-config-root");

  const cfg = normalizeSettings(settings);
  container.innerHTML = renderToolSettingsStack(
    renderBasicMinMax({
      idPrefix: "nl_range",
      title: "Nombres",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.min,
      maxValue: cfg.max,
      inputMin: NUMBER_LIMITS.min,
      inputMax: NUMBER_LIMITS.max,
      step: 1
    }),
    renderRadioGroup({
      title: "Type de question",
      id: "nl_direction",
      value: cfg.direction,
      options: [
        { value: QUESTION_DIRECTIONS.NUMBER_TO_WORDS, label: "Nombre → Écriture" },
        { value: QUESTION_DIRECTIONS.WORDS_TO_NUMBER, label: "Écriture → Nombre" },
        { value: QUESTION_DIRECTIONS.MIXED, label: "Les deux" }
      ]
    })
  );

  bindBasicMinMax(container, "nl_range", {
    inputMin: NUMBER_LIMITS.min,
    inputMax: NUMBER_LIMITS.max
  });
  bindRadio(container, "nl_direction");
}

export function readToolSettings(container, settings = {}) {
  const range = readBasicMinMax(container, "nl_range", {
    inputMin: NUMBER_LIMITS.min,
    inputMax: NUMBER_LIMITS.max,
    errorLabel: "Les bornes des nombres"
  });

  const direction = readRadio(container, "nl_direction", QUESTION_DIRECTIONS.NUMBER_TO_WORDS);

  return normalizeSettings({
    ...getDefaultSettings(),
    ...(settings ?? {}),
    min: range.min,
    max: range.max,
    direction
  });
}

export { getDefaultSettings };

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-nl-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.nlConfigStyle = href;
  document.head.appendChild(link);
}
