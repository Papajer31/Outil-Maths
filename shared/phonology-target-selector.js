import { getPhonemeTarget, getPhonologyTargetsByCategory } from "./phonology-targets.js";
import { renderSoundBubble } from "./sound-bubble.js";

let stylesInjected = false;

export function renderPhonologyTargetSelector(settings = {}, {
  idPrefix = "phonology",
  allTargetId = "all",
  title = "Entrée phonémique",
  showRelevanceLevels = false
} = {}) {
  const selected = new Set(Array.isArray(settings?.targetIds) ? settings.targetIds : [allTargetId]);
  const categories = getPhonologyTargetsByCategory();

  const categoryMarkupById = new Map(categories.map((category) => [category.id, renderCategory(category, selected, idPrefix)]));
  const categoryRows = [
    ["vowels", "nasals", "semivowels"],
    ["consonants"]
  ].map((ids, index) => `
    <div class="pts-category-row pts-category-row--${index + 1}">
      ${ids.map((id) => categoryMarkupById.get(id) || "").join("")}
    </div>
  `).join("");

  return `
    <section class="tv-group pts-group" data-pts-root="${escapeAttr(idPrefix)}" data-pts-all-target-id="${escapeAttr(allTargetId)}">
      <div class="tv-group-title" id="${escapeAttr(idPrefix)}_target_label">${escapeHtml(title)}</div>
      <div class="pts-categories" role="group" aria-labelledby="${escapeAttr(idPrefix)}_target_label">
        ${categoryRows}
      </div>
      <div class="pts-target-details" data-pts-target-details>
        ${renderSpellingSelectorMarkup(settings, { idPrefix, allTargetId })}
      </div>
      ${showRelevanceLevels ? renderRelevanceLevelSelector(settings, idPrefix) : ""}
    </section>
  `;
}

function renderCategory(category, selected, idPrefix) {
  return `
    <div class="pts-category" data-pts-category="${escapeAttr(category.id)}">
      <div class="pts-category__label">${escapeHtml(category.label)}</div>
      <div class="pts-category__options">
        ${category.targets.map((target) => renderTargetButton(target, selected, idPrefix)).join("")}
      </div>
    </div>
  `;
}

export function bindPhonologyTargetSelector(container, {
  idPrefix = "phonology",
  allTargetId = "all",
  onChange = null
} = {}) {
  ensureStyles();
  const root = findRoot(container, idPrefix);
  if (!root || root.dataset.ptsBound === "1") return;
  root.dataset.ptsBound = "1";

  root.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest("[data-pts-target-id]")
      : null;
    if (!(button instanceof HTMLButtonElement) || !root.contains(button)) return;

    const previous = readPhonologyTargetSelector(container, { idPrefix, allTargetId });
    const buttons = [...root.querySelectorAll("[data-pts-target-id]")]
      .filter((item) => item instanceof HTMLButtonElement);
    const targetId = String(button.dataset.ptsTargetId || "");
    const allButton = buttons.find((item) => item.dataset.ptsTargetId === allTargetId);

    if (targetId === allTargetId) {
      buttons.forEach((item) => item.setAttribute("aria-pressed", item === button ? "true" : "false"));
    } else {
      allButton?.setAttribute("aria-pressed", "false");
      button.setAttribute("aria-pressed", button.getAttribute("aria-pressed") === "true" ? "false" : "true");
      const hasSpecific = buttons.some((item) => item.dataset.ptsTargetId !== allTargetId && item.getAttribute("aria-pressed") === "true");
      if (!hasSpecific) allButton?.setAttribute("aria-pressed", "true");
    }

    refreshDetails(root, previous, { idPrefix, allTargetId });
    if (typeof onChange === "function") {
      onChange(readPhonologyTargetSelector(container, { idPrefix, allTargetId }));
    }
  });

  root.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    const isSpelling = event.target.dataset.ptsSpellingTargetId !== undefined;
    const isRelevance = event.target.dataset.ptsRelevanceLevel !== undefined;
    if (!isSpelling && !isRelevance) return;
    if (typeof onChange === "function") {
      onChange(readPhonologyTargetSelector(container, { idPrefix, allTargetId }));
    }
  });
}

export function readPhonologyTargetSelector(container, {
  idPrefix = "phonology",
  allTargetId = "all"
} = {}) {
  const root = findRoot(container, idPrefix);
  if (!root) return { targetIds:[allTargetId], enabledSpellingsByTarget:{}, relevanceLevel:"normal" };

  const targetIds = [...root.querySelectorAll('[data-pts-target-id][aria-pressed="true"]')]
    .map((button) => button instanceof HTMLElement ? String(button.dataset.ptsTargetId || "") : "")
    .filter(Boolean);
  const normalizedTargetIds = targetIds.length ? targetIds : [allTargetId];
  const enabledSpellingsByTarget = {};

  normalizedTargetIds.filter((id) => id !== allTargetId).forEach((targetId) => {
    enabledSpellingsByTarget[targetId] = [...root.querySelectorAll(`input[data-pts-spelling-target-id="${cssEscape(targetId)}"]:checked`)]
      .map((input) => input instanceof HTMLInputElement ? input.value : "")
      .filter(Boolean);
  });

  const relevanceInput = root.querySelector('input[data-pts-relevance-level]:checked');
  const relevanceLevel = relevanceInput instanceof HTMLInputElement
    ? String(relevanceInput.value || "normal")
    : "normal";

  return { targetIds:normalizedTargetIds, enabledSpellingsByTarget, relevanceLevel };
}

function renderTargetButton(target, selected, idPrefix) {
  const title = `${target.label} comme dans « ${target.example} »`;
  return `
    <button
      class="pts-target-option"
      type="button"
      data-pts-target-id="${escapeAttr(target.id)}"
      aria-pressed="${selected.has(target.id) ? "true" : "false"}"
      title="${escapeAttr(title)}"
    >${escapeHtml(target.bubbleText)}</button>
  `;
}

function renderSpellingSelectorMarkup(settings = {}, { idPrefix, allTargetId }) {
  const selectedTargetIds = Array.isArray(settings?.targetIds) && settings.targetIds.length
    ? settings.targetIds
    : [allTargetId];
  if (selectedTargetIds.includes(allTargetId)) {
    return '<span class="pts-spelling-selector__empty">Toutes les graphies des phonèmes sélectionnés sont utilisées.</span>';
  }

  return selectedTargetIds.map((targetId) => {
    const target = getPhonemeTarget(targetId);
    if (!target) return "";
    const explicit = settings?.enabledSpellingsByTarget?.[target.id];
    const enabled = new Set(Array.isArray(explicit) ? explicit : target.spellings);
    const options = renderFixedSpellingOptions(target, enabled, idPrefix);

    return `
      <div class="pts-spelling-selector" data-pts-spelling-selector-target-id="${escapeAttr(target.id)}">
        <span class="pts-target-preview__line">
          ${renderSoundBubble(target.bubbleText, { className:"pts-sound-bubble--config" })}
          <span>comme dans « ${escapeHtml(target.example)} »</span>
        </span>
        <span class="pts-spelling-selector__title">Graphies utilisées&nbsp;:</span>
        <div class="pts-spelling-options" data-pts-spelling-options>${options}</div>
      </div>
    `;
  }).join("");
}

function renderFixedSpellingOptions(target, enabled, idPrefix) {
  const rareSet = new Set(Array.isArray(target?.rareSpellings) ? target.rareSpellings : []);
  const frequent = target.spellings.filter((spelling) => !rareSet.has(spelling));
  const rare = target.spellings.filter((spelling) => rareSet.has(spelling));
  const renderOption = (spelling) => {
    const originalOrder = target.spellings.indexOf(spelling);
    return `
      <label
        class="pts-spelling-option"
        data-pts-spelling-option
        data-pts-spelling="${escapeAttr(spelling)}"
        data-pts-spelling-order="${originalOrder}"
      >
        <input
          type="checkbox"
          name="${escapeAttr(idPrefix)}_enabledSpelling"
          data-pts-spelling-target-id="${escapeAttr(target.id)}"
          value="${escapeAttr(spelling)}"
          ${enabled.has(spelling) ? "checked" : ""}
        >
        <span>${escapeHtml(spelling)}</span>
      </label>
    `;
  };

  // La classification fréquente/rare appartient au référentiel phonémique.
  // Elle est volontairement indépendante de la banque filtrée, du niveau,
  // des autres réglages et surtout des cases déjà cochées.
  if (!rare.length || !frequent.length) {
    return target.spellings.map(renderOption).join("");
  }

  return `
    <span class="pts-spelling-frequency-label pts-spelling-frequency-label--frequent">fréquentes →</span>
    ${frequent.map(renderOption).join("")}
    <span class="pts-spelling-frequency-label pts-spelling-frequency-label--rare">rares →</span>
    ${rare.map(renderOption).join("")}
  `;
}

export function updatePhonologySpellingUsage() {
  // Compatibilité avec les outils existants : ils peuvent encore appeler cette
  // fonction après avoir recalculé leur pool de mots. La fréquence visuelle
  // n'est plus recalculée ici : elle est fixe dans phonology-targets.js.
}

function renderRelevanceLevelSelector(settings = {}, idPrefix = "phonology") {
  const requested = String(settings?.relevanceLevel || "normal");
  const value = ["simple", "normal", "complexe"].includes(requested) ? requested : "normal";
  const options = [
    ["simple", "Simple", "Excellents exemples pédagogiques"],
    ["normal", "Normal", "Bons exemples pédagogiques"],
    ["complexe", "Complexe", "Exemples exploitables demandant davantage de traitement"]
  ];
  return `
    <div class="pts-relevance-selector" role="group" aria-label="Pertinence pédagogique">
      <span class="pts-relevance-selector__title">Pertinence pédagogique&nbsp;:</span>
      <div class="pts-relevance-options">
        ${options.map(([id, label, title]) => `
          <label class="pts-relevance-option" title="${escapeAttr(title)}">
            <input
              type="radio"
              name="${escapeAttr(idPrefix)}_relevanceLevel"
              data-pts-relevance-level="${escapeAttr(id)}"
              value="${escapeAttr(id)}"
              ${value === id ? "checked" : ""}
            >
            <span>${escapeHtml(label)}</span>
          </label>
        `).join("")}
      </div>
    </div>
  `;
}

function refreshDetails(root, previous, { idPrefix, allTargetId }) {
  const details = root.querySelector("[data-pts-target-details]");
  if (!details) return;
  const targetIds = [...root.querySelectorAll('[data-pts-target-id][aria-pressed="true"]')]
    .map((button) => button instanceof HTMLElement ? String(button.dataset.ptsTargetId || "") : "")
    .filter(Boolean);
  const enabledSpellingsByTarget = {};
  for (const targetId of targetIds) {
    if (targetId === allTargetId) continue;
    const target = getPhonemeTarget(targetId);
    if (!target) continue;
    enabledSpellingsByTarget[target.id] = previous?.enabledSpellingsByTarget?.[target.id]
      || [...target.spellings];
  }
  details.innerHTML = renderSpellingSelectorMarkup(
    { targetIds:targetIds.length ? targetIds : [allTargetId], enabledSpellingsByTarget },
    { idPrefix, allTargetId }
  );
}

function findRoot(container, idPrefix) {
  return container?.querySelector?.(`[data-pts-root="${cssEscape(idPrefix)}"]`) || null;
}

function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./phonology-target-selector.css", import.meta.url).href;
  if (document.querySelector(`link[data-pts-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.ptsStyle = href;
  document.head.appendChild(link);
}

function cssEscape(value) {
  if (globalThis.CSS?.escape) return CSS.escape(String(value || ""));
  return String(value || "").replace(/["\\]/g, "\\$&");
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
