// Moteur commun de la banque lexicale.
//
// La source persistante est public.lexical_entries (Supabase).
// Ce module ne charge aucune donnée lui-même : il normalise les lignes reçues
// et transforme les notations humaines de la banque en structures directement
// utilisables par les outils.
//
// Syntaxe phonologique prise en charge :
//   a/b/e_ouvert/ill/*e
//   a=â / i=ï / oeu=œu
//
// - « *e » représente une lettre muette ;
// - « code=graphie » force la graphie visible d'un code ;
// - sinon la graphie est résolue depuis phonology-graph-data.js et alignée sur
//   l'orthographe du mot.

import { PHONOLOGY_GRAPH_BY_ID } from "./phonology-graph-data.js";
import { getPhonologyWordRegularityScore } from "./phonology-word-level.js";

const EMPTY_ARRAY = Object.freeze([]);
const EMPTY_FORMS = Object.freeze({
  masculine:Object.freeze({ singular:null, plural:null }),
  feminine:Object.freeze({ singular:null, plural:null })
});

export const LEXICAL_LEVELS = Object.freeze([1, 2, 3]);
export const DEFAULT_LEXICAL_LEVEL = 1;

const IGNORED_ORTHOGRAPHY_RE = /^[\s'’\-‐‑‒–—]$/u;

function normalizeUnicode(value) {
  return String(value ?? "").normalize("NFC");
}

function normalizeOptionalString(value) {
  const text = normalizeUnicode(value).trim();
  return text || null;
}

function normalizeDisplayText(value) {
  return normalizeUnicode(value).trim();
}

function normalizeComparableText(value) {
  return normalizeUnicode(value).toLocaleLowerCase("fr-FR");
}

function freezeStringArray(value) {
  const source = Array.isArray(value)
    ? value
    : (value == null || value === "" ? [] : [value]);
  const seen = new Set();
  const result = [];
  for (const raw of source) {
    const text = normalizeDisplayText(raw);
    if (!text) continue;
    const key = normalizeComparableText(text);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result.length ? Object.freeze(result) : EMPTY_ARRAY;
}

/**
 * Clé canonique de la banque. Les accents sont conservés : « cache » et
 * « caché » sont deux entrées distinctes.
 */
export function normalizeLexicalKey(value) {
  return normalizeUnicode(value)
    .trim()
    .toLocaleLowerCase("fr-FR")
    .replace(/[’‘ʼ`´]/gu, "'")
    .replace(/\s+/gu, " ");
}

export function normalizeFixedWordSlugs(values = []) {
  const source = Array.isArray(values) ? values : [values];
  const seen = new Set();
  const result = [];
  for (const value of source) {
    const slug = normalizeLexicalKey(value);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    result.push(slug);
  }
  return result;
}

export function getFixedWordsFromCatalog(catalog = [], values = []) {
  const requested = normalizeFixedWordSlugs(values);
  if (!requested.length) return [];
  const bySlug = new Map((Array.isArray(catalog) ? catalog : [])
    .map((entry) => [normalizeLexicalKey(entry?.slug ?? entry?.key), entry])
    .filter(([slug, entry]) => slug && entry));
  return requested.map((slug) => bySlug.get(slug)).filter(Boolean);
}

export function normalizeLexicalLevel(value, fallback = DEFAULT_LEXICAL_LEVEL) {
  const level = Math.trunc(Number(value));
  if (LEXICAL_LEVELS.includes(level)) return level;
  const safeFallback = Math.trunc(Number(fallback));
  return LEXICAL_LEVELS.includes(safeFallback) ? safeFallback : DEFAULT_LEXICAL_LEVEL;
}

export function isLexicalEntryAllowedAtLevel(entryOrLevel, selectedLevel = DEFAULT_LEXICAL_LEVEL) {
  const entryLevel = normalizeLexicalLevel(
    typeof entryOrLevel === "object" && entryOrLevel !== null
      ? entryOrLevel.lexicalLevel ?? entryOrLevel.lexical_level
      : entryOrLevel,
    DEFAULT_LEXICAL_LEVEL
  );
  return entryLevel <= normalizeLexicalLevel(selectedLevel, DEFAULT_LEXICAL_LEVEL);
}

function freezeForms(raw = {}) {
  const masculine = raw?.masculine && typeof raw.masculine === "object" ? raw.masculine : {};
  const feminine = raw?.feminine && typeof raw.feminine === "object" ? raw.feminine : {};
  return Object.freeze({
    masculine:Object.freeze({
      singular:normalizeOptionalString(masculine.singular ?? raw?.masc_sing),
      plural:normalizeOptionalString(masculine.plural ?? raw?.masc_plur)
    }),
    feminine:Object.freeze({
      singular:normalizeOptionalString(feminine.singular ?? raw?.fem_sing),
      plural:normalizeOptionalString(feminine.plural ?? raw?.fem_plur)
    })
  });
}

function splitEncodedList(value) {
  if (Array.isArray(value)) return freezeStringArray(value);
  const text = normalizeDisplayText(value);
  if (!text) return EMPTY_ARRAY;
  return freezeStringArray(text.split(";").map((item) => item.trim()));
}

function splitAnalysisTokens(value) {
  return normalizeDisplayText(value)
    .split("/")
    .map((token) => token.trim())
    .filter(Boolean);
}

function buildUnitDescriptor(token) {
  const source = normalizeDisplayText(token);
  if (!source) return null;

  if (source.startsWith("*")) {
    const text = normalizeDisplayText(source.replace(/^\*+/u, ""));
    return text
      ? Object.freeze({ source, graph:"__silent__", explicitText:text, isSilent:true, candidates:Object.freeze([text]) })
      : null;
  }

  const equalIndex = source.indexOf("=");
  const graph = normalizeDisplayText(equalIndex >= 0 ? source.slice(0, equalIndex) : source);
  const explicitText = equalIndex >= 0 ? normalizeDisplayText(source.slice(equalIndex + 1)) : "";
  const reference = PHONOLOGY_GRAPH_BY_ID.get(graph);
  if (!graph || !reference) return null;

  const candidates = [];
  const pushCandidate = (value) => {
    const text = normalizeDisplayText(value);
    if (!text) return;
    const key = normalizeComparableText(text);
    if (candidates.some((item) => normalizeComparableText(item) === key)) return;
    candidates.push(text);
  };

  if (explicitText) {
    pushCandidate(explicitText);
  } else {
    for (const variant of reference.variants || []) pushCandidate(variant);
    pushCandidate(reference.label);
  }

  return Object.freeze({
    source,
    graph,
    explicitText:explicitText || null,
    isSilent:false,
    candidates:Object.freeze(candidates)
  });
}

function isIgnoredOrthographyChar(char) {
  return IGNORED_ORTHOGRAPHY_RE.test(String(char || ""));
}

function skipIgnoredOrthography(source, index) {
  let cursor = index;
  while (cursor < source.length && isIgnoredOrthographyChar(source[cursor])) cursor += 1;
  return cursor;
}

function startsWithAt(source, index, candidate) {
  const length = Array.from(candidate).length;
  if (!length) return false;
  const slice = source.slice(index, index + length).join("");
  return normalizeComparableText(slice) === normalizeComparableText(candidate);
}

function descriptorFallbackLengths(descriptor) {
  const lengths = Array.from(new Set((descriptor.candidates || [])
    .map((candidate) => Array.from(candidate).length)
    .filter((length) => length > 0)))
    .sort((a, b) => a - b);
  return lengths.length ? lengths : [1];
}

function alignDescriptorsToWord(word, descriptors) {
  const source = Array.from(normalizeUnicode(word));
  const memo = new Map();

  const visit = (tokenIndex, sourceIndex) => {
    const alignedIndex = skipIgnoredOrthography(source, sourceIndex);
    const key = `${tokenIndex}:${alignedIndex}`;
    if (memo.has(key)) return memo.get(key);

    if (tokenIndex >= descriptors.length) {
      const end = skipIgnoredOrthography(source, alignedIndex);
      const result = end === source.length ? [] : null;
      memo.set(key, result);
      return result;
    }

    const descriptor = descriptors[tokenIndex];
    const exactCandidates = descriptor.candidates || [];
    for (const candidate of exactCandidates) {
      const length = Array.from(candidate).length;
      if (!startsWithAt(source, alignedIndex, candidate)) continue;
      const tail = visit(tokenIndex + 1, alignedIndex + length);
      if (!tail) continue;
      const result = [{ text:source.slice(alignedIndex, alignedIndex + length).join(""), fallback:false }, ...tail];
      memo.set(key, result);
      return result;
    }

    // Quelques entrées ont volontairement un code phonologique dont la graphie
    // écrite n'est pas une variante canonique du référentiel (ex. album : o -> u).
    // On conserve le code, mais on récupère la surface exacte dans l'orthographe
    // si l'alignement du reste du mot reste cohérent.
    if (!descriptor.explicitText && !descriptor.isSilent) {
      for (const length of descriptorFallbackLengths(descriptor)) {
        if (alignedIndex + length > source.length) continue;
        const candidate = source.slice(alignedIndex, alignedIndex + length).join("");
        if (!candidate || Array.from(candidate).some(isIgnoredOrthographyChar)) continue;
        const tail = visit(tokenIndex + 1, alignedIndex + length);
        if (!tail) continue;
        const result = [{ text:candidate, fallback:true }, ...tail];
        memo.set(key, result);
        return result;
      }
    }

    memo.set(key, null);
    return null;
  };

  return visit(0, 0);
}

/**
 * Transforme une analyse encodée (`a/b/e_ouvert/ill/*e`) en unités runtime.
 * Retourne null si un code est inconnu ou si l'analyse ne peut pas être alignée
 * de façon sûre sur l'orthographe fournie.
 */
export function parseLexicalPhonologyAnalysis(value, word = "") {
  const source = normalizeDisplayText(value);
  const tokens = splitAnalysisTokens(source);
  if (!source || !tokens.length) return null;

  const descriptors = tokens.map(buildUnitDescriptor);
  if (descriptors.some((descriptor) => !descriptor)) return null;

  const normalizedWord = normalizeDisplayText(word);
  const aligned = normalizedWord ? alignDescriptorsToWord(normalizedWord, descriptors) : null;
  if (normalizedWord && !aligned) return null;

  const units = descriptors.map((descriptor, index) => Object.freeze({
    graph:descriptor.graph,
    text:aligned?.[index]?.text || descriptor.explicitText || descriptor.candidates?.[0] || "",
    isSilent:descriptor.isSilent === true
  }));
  if (units.some((unit) => !unit.text)) return null;

  return Object.freeze({
    source,
    units:Object.freeze(units),
    usedSurfaceFallback:Boolean(aligned?.some((item) => item.fallback === true))
  });
}

export function parseLexicalSyllabification(value, word = "") {
  const source = normalizeDisplayText(value);
  if (!source) return null;
  const syllables = source.split("/").map(normalizeDisplayText).filter(Boolean);
  if (!syllables.length) return null;

  const normalizedWord = normalizeComparableText(normalizeDisplayText(word));
  if (normalizedWord && normalizeComparableText(syllables.join("")) !== normalizedWord) return null;

  return Object.freeze({ source, syllables:Object.freeze(syllables) });
}

function normalizePhonologyAnalyses(raw, word) {
  const values = splitEncodedList(raw?.phonology ?? raw?.phono);
  const analyses = values
    .map((value) => parseLexicalPhonologyAnalysis(value, word))
    .filter(Boolean);
  return analyses.length ? Object.freeze(analyses) : EMPTY_ARRAY;
}

function normalizeSyllabifications(raw, word) {
  const values = splitEncodedList(raw?.syllabifications ?? raw?.syllabations ?? raw?.syllables);
  const analyses = values
    .map((value) => parseLexicalSyllabification(value, word))
    .filter(Boolean);
  return analyses.length ? Object.freeze(analyses) : EMPTY_ARRAY;
}

/**
 * Normalise une ligne de public.lexical_entries.
 *
 * Format public retourné :
 * {
 *   key, entry, category, lexicalLevel,
 *   phonologyAnalyses:[{ source, units:[{ graph, text, isSilent }] }],
 *   syllabifications:[{ source, syllables:[...] }],
 *   introducers:[...], forms:{...}, isActive
 * }
 */
export function normalizeLexicalEntry(raw) {
  if (!raw || typeof raw !== "object") return null;
  const entry = normalizeDisplayText(raw.entry);
  if (!entry) return null;

  const key = normalizeLexicalKey(raw.entry_key || raw.key || entry);
  const category = normalizeDisplayText(raw.category).toLocaleLowerCase("fr-FR");
  const lexicalLevel = Math.trunc(Number(raw.lexical_level ?? raw.lexicalLevel));
  if (!key || !category || !LEXICAL_LEVELS.includes(lexicalLevel)) return null;

  const phonologyAnalyses = normalizePhonologyAnalyses(raw, entry);
  const syllabifications = normalizeSyllabifications(raw, entry);
  if (!phonologyAnalyses.length || !syllabifications.length) return null;

  return Object.freeze({
    key,
    entry,
    category,
    lexicalLevel,
    phonologyAnalyses,
    syllabifications,
    introducers:splitEncodedList(raw.introducers ?? raw.introducteurs),
    forms:freezeForms(raw.forms || raw),
    isActive:raw.is_active !== false && raw.isActive !== false
  });
}

export function normalizeLexicalEntries(rows) {
  const source = Array.isArray(rows) ? rows : [];
  const seen = new Set();
  const result = [];
  for (const raw of source) {
    const entry = normalizeLexicalEntry(raw);
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    result.push(entry);
  }
  return Object.freeze(result);
}

export function getLexicalVariants(entry, { includeSelf = true } = {}) {
  if (!entry || typeof entry !== "object") return EMPTY_ARRAY;
  const values = [
    ...(includeSelf ? [entry.entry] : []),
    entry.forms?.masculine?.singular,
    entry.forms?.feminine?.singular,
    entry.forms?.masculine?.plural,
    entry.forms?.feminine?.plural
  ];
  return freezeStringArray(values);
}

/**
 * Vue runtime commune de la banque lexicale. Elle ne recrée aucun ancien
 * niveau scolaire et fournit aux outils une structure stable : mot, unités,
 * syllabes et métadonnées lexicales.
 */
export function buildLexicalRuntimeWord(entry, {
  phonologyIndex = 0,
  syllabificationIndex = 0
} = {}) {
  if (!entry || typeof entry !== "object") return null;
  const phonology = entry.phonologyAnalyses?.[Math.max(0, Math.trunc(Number(phonologyIndex) || 0))]
    || entry.phonologyAnalyses?.[0];
  const syllabification = entry.syllabifications?.[Math.max(0, Math.trunc(Number(syllabificationIndex) || 0))]
    || entry.syllabifications?.[0];
  if (!phonology?.units?.length || !syllabification?.syllables?.length) return null;

  const introducers = entry.introducers || EMPTY_ARRAY;

  return Object.freeze({
    // `slug` reste le nom attendu par les moteurs des outils. Il correspond
    // désormais directement à la clé canonique de lexical_entries.
    slug:entry.key,
    key:entry.key,
    word:entry.entry,
    category:entry.category,
    lexicalLevel:entry.lexicalLevel,
    units:phonology.units,
    syllables:syllabification.syllables,
    // Lorsqu'un outil sait afficher un introducteur unique, il reçoit pour
    // l'instant le premier de la liste. Le tableau complet reste disponible.
    prefix:introducers[0] || "",
    introducers,
    forms:entry.forms || EMPTY_FORMS,
    phonologySource:phonology.source || "",
    syllabificationSource:syllabification.source || "",
    regularityScore:getPhonologyWordRegularityScore({ units:phonology.units }),
    isActive:entry.isActive !== false
  });
}

/**
 * Transforme une liste d'entrées lexicales normalisées en catalogue runtime
 * directement consommable par les outils. Une entrée invalide est ignorée.
 */
export function buildLexicalRuntimeWords(entries) {
  const source = Array.isArray(entries) ? entries : [];
  const words = source
    .map((entry) => buildLexicalRuntimeWord(entry))
    .filter(Boolean);
  return Object.freeze(words);
}
