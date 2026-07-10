import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  GAP_VALUES,
  LAYOUT_VALUES,
  LAYOUTS,
  OBJECT_STYLES,
  PROMPT_MODES,
  PROMPT_MODE_VALUES,
  LIMITS,
  getDefaultSettings,
  normalizeSettings,
  canGenerateQuestion,
  getImpossibleMessage
} from "./model.js";

let stylesInjected = false;

const GAP_OPTIONS = Object.freeze([
  { value: "0", label: "0" },
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3plus", label: "3+" }
]);

const LAYOUT_OPTIONS = Object.freeze([
  { value: LAYOUTS.RANDOM, label: "Aléatoire" },
  { value: LAYOUTS.SEPARATED, label: "Couleurs séparées" },
  { value: LAYOUTS.PAIRED, label: "Presque en paires" }
]);

const PROMPT_MODE_OPTIONS = Object.freeze([
  { value: PROMPT_MODES.MORE, label: "Qui en a le plus ?" },
  { value: PROMPT_MODES.LESS, label: "Qui en a le moins ?" }
]);

const STYLE_OPTIONS = Object.freeze([
  { value: OBJECT_STYLES.CUBES, label: "Cubes" },
  { value: OBJECT_STYLES.TOKENS, label: "Jetons" },
  { value: OBJECT_STYLES.EMOJIS, label: "Émojis aléatoires" }
]);

export function renderToolSettings(container, settings) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="pma-config-root">
      ${renderToolSettingsStack(
        renderCheckboxPillGroup({
          title: "Disposition des objets",
          name: "pma_layouts",
          dataAttr: "data-pma-layout",
          options: LAYOUT_OPTIONS,
          selectedValues: cfg.layouts
        }),
        renderCheckboxPillGroup({
          title: "Question",
          name: "pma_prompt_modes",
          dataAttr: "data-pma-prompt-mode",
          options: PROMPT_MODE_OPTIONS,
          selectedValues: cfg.promptModes
        }),
        renderMinMax({
          idPrefix: "pma_collectionSize",
          title: "Taille des collections",
          minLabel: "Minimum",
          maxLabel: "Maximum",
          minValue: cfg.collectionSize.min,
          maxValue: cfg.collectionSize.max,
          inputMin: LIMITS.minCount,
          inputMax: LIMITS.maxCount,
          step: 1
        }),
        renderCheckboxPillGroup({
          title: "Écart entre les collections",
          name: "pma_gaps",
          dataAttr: "data-pma-gap",
          options: GAP_OPTIONS,
          selectedValues: cfg.gaps
        }),
        renderCheckboxPillGroup({
          title: "Style d’objets",
          name: "pma_styles",
          dataAttr: "data-pma-style",
          options: STYLE_OPTIONS,
          selectedValues: cfg.objectStyles
        })
      )}
      <div class="pma-config-status" id="pma_status" aria-live="polite"></div>
    </div>
  `;

  bindToolSettings(container);
  syncValidationStatus(container);
}

export function readToolSettings(container, settings = {}) {
  const normalized = readSettingsFromDom(container, settings);
  if (!canGenerateQuestion(normalized)) {
    throw new Error(getImpossibleMessage(normalized));
  }
  return normalized;
}

export { getDefaultSettings };

function bindToolSettings(container) {
  bindMinMax(container, "pma_collectionSize", {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    onChange: () => syncValidationStatus(container)
  });

  container.querySelectorAll("[data-pma-layout], [data-pma-prompt-mode], [data-pma-gap], [data-pma-style]").forEach((input) => {
    input.addEventListener("change", () => {
      preventEmptyChoiceGroup(container, input);
      syncValidationStatus(container);
    });
  });
}

function readSettingsFromDom(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const layouts = readCheckedValues(container, "[data-pma-layout]", LAYOUT_VALUES, previous.layouts);
  const promptModes = readCheckedValues(container, "[data-pma-prompt-mode]", PROMPT_MODE_VALUES, previous.promptModes);
  const collectionSize = readMinMax(container, "pma_collectionSize", {
    inputMin: LIMITS.minCount,
    inputMax: LIMITS.maxCount,
    errorLabel: "La taille des collections"
  });
  const gaps = readCheckedValues(container, "[data-pma-gap]", GAP_VALUES, previous.gaps);
  const objectStyles = readCheckedValues(container, "[data-pma-style]", Object.values(OBJECT_STYLES), previous.objectStyles);

  return normalizeSettings({
    layouts,
    promptModes,
    collectionSize,
    gaps,
    objectStyles
  });
}

function syncValidationStatus(container) {
  const status = container.querySelector("#pma_status");
  if (!status) return;
  const settings = readSettingsFromDom(container, getDefaultSettings());
  const message = getImpossibleMessage(settings);
  status.textContent = message;
  status.classList.toggle("is-error", !!message);
  status.hidden = !message;
}

function preventEmptyChoiceGroup(container, input) {
  let selector = "[data-pma-style]";
  if (input.matches("[data-pma-layout]")) selector = "[data-pma-layout]";
  else if (input.matches("[data-pma-prompt-mode]")) selector = "[data-pma-prompt-mode]";
  else if (input.matches("[data-pma-gap]")) selector = "[data-pma-gap]";
  const checkedCount = container.querySelectorAll(`${selector}:checked`).length;
  if (checkedCount > 0) return;
  input.checked = true;
}

function renderCheckboxPillGroup({ title, name, dataAttr, options = [], selectedValues = [] }) {
  const selected = new Set((Array.isArray(selectedValues) ? selectedValues : []).map(String));
  const rows = options.map((option, index) => {
    const value = String(option.value ?? "");
    const label = String(option.label ?? value);
    const id = `${name}_${index}`;
    return `
      <label class="pma-config-pill">
        <input
          class="tv-checkbox pma-config-pill-input"
          type="checkbox"
          id="${escapeHtml(id)}"
          value="${escapeHtml(value)}"
          ${dataAttr}
          ${selected.has(value) ? "checked" : ""}
        >
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }).join("");

  return `
    <div class="tv-group tv-group-inline pma-config-choice-group">
      <div class="tv-group-title">${escapeHtml(title)}</div>
      <div class="pma-config-pill-row">${rows}</div>
    </div>
  `;
}

function readCheckedValues(container, selector, allowedValues, fallbackValues) {
  const allowed = new Set((Array.isArray(allowedValues) ? allowedValues : []).map(String));
  const result = [];
  container.querySelectorAll(selector).forEach((input) => {
    if (!input.checked) return;
    const value = String(input.value || "");
    if (!allowed.has(value) || result.includes(value)) return;
    result.push(value);
  });
  return result.length ? result : [...fallbackValues];
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-pma-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.pmaConfigStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
