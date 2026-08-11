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
    <div class="sm-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title:"Nombre de mots par question",
          id:"sm_wordCount",
          value:String(cfg.wordCount),
          options:WORD_COUNT_OPTIONS.map((value) => ({
            value:String(value),
            label:`${value} mots`
          }))
        }),
        renderWordSelectionSelector(cfg, {
          idPrefix:"sm",
          allTargetId:ALL_TARGET_ID,
          showRelevanceLevels:true,
          bankStatusMarkup:'<div class="sm-config-bank-status" data-sm-bank-status aria-live="polite"></div>'
        })
      )}
    </div>
  `;

  bindRadio(container, "sm_wordCount", {
    onChange:() => refreshSelectionState(container)
  });
  bindWordSelectionSelector(container, {
    idPrefix:"sm",
    allTargetId:ALL_TARGET_ID,
    onChange:() => refreshSelectionState(container)
  });

  refreshSelectionState(container);
  ensureWordCatalogLoaded()
    .then(() => refreshSelectionState(container))
    .catch(() => refreshSelectionState(container));
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
  if (settings.wordSelectionMode === WORD_SELECTION_MODES.PHONEMIC
    && !settings.targetIds.includes(ALL_TARGET_ID)
    && settings.targetIds.every((targetId) => !(settings.enabledSpellingsByTarget?.[targetId] || []).length)) {
    throw new Error("Active au moins une graphie pour l’un des phonèmes ciblés.");
  }
  if (!canGenerateQuestion(settings)) {
    const count = getEligibleWordCount(settings);
    throw new Error(`La banque ne contient pas assez de mots compatibles pour en proposer ${settings.wordCount} dans une même question (${count} mot${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""}).`);
  }

  return settings;
}

export { getDefaultSettings };

function readCurrentSettings(container) {
  const selection = readWordSelectionSelector(container, {
    idPrefix:"sm",
    allTargetId:ALL_TARGET_ID
  });
  return normalizeSettings({
    ...selection,
    wordCount:Number(readRadio(container, "sm_wordCount", "4"))
  });
}

function refreshSelectionState(container) {
  refreshBankStatus(container);
  if (catalogStatus === "ready") {
    updateWordSelectionSpellingUsage(container, {
      idPrefix:"sm",
      usageByTarget:getPhonemicSpellingUsage(readCurrentSettings(container))
    });
  }
}

function refreshBankStatus(container) {
  const host = container.querySelector("[data-sm-bank-status]");
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
  if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC && !settings.graphemicEntries.length) {
    host.classList.add("is-warning");
    host.textContent = "Ajoute au moins une entrée graphémique.";
    return;
  }

  const count = getEligibleWordCount(settings);
  const targetCount = getEligibleTargetCount(settings);
  const enough = canGenerateQuestion(settings);
  host.classList.add(enough ? "is-ready" : "is-warning");
  const levelLabel = settings.relevanceLevel === "simple"
    ? "Simple"
    : settings.relevanceLevel === "complexe"
      ? "Complexe"
      : "Normal";

  if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) {
    host.textContent = `${targetCount} entrée${targetCount > 1 ? "s" : ""} graphémique${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} · ${count} mot${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""} en mode « ${levelLabel} »${enough ? "." : " : quantité insuffisante."}`;
    return;
  }

  host.textContent = `${targetCount} phonème${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} · ${count} mot${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""} en mode « ${levelLabel} »${enough ? "." : " : quantité insuffisante."}`;
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
  if (document.querySelector(`link[data-sm-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.smConfigStyle = href;
  document.head.appendChild(link);
}
