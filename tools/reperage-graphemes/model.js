import { FALLBACKS } from "../encodage/graphs-data.js";
import { PHONOLOGY_GRAPH_BY_ID } from "../../shared/phonology-graph-data.js";
import { getPhonemeTarget, getPhonemeTargets } from "./phonemes-data.js";

export const WORD_COUNT_OPTIONS = Object.freeze([4, 5, 6, 7, 8]);

export const ALL_TARGET_ID = "all";

const DEFAULT_TARGET_ID = ALL_TARGET_ID;
const DEFAULT_WORD_COUNT = 6;
const LEGACY_TARGET_ID_MAP = Object.freeze({
  e_grave: "e_ouvert",
  c_k: "k",
  en: "an",
  ai: "e_ouvert",
  y_i: "i",
  o_circonflexe: "o",
  au_eau: "o",
  ss: "s",
  s_z: "z",
  g_gu: "g",
  er_ez_es: "e_aigu",
  c_cedille_sc: "s",
  ei_et: "e_ouvert",
  am_em: "an",
  im: "in",
  om: "on",
  qu_q_k: "k",
  eu_oeu: "eu",
  g_ge: "j",
  es_el_ef_ec_er: "e_ouvert",
  ph: "f",
  double_consonne: "e_ouvert",
  ain_ein: "in",
  ill: "y",
  x_ks: "ks",
  x_gz: "gz",
  x_s: "s",
  x_z: "z",
  un_um: "un",
  w_w: "w",
  w_v: "v"
});
const GRAPH_BY_ID = PHONOLOGY_GRAPH_BY_ID;
let WORD_CATALOG = [];
let PLAYABLE_WORDS_BY_TARGET = new Map();

export function getDefaultSettings() {
  return {
    targetId: DEFAULT_TARGET_ID,
    wordCount: DEFAULT_WORD_COUNT,
    enabledSpellings: []
  };
}

export function normalizeSettings(settings = {}) {
  const rawTargetId = String(settings?.targetId || DEFAULT_TARGET_ID).trim();
  const migratedTargetId = LEGACY_TARGET_ID_MAP[rawTargetId] || rawTargetId;
  const knownTargets = new Set(getPhonemeTargets().map((target) => target.id));
  const targetId = migratedTargetId === ALL_TARGET_ID || knownTargets.has(migratedTargetId)
    ? migratedTargetId
    : DEFAULT_TARGET_ID;
  const requestedCount = Math.round(Number(settings?.wordCount));
  const wordCount = WORD_COUNT_OPTIONS.includes(requestedCount) ? requestedCount : DEFAULT_WORD_COUNT;
  const target = targetId === ALL_TARGET_ID ? null : getPhonemeTarget(targetId);
  const availableSpellings = normalizeSpellings(target?.spellings);
  const hasExplicitSpellings = Object.prototype.hasOwnProperty.call(settings || {}, "enabledSpellings");
  const requestedSpellings = normalizeSpellings(settings?.enabledSpellings);
  const enabledSpellings = target
    ? (hasExplicitSpellings
      ? requestedSpellings.filter((spelling) => availableSpellings.includes(spelling))
      : availableSpellings)
    : [];

  return { targetId, wordCount, enabledSpellings };
}

export function setWordCatalog(words = []) {
  WORD_CATALOG = normalizeWordCatalog(words);
  PLAYABLE_WORDS_BY_TARGET = new Map();
}

export function getWordCatalog() {
  return cloneData(WORD_CATALOG);
}

export function getTargetOptions() {
  return [
    { value: ALL_TARGET_ID, label: "Révision générale — son aléatoire" },
    ...getPhonemeTargets().map((target) => ({
      value: target.id,
      label: target.label
    }))
  ];
}

export function getTargetForSettings(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.targetId === ALL_TARGET_ID) {
    return {
      id: ALL_TARGET_ID,
      label: "Révision générale",
      bubbleText: "",
      example: "",
      graphIds: [],
      spellings: []
    };
  }
  const target = getPhonemeTarget(cfg.targetId);
  return target ? {
    ...target,
    enabledSpellings: [...cfg.enabledSpellings]
  } : null;
}

export function getEligibleWords(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.targetId !== ALL_TARGET_ID) {
    const target = getPhonemeTarget(cfg.targetId);
    return target ? getPlayableWordsForTarget(target, cfg.enabledSpellings) : [];
  }

  const bySlug = new Map();
  for (const target of getPhonemeTargets()) {
    for (const word of getPlayableWordsForTarget(target)) {
      if (!bySlug.has(word.slug)) bySlug.set(word.slug, word);
    }
  }
  return [...bySlug.values()];
}

export function getEligibleWordCount(settings = {}) {
  return getEligibleWords(settings).length;
}

export function getEligibleTargetCount(settings = {}) {
  const cfg = normalizeSettings(settings);
  return getViableTargets(cfg).length;
}

export function canGenerateQuestion(settings = {}) {
  const cfg = normalizeSettings(settings);
  return getViableTargets(cfg).length > 0;
}

export function pickQuestion(settings = {}, {
  avoidKey = "",
  usedWordSlugs = null
} = {}) {
  const cfg = normalizeSettings(settings);
  const viableTargets = getViableTargets(cfg);
  if (!viableTargets.length) return null;

  const previousTargetId = getQuestionTargetIdFromKey(avoidKey);
  const targetChoices = viableTargets.length > 1
    ? viableTargets.filter((target) => target.id !== previousTargetId)
    : viableTargets;
  const target = shuffleArray(targetChoices.length ? targetChoices : viableTargets)[0];
  const enabledSpellings = cfg.targetId === ALL_TARGET_ID ? target.spellings : cfg.enabledSpellings;
  const pool = getPlayableWordsForTarget(target, enabledSpellings);

  const usedSet = usedWordSlugs instanceof Set ? usedWordSlugs : new Set();
  const available = pool.filter((word) => !usedSet.has(word.slug));
  const source = available.length >= cfg.wordCount ? available : pool;
  const selected = pickVariedWords(source, enabledSpellings, cfg.wordCount);
  if (selected.length < cfg.wordCount) return null;

  let key = buildQuestionKey(target.id, selected);
  if (avoidKey && key === avoidKey && pool.length > cfg.wordCount) {
    const alternativePool = shuffleArray(pool).filter((word) => !selected.some((chosen) => chosen.slug === word.slug));
    if (alternativePool.length) {
      selected[selected.length - 1] = alternativePool[0];
      key = buildQuestionKey(target.id, selected);
    }
  }

  return {
    key,
    target,
    prompt: buildPrompt(target),
    words: selected.map((word, wordIndex) => ({
      ...word,
      wordIndex
    }))
  };
}

export function questionKey(question) {
  return String(question?.key || "");
}

export function buildPrompt(targetOrSettings = {}) {
  const target = targetOrSettings?.graphIds
    ? targetOrSettings
    : getTargetForSettings(targetOrSettings);
  if (!target || target.id === ALL_TARGET_ID) {
    return "Dans chaque mot, clique sur les lettres qui font le son demandé.";
  }
  return `Dans chaque mot, clique sur la ou les lettres qui font le son « ${target.bubbleText} », comme dans « ${target.example} ».`;
}

export function getExpectedSelectionKeys(question) {
  const keys = [];
  for (const word of Array.isArray(question?.words) ? question.words : []) {
    for (const letter of Array.isArray(word?.letters) ? word.letters : []) {
      if (letter?.isTarget === true && letter?.selectable !== false) {
        keys.push(makeSelectionKey(word.wordIndex, letter.letterIndex));
      }
    }
  }
  return keys;
}

export function evaluateSelection(question, selectedKeys = []) {
  const expected = new Set(getExpectedSelectionKeys(question));
  const selected = new Set(normalizeSelectionKeys(selectedKeys));
  const missed = [...expected].filter((key) => !selected.has(key));
  const incorrect = [...selected].filter((key) => !expected.has(key));
  const correct = [...selected].filter((key) => expected.has(key));

  return {
    isCorrect: missed.length === 0 && incorrect.length === 0,
    expectedKeys: [...expected],
    selectedKeys: [...selected],
    correctKeys: correct,
    missedKeys: missed,
    incorrectKeys: incorrect
  };
}

export function makeSelectionKey(wordIndex, letterIndex) {
  return `${Math.max(0, Math.trunc(Number(wordIndex) || 0))}:${Math.max(0, Math.trunc(Number(letterIndex) || 0))}`;
}

export function normalizeSelectionKeys(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim())
    .filter((value) => /^\d+:\d+$/.test(value))));
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

function getPlayableWordsForTarget(target, enabledSpellings = null) {
  const targetId = String(target?.id || "").trim();
  if (!targetId) return [];
  const allowedSpellings = enabledSpellings === null
    ? normalizeSpellings(target?.spellings)
    : normalizeSpellings(enabledSpellings);
  const cacheKey = `${targetId}::${allowedSpellings.join("|")}`;
  if (PLAYABLE_WORDS_BY_TARGET.has(cacheKey)) {
    return PLAYABLE_WORDS_BY_TARGET.get(cacheKey);
  }

  const words = WORD_CATALOG
    .map((entry) => buildPlayableWord(entry, target, allowedSpellings))
    .filter(Boolean);
  PLAYABLE_WORDS_BY_TARGET.set(cacheKey, words);
  return words;
}

function getViableTargets(settings) {
  const cfg = normalizeSettings(settings);
  const targets = cfg.targetId === ALL_TARGET_ID
    ? getPhonemeTargets().map((target) => ({ target, enabledSpellings: target.spellings }))
    : [{ target: getPhonemeTarget(cfg.targetId), enabledSpellings: cfg.enabledSpellings }];

  return targets
    .filter(({ target }) => !!target)
    .filter(({ target, enabledSpellings }) => getPlayableWordsForTarget(target, enabledSpellings).length >= cfg.wordCount)
    .map(({ target }) => target);
}

function buildQuestionKey(targetId, words) {
  const wordKey = words.map((word) => word.slug).sort().join("|");
  return `${String(targetId || "").trim()}::${wordKey}`;
}

function getQuestionTargetIdFromKey(key) {
  return String(key || "").split("::", 1)[0].trim();
}

function buildPlayableWord(entry, target, enabledSpellings) {
  const occurrences = findTargetOccurrences(entry.units, target);
  if (!occurrences.length) return null;

  const allowed = new Set(normalizeSpellings(enabledSpellings));
  if (!allowed.size || occurrences.some((occurrence) => !allowed.has(occurrence.spelling))) {
    return null;
  }

  const targetUnitIndexes = new Set(occurrences.flatMap((occurrence) => occurrence.indexes));
  const letters = alignUnitsToWord(entry.word, entry.units, targetUnitIndexes);
  if (!letters.length || !letters.some((letter) => letter.isTarget)) return null;

  const targetGraphIds = Array.from(new Set([...targetUnitIndexes]
    .map((index) => String(entry.units[index]?.graph || ""))
    .filter(Boolean)));
  const targetSpellings = Array.from(new Set(occurrences.map((occurrence) => occurrence.spelling)));

  return {
    slug: entry.slug,
    word: entry.word,
    letters,
    targetGraphIds,
    targetSpellings,
    characterCount: letters.filter((letter) => letter.selectable).length
  };
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
      const spelling = normalizeSpelling(indexes.map((index) => getUnitSurfaceText(safeUnits[index])).join(""));
      if (spelling) occurrences.push({ indexes, spelling });
    }
  }

  return occurrences;
}

function alignUnitsToWord(word, units, targetUnitIndexes) {
  const chars = Array.from(String(word || "").normalize("NFC"));
  const letters = [];
  let cursor = 0;
  let letterIndex = 0;

  const pushRawChar = (char, isTarget = false, graph = "") => {
    const selectable = isSelectableCharacter(char);
    letters.push({
      text: char,
      selectable,
      letterIndex: selectable ? letterIndex : null,
      isTarget: selectable && isTarget,
      graph
    });
    if (selectable) letterIndex += 1;
  };

  for (let unitIndex = 0; unitIndex < units.length; unitIndex += 1) {
    const unit = units[unitIndex];
    while (cursor < chars.length && !isSelectableCharacter(chars[cursor])) {
      pushRawChar(chars[cursor], false, "");
      cursor += 1;
    }

    const graph = String(unit?.graph || "").trim();
    const unitText = String(unit?.text || "").trim().normalize("NFC");
    const surfaceText = unitText || getGraphLabel(graph);
    if (!surfaceText) continue;
    const surfaceChars = Array.from(surfaceText);
    const match = findUnitMatch(chars, cursor, surfaceChars);
    let start = match.start;

    if (start < cursor) start = cursor;
    while (cursor < start && cursor < chars.length) {
      pushRawChar(chars[cursor], false, "");
      cursor += 1;
    }

    const length = Math.max(1, match.length);
    const isTargetUnit = unit?.isSilent !== true && targetUnitIndexes.has(unitIndex);
    for (let offset = 0; offset < length && cursor < chars.length; offset += 1) {
      pushRawChar(chars[cursor], isTargetUnit, graph);
      cursor += 1;
    }
  }

  while (cursor < chars.length) {
    pushRawChar(chars[cursor], false, "");
    cursor += 1;
  }

  return letters;
}

function findUnitMatch(chars, cursor, labelChars) {
  const expected = labelChars.join("");
  const expectedLength = Math.max(1, labelChars.length);
  const maxStart = Math.min(chars.length, cursor + 3);
  const candidateLengths = Array.from(new Set([
    expectedLength,
    expectedLength + 1,
    Math.max(1, expectedLength - 1)
  ]));

  for (let start = cursor; start <= maxStart; start += 1) {
    for (const length of candidateLengths) {
      const candidate = chars.slice(start, start + length).join("");
      if (sameGraphemeText(candidate, expected)) return { start, length };
    }
  }

  return { start: cursor, length: expectedLength };
}

function sameGraphemeText(first, second) {
  const directFirst = String(first || "").normalize("NFC").toLocaleLowerCase("fr-FR");
  const directSecond = String(second || "").normalize("NFC").toLocaleLowerCase("fr-FR");
  if (directFirst === directSecond) return true;

  const fallbackGraph = FALLBACKS[directFirst];
  if (fallbackGraph && fallbackGraph === directSecond) return true;

  return normalizeForLooseMatch(directFirst) === normalizeForLooseMatch(directSecond);
}

function normalizeForLooseMatch(value) {
  return String(value || "")
    .toLocaleLowerCase("fr-FR")
    .replaceAll("œ", "oe")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .normalize("NFC");
}

function getGraphLabel(graphId) {
  return String(GRAPH_BY_ID.get(String(graphId || "").trim())?.label || "").trim();
}

function isSelectableCharacter(char) {
  return /^\p{L}$/u.test(String(char || ""));
}

function pickVariedWords(pool, spellings, count) {
  const shuffled = shuffleArray(pool);
  const selected = [];
  const usedSlugs = new Set();

  for (const spelling of normalizeSpellings(spellings)) {
    if (selected.length >= count) break;
    const candidate = shuffled.find((word) => !usedSlugs.has(word.slug) && word.targetSpellings.includes(spelling));
    if (!candidate) continue;
    selected.push(candidate);
    usedSlugs.add(candidate.slug);
  }

  for (const word of shuffled) {
    if (selected.length >= count) break;
    if (usedSlugs.has(word.slug)) continue;
    selected.push(word);
    usedSlugs.add(word.slug);
  }

  return selected;
}

function getUnitSurfaceText(unit) {
  const graph = String(unit?.graph || "").trim();
  const text = String(unit?.text || "").trim().normalize("NFC");
  return text || getGraphLabel(graph);
}

function normalizeSpellings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map(normalizeSpelling)
    .filter(Boolean)));
}

function normalizeSpelling(value) {
  return String(value || "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR");
}

function shuffleArray(values = []) {
  const out = [...values];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}
