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

export const WORD_COUNT_OPTIONS = Object.freeze([2, 3, 4, 5, 6]);
export const ALL_TARGET_ID = "all";

const DEFAULT_TARGET_ID = "ou";
const DEFAULT_WORD_COUNT = 4;

let WORD_CATALOG = [];
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
    wordCount:DEFAULT_WORD_COUNT
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

  const requestedCount = Math.round(Number(settings?.wordCount));
  const wordCount = WORD_COUNT_OPTIONS.includes(requestedCount) ? requestedCount : DEFAULT_WORD_COUNT;

  return {
    wordSelectionMode,
    targetId,
    targetIds:normalizedTargetIds,
    enabledSpellings,
    enabledSpellingsByTarget,
    graphemicEntries,
    excludedGraphemicEntries,
    relevanceLevel:normalizePhonologyRelevanceLevel(settings?.relevanceLevel),
    wordCount
  };
}

export function setWordCatalog(words = []) {
  WORD_CATALOG = normalizeWordCatalog(words);
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
  if (pool.length < cfg.wordCount) return null;

  const used = usedWordSlugs instanceof Set ? usedWordSlugs : new Set();
  const unused = pool.filter((word) => !used.has(word.slug));
  const source = unused.length >= cfg.wordCount ? unused : pool;
  let selected = pickWeightedWords(source, cfg.wordCount, cfg.relevanceLevel);
  if (selected.length < cfg.wordCount) return null;

  let key = buildQuestionKey(target.id, selected);
  if (avoidKey && key === avoidKey && pool.length > cfg.wordCount) {
    const outside = pool.filter((word) => !selected.some((chosen) => chosen.slug === word.slug));
    const replacement = pickWeightedWords(outside, 1, cfg.relevanceLevel)[0];
    if (replacement) selected[selected.length - 1] = replacement;
    key = buildQuestionKey(target.id, selected);
  }

  // L'ordre est volontairement aléatoire : l'élève doit segmenter une chaîne,
  // pas retrouver un classement alphabétique ou un patron récurrent.
  selected = shuffleArray(selected);
  const words = selected.map((word) => ({ ...word }));
  const wordLetterCounts = words.map((word) => splitWordLetters(word.word).length);
  const letters = splitWordLetters(words.map((word) => word.word).join(""));
  const expectedCutPositions = [];
  let cursor = 0;
  for (let index = 0; index < wordLetterCounts.length - 1; index += 1) {
    cursor += wordLetterCounts[index];
    expectedCutPositions.push(cursor);
  }

  return {
    key,
    target,
    prompt:`Découpe cette suite de lettres en ${cfg.wordCount} mots.`,
    words,
    letters,
    text:letters.join(""),
    expectedCutPositions,
    requiredCutCount:Math.max(0, cfg.wordCount - 1)
  };
}

export function questionKey(question) {
  return String(question?.key || "");
}

export function normalizeCutPositions(question, positions = []) {
  const max = Math.max(0, (Array.isArray(question?.letters) ? question.letters.length : 0) - 1);
  return Array.from(new Set((Array.isArray(positions) ? positions : [])
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => Number.isInteger(value) && value >= 1 && value <= max)))
    .sort((a, b) => a - b);
}

export function evaluateCuts(question, positions = []) {
  const expected = new Set(normalizeCutPositions(question, question?.expectedCutPositions || []));
  const selected = new Set(normalizeCutPositions(question, positions));
  const missed = [...expected].filter((position) => !selected.has(position));
  const incorrect = [...selected].filter((position) => !expected.has(position));
  const correct = [...selected].filter((position) => expected.has(position));
  return {
    isCorrect:missed.length === 0 && incorrect.length === 0,
    expectedPositions:[...expected].sort((a, b) => a - b),
    selectedPositions:[...selected].sort((a, b) => a - b),
    correctPositions:correct.sort((a, b) => a - b),
    missedPositions:missed.sort((a, b) => a - b),
    incorrectPositions:incorrect.sort((a, b) => a - b)
  };
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
    ).length >= cfg.wordCount);
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
    syllables:[...entry.syllables],
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
    syllables:[...entry.syllables],
    targetSpellings:[target.grapheme],
    relevanceScore:relevance.score,
    relevanceCategory:relevance.category
  };
}

function pickWeightedWords(pool, count, relevanceLevel) {
  const remaining = shuffleArray(pool);
  const selected = [];
  while (selected.length < count && remaining.length) {
    const categories = Array.from(new Set(remaining.map((word) => word.relevanceCategory).filter(Boolean)));
    const category = pickPhonologyRelevanceCategory(categories, relevanceLevel);
    if (!category) break;
    const candidates = remaining.filter((word) => word.relevanceCategory === category);
    const chosen = randomChoice(candidates);
    if (!chosen) break;
    selected.push(chosen);
    const index = remaining.findIndex((word) => word.slug === chosen.slug);
    if (index >= 0) remaining.splice(index, 1);
  }
  return selected;
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

function buildQuestionKey(targetId, words) {
  return `${String(targetId || "").trim()}::${words.map((word) => word.slug).sort().join("|")}`;
}

function normalizeSpellings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim().normalize("NFC").toLocaleLowerCase("fr-FR"))
    .filter(Boolean)));
}

function isLettersOnly(word) {
  return /^\p{L}+$/u.test(String(word || "").normalize("NFC"));
}

function randomChoice(values) {
  return Array.isArray(values) && values.length ? values[Math.floor(Math.random() * values.length)] : null;
}

function shuffleArray(values) {
  const copy = [...(Array.isArray(values) ? values : [])];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
