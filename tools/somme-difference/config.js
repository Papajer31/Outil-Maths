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
  LIMITS,
  RESPONSE_MODE_LABELS,
  RESPONSE_MODES,
  TRACE_MODE_LABELS,
  TRACE_MODES,
  getDefaultSettings,
  normalizeSettings
} from "./model.js";

const RESPONSE_MODE_OPTIONS = Object.freeze([
  { value: RESPONSE_MODES.PROPOSED, label: RESPONSE_MODE_LABELS[RESPONSE_MODES.PROPOSED] },
  { value: RESPONSE_MODES.SEGMENTED, label: RESPONSE_MODE_LABELS[RESPONSE_MODES.SEGMENTED] },
  { value: RESPONSE_MODES.COMPLETE, label: RESPONSE_MODE_LABELS[RESPONSE_MODES.COMPLETE] }
]);

const TRACE_OPTIONS = Object.freeze([
  { value: TRACE_MODES.ENABLED, label: TRACE_MODE_LABELS[TRACE_MODES.ENABLED] },
  { value: TRACE_MODES.DISABLED, label: TRACE_MODE_LABELS[TRACE_MODES.DISABLED] }
]);

let stylesInjected = false;

export function renderToolSettings(container, settings = {}) {
  injectStyles();
  const cfg = normalizeSettings(settings);
  container.innerHTML = `
    <div class="sd-config-root">
      ${renderToolSettingsStack(
        renderMinMax({
          idPrefix: "sd_collectionRange",
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
          title: "Mode de réponse",
          id: "sd_responseMode",
          value: cfg.responseMode,
          options: RESPONSE_MODE_OPTIONS,
          inline: true
        }),
        renderRadioGroup({
          title: "Tracé libre",
          id: "sd_traceMode",
          value: cfg.traceMode,
          options: TRACE_OPTIONS
        })
      )}
    </div>
  `;

  bindMinMax(container, "sd_collectionRange", {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount
  });
  bindRadio(container, "sd_responseMode");
  bindRadio(container, "sd_traceMode");
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const collectionRange = readMinMax(container, "sd_collectionRange", {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    errorLabel: "Les bornes des collections"
  });

  if (!Array.isArray(collectionRange.allowedValues) || collectionRange.allowedValues.length < 2) {
    throw new Error("Les bornes des collections doivent produire au moins deux valeurs différentes.");
  }

  return normalizeSettings({
    ...previous,
    collectionRange,
    responseMode: readRadio(container, "sd_responseMode", previous.responseMode),
    traceMode: readRadio(container, "sd_traceMode", previous.traceMode)
  });
}

export { getDefaultSettings };

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  if (typeof document === "undefined") return;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-sd-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.sdConfigStyle = href;
  document.head.appendChild(link);
}
