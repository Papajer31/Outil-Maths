import {
  bindRadio,
  bindStepperField,
  readRadio,
  readStepper,
  renderRadioGroup,
  renderStepperField,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import { listPublicLexicalWords } from "../../shared/public-api.js";
import { getPersonOptions, getTenseOptions } from "../conjugaison/model.js";
import {
  DISTRACTOR_CLASSES,
  VERB_FORM_MODES,
  canGenerateQuestion,
  getAvailability,
  getDefaultSettings,
  normalizeSettings,
  setWordCatalog
} from "./model.js";

let stylesInjected = false;
let catalogPromise = null;
let catalogStatus = "idle";
let catalogError = "";
const pendingStatusRefreshes = new WeakMap();

export function renderToolSettings(container, settings = {}) {
  injectStyles();
  const cfg = normalizeSettings(settings);

  container.innerHTML = `
    <div class="iv-config-root">
      ${renderToolSettingsStack(
        renderVerbSettings(cfg),
        renderConjugationSelectors(cfg),
        renderCounts(cfg),
        renderLexicalAndDistractorSettings(cfg),
        '<div class="iv-config-bank-status" data-iv-bank-status aria-live="polite"></div>'
      )}
    </div>
  `;

  bindRadio(container, "iv_verbFormMode", { onChange:() => refreshDynamicUi(container) });
  bindRadio(container, "iv_lexicalLevel", { onChange:() => refreshDynamicUi(container) });
  bindStepperField(container, "iv_totalCount", { inputMin:2, inputMax:40 });
  bindStepperField(container, "iv_targetCount", { inputMin:1, inputMax:20 });
  bindCheckboxGroup(container, "iv_tense", () => refreshDynamicUi(container));
  bindCheckboxGroup(container, "iv_person", () => refreshDynamicUi(container));
  bindCheckboxGroup(container, "iv_distractor", () => refreshDynamicUi(container));
  bindCheckboxGroup(container, "iv_verbGroup", () => refreshDynamicUi(container));

  container.querySelector("#iv_totalCount")?.addEventListener("input", () => refreshDynamicUi(container));
  container.querySelector("#iv_targetCount")?.addEventListener("input", () => refreshDynamicUi(container));

  refreshDynamicUi(container);
  ensureWordCatalogLoaded()
    .then(() => refreshDynamicUi(container))
    .catch(() => refreshDynamicUi(container));
}

export function readToolSettings(container) {
  const settings = readCurrentSettings(container);
  if (catalogStatus === "loading" || catalogStatus === "idle") {
    throw new Error("Chargement de la banque lexicale en cours.");
  }
  if (catalogStatus === "error") {
    throw new Error(catalogError || "La banque lexicale est indisponible.");
  }
  if (settings.targetCount >= settings.totalCount) {
    throw new Error("Le nombre de verbes à trouver doit être inférieur au nombre total de mots.");
  }
  if (!settings.distractorClasses.length) {
    throw new Error("Sélectionne au moins une classe grammaticale de distracteurs.");
  }
  if (!settings.verbGroups.length) {
    throw new Error("Sélectionne au moins un groupe de verbes.");
  }
  if (usesConjugatedForms(settings) && !settings.tenses.length) {
    throw new Error("Sélectionne au moins un temps.");
  }
  if (usesConjugatedForms(settings) && !settings.persons.length) {
    throw new Error("Sélectionne au moins une personne.");
  }
  if (!canGenerateQuestion(settings)) {
    const availability = getAvailability(settings);
    if (availability.targetCount < availability.requiredTargets) {
      throw new Error(`Pas assez de formes verbales disponibles au niveau lexical ${settings.lexicalLevel} avec ces réglages.`);
    }
    throw new Error(`Pas assez de distracteurs disponibles au niveau lexical ${settings.lexicalLevel} avec les classes sélectionnées.`);
  }
  return settings;
}

export { getDefaultSettings };

function renderVerbSettings(cfg) {
  return `
    <div class="iv-verb-settings-row">
      ${renderRadioGroup({
        title:"Forme des verbes",
        id:"iv_verbFormMode",
        value:cfg.verbFormMode,
        options:[
          { value:VERB_FORM_MODES.INFINITIVE, label:"Infinitifs" },
          { value:VERB_FORM_MODES.CONJUGATED, label:"Conjugués" },
          { value:VERB_FORM_MODES.BOTH, label:"Les deux" }
        ]
      })}
      ${renderCheckboxGroup({
        title:"Groupe des verbes",
        idPrefix:"iv_verbGroup",
        values:cfg.verbGroups,
        options:[
          { value:"first", label:"1er groupe" },
          { value:"second", label:"2e groupe" },
          { value:"third", label:"3e groupe" }
        ]
      })}
    </div>
  `;
}

function renderCounts(cfg) {
  return `
    <section class="tv-group iv-config-counts">
      <div class="tv-group-title">Composition de la série</div>
      <div class="iv-config-count-row">
        ${renderStepperField({
          id:"iv_totalCount",
          label:"Nombre total de mots",
          value:cfg.totalCount,
          inputMin:2,
          inputMax:40
        })}
        ${renderStepperField({
          id:"iv_targetCount",
          label:"Verbes à trouver",
          value:cfg.targetCount,
          inputMin:1,
          inputMax:20
        })}
      </div>
    </section>
  `;
}

function renderConjugationSelectors(cfg) {
  return `
    <section class="iv-conjugation-panel" data-iv-conjugation-panel>
      <div class="iv-conjugation-row">
        ${renderCheckboxGroup({
          title:"Temps",
          idPrefix:"iv_tense",
          values:cfg.tenses,
          options:getTenseOptions()
        })}
        ${renderCheckboxGroup({
          title:"Personnes",
          idPrefix:"iv_person",
          values:cfg.persons,
          options:getPersonOptions()
        })}
      </div>
    </section>
  `;
}

function renderDistractorClasses(cfg) {
  return renderCheckboxGroup({
    title:"Classe grammaticale des distracteurs",
    idPrefix:"iv_distractor",
    values:cfg.distractorClasses,
    options:[
      { value:DISTRACTOR_CLASSES.NOUN, label:"Noms" },
      { value:DISTRACTOR_CLASSES.ADJECTIVE, label:"Adjectifs" },
      { value:DISTRACTOR_CLASSES.OTHER, label:"Autres" }
    ]
  });
}

function renderLexicalAndDistractorSettings(cfg) {
  return `
    <div class="iv-lexical-distractor-row">
      ${renderRadioGroup({
        title:"Niveau lexical",
        id:"iv_lexicalLevel",
        value:String(cfg.lexicalLevel),
        options:[
          { value:"1", label:"1" },
          { value:"2", label:"2" },
          { value:"3", label:"3" }
        ]
      })}
      ${renderDistractorClasses(cfg)}
    </div>
  `;
}

function readCurrentSettings(container) {
  return normalizeSettings({
    verbFormMode:readRadio(container, "iv_verbFormMode", VERB_FORM_MODES.INFINITIVE),
    totalCount:readStepper(container, "iv_totalCount", { inputMin:2, inputMax:40 }),
    targetCount:readStepper(container, "iv_targetCount", { inputMin:1, inputMax:20 }),
    lexicalLevel:Number(readRadio(container, "iv_lexicalLevel", "1")),
    verbGroups:readCheckedValues(container, "iv_verbGroup"),
    distractorClasses:readCheckedValues(container, "iv_distractor"),
    tenses:readCheckedValues(container, "iv_tense"),
    persons:readCheckedValues(container, "iv_person")
  });
}

function refreshDynamicUi(container) {
  const settings = readCurrentSettings(container);
  const conjugationPanel = container.querySelector("[data-iv-conjugation-panel]");
  if (conjugationPanel) conjugationPanel.hidden = !usesConjugatedForms(settings);
  scheduleBankStatusRefresh(container, settings);
}

function scheduleBankStatusRefresh(container, settings) {
  const pending = pendingStatusRefreshes.get(container);
  if (pending != null) {
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(pending);
    else clearTimeout(pending);
  }

  const refresh = () => {
    pendingStatusRefreshes.delete(container);
    refreshBankStatus(container, settings);
  };
  const handle = typeof requestAnimationFrame === "function"
    ? requestAnimationFrame(refresh)
    : setTimeout(refresh, 0);
  pendingStatusRefreshes.set(container, handle);
}

function refreshBankStatus(container, settings = readCurrentSettings(container)) {
  const host = container.querySelector("[data-iv-bank-status]");
  if (!host) return;
  host.classList.remove("is-error", "is-warning", "is-ready");

  if (catalogStatus === "idle" || catalogStatus === "loading") {
    host.textContent = "Chargement de la banque lexicale…";
    return;
  }
  if (catalogStatus === "error") {
    host.classList.add("is-error");
    host.textContent = catalogError || "Impossible de charger la banque lexicale.";
    return;
  }
  if (!settings.distractorClasses.length) {
    host.classList.add("is-warning");
    host.textContent = "Sélectionne au moins une classe grammaticale de distracteurs.";
    return;
  }
  if (!settings.verbGroups.length) {
    host.classList.add("is-warning");
    host.textContent = "Sélectionne au moins un groupe de verbes.";
    return;
  }
  if (usesConjugatedForms(settings) && (!settings.tenses.length || !settings.persons.length)) {
    host.classList.add("is-warning");
    host.textContent = "Sélectionne au moins un temps et une personne.";
    return;
  }

  const availability = getAvailability(settings);
  host.classList.add(availability.canGenerate ? "is-ready" : "is-warning");
  host.textContent = `${availability.targetCount} forme${availability.targetCount > 1 ? "s" : ""} verbale${availability.targetCount > 1 ? "s" : ""} disponible${availability.targetCount > 1 ? "s" : ""} · ${availability.distractorCount} distracteur${availability.distractorCount > 1 ? "s" : ""} disponible${availability.distractorCount > 1 ? "s" : ""} au niveau lexical ${settings.lexicalLevel}${availability.canGenerate ? "." : " : élargis la sélection ou réduis la série."}`;
}

function usesConjugatedForms(settings) {
  return settings.verbFormMode === VERB_FORM_MODES.CONJUGATED || settings.verbFormMode === VERB_FORM_MODES.BOTH;
}

function renderCheckboxGroup({ title, idPrefix, values = [], options = [] } = {}) {
  const selected = new Set(Array.isArray(values) ? values.map(String) : []);
  const rows = (Array.isArray(options) ? options : []).map((option, index) => {
    const value = String(option?.value ?? "");
    const label = String(option?.label ?? value);
    return `
      <label class="iv-checkbox-row">
        <input
          class="tv-checkbox iv-checkbox"
          type="checkbox"
          id="${escapeHtml(`${idPrefix}_${index}`)}"
          data-iv-checkbox-group="${escapeHtml(idPrefix)}"
          value="${escapeHtml(value)}"
          ${selected.has(value) ? "checked" : ""}
        >
        <span>${escapeHtml(label)}</span>
      </label>
    `;
  }).join("");

  return `
    <div class="tv-group tv-group-inline iv-checkbox-group">
      <div class="tv-group-title iv-checkbox-group-title">${escapeHtml(title)}</div>
      <div class="iv-checkbox-grid">${rows}</div>
    </div>
  `;
}

function bindCheckboxGroup(container, idPrefix, onChange) {
  container.querySelectorAll(`[data-iv-checkbox-group="${cssEscape(idPrefix)}"]`)
    .forEach((input) => input.addEventListener("change", () => onChange?.()));
}

function readCheckedValues(container, idPrefix) {
  return Array.from(container.querySelectorAll(`[data-iv-checkbox-group="${cssEscape(idPrefix)}"]:checked`))
    .map((input) => String(input.value || "").trim())
    .filter(Boolean);
}

async function ensureWordCatalogLoaded() {
  if (!catalogPromise) {
    catalogStatus = "loading";
    catalogError = "";
    catalogPromise = listPublicLexicalWords()
      .then((rows) => {
        setWordCatalog(Array.isArray(rows) ? rows : []);
        catalogStatus = "ready";
        return rows;
      })
      .catch((error) => {
        catalogPromise = null;
        catalogStatus = "error";
        catalogError = String(error?.message || "Impossible de charger la banque lexicale.");
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
  if (document.querySelector(`link[data-iv-config-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.ivConfigStyle = href;
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

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value));
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}
