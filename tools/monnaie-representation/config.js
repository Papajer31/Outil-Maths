import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderSection,
  bindCollapsibleSection,
  renderCheckbox,
  readCheckbox,
  renderStepperField,
  bindStepperField,
  readStepper,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  DENOMINATIONS,
  EXERCISE_TYPES,
  MONEY_ASSET_STYLES,
  MONEY_DISPLAY_FORMATS,
  canGenerateQuestion,
  getDefaultSettings,
  normalizeAssetStyle,
  normalizeDisplayFormats,
  normalizeEnabledDenominations,
  normalizeSettings
} from "./model.js";

const MONEY_EURO_MIN = 0;
const MONEY_EURO_MAX = 500;

let stylesInjected = false;

export function renderToolSettings(container, settings) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="monnaie-rep-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Type d’exercice",
          id: "mr_exerciseType",
          value: cfg.exerciseType,
          options: [
            { value: EXERCISE_TYPES.READ_SUM, label: "Lire une somme" },
            { value: EXERCISE_TYPES.COMPOSE_SUM, label: "Composer une somme" },
            { value: EXERCISE_TYPES.BOTH, label: "Les deux" }
          ]
        }),
        renderMoneyRange({ idPrefix: "mr_money", title: "Somme", range: cfg.moneyRange }),
        renderDenominationsWidget(cfg.enabledDenominations),
        renderAdvancedSettings(cfg)
      )}
    </div>
  `;

  bindRadio(container, "mr_exerciseType", {
    onChange: () => syncAdvancedVisibility(container)
  });
  bindMinMax(container, "mr_money", { inputMin: MONEY_EURO_MIN, inputMax: MONEY_EURO_MAX });
  bindDenominationsWidget(container);
  bindCollapsibleSection(container, "mr_advanced");
  bindDisplayFormatsWidget(container);
  bindRadio(container, "mr_assetStyle");
  bindStepperField(container, "mr_maxAttempts", { inputMin: 1, inputMax: 9 });
  syncAdvancedVisibility(container);
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const next = normalizeSettings({
    ...previous,
    exerciseType: readRadio(container, "mr_exerciseType", previous.exerciseType),
    moneyRange: readMoneyRange(container, "mr_money"),
    enabledDenominations: readDenominations(container, previous.enabledDenominations),
    displayFormats: readDisplayFormats(container, previous.displayFormats),
    assetStyle: normalizeAssetStyle(readRadio(container, "mr_assetStyle", previous.assetStyle)),
    maxAttempts: readStepper(container, "mr_maxAttempts", { inputMin: 1, inputMax: 9 }),
    explicitDeltaFeedback: readCheckbox(container, "mr_explicitDeltaFeedback"),
    requireMinimumItems: readCheckbox(container, "mr_requireMinimumItems")
  });

  if (!canGenerateQuestion(next)) {
    throw new Error("Impossible de générer une question de monnaie avec ces réglages.");
  }

  return next;
}

export { getDefaultSettings };

function renderAdvancedSettings(cfg) {
  return renderSection("Réglages avancés", `
    <div class="mr-advanced-group">
      ${renderDisplayFormatsWidget(cfg.displayFormats)}
      ${renderRadioGroup({
        title: "Style des pièces et billets",
        id: "mr_assetStyle",
        value: cfg.assetStyle,
        options: [
          { value: MONEY_ASSET_STYLES.REALISTIC, label: "Réel" },
          { value: MONEY_ASSET_STYLES.SIMPLE, label: "Simple" }
        ]
      })}
      ${renderComposeCorrectionWidget(cfg)}
      ${renderExerciseConstraintWidget(cfg)}
    </div>
  `, { collapsible: true, expanded: false, idPrefix: "mr_advanced" });
}

function renderComposeCorrectionWidget(cfg) {
  return `
    <div class="tv-group tv-group-inline mr-compose-correction-widget" data-mr-compose-correction ${isComposeExerciseType(cfg.exerciseType) ? "" : "hidden"}>
      <div class="tv-minmax-inline mr-compose-correction-inline">
        <div class="tv-group-title tv-minmax-title">Correction ("Composer une somme" uniquement)</div>
        <div class="mr-compose-correction-controls">
          <div class="mr-advanced-row">
            ${renderStepperField({
              id: "mr_maxAttempts",
              label: "Nombre d'essai maximal",
              value: cfg.maxAttempts,
              inputMin: 1,
              inputMax: 9,
              fieldClassName: "mr-max-attempts-field"
            })}
          </div>
          <div class="mr-compose-correction-toggle">
            ${renderCheckbox({ id: "mr_explicitDeltaFeedback", label: "Somme à corriger explicite", checked: cfg.explicitDeltaFeedback })}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderExerciseConstraintWidget(cfg) {
  return `
    <div class="tv-group tv-group-inline mr-exercise-constraint-widget" data-mr-exercise-constraint ${isComposeExerciseType(cfg.exerciseType) ? "" : "hidden"}>
      <div class="tv-minmax-inline">
        <div class="tv-group-title tv-minmax-title">Contrainte ("Composer une somme" uniquement)</div>
        <div class="mr-checkbox-stack">
          ${renderCheckbox({ id: "mr_requireMinimumItems", label: "Utiliser le minimum de pièces et billets", checked: cfg.requireMinimumItems })}
        </div>
      </div>
    </div>
  `;
}

function syncAdvancedVisibility(container) {
  const exerciseType = readRadio(container, "mr_exerciseType", EXERCISE_TYPES.BOTH);
  const showComposeOnlySettings = isComposeExerciseType(exerciseType);
  container.querySelectorAll("[data-mr-compose-correction], [data-mr-exercise-constraint]").forEach((element) => {
    element.hidden = !showComposeOnlySettings;
  });
}

function isComposeExerciseType(exerciseType) {
  return exerciseType === EXERCISE_TYPES.COMPOSE_SUM || exerciseType === EXERCISE_TYPES.BOTH;
}

function renderDisplayFormatsWidget(displayFormats) {
  const selected = new Set(normalizeDisplayFormats(displayFormats));
  const options = [
    { value: MONEY_DISPLAY_FORMATS.DECIMAL, label: "12,06 €" },
    { value: MONEY_DISPLAY_FORMATS.EUROS_CENTS, label: "12 € 06 c" },
    { value: MONEY_DISPLAY_FORMATS.CENTS_ONLY, label: "1206 c" },
    { value: MONEY_DISPLAY_FORMATS.WORDS, label: "12 euros et 6 centimes" }
  ];
  return `
    <div class="tv-group tv-group-inline mr-format-widget" data-mr-display-formats>
      <div class="tv-minmax-inline">
        <div class="tv-group-title tv-minmax-title">Format d’affichage des sommes</div>
        <div class="tv-radio-options mr-checkbox-options mr-format-options">
          ${options.map((option) => `
            <label class="tv-checkbox-row mr-format-option">
              <input class="tv-checkbox" type="checkbox" data-mr-display-format="${escapeAttr(option.value)}" ${selected.has(option.value) ? "checked" : ""}>
              <span>${escapeHtml(option.label)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderMoneyRange({ idPrefix, title, range }) {
  return renderMinMax({
    idPrefix,
    title,
    minLabel: "Minimum",
    maxLabel: "Maximum",
    minValue: centsToWholeEuros(range?.minCents),
    maxValue: centsToWholeEuros(range?.maxCents),
    inputMin: MONEY_EURO_MIN,
    inputMax: MONEY_EURO_MAX,
    step: 1,
    mode: range?.mode,
    startValue: range?.start,
    stepValue: range?.step,
    values: range?.values
  });
}

function readMoneyRange(container, idPrefix) {
  const range = readMinMax(container, idPrefix, {
    inputMin: MONEY_EURO_MIN,
    inputMax: MONEY_EURO_MAX,
    errorLabel: "Les sommes"
  });
  return {
    minCents: range.min * 100,
    maxCents: range.max * 100,
    mode: range.mode,
    start: range.start,
    step: range.step,
    values: range.values
  };
}

function centsToWholeEuros(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return 0;
  return Math.min(MONEY_EURO_MAX, Math.max(MONEY_EURO_MIN, Math.round(value / 100)));
}

function renderDenominationsWidget(enabledDenominations) {
  const enabled = normalizeEnabledDenominations(enabledDenominations);
  const main = DENOMINATIONS.filter((denomination) => denomination.group === "main");
  const more = DENOMINATIONS.filter((denomination) => denomination.group === "more");
  return `
    <section class="tv-group mr-denom-widget" data-mr-denominations>
      <div class="mr-denom-header">
        <div class="tv-group-title">Pièces et billets disponibles</div>
        <button class="tv-minmax-toggle mr-denom-toggle" type="button" aria-expanded="false" aria-controls="mr_denom_more" aria-label="Afficher les autres pièces et billets" title="Afficher les autres pièces et billets">
          <span class="tv-stepper-icon mr-denom-toggle-icon" aria-hidden="true">expand_more</span>
        </button>
      </div>
      <div class="mr-denom-row mr-denom-row-main">
        ${main.map((denomination) => renderDenominationOption(denomination, enabled[denomination.id])).join("")}
      </div>
      <div class="mr-denom-row mr-denom-row-more" id="mr_denom_more" hidden>
        ${more.map((denomination) => renderDenominationOption(denomination, enabled[denomination.id])).join("")}
      </div>
    </section>
  `;
}

function renderDenominationOption(denomination, checked) {
  const id = `mr_denom_${denomination.id}`;
  return `
    <label class="tv-checkbox-row mr-denom-option" for="${escapeAttr(id)}">
      <input class="tv-checkbox mr-denom-checkbox" type="checkbox" id="${escapeAttr(id)}" data-mr-denomination="${escapeAttr(denomination.id)}" ${checked ? "checked" : ""}>
      <span class="mr-denom-preview mr-denom-preview--${denomination.kind}">${renderDenominationFace(denomination)}</span>
    </label>
  `;
}

function renderDenominationFace(denomination) {
  const asset = String(denomination?.asset || "").trim();
  if (!asset) return escapeHtml(denomination?.label ?? "");
  const src = new URL(`../../shared/tool-assets/images/monnaie/${asset}`, import.meta.url).href;
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(denomination.label)}" loading="lazy">`;
}

function bindDenominationsWidget(container) {
  const widget = container.querySelector("[data-mr-denominations]");
  const toggle = widget?.querySelector(".mr-denom-toggle");
  const more = widget?.querySelector("#mr_denom_more");
  if (!toggle || !more) return;
  const setOpen = (open) => {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Masquer les autres pièces et billets" : "Afficher les autres pièces et billets");
    toggle.title = open ? "Masquer les autres pièces et billets" : "Afficher les autres pièces et billets";
    more.hidden = !open;
    more.classList.toggle("is-open", open);
  };
  toggle.addEventListener("click", () => {
    setOpen(toggle.getAttribute("aria-expanded") !== "true");
  });
  if (Array.from(more.querySelectorAll("input")).some((input) => input.checked)) {
    setOpen(true);
  }
}

function readDenominations(container, previous = {}) {
  const fallback = normalizeEnabledDenominations(previous);
  const out = { ...fallback };
  DENOMINATIONS.forEach((denomination) => {
    const input = container.querySelector(`[data-mr-denomination="${cssEscape(denomination.id)}"]`);
    out[denomination.id] = input ? Boolean(input.checked) : Boolean(fallback[denomination.id]);
  });
  return normalizeEnabledDenominations(out);
}

function bindDisplayFormatsWidget(container) {
  const inputs = Array.from(container.querySelectorAll("[data-mr-display-format]"));
  inputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (inputs.some((candidate) => candidate.checked)) return;
      input.checked = true;
    });
  });
}

function readDisplayFormats(container, previous = []) {
  const values = Array.from(container.querySelectorAll("[data-mr-display-format]:checked"))
    .map((input) => input.dataset.mrDisplayFormat);
  return normalizeDisplayFormats(values.length ? values : previous);
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-monnaie-rep-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.monnaieRepConfigStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function cssEscape(value) {
  if (window.CSS?.escape) return window.CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
