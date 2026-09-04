import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderBasicMinMax,
  bindBasicMinMax,
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
    <div class="rms-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title:"Nombre de mots par question",
          id:"rms_wordCount",
          value:String(cfg.wordCount),
          options:WORD_COUNT_OPTIONS.map((value) => ({
            value:String(value),
            label:`${value} mots`
          }))
        }),
        renderBasicMinMax({
          idPrefix:"rms_syllableCount",
          title:"Nombre de syllabes du mot",
          minLabel:"Minimum",
          maxLabel:"Maximum",
          minValue:cfg.minSyllables,
          maxValue:cfg.maxSyllables,
          inputMin:2,
          inputMax:6,
          step:1
        }),
        renderWordSelectionSelector(cfg, {
          idPrefix:"rms",
          allTargetId:ALL_TARGET_ID,
          showSchoolLevels:true,
          bankStatusMarkup:'<div class="rms-config-bank-status" data-rms-bank-status aria-live="polite"></div>'
        })
      )}
    </div>
  `;

  bindRadio(container, "rms_wordCount", {
    onChange:() => refreshSelectionState(container)
  });
  bindBasicMinMax(container, "rms_syllableCount", { inputMin:2, inputMax:6 });
  bindWordSelectionSelector(container, {
    idPrefix:"rms",
    allTargetId:ALL_TARGET_ID,
    onChange:() => refreshSelectionState(container)
  });

  ["#rms_syllableCount_min", "#rms_syllableCount_max"].forEach((selector) => {
    const input = container.querySelector(selector);
    input?.addEventListener("input", () => refreshSelectionState(container));
    input?.addEventListener("change", () => refreshSelectionState(container));
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
    throw new Error(`La banque ne contient pas assez de mots compatibles de ${settings.minSyllables} à ${settings.maxSyllables} syllabes pour en proposer ${settings.wordCount} dans une même question (${count} mot${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""}).`);
  }

  return settings;
}

export { getDefaultSettings };

function readCurrentSettings(container) {
  const selection = readWordSelectionSelector(container, {
    idPrefix:"rms",
    allTargetId:ALL_TARGET_ID
  });
  return normalizeSettings({
    ...selection,
    wordCount:Number(readRadio(container, "rms_wordCount", "4")),
    minSyllables:Number(container.querySelector("#rms_syllableCount_min")?.value),
    maxSyllables:Number(container.querySelector("#rms_syllableCount_max")?.value)
  });
}

function refreshSelectionState(container) {
  refreshBankStatus(container);
  if (catalogStatus === "ready") {
    updateWordSelectionSpellingUsage(container, {
      idPrefix:"rms",
      usageByTarget:getPhonemicSpellingUsage(readCurrentSettings(container))
    });
  }
}

function refreshBankStatus(container) {
  const host = container.querySelector("[data-rms-bank-status]");
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
  const syllableLabel = settings.minSyllables === settings.maxSyllables
    ? `${settings.minSyllables} syllabe${settings.minSyllables > 1 ? "s" : ""}`
    : `${settings.minSyllables} à ${settings.maxSyllables} syllabes`;

  if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) {
    host.textContent = `${targetCount} entrée${targetCount > 1 ? "s" : ""} graphémique${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} · ${count} mot${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""} de ${syllableLabel}${enough ? "." : " : quantité insuffisante."}`;
    return;
  }

  host.textContent = `${targetCount} phonème${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} · ${count} mot${count > 1 ? "s" : ""} disponible${count > 1 ? "s" : ""} de ${syllableLabel}${enough ? "." : " : quantité insuffisante."}`;
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
  if (document.querySelector(`link[data-rms-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.rmsConfigStyle = href;
  document.head.appendChild(link);
}
