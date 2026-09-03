import {
  bindStepperField,
  readRadio,
  readStepper,
  renderRadioGroup,
  renderStepperField,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  WRITING_MODES,
  getDefaultSettings,
  normalizeSettings,
  validateSettings
} from "./model.js";

let stylesInjected = false;

export function renderToolSettings(container, settings = {}) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="ro-config-root">
      ${renderToolSettingsStack(
        renderPossibilities(cfg),
        renderCounts(cfg),
        renderRadioGroup({
          title:"Écriture",
          id:"ro_writingMode",
          value:cfg.writingMode,
          options:[
            { value:WRITING_MODES.SCRIPT, label:"Script" },
            { value:WRITING_MODES.CURSIVE, label:"Cursif" },
            { value:WRITING_MODES.BOTH, label:"Les deux" }
          ]
        })
      )}
    </div>
  `;

  bindStepperField(container, "ro_totalCount", { inputMin:2, inputMax:60 });
  bindStepperField(container, "ro_targetCount", { inputMin:1, inputMax:30 });
  bindPossibilityRows(container);

  refreshRemoveButtons(container);
}

export function readToolSettings(container) {
  const raw = readCurrentSettings(container);
  const validation = validateSettings(raw);
  if (!validation.valid) throw new Error(validation.errors[0]);
  return validation.settings;
}

export { getDefaultSettings };

function renderPossibilities(cfg) {
  const rows = cfg.rows.length ? cfg.rows : [{ target:"", alternativesRaw:"", distractorsRaw:"" }];
  return `
    <div class="tv-group ro-config-possibilities">
      <div class="tv-group-title">Possibilités</div>
      <div class="ro-config-rows" data-ro-rows>
        ${rows.map((row) => renderPossibilityRow(row)).join("")}
      </div>
    </div>
  `;
}

function renderPossibilityRow(row = {}) {
  return `
    <div class="ro-config-row" data-ro-row>
      <label class="ro-config-inline-field ro-config-inline-target">
        <span>Trouver :</span>
        <input
          class="tv-input ro-config-target"
          data-ro-target
          type="text"
          maxlength="80"
          autocomplete="off"
          spellcheck="false"
          value="${escapeAttr(row.target || "")}"
          placeholder="a"
        >
      </label>
      <label class="ro-config-inline-field ro-config-inline-alternatives">
        <span>ou</span>
        <input
          class="tv-input ro-config-alternatives"
          data-ro-alternatives
          type="text"
          autocomplete="off"
          spellcheck="false"
          value="${escapeAttr(row.alternativesRaw || "")}"
          placeholder="A;à;â"
        >
      </label>
      <label class="ro-config-inline-field ro-config-inline-distractors">
        <span>Distracteurs :</span>
        <input
          class="tv-input ro-config-distractors"
          data-ro-distractors
          type="text"
          autocomplete="off"
          spellcheck="false"
          value="${escapeAttr(row.distractorsRaw || "")}"
          placeholder="o;i;r;u;e;s;l"
        >
      </label>
      <button class="ro-config-row-button ro-config-add" type="button" data-ro-add-row aria-label="Ajouter une possibilité" title="Ajouter une possibilité"><span class="tv-stepper-icon" aria-hidden="true">add</span></button>
      <button class="ro-config-row-button ro-config-remove" type="button" data-ro-remove-row aria-label="Supprimer cette possibilité" title="Supprimer cette possibilité"><span class="tv-stepper-icon" aria-hidden="true">remove</span></button>
    </div>
  `;
}

function renderCounts(cfg) {
  return `
    <div class="tv-group ro-config-counts">
      <div class="tv-group-title">Quantité</div>
      <div class="ro-config-count-row">
        ${renderStepperField({
          id:"ro_totalCount",
          label:"Éléments affichés",
          value:cfg.totalCount,
          inputMin:2,
          inputMax:60
        })}
        ${renderStepperField({
          id:"ro_targetCount",
          label:"Occurrences à trouver",
          value:cfg.targetCount,
          inputMin:1,
          inputMax:30
        })}
      </div>
    </div>
  `;
}

function bindPossibilityRows(container) {
  const rowsHost = container.querySelector("[data-ro-rows]");
  if (!rowsHost) return;

  rowsHost.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const addButton = target?.closest("[data-ro-add-row]");
    const removeButton = target?.closest("[data-ro-remove-row]");
    const row = target?.closest("[data-ro-row]");

    if (addButton && row) {
      row.insertAdjacentHTML("afterend", renderPossibilityRow({ target:"", alternativesRaw:"", distractorsRaw:"" }));
      row.nextElementSibling?.querySelector("[data-ro-target]")?.focus();
      refreshRemoveButtons(container);
      return;
    }

    if (removeButton && row && rowsHost.querySelectorAll("[data-ro-row]").length > 1) {
      row.remove();
      refreshRemoveButtons(container);
    }
  });
}

function readCurrentSettings(container) {
  const rows = [...container.querySelectorAll("[data-ro-row]")].map((row) => ({
    target:row.querySelector("[data-ro-target]")?.value || "",
    alternativesRaw:row.querySelector("[data-ro-alternatives]")?.value || "",
    distractorsRaw:row.querySelector("[data-ro-distractors]")?.value || ""
  }));

  return {
    rows,
    totalCount:readStepper(container, "ro_totalCount", { inputMin:2, inputMax:60 }),
    targetCount:readStepper(container, "ro_targetCount", { inputMin:1, inputMax:30 }),
    writingMode:readRadio(container, "ro_writingMode", WRITING_MODES.SCRIPT)
  };
}

function refreshRemoveButtons(container) {
  const rows = [...container.querySelectorAll("[data-ro-row]")];
  rows.forEach((row) => {
    const button = row.querySelector("[data-ro-remove-row]");
    if (!button) return;
    button.disabled = rows.length <= 1;
    button.setAttribute("aria-hidden", rows.length <= 1 ? "true" : "false");
  });
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-ro-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.roConfigStyle = href;
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
