import { PHONOLOGY_GRAPH_BY_ID } from "../../shared/phonology-graph-data.js";
import { getPhonemeTarget, getPhonemeTargets } from "../reperage-graphemes/phonemes-data.js";

export const CLOUD_MODES = Object.freeze({
  FIXED: "fixed",
  DRAGGABLE: "draggable",
  FLOATING: "floating"
});

export const LETTER_COUNT_OPTIONS = Object.freeze(
  Array.from({ length: 11 }, (_, index) => index + 2)
);

const DEFAULT_TARGET_ID = "ou";
const DEFAULT_MIN_LETTERS = 4;
const DEFAULT_MAX_LETTERS = 8;
const DEFAULT_CLOUD_MODE = CLOUD_MODES.FIXED;
const GRAPH_BY_ID = PHONOLOGY_GRAPH_BY_ID;

let WORD_CATALOG = [];
let ELIGIBLE_CACHE = new Map();

export function getDefaultSettings() {
  const target = getPhonemeTarget(DEFAULT_TARGET_ID);
  return {
    targetId: DEFAULT_TARGET_ID,
    enabledSpellings: normalizeSpellings(target?.spellings),
    minLetters: DEFAULT_MIN_LETTERS,
    maxLetters: DEFAULT_MAX_LETTERS,
    cloudMode: DEFAULT_CLOUD_MODE
  };
}

export function normalizeSettings(settings = {}) {
  const knownTargets = new Set(getPhonemeTargets().map((target) => target.id));
  const requestedTargetId = String(settings?.targetId || DEFAULT_TARGET_ID).trim();
  const targetId = knownTargets.has(requestedTargetId) ? requestedTargetId : DEFAULT_TARGET_ID;
  const target = getPhonemeTarget(targetId);

  const availableSpellings = normalizeSpellings(target?.spellings);
  const hasExplicitSpellings = Object.prototype.hasOwnProperty.call(settings || {}, "enabledSpellings");
  const requestedSpellings = normalizeSpellings(settings?.enabledSpellings);
  const enabledSpellings = hasExplicitSpellings
    ? requestedSpellings.filter((spelling) => availableSpellings.includes(spelling))
    : availableSpellings;

  let minLetters = normalizeLetterCount(settings?.minLetters, DEFAULT_MIN_LETTERS);
  let maxLetters = normalizeLetterCount(settings?.maxLetters, DEFAULT_MAX_LETTERS);
  if (minLetters > maxLetters) [minLetters, maxLetters] = [maxLetters, minLetters];

  const requestedMode = String(settings?.cloudMode || DEFAULT_CLOUD_MODE).trim();
  const cloudMode = Object.values(CLOUD_MODES).includes(requestedMode)
    ? requestedMode
    : DEFAULT_CLOUD_MODE;

  return {
    targetId,
    enabledSpellings,
    minLetters,
    maxLetters,
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

export function getTargetOptions() {
  return getPhonemeTargets().map((target) => ({
    value: target.id,
    label: target.label
  }));
}

export function getTargetForSettings(settings = {}) {
  const cfg = normalizeSettings(settings);
  const target = getPhonemeTarget(cfg.targetId);
  return target ? {
    ...target,
    enabledSpellings: [...cfg.enabledSpellings]
  } : null;
}

export function getEligibleWords(settings = {}) {
  const cfg = normalizeSettings(settings);
  const target = getPhonemeTarget(cfg.targetId);
  if (!target) return [];

  const cacheKey = [
    cfg.targetId,
    cfg.enabledSpellings.join("|"),
    cfg.minLetters,
    cfg.maxLetters
  ].join("::");
  if (ELIGIBLE_CACHE.has(cacheKey)) return cloneData(ELIGIBLE_CACHE.get(cacheKey));

  const words = WORD_CATALOG
    .filter((entry) => isLettersOnly(entry.word))
    .map((entry) => ({
      ...entry,
      letters: splitWordLetters(entry.word),
      occurrences: findTargetOccurrences(entry.units, target)
    }))
    .filter((entry) => entry.occurrences.length > 0)
    .filter((entry) => entry.letters.length >= cfg.minLetters && entry.letters.length <= cfg.maxLetters)
    .filter((entry) => targetOccurrencesUseAllowedSpellings(entry.occurrences, cfg.enabledSpellings))
    .map(({ occurrences, ...entry }) => entry);

  ELIGIBLE_CACHE.set(cacheKey, words);
  return cloneData(words);
}

export function getEligibleWordCount(settings = {}) {
  return getEligibleWords(settings).length;
}

export function canGenerateQuestion(settings = {}) {
  return getEligibleWordCount(settings) > 0;
}

export function pickQuestion(settings = {}, {
  avoidKey = "",
  usedWordSlugs = null
} = {}) {
  const cfg = normalizeSettings(settings);
  const target = getPhonemeTarget(cfg.targetId);
  if (!target) return null;

  const pool = getEligibleWords(cfg);
  if (!pool.length) return null;

  const used = usedWordSlugs instanceof Set ? usedWordSlugs : new Set();
  const unused = pool.filter((word) => !used.has(word.slug));
  let candidates = unused.length ? unused : pool;
  if (avoidKey && candidates.length > 1) {
    const withoutPrevious = candidates.filter((word) => buildQuestionKey(target.id, word.slug) !== avoidKey);
    if (withoutPrevious.length) candidates = withoutPrevious;
  }

  const chosen = randomChoice(candidates);
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

export function questionKey(question) {
  return String(question?.key || "");
}

export function buildPrompt(targetOrSettings = {}) {
  const target = targetOrSettings?.graphIds
    ? targetOrSettings
    : getTargetForSettings(targetOrSettings);
  if (!target) return "Remets les lettres dans l’ordre pour former le mot.";
  return `Remets les lettres dans l’ordre pour former un mot qui contient le son « ${target.bubbleText} », comme dans « ${target.example} ».`;
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

function findTargetOccurrences(units, target) {
  const occurrences = [];
  const graphIds = new Set(Array.isArray(target?.graphIds) ? target.graphIds : []);
  const safeUnits = Array.isArray(units) ? units : [];

  safeUnits.forEach((unit, index) => {
    if (unit?.isSilent === true || !graphIds.has(String(unit?.graph || ""))) return;
    const spelling = normalizeSpelling(getUnitSurfaceText(unit));
    if (spelling) occurrences.push({ indexes: [index], spelling });
  });

  for (const sequence of Array.isArray(target?.graphSequences) ? target.graphSequences : []) {
    if (!Array.isArray(sequence) || !sequence.length) continue;
    for (let start = 0; start <= safeUnits.length - sequence.length; start += 1) {
      let matches = true;
      for (let offset = 0; offset < sequence.length; offset += 1) {
        const unit = safeUnits[start + offset];
        if (unit?.isSilent === true || String(unit?.graph || "") !== sequence[offset]) {
          matches = false;
          break;
        }
      }
      if (!matches) continue;
      const indexes = sequence.map((_, offset) => start + offset);
      const baseSpelling = normalizeSpelling(indexes.map((index) => getUnitSurfaceText(safeUnits[index])).join(""));
      const spelling = resolveSequenceSpelling(baseSpelling, safeUnits, start + sequence.length, target?.spellings);
      if (spelling) occurrences.push({ indexes, spelling });
    }
  }

  return occurrences;
}

function resolveSequenceSpelling(baseSpelling, units, nextIndex, targetSpellings) {
  const accepted = new Set(normalizeSpellings(targetSpellings));
  if (accepted.has(baseSpelling)) return baseSpelling;

  let candidate = baseSpelling;
  for (let index = nextIndex; index < units.length; index += 1) {
    const unit = units[index];
    if (unit?.isSilent !== true) break;
    candidate = normalizeSpelling(candidate + getUnitSurfaceText(unit));
    if (accepted.has(candidate)) return candidate;
  }

  return baseSpelling;
}

function targetOccurrencesUseAllowedSpellings(occurrences, enabledSpellings) {
  const allowed = new Set(normalizeSpellings(enabledSpellings));
  return allowed.size > 0 && occurrences.every((occurrence) => allowed.has(occurrence.spelling));
}

function getUnitSurfaceText(unit) {
  const explicit = String(unit?.text || "").trim().normalize("NFC");
  if (explicit) return explicit;
  return String(GRAPH_BY_ID.get(String(unit?.graph || ""))?.label || "").normalize("NFC");
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
