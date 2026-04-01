export const LIST_TYPES = Object.freeze({
  LETTERS: "letters",
  WORDS: "words"
});

export const PREFIX_MATCH_MODES = Object.freeze({
  EXACT: "exact",
  AT_LEAST: "at_least"
});

export const PREFIX_CONSTRAINTS = Object.freeze({
  NONE: "none",
  EXACT_1: "exact_1",
  AT_LEAST_1: "at_least_1",
  EXACT_2: "exact_2",
  AT_LEAST_2: "at_least_2",
  EXACT_3: "exact_3",
  AT_LEAST_3: "at_least_3"
});

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const COLLATOR = new Intl.Collator("fr", {
  usage: "sort",
  sensitivity: "variant",
  ignorePunctuation: false
});
const VALID_WORD_RE = /^[\p{L}\p{M}ŒœÆæÇç](?:[\p{L}\p{M}ŒœÆæÇç'’\-])*$/u;

export function getDefaultSettings() {
  return {
    listType: LIST_TYPES.WORDS,
    itemCount: 4,
    prefixConstraint: PREFIX_CONSTRAINTS.EXACT_1,
    prefixMatchMode: PREFIX_MATCH_MODES.EXACT,
    commonPrefixLength: 1
  };
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  base.listType = base.listType === LIST_TYPES.LETTERS
    ? LIST_TYPES.LETTERS
    : LIST_TYPES.WORDS;

  base.itemCount = clampInt(base.itemCount, 2, 6);

  const prefixConfig = normalizePrefixConstraint(
    base.prefixConstraint,
    base.prefixMatchMode,
    base.commonPrefixLength
  );
  base.prefixConstraint = prefixConfig.constraint;
  base.prefixMatchMode = prefixConfig.mode;
  base.commonPrefixLength = prefixConfig.length;

  return base;
}

function normalizePrefixConstraint(prefixConstraint, prefixMatchMode, commonPrefixLength) {
  const directMap = {
    [PREFIX_CONSTRAINTS.NONE]: { constraint: PREFIX_CONSTRAINTS.NONE, mode: PREFIX_MATCH_MODES.EXACT, length: 0 },
    [PREFIX_CONSTRAINTS.EXACT_1]: { constraint: PREFIX_CONSTRAINTS.EXACT_1, mode: PREFIX_MATCH_MODES.EXACT, length: 1 },
    [PREFIX_CONSTRAINTS.AT_LEAST_1]: { constraint: PREFIX_CONSTRAINTS.AT_LEAST_1, mode: PREFIX_MATCH_MODES.AT_LEAST, length: 1 },
    [PREFIX_CONSTRAINTS.EXACT_2]: { constraint: PREFIX_CONSTRAINTS.EXACT_2, mode: PREFIX_MATCH_MODES.EXACT, length: 2 },
    [PREFIX_CONSTRAINTS.AT_LEAST_2]: { constraint: PREFIX_CONSTRAINTS.AT_LEAST_2, mode: PREFIX_MATCH_MODES.AT_LEAST, length: 2 },
    [PREFIX_CONSTRAINTS.EXACT_3]: { constraint: PREFIX_CONSTRAINTS.EXACT_3, mode: PREFIX_MATCH_MODES.EXACT, length: 3 },
    [PREFIX_CONSTRAINTS.AT_LEAST_3]: { constraint: PREFIX_CONSTRAINTS.AT_LEAST_3, mode: PREFIX_MATCH_MODES.AT_LEAST, length: 3 }
  };

  if (directMap[prefixConstraint]) {
    return directMap[prefixConstraint];
  }

  const length = clampInt(commonPrefixLength, 0, 3);
  if (length <= 0) {
    return directMap[PREFIX_CONSTRAINTS.NONE];
  }

  const mode = prefixMatchMode === PREFIX_MATCH_MODES.AT_LEAST
    ? PREFIX_MATCH_MODES.AT_LEAST
    : PREFIX_MATCH_MODES.EXACT;

  const fallbackConstraint = mode === PREFIX_MATCH_MODES.AT_LEAST
    ? `at_least_${length}`
    : `exact_${length}`;

  return directMap[fallbackConstraint] || directMap[PREFIX_CONSTRAINTS.EXACT_1];
}

export function parseWordListText(text) {
  const rawLines = String(text ?? "").replace(/\r/g, "").split("\n");
  const items = [];
  const errors = [];
  const warnings = [];
  const seen = new Set();

  rawLines.forEach((rawLine, index) => {
    const line = String(rawLine).trim();
    if (!line) return;

    const parts = line.split("|");
    if (parts.length > 2) {
      errors.push(`Ligne ${index + 1} : format invalide.`);
      return;
    }

    const word = normalizeDisplayWord(parts[0]);
    const pageText = String(parts[1] ?? "").trim();

    if (!word) {
      errors.push(`Ligne ${index + 1} : mot vide.`);
      return;
    }

    if (!VALID_WORD_RE.test(word)) {
      errors.push(`Ligne ${index + 1} : mot invalide (« ${word} »).`);
      return;
    }

    let dictionaryPage = null;
    if (pageText) {
      const parsedPage = Math.floor(Number(pageText));
      if (!Number.isFinite(parsedPage) || parsedPage <= 0) {
        errors.push(`Ligne ${index + 1} : numéro de page invalide.`);
        return;
      }
      dictionaryPage = parsedPage;
    }

    const key = normalizeWordKey(word);
    if (seen.has(key)) {
      warnings.push(`Doublon ignoré : ${word}`);
      return;
    }

    seen.add(key);
    items.push({
      word,
      word_normalized: key,
      dictionary_page: dictionaryPage
    });
  });

  items.sort(compareWordEntries);

  return {
    items,
    errors,
    warnings
  };
}

export function serializeWordListEntries(entries, { includePages = true } = {}) {
  return normalizeWordEntries(entries)
    .map((entry) => {
      if (includePages && entry.dictionary_page != null) {
        return `${entry.word}|${entry.dictionary_page}`;
      }
      return entry.word;
    })
    .join("\n");
}

export function normalizeWordEntries(entries) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const out = [];
  const seen = new Set();

  for (const entry of safeEntries) {
    const word = normalizeDisplayWord(entry?.word ?? entry?.text ?? "");
    if (!word || !VALID_WORD_RE.test(word)) continue;

    const key = normalizeWordKey(word);
    if (seen.has(key)) continue;
    seen.add(key);

    let dictionaryPage = entry?.dictionary_page;
    if (dictionaryPage != null && dictionaryPage !== "") {
      const page = Math.floor(Number(dictionaryPage));
      dictionaryPage = Number.isFinite(page) && page > 0 ? page : null;
    } else {
      dictionaryPage = null;
    }

    out.push({
      word,
      word_normalized: key,
      dictionary_page: dictionaryPage
    });
  }

  out.sort(compareWordEntries);
  return out;
}

export function mergeWordEntriesPreservingPages(entries, previousEntries = []) {
  const nextEntries = normalizeWordEntries(entries);
  const previousMap = new Map(
    normalizeWordEntries(previousEntries).map((entry) => [entry.word_normalized, entry.dictionary_page ?? null])
  );

  return nextEntries.map((entry) => ({
    ...entry,
    dictionary_page: entry.dictionary_page ?? previousMap.get(entry.word_normalized) ?? null
  }));
}

export function getWordListSummary(entries) {
  const safeEntries = normalizeWordEntries(entries);
  const count = safeEntries.length;
  if (count === 0) return "Aucun mot enregistré.";
  if (count === 1) return "1 mot enregistré.";
  return `${count} mots enregistrés.`;
}

export function canGenerateQuestion(settings, { wordEntries = [] } = {}) {
  const cfg = normalizeSettings(settings);

  if (cfg.listType === LIST_TYPES.LETTERS) {
    return cfg.itemCount <= ALPHABET.length;
  }

  return !!pickQuestion(cfg, {
    wordEntries,
    attempts: 500
  });
}

export function pickQuestion(settings, {
  wordEntries = [],
  avoidKey = null,
  attempts = 400
} = {}) {
  const cfg = normalizeSettings(settings);

  if (cfg.listType === LIST_TYPES.LETTERS) {
    return pickLettersQuestion(cfg, { avoidKey, attempts });
  }

  return pickWordsQuestion(cfg, wordEntries, { avoidKey, attempts });
}

export function questionKey(question) {
  return String(question?.key || "");
}

export function sortAlphabetically(values) {
  return [...(Array.isArray(values) ? values : [])].sort((a, b) => COLLATOR.compare(String(a || ""), String(b || "")));
}

function pickLettersQuestion(settings, { avoidKey = null, attempts = 100 } = {}) {
  const count = clampInt(settings.itemCount, 2, 6);
  if (count > ALPHABET.length) return null;

  let fallback = null;

  for (let i = 0; i < attempts; i++) {
    const answerItems = pickDistinctItems(ALPHABET, count).sort((a, b) => COLLATOR.compare(a, b));
    const displayItems = shuffleUntilDifferent(answerItems);
    const prompt = count === 1
      ? "Range cette lettre dans l’ordre alphabétique."
      : "Range ces lettres dans l’ordre alphabétique.";

    const question = {
      mode: LIST_TYPES.LETTERS,
      prompt,
      items: displayItems,
      answerItems,
      key: `letters|${answerItems.join("")}`
    };

    if (!fallback) fallback = question;
    if (!avoidKey || question.key !== avoidKey) {
      return question;
    }
  }

  return fallback;
}

function pickWordsQuestion(settings, wordEntries, { avoidKey = null, attempts = 400 } = {}) {
  const cfg = normalizeSettings(settings);
  const entries = normalizeWordEntries(wordEntries);

  if (entries.length < cfg.itemCount) {
    return null;
  }

  const candidatePools = buildCandidatePools(entries, cfg.commonPrefixLength);
  if (!candidatePools.length) {
    return null;
  }

  let fallback = null;

  for (let i = 0; i < attempts; i++) {
    const subset = pickCandidateSubset(cfg, entries, candidatePools);
    if (!subset || subset.length !== cfg.itemCount) continue;

    const sharedPrefix = getSharedPrefixLength(subset.map((item) => item.word_normalized));
    if (!matchesPrefixConstraint(sharedPrefix, cfg.commonPrefixLength, cfg.prefixMatchMode)) {
      continue;
    }

    const answerItems = subset
      .map((item) => item.word)
      .sort((a, b) => COLLATOR.compare(a, b));

    const displayItems = shuffleUntilDifferent(answerItems);
    const question = {
      mode: LIST_TYPES.WORDS,
      prompt: "Range ces mots dans l’ordre alphabétique.",
      items: displayItems,
      answerItems,
      key: `words|${answerItems.map(normalizeWordKey).join("¦")}`
    };

    if (!fallback) fallback = question;
    if (!avoidKey || question.key !== avoidKey) {
      return question;
    }
  }

  return fallback;
}

function buildCandidatePools(entries, prefixLength) {
  if (prefixLength <= 0) {
    return [entries];
  }

  const groups = new Map();

  for (const entry of entries) {
    const normalized = entry.word_normalized;
    if (normalized.length < prefixLength) continue;

    const prefix = normalized.slice(0, prefixLength);
    if (!groups.has(prefix)) {
      groups.set(prefix, []);
    }
    groups.get(prefix).push(entry);
  }

  return [...groups.values()].filter((items) => items.length > 0);
}

function pickCandidateSubset(settings, entries, candidatePools) {
  const count = settings.itemCount;

  if (settings.commonPrefixLength <= 0) {
    return pickDistinctItems(entries, count);
  }

  const pool = pickRandom(candidatePools);
  if (!pool || pool.length < count) return null;

  if (settings.prefixMatchMode === PREFIX_MATCH_MODES.AT_LEAST) {
    return pickDistinctItems(pool, count);
  }

  for (let i = 0; i < 60; i++) {
    const subset = pickDistinctItems(pool, count);
    const sharedPrefix = getSharedPrefixLength(subset.map((item) => item.word_normalized));
    if (sharedPrefix === settings.commonPrefixLength) {
      return subset;
    }
  }

  return null;
}

function matchesPrefixConstraint(sharedPrefixLength, expectedLength, mode) {
  if (mode === PREFIX_MATCH_MODES.AT_LEAST) {
    return sharedPrefixLength >= expectedLength;
  }
  return sharedPrefixLength === expectedLength;
}

function getSharedPrefixLength(values) {
  const safeValues = Array.isArray(values) ? values.filter(Boolean) : [];
  if (safeValues.length <= 1) return safeValues[0]?.length ?? 0;

  let prefixLength = safeValues[0].length;

  for (let i = 1; i < safeValues.length; i++) {
    const current = safeValues[i];
    let j = 0;
    while (j < prefixLength && j < current.length && safeValues[0][j] === current[j]) {
      j += 1;
    }
    prefixLength = j;
    if (prefixLength <= 0) return 0;
  }

  return prefixLength;
}

function normalizeDisplayWord(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizeWordKey(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .toLowerCase()
    .trim();
}

function compareWordEntries(a, b) {
  const cmp = COLLATOR.compare(a.word, b.word);
  if (cmp !== 0) return cmp;
  return String(a.word_normalized).localeCompare(String(b.word_normalized), "fr");
}

function pickDistinctItems(list, count) {
  const pool = Array.isArray(list) ? [...list] : [];
  shuffleInPlace(pool);
  return pool.slice(0, count);
}

function shuffleUntilDifferent(values) {
  const answer = [...values];
  const display = [...values];

  if (display.length <= 1) return display;

  for (let i = 0; i < 24; i++) {
    shuffleInPlace(display);
    if (!arraysEqual(display, answer)) {
      return display;
    }
  }

  return [...values].reverse();
}

function pickRandom(list) {
  if (!Array.isArray(list) || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function shuffleInPlace(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function clampInt(value, min, max) {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}
