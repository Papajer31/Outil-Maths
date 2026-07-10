import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderSection,
  bindCollapsibleSection
} from "../../shared/config-widgets.js";
import {
  CASE_MODES,
  WRITING_MODES,
  getDefaultSettings,
  normalizeSettings,
  canGenerateQuestion
} from "./model.js";

let stylesInjected = false;

export function renderToolSettings(container, settings) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="oal-config-root">
      ${renderRadioGroup({
        title: "Nombre d’éléments",
        id: "oal_itemCount",
        value: String(cfg.itemCount),
        options: [2, 3, 4, 5, 6].map((value) => ({
          value: String(value),
          label: `${value} lettre${value > 1 ? "s" : ""}`
        }))
      })}

      ${renderRadioGroup({
        title: "Casse",
        id: "oal_caseMode",
        value: cfg.caseMode,
        options: [
          { value: CASE_MODES.LOWER, label: "minuscules" },
          { value: CASE_MODES.UPPER, label: "majuscules" },
          { value: CASE_MODES.PER_QUESTION, label: "au choix par question" },
          { value: CASE_MODES.MIXED, label: "mélangé" }
        ]
      })}

      ${renderSection("Réglages avancés", `
        ${renderAlphabetSwitch(cfg.showAlphabet)}
        ${renderRadioGroup({
          title: "Écriture",
          id: "oal_writingMode",
          value: cfg.writingMode,
          options: [
            { value: WRITING_MODES.SCRIPT, label: "script" },
            { value: WRITING_MODES.CURSIVE, label: "cursif" },
            { value: WRITING_MODES.PER_QUESTION, label: "au choix par question" },
            { value: WRITING_MODES.MIXED, label: "mélangé" }
          ]
        })}
      `, { collapsible: true, expanded: false, idPrefix: "oal_advanced" })}
    </div>
  `;

  bindRadio(container, "oal_itemCount");
  bindRadio(container, "oal_caseMode");
  bindRadio(container, "oal_writingMode");
  bindCollapsibleSection(container, "oal_advanced");
}

export function readToolSettings(container) {
  const settings = normalizeSettings({
    itemCount: Number(readRadio(container, "oal_itemCount", "4")) || 4,
    caseMode: readRadio(container, "oal_caseMode", CASE_MODES.LOWER),
    writingMode: readRadio(container, "oal_writingMode", WRITING_MODES.SCRIPT),
    showAlphabet: container.querySelector("#oal_showAlphabet")?.checked === true
  });

  if (!canGenerateQuestion(settings)) {
    throw new Error("Impossible de générer une question avec ces réglages.");
  }

  return settings;
}

export { getDefaultSettings };

function renderAlphabetSwitch(showAlphabet) {
  return `
    <div class="tv-group oal-toggle-row">
      <label class="oal-switch-label" for="oal_showAlphabet">
        <input class="tv-checkbox" type="checkbox" id="oal_showAlphabet" ${showAlphabet ? "checked" : ""}>
        <span>Afficher l’alphabet</span>
      </label>
    </div>
  `;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-oal-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.oalConfigStyle = href;
  document.head.appendChild(link);
}
