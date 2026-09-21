import {
  createQuestions as createConjugationQuestions,
  getPersonOptions,
  getTenseOptions,
  getVerbDisplayInfinitive,
  resolveCustomVerbs,
  resolveSelectedVerbs
} from "../conjugaison/model.js";

export const VERB_FORM_MODES = Object.freeze({
  INFINITIVE:"infinitive",
  CONJUGATED:"conjugated",
  BOTH:"both"
});

export const DISTRACTOR_CLASSES = Object.freeze({
  NOUN:"noun",
  ADJECTIVE:"adjective",
  OTHER:"other"
});

const DEFAULT_TOTAL_COUNT = 16;
const DEFAULT_TARGET_COUNT = 3;
const MIN_TOTAL_COUNT = 2;
const MAX_TOTAL_COUNT = 40;
const MAX_TARGET_COUNT = 20;
const DEFAULT_TENSES = Object.freeze(["present", "imparfait", "futur", "passe_compose"]);
const DEFAULT_PERSONS = Object.freeze(["je", "tu", "il", "elle", "nous", "vous", "ils", "elles"]);
const VERB_GROUPS = Object.freeze({
  FIRST:"first",
  SECOND:"second",
  THIRD:"third"
});
const DEFAULT_VERB_GROUPS = Object.freeze(Object.values(VERB_GROUPS));
const VERB_GROUP_PRESETS = Object.freeze({
  [VERB_GROUPS.FIRST]:"premier_groupe",
  [VERB_GROUPS.SECOND]:"deuxieme_groupe",
  [VERB_GROUPS.THIRD]:"troisieme_groupe"
});
const VALID_FORM_MODES = new Set(Object.values(VERB_FORM_MODES));
const VALID_DISTRACTOR_CLASSES = new Set(Object.values(DISTRACTOR_CLASSES));
const VALID_VERB_GROUPS = new Set(Object.values(VERB_GROUPS));
const VALID_TENSES = new Set(getTenseOptions().map((option) => option.value));
const VALID_PERSONS = new Set(getPersonOptions().map((option) => option.value));

let WORD_CATALOG = [];
let TARGET_POOL_CACHE = new Map();
let DISTRACTOR_POOL_CACHE = new Map();
let GLOBAL_VERB_SURFACES = null;
let LEXICAL_VERBS_BY_LEVEL = new Map();
let NON_VERB_SURFACES = new Set();
let WORDS_BY_LEVEL = new Map();
let VERB_GROUPS_BY_INFINITIVE = null;

export function getDefaultSettings() {
  return {
    verbFormMode:VERB_FORM_MODES.INFINITIVE,
    totalCount:DEFAULT_TOTAL_COUNT,
    targetCount:DEFAULT_TARGET_COUNT,
    lexicalLevel:1,
    verbGroups:[...DEFAULT_VERB_GROUPS],
    distractorClasses:[
      DISTRACTOR_CLASSES.NOUN,
      DISTRACTOR_CLASSES.ADJECTIVE,
      DISTRACTOR_CLASSES.OTHER
    ],
    tenses:[...DEFAULT_TENSES],
    persons:[...DEFAULT_PERSONS]
  };
}

export function normalizeSettings(settings = {}) {
  const fallback = getDefaultSettings();
  const safe = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const requestedFormMode = String(safe.verbFormMode ?? safe.verb_form_mode ?? "").trim();
  const verbFormMode = VALID_FORM_MODES.has(requestedFormMode) ? requestedFormMode : fallback.verbFormMode;
  const totalCount = clampInt(safe.totalCount, MIN_TOTAL_COUNT, MAX_TOTAL_COUNT, fallback.totalCount);
  const targetCount = clampInt(safe.targetCount, 1, Math.min(MAX_TARGET_COUNT, totalCount - 1), fallback.targetCount);
  const lexicalLevel = normalizeLexicalLevel(safe.lexicalLevel ?? safe.lexical_level, fallback.lexicalLevel);
  const verbGroups = normalizeIdList(safe.verbGroups ?? safe.verb_groups, VALID_VERB_GROUPS, fallback.verbGroups);
  const distractorClasses = normalizeIdList(
    safe.distractorClasses ?? safe.distractor_classes,
    VALID_DISTRACTOR_CLASSES,
    fallback.distractorClasses
  );
  const tenses = normalizeIdList(safe.tenses, VALID_TENSES, fallback.tenses);
  const persons = normalizeIdList(safe.persons, VALID_PERSONS, fallback.persons);

  return {
    verbFormMode,
    totalCount,
    targetCount,
    lexicalLevel,
    verbGroups,
    distractorClasses,
    tenses,
    persons
  };
}

export function setWordCatalog(words = []) {
  WORD_CATALOG = normalizeWordCatalog(words);
  TARGET_POOL_CACHE = new Map();
  DISTRACTOR_POOL_CACHE = new Map();
  LEXICAL_VERBS_BY_LEVEL = new Map();
  WORDS_BY_LEVEL = new Map();
  NON_VERB_SURFACES = new Set();
  const wordsByExactLevel = new Map();
  const verbsByExactLevel = new Map();
  WORD_CATALOG.forEach((entry) => {
    const entries = wordsByExactLevel.get(entry.lexicalLevel) || [];
    entries.push(entry);
    wordsByExactLevel.set(entry.lexicalLevel, entries);
    if (entry.category === "verbe") {
      const verbs = verbsByExactLevel.get(entry.lexicalLevel) || [];
      verbs.push(entry);
      verbsByExactLevel.set(entry.lexicalLevel, verbs);
    } else {
      NON_VERB_SURFACES.add(normalizeText(entry.word));
    }
  });
  [1, 2, 3].forEach((level) => {
    WORDS_BY_LEVEL.set(level, [1, 2, 3].flatMap((entryLevel) => entryLevel <= level ? (wordsByExactLevel.get(entryLevel) || []) : []));
    LEXICAL_VERBS_BY_LEVEL.set(level, [1, 2, 3].flatMap((entryLevel) => entryLevel <= level ? (verbsByExactLevel.get(entryLevel) || []) : []));
  });
}

export function getAvailability(settings = {}) {
  const cfg = normalizeSettings(settings);
  return getAvailabilityForConfig(cfg);
}

function getAvailabilityForConfig(cfg) {
  const targetPool = getTargetPool(cfg);
  const distractorPool = getDistractorPool(cfg);
  const canBuildTargetMix = cfg.verbFormMode !== VERB_FORM_MODES.BOTH
    || cfg.targetCount <= 1
    || (getInfinitivePool(cfg).length > 0 && getConjugatedPool(cfg).length > 0);
  return {
    targetCount:targetPool.length,
    distractorCount:distractorPool.length,
    requiredTargets:cfg.targetCount,
    requiredDistractors:cfg.totalCount - cfg.targetCount,
    canGenerate:canBuildTargetMix
      && targetPool.length >= cfg.targetCount
      && distractorPool.length >= (cfg.totalCount - cfg.targetCount)
      && cfg.distractorClasses.length > 0
  };
}

export function canGenerateQuestion(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.targetCount >= cfg.totalCount) return false;
  if (!cfg.verbGroups.length) return false;
  if (!cfg.distractorClasses.length) return false;
  if (usesConjugatedForms(cfg) && (!cfg.tenses.length || !cfg.persons.length)) return false;
  return getAvailabilityForConfig(cfg).canGenerate;
}

export function pickQuestion(settings = {}, { avoidKey = "" } = {}) {
  const cfg = normalizeSettings(settings);
  if (!canGenerateQuestion(cfg)) return null;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const targets = pickTargets(cfg);
    if (targets.length !== cfg.targetCount) return null;

    const targetTexts = new Set(targets.map((entry) => normalizeText(entry.text)));
    const distractors = shuffle(getDistractorPool(cfg).filter((entry) => !targetTexts.has(normalizeText(entry.word))))
      .slice(0, cfg.totalCount - cfg.targetCount);
    if (distractors.length !== cfg.totalCount - cfg.targetCount) return null;

    const items = shuffle([
      ...targets.map((entry) => ({
        text:entry.text,
        isTarget:true,
        source:entry.source,
        lemma:entry.lemma,
        tenseId:entry.tenseId || "",
        personId:entry.personId || ""
      })),
      ...distractors.map((entry) => ({
        text:entry.word,
        isTarget:false,
        source:"lexical",
        lexicalKey:entry.slug,
        category:entry.category
      }))
    ]).map((item, index) => ({ ...item, id:`item-${index + 1}` }));

    const key = items.map((item) => `${item.isTarget ? "1" : "0"}:${normalizeText(item.text)}`).join("|");
    if (key === avoidKey && attempt < 5) continue;

    return {
      key,
      prompt:"Clique sur tous les verbes.",
      items,
      expectedIds:items.filter((item) => item.isTarget).map((item) => item.id),
      totalCount:cfg.totalCount,
      targetCount:cfg.targetCount,
      maxItemLength:items.reduce((max, item) => Math.max(max, Array.from(item.text).length), 0),
      targets:targets.map((entry) => ({
        text:entry.text,
        lemma:entry.lemma,
        source:entry.source,
        tenseId:entry.tenseId || "",
        personId:entry.personId || ""
      }))
    };
  }

  return null;
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

function pickTargets(cfg) {
  if (cfg.verbFormMode !== VERB_FORM_MODES.BOTH) {
    return shuffle(getTargetPool(cfg)).slice(0, cfg.targetCount);
  }

  const infinitives = shuffle(getInfinitivePool(cfg));
  const conjugated = shuffle(getConjugatedPool(cfg));
  if (cfg.targetCount === 1) {
    const pool = Math.random() < 0.5 ? infinitives : conjugated;
    return pool.slice(0, 1);
  }

  const minInfinitives = 1;
  const minConjugated = 1;
  if (infinitives.length < minInfinitives || conjugated.length < minConjugated) return [];

  const maxInfinitives = Math.min(infinitives.length, cfg.targetCount - minConjugated);
  const minInfinitiveCount = Math.max(minInfinitives, cfg.targetCount - conjugated.length);
  const infinitiveCount = randomInt(minInfinitiveCount, Math.max(minInfinitiveCount, maxInfinitives));
  const conjugatedCount = cfg.targetCount - infinitiveCount;

  const picked = [
    ...infinitives.slice(0, infinitiveCount),
    ...conjugated.slice(0, conjugatedCount)
  ];
  return uniqueByText(picked).length === picked.length ? picked : fillUniqueTargets(picked, [...infinitives, ...conjugated], cfg.targetCount);
}

function fillUniqueTargets(seed, pool, requestedCount) {
  const out = [];
  const seen = new Set();
  for (const entry of [...seed, ...shuffle(pool)]) {
    const key = normalizeText(entry?.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
    if (out.length >= requestedCount) break;
  }
  return out;
}

function getTargetPool(cfg) {
  if (usesConjugatedForms(cfg) && (!cfg.tenses.length || !cfg.persons.length)) return [];
  if (cfg.verbFormMode === VERB_FORM_MODES.INFINITIVE) return getInfinitivePool(cfg);
  if (cfg.verbFormMode === VERB_FORM_MODES.CONJUGATED) return getConjugatedPool(cfg);
  return uniqueByText([...getInfinitivePool(cfg), ...getConjugatedPool(cfg)]);
}

function getInfinitivePool(cfg) {
  const cacheKey = `inf::${cfg.lexicalLevel}::${getVerbGroupCacheKey(cfg)}`;
  if (TARGET_POOL_CACHE.has(cacheKey)) return TARGET_POOL_CACHE.get(cacheKey);
  const lexicalVerbs = getLexicalVerbEntries(cfg.lexicalLevel);
  const recognized = resolveCustomVerbs(lexicalVerbs.map((entry) => entry.word).join("\n"));
  const recognizedInfinitives = new Set(recognized.verbs.map((verb) => normalizeText(getVerbDisplayInfinitive(verb))));
  const pool = lexicalVerbs
    .filter((entry) => isInSelectedVerbGroups(entry.word, cfg.verbGroups))
    .filter((entry) => recognizedInfinitives.has(normalizeText(entry.word)))
    .filter((entry) => !isAmbiguousWithNonVerb(entry.word))
    .map((entry) => ({
      text:entry.word,
      lemma:entry.word,
      source:"infinitive"
    }));
  const unique = uniqueByText(pool);
  TARGET_POOL_CACHE.set(cacheKey, unique);
  return unique;
}

function getConjugatedPool(cfg) {
  const cacheKey = `conj::${cfg.lexicalLevel}::${getVerbGroupCacheKey(cfg)}::${cfg.tenses.join(",")}::${cfg.persons.join(",")}`;
  if (TARGET_POOL_CACHE.has(cacheKey)) return TARGET_POOL_CACHE.get(cacheKey);

  const lexicalVerbs = getLexicalVerbEntries(cfg.lexicalLevel)
    .filter((entry) => isInSelectedVerbGroups(entry.word, cfg.verbGroups));
  const customVerbsText = lexicalVerbs.map((entry) => entry.word).join("\n");
  if (!customVerbsText) {
    TARGET_POOL_CACHE.set(cacheKey, []);
    return [];
  }

  const questions = createConjugationQuestions({
    sourceMode:"custom",
    customVerbsText,
    tenses:cfg.tenses,
    persons:cfg.persons,
    answerFormat:"form_only",
    questionFormat:"pronoun",
    compoundAuxiliary:"both",
    drawMode:"random"
  });

  const pool = questions
    .map((question) => ({
      text:pickDisplayVariant(question?.expectedAnswer),
      lemma:String(question?.infinitive || "").trim().normalize("NFC"),
      source:"conjugated",
      tenseId:String(question?.tenseId || ""),
      personId:String(question?.personId || "")
    }))
    .filter((entry) => entry.text)
    .filter((entry) => !isAmbiguousWithNonVerb(entry.text));

  const unique = uniqueByText(pool);
  TARGET_POOL_CACHE.set(cacheKey, unique);
  return unique;
}

function getDistractorPool(cfg) {
  const cacheKey = `${cfg.lexicalLevel}::${[...cfg.distractorClasses].sort().join(",")}`;
  if (DISTRACTOR_POOL_CACHE.has(cacheKey)) return DISTRACTOR_POOL_CACHE.get(cacheKey);
  const verbSurfaces = getGlobalVerbSurfaces();
  const pool = (WORDS_BY_LEVEL.get(cfg.lexicalLevel) || [])
    .filter((entry) => entry.category !== "verbe")
    .filter((entry) => matchesDistractorClass(entry.category, cfg.distractorClasses))
    .filter((entry) => !verbSurfaces.has(normalizeText(entry.word)));
  DISTRACTOR_POOL_CACHE.set(cacheKey, pool);
  return pool;
}

function getLexicalVerbEntries(level) {
  return LEXICAL_VERBS_BY_LEVEL.get(level) || [];
}

function getVerbGroupCacheKey(cfg) {
  return [...cfg.verbGroups].sort().join(",");
}

function isInSelectedVerbGroups(infinitive, selectedGroups) {
  const selected = Array.isArray(selectedGroups) ? selectedGroups : [];
  if (!selected.length) return false;
  const memberships = getVerbGroupsByInfinitive().get(normalizeText(infinitive));
  return selected.some((group) => memberships?.has(group));
}

function getVerbGroupsByInfinitive() {
  if (VERB_GROUPS_BY_INFINITIVE) return VERB_GROUPS_BY_INFINITIVE;
  const index = new Map();
  Object.entries(VERB_GROUP_PRESETS).forEach(([group, presetId]) => {
    const verbs = resolveSelectedVerbs({ sourceMode:"preset", presetId }).verbs;
    verbs.forEach((verb) => {
      const key = normalizeText(getVerbDisplayInfinitive(verb));
      if (!key) return;
      const memberships = index.get(key) || new Set();
      memberships.add(group);
      index.set(key, memberships);
    });
  });
  VERB_GROUPS_BY_INFINITIVE = index;
  return index;
}

function matchesDistractorClass(category, selectedClasses) {
  const selected = new Set(selectedClasses);
  if (category === "nom") return selected.has(DISTRACTOR_CLASSES.NOUN);
  if (category === "adjectif") return selected.has(DISTRACTOR_CLASSES.ADJECTIVE);
  if (category === "verbe") return false;
  return selected.has(DISTRACTOR_CLASSES.OTHER);
}

function usesConjugatedForms(cfg) {
  return cfg.verbFormMode === VERB_FORM_MODES.CONJUGATED || cfg.verbFormMode === VERB_FORM_MODES.BOTH;
}

function isAmbiguousWithNonVerb(value) {
  const key = normalizeText(value);
  if (!key) return true;
  return NON_VERB_SURFACES.has(key);
}

function getGlobalVerbSurfaces() {
  if (GLOBAL_VERB_SURFACES) return GLOBAL_VERB_SURFACES;
  const surfaces = new Set();
  const allVerbs = resolveSelectedVerbs({ sourceMode:"preset", presetId:"tous" }).verbs;
  allVerbs.forEach((verb) => {
    const infinitive = normalizeText(getVerbDisplayInfinitive(verb));
    if (infinitive) surfaces.add(infinitive);
  });

  const questions = createConjugationQuestions({
    sourceMode:"preset",
    presetId:"tous",
    tenses:getTenseOptions().map((option) => option.value),
    persons:getPersonOptions().map((option) => option.value),
    answerFormat:"form_only",
    questionFormat:"pronoun",
    compoundAuxiliary:"both",
    drawMode:"random"
  });
  questions.forEach((question) => {
    splitDisplayVariants(question?.expectedAnswer).forEach((variant) => {
      const value = normalizeText(variant);
      if (value) surfaces.add(value);
    });
  });

  GLOBAL_VERB_SURFACES = surfaces;
  return GLOBAL_VERB_SURFACES;
}

function splitDisplayVariants(value) {
  return String(value || "")
    .normalize("NFC")
    .split(/\s+\/\s+/gu)
    .map((variant) => variant.trim())
    .filter(Boolean);
}

function pickDisplayVariant(value) {
  const variants = splitDisplayVariants(value);
  if (!variants.length) return "";
  return variants[Math.floor(Math.random() * variants.length)];
}

function normalizeWordCatalog(words) {
  GLOBAL_VERB_SURFACES = null;
  return (Array.isArray(words) ? words : [])
    .map((word) => ({
      slug:String(word?.slug || word?.key || "").trim().toLocaleLowerCase("fr-FR"),
      word:String(word?.word || word?.entry || "").trim().normalize("NFC"),
      category:String(word?.category || "").trim().normalize("NFC").toLocaleLowerCase("fr-FR"),
      lexicalLevel:normalizeLexicalLevel(word?.lexicalLevel ?? word?.lexical_level, 1)
    }))
    .filter((entry) => entry.slug && entry.word && entry.category && !/\s/u.test(entry.word));
}

function uniqueByText(values) {
  const out = [];
  const seen = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const key = normalizeText(value?.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .normalize("NFC")
    .replace(/[’‘ʼ`´]/gu, "'")
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("fr-FR");
}

function normalizeLexicalLevel(value, fallback = 1) {
  const level = Math.trunc(Number(value));
  return [1, 2, 3].includes(level) ? level : fallback;
}

function normalizeIdList(values, allowedSet, fallback = []) {
  if (!Array.isArray(values)) return [...fallback];
  return Array.from(new Set(values
    .map((value) => String(value || "").trim())
    .filter((value) => allowedSet.has(value))));
}

function clampInt(value, min, max, fallback) {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number)
    ? Math.max(min, Math.min(max, number))
    : Math.max(min, Math.min(max, Math.trunc(Number(fallback)) || min));
}

function randomInt(min, max) {
  const safeMin = Math.ceil(Math.min(min, max));
  const safeMax = Math.floor(Math.max(min, max));
  return safeMin + Math.floor(Math.random() * (safeMax - safeMin + 1));
}

function shuffle(values) {
  const out = [...(Array.isArray(values) ? values : [])];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}

function uniqueStrings(values) {
  return Array.from(new Set((Array.isArray(values) ? values : []).map((value) => String(value || "")).filter(Boolean)));
}
