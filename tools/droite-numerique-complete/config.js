import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderCheckbox,
  readCheckbox,
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
  QUESTION_TYPES,
  MARKER_POSITIONS
} from "./model.js";

let stylesInjected = false;

const QUESTION_TYPE_MODES = Object.freeze({
  NUMBER_TO_GRADUATION: QUESTION_TYPES.NUMBER_TO_GRADUATION,
  GRADUATION_TO_NUMBER: QUESTION_TYPES.GRADUATION_TO_NUMBER,
  BOTH: "both"
});

export function renderToolSettings(container, settings) {
  injectStyles();

  const cfg = normalizeSettings(settings);
  const questionTypes = new Set(cfg.questionTypes);
  const markerPositions = new Set(cfg.markerPositions);

  container.innerHTML = `
    <div class="rn-config-root rnc-config-root">
      ${renderToolSettingsStack(
        renderQuestionTypes(questionTypes),
        renderRadioGroup({
          title: "Écart entre les grands repères",
          id: "rnc_markerGap",
          value: String(cfg.markerGap),
          options: [
            { value: "10", label: "10" },
            { value: "100", label: "100" }
          ]
        }),
        renderSection("Réglages avancés", `
          <div class="tv-group tv-group-inline rn-marker-positions">
            <div class="tv-minmax-inline">
              <div class="tv-group-title tv-minmax-title">Position des repères</div>
              <div class="tv-radio-options rn-checkbox-options">
                ${renderCheckbox({
                  id: "rnc_pos_start",
                  label: "Début",
                  checked: markerPositions.has(MARKER_POSITIONS.START)
                })}
                ${renderCheckbox({
                  id: "rnc_pos_middle",
                  label: "Milieu",
                  checked: markerPositions.has(MARKER_POSITIONS.MIDDLE)
                })}
                ${renderCheckbox({
                  id: "rnc_pos_end",
                  label: "Fin",
                  checked: markerPositions.has(MARKER_POSITIONS.END)
                })}
              </div>
            </div>
          </div>

          ${renderMinMax({
            idPrefix: "rnc_numbers",
            title: "Plage des nombres",
            minLabel: "Minimum",
            maxLabel: "Maximum",
            minValue: cfg.markerMin,
            maxValue: cfg.markerMax,
            inputMin: 0,
            inputMax: 999,
            step: 1,
            mode: cfg.markerValueMode,
            startValue: cfg.markerValueStart,
            stepValue: cfg.markerValueStep,
            values: cfg.markerValueList
          })}
        `, { collapsible: true, expanded: false, idPrefix: "rnc_advanced" })
      )}
    </div>
  `;

  bindRadio(container, "rnc_markerGap");
  bindRadio(container, "rnc_questionTypeMode");
  bindMinMax(container, "rnc_numbers", { inputMin: 0, inputMax: 999 });
  bindCollapsibleSection(container, "rnc_advanced");
  bindMarkerPositionSelectionGuard(container);
}

function renderQuestionTypes(questionTypes) {
  return renderRadioGroup({
    title: "Type de question",
    id: "rnc_questionTypeMode",
    value: getQuestionTypeMode(questionTypes),
    options: [
      { value: QUESTION_TYPE_MODES.NUMBER_TO_GRADUATION, label: "Nombre → Droite" },
      { value: QUESTION_TYPE_MODES.GRADUATION_TO_NUMBER, label: "Droite → Nombre" },
      { value: QUESTION_TYPE_MODES.BOTH, label: "Les deux" }
    ]
  });
}

export function readToolSettings(container, settings = {}) {
  const questionTypes = getQuestionTypesFromMode(
    readRadio(container, "rnc_questionTypeMode", QUESTION_TYPE_MODES.BOTH)
  );

  const markerPositions = [];
  if (readCheckbox(container, "rnc_pos_start")) markerPositions.push(MARKER_POSITIONS.START);
  if (readCheckbox(container, "rnc_pos_middle")) markerPositions.push(MARKER_POSITIONS.MIDDLE);
  if (readCheckbox(container, "rnc_pos_end")) markerPositions.push(MARKER_POSITIONS.END);

  if (!markerPositions.length) {
    throw new Error("Active au moins une position des repères.");
  }

  const numbers = readMinMax(container, "rnc_numbers", {
    inputMin: 0,
    inputMax: 999,
    errorLabel: "La plage des nombres"
  });

  const markerGap = clampInt(readRadio(container, "rnc_markerGap", "10"), 1, 100);

  return normalizeSettings({
    ...getDefaultSettings(),
    ...(settings ?? {}),
    questionTypes,
    markerPositions,
    markerMin: numbers.min,
    markerMax: numbers.max,
    markerValueMode: numbers.mode,
    markerValueStart: numbers.start,
    markerValueStep: numbers.step,
    markerValueList: numbers.values,
    markerGap
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

function bindMarkerPositionSelectionGuard(container) {
  const inputs = Array.from(container.querySelectorAll("#rnc_pos_start, #rnc_pos_middle, #rnc_pos_end"));
  inputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (inputs.some((item) => item.checked)) return;
      input.checked = true;
    });
  });
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-rnc-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.rncConfigStyle = href;
  document.head.appendChild(link);
}

function clampInt(v, min, max) {
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}
