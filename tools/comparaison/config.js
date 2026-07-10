import {
  bindMinMax,
  bindRadio,
  readMinMax,
  readRadio,
  renderMinMax,
  renderRadioGroup,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  CHARACTER_SET_LABELS,
  CHARACTER_SETS,
  LIMITS,
  TOKEN_MODE_LABELS,
  TOKEN_MODES,
  TRACE_MODE_LABELS,
  TRACE_MODES,
  getDefaultSettings,
  normalizeSettings
} from "./model.js";

const CHARACTER_OPTIONS = Object.freeze([
  { value: CHARACTER_SETS.MINIBILLE_MAXIBILLE, label: CHARACTER_SET_LABELS[CHARACTER_SETS.MINIBILLE_MAXIBILLE] },
  { value: CHARACTER_SETS.MATHIEU_MATHILDE, label: CHARACTER_SET_LABELS[CHARACTER_SETS.MATHIEU_MATHILDE] }
]);

const TOKEN_MODE_OPTIONS = Object.freeze([
  { value: TOKEN_MODES.DISPLAYED, label: TOKEN_MODE_LABELS[TOKEN_MODES.DISPLAYED] },
  { value: TOKEN_MODES.COMPLETE, label: TOKEN_MODE_LABELS[TOKEN_MODES.COMPLETE] },
  { value: TOKEN_MODES.NONE, label: TOKEN_MODE_LABELS[TOKEN_MODES.NONE] }
]);

const TRACE_MODE_OPTIONS = Object.freeze([
  { value: TRACE_MODES.FREE, label: TRACE_MODE_LABELS[TRACE_MODES.FREE] },
  { value: TRACE_MODES.ASSISTED, label: TRACE_MODE_LABELS[TRACE_MODES.ASSISTED] }
]);

let stylesInjected = false;

export function renderToolSettings(container, settings) {
  injectStyles();
  const cfg = normalizeSettings(settings);
  container.innerHTML = `
    <div class="comparaison-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Personnages",
          id: "comparaison_characterSet",
          value: cfg.characterSet,
          options: CHARACTER_OPTIONS
        }),
        renderMinMax({
          idPrefix: "comparaison_collectionRange",
          title: "Bornes des collections",
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
        }),
        renderRadioGroup({
          title: "Jetons",
          id: "comparaison_tokenMode",
          value: cfg.tokenMode,
          options: TOKEN_MODE_OPTIONS
        }),
        `<div data-comparaison-trace-settings ${cfg.tokenMode === TOKEN_MODES.NONE ? "hidden" : ""}>${renderRadioGroup({
          title: "Tracés",
          id: "comparaison_traceMode",
          value: cfg.traceMode,
          options: TRACE_MODE_OPTIONS
        })}</div>`
      )}
    </div>
  `;

  bindRadio(container, "comparaison_characterSet");
  bindRadio(container, "comparaison_tokenMode");
  bindRadio(container, "comparaison_traceMode");
  bindTraceVisibility(container);
  bindMinMax(container, "comparaison_collectionRange", {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount
  });
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const collectionRange = readMinMax(container, "comparaison_collectionRange", {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    errorLabel: "Les bornes des collections"
  });

  if (!Array.isArray(collectionRange.allowedValues) || collectionRange.allowedValues.length < 2) {
    throw new Error("Les bornes des collections doivent produire au moins deux valeurs différentes.");
  }

  const normalized = normalizeSettings({
    ...previous,
    characterSet: readRadio(container, "comparaison_characterSet", previous.characterSet),
    collectionRange,
    tokenMode: readRadio(container, "comparaison_tokenMode", previous.tokenMode),
    traceMode: readRadio(container, "comparaison_traceMode", previous.traceMode)
  });

  return normalized;
}

export { getDefaultSettings };

function bindTraceVisibility(container) {
  const update = () => updateTraceVisibility(container);
  container.querySelectorAll('input[name="comparaison_tokenMode"]').forEach((input) => {
    input.addEventListener("change", update);
  });
  update();
}

function updateTraceVisibility(container) {
  const host = container.querySelector("[data-comparaison-trace-settings]");
  if (!host) return;
  const selected = container.querySelector('input[name="comparaison_tokenMode"]:checked');
  const tokenMode = selected?.value || TOKEN_MODES.DISPLAYED;
  host.hidden = tokenMode === TOKEN_MODES.NONE;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  if (typeof document === "undefined") return;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-comparaison-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.comparaisonConfigStyle = href;
  document.head.appendChild(link);
}
