import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderSection,
  bindCollapsibleSection,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import { listPublicPhonologyWords } from "../../shared/public-api.js";
import { PHONOLOGY_SCHOOL_LEVELS, normalizePhonologySchoolLevel } from "../../shared/phonology-word-level.js";
import {
  LIST_TYPES,
  PREFIX_CONSTRAINTS,
  getDefaultSettings,
  normalizeSettings,
  canGenerateQuestion
} from "./model.js";

let stylesInjected = false;
let wordCatalogPromise = null;
let wordCatalogStatus = "idle";
let wordCatalogError = "";
let wordCatalog = [];

export function renderToolSettings(container, settings = {}) {
  injectStyles();

  const cfg = normalizeSettings({
    ...settings,
    listType: LIST_TYPES.WORDS
  });

  container.innerHTML = `
    <div class="oam-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Nombre d’éléments",
          id: "oam_itemCount",
          value: String(cfg.itemCount),
          options: [2, 3, 4, 5, 6].map((value) => ({
            value: String(value),
            label: `${value} mot${value > 1 ? "s" : ""}`
          }))
        }),

        renderRadioGroup({
          title: "Niveau des mots",
          id: "oam_schoolLevel",
          value: cfg.schoolLevel,
          options: PHONOLOGY_SCHOOL_LEVELS.map((level) => ({
            value: level.id,
            label: level.label
          }))
        }),

        renderRadioGroup({
          title: "Lettres communes",
          id: "oam_prefixConstraint",
          value: cfg.prefixConstraint,
          options: [
            { value: PREFIX_CONSTRAINTS.NONE, label: "Aucune" },
            { value: PREFIX_CONSTRAINTS.EXACT_1, label: "1 lettre" },
            { value: PREFIX_CONSTRAINTS.EXACT_2, label: "2 lettres" },
            { value: PREFIX_CONSTRAINTS.EXACT_3, label: "3 lettres" },
            { value: PREFIX_CONSTRAINTS.AT_LEAST_1, label: "au moins 1" },
            { value: PREFIX_CONSTRAINTS.AT_LEAST_2, label: "au moins 2" },
            { value: PREFIX_CONSTRAINTS.AT_LEAST_3, label: "au moins 3" }
          ]
        }),

        renderSection("Réglages avancés", renderToolSettingsStack(
          renderAlphabetSwitch(cfg.showAlphabet),
          renderRadioGroup({
            title: "Indice visuel",
            id: "oam_visualHint",
            value: cfg.visualHint ? "yes" : "no",
            options: [
              { value: "yes", label: "oui" },
              { value: "no", label: "non" }
            ]
          })
        ), { collapsible: true, expanded: false, idPrefix: "oam_advanced" })
      )}
    </div>
  `;

  bindRadio(container, "oam_itemCount");
  bindRadio(container, "oam_schoolLevel");
  bindRadio(container, "oam_prefixConstraint");
  bindRadio(container, "oam_visualHint");
  bindCollapsibleSection(container, "oam_advanced");

  ensureWordCatalogLoaded().catch(() => {});
}

export function readToolSettings(container) {
  const itemCount = Math.max(2, Math.min(6, Number(readRadio(container, "oam_itemCount", "4")) || 2));

  const settings = normalizeSettings({
    listType: LIST_TYPES.WORDS,
    itemCount,
    schoolLevel: normalizePhonologySchoolLevel(readRadio(container, "oam_schoolLevel", "CP")),
    prefixConstraint: readRadio(container, "oam_prefixConstraint", PREFIX_CONSTRAINTS.EXACT_1),
    visualHint: readRadio(container, "oam_visualHint", "no") === "yes",
    showAlphabet: container.querySelector("#oam_showAlphabet")?.checked === true
  });

  if (wordCatalogStatus === "idle" || wordCatalogStatus === "loading") {
    throw new Error("Chargement de la banque de mots en cours.");
  }

  if (wordCatalogStatus === "error") {
    throw new Error(wordCatalogError || "La banque de mots est indisponible.");
  }

  if (!canGenerateQuestion(settings, { wordEntries: wordCatalog })) {
    throw new Error(`Impossible de générer ${settings.itemCount} mots avec ces réglages au niveau « ${settings.schoolLevel} ».`);
  }

  return settings;
}

export { getDefaultSettings };

function renderAlphabetSwitch(showAlphabet) {
  return `
    <div class="tv-group oam-toggle-row">
      <label class="oam-switch-label" for="oam_showAlphabet">
        <input class="tv-checkbox" type="checkbox" id="oam_showAlphabet" ${showAlphabet ? "checked" : ""}>
        <span>Afficher l’alphabet</span>
      </label>
    </div>
  `;
}

async function ensureWordCatalogLoaded() {
  if (!wordCatalogPromise) {
    wordCatalogStatus = "loading";
    wordCatalogError = "";
    wordCatalogPromise = listPublicPhonologyWords()
      .then((rows) => {
        wordCatalog = Array.isArray(rows) ? rows : [];
        wordCatalogStatus = "ready";
        return wordCatalog;
      })
      .catch((error) => {
        wordCatalogPromise = null;
        wordCatalog = [];
        wordCatalogStatus = "error";
        wordCatalogError = String(error?.message || "Impossible de charger la banque de mots.");
        throw error;
      });
  }

  return await wordCatalogPromise;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;

  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-oam-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.oamConfigStyle = href;
  document.head.appendChild(link);
}
