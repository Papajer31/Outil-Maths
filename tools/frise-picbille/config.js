import {
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
  QUESTION_TYPES
} from "./model.js";

let stylesInjected = false;

const PICBILLE_START_VALUES = [1, 11, 21, 31, 41, 51];
const QUESTION_TYPE_MODES = Object.freeze({
  NUMBER_TO_GRADUATION: QUESTION_TYPES.NUMBER_TO_GRADUATION,
  GRADUATION_TO_NUMBER: QUESTION_TYPES.GRADUATION_TO_NUMBER,
  BOTH: "both"
});

export function renderToolSettings(container, settings) {
  injectStyles();

  const cfg = normalizeSettings(settings);
  const questionTypes = new Set(cfg.questionTypes);

  container.innerHTML = `
    <div class="rn-config-root fp-config-root">
      ${renderToolSettingsStack(
        renderQuestionTypes(questionTypes),
        renderRadioGroup({
          title: "Nombre de boites",
          id: "fp_picbilleBoxCount",
          value: String(cfg.picbilleBoxCount),
          options: [2, 3, 4, 5].map((count) => ({
            value: String(count),
            label: `${count} boites`
          }))
        }),
        renderSection("Réglages avancés", `
          ${renderRadioGroup({
            title: "Débuter la frise à",
            id: "fp_picbilleStartValue",
            value: String(cfg.picbilleStartValue),
            options: PICBILLE_START_VALUES.map((start) => ({
              value: String(start),
              label: String(start),
              disabled: start + (cfg.picbilleBoxCount * 10) - 1 > 100
            }))
          })}
        `, { collapsible: true, expanded: false, idPrefix: "fp_advanced" })
      )}
    </div>
  `;

  bindRadio(container, "fp_picbilleBoxCount", { onChange: () => syncStartOptions(container) });
  bindRadio(container, "fp_picbilleStartValue", { onChange: () => syncStartOptions(container) });
  bindRadio(container, "fp_questionTypeMode");
  bindCollapsibleSection(container, "fp_advanced");
  syncStartOptions(container);
}

function renderQuestionTypes(questionTypes) {
  return renderRadioGroup({
    title: "Type de question",
    id: "fp_questionTypeMode",
    value: getQuestionTypeMode(questionTypes),
    options: [
      { value: QUESTION_TYPE_MODES.NUMBER_TO_GRADUATION, label: "Nombre → Frise" },
      { value: QUESTION_TYPE_MODES.GRADUATION_TO_NUMBER, label: "Frise → Nombre" },
      { value: QUESTION_TYPE_MODES.BOTH, label: "Les deux" }
    ]
  });
}

function syncStartOptions(container) {
  const boxCount = clampInt(readRadio(container, "fp_picbilleBoxCount", "5"), 2, 5);
  let firstValid = null;
  let checkedIsValid = false;

  PICBILLE_START_VALUES.forEach((start) => {
    const input = container.querySelector(`input[name="fp_picbilleStartValue"][value="${start}"]`);
    if (!input) return;
    const disabled = start + (boxCount * 10) - 1 > 100;
    input.disabled = disabled;
    input.closest(".tv-radio-row")?.classList.toggle("is-disabled", disabled);
    if (!disabled && firstValid == null) firstValid = input;
    if (!disabled && input.checked) checkedIsValid = true;
  });

  if (!checkedIsValid && firstValid) {
    firstValid.checked = true;
  }
}

export function readToolSettings(container, settings = {}) {
  const questionTypes = getQuestionTypesFromMode(
    readRadio(container, "fp_questionTypeMode", QUESTION_TYPE_MODES.BOTH)
  );

  const picbilleBoxCount = clampInt(readRadio(container, "fp_picbilleBoxCount", "5"), 2, 5);
  const picbilleStartValue = clampInt(readRadio(container, "fp_picbilleStartValue", "1"), 1, 51);
  if (picbilleStartValue + (picbilleBoxCount * 10) - 1 > 100) {
    throw new Error("La frise Picbille ne doit pas dépasser 100.");
  }

  return normalizeSettings({
    ...getDefaultSettings(),
    ...(settings ?? {}),
    questionTypes,
    picbilleBoxCount,
    picbilleStartValue
  });
}

export { getDefaultSettings };

function getQuestionTypeMode(questionTypes) {
  const safeTypes = questionTypes instanceof Set
    ? questionTypes
    : new Set(Array.isArray(questionTypes) ? questionTypes : []);
  const hasNumberToGraduation = safeTypes.has(QUESTION_TYPES.NUMBER_TO_GRADUATION);
  const hasGraduationToNumber = safeTypes.has(QUESTION_TYPES.GRADUATION_TO_NUMBER);
  if (hasNumberToGraduation && hasGraduationToNumber) return QUESTION_TYPE_MODES.BOTH;
  if (hasGraduationToNumber) return QUESTION_TYPE_MODES.GRADUATION_TO_NUMBER;
  return QUESTION_TYPE_MODES.NUMBER_TO_GRADUATION;
}

function getQuestionTypesFromMode(mode) {
  if (mode === QUESTION_TYPE_MODES.NUMBER_TO_GRADUATION) {
    return [QUESTION_TYPES.NUMBER_TO_GRADUATION];
  }
  if (mode === QUESTION_TYPE_MODES.GRADUATION_TO_NUMBER) {
    return [QUESTION_TYPES.GRADUATION_TO_NUMBER];
  }
  return [
    QUESTION_TYPES.NUMBER_TO_GRADUATION,
    QUESTION_TYPES.GRADUATION_TO_NUMBER
  ];
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-fp-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.fpConfigStyle = href;
  document.head.appendChild(link);
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
