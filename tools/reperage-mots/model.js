import { getPhonemeTarget, getPhonemeTargets, normalizePhonologyTargetId } from "../../shared/phonology-targets.js";
import { findPhonologyTargetOccurrences } from "../../shared/phonology-target-matcher.js";
import {
  isPhonologyWordAllowedAtLevel,
  isPhonologyWordAllowedByCgpComplexity,
  isPhonologyWordAllowedBySilentLetters,
  normalizePhonologyCgpComplexityLevel,
  normalizePhonologyRegularityScore,
  normalizePhonologySilentLettersMode,
  normalizePhonologySchoolLevel,
  pickPhonologyWordByRegularity
} from "../../shared/phonology-word-level.js";
import {
  WORD_SELECTION_MODES,
  findGraphemicOccurrences,
  getGraphemicTargets,
  inferWordSelectionMode,
  legacyGraphemicEntriesFromSettings,
  normalizeGraphemicEntries,
  wordContainsAnyGraphemicEntry
} from "../../shared/graphemic-targets.js";

export const ALL_TARGET_ID = "all";
export const WRITING_MODES = Object.freeze({
  SCRIPT:"script",
  CURSIVE:"cursive",
  BOTH:"both"
});

const DEFAULT_TARGET_ID = "ou";
const DEFAULT_TOTAL_COUNT = 16;
const DEFAULT_TARGET_COUNT = 3;
const MIN_TOTAL_COUNT = 2;
const MAX_TOTAL_COUNT = 40;
const MAX_TARGET_COUNT = 20;
const DISTRACTOR_SHORTLIST_MIN = 24;
const DISTRACTOR_SHORTLIST_MAX = 80;

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
    schoolLevel:"CP",
    silentLettersMode:"allow",
    cgpComplexityLevel:5,
    totalCount:DEFAULT_TOTAL_COUNT,
    targetCount:DEFAULT_TARGET_COUNT,
    writingMode:WRITING_MODES.SCRIPT
  };
}

export function normalizeSettings(settings = {}) {
  const fallback = getDefaultSettings();
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

  const totalCount = clampInt(settings?.totalCount, MIN_TOTAL_COUNT, MAX_TOTAL_COUNT, fallback.totalCount);
  const targetCount = clampInt(settings?.targetCount, 1, Math.min(MAX_TARGET_COUNT, totalCount - 1), fallback.targetCount);
  const writingMode = normalizeWritingMode(settings?.writingMode);

  return {
    wordSelectionMode,
    targetId,
    targetIds:normalizedTargetIds,
    enabledSpellings,
    enabledSpellingsByTarget,
    graphemicEntries,
    excludedGraphemicEntries,
    schoolLevel:normalizePhonologySchoolLevel(settings?.schoolLevel),
    silentLettersMode:normalizePhonologySilentLettersMode(settings?.silentLettersMode),
    cgpComplexityLevel:normalizePhonologyCgpComplexityLevel(settings?.cgpComplexityLevel),
    totalCount,
    targetCount,
    writingMode
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
    for (const word of getPlayableWordsForTarget(target, spellings, cfg.schoolLevel, cfg.excludedGraphemicEntries, cfg.silentLettersMode, cfg.cgpComplexityLevel)) {
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
  return getSelectedTargets(cfg).filter((target) => getPlayableWordsForTarget(
    target,
    getEnabledSpellingsForTarget(cfg, target),
    cfg.schoolLevel,
    cfg.excludedGraphemicEntries,
    cfg.silentLettersMode, cfg.cgpComplexityLevel
  ).length > 0).length;
}

export function getPhonemicSpellingUsage(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.wordSelectionMode !== WORD_SELECTION_MODES.PHONEMIC) return {};
  const targets = cfg.targetIds.includes(ALL_TARGET_ID)
    ? getPhonemeTargets()
    : cfg.targetIds.map(getPhonemeTarget).filter(Boolean);
  const usageByTarget = {};
  for (const target of targets) {
    const words = getPlayableWordsForTarget(target, getEnabledSpellingsForTarget(cfg, target), cfg.schoolLevel, [], cfg.silentLettersMode, cfg.cgpComplexityLevel);
    usageByTarget[target.id] = buildSpellingUsage(target, words);
  }
  return usageByTarget;
}

export function canGenerateQuestion(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.targetCount >= cfg.totalCount) return false;
  return getEligibleTargetCount(cfg) > 0 && WORD_CATALOG.length > 1;
}

export function pickQuestion(settings = {}, {
  avoidKey = "",
  usedWordSlugs = null
} = {}) {
  const cfg = normalizeSettings(settings);
  const viableTargets = getSelectedTargets(cfg).filter((target) => getPlayableWordsForTarget(
    target,
    getEnabledSpellingsForTarget(cfg, target),
    cfg.schoolLevel,
    cfg.excludedGraphemicEntries,
    cfg.silentLettersMode, cfg.cgpComplexityLevel
  ).length > 0);
  if (!viableTargets.length) return null;

  const previousTargetId = String(avoidKey || "").split("::", 1)[0].trim();
  const targetChoices = viableTargets.length > 1
    ? viableTargets.filter((target) => target.id !== previousTargetId)
    : viableTargets;
  const target = randomChoice(targetChoices.length ? targetChoices : viableTargets);
  if (!target) return null;

  const pool = getPlayableWordsForTarget(
    target,
    getEnabledSpellingsForTarget(cfg, target),
    cfg.schoolLevel,
    cfg.excludedGraphemicEntries,
    cfg.silentLettersMode, cfg.cgpComplexityLevel
  );
  if (!pool.length) return null;

  const used = usedWordSlugs instanceof Set ? usedWordSlugs : new Set();
  const unused = pool.filter((word) => !used.has(word.slug));
  let source = unused.length ? unused : pool;
  const previousSlug = String(avoidKey || "").split("::")[1] || "";
  if (previousSlug && source.length > 1) {
    const withoutPrevious = source.filter((word) => word.slug !== previousSlug);
    if (withoutPrevious.length) source = withoutPrevious;
  }

  const chosen = pickWeightedWord(source);
  if (!chosen) return null;

  const distractorCount = cfg.totalCount - cfg.targetCount;
  const targetVariants = [chosen.word];
  const distractors = pickSimilarDistractors(chosen.word, distractorCount, cfg.schoolLevel, cfg.silentLettersMode, cfg.cgpComplexityLevel);
  if (!distractors.length) return null;
  const distractorTexts = drawDistributed(distractors.map((entry) => entry.word), distractorCount);
  const targetTexts = drawDistributed(targetVariants, cfg.targetCount);
  const items = shuffle([
    ...targetTexts.map((text) => makeItem(text, true, cfg.writingMode)),
    ...distractorTexts.map((text) => makeItem(text, false, cfg.writingMode))
  ]).map((item, index) => ({ ...item, id:`item-${index + 1}` }));

  return {
    key:`${target.id}::${chosen.slug}`,
    target,
    slug:chosen.slug,
    word:chosen.word,
    prompt:`Clique sur toutes les occurrences de « ${chosen.word} ».` ,
    items,
    expectedIds:items.filter((item) => item.isTarget).map((item) => item.id),
    totalCount:cfg.totalCount,
    targetCount:cfg.targetCount,
    writingMode:cfg.writingMode,
    maxItemLength:items.reduce((max, item) => Math.max(max, Array.from(item.text).length), 0),
    distractors:distractors.map((entry) => ({ word:entry.word, score:entry.score, relation:entry.relation }))
  };
}

export function questionKey(question) {
  return String(question?.key || "").trim();
}

export function evaluateSelection(question, selectedIds = []) {
  const availableIds = new Set((question?.items || []).map((item) => String(item.id)));
  const selected = uniqueStrings(selectedIds).filter((id) => availableIds.has(id));
  const expected = uniqueStrings(question?.expectedIds || []).filter((id) => availableIds.has(id));
  const expectedSet = new Set(expected);
  const selectedSet = new Set(selected);
  return {
    isCorrect:selected.length === expected.length && selected.every((id) => expectedSet.has(id)),
    selectedIds:selected,
    expectedIds:expected,
    correctSelectedIds:selected.filter((id) => expectedSet.has(id)),
    incorrectSelectedIds:selected.filter((id) => !expectedSet.has(id)),
    missedIds:expected.filter((id) => !selectedSet.has(id))
  };
}

export function scoreGraphicSimilarity(targetValue, candidateValue) {
  const target = normalizeSimilarityText(targetValue);
  const candidate = normalizeSimilarityText(candidateValue);
  if (!target || !candidate || target === candidate) {
    return { score:0, relation:"letters", prefixLength:0, suffixLength:0 };
  }

  const prefixLength = commonPrefixLength(target, candidate);
  const suffixLength = commonSuffixLength(target, candidate);
  const shortest = Math.max(1, Math.min(target.length, candidate.length));
  const longest = Math.max(target.length, candidate.length, 1);
  const prefixRatio = prefixLength / shortest;
  const suffixRatio = suffixLength / shortest;
  const letterDice = multisetDice(target, candidate);
  const bigramDice = diceCoefficient(ngrams(target, 2), ngrams(candidate, 2));
  const trigramDice = diceCoefficient(ngrams(target, 3), ngrams(candidate, 3));
  const editSimilarity = 1 - levenshteinDistance(target, candidate) / longest;
  const lengthSimilarity = 1 - Math.abs(target.length - candidate.length) / longest;

  let score = 0;
  score += prefixLength * 11 + prefixRatio * 22;
  score += suffixLength * 10 + suffixRatio * 20;
  score += letterDice * 32;
  score += bigramDice * 28;
  score += trigramDice * 22;
  score += Math.max(0, editSimilarity) * 20;
  score += Math.max(0, lengthSimilarity) * 8;
  if (prefixLength >= 2) score += 18;
  if (prefixLength >= 3) score += 12;
  if (suffixLength >= 2) score += 16;
  if (suffixLength >= 3) score += 10;
  if (target[0] === candidate[0]) score += 6;
  if (target.at(-1) === candidate.at(-1)) score += 5;

  let relation = "letters";
  if (prefixLength >= 2 && prefixLength >= suffixLength) relation = "prefix";
  else if (suffixLength >= 2) relation = "suffix";

  return {
    score:Math.round(score * 100) / 100,
    relation,
    prefixLength,
    suffixLength,
    letterDice,
    bigramDice,
    trigramDice,
    editSimilarity,
    lengthSimilarity
  };
}

function pickSimilarDistractors(targetWord, requestedCount, schoolLevel = "CP", silentLettersMode = "allow", cgpComplexityLevel = 5) {
  const ranked = WORD_CATALOG
    .filter((entry) => isPhonologyWordAllowedAtLevel(entry, schoolLevel))
    .filter((entry) => isPhonologyWordAllowedBySilentLetters(entry, silentLettersMode))
    .filter((entry) => isPhonologyWordAllowedByCgpComplexity(entry, cgpComplexityLevel))
    .filter((entry) => normalizeExactText(entry.word) !== normalizeExactText(targetWord))
    .map((entry) => ({
      ...entry,
      ...scoreGraphicSimilarity(targetWord, entry.word)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score
      || right.regularityScore - left.regularityScore
      || left.word.localeCompare(right.word, "fr"));
  if (!ranked.length) return [];

  const desired = Math.min(Math.max(1, Math.trunc(Number(requestedCount)) || 1), ranked.length);
  const shortlistSize = Math.min(
    ranked.length,
    DISTRACTOR_SHORTLIST_MAX,
    Math.max(DISTRACTOR_SHORTLIST_MIN, desired * 4)
  );
  const shortlist = ranked.slice(0, shortlistSize);
  const picked = [];
  const pickedSlugs = new Set();

  const relationOrder = shuffle(["prefix", "suffix", "letters"]);
  for (const relation of relationOrder) {
    if (picked.length >= desired) break;
    const bucket = shortlist.filter((entry) => entry.relation === relation && !pickedSlugs.has(entry.slug));
    if (!bucket.length) continue;
    const choice = weightedChoice(bucket, similarityWeight);
    if (!choice) continue;
    picked.push(choice);
    pickedSlugs.add(choice.slug);
  }

  while (picked.length < desired) {
    const remaining = shortlist.filter((entry) => !pickedSlugs.has(entry.slug));
    if (!remaining.length) break;
    const choice = weightedChoice(remaining, similarityWeight);
    if (!choice) break;
    picked.push(choice);
    pickedSlugs.add(choice.slug);
  }

  if (picked.length < desired) {
    for (const entry of ranked) {
      if (pickedSlugs.has(entry.slug)) continue;
      picked.push(entry);
      pickedSlugs.add(entry.slug);
      if (picked.length >= desired) break;
    }
  }

  return picked;
}

function similarityWeight(entry) {
  return Math.pow(Math.max(1, Number(entry?.score) || 1), 2);
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

function getPlayableWordsForTarget(target, enabledSpellings = null, schoolLevel = "CP", excludedGraphemicEntries = [], silentLettersMode = "allow", cgpComplexityLevel = 5) {
  const targetId = String(target?.id || "").trim();
  if (!targetId) return [];
  const spellings = enabledSpellings === null ? normalizeSpellings(target?.spellings) : normalizeSpellings(enabledSpellings);
  const level = normalizePhonologySchoolLevel(schoolLevel);
  const exclusions = target?.kind === "graphemic" ? normalizeGraphemicEntries(excludedGraphemicEntries) : [];
  const normalizedSilentLettersMode = normalizePhonologySilentLettersMode(silentLettersMode);
  const normalizedCgpComplexityLevel = normalizePhonologyCgpComplexityLevel(cgpComplexityLevel);
  const cacheKey = `${target?.kind || "phonemic"}::${targetId}::${spellings.join("|")}::${level}::exclude:${exclusions.join("|")}::silent:${normalizedSilentLettersMode}::cgp:${normalizedCgpComplexityLevel}`;
  if (PLAYABLE_WORDS_BY_TARGET.has(cacheKey)) return PLAYABLE_WORDS_BY_TARGET.get(cacheKey);

  const words = WORD_CATALOG
    .filter((entry) => isPhonologyWordAllowedAtLevel(entry, level))
    .filter((entry) => isPhonologyWordAllowedBySilentLetters(entry, normalizedSilentLettersMode))
    .filter((entry) => isPhonologyWordAllowedByCgpComplexity(entry, normalizedCgpComplexityLevel))
    .map((entry) => target?.kind === "graphemic"
      ? buildGraphemicPlayableWord(entry, target, level, exclusions)
      : buildPhonemicPlayableWord(entry, target, spellings, level))
    .filter(Boolean);
  PLAYABLE_WORDS_BY_TARGET.set(cacheKey, words);
  return words;
}

function buildPhonemicPlayableWord(entry, target, enabledSpellings, schoolLevel) {
  if (!isPhonologyWordAllowedAtLevel(entry, schoolLevel)) return null;
  const occurrences = findPhonologyTargetOccurrences(entry.units, target);
  if (!occurrences.length) return null;
  const allowed = new Set(normalizeSpellings(enabledSpellings));
  if (!allowed.size || occurrences.some((occurrence) => !allowed.has(occurrence.spelling))) return null;
  return {
    ...entry,
    targetSpellings:Array.from(new Set(occurrences.map((occurrence) => occurrence.spelling).filter(Boolean)))
  };
}

function buildGraphemicPlayableWord(entry, target, schoolLevel, exclusions) {
  if (!isPhonologyWordAllowedAtLevel(entry, schoolLevel)) return null;
  if (wordContainsAnyGraphemicEntry(entry.word, exclusions)) return null;
  const occurrences = findGraphemicOccurrences(entry.word, target.grapheme);
  if (!occurrences.length) return null;
  return {
    ...entry,
    targetSpellings:[target.grapheme]
  };
}

function pickWeightedWord(pool) {
  return pickPhonologyWordByRegularity(pool);
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
      schoolLevel:normalizePhonologySchoolLevel(word?.schoolLevel, { allowX:true, fallback:"X" }),
      regularityScore:normalizePhonologyRegularityScore(word?.regularityScore)
    }))
    .filter((entry) => entry.slug && /^\p{L}+$/u.test(entry.word) && entry.units.length > 0);
}

function normalizeWritingMode(value) {
  const requested = String(value || "").trim();
  return Object.values(WRITING_MODES).includes(requested) ? requested : WRITING_MODES.SCRIPT;
}

function makeItem(text, isTarget, writingMode) {
  return {
    text,
    isTarget:isTarget === true,
    writing:writingMode === WRITING_MODES.BOTH
      ? (Math.random() < 0.5 ? WRITING_MODES.SCRIPT : WRITING_MODES.CURSIVE)
      : writingMode
  };
}

function normalizeExactText(value) {
  return String(value || "").trim().normalize("NFC").toLocaleLowerCase("fr-FR");
}

function normalizeSimilarityText(value) {
  return normalizeExactText(value)
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z]/g, "");
}

function commonPrefixLength(left, right) {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) index += 1;
  return index;
}

function commonSuffixLength(left, right) {
  const max = Math.min(left.length, right.length);
  let count = 0;
  while (count < max && left[left.length - 1 - count] === right[right.length - 1 - count]) count += 1;
  return count;
}

function multisetDice(left, right) {
  if (!left || !right) return 0;
  const leftCounts = countCharacters(left);
  const rightCounts = countCharacters(right);
  let shared = 0;
  for (const [char, count] of leftCounts) {
    shared += Math.min(count, rightCounts.get(char) || 0);
  }
  return (2 * shared) / (left.length + right.length);
}

function countCharacters(text) {
  const counts = new Map();
  for (const char of text) counts.set(char, (counts.get(char) || 0) + 1);
  return counts;
}

function ngrams(text, size) {
  if (!text || text.length < size) return [];
  const out = [];
  for (let index = 0; index <= text.length - size; index += 1) out.push(text.slice(index, index + size));
  return out;
}

function diceCoefficient(leftValues, rightValues) {
  const left = Array.isArray(leftValues) ? leftValues : [];
  const right = Array.isArray(rightValues) ? rightValues : [];
  if (!left.length || !right.length) return 0;
  const rightCounts = new Map();
  for (const value of right) rightCounts.set(value, (rightCounts.get(value) || 0) + 1);
  let shared = 0;
  for (const value of left) {
    const count = rightCounts.get(value) || 0;
    if (!count) continue;
    shared += 1;
    rightCounts.set(value, count - 1);
  }
  return (2 * shared) / (left.length + right.length);
}

function levenshteinDistance(left, right) {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;
  const previous = Array.from({ length:right.length + 1 }, (_, index) => index);
  const current = new Array(right.length + 1);
  for (let i = 1; i <= left.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= right.length; j += 1) {
      const substitution = previous[j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1);
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, substitution);
    }
    for (let j = 0; j <= right.length; j += 1) previous[j] = current[j];
  }
  return previous[right.length];
}

function drawDistributed(values, count) {
  const source = Array.isArray(values) ? values.filter(Boolean) : [];
  if (!source.length || count <= 0) return [];
  const out = [];
  let cycle = [];
  while (out.length < count) {
    if (!cycle.length) cycle = shuffle(source);
    out.push(cycle.pop());
  }
  return out;
}

function weightedChoice(values, getWeight) {
  const source = Array.isArray(values) ? values : [];
  if (!source.length) return null;
  const weights = source.map((value) => Math.max(0, Number(getWeight(value)) || 0));
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (!(total > 0)) return randomChoice(source);
  let cursor = Math.random() * total;
  for (let index = 0; index < source.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return source[index];
  }
  return source[source.length - 1];
}

function randomChoice(values) {
  const source = Array.isArray(values) ? values : [];
  if (!source.length) return null;
  return source[Math.floor(Math.random() * source.length)] || null;
}

function shuffle(values) {
  const out = [...(Array.isArray(values) ? values : [])];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}

function normalizeSpellings(values = []) {
  return Array.from(new Set((Array.isArray(values) ? values : [])
    .map((value) => String(value || "").trim().normalize("NFC").toLocaleLowerCase("fr-FR"))
    .filter(Boolean)));
}

function clampInt(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, number))
    : Math.max(min, Math.min(max, Math.trunc(Number(fallback)) || min));
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "")).filter(Boolean)));
}
