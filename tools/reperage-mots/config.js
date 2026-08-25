import {
  bindStepperField,
  readRadio,
  readStepper,
  renderRadioGroup,
  renderStepperField,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import { listPublicPhonologyWords } from "../../shared/public-api.js";
import {
  ALL_TARGET_ID,
  WRITING_MODES,
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
    <div class="rm-config-root">
      ${renderToolSettingsStack(
        renderCounts(cfg),
        renderRadioGroup({
          title:"Écriture",
          id:"rm_writingMode",
          value:cfg.writingMode,
          options:[
            { value:WRITING_MODES.SCRIPT, label:"Script" },
            { value:WRITING_MODES.CURSIVE, label:"Cursif" },
            { value:WRITING_MODES.BOTH, label:"Les deux" }
          ]
        }),
        renderWordSelectionSelector(cfg, {
          idPrefix:"rm",
          allTargetId:ALL_TARGET_ID,
          showRelevanceLevels:true,
          bankStatusMarkup:'<div class="rm-config-bank-status" data-rm-bank-status aria-live="polite"></div>'
        })
      )}
    </div>
  `;

  bindStepperField(container, "rm_totalCount", { inputMin:2, inputMax:40 });
  bindStepperField(container, "rm_targetCount", { inputMin:1, inputMax:20 });
  bindWordSelectionSelector(container, {
    idPrefix:"rm",
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
  if (settings.targetCount >= settings.totalCount) {
    throw new Error("Le nombre d’occurrences doit être inférieur au nombre total de mots.");
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
    throw new Error("La banque ne contient pas assez de mots compatibles avec cette sélection.");
  }
  return settings;
}

export { getDefaultSettings };

function renderCounts(cfg) {
  return `
    <section class="tv-group rm-config-counts">
      <div class="tv-group-title">Composition de la série</div>
      <div class="rm-config-count-row">
        ${renderStepperField({
          id:"rm_totalCount",
          label:"Nombre total de mots",
          value:cfg.totalCount,
          inputMin:2,
          inputMax:40
        })}
        ${renderStepperField({
          id:"rm_targetCount",
          label:"Occurrences à trouver",
          value:cfg.targetCount,
          inputMin:1,
          inputMax:20
        })}
      </div>
    </section>
  `;
}

function readCurrentSettings(container) {
  const selection = readWordSelectionSelector(container, {
    idPrefix:"rm",
    allTargetId:ALL_TARGET_ID
  });
  return normalizeSettings({
    ...selection,
    totalCount:readStepper(container, "rm_totalCount", { inputMin:2, inputMax:40 }),
    targetCount:readStepper(container, "rm_targetCount", { inputMin:1, inputMax:20 }),
    writingMode:readRadio(container, "rm_writingMode", WRITING_MODES.SCRIPT)
  });
}

function refreshSelectionState(container) {
  refreshBankStatus(container);
  if (catalogStatus === "ready") {
    updateWordSelectionSpellingUsage(container, {
      idPrefix:"rm",
      usageByTarget:getPhonemicSpellingUsage(readCurrentSettings(container))
    });
  }
}

function refreshBankStatus(container) {
  const host = container.querySelector("[data-rm-bank-status]");
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
    host.textContent = `${targetCount} entrée${targetCount > 1 ? "s" : ""} graphémique${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} · ${count} mot${count > 1 ? "s" : ""} cible${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""} en mode « ${levelLabel} ». Les distracteurs sont cherchés dans toute la banque.`;
    return;
  }

  host.textContent = `${targetCount} phonème${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} · ${count} mot${count > 1 ? "s" : ""} cible${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""} en mode « ${levelLabel} ». Les distracteurs sont cherchés dans toute la banque.`;
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
  if (document.querySelector(`link[data-rm-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.rmConfigStyle = href;
  document.head.appendChild(link);
}
