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
  renderPhonologyTargetSelector,
  bindPhonologyTargetSelector,
  readPhonologyTargetSelector,
  updatePhonologySpellingUsage
} from "../../shared/phonology-target-selector.js";
import { PHONOLOGY_SCHOOL_LEVELS, normalizePhonologySchoolLevel } from "../../shared/phonology-word-level.js";
import {
  ALL_TARGET_ID,
  QUESTION_MODES,
  QUESTION_MODE_LABELS,
  getDefaultSettings,
  normalizeSettings,
  getImageFolderName,
  setWordCatalog,
  setImageCatalog,
  getEligibleStats,
  getEligibleTargetCount,
  getPhonemicSpellingUsage,
  canGenerateQuestion
} from "./model.js";

let stylesInjected = false;
let catalogsPromise = null;
let catalogsStatus = "idle";
let catalogsError = "";

export function renderToolSettings(container, settings = {}) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="sp-config-root">
      ${renderToolSettingsStack(
        renderRadioGroup({
          title: "Type de question",
          id: "sp_questionMode",
          value: cfg.questionMode,
          options: [
            { value: QUESTION_MODES.EXISTENCE, label: QUESTION_MODE_LABELS[QUESTION_MODES.EXISTENCE] },
            { value: QUESTION_MODES.SYLLABLE_PLACE, label: QUESTION_MODE_LABELS[QUESTION_MODES.SYLLABLE_PLACE] }
          ]
        }),
        renderRadioGroup({
          title: "Niveau des mots",
          id: "sp_schoolLevel",
          value: cfg.schoolLevel,
          options: PHONOLOGY_SCHOOL_LEVELS.map((level) => ({
            value: level.id,
            label: level.label
          }))
        }),
        renderPhonologyTargetSelector(cfg, {
          idPrefix: "sp",
          allTargetId: ALL_TARGET_ID,
          title: "Son recherché",
          showRelevanceLevels: false
        }),
        `<div class="sp-config-bank-status" data-sp-bank-status aria-live="polite"></div>`
      )}
    </div>
  `;

  bindRadio(container, "sp_questionMode", {
    onChange: () => refreshBankStatus(container)
  });
  bindRadio(container, "sp_schoolLevel", {
    onChange: () => refreshBankStatus(container)
  });
  bindPhonologyTargetSelector(container, {
    idPrefix: "sp",
    allTargetId: ALL_TARGET_ID,
    onChange: () => refreshBankStatus(container)
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

  if (!canGenerateQuestion(settings)) {
    const stats = getEligibleStats(settings);
    if (settings.questionMode === QUESTION_MODES.SYLLABLE_PLACE) {
      if (settings.targetId === ALL_TARGET_ID) {
        throw new Error(`Aucun phonème ne dispose d’un mot syllabé compatible avec une image dans « ${getImageFolderName()} ».`);
      }
      throw new Error(`Le dossier « ${getImageFolderName()} » ne contient pas de mot syllabé compatible avec ce son et ces graphies.`);
    }
    if (settings.targetId === ALL_TARGET_ID) {
      throw new Error(`Aucun phonème ne dispose d’assez de mots positifs dans « ${getImageFolderName()} ». (${stats.positiveWordCount} mot${stats.positiveWordCount > 1 ? "s" : ""} positif${stats.positiveWordCount > 1 ? "s" : ""} au total)`);
    }
    throw new Error(`Le dossier « ${getImageFolderName()} » ne contient pas de mot compatible avec ce son et ces graphies.`);
  }

  return settings;
}

export { getDefaultSettings };

function readCurrentSettings(container) {
  const selection = readPhonologyTargetSelector(container, {
    idPrefix: "sp",
    allTargetId: ALL_TARGET_ID
  });

  return normalizeSettings({
    ...selection,
    questionMode: readRadio(container, "sp_questionMode", QUESTION_MODES.EXISTENCE),
    schoolLevel: normalizePhonologySchoolLevel(readRadio(container, "sp_schoolLevel", "CP"))
  });
}

function refreshBankStatus(container) {
  const host = container.querySelector("[data-sp-bank-status]");
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
  updatePhonologySpellingUsage(container, {
    idPrefix: "sp",
    usageByTarget: getPhonemicSpellingUsage(settings)
  });

  const stats = getEligibleStats(settings);
  const targetCount = getEligibleTargetCount(settings);
  const enough = canGenerateQuestion(settings);
  host.classList.add(enough ? "is-ready" : "is-warning");

  const positiveLabel = `${stats.positiveWordCount} mot${stats.positiveWordCount > 1 ? "s" : ""} compatible${stats.positiveWordCount > 1 ? "s" : ""}`;

  if (settings.questionMode === QUESTION_MODES.SYLLABLE_PLACE) {
    if (settings.targetIds.length !== 1 || settings.targetIds[0] === ALL_TARGET_ID) {
      host.textContent = `${targetCount} phonème${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} · ${positiveLabel} avec syllabation dans « ${getImageFolderName()} »${enough ? "." : " : aucun contenu jouable."}`;
      return;
    }
    host.textContent = `${positiveLabel} avec syllabation dans « ${getImageFolderName()} » pour ce son${enough ? "." : " : aucun contenu jouable."}`;
    return;
  }

  const negativeLabel = `${stats.negativeWordCount} mot${stats.negativeWordCount > 1 ? "s" : ""} négatif${stats.negativeWordCount > 1 ? "s" : ""}`;
  if (settings.targetIds.length !== 1 || settings.targetIds[0] === ALL_TARGET_ID) {
    host.textContent = `${targetCount} phonème${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} · ${positiveLabel} · ${negativeLabel} dans « ${getImageFolderName()} »${enough ? "." : " : aucun contenu jouable."}`;
    return;
  }

  host.textContent = `${positiveLabel} et ${negativeLabel} dans « ${getImageFolderName()} » pour ce son${enough ? "." : " : aucun contenu jouable."}`;
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
  if (document.querySelector(`link[data-sp-config-style="${href}"]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.spConfigStyle = href;
  document.head.appendChild(link);
}
