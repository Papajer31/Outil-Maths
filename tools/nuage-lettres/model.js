import { getPhonemeTarget, getPhonemeTargets, normalizePhonologyTargetId } from "../../shared/phonology-targets.js";
import { findPhonologyTargetOccurrences } from "../../shared/phonology-target-matcher.js";
import {
  WORD_SELECTION_MODES,
  findGraphemicOccurrences,
  getGraphemicTargets,
  inferWordSelectionMode,
  legacyGraphemicEntriesFromSettings,
  normalizeGraphemicEntries,
  wordContainsAnyGraphemicEntry
} from "../../shared/graphemic-targets.js";
import {
  isPhonologyWordAllowedAtLevel,
  normalizePhonologyRegularityScore,
  normalizePhonologySchoolLevel,
  pickPhonologyWordByRegularity
} from "../../shared/phonology-word-level.js";

export const CLOUD_MODES = Object.freeze({
  FIXED: "fixed",
  DRAGGABLE: "draggable",
  FLOATING: "floating"
});

export const LETTER_COUNT_OPTIONS = Object.freeze(
  Array.from({ length: 11 }, (_, index) => index + 2)
);
export const ALL_TARGET_ID = "all";

const DEFAULT_TARGET_ID = "ou";
const DEFAULT_MIN_LETTERS = 4;
const DEFAULT_MAX_LETTERS = 8;
const DEFAULT_CLOUD_MODE = CLOUD_MODES.FIXED;

let WORD_CATALOG = [];
let ELIGIBLE_CACHE = new Map();

export function getDefaultSettings() {
  const target = getPhonemeTarget(DEFAULT_TARGET_ID);
  return {
    wordSelectionMode:WORD_SELECTION_MODES.PHONEMIC,
    targetId: DEFAULT_TARGET_ID,
    targetIds: [DEFAULT_TARGET_ID],
    enabledSpellings: normalizeSpellings(target?.spellings),
    enabledSpellingsByTarget: { [DEFAULT_TARGET_ID]:normalizeSpellings(target?.spellings) },
    graphemicEntries:[],
    excludedGraphemicEntries:[],
    schoolLevel:"CP",
    minLetters: DEFAULT_MIN_LETTERS,
    maxLetters: DEFAULT_MAX_LETTERS,
    showFirstLetter: false,
    cloudMode: DEFAULT_CLOUD_MODE
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

  const rawTargetIds = Array.isArray(settings?.targetIds) ? settings.targetIds : [settings?.targetId || DEFAULT_TARGET_ID];
  const targetIds = Array.from(new Set(rawTargetIds
    .map((id) => {
      const rawId = String(id || "").trim();
      return rawId === ALL_TARGET_ID ? rawId : normalizePhonologyTargetId(rawId);
    })
    .filter((id) => id === ALL_TARGET_ID || knownTargets.has(id))));
  const normalizedTargetIds = targetIds.includes(ALL_TARGET_ID) || !targetIds.length ? [ALL_TARGET_ID] : targetIds;
  const targetId = normalizedTargetIds.length === 1 && normalizedTargetIds[0] !== ALL_TARGET_ID ? normalizedTargetIds[0] : ALL_TARGET_ID;
  const rawSpellingsByTarget = settings?.enabledSpellingsByTarget && typeof settings.enabledSpellingsByTarget === "object" ? settings.enabledSpellingsByTarget : {};
  const hasLegacySpellings = Object.prototype.hasOwnProperty.call(settings || {}, "enabledSpellings");
  const enabledSpellingsByTarget = Object.fromEntries(normalizedTargetIds.filter((id) => id !== ALL_TARGET_ID).map((id) => {
    const available = normalizeSpellings(getPhonemeTarget(id)?.spellings);
    const requested = Object.prototype.hasOwnProperty.call(rawSpellingsByTarget, id) ? rawSpellingsByTarget[id] : settings?.enabledSpellings;
    const explicit = Object.prototype.hasOwnProperty.call(rawSpellingsByTarget, id) || (normalizedTargetIds.length === 1 && hasLegacySpellings);
    return [id, explicit ? normalizeSpellings(requested).filter((spelling) => available.includes(spelling)) : available];
  }));
  const enabledSpellings = targetId !== ALL_TARGET_ID ? (enabledSpellingsByTarget[targetId] || []) : [];

  let minLetters = normalizeLetterCount(settings?.minLetters, DEFAULT_MIN_LETTERS);
  let maxLetters = normalizeLetterCount(settings?.maxLetters, DEFAULT_MAX_LETTERS);
  if (minLetters > maxLetters) [minLetters, maxLetters] = [maxLetters, minLetters];

  const requestedMode = String(settings?.cloudMode || DEFAULT_CLOUD_MODE).trim();
  const cloudMode = Object.values(CLOUD_MODES).includes(requestedMode)
    ? requestedMode
    : DEFAULT_CLOUD_MODE;

  return {
    wordSelectionMode,
    targetId,
    targetIds:normalizedTargetIds,
    graphemicEntries,
    excludedGraphemicEntries,
    enabledSpellings,
    enabledSpellingsByTarget,
    schoolLevel:normalizePhonologySchoolLevel(settings?.schoolLevel),
    minLetters,
    maxLetters,
    showFirstLetter:settings?.showFirstLetter === true,
    cloudMode
  };
}

export function setWordCatalog(words = []) {
  WORD_CATALOG = normalizeWordCatalog(words);
  ELIGIBLE_CACHE = new Map();
}

export function getWordCatalog() {
  return cloneData(WORD_CATALOG);
}

export function getEligibleWords(settings = {}) {
  const cfg = normalizeSettings(settings);
  const bySlug = new Map();
  getSelectedTargets(cfg).forEach((target) => {
    getEligibleWordsForTarget(cfg, target).forEach((word) => bySlug.set(word.slug, word));
  });
  return [...bySlug.values()];
}

function getEligibleWordsForTarget(cfg, target) {
  if (!target) return [];
  const enabledSpellings = getEnabledSpellingsForTarget(cfg, target);
  const cacheKey = [
    target.id,
    enabledSpellings.join("|"),
    cfg.minLetters,
    cfg.maxLetters,
    cfg.schoolLevel,
    target.kind === "graphemic" ? `exclude:${cfg.excludedGraphemicEntries.join("|")}` : ""
  ].join("::");
  if (ELIGIBLE_CACHE.has(cacheKey)) return cloneData(ELIGIBLE_CACHE.get(cacheKey));

  const words = WORD_CATALOG
    .filter((entry) => isPhonologyWordAllowedAtLevel(entry, cfg.schoolLevel))
    .filter((entry) => isLettersOnly(entry.word))
    .filter((entry) => target.kind !== "graphemic"
      || !wordContainsAnyGraphemicEntry(entry.word, cfg.excludedGraphemicEntries))
    .map((entry) => ({
      ...entry,
      letters:splitWordLetters(entry.word),
      occurrences:target.kind === "graphemic"
        ? findGraphemicOccurrences(entry.word, target.grapheme)
        : findPhonologyTargetOccurrences(entry.units, target)
    }))
    .filter((entry) => entry.occurrences.length > 0)
    .filter((entry) => entry.letters.length >= cfg.minLetters && entry.letters.length <= cfg.maxLetters)
    .filter((entry) => target.kind === "graphemic" || targetOccurrencesUseAllowedSpellings(entry.occurrences, enabledSpellings))
    .map(({ occurrences, ...entry }) => ({
      ...entry,
      targetSpellings:Array.from(new Set(occurrences.map((occurrence) => occurrence.spelling).filter(Boolean)))
    }));

  ELIGIBLE_CACHE.set(cacheKey, words);
  return cloneData(words);
}


export function getPhonemicSpellingUsage(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.wordSelectionMode !== WORD_SELECTION_MODES.PHONEMIC) return {};

  const usageByTarget = {};
  const targets = cfg.targetIds.includes(ALL_TARGET_ID)
    ? getPhonemeTargets()
    : cfg.targetIds.map(getPhonemeTarget).filter(Boolean);

  for (const target of targets) {
    usageByTarget[target.id] = buildSpellingUsage(target, getEligibleWordsForTarget(cfg, target));
  }
  return usageByTarget;
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

export function getEligibleWordCount(settings = {}) {
  return getEligibleWords(settings).length;
}

export function getEligibleTargetCount(settings = {}) {
  const cfg = normalizeSettings(settings);
  return getSelectedTargets(cfg).filter((target) => getEligibleWordsForTarget(cfg, target).length > 0).length;
}

export function canGenerateQuestion(settings = {}) {
  return getEligibleWordCount(settings) > 0;
}

export function pickQuestion(settings = {}, {
  avoidKey = "",
  usedWordSlugs = null
} = {}) {
  const cfg = normalizeSettings(settings);
  const previousTargetId = String(avoidKey || "").split("::")[0];
  const viable = getSelectedTargets(cfg).filter((target) => getEligibleWordsForTarget(cfg, target).length);
  const choices = viable.filter((target) => target.id !== previousTargetId);
  const target = randomChoice(choices.length ? choices : viable);
  if (!target) return null;
  const pool = getEligibleWordsForTarget(cfg, target);
  if (!pool.length) return null;

  const used = usedWordSlugs instanceof Set ? usedWordSlugs : new Set();
  const unused = pool.filter((word) => !used.has(word.slug));
  let candidates = unused.length ? unused : pool;
  if (avoidKey && candidates.length > 1) {
    const withoutPrevious = candidates.filter((word) => buildQuestionKey(target.id, word.slug) !== avoidKey);
    if (withoutPrevious.length) candidates = withoutPrevious;
  }

  const chosen = pickPhonologyWordByRegularity(candidates);
  if (!chosen) return null;

  const letters = chosen.letters.map((text, originalIndex) => ({
    id: `letter-${originalIndex}`,
    text,
    originalIndex
  }));
  const expectedLetterIds = letters.map((letter) => letter.id);
  const shuffledLetterIds = shuffleUntilDifferent(expectedLetterIds, letters);

  return {
    key: buildQuestionKey(target.id, chosen.slug),
    target,
    prompt: buildPrompt(target),
    slug: chosen.slug,
    word: chosen.word,
    letters,
    expectedLetterIds,
    shuffledLetterIds,
    characterCount: letters.length
  };
}

function getSelectedTargets(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) return getGraphemicTargets(cfg.graphemicEntries);
  return cfg.targetIds.includes(ALL_TARGET_ID) ? getPhonemeTargets() : cfg.targetIds.map(getPhonemeTarget).filter(Boolean);
}

function getEnabledSpellingsForTarget(settings, target) {
  const cfg = normalizeSettings(settings);
  if (target?.kind === "graphemic") return target.spellings || [];
  return cfg.targetIds.includes(ALL_TARGET_ID) ? target.spellings : (cfg.enabledSpellingsByTarget[target.id] || target.spellings);
}

export function questionKey(question) {
  return String(question?.key || "");
}

export function buildPrompt(targetOrSettings = {}) {
  return "Clique sur les lettres dans l’ordre pour former un mot.";
}

export function evaluateAnswer(question, answerIds = []) {
  const letterById = new Map((Array.isArray(question?.letters) ? question.letters : [])
    .map((letter) => [String(letter?.id || ""), String(letter?.text || "")]));
  const normalizedIds = normalizeAnswerIds(question, answerIds);
  const studentWord = normalizedIds.map((id) => letterById.get(id) || "").join("");
  const expectedWord = String(question?.word || "").normalize("NFC");

  return {
    isCorrect: studentWord.normalize("NFC").toLocaleLowerCase("fr-FR")
      === expectedWord.toLocaleLowerCase("fr-FR"),
    studentWord,
    expectedWord,
    answerIds: normalizedIds
  };
}

export function normalizeAnswerIds(question, answerIds = []) {
  const allowed = new Set((Array.isArray(question?.letters) ? question.letters : [])
    .map((letter) => String(letter?.id || ""))
    .filter(Boolean));
  const seen = new Set();
  const normalized = [];

  for (const value of Array.isArray(answerIds) ? answerIds : []) {
    const id = String(value || "").trim();
    if (!allowed.has(id) || seen.has(id)) continue;
    seen.add(id);
    normalized.push(id);
  }

  return normalized;
}

export function splitWordLetters(word) {
  const text = String(word || "").normalize("NFC");
  if (typeof Intl?.Segmenter === "function") {
    const segmenter = new Intl.Segmenter("fr", { granularity: "grapheme" });
    return [...segmenter.segment(text)].map((entry) => entry.segment);
  }
  return Array.from(text);
}

function normalizeWordCatalog(words) {
  return (Array.isArray(words) ? words : [])
    .map((word) => ({
      slug: String(word?.slug || "").trim().toLocaleLowerCase("fr-FR"),
      word: String(word?.word || "").trim().normalize("NFC"),
      schoolLevel:normalizePhonologySchoolLevel(word?.schoolLevel, { allowX:true, fallback:"X" }),
      regularityScore:normalizePhonologyRegularityScore(word?.regularityScore),
      units: (Array.isArray(word?.units) ? word.units : [])
        .map((unit) => ({
          graph: String(unit?.graph || "").trim(),
          text: String(unit?.text || "").trim().normalize("NFC"),
          isSilent: unit?.isSilent === true
        }))
        .filter((unit) => unit.graph)
    }))
    .filter((word) => word.slug && word.word && word.units.length > 0);
}

function targetOccurrencesUseAllowedSpellings(occurrences, enabledSpellings) {
  const allowed = new Set(normalizeSpellings(enabledSpellings));
  return allowed.size > 0 && occurrences.every((occurrence) => allowed.has(occurrence.spelling));
}

function normalizeSpellings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map(normalizeSpelling)
    .filter(Boolean)));
}

function normalizeSpelling(value) {
  return String(value || "").trim().normalize("NFC").toLocaleLowerCase("fr-FR");
}

function normalizeLetterCount(value, fallback) {
  const rounded = Math.round(Number(value));
  return LETTER_COUNT_OPTIONS.includes(rounded) ? rounded : fallback;
}

function isLettersOnly(word) {
  return /^\p{L}+$/u.test(String(word || "").normalize("NFC"));
}

function buildQuestionKey(targetId, slug) {
  return `${String(targetId || "").trim()}::${String(slug || "").trim()}`;
}

function shuffleUntilDifferent(ids, letters) {
  const expectedText = ids.map((id) => letters.find((letter) => letter.id === id)?.text || "").join("");
  let shuffled = [...ids];

  for (let attempt = 0; attempt < 30; attempt += 1) {
    shuffled = shuffleArray(ids);
    const shuffledText = shuffled.map((id) => letters.find((letter) => letter.id === id)?.text || "").join("");
    if (shuffledText !== expectedText) return shuffled;
  }

  if (ids.length > 1) return [...ids.slice(1), ids[0]];
  return shuffled;
}

function shuffleArray(values) {
  const copy = [...values];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function randomChoice(values) {
  return values[Math.floor(Math.random() * values.length)] || null;
}

function cloneData(value) {
  if (typeof structuredClone === "function") return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
