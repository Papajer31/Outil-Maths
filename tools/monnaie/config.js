import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderCheckbox,
  readCheckbox,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  COMPARISON_QUESTIONS,
  DENOMINATIONS,
  EXERCISE_TYPES,
  MONEY_DISPLAY_FORMATS,
  canGenerateQuestion,
  getDefaultSettings,
  normalizeEnabledDenominations,
  normalizeSettings
} from "./model.js";

const MONEY_EURO_MIN = 0;
const MONEY_EURO_MAX = 500;

let stylesInjected = false;

export function renderToolSettings(container, settings) {
  injectStyles();
  container.classList.add("monnaie-config-root");
  const cfg = normalizeSettings(settings);

  container.innerHTML = renderToolSettingsStack(
    renderDenominationsWidget(cfg.enabledDenominations),
    renderDisplayFormatWidget(cfg.displayFormat),
    renderRadioGroup({
      title: "Type d’exercice",
      id: "mon_exerciseType",
      value: cfg.exerciseType,
      options: [
        { value: EXERCISE_TYPES.READ_SUM, label: "Lire une somme" },
        { value: EXERCISE_TYPES.COMPOSE_SUM, label: "Composer une somme" },
        { value: EXERCISE_TYPES.COMPARE_SUMS, label: "Comparer des sommes" },
        { value: EXERCISE_TYPES.BUY_OBJECTS, label: "Acheter des objets", disabled: true },
        { value: EXERCISE_TYPES.MANY_WAYS, label: "Trouver plusieurs façons", disabled: true },
        { value: EXERCISE_TYPES.GIVE_CHANGE, label: "Rendre la monnaie", disabled: true }
      ]
    }),
    renderExerciseSettings(cfg)
  );

  bindDenominationsWidget(container);
  bindRadio(container, "mon_displayFormat");
  bindRadio(container, "mon_exerciseType", {
    onChange: (value) => renderToolSettings(container, {
      ...cfg,
      enabledDenominations: readDenominations(container, cfg.enabledDenominations),
      displayFormat: readRadio(container, "mon_displayFormat", cfg.displayFormat),
      exerciseType: value
    })
  });

  bindCurrentMoneyRange(container, cfg.exerciseType);

  if (cfg.exerciseType === EXERCISE_TYPES.COMPARE_SUMS) {
    bindRadio(container, "mon_compare_questionMode");
    bindRadio(container, "mon_compare_itemCount");
  }
}

export function readToolSettings(container, settings = {}) {
  const previous = normalizeSettings(settings);
  const exerciseType = readRadio(container, "mon_exerciseType", previous.exerciseType);
  const enabledDenominations = readDenominations(container, previous.enabledDenominations);
  const isReadSum = exerciseType === EXERCISE_TYPES.READ_SUM;
  const isComposeSum = exerciseType === EXERCISE_TYPES.COMPOSE_SUM;
  const isCompareSums = exerciseType === EXERCISE_TYPES.COMPARE_SUMS;

  const next = normalizeSettings({
    ...previous,
    enabledDenominations,
    displayFormat: readRadio(container, "mon_displayFormat", previous.displayFormat),
    exerciseType,
    readSum: {
      ...previous.readSum,
      ...(isReadSum ? readMoneyRange(container, "mon_read") : {})
    },
    composeSum: {
      ...previous.composeSum,
      ...(isComposeSum ? readMoneyRange(container, "mon_compose") : {}),
      requireMinimumItems: isComposeSum
        ? readCheckbox(container, "mon_compose_minimum")
        : previous.composeSum.requireMinimumItems
    },
    compareSums: {
      ...previous.compareSums,
      ...(isCompareSums ? readMoneyRange(container, "mon_compare") : {}),
      questionMode: isCompareSums
        ? readRadio(container, "mon_compare_questionMode", previous.compareSums.questionMode)
        : previous.compareSums.questionMode,
      itemCount: isCompareSums
        ? Number(readRadio(container, "mon_compare_itemCount", previous.compareSums.itemCount))
        : previous.compareSums.itemCount
    }
  });

  if (!canGenerateQuestion(next)) {
    throw new Error("Impossible de générer une question de monnaie avec ces réglages.");
  }

  return next;
}

export { getDefaultSettings };

function renderDisplayFormatWidget(displayFormat) {
  return renderRadioGroup({
    title: "Affichage",
    id: "mon_displayFormat",
    value: displayFormat,
    options: [
      { value: MONEY_DISPLAY_FORMATS.DECIMAL, label: "12,06 €" },
      { value: MONEY_DISPLAY_FORMATS.EUROS_CENTS, label: "12 € 06 c" }
    ]
  });
}

function renderExerciseSettings(cfg) {
  if (cfg.exerciseType === EXERCISE_TYPES.COMPOSE_SUM) {
    return [
      renderMoneyRange({ idPrefix: "mon_compose", title: "Somme", range: cfg.composeSum }),
      `
        <section class="tv-group tv-group-inline mon-config-checkbox-group">
          <div class="tv-group-title">Pièces et billets</div>
          <div class="mon-checkbox-inline">
            ${renderCheckbox({ id: "mon_compose_minimum", label: "Utiliser le minimum de pièces et billets", checked: cfg.composeSum.requireMinimumItems })}
          </div>
        </section>
      `
    ];
  }

  if (cfg.exerciseType === EXERCISE_TYPES.COMPARE_SUMS) {
    return [
      renderRadioGroup({
        title: "Question",
        id: "mon_compare_questionMode",
        value: cfg.compareSums.questionMode,
        options: [
          { value: COMPARISON_QUESTIONS.MORE, label: "Qui a le plus d’argent ?" },
          { value: COMPARISON_QUESTIONS.LESS, label: "Qui a le moins d’argent ?" },
          { value: COMPARISON_QUESTIONS.BOTH, label: "Les deux" }
        ]
      }),
      renderRadioGroup({
        title: "Nombre d’éléments à comparer",
        id: "mon_compare_itemCount",
        value: cfg.compareSums.itemCount,
        options: [2, 3, 4].map((value) => ({ value, label: String(value) }))
      }),
      renderMoneyRange({ idPrefix: "mon_compare", title: "Sommes", range: cfg.compareSums })
    ];
  }

  return renderMoneyRange({ idPrefix: "mon_read", title: "Somme", range: cfg.readSum });
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

function bindCurrentMoneyRange(container, exerciseType) {
  const idPrefix = exerciseType === EXERCISE_TYPES.COMPOSE_SUM
    ? "mon_compose"
    : exerciseType === EXERCISE_TYPES.COMPARE_SUMS
      ? "mon_compare"
      : "mon_read";
  bindMinMax(container, idPrefix, { inputMin: MONEY_EURO_MIN, inputMax: MONEY_EURO_MAX });
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
    <section class="tv-group mon-denom-widget" data-mon-denominations>
      <div class="mon-denom-header">
        <div class="tv-group-title">Pièces et billets disponibles</div>
        <button class="tv-minmax-toggle mon-denom-toggle" type="button" aria-expanded="false" aria-controls="mon_denom_more" aria-label="Afficher les autres pièces et billets" title="Afficher les autres pièces et billets">
          <span class="tv-stepper-icon mon-denom-toggle-icon" aria-hidden="true">expand_more</span>
        </button>
      </div>
      <div class="mon-denom-row mon-denom-row-main">
        ${main.map((denomination) => renderDenominationOption(denomination, enabled[denomination.id])).join("")}
      </div>
      <div class="mon-denom-row mon-denom-row-more" id="mon_denom_more" hidden>
        ${more.map((denomination) => renderDenominationOption(denomination, enabled[denomination.id])).join("")}
      </div>
    </section>
  `;
}

function renderDenominationOption(denomination, checked) {
  const id = `mon_denom_${denomination.id}`;
  return `
    <label class="mon-denom-option" for="${escapeAttr(id)}">
      <input class="tv-checkbox mon-denom-checkbox" type="checkbox" id="${escapeAttr(id)}" data-mon-denomination="${escapeAttr(denomination.id)}" ${checked ? "checked" : ""}>
      <span class="mon-denom-preview mon-denom-preview--${denomination.kind}">${renderDenominationFace(denomination)}</span>
    </label>
  `;
}

function renderDenominationFace(denomination) {
  const asset = String(denomination?.asset || "").trim();
  if (!asset) return escapeHtml(denomination?.label ?? "");
  const src = new URL(`./assets/${asset}`, import.meta.url).href;
  return `<img src="${escapeAttr(src)}" alt="${escapeAttr(denomination.label)}" loading="lazy">`;
}

function bindDenominationsWidget(container) {
  const widget = container.querySelector("[data-mon-denominations]");
  const toggle = widget?.querySelector(".mon-denom-toggle");
  const more = widget?.querySelector("#mon_denom_more");
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
    const input = container.querySelector(`[data-mon-denomination="${cssEscape(denomination.id)}"]`);
    out[denomination.id] = input ? Boolean(input.checked) : Boolean(fallback[denomination.id]);
  });
  return normalizeEnabledDenominations(out);
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-monnaie-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.monnaieConfigStyle = href;
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
