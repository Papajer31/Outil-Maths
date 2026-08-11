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
  CLOUD_MODES,
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
    <div class="nl-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Comportement des lettres",
          id: "nl_cloudMode",
          value: cfg.cloudMode,
          options: [
            { value: CLOUD_MODES.FIXED, label: "Fixes" },
            { value: CLOUD_MODES.DRAGGABLE, label: "Déplaçables" },
            { value: CLOUD_MODES.FLOATING, label: "En mouvement" }
          ]
        }),
        renderLengthSelector(cfg),
        renderRadioGroup({
          title: "Affichage de la première lettre",
          id: "nl_showFirstLetter",
          value: cfg.showFirstLetter ? "show" : "hide",
          options: [
            { value:"show", label:"Afficher" },
            { value:"hide", label:"Ne pas afficher" }
          ]
        }),
        renderWordSelectionSelector(cfg, {
          idPrefix:"nl",
          allTargetId:ALL_TARGET_ID,
          bankStatusMarkup:`<div class="nl-config-bank-status" data-nl-bank-status aria-live="polite"></div>`
        })
      )}
    </div>
  `;

  bindBasicMinMax(container, "nl_letterCount", { inputMin:2, inputMax:12 });
  bindRadio(container, "nl_showFirstLetter");

  bindWordSelectionSelector(container, {
    idPrefix:"nl",
    allTargetId:ALL_TARGET_ID,
    onChange:() => refreshBankStatus(container)
  });


  ["#nl_letterCount_min", "#nl_letterCount_max"].forEach((selector) => {
    const input = container.querySelector(selector);
    input?.addEventListener("input", () => refreshBankStatus(container));
    input?.addEventListener("change", () => refreshBankStatus(container));
  });

  refreshBankStatus(container);
  ensureWordCatalogLoaded()
    .then(() => refreshBankStatus(container))
    .catch(() => refreshBankStatus(container));
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
    throw new Error(settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC
      ? "Aucun mot de la banque ne correspond à ces entrées graphémiques et à cette longueur."
      : "Aucun mot de la banque ne correspond à ce phonème, à ces graphies et à cette longueur.");
  }

  return settings;
}

export { getDefaultSettings };

function renderLengthSelector(cfg) {
  return renderBasicMinMax({
    idPrefix:"nl_letterCount",
    title:"Nombre de lettres du mot",
    minLabel:"Minimum",
    maxLabel:"Maximum",
    minValue:cfg.minLetters,
    maxValue:cfg.maxLetters,
    inputMin:2,
    inputMax:12,
    step:1
  });
}

function readCurrentSettings(container) {
  const selection = readWordSelectionSelector(container, {
    idPrefix:"nl",
    allTargetId:ALL_TARGET_ID
  });
  return normalizeSettings({
    ...selection,
    minLetters:Number(container.querySelector("#nl_letterCount_min")?.value),
    maxLetters:Number(container.querySelector("#nl_letterCount_max")?.value),
    showFirstLetter:readRadio(container, "nl_showFirstLetter", "hide") === "show",
    cloudMode:readRadio(container, "nl_cloudMode", CLOUD_MODES.FIXED)
  });
}

function refreshBankStatus(container) {
  const host = container.querySelector("[data-nl-bank-status]");
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
    idPrefix:"nl",
    usageByTarget:getPhonemicSpellingUsage(settings)
  });
  const count = getEligibleWordCount(settings);
  const targetCount = getEligibleTargetCount(settings);
  const enough = canGenerateQuestion(settings);
  host.classList.add(enough ? "is-ready" : "is-warning");
  if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) {
    if (!settings.graphemicEntries.length) {
      host.textContent = "Ajoute au moins une entrée graphémique.";
      return;
    }
    host.textContent = `${targetCount} entrée${targetCount > 1 ? "s" : ""} graphémique${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} à partir de ${count} mot${count > 1 ? "s" : ""} distinct${count > 1 ? "s" : ""}${enough ? "." : " : quantité insuffisante pour ce réglage."}`;
    return;
  }
  if (settings.targetIds.length !== 1 || settings.targetIds[0] === ALL_TARGET_ID) {
    host.textContent = `${targetCount} phonème${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} à partir de ${count} mot${count > 1 ? "s" : ""} distinct${count > 1 ? "s" : ""}${enough ? "." : " : quantité insuffisante pour ce réglage."}`;
    return;
  }
  host.textContent = `${count} mot${count > 1 ? "s" : ""} compatible${count > 1 ? "s" : ""} dans la banque${enough ? "." : " : aucun mot ne peut être généré avec ces réglages."}`;
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
  if (document.querySelector(`link[data-nl-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.nlConfigStyle = href;
  document.head.appendChild(link);
}
