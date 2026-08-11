import {
  renderPhonologyTargetSelector,
  bindPhonologyTargetSelector,
  readPhonologyTargetSelector,
  updatePhonologySpellingUsage
} from "./phonology-target-selector.js";
import {
  renderGraphemicTargetSelector,
  bindGraphemicTargetSelector,
  readGraphemicTargetSelector
} from "./graphemic-target-selector.js";
import {
  WORD_SELECTION_MODES,
  normalizeWordSelectionMode
} from "./graphemic-targets.js";

let stylesInjected = false;

export { WORD_SELECTION_MODES };

export function renderWordSelectionSelector(settings = {}, {
  idPrefix = "wordSelection",
  allTargetId = "all",
  showRelevanceLevels = false,
  bankStatusMarkup = "",
  afterSelectionMarkup = ""
} = {}) {
  const mode = normalizeWordSelectionMode(settings?.wordSelectionMode);
  const phonemicPrefix = `${idPrefix}_phonemic`;
  const graphemicPrefix = `${idPrefix}_graphemic`;
  return `
    <div class="wss-root" data-wss-root="${escapeAttr(idPrefix)}">
      <div class="wss-selection-row">
        <section class="tv-group wss-mode-group">
          <div class="tv-group-title" id="${escapeAttr(idPrefix)}_label">Sélection des mots</div>
          <div class="wss-mode-options" role="radiogroup" aria-labelledby="${escapeAttr(idPrefix)}_label">
            ${renderModeOption(idPrefix, WORD_SELECTION_MODES.PHONEMIC, "Entrée phonémique", mode)}
            ${renderModeOption(idPrefix, WORD_SELECTION_MODES.GRAPHEMIC, "Entrée graphémique", mode)}
          </div>
        </section>
        ${showRelevanceLevels ? renderRelevanceSelector(settings, idPrefix) : ""}
      </div>
      ${bankStatusMarkup ? `<div class="wss-bank-status">${bankStatusMarkup}</div>` : ""}
      ${afterSelectionMarkup}
      <div class="wss-panel" data-wss-panel="phonemic" ${mode === WORD_SELECTION_MODES.PHONEMIC ? "" : "hidden"}>
        ${renderPhonologyTargetSelector(settings, {
          idPrefix:phonemicPrefix,
          allTargetId,
          title:"Entrée phonémique",
          showRelevanceLevels:false
        })}
      </div>
      <div class="wss-panel" data-wss-panel="graphemic" ${mode === WORD_SELECTION_MODES.GRAPHEMIC ? "" : "hidden"}>
        ${renderGraphemicTargetSelector(settings, {
          idPrefix:graphemicPrefix,
          title:"Entrée graphémique"
        })}
      </div>
    </div>
  `;
}

export function bindWordSelectionSelector(container, {
  idPrefix = "wordSelection",
  allTargetId = "all",
  onChange = null
} = {}) {
  ensureStyles();
  const root = findRoot(container, idPrefix);
  if (!root || root.dataset.wssBound === "1") return;
  root.dataset.wssBound = "1";

  const emitChange = () => {
    if (typeof onChange === "function") onChange(readWordSelectionSelector(container, { idPrefix, allTargetId }));
  };

  bindPhonologyTargetSelector(container, {
    idPrefix:`${idPrefix}_phonemic`,
    allTargetId,
    onChange:emitChange
  });
  bindGraphemicTargetSelector(container, {
    idPrefix:`${idPrefix}_graphemic`,
    onChange:emitChange
  });

  root.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.dataset.wssMode !== undefined) {
      syncPanels(root, normalizeWordSelectionMode(event.target.value));
      emitChange();
      return;
    }
    if (event.target.dataset.wssRelevanceLevel !== undefined) emitChange();
  });
}

export function updateWordSelectionSpellingUsage(container, {
  idPrefix = "wordSelection",
  usageByTarget = {}
} = {}) {
  updatePhonologySpellingUsage(container, {
    idPrefix:`${idPrefix}_phonemic`,
    usageByTarget
  });
}

export function readWordSelectionSelector(container, {
  idPrefix = "wordSelection",
  allTargetId = "all"
} = {}) {
  const root = findRoot(container, idPrefix);
  if (!root) {
    return {
      wordSelectionMode:WORD_SELECTION_MODES.PHONEMIC,
      targetIds:[allTargetId],
      enabledSpellingsByTarget:{},
      graphemicEntries:[],
      excludedGraphemicEntries:[],
      relevanceLevel:"normal"
    };
  }

  const modeInput = root.querySelector("input[data-wss-mode]:checked");
  const wordSelectionMode = normalizeWordSelectionMode(modeInput instanceof HTMLInputElement ? modeInput.value : "phonemic");
  const phonemic = readPhonologyTargetSelector(container, {
    idPrefix:`${idPrefix}_phonemic`,
    allTargetId
  });
  const graphemic = readGraphemicTargetSelector(container, {
    idPrefix:`${idPrefix}_graphemic`
  });
  const relevanceInput = root.querySelector("input[data-wss-relevance-level]:checked");
  const relevanceLevel = relevanceInput instanceof HTMLInputElement
    ? String(relevanceInput.value || "normal")
    : String(phonemic.relevanceLevel || "normal");

  return {
    wordSelectionMode,
    targetIds:phonemic.targetIds,
    enabledSpellingsByTarget:phonemic.enabledSpellingsByTarget,
    graphemicEntries:graphemic.graphemicEntries,
    excludedGraphemicEntries:graphemic.excludedGraphemicEntries,
    relevanceLevel
  };
}

function renderModeOption(idPrefix, value, label, current) {
  return `
    <label class="wss-mode-option">
      <input
        type="radio"
        name="${escapeAttr(idPrefix)}_mode"
        data-wss-mode
        value="${escapeAttr(value)}"
        ${current === value ? "checked" : ""}
      >
      <span>${escapeHtml(label)}</span>
    </label>
  `;
}

function renderRelevanceSelector(settings, idPrefix) {
  const requested = String(settings?.relevanceLevel || "normal");
  const value = ["simple", "normal", "complexe"].includes(requested) ? requested : "normal";
  const options = [
    ["simple", "Simple", "Excellents exemples pédagogiques"],
    ["normal", "Normal", "Bons exemples pédagogiques"],
    ["complexe", "Complexe", "Exemples exploitables demandant davantage de traitement"]
  ];
  return `
    <section class="tv-group wss-relevance-group">
      <div class="pts-relevance-selector wss-relevance-selector" role="group" aria-label="Pertinence pédagogique">
      <span class="pts-relevance-selector__title">Pertinence pédagogique</span>
      <div class="pts-relevance-options">
        ${options.map(([id, label, title]) => `
          <label class="pts-relevance-option" title="${escapeAttr(title)}">
            <input
              type="radio"
              name="${escapeAttr(idPrefix)}_relevanceLevel"
              data-wss-relevance-level="${escapeAttr(id)}"
              value="${escapeAttr(id)}"
              ${value === id ? "checked" : ""}
            >
            <span>${escapeHtml(label)}</span>
          </label>
        `).join("")}
      </div>
      </div>
    </section>
  `;
}

function syncPanels(root, mode) {
  root.querySelectorAll("[data-wss-panel]").forEach((panel) => {
    if (!(panel instanceof HTMLElement)) return;
    panel.hidden = panel.dataset.wssPanel !== mode;
  });
}

function findRoot(container, idPrefix) {
  return container?.querySelector?.(`[data-wss-root="${cssEscape(idPrefix)}"]`) || null;
}

function ensureStyles() {
  if (stylesInjected) return;
  stylesInjected = true;
  const href = new URL("./word-selection-selector.css", import.meta.url).href;
  if (document.querySelector(`link[data-wss-style="${href}"]`)) return;
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = href;
  link.dataset.wssStyle = href;
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
