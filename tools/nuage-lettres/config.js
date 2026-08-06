import {
  renderRadioGroup,
  bindRadio,
  readRadio,
  renderToolSettingsStack
} from "../../shared/config-widgets.js";
import { listPublicPhonologyWords } from "../../shared/public-api.js";
import {
  CLOUD_MODES,
  LETTER_COUNT_OPTIONS,
  getDefaultSettings,
  normalizeSettings,
  getTargetOptions,
  getTargetForSettings,
  setWordCatalog,
  getEligibleWordCount,
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
    <div class="nl-config-root">
      ${renderToolSettingsStack(
        renderTargetSelector(cfg),
        renderLengthSelector(cfg),
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
        `<div class="nl-config-mode-hint" data-nl-mode-hint></div>`,
        `<div class="nl-config-bank-status" data-nl-bank-status aria-live="polite"></div>`
      )}
    </div>
  `;

  bindRadio(container, "nl_cloudMode", {
    onChange: () => refreshModeHint(container)
  });

  container.querySelector("#nl_targetId")?.addEventListener("change", () => {
    resetSpellingSelector(container);
    refreshTargetPreview(container);
    refreshBankStatus(container);
  });

  container.querySelector("[data-nl-spelling-selector]")?.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement) || event.target.name !== "nl_enabledSpelling") return;
    refreshTargetPreview(container);
    refreshBankStatus(container);
  });

  container.querySelector("[data-nl-spelling-selector]")?.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest("[data-nl-spelling-action]") : null;
    if (!target) return;
    const checked = target.getAttribute("data-nl-spelling-action") === "all";
    container.querySelectorAll('input[name="nl_enabledSpelling"]').forEach((input) => {
      if (input instanceof HTMLInputElement) input.checked = checked;
    });
    refreshTargetPreview(container);
    refreshBankStatus(container);
  });

  container.querySelector("#nl_minLetters")?.addEventListener("change", () => {
    keepLengthRangeValid(container, "min");
    refreshBankStatus(container);
  });
  container.querySelector("#nl_maxLetters")?.addEventListener("change", () => {
    keepLengthRangeValid(container, "max");
    refreshBankStatus(container);
  });

  refreshTargetPreview(container);
  refreshModeHint(container);
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
  if (!settings.enabledSpellings.length) {
    throw new Error("Active au moins une graphie pour le son ciblé.");
  }
  if (!canGenerateQuestion(settings)) {
    throw new Error("Aucun mot de la banque ne correspond à ce son, à ces graphies et à cette longueur.");
  }

  return settings;
}

export { getDefaultSettings };

function renderTargetSelector(cfg) {
  const options = getTargetOptions().map((option) => `
    <option value="${escapeAttr(option.value)}" ${option.value === cfg.targetId ? "selected" : ""}>${escapeHtml(option.label)}</option>
  `).join("");

  return `
    <section class="tv-group nl-target-group">
      <label class="tv-group-title" for="nl_targetId">Son ciblé</label>
      <select class="tv-input nl-target-select" id="nl_targetId">${options}</select>
      <div class="nl-target-preview" data-nl-target-preview></div>
      <div class="nl-spelling-selector" data-nl-spelling-selector>
        ${renderSpellingSelectorMarkup(cfg)}
      </div>
    </section>
  `;
}

function renderLengthSelector(cfg) {
  const options = LETTER_COUNT_OPTIONS.map((value) => `
    <option value="${value}">${value}</option>
  `).join("");

  return `
    <section class="tv-group nl-length-group">
      <div class="tv-group-title">Nombre de lettres du mot</div>
      <div class="nl-length-fields">
        <label>
          <span>Minimum</span>
          <select class="tv-input" id="nl_minLetters">
            ${options.replace(`value="${cfg.minLetters}"`, `value="${cfg.minLetters}" selected`)}
          </select>
        </label>
        <span class="nl-length-separator" aria-hidden="true">à</span>
        <label>
          <span>Maximum</span>
          <select class="tv-input" id="nl_maxLetters">
            ${options.replace(`value="${cfg.maxLetters}"`, `value="${cfg.maxLetters}" selected`)}
          </select>
        </label>
      </div>
    </section>
  `;
}

function readCurrentSettings(container) {
  return normalizeSettings({
    targetId: container.querySelector("#nl_targetId")?.value,
    enabledSpellings: [...container.querySelectorAll('input[name="nl_enabledSpelling"]:checked')]
      .map((input) => input instanceof HTMLInputElement ? input.value : "")
      .filter(Boolean),
    minLetters: Number(container.querySelector("#nl_minLetters")?.value),
    maxLetters: Number(container.querySelector("#nl_maxLetters")?.value),
    cloudMode: readRadio(container, "nl_cloudMode", CLOUD_MODES.FIXED)
  });
}

function renderSpellingSelectorMarkup(settings = {}) {
  const target = getTargetForSettings(settings);
  if (!target) return "";

  const enabled = new Set(Array.isArray(settings.enabledSpellings) ? settings.enabledSpellings : target.spellings);
  const options = target.spellings.map((spelling) => `
    <label class="nl-spelling-option">
      <input
        type="checkbox"
        name="nl_enabledSpelling"
        value="${escapeAttr(spelling)}"
        ${enabled.has(spelling) ? "checked" : ""}
      >
      <span>${escapeHtml(spelling)}</span>
    </label>
  `).join("");

  return `
    <div class="nl-spelling-selector__header">
      <div>
        <div class="nl-spelling-selector__title">Graphies utilisées</div>
        <div class="nl-spelling-selector__hint">Les mots contenant une graphie décochée ne seront pas proposés.</div>
      </div>
      <div class="nl-spelling-selector__actions">
        <button type="button" data-nl-spelling-action="all">Tout cocher</button>
        <button type="button" data-nl-spelling-action="none">Tout décocher</button>
      </div>
    </div>
    <div class="nl-spelling-options">${options}</div>
  `;
}

function resetSpellingSelector(container) {
  const host = container.querySelector("[data-nl-spelling-selector]");
  if (!host) return;
  const settings = normalizeSettings({
    targetId: container.querySelector("#nl_targetId")?.value,
    minLetters: Number(container.querySelector("#nl_minLetters")?.value),
    maxLetters: Number(container.querySelector("#nl_maxLetters")?.value),
    cloudMode: readRadio(container, "nl_cloudMode", CLOUD_MODES.FIXED)
  });
  host.innerHTML = renderSpellingSelectorMarkup(settings);
}

function refreshTargetPreview(container) {
  const settings = readCurrentSettings(container);
  const target = getTargetForSettings(settings);
  const host = container.querySelector("[data-nl-target-preview]");
  if (!host || !target) return;

  host.innerHTML = `
    <span class="nl-target-preview__line">
      Son sélectionné : ${renderSoundBubble(target.bubbleText, { className:"nl-sound-bubble--config" })}
      <span>comme dans « ${escapeHtml(target.example)} »</span>
    </span>
    <span class="nl-target-preview__spellings">${settings.enabledSpellings.length} graphie${settings.enabledSpellings.length > 1 ? "s" : ""} active${settings.enabledSpellings.length > 1 ? "s" : ""} sur ${target.spellings.length}.</span>
  `;
}

function refreshModeHint(container) {
  const host = container.querySelector("[data-nl-mode-hint]");
  if (!host) return;
  const mode = readRadio(container, "nl_cloudMode", CLOUD_MODES.FIXED);
  if (mode === CLOUD_MODES.DRAGGABLE) {
    host.textContent = "L’élève peut déplacer les lettres dans le nuage avant de les sélectionner.";
  } else if (mode === CLOUD_MODES.FLOATING) {
    host.textContent = "Les lettres se déplacent lentement et rebondissent sur les bords. Elles ne sont pas déplaçables.";
  } else {
    host.textContent = "Les lettres restent fixes dans le nuage.";
  }
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
  const count = getEligibleWordCount(settings);
  const enough = canGenerateQuestion(settings);
  host.classList.add(enough ? "is-ready" : "is-warning");
  host.textContent = `${count} mot${count > 1 ? "s" : ""} compatible${count > 1 ? "s" : ""} dans la banque${enough ? "." : " : aucun mot ne peut être généré avec ces réglages."}`;
}

function keepLengthRangeValid(container, changedSide) {
  const minSelect = container.querySelector("#nl_minLetters");
  const maxSelect = container.querySelector("#nl_maxLetters");
  if (!(minSelect instanceof HTMLSelectElement) || !(maxSelect instanceof HTMLSelectElement)) return;
  const min = Number(minSelect.value);
  const max = Number(maxSelect.value);
  if (min <= max) return;
  if (changedSide === "min") maxSelect.value = minSelect.value;
  else minSelect.value = maxSelect.value;
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
