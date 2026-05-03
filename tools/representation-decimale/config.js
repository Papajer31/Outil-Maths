import {
  renderMinMax,
  bindMinMax,
  readMinMax,
  readCheckbox,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import { clampIntValue } from "../../shared/value-constraints.js";
import {
  getDefaultSettings,
  normalizeSettings,
  getThemeAvailability,
  getThemeCatalog,
  TEXT_BLOCKS_LABEL_MODES
} from "./model.js";

let stylesInjected = false;

export function renderToolSettings(container, settings) {
  injectStyles();

  const cfg = normalizeSettings(settings);
  container.innerHTML = renderToolSettingsStack(
    renderMinMax({
      idPrefix: "rd_numbers",
      title: "Nombres",
      minLabel: "Minimum",
      maxLabel: "Maximum",
      minValue: cfg.min,
      maxValue: cfg.max,
      inputMin: 1,
      inputMax: 999,
      step: 1,
      mode: cfg.valueMode,
      startValue: cfg.valueStart,
      stepValue: cfg.valueStep,
      values: cfg.valueList
    }),
    renderDirectionsSection(cfg),
    renderThemesSection(cfg),
    renderTextBlocksSection(cfg)
  );

  bindMinMax(container, "rd_numbers", {
    inputMin: 1,
    inputMax: 999
  });

  bindThemeAvailabilitySync(container);
  bindDirectionSync(container);
  bindTextBlocksSync(container);

  syncThemeAvailability(container);
  syncDirectionAvailability(container);
  syncTextBlocksVisibility(container, { scrollOnReveal: false });
}

export function readToolSettings(container, settings = {}) {
  const range = readMinMax(container, "rd_numbers", {
    inputMin: 1,
    inputMax: 999,
    errorLabel: "Les bornes"
  });

  const activeThemes = getThemeCatalog()
    .map((theme) => theme.id)
    .filter((themeId) => readCheckbox(container, themeInputId(themeId)));

  const allowNumberToRepresentation = readCheckbox(container, "rd_direction_number_to_representation");
  const allowRepresentationToNumber = readCheckbox(container, "rd_direction_representation_to_number");
  const textBlocksLabelMode = readTextBlocksLabelMode(container);

  return normalizeSettings({
    ...getDefaultSettings(),
    ...(settings ?? {}),
    min: range.min,
    max: range.max,
    valueMode: range.mode,
    valueStart: range.start,
    valueStep: range.step,
    valueList: range.values,
    activeThemes,
    allowNumberToRepresentation,
    allowRepresentationToNumber,
    textBlocksLabelMode
  });
}

export { getDefaultSettings };

function renderDirectionsSection(cfg) {
  return `
    <div class="tv-group rd-inline-group rd-direction-group">
      <div class="tv-group-title rd-inline-title">Type de question</div>
      <div class="rd-inline-options rd-direction-options">
        ${renderInlineCheckbox("rd_direction_number_to_representation", "Nombre → Représentation", cfg.allowNumberToRepresentation)}
        ${renderInlineCheckbox("rd_direction_representation_to_number", "Représentation → Nombre", cfg.allowRepresentationToNumber)}
      </div>
    </div>
  `;
}

function renderThemesSection(cfg) {
  const availability = getThemeAvailability(cfg.max);

  return `
    <div class="tv-group rd-theme-group">
      <div class="tv-group-title">Représentations</div>
      <div class="rd-theme-list">
        ${availability.map((theme) => renderThemeTile(theme, cfg.activeThemes.includes(theme.id), cfg.max)).join("")}
      </div>
    </div>
  `;
}

function renderThemeTile(theme, checked, currentMax) {
  const compatible = currentMax <= theme.max;
  const inputId = themeInputId(theme.id);
  const title = compatible
    ? `Disponible pour les nombres jusqu’à ${theme.max}.`
    : `Indisponible avec la borne haute actuelle (${currentMax}).`;

  return `
    <label
      class="tv-checkbox-row rd-theme-row${compatible ? "" : " is-disabled"}"
      data-rd-theme-row="true"
      data-theme-id="${theme.id}"
      data-theme-max="${theme.max}"
      title="${escapeHtml(title)}"
    >
      <input
        class="tv-checkbox rd-theme-checkbox"
        type="checkbox"
        id="${inputId}"
        data-rd-theme-input="true"
        data-theme-id="${theme.id}"
        ${checked && compatible ? "checked" : ""}
        ${compatible ? "" : "disabled"}
      >
      <span class="rd-theme-copy">
        <span class="rd-theme-name">${escapeHtml(theme.label)}</span>
        <span class="rd-theme-cap">Pour les nombres ≤ ${theme.max}</span>
      </span>
    </label>
  `;
}

function renderTextBlocksSection(cfg) {
  const visible = cfg.activeThemes.includes("blocs_textuels");
  return `
    <div class="tv-group rd-inline-group rd-textblocks-group" id="rd_textblocks_group" ${visible ? "" : "hidden"}>
      <div class="tv-group-title rd-inline-title">Libellé des tuiles</div>
      <div class="rd-inline-options rd-textblocks-options" role="radiogroup" aria-label="Libellé des tuiles">
        ${renderTextBlocksOption(TEXT_BLOCKS_LABEL_MODES.FULL_EXPLICIT, cfg.textBlocksLabelMode, ["1 centaine", "10 dizaines", "100 unités"])}
        ${renderTextBlocksOption(TEXT_BLOCKS_LABEL_MODES.FULL_ABRIDGED, cfg.textBlocksLabelMode, ["1 c", "10 d", "100 u"])}
        ${renderTextBlocksOption(TEXT_BLOCKS_LABEL_MODES.LARGE_CLASS_ONLY, cfg.textBlocksLabelMode, ["1 centaine"])}
        ${renderTextBlocksOption(TEXT_BLOCKS_LABEL_MODES.LARGE_CLASS_ABRIDGED, cfg.textBlocksLabelMode, ["1 c"])}
      </div>
    </div>
  `;
}

function renderTextBlocksOption(value, selectedValue, lines) {
  const checked = value === selectedValue;
  const inputId = `rd_textBlocksLabelMode_${value}`;
  return `
    <label class="rd-mode-option${checked ? " is-selected" : ""}">
      <input
        type="radio"
        class="rd-mode-input"
        name="rd_textBlocksLabelMode"
        id="${inputId}"
        value="${value}"
        ${checked ? "checked" : ""}
      >
      <span class="rd-mode-preview" aria-hidden="true">
        ${renderTilePreviewSvg(lines)}
      </span>
    </label>
  `;
}

function renderTilePreviewSvg(lines) {
  const safeLines = Array.isArray(lines) ? lines.slice(0, 3) : [];
  const yPositions = safeLines.length === 1
    ? [54]
    : safeLines.length === 2
      ? [42, 64]
      : [31, 52, 73];

  const text = safeLines.map((line, index) => `
    <text x="60" y="${yPositions[index]}" text-anchor="middle" font-family="Andika, system-ui, sans-serif" font-size="${safeLines.length === 1 ? 16 : 12}" font-weight="700" fill="#ffffff">${escapeHtml(line)}</text>
  `).join("");

  return `
    <svg viewBox="0 0 120 96" xmlns="http://www.w3.org/2000/svg" focusable="false">
      <rect x="6" y="6" width="108" height="84" rx="0" ry="0" fill="#a6c75a" stroke="#1f1f1f" stroke-width="2"/>
      ${text}
    </svg>
  `;
}

function renderInlineCheckbox(id, label, checked) {
  return `
    <label class="tv-checkbox-row rd-inline-checkbox" for="${id}">
      <input
        class="tv-checkbox"
        type="checkbox"
        id="${id}"
        ${checked ? "checked" : ""}
      >
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function bindThemeAvailabilitySync(container) {
  const maxInput = container.querySelector("#rd_numbers_max");
  const themeInputs = Array.from(container.querySelectorAll("[data-rd-theme-input]"));

  const sync = () => {
    syncThemeAvailability(container);
    syncTextBlocksVisibility(container, { scrollOnReveal: true });
  };

  maxInput?.addEventListener("input", sync);
  maxInput?.addEventListener("change", sync);

  themeInputs.forEach((input) => {
    input.addEventListener("change", sync);
  });
}

function bindDirectionSync(container) {
  const inputs = [
    container.querySelector("#rd_direction_number_to_representation"),
    container.querySelector("#rd_direction_representation_to_number")
  ].filter(Boolean);

  const sync = () => syncDirectionAvailability(container);

  inputs.forEach((input) => {
    input.addEventListener("change", sync);
  });
}

function bindTextBlocksSync(container) {
  const inputs = Array.from(container.querySelectorAll('input[name="rd_textBlocksLabelMode"]'));
  const sync = () => {
    const selected = readTextBlocksLabelMode(container);
    inputs.forEach((input) => {
      input.closest(".rd-mode-option")?.classList.toggle("is-selected", input.value === selected);
    });
  };
  inputs.forEach((input) => input.addEventListener("change", sync));
  sync();
}

function syncThemeAvailability(container) {
  const max = getCurrentMaxValue(container);
  const rows = Array.from(container.querySelectorAll("[data-rd-theme-row]"));
  const compatibleRows = [];
  let checkedCompatibleCount = 0;

  rows.forEach((row) => {
    const themeMax = clampIntValue(row.dataset.themeMax, 1, 999);
    const compatible = max <= themeMax;
    const input = row.querySelector('input[type="checkbox"]');

    row.classList.toggle("is-disabled", !compatible);
    row.dataset.compatible = compatible ? "true" : "false";
    row.title = compatible
      ? `Disponible pour les nombres jusqu’à ${themeMax}.`
      : `Indisponible avec la borne haute actuelle (${max}).`;

    const cap = row.querySelector(".rd-theme-cap");
    if (cap) {
      cap.textContent = `Pour les nombres ≤ ${themeMax}`;
    }

    if (!input) return;

    input.disabled = !compatible;

    if (!compatible) {
      input.checked = false;
      return;
    }

    compatibleRows.push(input);
    if (input.checked) {
      checkedCompatibleCount += 1;
    }
  });

  if (!checkedCompatibleCount && compatibleRows.length) {
    compatibleRows[0].checked = true;
  }
}

function syncDirectionAvailability(container) {
  const numberToRepresentation = container.querySelector("#rd_direction_number_to_representation");
  const representationToNumber = container.querySelector("#rd_direction_representation_to_number");

  if (!numberToRepresentation || !representationToNumber) return;

  if (!numberToRepresentation.checked && !representationToNumber.checked) {
    numberToRepresentation.checked = true;
  }
}

function syncTextBlocksVisibility(container, { scrollOnReveal = false } = {}) {
  const group = container.querySelector("#rd_textblocks_group");
  if (!group) return;
  const tilesInput = container.querySelector(`#${themeInputId("blocs_textuels")}`);
  const shouldShow = !!(tilesInput?.checked);
  const wasHidden = !!group.hidden;
  group.hidden = !shouldShow;

  if (scrollOnReveal && wasHidden && shouldShow) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        group.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
      });
    });
  }
}

function readTextBlocksLabelMode(container) {
  const checked = container.querySelector('input[name="rd_textBlocksLabelMode"]:checked');
  const value = String(checked?.value || "").trim();
  return Object.values(TEXT_BLOCKS_LABEL_MODES).includes(value)
    ? value
    : TEXT_BLOCKS_LABEL_MODES.FULL_EXPLICIT;
}

function getCurrentMaxValue(container) {
  return clampIntValue(container.querySelector("#rd_numbers_max")?.value, 1, 999);
}

function themeInputId(themeId) {
  return `rd_theme_${String(themeId || "").trim()}`;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-rd-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.rdConfigStyle = href;
  document.head.appendChild(link);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
