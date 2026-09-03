import { getPhonemeTarget, getPhonemeTargets, normalizePhonologyTargetId } from "../../shared/phonology-targets.js";
import { findPhonologyTargetOccurrences, getPhonologyUnitSurfaceText } from "../../shared/phonology-target-matcher.js";
import {
  isPhonologyWordAllowedAtLevel,
  normalizePhonologyRegularityScore,
  normalizePhonologySchoolLevel,
  pickPhonologyWordByRegularity
} from "../../shared/phonology-word-level.js";

export const ALL_TARGET_ID = "all";
export const ANSWERS = Object.freeze({
  YES: "yes",
  NO: "no"
});
export const QUESTION_MODES = Object.freeze({
  EXISTENCE: "existence",
  SYLLABLE_PLACE: "syllablePlace"
});
export const QUESTION_MODE_LABELS = Object.freeze({
  [QUESTION_MODES.EXISTENCE]: "Existence du son",
  [QUESTION_MODES.SYLLABLE_PLACE]: "Place dans les syllabes"
});

const DEFAULT_TARGET_ID = ALL_TARGET_ID;
const DEFAULT_QUESTION_MODE = QUESTION_MODES.EXISTENCE;
const IMAGE_FOLDER_NAME = "Imagier";

let WORD_CATALOG = [];
let IMAGE_CATALOG_BY_WORD = new Map();
let IMAGE_CATALOG_BY_LEGACY_SLUG = new Map();
let QUESTION_POOLS_CACHE = new Map();

export function getDefaultSettings() {
  return {
    questionMode: DEFAULT_QUESTION_MODE,
    targetId: DEFAULT_TARGET_ID,
    targetIds: [ALL_TARGET_ID],
    enabledSpellings: [],
    enabledSpellingsByTarget: {},
    schoolLevel: "CP"
  };
}

export function normalizeSettings(settings = {}) {
  const questionMode = normalizeQuestionMode(settings?.questionMode ?? settings?.mode);
  const knownTargets = new Set(getPhonemeTargets().map((target) => target.id));
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
  const rawByTarget = settings?.enabledSpellingsByTarget && typeof settings.enabledSpellingsByTarget === "object"
    ? settings.enabledSpellingsByTarget
    : {};
  const hasLegacySpellings = Object.prototype.hasOwnProperty.call(settings || {}, "enabledSpellings");
  const enabledSpellingsByTarget = Object.fromEntries(normalizedTargetIds
    .filter((id) => id !== ALL_TARGET_ID)
    .map((id) => {
      const target = getPhonemeTarget(id);
      const available = normalizeSpellings(target?.spellings);
      const hasExplicit = Object.prototype.hasOwnProperty.call(rawByTarget, id)
        || (normalizedTargetIds.length === 1 && hasLegacySpellings);
      const requested = Object.prototype.hasOwnProperty.call(rawByTarget, id)
        ? rawByTarget[id]
        : settings?.enabledSpellings;
      return [id, hasExplicit
        ? normalizeSpellings(requested).filter((spelling) => available.includes(spelling))
        : available];
    }));
  const enabledSpellings = targetId !== ALL_TARGET_ID ? (enabledSpellingsByTarget[targetId] || []) : [];

  return {
    questionMode,
    targetId,
    targetIds: normalizedTargetIds,
    enabledSpellings,
    enabledSpellingsByTarget,
    schoolLevel: normalizePhonologySchoolLevel(settings?.schoolLevel)
  };
}

export function getImageFolderName() {
  return IMAGE_FOLDER_NAME;
}

export function setWordCatalog(words = []) {
  WORD_CATALOG = normalizeWordCatalog(words);
  QUESTION_POOLS_CACHE = new Map();
}

export function setImageCatalog(rows = []) {
  const byWord = new Map();
  const byLegacySlug = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const slug = normalizeSlug(row?.slug);
    const wordSlug = normalizeImageWordSlug(row?.word_slug);
    const storagePath = String(row?.storage_path || "").trim();
    if (!storagePath) continue;
    if (wordSlug && !byWord.has(wordSlug)) byWord.set(wordSlug, storagePath);
    if (slug && !byLegacySlug.has(slug)) byLegacySlug.set(slug, storagePath);
  }
  IMAGE_CATALOG_BY_WORD = byWord;
  IMAGE_CATALOG_BY_LEGACY_SLUG = byLegacySlug;
  QUESTION_POOLS_CACHE = new Map();
}

export function getPhonemicSpellingUsage(settings = {}) {
  const cfg = normalizeSettings(settings);
  const usageByTarget = {};
  const targets = cfg.targetIds.includes(ALL_TARGET_ID)
    ? getPhonemeTargets()
    : cfg.targetIds.map(getPhonemeTarget).filter(Boolean);

  for (const target of targets) {
    const pools = getQuestionPoolsForTarget(target, getEnabledSpellings(cfg, target), cfg.schoolLevel);
    usageByTarget[target.id] = buildSpellingUsage(target, getPositiveWordsForMode(pools, cfg.questionMode));
  }
  return usageByTarget;
}

export function getEligibleTargetCount(settings = {}) {
  return getViableTargets(settings).length;
}

export function getEligibleStats(settings = {}) {
  const cfg = normalizeSettings(settings);
  const targets = getViableTargets(cfg);
  const positive = new Set();
  const negative = new Set();

  for (const target of targets) {
    const pools = getQuestionPoolsForTarget(target, getEnabledSpellings(cfg, target), cfg.schoolLevel);
    getPositiveWordsForMode(pools, cfg.questionMode).forEach((word) => positive.add(word.slug));
    if (cfg.questionMode === QUESTION_MODES.EXISTENCE) {
      pools.negativeWords.forEach((word) => negative.add(word.slug));
    }
  }

  return {
    targetCount: targets.length,
    positiveWordCount: positive.size,
    negativeWordCount: negative.size
  };
}

export function getEligibleWordCount(settings = {}) {
  const stats = getEligibleStats(settings);
  return stats.positiveWordCount + stats.negativeWordCount;
}

export function canGenerateQuestion(settings = {}) {
  return getViableTargets(settings).length > 0;
}

export function pickQuestion(settings = {}, { avoidKey = "", attempts = 80 } = {}) {
  const cfg = normalizeSettings(settings);
  const viableTargets = getViableTargets(cfg);
  if (!viableTargets.length) return null;

  let fallback = null;
  const previousTargetId = getTargetIdFromQuestionKey(avoidKey);
  const targetChoices = viableTargets.length > 1
    ? viableTargets.filter((target) => target.id !== previousTargetId)
    : viableTargets;

  for (let attempt = 0; attempt < Math.max(1, attempts); attempt += 1) {
    const orderedTargets = shuffleArray(targetChoices.length ? targetChoices : viableTargets);
    for (const target of orderedTargets) {
      const pools = getQuestionPoolsForTarget(target, getEnabledSpellings(cfg, target), cfg.schoolLevel);
      const question = cfg.questionMode === QUESTION_MODES.SYLLABLE_PLACE
        ? buildSyllablePlaceQuestion(target, pools, avoidKey)
        : buildExistenceQuestion(target, pools, avoidKey);
      if (!question) continue;
      fallback = fallback || question;
      if (questionKey(question) !== avoidKey) return question;
    }
  }

  return fallback;
}

export function questionKey(question = {}) {
  return String(question?.key || "").trim();
}

export function evaluateAnswer(question = {}, answer = "") {
  const expected = String(question?.correctAnswer || "");
  const submitted = normalizeSubmittedAnswer(answer, question?.mode);
  return {
    answered: submitted.length > 0,
    isCorrect: !!expected && submitted === expected,
    expected,
    submitted
  };
}

export function encodeSyllableSelection(indexes = []) {
  const source = indexes instanceof Set ? [...indexes] : (Array.isArray(indexes) ? indexes : []);
  return Array.from(new Set(source
    .map((value) => Math.trunc(Number(value)))
    .filter((value) => Number.isInteger(value) && value >= 0)))
    .sort((a, b) => a - b)
    .join(",");
}

function buildExistenceQuestion(target, pools, avoidKey) {
  const hasPositive = Array.isArray(pools?.positiveWords) && pools.positiveWords.length > 0;
  const hasNegative = Array.isArray(pools?.negativeWords) && pools.negativeWords.length > 0;
  if (!hasPositive && !hasNegative) return null;

  const preferredAnswer = Math.random() < 0.5 ? ANSWERS.YES : ANSWERS.NO;
  const answerType = preferredAnswer === ANSWERS.YES
    ? (hasPositive ? ANSWERS.YES : ANSWERS.NO)
    : (hasNegative ? ANSWERS.NO : ANSWERS.YES);

  const source = answerType === ANSWERS.YES ? pools.positiveWords : pools.negativeWords;
  if (!source.length) return null;

  const previousAnswer = getExistenceAnswerFromQuestionKey(avoidKey);
  const previousSlug = getSlugFromQuestionKey(avoidKey);
  const filtered = source.length > 1
    ? source.filter((word) => !(target.id === getTargetIdFromQuestionKey(avoidKey) && answerType === previousAnswer && word.slug === previousSlug))
    : source;
  const word = pickPhonologyWordByRegularity(filtered.length ? filtered : source);
  if (!word) return null;

  return {
    key: `${target.id}::${QUESTION_MODES.EXISTENCE}::${answerType}::${word.slug}`,
    mode: QUESTION_MODES.EXISTENCE,
    target,
    slug: word.slug,
    word: word.word,
    prefix: word.prefix,
    imageStoragePath: word.imageStoragePath,
    targetSpellings: [...(word.targetSpellings || [])],
    syllables: [...(word.syllables || [])],
    correctAnswer: answerType,
    prompt: "Entends-tu ce son dans le mot représenté par l’image ?"
  };
}

function buildSyllablePlaceQuestion(target, pools, avoidKey) {
  const source = getPositiveWordsForMode(pools, QUESTION_MODES.SYLLABLE_PLACE);
  if (!source.length) return null;

  const previousSlug = getSlugFromQuestionKey(avoidKey);
  const filtered = source.length > 1
    ? source.filter((word) => word.slug !== previousSlug)
    : source;
  const word = pickPhonologyWordByRegularity(filtered.length ? filtered : source);
  if (!word) return null;

  const correctSyllableIndexes = [...(word.targetSyllableIndexes || [])];
  const correctAnswer = encodeSyllableSelection(correctSyllableIndexes);
  if (!correctAnswer) return null;

  return {
    key: `${target.id}::${QUESTION_MODES.SYLLABLE_PLACE}::${word.slug}`,
    mode: QUESTION_MODES.SYLLABLE_PLACE,
    target,
    slug: word.slug,
    word: word.word,
    prefix: word.prefix,
    imageStoragePath: word.imageStoragePath,
    targetSpellings: [...(word.targetSpellings || [])],
    syllables: [...(word.syllables || [])],
    correctSyllableIndexes,
    correctAnswer,
    prompt: "Dans quelle syllabe entends-tu ce son ?"
  };
}

function getViableTargets(settings = {}) {
  const cfg = normalizeSettings(settings);
  const targets = cfg.targetIds.includes(ALL_TARGET_ID)
    ? getPhonemeTargets()
    : cfg.targetIds.map(getPhonemeTarget).filter(Boolean);

  return targets.filter((target) => {
    const pools = getQuestionPoolsForTarget(target, getEnabledSpellings(cfg, target), cfg.schoolLevel);
    const positiveWords = getPositiveWordsForMode(pools, cfg.questionMode);
    if (cfg.questionMode === QUESTION_MODES.SYLLABLE_PLACE) return positiveWords.length > 0;
    return positiveWords.length > 0 && (positiveWords.length + pools.negativeWords.length) > 0;
  });
}

function getEnabledSpellings(settings = {}, target) {
  const cfg = normalizeSettings(settings);
  if (!target?.id) return [];
  return cfg.targetIds.includes(ALL_TARGET_ID)
    ? normalizeSpellings(target.spellings)
    : (cfg.enabledSpellingsByTarget[target.id] || normalizeSpellings(target.spellings));
}

function getQuestionPoolsForTarget(target, enabledSpellings = null, schoolLevel = "CP") {
  const targetId = String(target?.id || "").trim();
  if (!targetId) {
    return { positiveWords: [], syllablePlaceWords: [], negativeWords: [] };
  }

  const allowedSpellings = enabledSpellings === null
    ? normalizeSpellings(target?.spellings)
    : normalizeSpellings(enabledSpellings);
  const normalizedLevel = normalizePhonologySchoolLevel(schoolLevel);
  const cacheKey = `${targetId}::${allowedSpellings.join("|")}::${normalizedLevel}::${IMAGE_CATALOG_BY_WORD.size}:${IMAGE_CATALOG_BY_LEGACY_SLUG.size}`;
  if (QUESTION_POOLS_CACHE.has(cacheKey)) return QUESTION_POOLS_CACHE.get(cacheKey);

  const allowed = new Set(allowedSpellings);
  const positiveWords = [];
  const syllablePlaceWords = [];
  const negativeWords = [];

  for (const entry of WORD_CATALOG) {
    if (!isPhonologyWordAllowedAtLevel(entry, normalizedLevel)) continue;
    const imageStoragePath = resolveImageStoragePath(entry);
    if (!imageStoragePath) continue;

    const occurrences = findPhonologyTargetOccurrences(entry.units, target);
    const baseWord = {
      slug: entry.slug,
      word: entry.word,
      prefix: entry.prefix,
      schoolLevel: entry.schoolLevel,
      regularityScore: entry.regularityScore,
      imageStoragePath,
      syllables: [...entry.syllables],
      targetSpellings: [],
      targetSyllableIndexes: []
    };

    if (!occurrences.length) {
      // Pour cet exercice purement auditif, les négatifs doivent rester nets.
      // On écarte les mots contenant une semi-voyelle très proche de la voyelle
      // cible (et réciproquement) : par ex. « avion » / « crayon » pour /i/.
      if (!hasConfusableSound(entry.units, target)) {
        negativeWords.push(baseWord);
      }
      continue;
    }

    if (!allowed.size) continue;

    const occurrenceSpellings = Array.from(new Set(occurrences
      .map((occurrence) => normalizeSpelling(occurrence?.spelling))
      .filter(Boolean)));
    const allAllowed = occurrenceSpellings.every((spelling) => allowed.has(spelling));
    if (!allAllowed) continue;

    const positiveWord = {
      ...baseWord,
      targetSpellings: occurrenceSpellings,
      targetSyllableIndexes: getOccurrenceSyllableIndexes(entry, occurrences)
    };
    positiveWords.push(positiveWord);

    // Localiser un son dans un mot monosyllabique n'apporte aucun choix :
    // le mode « Place dans les syllabes » ne propose donc jamais ces mots.
    if (entry.syllables.length > 1 && positiveWord.targetSyllableIndexes.length > 0) {
      syllablePlaceWords.push(positiveWord);
    }
  }

  const result = { positiveWords, syllablePlaceWords, negativeWords };
  QUESTION_POOLS_CACHE.set(cacheKey, result);
  return result;
}

function getPositiveWordsForMode(pools, questionMode) {
  return questionMode === QUESTION_MODES.SYLLABLE_PLACE
    ? (Array.isArray(pools?.syllablePlaceWords) ? pools.syllablePlaceWords : [])
    : (Array.isArray(pools?.positiveWords) ? pools.positiveWords : []);
}

function getOccurrenceSyllableIndexes(entry, occurrences) {
  if (!Array.isArray(entry?.syllables) || !entry.syllables.length) return [];
  const layout = buildWordLayout(entry);
  const indexes = [];
  for (const occurrence of Array.isArray(occurrences) ? occurrences : []) {
    for (const unitIndex of Array.isArray(occurrence?.indexes) ? occurrence.indexes : []) {
      const syllableIndex = layout.unitToSyllable[unitIndex];
      if (Number.isInteger(syllableIndex) && syllableIndex >= 0) indexes.push(syllableIndex);
    }
  }
  return Array.from(new Set(indexes)).sort((a, b) => a - b);
}

function buildWordLayout(word) {
  const unitSpans = [];
  let unitCursor = 0;
  for (const unit of Array.isArray(word?.units) ? word.units : []) {
    const length = Array.from(getPhonologyUnitSurfaceText(unit)).length;
    unitSpans.push({ start: unitCursor, end: unitCursor + length });
    unitCursor += length;
  }

  const syllableSpans = [];
  let syllableCursor = 0;
  const sourceSyllables = Array.isArray(word?.syllables) && word.syllables.length ? word.syllables : [word?.word || ""];
  for (const syllable of sourceSyllables) {
    const length = Array.from(String(syllable || "")).length;
    syllableSpans.push({ start: syllableCursor, end: syllableCursor + length });
    syllableCursor += length;
  }

  const unitToSyllable = unitSpans.map((unitSpan) => {
    const index = syllableSpans.findIndex((syllableSpan) => unitSpan.start < syllableSpan.end && unitSpan.end > syllableSpan.start);
    return index >= 0 ? index : 0;
  });

  return { unitSpans, syllableSpans, unitToSyllable };
}

const CLEAR_NEGATIVE_CONFUSIONS = Object.freeze({
  i: Object.freeze(["y"]),
  y: Object.freeze(["i"]),
  u: Object.freeze(["u_glisse"]),
  u_glisse: Object.freeze(["u"]),
  ou: Object.freeze(["w"]),
  w: Object.freeze(["ou"])
});

function hasConfusableSound(units, target) {
  const targetId = String(target?.id || "").trim();
  const confusableIds = CLEAR_NEGATIVE_CONFUSIONS[targetId] || [];
  if (!confusableIds.length) return false;

  return confusableIds.some((id) => {
    const confusableTarget = getPhonemeTarget(id);
    return confusableTarget ? wordContainsBroadTarget(units, confusableTarget) : false;
  });
}

function wordContainsBroadTarget(units, target) {
  if (findPhonologyTargetOccurrences(units, target).length > 0) return true;
  const includedGraphIds = new Set(Array.isArray(target?.includedInGraphIds) ? target.includedInGraphIds : []);
  if (!includedGraphIds.size) return false;
  return (Array.isArray(units) ? units : []).some((unit) => (
    unit?.isSilent !== true && includedGraphIds.has(String(unit?.graph || ""))
  ));
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

  return {
    totalWords: Array.isArray(words) ? words.length : 0,
    counts
  };
}

function normalizeWordCatalog(words) {
  return (Array.isArray(words) ? words : [])
    .map((word) => ({
      slug: normalizeSlug(word?.slug),
      word: String(word?.word || "").trim().normalize("NFC"),
      prefix: String(word?.prefix || "").trim().normalize("NFC"),
      schoolLevel: normalizePhonologySchoolLevel(word?.schoolLevel, { allowX: true, fallback: "X" }),
      regularityScore: normalizePhonologyRegularityScore(word?.regularityScore),
      units: (Array.isArray(word?.units) ? word.units : [])
        .map((unit) => ({
          graph: String(unit?.graph || "").trim(),
          text: String(unit?.text || "").trim().normalize("NFC"),
          isSilent: unit?.isSilent === true
        }))
        .filter((unit) => unit.graph),
      syllables: (Array.isArray(word?.syllables) ? word.syllables : [])
        .map((syllable) => String(syllable || "").trim().normalize("NFC"))
        .filter(Boolean)
    }))
    .filter((word) => word.slug && /^\p{L}+$/u.test(word.word) && word.units.length > 0);
}

function resolveImageStoragePath(entry) {
  const imageLookupSlug = normalizeLegacyImageSlug(entry?.word);
  return IMAGE_CATALOG_BY_WORD.get(entry?.slug)
    || IMAGE_CATALOG_BY_LEGACY_SLUG.get(imageLookupSlug)
    || IMAGE_CATALOG_BY_LEGACY_SLUG.get(entry?.slug)
    || "";
}

function normalizeSubmittedAnswer(answer, mode) {
  if (mode === QUESTION_MODES.SYLLABLE_PLACE) {
    if (answer instanceof Set || Array.isArray(answer)) return encodeSyllableSelection(answer);
    return encodeSyllableSelection(String(answer || "").split(",").filter(Boolean));
  }
  return String(answer || "").trim();
}

function normalizeQuestionMode(value) {
  const raw = String(value || "").trim();
  return Object.values(QUESTION_MODES).includes(raw) ? raw : DEFAULT_QUESTION_MODE;
}

function normalizeImageWordSlug(value) {
  return String(value || "").trim().normalize("NFC").toLocaleLowerCase("fr-FR");
}

function normalizeSlug(value) {
  return String(value || "").trim().toLocaleLowerCase("fr-FR");
}

function normalizeLegacyImageSlug(value) {
  return String(value || "")
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR")
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
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

function getTargetIdFromQuestionKey(key) {
  return String(key || "").split("::", 1)[0].trim();
}

function getExistenceAnswerFromQuestionKey(key) {
  const parts = String(key || "").split("::");
  return parts[1] === QUESTION_MODES.EXISTENCE ? String(parts[2] || "").trim() : "";
}

function getSlugFromQuestionKey(key) {
  const parts = String(key || "").split("::");
  if (parts[1] === QUESTION_MODES.EXISTENCE) return String(parts[3] || "").trim();
  if (parts[1] === QUESTION_MODES.SYLLABLE_PLACE) return String(parts[2] || "").trim();
  // Compatibilité avec les anciennes clés target::yes/no::slug.
  return String(parts[2] || "").trim();
}

function shuffleArray(values = []) {
  const out = [...values];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}
