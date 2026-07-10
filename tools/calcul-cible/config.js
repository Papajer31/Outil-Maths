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
  NUMBER_POOL_OPTIONS,
  OPERATION_OPTIONS,
  DEFAULT_ALLOWED_OPERATIONS,
  getDefaultSettings,
  normalizeSettings,
  canGenerateQuestion
} from "./model.js";

let stylesInjected = false;
const editorUiState = new WeakMap();
const TOOL_MODE = EXERCISE_TYPES.TARGETED_CALCULATIONS;
const TOOL_LABEL = "Calcul ciblé";
const ROOT_CLASS = "cc-config-root";
const ID_PREFIX = "cc";

export function renderToolSettings(container, settings) {
  injectStyles();
  const cfg = normalizeForTool(settings);
  const branch = getToolBranch(cfg);

  container.innerHTML = `
    <div class="${ROOT_CLASS}">
      ${renderBaseSettings(branch)}
      ${renderSection("Réglages avancés", `
        ${renderOperationsWidget(branch.allowedOperations)}
        ${renderNumberPoolWidget(branch.specialNumbers)}
      `, { collapsible: true, expanded: false, idPrefix: `${ID_PREFIX}_advanced` })}
    </div>
  `;

  bindToolSettings(container);
  editorUiState.set(container, cfg);
}

export function readToolSettings(container, settings = {}) {
  const normalized = readSettingsFromDom(container, settings);
  if (!canGenerateQuestion(normalized)) {
    throw new Error(`Aucune question ${TOOL_LABEL} possible avec ces réglages.`);
  }
  return normalized;
}

export { getDefaultSettings };

function renderBaseSettings(branch) {
  const countWidget = TOOL_MODE === EXERCISE_TYPES.TARGETED_CALCULATIONS
    ? renderRadioGroup({
        title: "Nombres de départ",
        id: `${ID_PREFIX}_numberCount`,
        value: branch.numberCount,
        options: [
          { value: 4, label: "4 nombres" },
          { value: 5, label: "5 nombres" }
        ]
      })
    : "";

  return `
    ${countWidget}
    ${renderMinMax({
      idPrefix: `${ID_PREFIX}_target`,
      title: "Cible",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: branch.targetMin,
      maxValue: branch.targetMax,
      inputMin: 1,
      inputMax: 1000,
      step: 1
    })}
  `;
}

function renderOperationsWidget(allowedOperations) {
  const selected = new Set(Array.isArray(allowedOperations) ? allowedOperations : DEFAULT_ALLOWED_OPERATIONS);
  return `
    <div class="tv-group ${ROOT_CLASS}__ops" data-${ID_PREFIX}-widget="operations">
      <div class="tv-group-title">Opérations autorisées</div>
      <div class="${ROOT_CLASS}__ops-row">
        ${OPERATION_OPTIONS.map((op) => {
          const label = getOperationLabel(op);
          return `
          <label class="${ROOT_CLASS}__op-pill${selected.has(op) ? " is-selected" : ""}" title="${op === "÷" ? "Division exacte" : ""}">
            <input type="checkbox" data-${ID_PREFIX}-operation value="${escapeAttr(op)}" ${selected.has(op) ? "checked" : ""} aria-label="${escapeAttr(op === "÷" ? "Autoriser la division exacte" : `Autoriser ${op}`)}">
            <span class="${ROOT_CLASS}__op-symbol">${escapeHtml(op)}</span>
            <span class="${ROOT_CLASS}__op-label">${escapeHtml(label)}</span>
          </label>
        `;
        }).join("")}
      </div>
      <div class="${ROOT_CLASS}__warning" data-${ID_PREFIX}-operation-warning>Sélectionne au moins une opération.</div>
    </div>
  `;
}

function getOperationLabel(op) {
  if (op === "+") return "addition";
  if (op === "-") return "soustraction";
  if (op === "×") return "multiplication";
  if (op === "÷") return "division exacte";
  return op;
}

function renderNumberPoolWidget(selection) {
  const selected = selection && typeof selection === "object" ? selection : {};
  const items = NUMBER_POOL_OPTIONS
    .map((option) => `
      <label class="${ROOT_CLASS}__number-pill${selected[option.id] ? " is-selected" : ""}">
        <input type="checkbox" data-${ID_PREFIX}-number-pool value="${escapeAttr(option.id)}" ${selected[option.id] ? "checked" : ""}>
        <span>${escapeHtml(option.label)}</span>
      </label>
    `).join("");

  return `
    <div class="tv-group ${ROOT_CLASS}__number-pool" data-${ID_PREFIX}-widget="number-pool">
      <div class="tv-group-title">Nombres proposés</div>
      <div class="${ROOT_CLASS}__number-row">${items}</div>
      <div class="${ROOT_CLASS}__warning" data-${ID_PREFIX}-number-warning>Sélectionne assez de nombres proposés.</div>
    </div>
  `;
}

function bindToolSettings(container) {
  bindRadio(container, `${ID_PREFIX}_numberCount`, { onChange: () => syncValidationState(container) });
  bindCollapsibleSection(container, `${ID_PREFIX}_advanced`);
  bindMinMax(container, `${ID_PREFIX}_target`, { inputMin: 1, inputMax: 1000 });

  container.querySelectorAll(`[data-${ID_PREFIX}-operation]`).forEach((input) => {
    input.addEventListener("change", () => syncValidationState(container));
  });
  container.querySelectorAll(`[data-${ID_PREFIX}-number-pool]`).forEach((input) => {
    input.addEventListener("change", () => syncValidationState(container));
  });
  syncValidationState(container);
}

function readSettingsFromDom(container, settings = {}) {
  const previous = normalizeForTool(settings);
  const previousBranch = getToolBranch(previous);
  const target = readMinMax(container, `${ID_PREFIX}_target`, { inputMin: 1, inputMax: 1000, errorLabel: "La cible" });
  const allowedOperations = readAllowedOperations(container, previousBranch.allowedOperations);
  const specialNumbers = readNumberPoolSelection(container, previousBranch.specialNumbers);

  const branch = {
    ...previousBranch,
    targetMin: target.min,
    targetMax: target.max,
    allowedOperations,
    allowExactDivision: allowedOperations.includes("÷"),
    specialNumbers
  };

  if (TOOL_MODE === EXERCISE_TYPES.TARGETED_CALCULATIONS) {
    branch.numberCount = readNumberRadio(container, `${ID_PREFIX}_numberCount`, previousBranch.numberCount);
    return normalizeSettings({
      exerciseType: EXERCISE_TYPES.TARGETED_CALCULATIONS,
      targetedCalculations: branch
    });
  }

  return normalizeSettings({
    exerciseType: EXERCISE_TYPES.CLASSIC_CHALLENGE,
    classicChallenge: branch
  });
}

function normalizeForTool(settings = {}) {
  const safeSettings = settings && typeof settings === "object" ? settings : {};
  if (TOOL_MODE === EXERCISE_TYPES.TARGETED_CALCULATIONS) {
    return normalizeSettings({
      ...safeSettings,
      exerciseType: EXERCISE_TYPES.TARGETED_CALCULATIONS,
      targetedCalculations: safeSettings.targetedCalculations ?? safeSettings
    });
  }

  return normalizeSettings({
    ...safeSettings,
    exerciseType: EXERCISE_TYPES.CLASSIC_CHALLENGE,
    classicChallenge: safeSettings.classicChallenge ?? safeSettings
  });
}

function getToolBranch(settings) {
  return TOOL_MODE === EXERCISE_TYPES.TARGETED_CALCULATIONS
    ? settings.targetedCalculations
    : settings.classicChallenge;
}

function readAllowedOperations(container, fallback = DEFAULT_ALLOWED_OPERATIONS) {
  const values = Array.from(container.querySelectorAll(`[data-${ID_PREFIX}-operation]:checked`))
    .map((input) => String(input.value || ""))
    .filter((value) => OPERATION_OPTIONS.includes(value));
  return values.length ? values : [...fallback];
}

function readNumberPoolSelection(container, fallback = {}) {
  const out = {};
  NUMBER_POOL_OPTIONS.forEach((option) => {
    const input = container.querySelector(`[data-${ID_PREFIX}-number-pool][value="${cssEscape(option.id)}"]`);
    out[option.id] = input ? input.checked === true : Boolean(fallback?.[option.id]);
  });
  return out;
}

function readNumberRadio(container, id, fallback) {
  const raw = readRadio(container, id, fallback);
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function syncValidationState(container) {
  const operationCount = container.querySelectorAll(`[data-${ID_PREFIX}-operation]:checked`).length;
  const requiredNumbers = TOOL_MODE === EXERCISE_TYPES.TARGETED_CALCULATIONS
    ? readNumberRadio(container, `${ID_PREFIX}_numberCount`, 4)
    : 6;
  const selectedNumbers = getSelectedNumberValues(container).length;

  const operationsWidget = container.querySelector(`[data-${ID_PREFIX}-widget="operations"]`);
  const numbersWidget = container.querySelector(`[data-${ID_PREFIX}-widget="number-pool"]`);
  operationsWidget?.classList.toggle("is-incomplete", operationCount === 0);
  numbersWidget?.classList.toggle("is-incomplete", selectedNumbers < requiredNumbers);
}

function getSelectedNumberValues(container) {
  const selectedIds = new Set(Array.from(container.querySelectorAll(`[data-${ID_PREFIX}-number-pool]:checked`)).map((input) => String(input.value || "")));
  const values = [];
  NUMBER_POOL_OPTIONS.forEach((option) => {
    if (!selectedIds.has(option.id)) return;
    values.push(...option.values);
  });
  return [...new Set(values)].sort((a, b) => a - b);
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-${ID_PREFIX}-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.setAttribute(`data-${ID_PREFIX}-config-style`, href);
  document.head.appendChild(link);
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
