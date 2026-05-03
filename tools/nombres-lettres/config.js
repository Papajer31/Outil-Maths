import {
  renderBasicMinMax,
  bindBasicMinMax,
  readBasicMinMax,
  renderCheckbox,
  readCheckbox,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  getAvailableQuestionDirections,
  QUESTION_DIRECTIONS,
  NUMBER_LIMITS
} from "./model.js";

let stylesInjected = false;

export function renderToolSettings(container, settings) {
  injectStyles();

  const cfg = normalizeSettings(settings);
  const directions = new Set(getAvailableQuestionDirections(cfg));
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
    `
      <div class="tv-group tv-group-inline nl-direction-control">
        <div class="tv-minmax-inline">
          <div class="tv-group-title tv-minmax-title">Type de questions</div>
          <div class="tv-radio-options nl-direction-options">
            ${renderCheckbox({
              id: "nl_direction_number_to_words",
              label: "Nombre → Écriture",
              checked: directions.has(QUESTION_DIRECTIONS.NUMBER_TO_WORDS)
            })}
            ${renderCheckbox({
              id: "nl_direction_words_to_number",
              label: "Écriture → Nombre",
              checked: directions.has(QUESTION_DIRECTIONS.WORDS_TO_NUMBER)
            })}
          </div>
        </div>
      </div>
    `
  );

  bindBasicMinMax(container, "nl_range", {
    inputMin: NUMBER_LIMITS.min,
    inputMax: NUMBER_LIMITS.max
  });
}

export function readToolSettings(container, settings = {}) {
  const range = readBasicMinMax(container, "nl_range", {
    inputMin: NUMBER_LIMITS.min,
    inputMax: NUMBER_LIMITS.max,
    errorLabel: "Les bornes des nombres"
  });

  const allowNumberToWords = readCheckbox(container, "nl_direction_number_to_words");
  const allowWordsToNumber = readCheckbox(container, "nl_direction_words_to_number");

  if (!allowNumberToWords && !allowWordsToNumber) {
    throw new Error("Active au moins un type de questions.");
  }

  const direction = allowNumberToWords && allowWordsToNumber
    ? QUESTION_DIRECTIONS.MIXED
    : allowWordsToNumber
      ? QUESTION_DIRECTIONS.WORDS_TO_NUMBER
      : QUESTION_DIRECTIONS.NUMBER_TO_WORDS;

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
