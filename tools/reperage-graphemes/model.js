import { FALLBACKS } from "../encodage/graphs-data.js";
import { PHONOLOGY_GRAPH_BY_ID } from "../../shared/phonology-graph-data.js";
import { getPhonemeTarget, getPhonemeTargets, normalizePhonologyTargetId } from "../../shared/phonology-targets.js";
import { findPhonologyTargetOccurrences } from "../../shared/phonology-target-matcher.js";
import {
  isPhonologyWordAllowedAtLevel,
  normalizePhonologyRegularityScore,
  normalizePhonologySchoolLevel,
  pickPhonologyWordByRegularity
} from "../../shared/phonology-word-level.js";
import {
  WORD_SELECTION_MODES,
  findGraphemicOccurrences,
  getGraphemicTargets,
  inferWordSelectionMode,
  legacyGraphemicEntriesFromSettings,
  makeGraphemicTarget,
  normalizeGraphemicEntries,
  wordContainsAnyGraphemicEntry
} from "../../shared/graphemic-targets.js";

export const WORD_COUNT_OPTIONS = Object.freeze([1, 2, 3, 4, 5, 6, 7, 8]);

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
    wordSelectionMode: WORD_SELECTION_MODES.PHONEMIC,
    targetId: DEFAULT_TARGET_ID,
    targetIds: [ALL_TARGET_ID],
    wordCount: DEFAULT_WORD_COUNT,
    enabledSpellings: [],
    enabledSpellingsByTarget: {},
    graphemicEntries: [],
    excludedGraphemicEntries: [],
    schoolLevel: "CP",
    showPossibleSpellings: false
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
    .map((value) => {
      const legacyId = LEGACY_TARGET_ID_MAP[String(value || "").trim()] || String(value || "").trim();
      return normalizePhonologyTargetId(legacyId);
    })
    .filter((id) => id === ALL_TARGET_ID || knownTargets.has(id))));
  const normalizedTargetIds = targetIds.includes(ALL_TARGET_ID) || !targetIds.length
    ? [ALL_TARGET_ID]
    : targetIds;
  const targetId = normalizedTargetIds.length === 1 && normalizedTargetIds[0] !== ALL_TARGET_ID
    ? normalizedTargetIds[0]
    : ALL_TARGET_ID;
  const requestedCount = Math.round(Number(settings?.wordCount));
  const wordCount = WORD_COUNT_OPTIONS.includes(requestedCount) ? requestedCount : DEFAULT_WORD_COUNT;
  const rawSpellingsByTarget = settings?.enabledSpellingsByTarget && typeof settings.enabledSpellingsByTarget === "object"
    ? settings.enabledSpellingsByTarget
    : {};
  const hasLegacySpellings = Object.prototype.hasOwnProperty.call(settings || {}, "enabledSpellings");
  const enabledSpellingsByTarget = Object.fromEntries(normalizedTargetIds
    .filter((id) => id !== ALL_TARGET_ID)
    .map((id) => {
      const target = getPhonemeTarget(id);
      const availableSpellings = normalizeSpellings(target?.spellings);
      const hasExplicitSpellings = Object.prototype.hasOwnProperty.call(rawSpellingsByTarget, id)
        || (normalizedTargetIds.length === 1 && hasLegacySpellings);
      const requestedSpellings = Object.prototype.hasOwnProperty.call(rawSpellingsByTarget, id)
        ? normalizeSpellings(rawSpellingsByTarget[id])
        : normalizeSpellings(settings?.enabledSpellings);
      return [id, hasExplicitSpellings
        ? requestedSpellings.filter((spelling) => availableSpellings.includes(spelling))
        : availableSpellings];
    }));
  const enabledSpellings = targetId !== ALL_TARGET_ID
    ? (enabledSpellingsByTarget[targetId] || [])
    : [];

  return {
    wordSelectionMode,
    targetId,
    targetIds:normalizedTargetIds,
    graphemicEntries,
    excludedGraphemicEntries,
    wordCount,
    enabledSpellings,
    enabledSpellingsByTarget,
    schoolLevel:normalizePhonologySchoolLevel(settings?.schoolLevel),
    showPossibleSpellings:settings?.showPossibleSpellings === true
  };
}

export function setWordCatalog(words = []) {
  WORD_CATALOG = normalizeWordCatalog(words);
  PLAYABLE_WORDS_BY_TARGET = new Map();
}

export function getWordCatalog() {
  return cloneData(WORD_CATALOG);
}

export function getTargetForSettings(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) {
    if (cfg.graphemicEntries.length !== 1) {
      return {
        id:ALL_TARGET_ID,
        kind:"graphemic",
        label:"Révision graphémique",
        bubbleText:"",
        grapheme:"",
        spellings:[]
      };
    }
    return makeGraphemicTarget(cfg.graphemicEntries[0]);
  }

  if (cfg.targetIds.length !== 1 || cfg.targetIds[0] === ALL_TARGET_ID) {
    return {
      id: ALL_TARGET_ID,
      kind:"phonemic",
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
  const bySlug = new Map();
  const targets = getSelectedTargets(cfg);
  for (const target of targets) {
    const spellings = getEnabledSpellingsForTarget(cfg, target);
    for (const word of getPlayableWordsForTarget(target, spellings, cfg.schoolLevel, cfg.excludedGraphemicEntries)) {
      if (!bySlug.has(word.slug)) bySlug.set(word.slug, word);
    }
  }
  return [...bySlug.values()];
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
    const pool = getPlayableWordsForTarget(target, enabledSpellings, cfg.schoolLevel, []);
    usageByTarget[target.id] = buildSpellingUsage(target, pool);
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
  const enabledSpellings = getEnabledSpellingsForTarget(cfg, target);
  const pool = getPlayableWordsForTarget(target, enabledSpellings, cfg.schoolLevel, cfg.excludedGraphemicEntries);

  const usedSet = usedWordSlugs instanceof Set ? usedWordSlugs : new Set();
  const available = pool.filter((word) => !usedSet.has(word.slug));
  const source = available.length >= cfg.wordCount ? available : pool;
  let selected = pickVariedWords(source, enabledSpellings, cfg.wordCount);
  if (selected.length < cfg.wordCount) return null;

  let key = buildQuestionKey(target.id, selected);
  if (avoidKey && key === avoidKey && pool.length > cfg.wordCount) {
    const alternativePool = shuffleArray(pool).filter((word) => !selected.some((chosen) => chosen.slug === word.slug));
    if (alternativePool.length) {
      const replacement = pickVariedWords(alternativePool, enabledSpellings, 1)[0];
      if (replacement) selected[selected.length - 1] = replacement;
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
  const target = targetOrSettings?.id
    ? targetOrSettings
    : getTargetForSettings(targetOrSettings);
  if (!target || target.id === ALL_TARGET_ID) {
    return "Dans chaque mot, clique sur les lettres correspondant à la cible demandée.";
  }
  if (target.kind === "graphemic") {
    return `Sélectionne la graphie « ${target.grapheme} » dans chaque mot.`;
  }
  return `Sélectionne la ou les lettres qui permettent d’écrire le son « ${target.bubbleText} ».`;
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
      prefix: String(word?.prefix || "").trim().normalize("NFC"),
      units: (Array.isArray(word?.units) ? word.units : [])
        .map((unit) => ({
          graph: String(unit?.graph || "").trim(),
          text: String(unit?.text || "").trim().normalize("NFC"),
          isSilent: unit?.isSilent === true
        }))
        .filter((unit) => unit.graph),
      syllables: (Array.isArray(word?.syllables) ? word.syllables : [])
        .map((syllable) => String(syllable || "").trim().normalize("NFC"))
        .filter(Boolean),
      schoolLevel:normalizePhonologySchoolLevel(word?.schoolLevel, { allowX:true, fallback:"X" }),
      regularityScore:normalizePhonologyRegularityScore(word?.regularityScore)
    }))
    .filter((word) => word.slug && word.word && word.units.length > 0);
}

function getPlayableWordsForTarget(target, enabledSpellings = null, schoolLevel = "CP", excludedGraphemicEntries = []) {
  const targetId = String(target?.id || "").trim();
  if (!targetId) return [];
  const allowedSpellings = enabledSpellings === null
    ? normalizeSpellings(target?.spellings)
    : normalizeSpellings(enabledSpellings);
  const normalizedSchoolLevel = normalizePhonologySchoolLevel(schoolLevel);
  const exclusions = target?.kind === "graphemic" ? normalizeGraphemicEntries(excludedGraphemicEntries) : [];
  const cacheKey = `${target?.kind || "phonemic"}::${targetId}::${allowedSpellings.join("|")}::${normalizedSchoolLevel}::exclude:${exclusions.join("|")}`;
  if (PLAYABLE_WORDS_BY_TARGET.has(cacheKey)) {
    return PLAYABLE_WORDS_BY_TARGET.get(cacheKey);
  }

  const words = WORD_CATALOG
    .filter((entry) => isPhonologyWordAllowedAtLevel(entry, normalizedSchoolLevel))
    .map((entry) => target?.kind === "graphemic"
      ? buildGraphemicPlayableWord(entry, target, normalizedSchoolLevel, exclusions)
      : buildPlayableWord(entry, target, allowedSpellings, normalizedSchoolLevel))
    .filter(Boolean);
  PLAYABLE_WORDS_BY_TARGET.set(cacheKey, words);
  return words;
}

function getViableTargets(settings) {
  const cfg = normalizeSettings(settings);
  const targets = getSelectedTargets(cfg).map((target) => ({
    target,
    enabledSpellings: getEnabledSpellingsForTarget(cfg, target)
  }));

  return targets
    .filter(({ target }) => !!target)
    .filter(({ target, enabledSpellings }) => getPlayableWordsForTarget(target, enabledSpellings, cfg.schoolLevel, cfg.excludedGraphemicEntries).length >= cfg.wordCount)
    .map(({ target }) => target);
}

function getSelectedTargets(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) {
    return getGraphemicTargets(cfg.graphemicEntries);
  }
  if (cfg.targetIds.includes(ALL_TARGET_ID)) return getPhonemeTargets();
  return cfg.targetIds.map(getPhonemeTarget).filter(Boolean);
}

function getEnabledSpellingsForTarget(settings, target) {
  const cfg = normalizeSettings(settings);
  if (target?.kind === "graphemic") return target.spellings || [];
  if (cfg.targetIds.includes(ALL_TARGET_ID)) return target.spellings;
  return cfg.enabledSpellingsByTarget[target.id] || target.spellings;
}

function buildQuestionKey(targetId, words) {
  const wordKey = words.map((word) => word.slug).sort().join("|");
  return `${String(targetId || "").trim()}::${wordKey}`;
}

function getQuestionTargetIdFromKey(key) {
  return String(key || "").split("::", 1)[0].trim();
}

function buildPlayableWord(entry, target, enabledSpellings, schoolLevel = "CP") {
  if (!isPhonologyWordAllowedAtLevel(entry, schoolLevel)) return null;
  const occurrences = findPhonologyTargetOccurrences(entry.units, target);
  if (!occurrences.length) return null;
  const allowed = new Set(normalizeSpellings(enabledSpellings));
  if (!allowed.size || occurrences.some((occurrence) => !allowed.has(occurrence.spelling))) return null;

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
    prefix: entry.prefix,
    letters,
    targetGraphIds,
    targetSpellings,
    regularityScore:entry.regularityScore,
    characterCount: letters.filter((letter) => letter.selectable).length
      + (entry.prefix ? Array.from(entry.prefix).length + 1 : 0)
  };
}

function buildGraphemicPlayableWord(entry, target, schoolLevel = "CP", excludedGraphemicEntries = []) {
  if (!isPhonologyWordAllowedAtLevel(entry, schoolLevel)) return null;
  if (wordContainsAnyGraphemicEntry(entry.word, excludedGraphemicEntries)) return null;
  const occurrences = findGraphemicOccurrences(entry.word, target?.grapheme);
  if (!occurrences.length) return null;
  const targetLetterIndexes = new Set(occurrences.flatMap((occurrence) => occurrence.indexes || []));
  const chars = Array.from(entry.word);
  let letterIndex = 0;
  const letters = chars.map((char, charIndex) => {
    const selectable = isSelectableCharacter(char);
    const currentLetterIndex = selectable ? letterIndex++ : null;
    return {
      text:char,
      selectable,
      letterIndex:currentLetterIndex,
      isTarget:selectable && targetLetterIndexes.has(charIndex),
      graph:""
    };
  });
  if (!letters.some((letter) => letter.isTarget)) return null;

  return {
    slug:entry.slug,
    word:entry.word,
    prefix:entry.prefix,
    letters,
    targetGraphIds:[],
    targetSpellings:[target.grapheme],
    regularityScore:entry.regularityScore,
    characterCount:letters.filter((letter) => letter.selectable).length
      + (entry.prefix ? Array.from(entry.prefix).length + 1 : 0)
  };
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
  const remaining = Array.isArray(pool) ? [...pool] : [];
  const selected = [];
  const coveredSpellings = new Set();
  const requestedSpellings = normalizeSpellings(spellings);

  while (selected.length < count && remaining.length) {
    const uncoveredSpellings = requestedSpellings.filter((spelling) => !coveredSpellings.has(spelling));
    const variedCandidates = uncoveredSpellings.length
      ? remaining.filter((word) => word.targetSpellings.some((spelling) => uncoveredSpellings.includes(spelling)))
      : [];
    const candidatePool = variedCandidates.length ? variedCandidates : remaining;
    const chosen = pickPhonologyWordByRegularity(candidatePool);
    if (!chosen) break;

    selected.push(chosen);
    chosen.targetSpellings.forEach((spelling) => coveredSpellings.add(spelling));
    const index = remaining.findIndex((word) => word.slug === chosen.slug);
    if (index >= 0) remaining.splice(index, 1);
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
