import { getPhonemeTarget, getPhonemeTargets, normalizePhonologyTargetId } from "../../shared/phonology-targets.js";
import { findPhonologyTargetOccurrences } from "../../shared/phonology-target-matcher.js";
import {
  isPhonologyRelevanceCategoryAllowed,
  normalizePhonologyRelevanceLevel,
  pickPhonologyRelevanceCategory,
  scorePhonologyWord,
  scoreGraphemicWord
} from "../../shared/phonology-word-relevance.js";
import {
  WORD_SELECTION_MODES,
  getGraphemicTargets,
  inferWordSelectionMode,
  legacyGraphemicEntriesFromSettings,
  normalizeGraphemicEntries,
  wordContainsAnyGraphemicEntry
} from "../../shared/graphemic-targets.js";

export const ROW_COUNT_OPTIONS = Object.freeze([1, 2, 3, 4, 5]);
export const ALL_TARGET_ID = "all";

const DEFAULT_TARGET_ID = "ou";
const DEFAULT_ROW_COUNT = 3;
const MIN_COLUMN_COUNT = 8;
const EXTRA_COLUMNS = 4;
const FILLER_ALPHABET = Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZEEEEAAAAIIIIOOONNRRSTTLUCDMPBVFGHJQXYZÉÈÀÇ");

let WORD_CATALOG = [];
let WORD_LEXICON = new Set();
let PLAYABLE_WORDS_BY_TARGET = new Map();

export function getDefaultSettings() {
  const target = getPhonemeTarget(DEFAULT_TARGET_ID);
  return {
    wordSelectionMode:WORD_SELECTION_MODES.PHONEMIC,
    targetId:DEFAULT_TARGET_ID,
    targetIds:[DEFAULT_TARGET_ID],
    enabledSpellings:normalizeSpellings(target?.spellings),
    enabledSpellingsByTarget:{ [DEFAULT_TARGET_ID]:normalizeSpellings(target?.spellings) },
    graphemicEntries:[],
    excludedGraphemicEntries:[],
    relevanceLevel:"normal",
    rowCount:DEFAULT_ROW_COUNT
  };
}

export function normalizeSettings(settings = {}) {
  const knownTargets = new Set(getPhonemeTargets().map((target) => target.id));
  const wordSelectionMode = inferWordSelectionMode(settings, knownTargets);
  const explicitGraphemicEntries = normalizeGraphemicEntries(settings?.graphemicEntries || settings?.graphemes || []);
  const graphemicEntries = wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC
    ? (explicitGraphemicEntries.length ? explicitGraphemicEntries : legacyGraphemicEntriesFromSettings(settings))
    : explicitGraphemicEntries;
  const excludedGraphemicEntries = normalizeGraphemicEntries(
    settings?.excludedGraphemicEntries || settings?.graphemicExcludedEntries || settings?.graphemicExclusions || []
  );

  const rawTargetIds = Array.isArray(settings?.targetIds)
    ? settings.targetIds
    : [settings?.targetId || DEFAULT_TARGET_ID];
  const targetIds = Array.from(new Set(rawTargetIds
    .map((id) => {
      const rawId = String(id || "").trim();
      return rawId === ALL_TARGET_ID ? rawId : normalizePhonologyTargetId(rawId);
    })
    .filter((id) => id === ALL_TARGET_ID || knownTargets.has(id))));
  const normalizedTargetIds = targetIds.includes(ALL_TARGET_ID) || !targetIds.length
    ? [ALL_TARGET_ID]
    : targetIds;
  const targetId = normalizedTargetIds.length === 1 && normalizedTargetIds[0] !== ALL_TARGET_ID
    ? normalizedTargetIds[0]
    : ALL_TARGET_ID;

  const rawSpellingsByTarget = settings?.enabledSpellingsByTarget && typeof settings.enabledSpellingsByTarget === "object"
    ? settings.enabledSpellingsByTarget
    : {};
  const hasLegacySpellings = Object.prototype.hasOwnProperty.call(settings || {}, "enabledSpellings");
  const enabledSpellingsByTarget = Object.fromEntries(normalizedTargetIds
    .filter((id) => id !== ALL_TARGET_ID)
    .map((id) => {
      const available = normalizeSpellings(getPhonemeTarget(id)?.spellings);
      const explicit = Object.prototype.hasOwnProperty.call(rawSpellingsByTarget, id)
        || (normalizedTargetIds.length === 1 && hasLegacySpellings);
      const requested = Object.prototype.hasOwnProperty.call(rawSpellingsByTarget, id)
        ? rawSpellingsByTarget[id]
        : settings?.enabledSpellings;
      return [id, explicit
        ? normalizeSpellings(requested).filter((spelling) => available.includes(spelling))
        : available];
    }));
  const enabledSpellings = targetId !== ALL_TARGET_ID
    ? (enabledSpellingsByTarget[targetId] || [])
    : [];

  const requestedRows = Math.round(Number(settings?.rowCount ?? settings?.gridRows));
  const rowCount = ROW_COUNT_OPTIONS.includes(requestedRows) ? requestedRows : DEFAULT_ROW_COUNT;

  return {
    wordSelectionMode,
    targetId,
    targetIds:normalizedTargetIds,
    enabledSpellings,
    enabledSpellingsByTarget,
    graphemicEntries,
    excludedGraphemicEntries,
    relevanceLevel:normalizePhonologyRelevanceLevel(settings?.relevanceLevel),
    rowCount
  };
}

export function setWordCatalog(words = []) {
  WORD_CATALOG = normalizeWordCatalog(words);
  WORD_LEXICON = new Set(WORD_CATALOG
    .filter((entry) => isLettersOnly(entry.word))
    .map((entry) => normalizeLexicalWord(entry.word))
    .filter(Boolean));
  PLAYABLE_WORDS_BY_TARGET = new Map();
}

export function getEligibleWords(settings = {}) {
  const cfg = normalizeSettings(settings);
  const bySlug = new Map();
  for (const target of getSelectedTargets(cfg)) {
    const spellings = getEnabledSpellingsForTarget(cfg, target);
    for (const word of getPlayableWordsForTarget(target, spellings, cfg.relevanceLevel, cfg.excludedGraphemicEntries)) {
      if (!bySlug.has(word.slug)) bySlug.set(word.slug, word);
    }
  }
  return [...bySlug.values()];
}

export function getEligibleWordCount(settings = {}) {
  return getEligibleWords(settings).length;
}

export function getEligibleTargetCount(settings = {}) {
  return getViableTargets(normalizeSettings(settings)).length;
}

export function canGenerateQuestion(settings = {}) {
  return getEligibleTargetCount(settings) > 0;
}

export function getPhonemicSpellingUsage(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.wordSelectionMode !== WORD_SELECTION_MODES.PHONEMIC) return {};

  const usageByTarget = {};
  const targets = cfg.targetIds.includes(ALL_TARGET_ID)
    ? getPhonemeTargets()
    : cfg.targetIds.map(getPhonemeTarget).filter(Boolean);

  for (const target of targets) {
    const enabledSpellings = getEnabledSpellingsForTarget(cfg, target);
    const pool = getPlayableWordsForTarget(target, enabledSpellings, cfg.relevanceLevel, []);
    usageByTarget[target.id] = buildSpellingUsage(target, pool);
  }
  return usageByTarget;
}

export function pickQuestion(settings = {}, {
  avoidKey = "",
  usedWordSlugs = null
} = {}) {
  const cfg = normalizeSettings(settings);
  const viableTargets = getViableTargets(cfg);
  if (!viableTargets.length) return null;

  const previousTargetId = String(avoidKey || "").split("::", 1)[0].trim();
  const targetChoices = viableTargets.length > 1
    ? viableTargets.filter((target) => target.id !== previousTargetId)
    : viableTargets;
  const target = randomChoice(targetChoices.length ? targetChoices : viableTargets);
  if (!target) return null;

  const enabledSpellings = getEnabledSpellingsForTarget(cfg, target);
  const pool = getPlayableWordsForTarget(target, enabledSpellings, cfg.relevanceLevel, cfg.excludedGraphemicEntries);
  if (!pool.length) return null;

  const used = usedWordSlugs instanceof Set ? usedWordSlugs : new Set();
  const unused = pool.filter((word) => !used.has(word.slug));
  let source = unused.length ? unused : pool;
  if (avoidKey && source.length > 1) {
    const withoutPrevious = source.filter((word) => buildQuestionKey(target.id, word.slug) !== avoidKey);
    if (withoutPrevious.length) source = withoutPrevious;
  }

  const chosen = pickWeightedWord(source, cfg.relevanceLevel);
  if (!chosen) return null;
  const grid = buildLetterGrid(chosen.word, cfg.rowCount);

  return {
    key:buildQuestionKey(target.id, chosen.slug),
    target,
    prompt:buildPrompt(target),
    slug:chosen.slug,
    word:chosen.word,
    rowCount:grid.rowCount,
    columnCount:grid.columnCount,
    orientation:grid.orientation,
    cells:grid.cells,
    expectedIndices:grid.expectedIndices,
    characterCount:splitWordLetters(chosen.word).length
  };
}

export function questionKey(question) {
  return String(question?.key || "");
}

export function buildPrompt(target = {}) {
  const text = String(target?.bubbleText || target?.grapheme || "").trim();
  if (target?.kind === "graphemic" && text) {
    return `Retrouve le mot caché qui contient « ${text} ».`;
  }
  if (text) return `Retrouve le mot caché qui contient le son « ${text} ».`;
  return "Retrouve le mot caché dans la grille.";
}

export function normalizeSelection(question, indices = []) {
  const max = Array.isArray(question?.cells) ? question.cells.length : 0;
  const seen = new Set();
  const normalized = [];
  for (const value of Array.isArray(indices) ? indices : []) {
    const index = Math.trunc(Number(value));
    if (!Number.isInteger(index) || index < 0 || index >= max || seen.has(index)) continue;
    seen.add(index);
    normalized.push(index);
  }
  return normalized;
}

export function evaluateSelection(question, indices = []) {
  const selected = normalizeSelection(question, indices);
  const expected = normalizeSelection(question, question?.expectedIndices || []);
  const selectedSet = new Set(selected);
  const expectedSet = new Set(expected);
  const isCorrect = selected.length === expected.length
    && selected.every((index) => expectedSet.has(index));
  return {
    isCorrect,
    selectedIndices:selected,
    expectedIndices:expected,
    correctSelectedIndices:selected.filter((index) => expectedSet.has(index)),
    incorrectSelectedIndices:selected.filter((index) => !expectedSet.has(index)),
    missedIndices:expected.filter((index) => !selectedSet.has(index))
  };
}

export function buildSelectionPath(startIndex, endIndex, rowCount, columnCount, axis = null) {
  const rows = Math.max(1, Math.trunc(Number(rowCount)) || 1);
  const cols = Math.max(1, Math.trunc(Number(columnCount)) || 1);
  const total = rows * cols;
  const start = Math.max(0, Math.min(total - 1, Math.trunc(Number(startIndex)) || 0));
  const end = Math.max(0, Math.min(total - 1, Math.trunc(Number(endIndex)) || 0));
  const startRow = Math.floor(start / cols);
  const startCol = start % cols;
  const endRow = Math.floor(end / cols);
  const endCol = end % cols;
  const rowDelta = endRow - startRow;
  const colDelta = endCol - startCol;
  const chosenAxis = axis === "vertical" || axis === "horizontal"
    ? axis
    : Math.abs(colDelta) >= Math.abs(rowDelta) ? "horizontal" : "vertical";

  const path = [];
  if (chosenAxis === "vertical") {
    const step = endRow >= startRow ? 1 : -1;
    for (let row = startRow; ; row += step) {
      path.push(row * cols + startCol);
      if (row === endRow) break;
    }
  } else {
    const step = endCol >= startCol ? 1 : -1;
    for (let col = startCol; ; col += step) {
      path.push(startRow * cols + col);
      if (col === endCol) break;
    }
  }
  return { axis:chosenAxis, indices:path };
}

export function splitWordLetters(word) {
  const text = String(word || "").normalize("NFC");
  if (typeof Intl?.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("fr", { granularity:"grapheme" });
    return [...segmenter.segment(text)].map((entry) => entry.segment);
  }
  return Array.from(text);
}

function getViableTargets(cfg) {
  return getSelectedTargets(cfg)
    .filter((target) => !!target)
    .filter((target) => getPlayableWordsForTarget(
      target,
      getEnabledSpellingsForTarget(cfg, target),
      cfg.relevanceLevel,
      cfg.excludedGraphemicEntries
    ).length > 0);
}

function getSelectedTargets(cfg) {
  if (cfg.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) {
    return getGraphemicTargets(cfg.graphemicEntries);
  }
  if (cfg.targetIds.includes(ALL_TARGET_ID)) return getPhonemeTargets();
  return cfg.targetIds.map(getPhonemeTarget).filter(Boolean);
}

function getEnabledSpellingsForTarget(cfg, target) {
  if (target?.kind === "graphemic") return target.spellings || [];
  if (cfg.targetIds.includes(ALL_TARGET_ID)) return target.spellings || [];
  return cfg.enabledSpellingsByTarget[target.id] || target.spellings || [];
}

function getPlayableWordsForTarget(target, enabledSpellings = null, relevanceLevel = "normal", excludedGraphemicEntries = []) {
  const targetId = String(target?.id || "").trim();
  if (!targetId) return [];
  const spellings = enabledSpellings === null ? normalizeSpellings(target?.spellings) : normalizeSpellings(enabledSpellings);
  const level = normalizePhonologyRelevanceLevel(relevanceLevel);
  const exclusions = target?.kind === "graphemic" ? normalizeGraphemicEntries(excludedGraphemicEntries) : [];
  const cacheKey = `${target?.kind || "phonemic"}::${targetId}::${spellings.join("|")}::${level}::exclude:${exclusions.join("|")}`;
  if (PLAYABLE_WORDS_BY_TARGET.has(cacheKey)) return PLAYABLE_WORDS_BY_TARGET.get(cacheKey);

  const words = WORD_CATALOG
    .filter((entry) => isLettersOnly(entry.word))
    .map((entry) => target?.kind === "graphemic"
      ? buildGraphemicPlayableWord(entry, target, level, exclusions)
      : buildPhonemicPlayableWord(entry, target, spellings, level))
    .filter(Boolean);
  PLAYABLE_WORDS_BY_TARGET.set(cacheKey, words);
  return words;
}

function buildPhonemicPlayableWord(entry, target, enabledSpellings, relevanceLevel) {
  const relevance = scorePhonologyWord(entry, target, {
    enabledSpellings,
    requireAllOccurrencesAllowed:true
  });
  if (!relevance.compatible || !isPhonologyRelevanceCategoryAllowed(relevance.category, relevanceLevel)) return null;
  const occurrences = findPhonologyTargetOccurrences(entry.units, target);
  const targetSpellings = Array.from(new Set(occurrences.map((occurrence) => occurrence.spelling).filter(Boolean)));
  return {
    slug:entry.slug,
    word:entry.word,
    targetSpellings,
    relevanceScore:relevance.score,
    relevanceCategory:relevance.category
  };
}

function buildGraphemicPlayableWord(entry, target, relevanceLevel, exclusions) {
  if (wordContainsAnyGraphemicEntry(entry.word, exclusions)) return null;
  const relevance = scoreGraphemicWord(entry, target);
  if (!relevance.compatible || !isPhonologyRelevanceCategoryAllowed(relevance.category, relevanceLevel)) return null;
  return {
    slug:entry.slug,
    word:entry.word,
    targetSpellings:[target.grapheme],
    relevanceScore:relevance.score,
    relevanceCategory:relevance.category
  };
}

function pickWeightedWord(pool, relevanceLevel) {
  const source = Array.isArray(pool) ? pool : [];
  if (!source.length) return null;
  const categories = Array.from(new Set(source.map((word) => word.relevanceCategory).filter(Boolean)));
  const category = pickPhonologyRelevanceCategory(categories, relevanceLevel);
  const candidates = category ? source.filter((word) => word.relevanceCategory === category) : source;
  return randomChoice(candidates.length ? candidates : source);
}

function buildSpellingUsage(target, words) {
  const spellings = normalizeSpellings(target?.spellings);
  const allowed = new Set(spellings);
  const counts = Object.fromEntries(spellings.map((spelling) => [spelling, 0]));
  for (const word of Array.isArray(words) ? words : []) {
    const present = new Set(normalizeSpellings(word?.targetSpellings));
    for (const spelling of present) {
      if (allowed.has(spelling)) counts[spelling] += 1;
    }
  }
  return { totalWords:Array.isArray(words) ? words.length : 0, counts };
}

function buildLetterGrid(word, requestedRowCount) {
  const letters = splitWordLetters(word).map((letter) => letter.toLocaleUpperCase("fr-FR"));
  const rowCount = ROW_COUNT_OPTIONS.includes(requestedRowCount) ? requestedRowCount : DEFAULT_ROW_COUNT;
  const columnCount = Math.max(MIN_COLUMN_COUNT, letters.length + EXTRA_COLUMNS);
  const canBeVertical = rowCount > 1 && letters.length <= rowCount;
  const orientation = canBeVertical && Math.random() < 0.5 ? "vertical" : "horizontal";
  const startRow = orientation === "vertical"
    ? randomInt(0, rowCount - letters.length)
    : randomInt(0, rowCount - 1);
  const startCol = orientation === "horizontal"
    ? randomInt(0, columnCount - letters.length)
    : randomInt(0, columnCount - 1);
  const expectedIndices = letters.map((_, offset) => orientation === "horizontal"
    ? startRow * columnCount + startCol + offset
    : (startRow + offset) * columnCount + startCol);
  const expectedSet = new Set(expectedIndices);

  let characters = [];
  for (let attempt = 0; attempt < 80; attempt += 1) {
    characters = Array.from({ length:rowCount * columnCount }, () => randomFiller(letters));
    letters.forEach((letter, offset) => {
      characters[expectedIndices[offset]] = letter;
    });
    const hasSingleTargetOccurrence = countForwardOccurrences(characters, letters, rowCount, columnCount) === 1;
    const createsLongerKnownWord = hasLexicalExtensionAtTarget(
      characters,
      letters.length,
      expectedIndices,
      orientation,
      rowCount,
      columnCount
    );
    if (hasSingleTargetOccurrence && !createsLongerKnownWord) break;
  }

  const cells = characters.map((text, index) => ({
    id:`cell-${index}`,
    index,
    row:Math.floor(index / columnCount),
    column:index % columnCount,
    text,
    isTarget:expectedSet.has(index)
  }));

  return { rowCount, columnCount, orientation, cells, expectedIndices };
}

function hasLexicalExtensionAtTarget(characters, targetLength, expectedIndices, orientation, rows, cols) {
  if (!(WORD_LEXICON instanceof Set) || !WORD_LEXICON.size || !expectedIndices.length) return false;

  const targetStart = expectedIndices[0];
  const targetRow = Math.floor(targetStart / cols);
  const targetCol = targetStart % cols;
  const line = orientation === "vertical"
    ? Array.from({ length:rows }, (_, row) => characters[row * cols + targetCol])
    : Array.from({ length:cols }, (_, col) => characters[targetRow * cols + col]);
  const targetAxisStart = orientation === "vertical" ? targetRow : targetCol;
  const targetAxisEnd = targetAxisStart + targetLength - 1;

  // Test only the contiguous strings that actually contain the hidden word.
  // The line is tiny (<= grid width, or <= 5 vertically), so this avoids any
  // scan of the full 4,714-word catalog during question generation.
  for (let start = 0; start <= targetAxisStart; start += 1) {
    for (let end = targetAxisEnd; end < line.length; end += 1) {
      const length = end - start + 1;
      if (length <= targetLength) continue;
      const candidate = line.slice(start, end + 1).join("");
      if (WORD_LEXICON.has(candidate)) return true;
    }
  }
  return false;
}

function normalizeLexicalWord(word) {
  return splitWordLetters(word)
    .map((letter) => letter.toLocaleUpperCase("fr-FR"))
    .join("");
}

function countForwardOccurrences(characters, needle, rows, cols) {
  if (!needle.length) return 0;
  if (needle.length === 1) return characters.filter((letter) => letter === needle[0]).length;
  let count = 0;
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col <= cols - needle.length; col += 1) {
      let matches = true;
      for (let offset = 0; offset < needle.length; offset += 1) {
        if (characters[row * cols + col + offset] !== needle[offset]) {
          matches = false;
          break;
        }
      }
      if (matches) count += 1;
    }
  }
  if (needle.length <= rows) {
    for (let col = 0; col < cols; col += 1) {
      for (let row = 0; row <= rows - needle.length; row += 1) {
        let matches = true;
        for (let offset = 0; offset < needle.length; offset += 1) {
          if (characters[(row + offset) * cols + col] !== needle[offset]) {
            matches = false;
            break;
          }
        }
        if (matches) count += 1;
      }
    }
  }
  return count;
}

function randomFiller(targetLetters) {
  if (targetLetters.length === 1) {
    const forbidden = targetLetters[0];
    const candidates = FILLER_ALPHABET.filter((letter) => letter !== forbidden);
    return randomChoice(candidates) || "A";
  }
  return randomChoice(FILLER_ALPHABET) || "A";
}

function normalizeWordCatalog(words) {
  return (Array.isArray(words) ? words : [])
    .map((word) => ({
      slug:String(word?.slug || "").trim().toLocaleLowerCase("fr-FR"),
      word:String(word?.word || "").trim().normalize("NFC"),
      units:(Array.isArray(word?.units) ? word.units : [])
        .map((unit) => ({
          graph:String(unit?.graph || "").trim(),
          text:String(unit?.text || "").trim().normalize("NFC"),
          isSilent:unit?.isSilent === true
        }))
        .filter((unit) => unit.graph),
      syllables:(Array.isArray(word?.syllables) ? word.syllables : [])
        .map((syllable) => String(syllable || "").trim().normalize("NFC"))
        .filter(Boolean),
      familiarity:Number.isFinite(Number(word?.familiarity))
        ? Math.max(0, Math.min(100, Math.round(Number(word.familiarity))))
        : 50
    }))
    .filter((word) => word.slug && word.word && word.units.length > 0);
}

function buildQuestionKey(targetId, slug) {
  return `${String(targetId || "").trim()}::${String(slug || "").trim()}`;
}

function normalizeSpellings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim().normalize("NFC").toLocaleLowerCase("fr-FR"))
    .filter(Boolean)));
}

function isLettersOnly(word) {
  return /^\p{L}+$/u.test(String(word || "").normalize("NFC"));
}

function randomInt(min, max) {
  const low = Math.ceil(Number(min) || 0);
  const high = Math.floor(Number(max) || 0);
  if (high <= low) return low;
  return low + Math.floor(Math.random() * (high - low + 1));
}

function randomChoice(values) {
  return Array.isArray(values) && values.length ? values[Math.floor(Math.random() * values.length)] : null;
}
