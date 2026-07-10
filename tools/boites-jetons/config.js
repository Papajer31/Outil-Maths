import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderSection,
  bindCollapsibleSection,
  renderMinMax,
  bindMinMax,
  readMinMax
} from "../../shared/config-widgets.js";
import {
  EXERCISE_TYPES,
  MIN_SOLUTIONS_TO_FIND_VALUES,
  getDefaultSettings,
  normalizeSettings,
  canGenerateQuestion,
  getTargetAbsoluteMax
} from "./model.js";

let stylesInjected = false;
const editorUiState = new WeakMap();

export function renderToolSettings(container, settings) {
  injectStyles();
  const cfg = normalizeSettings({
    ...settings,
    exerciseType: EXERCISE_TYPES.TOKEN_BOXES
  }).tokenBoxes;
  const targetAbsMax = getTargetAbsoluteMax(cfg.boxCount);

  container.innerHTML = `
    <div class="btj-config-root">
      ${renderRadioGroup({
        title: "Nombre de boites",
        id: "btj_boxCount",
        value: cfg.boxCount,
        options: [
          { value: 4, label: "4 boites" },
          { value: 5, label: "5 boites" },
          { value: 6, label: "6 boites" }
        ]
      })}
      ${renderMinMax({
        idPrefix: "btj_values",
        title: "Nombre de jetons dans les boites",
        minLabel: "Minimum",
        maxLabel: "Maximum",
        minValue: cfg.boxValueMin,
        maxValue: cfg.boxValueMax,
        inputMin: 1,
        inputMax: 99,
        step: 1
      })}
      ${renderMinMax({
        idPrefix: "btj_target",
        title: "Cible",
        minLabel: "Minimum",
        maxLabel: "Maximum",
        minValue: cfg.targetMin,
        maxValue: cfg.targetMax,
        inputMin: 1,
        inputMax: targetAbsMax,
        step: 1
      })}
      ${renderSection("Réglages avancés", `
        ${renderRadioGroup({
          title: "Nombre minimal de solutions à trouver",
          id: "btj_minSolutions",
          value: cfg.minSolutionsToFind,
          options: MIN_SOLUTIONS_TO_FIND_VALUES.map((value) => ({
            value,
            label: `${value} solution${Number(value) > 1 ? "s" : ""}`
          }))
        })}
      `, { collapsible: true, expanded: false, idPrefix: "btj_advanced" })}
    </div>
  `;

  bindToolSettings(container);
  editorUiState.set(container, cfg);
}

export function readToolSettings(container, settings = {}) {
  const normalized = readSettingsFromDom(container, settings);
  if (!canGenerateQuestion(normalized)) {
    throw new Error("Aucune question Boites à jetons possible avec ces réglages.");
  }
  return normalized;
}

export { getDefaultSettings };

function bindToolSettings(container) {
  bindRadio(container, "btj_boxCount", {
    onChange: () => rerenderFromCurrentState(container)
  });
  bindRadio(container, "btj_minSolutions");
  bindCollapsibleSection(container, "btj_advanced");
  bindMinMax(container, "btj_values", { inputMin: 1, inputMax: 99 });
  bindMinMax(container, "btj_target", { inputMin: 1, inputMax: getCurrentTargetAbsMax(container) });
}

function rerenderFromCurrentState(container) {
  const previous = editorUiState.get(container) || getDefaultSettings().tokenBoxes;
  const next = readSettingsFromDom(container, { tokenBoxes: previous });
  renderToolSettings(container, next);
}

function readSettingsFromDom(container, settings = {}) {
  const previous = normalizeSettings({ ...settings, exerciseType: EXERCISE_TYPES.TOKEN_BOXES });
  const boxCount = readNumberRadio(container, "btj_boxCount", previous.tokenBoxes.boxCount);
  const values = readMinMax(container, "btj_values", { inputMin: 1, inputMax: 99, errorLabel: "Le nombre de jetons" });
  const targetAbsMax = getTargetAbsoluteMax(boxCount);
  const target = readMinMax(container, "btj_target", { inputMin: 1, inputMax: targetAbsMax, errorLabel: "La cible" });
  const minSolutionsToFind = readNumberRadio(container, "btj_minSolutions", previous.tokenBoxes.minSolutionsToFind);

  return normalizeSettings({
    exerciseType: EXERCISE_TYPES.TOKEN_BOXES,
    tokenBoxes: {
      boxCount,
      boxValueMin: values.min,
      boxValueMax: values.max,
      targetMin: target.min,
      targetMax: target.max,
      minSolutionsToFind
    }
  });
}

function readNumberRadio(container, id, fallback) {
  const raw = readRadio(container, id, fallback);
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function getCurrentTargetAbsMax(container) {
  const raw = readRadio(container, "btj_boxCount", 5);
  return getTargetAbsoluteMax(Number(raw));
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-btj-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.btjConfigStyle = href;
  document.head.appendChild(link);
}
