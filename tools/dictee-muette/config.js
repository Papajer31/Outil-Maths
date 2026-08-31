import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import {
  listPublicPhonologyWords,
  listPublicImageAssetsInSystemFolder
} from "../../shared/public-api.js";
import {
  ALL_TARGET_ID,
  INPUT_STYLES,
  getDefaultSettings,
  normalizeSettings,
  getImageFolderName,
  setWordCatalog,
  setImageCatalog,
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
let catalogsPromise = null;
let catalogsStatus = "idle";
let catalogsError = "";

export function renderToolSettings(container, settings = {}) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="dm-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Saisie",
          id: "dm_inputStyle",
          value: cfg.inputStyle,
          options: [
            { value: INPUT_STYLES.SINGLE, label: "Une zone de réponse" },
            { value: INPUT_STYLES.BOXES, label: "Une case par lettre" }
          ]
        }),
        renderRadioGroup({
          title: "Surligner les lettres contenues dans le mot",
          id: "dm_highlightWordLetters",
          value: cfg.highlightWordLetters ? "show" : "hide",
          options: [
            { value:"show", label:"Surligner" },
            { value:"hide", label:"Ne pas surligner" }
          ]
        }),
        renderWordSelectionSelector(cfg, {
          idPrefix:"dm",
          allTargetId:ALL_TARGET_ID,
          showSchoolLevels:true,
          bankStatusMarkup:`<div class="dm-config-bank-status" data-dm-bank-status aria-live="polite"></div>`
        })
      )}
    </div>
  `;

  bindRadio(container, "dm_inputStyle");
  bindRadio(container, "dm_highlightWordLetters");

  bindWordSelectionSelector(container, {
    idPrefix:"dm",
    allTargetId:ALL_TARGET_ID,
    onChange:() => refreshBankStatus(container)
  });

  refreshBankStatus(container);
  ensureCatalogsLoaded()
    .then(() => refreshBankStatus(container))
    .catch(() => refreshBankStatus(container));
}

export function readToolSettings(container) {
  const settings = readCurrentSettings(container);

  if (catalogsStatus === "loading" || catalogsStatus === "idle") {
    throw new Error("Chargement de la banque de mots et de l’Imagier en cours.");
  }

  if (catalogsStatus === "error") {
    throw new Error(catalogsError || "La banque de mots ou l’Imagier est indisponible.");
  }

  if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC && !settings.graphemicEntries.length) {
    throw new Error("Ajoute au moins une entrée graphémique.");
  }

  if (!canGenerateQuestion(settings)) {
    const count = getEligibleWordCount(settings);
    if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) {
      throw new Error(`Le dossier « Imagier » ne contient que ${count} mot${count > 1 ? "s" : ""} compatible${count > 1 ? "s" : ""} avec ces entrées graphémiques.`);
    }
    if (settings.targetId === ALL_TARGET_ID) {
      throw new Error("Aucun phonème ne dispose d’un mot compatible avec une image dans le dossier « Imagier ».");
    }
    throw new Error(`Le dossier « Imagier » ne contient que ${count} mot${count > 1 ? "s" : ""} compatible${count > 1 ? "s" : ""} avec ce phonème et ces graphies.`);
  }

  return settings;
}

export { getDefaultSettings };

function readCurrentSettings(container) {
  const selection = readWordSelectionSelector(container, {
    idPrefix:"dm",
    allTargetId:ALL_TARGET_ID
  });
  return normalizeSettings({
    ...selection,
    inputStyle:readRadio(container, "dm_inputStyle", INPUT_STYLES.SINGLE),
    highlightWordLetters:readRadio(container, "dm_highlightWordLetters", "hide") === "show",
    showDiacritics:true
  });
}

function refreshBankStatus(container) {
  const host = container.querySelector("[data-dm-bank-status]");
  if (!host) return;

  host.classList.remove("is-error", "is-warning", "is-ready");

  if (catalogsStatus === "idle" || catalogsStatus === "loading") {
    host.textContent = `Chargement de la banque de mots et du dossier « ${getImageFolderName()} »…`;
    return;
  }

  if (catalogsStatus === "error") {
    host.classList.add("is-error");
    host.textContent = catalogsError || "Impossible de charger la banque de mots ou l’Imagier.";
    return;
  }

  const settings = readCurrentSettings(container);
  updateWordSelectionSpellingUsage(container, {
    idPrefix:"dm",
    usageByTarget:getPhonemicSpellingUsage(settings)
  });
  const wordCount = getEligibleWordCount(settings);
  const targetCount = getEligibleTargetCount(settings);
  const enough = canGenerateQuestion(settings);
  host.classList.add(enough ? "is-ready" : "is-warning");

  if (settings.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) {
    if (!settings.graphemicEntries.length) {
      host.textContent = "Ajoute au moins une entrée graphémique.";
      return;
    }
    host.textContent = `${targetCount} entrée${targetCount > 1 ? "s" : ""} graphémique${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} à partir de ${wordCount} mot${wordCount > 1 ? "s" : ""} distinct${wordCount > 1 ? "s" : ""} de l’Imagier${enough ? "." : " : aucun contenu jouable."}`;
    return;
  }

  if (settings.targetId === ALL_TARGET_ID) {
    host.textContent = `${targetCount} phonème${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} à partir de ${wordCount} mot${wordCount > 1 ? "s" : ""} distinct${wordCount > 1 ? "s" : ""} de l’Imagier${enough ? "." : " : aucun contenu jouable."}`;
    return;
  }

  host.textContent = `${wordCount} mot${wordCount > 1 ? "s" : ""} compatible${wordCount > 1 ? "s" : ""} avec une image dans « ${getImageFolderName()} »${enough ? "." : " : aucun contenu jouable."}`;
}

async function ensureCatalogsLoaded() {
  if (!catalogsPromise) {
    catalogsStatus = "loading";
    catalogsError = "";
    catalogsPromise = Promise.all([
      listPublicPhonologyWords(),
      listPublicImageAssetsInSystemFolder(getImageFolderName())
    ])
      .then(([words, images]) => {
        setWordCatalog(Array.isArray(words) ? words : []);
        setImageCatalog(Array.isArray(images) ? images : []);
        catalogsStatus = "ready";
        return { words, images };
      })
      .catch((error) => {
        catalogsPromise = null;
        catalogsStatus = "error";
        const rawMessage = String(error?.message || "");
        catalogsError = rawMessage.includes("list_public_system_image_assets_in_folder")
          ? "La migration 26_public_system_image_folder_runtime.sql doit être exécutée dans Supabase."
          : (rawMessage || "Impossible de charger la banque de mots ou l’Imagier.");
        setWordCatalog([]);
        setImageCatalog([]);
        throw error;
      });
  }

  return await catalogsPromise;
}

function injectStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./config.css", import.meta.url).href;
  if (document.querySelector(`link[data-dm-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.dmConfigStyle = href;
  document.head.appendChild(link);
}
