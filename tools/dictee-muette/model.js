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

export const ALL_TARGET_ID = "all";
export const INPUT_STYLES = Object.freeze({
  SINGLE: "single",
  BOXES: "boxes"
});

const DEFAULT_TARGET_ID = ALL_TARGET_ID;
const DEFAULT_INPUT_STYLE = INPUT_STYLES.SINGLE;
const IMAGE_FOLDER_NAME = "Imagier";

let WORD_CATALOG = [];
let IMAGE_CATALOG = new Map();
let PLAYABLE_CACHE = new Map();

export function getDefaultSettings() {
  return {
    wordSelectionMode:WORD_SELECTION_MODES.PHONEMIC,
    targetId: DEFAULT_TARGET_ID,
    targetIds: [ALL_TARGET_ID],
    enabledSpellings: [],
    enabledSpellingsByTarget: {},
    graphemicEntries:[],
    excludedGraphemicEntries:[],
    inputStyle: DEFAULT_INPUT_STYLE,
    highlightWordLetters: false,
    showDiacritics: true
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
  const rawByTarget = settings?.enabledSpellingsByTarget && typeof settings.enabledSpellingsByTarget === "object" ? settings.enabledSpellingsByTarget : {};
  const legacy = Object.prototype.hasOwnProperty.call(settings || {}, "enabledSpellings");
  const enabledSpellingsByTarget = Object.fromEntries(normalizedTargetIds.filter((id) => id !== ALL_TARGET_ID).map((id) => {
    const available = normalizeSpellings(getPhonemeTarget(id)?.spellings);
    const explicit = Object.prototype.hasOwnProperty.call(rawByTarget, id) || (normalizedTargetIds.length === 1 && legacy);
    const requested = Object.prototype.hasOwnProperty.call(rawByTarget, id) ? rawByTarget[id] : settings?.enabledSpellings;
    return [id, explicit ? normalizeSpellings(requested).filter((spelling) => available.includes(spelling)) : available];
  }));
  const enabledSpellings = targetId !== ALL_TARGET_ID ? (enabledSpellingsByTarget[targetId] || []) : [];

  const inputStyle = settings?.inputStyle === INPUT_STYLES.BOXES
    ? INPUT_STYLES.BOXES
    : INPUT_STYLES.SINGLE;

  return {
    wordSelectionMode,
    targetId,
    targetIds:normalizedTargetIds,
    graphemicEntries,
    excludedGraphemicEntries,
    enabledSpellings,
    enabledSpellingsByTarget,
    inputStyle,
    highlightWordLetters:settings?.highlightWordLetters === true,
    showDiacritics:settings?.showDiacritics !== false
  };
}

export function getImageFolderName() {
  return IMAGE_FOLDER_NAME;
}

export function setWordCatalog(words = []) {
  WORD_CATALOG = normalizeWordCatalog(words);
  PLAYABLE_CACHE = new Map();
}

export function setImageCatalog(rows = []) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const slug = normalizeSlug(row?.slug);
    const storagePath = String(row?.storage_path || "").trim();
    if (!slug || !storagePath) continue;
    map.set(slug, storagePath);
  }
  IMAGE_CATALOG = map;
  PLAYABLE_CACHE = new Map();
}

export function getEligibleWords(settings = {}) {
  const cfg = normalizeSettings(settings);
  const bySlug = new Map();
  for (const target of getSelectedTargets(cfg)) {
    for (const word of getPlayableWordsForTarget(target, getSpellings(cfg, target), cfg.excludedGraphemicEntries)) {
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
    usageByTarget[target.id] = buildSpellingUsage(
      target,
      getPlayableWordsForTarget(target, getSpellings(cfg, target), [])
    );
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
  return getViableTargets(settings).length;
}

export function canGenerateQuestion(settings = {}) {
  return getViableTargets(settings).length > 0;
}

export function pickQuestion(settings = {}, {
  avoidKey = "",
  usedWordSlugs = null
} = {}) {
  const cfg = normalizeSettings(settings);
  const viableTargets = getViableTargets(cfg);
  if (!viableTargets.length) return null;

  const usedSet = usedWordSlugs instanceof Set ? usedWordSlugs : new Set();
  const previousTargetId = getTargetIdFromQuestionKey(avoidKey);
  const targetChoices = viableTargets.length > 1
    ? viableTargets.filter((target) => target.id !== previousTargetId)
    : viableTargets;
  const orderedTargets = shuffleArray(targetChoices.length ? targetChoices : viableTargets);

  for (const target of orderedTargets) {
    const spellings = getSpellings(cfg, target);
    const pool = getPlayableWordsForTarget(target, spellings, cfg.excludedGraphemicEntries);
    const available = pool.filter((word) => !usedSet.has(word.slug));
    // Tant qu'il reste des mots jamais vus dans la série, ne pas recycler
    // un mot déjà utilisé. Le runtime videra le cycle uniquement lorsque
    // toutes les cibles compatibles seront épuisées.
    const source = usedSet.size ? available : pool;
    if (!source.length) continue;

    const previousSlug = getSlugFromQuestionKey(avoidKey);
    const choices = source.length > 1
      ? source.filter((word) => word.slug !== previousSlug)
      : source;
    const word = shuffleArray(choices.length ? choices : source)[0];
    if (!word) continue;

    return {
      key: `${target.id}::${word.slug}`,
      target,
      slug: word.slug,
      word: word.word,
      prefix: word.prefix,
      imageStoragePath: word.imageStoragePath,
      targetSpellings: [...word.targetSpellings],
      prompt: "Écris le mot qui correspond à l’image."
    };
  }

  return null;
}

export function questionKey(question) {
  return String(question?.key || "").trim();
}

export function evaluateAnswer(question, answer) {
  const expected = normalizeAnswer(question?.word);
  const actual = normalizeAnswer(answer);
  return {
    isCorrect: Boolean(expected) && actual === expected,
    expected,
    actual
  };
}

export function getHighlightedKeys(question) {
  return Array.from(new Set(Array.from(normalizeAnswer(question?.word))));
}

export function getAnswerLength(question) {
  return Array.from(normalizeAnswer(question?.word)).length;
}

function normalizeWordCatalog(words) {
  return (Array.isArray(words) ? words : [])
    .map((word) => ({
      slug: normalizeSlug(word?.slug),
      word: String(word?.word || "").trim().normalize("NFC"),
      prefix: String(word?.prefix || "").trim().normalize("NFC"),
      units: (Array.isArray(word?.units) ? word.units : [])
        .map((unit) => ({
          graph: String(unit?.graph || "").trim(),
          text: String(unit?.text || "").trim().normalize("NFC"),
          isSilent: unit?.isSilent === true
        }))
        .filter((unit) => unit.graph)
    }))
    .filter((word) => word.slug && /^\p{L}+$/u.test(word.word) && word.units.length > 0);
}

function getPlayableWordsForTarget(target, enabledSpellings = null, excludedGraphemicEntries = []) {
  const targetId = String(target?.id || "").trim();
  if (!targetId) return [];
  const allowedSpellings = enabledSpellings === null
    ? normalizeSpellings(target?.spellings)
    : normalizeSpellings(enabledSpellings);
  const exclusions = target?.kind === "graphemic" ? normalizeGraphemicEntries(excludedGraphemicEntries) : [];
  const cacheKey = `${target?.kind || "phonemic"}::${targetId}::${allowedSpellings.join("|")}::${IMAGE_CATALOG.size}::exclude:${exclusions.join("|")}`;
  if (PLAYABLE_CACHE.has(cacheKey)) return PLAYABLE_CACHE.get(cacheKey);

  const words = WORD_CATALOG
    .map((entry) => buildPlayableWord(entry, target, allowedSpellings, exclusions))
    .filter(Boolean);
  PLAYABLE_CACHE.set(cacheKey, words);
  return words;
}

function getViableTargets(settings = {}) {
  const cfg = normalizeSettings(settings);
  const targets = getSelectedTargets(cfg).map((target) => ({ target, enabledSpellings:getSpellings(cfg, target) }));

  return targets
    .filter(({ target }) => Boolean(target))
    .filter(({ target, enabledSpellings }) => getPlayableWordsForTarget(target, enabledSpellings, cfg.excludedGraphemicEntries).length > 0)
    .map(({ target }) => target);
}

function getSelectedTargets(settings = {}) {
  const cfg = normalizeSettings(settings);
  if (cfg.wordSelectionMode === WORD_SELECTION_MODES.GRAPHEMIC) return getGraphemicTargets(cfg.graphemicEntries);
  return cfg.targetIds.includes(ALL_TARGET_ID) ? getPhonemeTargets() : cfg.targetIds.map(getPhonemeTarget).filter(Boolean);
}

function getSpellings(settings, target) {
  const cfg = normalizeSettings(settings);
  if (target?.kind === "graphemic") return target.spellings || [];
  return cfg.targetIds.includes(ALL_TARGET_ID) ? target.spellings : (cfg.enabledSpellingsByTarget[target.id] || target.spellings);
}

function buildPlayableWord(entry, target, enabledSpellings, excludedGraphemicEntries = []) {
  // phonology_words.slug conserve désormais les diacritiques afin que deux
  // lexèmes comme « cache » et « caché » puissent coexister. Les slugs des
  // images système restent historiquement ASCII : on calcule donc la clé
  // d’image depuis le mot, indépendamment de l’identifiant lexical.
  if (target?.kind === "graphemic" && wordContainsAnyGraphemicEntry(entry.word, excludedGraphemicEntries)) return null;

  const imageLookupSlug = normalizeLegacyImageSlug(entry.word);
  const imageStoragePath = IMAGE_CATALOG.get(imageLookupSlug) || IMAGE_CATALOG.get(entry.slug);
  if (!imageStoragePath) return null;

  const occurrences = target?.kind === "graphemic"
    ? findGraphemicOccurrences(entry.word, target.grapheme)
    : findPhonologyTargetOccurrences(entry.units, target);
  if (!occurrences.length) return null;

  if (target?.kind !== "graphemic") {
    const allowed = new Set(normalizeSpellings(enabledSpellings));
    if (!allowed.size || occurrences.some((occurrence) => !allowed.has(occurrence.spelling))) {
      return null;
    }
  }

  return {
    slug: entry.slug,
    word: entry.word,
    prefix: entry.prefix,
    imageStoragePath,
    targetSpellings: Array.from(new Set(occurrences.map((occurrence) => occurrence.spelling)))
  };
}

function normalizeAnswer(value) {
  return String(value || "")
    .trim()
    .normalize("NFC")
    .toLocaleLowerCase("fr-FR");
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

function getSlugFromQuestionKey(key) {
  const parts = String(key || "").split("::");
  return String(parts[1] || "").trim();
}

function shuffleArray(values = []) {
  const out = [...values];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [out[index], out[swapIndex]] = [out[swapIndex], out[index]];
  }
  return out;
}
