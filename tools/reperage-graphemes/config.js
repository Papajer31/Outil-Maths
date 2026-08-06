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
  getTargetOptions,
  getTargetForSettings,
  setWordCatalog,
  getEligibleWordCount,
  getEligibleTargetCount,
  canGenerateQuestion
} from "./model.js";
import { renderSoundBubble } from "./sound-bubble.js";

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
        renderTargetSelector(cfg),
        renderRadioGroup({
          title: "Nombre de mots par question",
          id: "rg_wordCount",
          value: String(cfg.wordCount),
          options: WORD_COUNT_OPTIONS.map((value) => ({
            value: String(value),
            label: `${value} mots`
          }))
        }),
        `<div class="rg-config-bank-status" data-rg-bank-status aria-live="polite"></div>`
      )}
    </div>
  `;

  bindRadio(container, "rg_wordCount", {
    onChange: () => refreshBankStatus(container)
  });

  container.querySelector("#rg_targetId")?.addEventListener("change", () => {
    resetSpellingSelector(container);
    refreshTargetPreview(container);
    refreshBankStatus(container);
  });

  container.querySelector("[data-rg-spelling-selector]")?.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement) || event.target.name !== "rg_enabledSpelling") return;
    refreshTargetPreview(container);
    refreshBankStatus(container);
  });

  container.querySelector("[data-rg-spelling-selector]")?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-rg-spelling-action]") : null;
    if (!target) return;
    const checked = target.getAttribute("data-rg-spelling-action") === "all";
    container.querySelectorAll('input[name="rg_enabledSpelling"]').forEach((input) => {
      if (input instanceof HTMLInputElement) input.checked = checked;
    });
    refreshTargetPreview(container);
    refreshBankStatus(container);
  });

  refreshTargetPreview(container);
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

  if (!canGenerateQuestion(settings)) {
    if (settings.targetId === ALL_TARGET_ID) {
      throw new Error("Aucun son ne contient assez de mots pour générer cette question.");
    }
    const availableCount = getEligibleWordCount(settings);
    throw new Error(`La banque ne contient que ${availableCount} mot${availableCount > 1 ? "s" : ""} compatible${availableCount > 1 ? "s" : ""} avec ce son.`);
  }

  return settings;
}

export { getDefaultSettings };

function renderTargetSelector(cfg) {
  const options = getTargetOptions().map((option) => `
    <option value="${escapeAttr(option.value)}" ${option.value === cfg.targetId ? "selected" : ""}>${escapeHtml(option.label)}</option>
  `).join("");

  return `
    <section class="tv-group rg-target-group">
      <label class="tv-group-title" for="rg_targetId">Son ciblé</label>
      <select class="tv-input rg-target-select" id="rg_targetId">
        ${options}
      </select>
      <div class="rg-target-preview" data-rg-target-preview></div>
      <div class="rg-spelling-selector" data-rg-spelling-selector>
        ${renderSpellingSelectorMarkup(cfg)}
      </div>
    </section>
  `;
}

function readCurrentSettings(container) {
  return normalizeSettings({
    targetId: container.querySelector("#rg_targetId")?.value || ALL_TARGET_ID,
    wordCount: Number(readRadio(container, "rg_wordCount", "6")),
    enabledSpellings: [...container.querySelectorAll('input[name="rg_enabledSpelling"]:checked')]
      .map((input) => input instanceof HTMLInputElement ? input.value : "")
      .filter(Boolean)
  });
}

function renderSpellingSelectorMarkup(settings = {}) {
  const target = getTargetForSettings(settings);
  if (!target || target.id === ALL_TARGET_ID) {
    return '<p class="rg-spelling-selector__empty">Toutes les graphies sont utilisées en révision générale.</p>';
  }

  const enabled = new Set(Array.isArray(settings.enabledSpellings) ? settings.enabledSpellings : target.spellings);
  const options = target.spellings.map((spelling, index) => `
    <label class="rg-spelling-option">
      <input
        type="checkbox"
        name="rg_enabledSpelling"
        value="${escapeAttr(spelling)}"
        ${enabled.has(spelling) ? "checked" : ""}
      >
      <span>${escapeHtml(spelling)}</span>
    </label>
  `).join("");

  return `
    <div class="rg-spelling-selector__header">
      <div>
        <div class="rg-spelling-selector__title">Graphies utilisées</div>
        <div class="rg-spelling-selector__hint">Décoche les graphies trop complexes pour les élèves.</div>
      </div>
      <div class="rg-spelling-selector__actions">
        <button type="button" data-rg-spelling-action="all">Tout cocher</button>
        <button type="button" data-rg-spelling-action="none">Tout décocher</button>
      </div>
    </div>
    <div class="rg-spelling-options">${options}</div>
  `;
}

function resetSpellingSelector(container) {
  const host = container.querySelector("[data-rg-spelling-selector]");
  if (!host) return;
  const targetId = container.querySelector("#rg_targetId")?.value || ALL_TARGET_ID;
  const wordCount = Number(readRadio(container, "rg_wordCount", "6"));
  const settings = normalizeSettings({ targetId, wordCount });
  host.innerHTML = renderSpellingSelectorMarkup(settings);
}

function refreshTargetPreview(container) {
  const settings = readCurrentSettings(container);
  const target = getTargetForSettings(settings);
  const host = container.querySelector("[data-rg-target-preview]");
  if (!host || !target) return;
  if (target.id === ALL_TARGET_ID) {
    host.textContent = "À chaque question, l’outil choisira aléatoirement un son parmi ceux qui disposent d’assez de mots.";
    return;
  }

  const activeSpellings = Array.isArray(settings.enabledSpellings) ? settings.enabledSpellings : [];
  host.innerHTML = `
    <span class="rg-target-preview__line">
      Son sélectionné : ${renderSoundBubble(target.bubbleText, { className:"rg-sound-bubble--config" })}
      <span>comme dans « ${escapeHtml(target.example)} »</span>
    </span>
    <span class="rg-target-preview__spellings">${activeSpellings.length} graphie${activeSpellings.length > 1 ? "s" : ""} active${activeSpellings.length > 1 ? "s" : ""} sur ${target.spellings.length}.</span>
  `;
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
  const count = getEligibleWordCount(settings);
  const targetCount = getEligibleTargetCount(settings);
  const enough = canGenerateQuestion(settings);
  host.classList.add(enough ? "is-ready" : "is-warning");

  if (settings.targetId === ALL_TARGET_ID) {
    host.textContent = `${targetCount} son${targetCount > 1 ? "s" : ""} générable${targetCount > 1 ? "s" : ""} à partir de ${count} mot${count > 1 ? "s" : ""} distinct${count > 1 ? "s" : ""}${enough ? "." : " : quantité insuffisante pour ce réglage."}`;
    return;
  }

  host.textContent = `${count} mot${count > 1 ? "s" : ""} compatible${count > 1 ? "s" : ""} dans la banque${enough ? "." : " : quantité insuffisante pour ce réglage."}`;
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
