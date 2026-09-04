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
import {
  PHONOLOGY_CGP_COMPLEXITY_LEVELS,
  PHONOLOGY_SCHOOL_LEVELS,
  PHONOLOGY_SILENT_LETTERS_MODES,
  normalizePhonologyCgpComplexityLevel,
  normalizePhonologySchoolLevel,
  normalizePhonologySilentLettersMode
} from "./phonology-word-level.js";

let stylesInjected = false;

export { WORD_SELECTION_MODES };

export function renderWordSelectionSelector(settings = {}, {
  idPrefix = "wordSelection",
  allTargetId = "all",
  showSchoolLevels = false,
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
        ${bankStatusMarkup ? `<div class="wss-bank-status">${bankStatusMarkup}</div>` : ""}
      </div>
      ${showSchoolLevels ? `
        <div class="wss-options-row">
          ${renderSchoolLevelSelector(settings, idPrefix)}
          ${renderCgpComplexitySelector(settings, idPrefix)}
          ${renderSilentLettersSelector(settings, idPrefix)}
        </div>
      ` : ""}
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
    if (event.target.dataset.wssSchoolLevel !== undefined
      || event.target.dataset.wssSilentLetters !== undefined
      || event.target.dataset.wssCgpComplexity !== undefined) emitChange();
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
      schoolLevel:"CP",
      silentLettersMode:PHONOLOGY_SILENT_LETTERS_MODES.ALLOW,
      cgpComplexityLevel:5
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
  const levelInput = root.querySelector("input[data-wss-school-level]:checked");
  const schoolLevel = normalizePhonologySchoolLevel(levelInput instanceof HTMLInputElement ? levelInput.value : "CP");
  const silentLettersInput = root.querySelector("input[data-wss-silent-letters]:checked");
  const silentLettersMode = normalizePhonologySilentLettersMode(
    silentLettersInput instanceof HTMLInputElement ? silentLettersInput.value : PHONOLOGY_SILENT_LETTERS_MODES.ALLOW
  );
  const cgpComplexityInput = root.querySelector("input[data-wss-cgp-complexity]:checked");
  const cgpComplexityLevel = normalizePhonologyCgpComplexityLevel(
    cgpComplexityInput instanceof HTMLInputElement ? cgpComplexityInput.value : 5
  );

  return {
    wordSelectionMode,
    targetIds:phonemic.targetIds,
    enabledSpellingsByTarget:phonemic.enabledSpellingsByTarget,
    graphemicEntries:graphemic.graphemicEntries,
    excludedGraphemicEntries:graphemic.excludedGraphemicEntries,
    schoolLevel,
    silentLettersMode,
    cgpComplexityLevel
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

function renderSchoolLevelSelector(settings, idPrefix) {
  const value = normalizePhonologySchoolLevel(settings?.schoolLevel);
  return `
    <section class="tv-group wss-relevance-group">
      <div class="pts-relevance-selector wss-relevance-selector" role="group" aria-label="Niveau des mots">
        <span class="pts-relevance-selector__title">Niveau des mots</span>
        <div class="pts-relevance-options">
          ${PHONOLOGY_SCHOOL_LEVELS.map((level) => `
            <label class="pts-relevance-option" title="${escapeAttr(level.id === "CP" ? "Mots CP" : `Mots ${level.id} et niveaux précédents`)}">
              <input
                type="radio"
                name="${escapeAttr(idPrefix)}_schoolLevel"
                data-wss-school-level="${escapeAttr(level.id)}"
                value="${escapeAttr(level.id)}"
                ${value === level.id ? "checked" : ""}
              >
              <span>${escapeHtml(level.label)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderSilentLettersSelector(settings, idPrefix) {
  const value = normalizePhonologySilentLettersMode(settings?.silentLettersMode);
  return `
    <section class="tv-group wss-silent-group">
      <div class="pts-relevance-selector wss-silent-selector" role="group" aria-label="Lettres muettes">
        <span class="pts-relevance-selector__title">Lettres muettes</span>
        <div class="pts-relevance-options">
          ${[
            [PHONOLOGY_SILENT_LETTERS_MODES.ALLOW, "Autoriser"],
            [PHONOLOGY_SILENT_LETTERS_MODES.FORBID, "Interdire"]
          ].map(([mode, label]) => `
            <label class="pts-relevance-option">
              <input
                type="radio"
                name="${escapeAttr(idPrefix)}_silentLetters"
                data-wss-silent-letters
                value="${escapeAttr(mode)}"
                ${value === mode ? "checked" : ""}
              >
              <span>${escapeHtml(label)}</span>
            </label>
          `).join("")}
        </div>
      </div>
    </section>
  `;
}

function renderCgpComplexitySelector(settings, idPrefix) {
  const value = normalizePhonologyCgpComplexityLevel(settings?.cgpComplexityLevel);
  return `
    <section class="tv-group wss-complexity-group">
      <div class="pts-relevance-selector wss-complexity-selector" role="group" aria-label="Complexité des CGP">
        <span class="pts-relevance-selector__title">Complexité des CGP</span>
        <div class="pts-relevance-options">
          ${PHONOLOGY_CGP_COMPLEXITY_LEVELS.map((level) => `
            <label class="pts-relevance-option" title="Autoriser les mots de complexité CGP 1 à ${level}">
              <input
                type="radio"
                name="${escapeAttr(idPrefix)}_cgpComplexity"
                data-wss-cgp-complexity
                value="${level}"
                ${value === level ? "checked" : ""}
              >
              <span>${level}</span>
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
