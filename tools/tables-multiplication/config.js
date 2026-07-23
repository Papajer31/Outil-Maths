import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderSection,
  bindCollapsibleSection
} from "../../shared/config-widgets.js";
import {
  TABLE_OPTIONS,
  MULTIPLIER_OPTIONS,
  ORDER_MODES,
  FACTOR_POSITIONS,
  ANSWER_TARGETS,
  getDefaultSettings,
  normalizeSettings,
  hasAtLeastOneQuestion,
  getImpossibleMessage
} from "./model.js";

let stylesInjected = false;

export function renderToolSettings(container, settings) {
  injectStyles();
  const cfg = normalizeSettings(settings);
  container.innerHTML = `
    <div class="tm-config-root">
      ${renderNumberCheckboxWidget({
        title: "Tables travaillées",
        widgetKey: "tables",
        dataAttr: "data-tm-table",
        values: TABLE_OPTIONS,
        selectedValues: cfg.tables
      })}
      ${renderNumberCheckboxWidget({
        title: "Multiplicateurs disponibles",
        widgetKey: "multipliers",
        dataAttr: "data-tm-multiplier",
        values: MULTIPLIER_OPTIONS,
        selectedValues: cfg.multipliers
      })}
      ${renderRadioGroup({
        title: "Réponse à fournir",
        id: "tm_answerTarget",
        value: cfg.answerTarget,
        options: [
          { value: ANSWER_TARGETS.RESULT, label: "Résultat" },
          { value: ANSWER_TARGETS.FACTOR, label: "Facteur" },
          { value: ANSWER_TARGETS.BOTH, label: "Les deux" }
        ]
      })}
      ${renderSection("Réglages avancés", `
        ${renderRadioGroup({
          title: "Ordre des tables",
          id: "tm_orderMode",
          value: cfg.orderMode,
          options: [
            { value: ORDER_MODES.SHUFFLED, label: "Dans le désordre" },
            { value: ORDER_MODES.ORDERED, label: "Dans l’ordre" }
          ]
        })}
        ${renderRadioGroup({
          title: "Position du facteur travaillé",
          id: "tm_factorPosition",
          value: cfg.factorPosition,
          options: [
            { value: FACTOR_POSITIONS.FIRST, label: "Premier facteur" },
            { value: FACTOR_POSITIONS.SECOND, label: "Second facteur" },
            { value: FACTOR_POSITIONS.BOTH, label: "Aléatoire" }
          ]
        })}
      `, { collapsible: true, expanded: false, idPrefix: "tm_advanced" })}
    </div>
  `;
  bindToolSettings(container);
  syncValidationState(container);
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const nextSettings = {
    tables: readCheckedNumberValues(container, "[data-tm-table]", TABLE_OPTIONS, []),
    multipliers: readCheckedNumberValues(container, "[data-tm-multiplier]", MULTIPLIER_OPTIONS, []),
    answerTarget: readRadio(container, "tm_answerTarget", previous.answerTarget),
    orderMode: readRadio(container, "tm_orderMode", previous.orderMode),
    factorPosition: readRadio(container, "tm_factorPosition", previous.factorPosition)
  };

  const normalized = normalizeSettings(nextSettings);
  if (!hasAtLeastOneQuestion(normalized)) {
    throw new Error(getImpossibleMessage(normalized));
  }

  return normalized;
}

export { getDefaultSettings };

function bindToolSettings(container) {
  bindCollapsibleSection(container, "tm_advanced");
  bindRadio(container, "tm_answerTarget");
  bindRadio(container, "tm_orderMode");
  bindRadio(container, "tm_factorPosition");

  container.querySelectorAll("[data-tm-table], [data-tm-multiplier]").forEach((input) => {
    input.addEventListener("change", () => syncValidationState(container));
  });
}

function syncValidationState(container) {
  const tables = readCheckedNumberValues(container, "[data-tm-table]", TABLE_OPTIONS, []);
  const multipliers = readCheckedNumberValues(container, "[data-tm-multiplier]", MULTIPLIER_OPTIONS, []);
  setWidgetState(container.querySelector('[data-tm-widget="tables"]'), {
    incomplete: tables.length === 0
  });
  setWidgetState(container.querySelector('[data-tm-widget="multipliers"]'), {
    incomplete: multipliers.length === 0
  });
}

function renderNumberCheckboxWidget({ title, widgetKey, dataAttr, values, selectedValues }) {
  const selected = new Set(Array.isArray(selectedValues) ? selectedValues : []);
  const items = (Array.isArray(values) ? values : []).map((value) => {
    const safeValue = Number(value);
    const id = `tm_${widgetKey}_${safeValue}`.replace(/[^a-zA-Z0-9_-]/g, "_");
    return `
      <label class="tv-checkbox-row tm-number-option">
        <input
          class="tv-checkbox"
          type="checkbox"
          id="${escapeAttr(id)}"
          value="${safeValue}"
          ${dataAttr}
          ${selected.has(safeValue) ? "checked" : ""}
        >
        <span>${safeValue}</span>
      </label>
    `;
  }).join("");

  return `
    <div class="tv-group tm-number-widget" data-tm-widget="${escapeAttr(widgetKey)}">
      <div class="tm-number-widget-line">
        <div class="tv-group-title tm-number-widget-title">${escapeHtml(title)}</div>
        <div class="tm-number-options">
          ${items}
        </div>
      </div>
      <div class="tm-widget-warning" data-tm-warning="${escapeAttr(widgetKey)}">Sélectionne au moins une valeur.</div>
    </div>
  `;
}

function readCheckedNumberValues(container, selector, allowedValues, fallbackValues = []) {
  const allowed = new Set((Array.isArray(allowedValues) ? allowedValues : []).map((value) => Number(value)));
  const values = Array.from(container.querySelectorAll(`${selector}:checked`))
    .map((input) => Number(input.value))
    .filter((value) => Number.isFinite(value) && allowed.has(value));

  if (values.length) {
    return (Array.isArray(allowedValues) ? allowedValues : []).filter((value) => values.includes(value));
  }

  return Array.isArray(fallbackValues) ? [...fallbackValues] : [];
}

function setWidgetState(widget, { incomplete = false } = {}) {
  if (!widget) return;
  widget.classList.toggle("is-incomplete", incomplete === true);
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-tm-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.tmConfigStyle = href;
  document.head.appendChild(link);
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
