import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  BINARY_CHOICE,
  BINARY_CHOICE_LABELS,
  DIGIT_VALUES,
  MODEL_VISIBILITY,
  MODEL_VISIBILITY_LABELS,
  TOLERANCE_LEVELS,
  TOLERANCE_LEVEL_LABELS,
  getDefaultSettings,
  normalizeSettings
} from "./model.js";

let stylesInjected = false;

const BINARY_OPTIONS = Object.freeze([
  { value: BINARY_CHOICE.WITH, label: BINARY_CHOICE_LABELS[BINARY_CHOICE.WITH] },
  { value: BINARY_CHOICE.WITHOUT, label: BINARY_CHOICE_LABELS[BINARY_CHOICE.WITHOUT] }
]);

const MODEL_VISIBILITY_OPTIONS = Object.freeze([
  { value: MODEL_VISIBILITY.VISIBLE, label: MODEL_VISIBILITY_LABELS[MODEL_VISIBILITY.VISIBLE] },
  { value: MODEL_VISIBILITY.TRACE, label: MODEL_VISIBILITY_LABELS[MODEL_VISIBILITY.TRACE] },
  { value: MODEL_VISIBILITY.HIDDEN, label: MODEL_VISIBILITY_LABELS[MODEL_VISIBILITY.HIDDEN] }
]);

const TOLERANCE_OPTIONS = Object.freeze([
  { value: TOLERANCE_LEVELS.LARGE, label: TOLERANCE_LEVEL_LABELS[TOLERANCE_LEVELS.LARGE] },
  { value: TOLERANCE_LEVELS.MEDIUM, label: TOLERANCE_LEVEL_LABELS[TOLERANCE_LEVELS.MEDIUM] },
  { value: TOLERANCE_LEVELS.LOW, label: TOLERANCE_LEVEL_LABELS[TOLERANCE_LEVELS.LOW] }
]);

export function renderToolSettings(container, settings) {
  injectStyles();
  const cfg = normalizeSettings(settings);
  container.innerHTML = `
    <div class="gg-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Animation",
          id: "gg_animation",
          value: cfg.animation,
          options: BINARY_OPTIONS
        }),
        renderRadioGroup({
          title: "Point de départ",
          id: "gg_startPoint",
          value: cfg.startPoint,
          options: BINARY_OPTIONS
        }),
        renderRadioGroup({
          title: "Validation du tracé",
          id: "gg_toleranceLevel",
          value: cfg.toleranceLevel,
          options: TOLERANCE_OPTIONS
        }),
        renderModelVisibilityWidget(cfg),
        renderDigitsWidget(cfg.digits)
      )}
    </div>
  `;

  container.querySelectorAll("[data-gg-digit]").forEach((input) => {
    input.addEventListener("change", () => preventEmptyDigits(container, input));
  });
  bindRadio(container, "gg_animation", { onChange: () => syncConditionalWidgets(container) });
  bindRadio(container, "gg_startPoint");
  bindRadio(container, "gg_toleranceLevel");
  bindRadio(container, "gg_modelVisibility");
  syncConditionalWidgets(container);
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const digits = readDigits(container, previous.digits);
  return normalizeSettings({
    digits,
    animation: readRadio(container, "gg_animation", previous.animation),
    startPoint: readRadio(container, "gg_startPoint", previous.startPoint),
    toleranceLevel: readRadio(container, "gg_toleranceLevel", previous.toleranceLevel),
    modelVisibility: readRadio(container, "gg_modelVisibility", previous.modelVisibility)
  });
}

export { getDefaultSettings };

function renderModelVisibilityWidget(cfg) {
  return `
    <div class="gg-model-visibility-widget" data-gg-model-visibility-widget ${cfg.animationEnabled ? "" : "hidden"}>
      ${renderRadioGroup({
        title: "Modèle après animation",
        id: "gg_modelVisibility",
        value: cfg.modelVisibility,
        options: MODEL_VISIBILITY_OPTIONS
      })}
    </div>
  `;
}

function syncConditionalWidgets(container) {
  const animation = readRadio(container, "gg_animation", BINARY_CHOICE.WITH);
  const modelWidget = container.querySelector("[data-gg-model-visibility-widget]");
  if (modelWidget) modelWidget.hidden = animation !== BINARY_CHOICE.WITH;
}

function renderDigitsWidget(selectedDigits = []) {
  const selected = new Set(selectedDigits.map(String));
  const rows = DIGIT_VALUES.map((digit) => `
    <label class="gg-digit-pill">
      <input class="tv-checkbox gg-digit-input" type="checkbox" value="${escapeHtml(digit)}" data-gg-digit ${selected.has(digit) ? "checked" : ""}>
      <span>${escapeHtml(digit)}</span>
    </label>
  `).join("");

  return `
    <div class="tv-group tv-group-inline gg-config-digits-group">
      <div class="tv-group-title">Chiffres travaillés</div>
      <div class="gg-config-digits-row">${rows}</div>
    </div>
  `;
}

function readDigits(container, fallbackDigits) {
  const digits = [];
  container.querySelectorAll("[data-gg-digit]").forEach((input) => {
    if (!input.checked) return;
    const value = String(input.value || "").trim();
    if (DIGIT_VALUES.includes(value) && !digits.includes(value)) digits.push(value);
  });
  return digits.length ? digits : [...fallbackDigits];
}

function preventEmptyDigits(container, input) {
  const checkedCount = container.querySelectorAll("[data-gg-digit]:checked").length;
  if (checkedCount > 0) return;
  input.checked = true;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-gg-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.ggConfigStyle = href;
  document.head.appendChild(link);
}
