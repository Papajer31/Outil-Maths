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
  PHONOLOGY_SILENT_LETTERS_MODES,
  normalizePhonologyCgpComplexityLevel,
  normalizePhonologySilentLettersMode
} from "./phonology-word-level.js";
import { LEXICAL_LEVELS, normalizeFixedWordSlugs, normalizeLexicalKey, normalizeLexicalLevel } from "./lexical-bank.js";

let stylesInjected = false;

export { WORD_SELECTION_MODES };

export function renderWordSelectionSelector(settings = {}, {
  idPrefix = "wordSelection",
  allTargetId = "all",
  showLexicalLevels = false,
  allowFixedList = true,
  bankStatusMarkup = "",
  afterSelectionMarkup = ""
} = {}) {
  const requestedMode = normalizeWordSelectionMode(settings?.wordSelectionMode);
  const mode = !allowFixedList && requestedMode === WORD_SELECTION_MODES.FIXED
    ? WORD_SELECTION_MODES.PHONEMIC
    : requestedMode;
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
            ${allowFixedList ? renderModeOption(idPrefix, WORD_SELECTION_MODES.FIXED, "Liste fixe", mode) : ""}
          </div>
        </section>
        ${bankStatusMarkup ? `<div class="wss-bank-status">${bankStatusMarkup}</div>` : ""}
      </div>
      ${showLexicalLevels ? `
        <div class="wss-options-row" data-wss-auto-options ${mode === WORD_SELECTION_MODES.FIXED ? "hidden" : ""}>
          ${renderLexicalLevelSelector(settings, idPrefix)}
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
      ${allowFixedList ? `
        <div class="wss-panel" data-wss-panel="fixed" ${mode === WORD_SELECTION_MODES.FIXED ? "" : "hidden"}>
          ${renderFixedWordSelector(settings, idPrefix)}
        </div>
      ` : ""}
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
  bindFixedWordSelector(root, emitChange);

  root.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLInputElement)) return;
    if (event.target.dataset.wssMode !== undefined) {
      syncPanels(root, normalizeWordSelectionMode(event.target.value));
      emitChange();
      return;
    }
    if (event.target.dataset.wssLexicalLevel !== undefined
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
      fixedWordSlugs:[],
      lexicalLevel:1,
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
  const fixedWordSlugs = readFixedWordSlugs(root);
  const levelInput = root.querySelector("input[data-wss-lexical-level]:checked");
  const lexicalLevel = normalizeLexicalLevel(levelInput instanceof HTMLInputElement ? levelInput.value : 1);
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
    fixedWordSlugs,
    lexicalLevel,
    silentLettersMode,
    cgpComplexityLevel
  };
}


export function setWordSelectionCatalog(container, words = [], {
  idPrefix = "wordSelection"
} = {}) {
  const root = findRoot(container, idPrefix);
  if (!root) return;
  const catalog = (Array.isArray(words) ? words : [])
    .map((entry) => ({
      slug:normalizeLexicalKey(entry?.slug ?? entry?.key),
      word:String(entry?.word ?? entry?.entry ?? "").trim().normalize("NFC")
    }))
    .filter((entry) => entry.slug && entry.word)
    .sort((a, b) => a.word.localeCompare(b.word, "fr", { sensitivity:"base" }));
  root._wssFixedCatalog = catalog;
  renderFixedWordState(root);
}

function renderFixedWordSelector(settings, idPrefix) {
  const selected = normalizeFixedWordSlugs(settings?.fixedWordSlugs || settings?.fixedWords || []);
  return `
    <section class="tv-group wss-fixed-group">
      <div class="tv-group-title">Liste fixe</div>
      <div class="wss-fixed-editor">
        <div class="wss-fixed-search-row">
          <div class="wss-fixed-search-wrap">
            <input
              type="text"
              class="wss-fixed-search"
              data-wss-fixed-search
              autocomplete="off"
              placeholder="Rechercher ou coller des mots…"
              aria-label="Rechercher un mot dans la banque lexicale"
            >
            <div class="wss-fixed-suggestions" data-wss-fixed-suggestions hidden></div>
          </div>
          <button type="button" class="wss-fixed-add" data-wss-fixed-add>Ajouter</button>
        </div>
        <input type="hidden" data-wss-fixed-value value="${escapeAttr(selected.join("\n"))}">
        <div class="wss-fixed-chips" data-wss-fixed-chips></div>
        <div class="wss-fixed-footer">
          <span data-wss-fixed-count>${selected.length} mot${selected.length > 1 ? "s" : ""} sélectionné${selected.length > 1 ? "s" : ""}</span>
          <span class="wss-fixed-feedback" data-wss-fixed-feedback></span>
          <button type="button" class="wss-fixed-clear" data-wss-fixed-clear ${selected.length ? "" : "disabled"}>Tout effacer</button>
        </div>
      </div>
    </section>
  `;
}

function bindFixedWordSelector(root, emitChange) {
  const search = root.querySelector("[data-wss-fixed-search]");
  const addButton = root.querySelector("[data-wss-fixed-add]");
  const clearButton = root.querySelector("[data-wss-fixed-clear]");
  const suggestions = root.querySelector("[data-wss-fixed-suggestions]");
  if (!(search instanceof HTMLInputElement)) return;

  const addFromText = (rawText, { preferFirstSuggestion = false } = {}) => {
    const result = addFixedWords(root, rawText, { preferFirstSuggestion });
    if (result.added > 0) emitChange();
    return result;
  };

  search.addEventListener("input", () => renderFixedSuggestions(root));
  search.addEventListener("focus", () => renderFixedSuggestions(root));
  search.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      hideFixedSuggestions(root);
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const result = addFromText(search.value, { preferFirstSuggestion:true });
    if (result.added) search.value = "";
    renderFixedSuggestions(root);
  });
  search.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text") || "";
    if (!/[\n\r;,]/u.test(text)) return;
    event.preventDefault();
    const result = addFromText(text);
    if (result.added) search.value = "";
    renderFixedSuggestions(root);
  });

  addButton?.addEventListener("click", () => {
    const result = addFromText(search.value, { preferFirstSuggestion:true });
    if (result.added) search.value = "";
    renderFixedSuggestions(root);
    search.focus();
  });

  clearButton?.addEventListener("click", () => {
    if (!readFixedWordSlugs(root).length) return;
    writeFixedWordSlugs(root, []);
    setFixedFeedback(root, "");
    renderFixedWordState(root);
    emitChange();
  });

  suggestions?.addEventListener("mousedown", (event) => {
    const button = event.target.closest?.("[data-wss-fixed-suggestion]");
    if (!(button instanceof HTMLButtonElement)) return;
    event.preventDefault();
    const slug = button.dataset.wssFixedSuggestion || "";
    if (!slug) return;
    const before = readFixedWordSlugs(root);
    if (!before.includes(slug)) {
      writeFixedWordSlugs(root, [...before, slug]);
      emitChange();
    }
    search.value = "";
    setFixedFeedback(root, "");
    renderFixedWordState(root);
    search.focus();
  });

  root.querySelector("[data-wss-fixed-chips]")?.addEventListener("click", (event) => {
    const button = event.target.closest?.("[data-wss-fixed-remove]");
    if (!(button instanceof HTMLButtonElement)) return;
    const slug = button.dataset.wssFixedRemove || "";
    const next = readFixedWordSlugs(root).filter((value) => value !== slug);
    writeFixedWordSlugs(root, next);
    renderFixedWordState(root);
    emitChange();
  });

  renderFixedWordState(root);
}

function addFixedWords(root, rawText, { preferFirstSuggestion = false } = {}) {
  const catalog = Array.isArray(root._wssFixedCatalog) ? root._wssFixedCatalog : [];
  if (!catalog.length) {
    setFixedFeedback(root, "Banque en cours de chargement.");
    return { added:0, missing:[] };
  }
  const tokens = splitFixedWordInput(rawText);
  if (!tokens.length && preferFirstSuggestion) {
    const first = getFixedSuggestions(root, String(rawText || ""))[0];
    if (first) tokens.push(first.word);
  }
  const bySlug = new Map(catalog.map((entry) => [entry.slug, entry]));
  const byWord = new Map(catalog.map((entry) => [normalizeFixedLookup(entry.word), entry]));
  const selected = readFixedWordSlugs(root);
  const selectedSet = new Set(selected);
  const missing = [];
  let added = 0;

  for (const token of tokens) {
    let entry = bySlug.get(normalizeLexicalKey(token)) || byWord.get(normalizeFixedLookup(token));
    if (!entry && preferFirstSuggestion && tokens.length === 1) entry = getFixedSuggestions(root, token)[0];
    if (!entry) {
      missing.push(token);
      continue;
    }
    if (selectedSet.has(entry.slug)) continue;
    selectedSet.add(entry.slug);
    selected.push(entry.slug);
    added += 1;
  }

  writeFixedWordSlugs(root, selected);
  renderFixedWordState(root);
  setFixedFeedback(root, missing.length ? `${missing.length} mot${missing.length > 1 ? "s" : ""} introuvable${missing.length > 1 ? "s" : ""}.` : "");
  return { added, missing };
}

function splitFixedWordInput(value) {
  return String(value || "")
    .split(/[\n\r;,]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function normalizeFixedLookup(value) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("fr-FR")
    .replace(/[’‘ʼ`´]/gu, "'")
    .replace(/\s+/gu, " ");
}

function getFixedSuggestions(root, query) {
  const needle = normalizeFixedLookup(query);
  if (!needle) return [];
  const selected = new Set(readFixedWordSlugs(root));
  return (Array.isArray(root._wssFixedCatalog) ? root._wssFixedCatalog : [])
    .filter((entry) => !selected.has(entry.slug))
    .map((entry) => {
      const haystack = normalizeFixedLookup(entry.word);
      const index = haystack.indexOf(needle);
      return { ...entry, rank:index === 0 ? 0 : (index > 0 ? 1 : 2) };
    })
    .filter((entry) => entry.rank < 2)
    .sort((a, b) => a.rank - b.rank || a.word.length - b.word.length || a.word.localeCompare(b.word, "fr", { sensitivity:"base" }))
    .slice(0, 12);
}

function renderFixedSuggestions(root) {
  const host = root.querySelector("[data-wss-fixed-suggestions]");
  const input = root.querySelector("[data-wss-fixed-search]");
  if (!(host instanceof HTMLElement) || !(input instanceof HTMLInputElement)) return;
  const suggestions = getFixedSuggestions(root, input.value);
  if (!suggestions.length) {
    host.hidden = true;
    host.innerHTML = "";
    return;
  }
  host.innerHTML = suggestions.map((entry) => `
    <button type="button" data-wss-fixed-suggestion="${escapeAttr(entry.slug)}">
      ${escapeHtml(entry.word)}
    </button>
  `).join("");
  host.hidden = false;
}

function hideFixedSuggestions(root) {
  const host = root.querySelector("[data-wss-fixed-suggestions]");
  if (host instanceof HTMLElement) host.hidden = true;
}

function readFixedWordSlugs(root) {
  const input = root.querySelector("[data-wss-fixed-value]");
  if (!(input instanceof HTMLInputElement)) return [];
  return normalizeFixedWordSlugs(String(input.value || "").split("\n"));
}

function writeFixedWordSlugs(root, values) {
  const input = root.querySelector("[data-wss-fixed-value]");
  if (input instanceof HTMLInputElement) input.value = normalizeFixedWordSlugs(values).join("\n");
}

function renderFixedWordState(root) {
  const slugs = readFixedWordSlugs(root);
  const catalog = Array.isArray(root._wssFixedCatalog) ? root._wssFixedCatalog : [];
  const bySlug = new Map(catalog.map((entry) => [entry.slug, entry]));
  const chips = root.querySelector("[data-wss-fixed-chips]");
  if (chips instanceof HTMLElement) {
    chips.innerHTML = slugs.map((slug) => {
      const label = bySlug.get(slug)?.word || slug;
      return `<span class="wss-fixed-chip"><span>${escapeHtml(label)}</span><button type="button" aria-label="Retirer ${escapeAttr(label)}" data-wss-fixed-remove="${escapeAttr(slug)}">×</button></span>`;
    }).join("");
  }
  const count = root.querySelector("[data-wss-fixed-count]");
  if (count instanceof HTMLElement) count.textContent = `${slugs.length} mot${slugs.length > 1 ? "s" : ""} sélectionné${slugs.length > 1 ? "s" : ""}`;
  const clear = root.querySelector("[data-wss-fixed-clear]");
  if (clear instanceof HTMLButtonElement) clear.disabled = slugs.length === 0;
  renderFixedSuggestions(root);
}

function setFixedFeedback(root, message) {
  const host = root.querySelector("[data-wss-fixed-feedback]");
  if (host instanceof HTMLElement) host.textContent = String(message || "");
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

function renderLexicalLevelSelector(settings, idPrefix) {
  const value = normalizeLexicalLevel(settings?.lexicalLevel);
  return `
    <section class="tv-group wss-relevance-group">
      <div class="pts-relevance-selector wss-relevance-selector" role="group" aria-label="Niveau lexical">
        <span class="pts-relevance-selector__title">Niveau lexical</span>
        <div class="pts-relevance-options">
          ${LEXICAL_LEVELS.map((level) => `
            <label class="pts-relevance-option" title="${escapeAttr(level === 1 ? "Mots de niveau lexical 1" : `Mots de niveaux lexicaux 1 à ${level}`)}">
              <input
                type="radio"
                name="${escapeAttr(idPrefix)}_lexicalLevel"
                data-wss-lexical-level="${level}"
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
  root.querySelectorAll("[data-wss-auto-options]").forEach((panel) => {
    if (panel instanceof HTMLElement) panel.hidden = mode === WORD_SELECTION_MODES.FIXED;
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
