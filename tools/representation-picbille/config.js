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

const YES_NO_OPTIONS = Object.freeze([
  { value: "no", label: "Non" },
  { value: "yes", label: "Oui" }
]);

export function renderToolSettings(container, settings) {
  injectStyles();

  const cfg = normalizeSettings(settings);
  container.innerHTML = `
    <div class="rd-config-root rdp-config-root rd-config-root--targeted">
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
          ${renderAllowLooseTens(cfg)}
        `, { collapsible: true, expanded: false, idPrefix: "rd_advanced" })
      )}
    </div>
  `;

  bindMinMax(container, "rd_numbers", { inputMin: 1, inputMax: TOOL_MAX });
  bindRadio(container, "rd_questionTypeMode", {
    onChange: (value) => syncAllowLooseTensVisibility(container, value)
  });
  bindRadio(container, "rd_displayMode");
  bindRadio(container, "rd_allowLooseTens");
  bindCollapsibleSection(container, "rd_advanced");
  syncAllowLooseTensVisibility(container, getQuestionTypeMode(cfg));
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const range = readMinMax(container, "rd_numbers", {
    inputMin: 1,
    inputMax: TOOL_MAX,
    errorLabel: "La plage de nombres"
  });

  const questionTypeMode = readRadio(container, "rd_questionTypeMode", QUESTION_TYPE_MODES.BOTH);
  return normalizeSettings({
    ...getDefaultSettings(),
    ...(settings ?? {}),
    min: range.min,
    max: range.max,
    valueMode: range.mode,
    valueStart: range.start,
    valueStep: range.step,
    valueList: range.values,
    ...getDirectionsFromMode(questionTypeMode),
    displayMode: readRadio(container, "rd_displayMode", DISPLAY_MODES.ORDERED),
    allowLooseTens: questionTypeMode === QUESTION_TYPE_MODES.NUMBER_TO_REPRESENTATION
      ? false
      : readRadio(container, "rd_allowLooseTens", booleanToYesNo(previous.allowLooseTens)) === "yes"
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

function renderAllowLooseTens(cfg) {
  return `
    <div class="rdp-loose-tens-wrap${getQuestionTypeMode(cfg) === QUESTION_TYPE_MODES.NUMBER_TO_REPRESENTATION ? " is-hidden" : ""}" data-rdp-loose-tens-wrap>
      ${renderRadioGroup({
        title: "Accepter dizaines libres",
        id: "rd_allowLooseTens",
        value: booleanToYesNo(cfg.allowLooseTens),
        options: YES_NO_OPTIONS
      })}
    </div>
  `;
}

function booleanToYesNo(value) {
  return value === true ? "yes" : "no";
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

function syncAllowLooseTensVisibility(container, questionTypeMode) {
  const wrap = container.querySelector("[data-rdp-loose-tens-wrap]");
  if (!wrap) return;
  const hidden = questionTypeMode === QUESTION_TYPE_MODES.NUMBER_TO_REPRESENTATION;
  wrap.classList.toggle("is-hidden", hidden);
  if (!hidden) return;
  const noInput = wrap.querySelector('input[name="rd_allowLooseTens"][value="no"]');
  if (noInput) noInput.checked = true;
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
