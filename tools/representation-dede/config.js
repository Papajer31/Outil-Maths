import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderSection,
  bindCollapsibleSection,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  getDefaultSettings,
  normalizeSettings,
  REPRESENTATION_DIRECTIONS,
  DISPLAY_MODES,
  TOOL_MAX
} from "./model.js";

let stylesInjected = false;

const QUESTION_TYPE_MODES = Object.freeze({
  NUMBER_TO_REPRESENTATION: REPRESENTATION_DIRECTIONS.NUMBER_TO_REPRESENTATION,
  REPRESENTATION_TO_NUMBER: REPRESENTATION_DIRECTIONS.REPRESENTATION_TO_NUMBER,
  BOTH: "both"
});

export function renderToolSettings(container, settings) {
  injectStyles();

  const cfg = normalizeSettings(settings);
  container.innerHTML = `
    <div class="rd-config-root rdd-config-root rd-config-root--targeted">
      ${renderToolSettingsStack(
        renderMinMax({
          idPrefix: "rd_numbers",
          title: "Plage de nombres",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.min,
          maxValue: cfg.max,
          inputMin: 1,
          inputMax: TOOL_MAX,
          step: 1,
          mode: cfg.valueMode,
          startValue: cfg.valueStart,
          stepValue: cfg.valueStep,
          values: cfg.valueList
        }),
        renderQuestionTypes(cfg),
        renderSection("Réglages avancés", `
          ${renderDisplayMode(cfg)}
        `, { collapsible: true, expanded: false, idPrefix: "rd_advanced" })
      )}
    </div>
  `;

  bindMinMax(container, "rd_numbers", { inputMin: 1, inputMax: TOOL_MAX });
  bindRadio(container, "rd_questionTypeMode");
  bindRadio(container, "rd_displayMode");
  bindCollapsibleSection(container, "rd_advanced");
}

export function readToolSettings(container, settings = {}) {
  const range = readMinMax(container, "rd_numbers", {
    inputMin: 1,
    inputMax: TOOL_MAX,
    errorLabel: "La plage de nombres"
  });

  return normalizeSettings({
    ...getDefaultSettings(),
    ...(settings ?? {}),
    min: range.min,
    max: range.max,
    valueMode: range.mode,
    valueStart: range.start,
    valueStep: range.step,
    valueList: range.values,
    ...getDirectionsFromMode(readRadio(container, "rd_questionTypeMode", QUESTION_TYPE_MODES.BOTH)),
    displayMode: readRadio(container, "rd_displayMode", DISPLAY_MODES.ORDERED)
  });
}

export { getDefaultSettings };

function renderQuestionTypes(cfg) {
  return renderRadioGroup({
    title: "Type de question",
    id: "rd_questionTypeMode",
    value: getQuestionTypeMode(cfg),
    options: [
      { value: QUESTION_TYPE_MODES.NUMBER_TO_REPRESENTATION, label: "Nombre → Représentation" },
      { value: QUESTION_TYPE_MODES.REPRESENTATION_TO_NUMBER, label: "Représentation → Nombre" },
      { value: QUESTION_TYPE_MODES.BOTH, label: "Les deux" }
    ]
  });
}

function renderDisplayMode(cfg) {
  return renderRadioGroup({
    title: "Affichage",
    id: "rd_displayMode",
    value: cfg.displayMode,
    options: [
      { value: DISPLAY_MODES.ORDERED, label: "Ordonné" },
      { value: DISPLAY_MODES.RANDOM, label: "Aléatoire" }
    ]
  });
}

function getQuestionTypeMode(cfg) {
  const numberToRepresentation = cfg.allowNumberToRepresentation === true;
  const representationToNumber = cfg.allowRepresentationToNumber === true;
  if (numberToRepresentation && representationToNumber) return QUESTION_TYPE_MODES.BOTH;
  if (representationToNumber) return QUESTION_TYPE_MODES.REPRESENTATION_TO_NUMBER;
  return QUESTION_TYPE_MODES.NUMBER_TO_REPRESENTATION;
}

function getDirectionsFromMode(mode) {
  if (mode === QUESTION_TYPE_MODES.REPRESENTATION_TO_NUMBER) {
    return { allowNumberToRepresentation: false, allowRepresentationToNumber: true };
  }
  if (mode === QUESTION_TYPE_MODES.NUMBER_TO_REPRESENTATION) {
    return { allowNumberToRepresentation: true, allowRepresentationToNumber: false };
  }
  return { allowNumberToRepresentation: true, allowRepresentationToNumber: true };
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-rd-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.rdConfigStyle = href;
  document.head.appendChild(link);
}
