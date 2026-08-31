import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import { listPublicPhonologyWords } from "../../shared/public-api.js";
import {
  WORD_COUNT_OPTIONS,
  ALL_TARGET_ID,
  getDefaultSettings,
  normalizeSettings,
  setWordCatalog,
  getEligibleWordCount,
  getEligibleTargetCount,
  getPhonemicSpellingUsage,
  canGenerateQuestion
} from "./model.js";
import {
  WORD_SELECTION_MODES,
  renderWordSelectionSelector,
  bindWordSelectionSelector,
  readWordSelectionSelector,
  updateWordSelectionSpellingUsage
} from "../../shared/word-selection-selector.js";

let stylesInjected = false;
let catalogPromise = null;
let catalogStatus = "idle";
let catalogError = "";

export function renderToolSettings(container, settings = {}) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="rg-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Nombre de mots par question",
          id: "rg_wordCount",
          value: String(cfg.wordCount),
          options: WORD_COUNT_OPTIONS.map((value) => ({
            value: String(value),
            label: `${value} mot${value > 1 ? "s" : ""}`
          }))
        }),
        renderWordSelectionSelector(cfg, {
          idPrefix:"rg",
          allTargetId:ALL_TARGET_ID,
          showSchoolLevels:true,
          bankStatusMarkup:`<div class="rg-config-bank-status" data-rg-bank-status aria-live="polite"></div>`,
          afterSelectionMarkup:`<div data-rg-phonemic-only>${renderRadioGroup({
            title: "Affichage des graphies possibles",
            id: "rg_showPossibleSpellings",
            value: cfg.showPossibleSpellings ? "show" : "hide",
            options: [
              { value:"show", label:"Afficher" },
              { value:"hide", label:"Ne pas afficher" }
            ]
          })}</div>`
        })
      )}
    </div>
  `;

  bindRadio(container, "rg_wordCount", {
    onChange: () => refreshBankStatus(container)
  });
  bindRadio(container, "rg_showPossibleSpellings");

  bindWordSelectionSelector(container, {
    idPrefix:"rg",
    allTargetId:ALL_TARGET_ID,
    onChange:() => {
      syncModeSpecificControls(container);
      refreshBankStatus(container);
    }
  });

  syncModeSpecificControls(container);
  refreshBankStatus(container);
  ensureWordCatalogLoaded()
    .then(() => {
      refreshBankStatus(container);
    })
    .catch(() => {
      refreshBankStatus(container);
    });
}

export function readToolSettings(container) {
  const settings = readCurrentSettings(container);

  if (catalogStatus === "loading" || catalogStatus === "idle") {
    throw new Error("Chargement de la banque de mots en cours.");
  }

  if (catalogStatus === "error") {
    throw new Error(catalogError || "La banque de mots est indisponible.");
  }

  if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC && !settings.graphemicEntries.length) {
    throw new Error("Ajoute au moins une entrée graphémique.");
  }

  if (!canGenerateQuestion(settings)) {
    const availableCount = getEligibleWordCount(settings);
    if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) {
      throw new Error(`La banque ne contient que ${availableCount} mot${availableCount > 1 ? "s" : ""} compatible${availableCount > 1 ? "s" : ""} avec ces entrées graphémiques et ce niveau.`);
    }
    if (settings.targetId === ALL_TARGET_ID) {
      throw new Error("Aucun phonème ne contient assez de mots pour générer cette question.");
    }
    throw new Error(`La banque ne contient que ${availableCount} mot${availableCount > 1 ? "s" : ""} compatible${availableCount > 1 ? "s" : ""} avec ce phonème.`);
  }

  return settings;
}

export { getDefaultSettings };

function readCurrentSettings(container) {
  const selection = readWordSelectionSelector(container, {
    idPrefix:"rg",
    allTargetId:ALL_TARGET_ID
  });
  return normalizeSettings({
    ...selection,
    wordCount:Number(readRadio(container, "rg_wordCount", "6")),
    showPossibleSpellings:readRadio(container, "rg_showPossibleSpellings", "hide") === "show"
  });
}

function syncModeSpecificControls(container) {
  const selection = readWordSelectionSelector(container, { idPrefix:"rg", allTargetId:ALL_TARGET_ID });
  const phonemicOnly = container.querySelector("[data-rg-phonemic-only]");
  if (phonemicOnly instanceof HTMLElement) {
    phonemicOnly.hidden = selection.wordSelectionMode !== WORD_SELECTION_MODES.PHONEMIC;
  }
}

function refreshBankStatus(container) {
  const host = container.querySelector("[data-rg-bank-status]");
  if (!host) return;

  host.classList.remove("is-error", "is-warning", "is-ready");

  if (catalogStatus === "idle" || catalogStatus === "loading") {
    host.textContent = "Chargement de la banque de mots…";
    return;
  }

  if (catalogStatus === "error") {
    host.classList.add("is-error");
    host.textContent = catalogError || "Impossible de charger la banque de mots.";
    return;
  }

  const settings = readCurrentSettings(container);
  updateWordSelectionSpellingUsage(container, {
    idPrefix:"rg",
    usageByTarget:getPhonemicSpellingUsage(settings)
  });
  const count = getEligibleWordCount(settings);
  const targetCount = getEligibleTargetCount(settings);
  const enough = canGenerateQuestion(settings);
  host.classList.add(enough ? "is-ready" : "is-warning");

  const levelLabel = settings.schoolLevel;
  if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) {
    if (!settings.graphemicEntries.length) {
      host.classList.remove("is-ready");
      host.classList.add("is-warning");
      host.textContent = "Ajoute au moins une entrée graphémique.";
      return;
    }
    host.textContent = `${targetCount} entrée${targetCount > 1 ? "s" : ""} graphémique${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} · ${count} mot${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""} au niveau « ${levelLabel} »${enough ? "." : " : quantité insuffisante pour ce réglage."}`;
    return;
  }

  if (settings.targetIds.length !== 1 || settings.targetIds[0] === ALL_TARGET_ID) {
    host.textContent = `${targetCount} phonème${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} à partir de ${count} mot${count > 1 ? "s" : ""} distinct${count > 1 ? "s" : ""}${enough ? "." : " : quantité insuffisante pour ce réglage."}`;
    return;
  }

  host.textContent = `${count} mot${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""} au niveau « ${levelLabel} » dans la banque${enough ? "." : " : quantité insuffisante pour ce réglage."}`;
}

async function ensureWordCatalogLoaded() {
  if (!catalogPromise) {
    catalogStatus = "loading";
    catalogError = "";
    catalogPromise = listPublicPhonologyWords()
      .then((rows) => {
        setWordCatalog(Array.isArray(rows) ? rows : []);
        catalogStatus = "ready";
        return rows;
      })
      .catch((error) => {
        catalogPromise = null;
        catalogStatus = "error";
        catalogError = String(error?.message || "Impossible de charger la banque de mots.");
        setWordCatalog([]);
        throw error;
      });
  }

  return await catalogPromise;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-rg-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.rgConfigStyle = href;
  document.head.appendChild(link);
}
