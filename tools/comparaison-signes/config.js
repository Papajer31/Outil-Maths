import {
  bindMinMax,
  bindRadio,
  bindStepperField,
  readMinMax,
  readRadio,
  readStepper,
  refreshStepper,
  renderMinMax,
  renderRadioGroup,
  renderStepperField,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  LAYOUTS,
  LAYOUT_LABELS,
  LIMITS,
  MODES,
  MODE_LABELS,
  REPRESENTATIONS,
  REPRESENTATION_LABELS,
  getDefaultSettings,
  getMaximumDifferenceForRange,
  normalizeSettings
} from "./model.js";

const MODE_OPTIONS = Object.freeze([
  { value: MODES.CHOOSE_COLLECTION, label: MODE_LABELS[MODES.CHOOSE_COLLECTION] },
  { value: MODES.ORIENT_CROCODILE, label: MODE_LABELS[MODES.ORIENT_CROCODILE] },
  { value: MODES.CHOOSE_SYMBOL, label: MODE_LABELS[MODES.CHOOSE_SYMBOL] }
]);

const LAYOUT_OPTIONS = Object.freeze([
  { value: LAYOUTS.ROWS, label: LAYOUT_LABELS[LAYOUTS.ROWS] },
  { value: LAYOUTS.CLOUD, label: LAYOUT_LABELS[LAYOUTS.CLOUD] }
]);

const REPRESENTATION_OPTIONS = Object.freeze([
  { value: REPRESENTATIONS.COLLECTION, label: REPRESENTATION_LABELS[REPRESENTATIONS.COLLECTION] },
  { value: REPRESENTATIONS.NUMBER, label: REPRESENTATION_LABELS[REPRESENTATIONS.NUMBER] }
]);

let stylesInjected = false;

export function renderToolSettings(container, settings = {}) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="comparaison-signes-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Mode de réponse",
          id: "comparaison_signes_mode",
          value: cfg.mode,
          options: MODE_OPTIONS
        }),
        renderValuesWidget(cfg),
        renderRadioGroup({
          title: "À gauche",
          id: "comparaison_signes_leftRepresentation",
          value: cfg.leftRepresentation,
          options: REPRESENTATION_OPTIONS,
          groupClassName: "comparaison-signes-representation-widget"
        }),
        renderRadioGroup({
          title: "À droite",
          id: "comparaison_signes_rightRepresentation",
          value: cfg.rightRepresentation,
          options: REPRESENTATION_OPTIONS,
          groupClassName: "comparaison-signes-representation-widget"
        }),
        `
          <div data-comparaison-signes-layout-widget>
            ${renderRadioGroup({
              title: "Disposition des collections",
              id: "comparaison_signes_layout",
              value: cfg.layout,
              options: LAYOUT_OPTIONS
            })}
          </div>
        `
      )}
    </div>
  `;

  bindRadio(container, "comparaison_signes_mode");
  bindRadio(container, "comparaison_signes_layout");
  bindRadio(container, "comparaison_signes_leftRepresentation", { onChange: () => syncRepresentationWidgets(container) });
  bindRadio(container, "comparaison_signes_rightRepresentation", { onChange: () => syncRepresentationWidgets(container) });
  bindMinMax(container, "comparaison_signes_collectionRange", {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount
  });

  const initialMaxDifference = getMaximumDifferenceForRange(cfg.collectionRange);
  bindStepperField(container, "comparaison_signes_maxDifference", {
    inputMin: 1,
    inputMax: initialMaxDifference
  });

  const rangeRoot = container.querySelector('[data-tv-minmax="comparaison_signes_collectionRange"]');
  rangeRoot?.addEventListener("input", () => syncMaxDifferenceBounds(container));
  rangeRoot?.addEventListener("change", () => syncMaxDifferenceBounds(container));

  syncMaxDifferenceBounds(container);
  syncRepresentationWidgets(container);
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const collectionRange = readMinMax(container, "comparaison_signes_collectionRange", {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    errorLabel: "Les valeurs à comparer"
  });

  if (!Array.isArray(collectionRange.allowedValues) || collectionRange.allowedValues.length < 2) {
    throw new Error("Les valeurs à comparer doivent produire au moins deux valeurs différentes.");
  }

  const maxDifferenceLimit = getMaximumDifferenceForRange(collectionRange);
  const maxDifference = readStepper(container, "comparaison_signes_maxDifference", {
    inputMin: 1,
    inputMax: maxDifferenceLimit
  });

  const distinctValues = Array.from(new Set(collectionRange.allowedValues)).sort((a, b) => a - b);
  const hasValidPair = distinctValues.some((value, index) =>
    distinctValues.slice(index + 1).some((other) => other - value <= maxDifference)
  );
  if (!hasValidPair) {
    throw new Error("L’écart maximal choisi ne permet aucune paire avec les valeurs sélectionnées.");
  }

  return normalizeSettings({
    ...previous,
    mode: readRadio(container, "comparaison_signes_mode", previous.mode),
    layout: readRadio(container, "comparaison_signes_layout", previous.layout),
    leftRepresentation: readRadio(container, "comparaison_signes_leftRepresentation", previous.leftRepresentation),
    rightRepresentation: readRadio(container, "comparaison_signes_rightRepresentation", previous.rightRepresentation),
    maxDifference,
    collectionRange
  });
}

export { getDefaultSettings };

function renderValuesWidget(cfg) {
  const maxDifferenceLimit = getMaximumDifferenceForRange(cfg.collectionRange);
  const rangeHtml = renderMinMax({
    idPrefix: "comparaison_signes_collectionRange",
    title: "Valeurs à comparer",
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: cfg.collectionRange.min,
    maxValue: cfg.collectionRange.max,
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    step: 1,
    mode: cfg.collectionRange.mode,
    startValue: cfg.collectionRange.start,
    stepValue: cfg.collectionRange.step,
    values: cfg.collectionRange.values
  });
  const differenceStepper = renderStepperField({
    id: "comparaison_signes_maxDifference",
    label: "Écart maximal entre les valeurs",
    value: cfg.maxDifference,
    inputMin: 1,
    inputMax: maxDifferenceLimit,
    step: 1,
    fieldClassName: "tv-stepper-field-inline comparaison-signes-max-difference-field"
  });

  return rangeHtml.replace(
    '<button\n            class="tv-minmax-toggle"',
    `${differenceStepper}\n          <button\n            class="tv-minmax-toggle"`
  );
}

function syncMaxDifferenceBounds(container) {
  const input = container.querySelector("#comparaison_signes_maxDifference");
  if (!input) return;

  let range = null;
  try {
    range = readMinMax(container, "comparaison_signes_collectionRange", {
      inputMin: LIMITS.minCount,
      inputMax: LIMITS.maxCount,
      errorLabel: "Les valeurs à comparer"
    });
  } catch {
    return;
  }

  const maxDifference = getMaximumDifferenceForRange(range);
  input.setAttribute("min", "1");
  input.setAttribute("max", String(maxDifference));
  const current = Math.max(1, Math.min(maxDifference, Number.parseInt(input.value, 10) || 1));
  input.value = String(current);
  refreshStepper(container, "comparaison_signes_maxDifference", {
    inputMin: 1,
    inputMax: maxDifference
  });
}

function syncRepresentationWidgets(container) {
  const left = readRadio(container, "comparaison_signes_leftRepresentation", REPRESENTATIONS.COLLECTION);
  const right = readRadio(container, "comparaison_signes_rightRepresentation", REPRESENTATIONS.COLLECTION);
  const hasCollection = left === REPRESENTATIONS.COLLECTION || right === REPRESENTATIONS.COLLECTION;
  const layoutWidget = container.querySelector("[data-comparaison-signes-layout-widget]");
  if (layoutWidget) layoutWidget.hidden = !hasCollection;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  if (typeof document === "undefined") return;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-comparaison-signes-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.comparaisonSignesConfigStyle = href;
  document.head.appendChild(link);
}
