import {
  LEVELS,
  GRAPH_ORDER,
  GRAPH_UNITS,
  FALLBACKS
} from "./graphs-data.js";
import { GRAPH_COMPOSITIONS } from "./compositions-data.js";
import {
  listPublicImageAssets,
  getPublicImageAssetUrl
} from "../../shared/public-api.js";

export const INPUT_MODES = Object.freeze({
  GRAPHEMES: "graphemes",
  LETTERS: "letters"
});

export const LENGTH_HINT_MODES = Object.freeze({
  NONE: "none",
  BOXES: "boxes"
});

export const RESPONSE_MODES = Object.freeze({
  LIBRE: "libre",
  CASES: "cases"
});

export const INDIVIDUAL_VALIDATION_MODES = Object.freeze({
  UNLIMITED: "unlimited",
  GRAPHO_TOLERANCE: "graphoTolerance",
  LIMITED_ATTEMPTS: "limitedAttempts"
});

export const DEFAULT_INDIVIDUAL_MAX_ATTEMPTS = 3;
export const RECENT_GRAPH_COUNT = 6;
export const RECENT_POOL_WEIGHT = 0.75;

const MIN_INDIVIDUAL_MAX_ATTEMPTS = 1;
const MAX_INDIVIDUAL_MAX_ATTEMPTS = 12;
const GRAPH_BY_ID = new Map(GRAPH_UNITS.map((unit) => [unit.id, unit]));
const GRAPH_SET = new Set(GRAPH_ORDER);
const BASE_LETTERS = Object.freeze("abcdefghijklmnopqrstuvwxyz".split(""));
const HOMOGRAPH_HINTS = Object.freeze({
  x_ks: "/ks/",
  x_gz: "/gz/",
  x_s: "/s/",
  x_z: "/z/",
  y_i: "i",
  y_y: "y",
  y_ii: "ii"
});
const GRAPH_IMAGE_BUCKET = "images";

let WORD_CATALOG = [];
let graphImageUrlsBySlug = new Map();
let graphImageCatalogPromise = null;

export function setWordCatalog(words) {
  WORD_CATALOG = normalizeWordCatalog(words);
}

export function getWordCatalog() {
  return cloneData(WORD_CATALOG);
}

export function getDefaultSettings() {
  return {
    inputMode: INPUT_MODES.GRAPHEMES,
    lengthHintMode: LENGTH_HINT_MODES.NONE,
    mode: RESPONSE_MODES.LIBRE,
    individualValidationMode: INDIVIDUAL_VALIDATION_MODES.UNLIMITED,
    individualMaxAttempts: DEFAULT_INDIVIDUAL_MAX_ATTEMPTS,
    graphOrder: getGraphsForStarterSelection()
  };
}

export function getAvailableGraphs() {
  return [...GRAPH_ORDER];
}

export function getGraphUnit(id) {
  const unit = getGraphUnitRef(id);
  return unit ? { ...unit } : null;
}

export function getGraphLabel(id) {
  const unit = getGraphUnitRef(id);
  return unit?.label || String(id || "").trim();
}

export function getGraphFamily(id) {
  const unit = getGraphUnitRef(id);
  return unit?.family || "";
}

export function getGraphAsset(id) {
  const unit = getGraphUnitRef(id);
  return unit?.asset || "";
}

export function getGraphFilename(id) {
  return getGraphAsset(id);
}

export async function ensureGraphImageCatalog({ force = false } = {}) {
  if (force) graphImageCatalogPromise = null;
  if (graphImageCatalogPromise) return graphImageCatalogPromise;

  graphImageCatalogPromise = listPublicImageAssets()
    .then((rows) => {
      const nextUrls = new Map();

      for (const row of (Array.isArray(rows) ? rows : [])) {
        const slug = String(row?.slug || "").trim().toLowerCase();
        const storagePath = String(row?.storage_path || "").trim();
        if (!slug || !storagePath) continue;

        const publicUrl = getPublicImageAssetUrl(storagePath, { bucket: GRAPH_IMAGE_BUCKET });
        if (publicUrl) nextUrls.set(slug, publicUrl);
      }

      graphImageUrlsBySlug = nextUrls;
      return new Map(graphImageUrlsBySlug);
    })
    .catch((error) => {
      graphImageCatalogPromise = null;
      throw error;
    });

  return graphImageCatalogPromise;
}

export function getGraphImageUrl(id) {
  const asset = getGraphAsset(id);
  if (!asset) return "";
  const slug = asset.replace(/\.[a-z0-9]+$/i, "").trim().toLowerCase();
  return graphImageUrlsBySlug.get(`grapheme_${slug}`)
    || graphImageUrlsBySlug.get(slug)
    || "";
}

export function visibleTextOfGraph(id) {
  return getGraphLabel(id);
}

export function isKnownGraph(id) {
  return GRAPH_SET.has(String(id || "").trim());
}

export function getGraphFallbackDisplay(id, activeFamilyIds = []) {
  const safeId = String(id || "").trim();
  const label = getGraphLabel(safeId);
  const family = getGraphFamily(safeId);
  let subLabel = "";

  if (family) {
    const sameLabelCount = (Array.isArray(activeFamilyIds) ? activeFamilyIds : [])
      .map((item) => String(item || "").trim())
      .filter((item) => item && getGraphFamily(item) === family && getGraphLabel(item) === label)
      .length;

    if (sameLabelCount > 1) {
      subLabel = HOMOGRAPH_HINTS[safeId] || safeId;
    }
  }

  return {
    label,
    subLabel
  };
}

export function buildStudentGraphTiles(graphOrder) {
  const activeGraphs = normalizeGraphOrder(graphOrder);
  const groups = new Map();

  activeGraphs.forEach((id, index) => {
    const unit = getGraphUnitRef(id);
    if (!unit) return;

    const existing = groups.get(unit.family);
    if (existing) {
      existing.units.push(unit);
      return;
    }

    groups.set(unit.family, {
      family: unit.family,
      firstIndex: index,
      units: [unit]
    });
  });

  return [...groups.values()]
    .sort((a, b) => a.firstIndex - b.firstIndex)
    .map((group) => {
      const units = group.units.map((unit) => ({ ...unit }));
      if (units.length === 1) {
        return {
          type: "single",
          id: units[0].id,
          family: group.family,
          units
        };
      }

      return {
        type: "family",
        id: `family:${group.family}`,
        family: group.family,
        units
      };
    });
}

export function normalizeSettings(settings) {
  const raw = settings ?? {};
  const defaults = getDefaultSettings();
  const inputMode = normalizeInputMode(raw.inputMode ?? defaults.inputMode);
  const lengthHintMode = normalizeLengthHintMode(raw.lengthHintMode, raw.mode);
  const graphOrder = normalizeGraphOrder(raw.graphOrder ?? defaults.graphOrder);

  return {
    inputMode,
    lengthHintMode,
    mode: lengthHintMode === LENGTH_HINT_MODES.BOXES ? RESPONSE_MODES.CASES : RESPONSE_MODES.LIBRE,
    individualValidationMode: normalizeIndividualValidationMode(raw.individualValidationMode ?? defaults.individualValidationMode),
    individualMaxAttempts: clampInt(
      raw.individualMaxAttempts ?? defaults.individualMaxAttempts,
      MIN_INDIVIDUAL_MAX_ATTEMPTS,
      MAX_INDIVIDUAL_MAX_ATTEMPTS,
      DEFAULT_INDIVIDUAL_MAX_ATTEMPTS
    ),
    graphOrder
  };
}

export function getWordPool(settings) {
  const cfg = normalizeSettings(settings);
  const selectedGraphs = new Set(cfg.graphOrder);
  const resolvedCatalog = WORD_CATALOG.map((word) => resolveWordCompositions(word, selectedGraphs));

  if (cfg.inputMode === INPUT_MODES.LETTERS) {
    const letterPlayable = resolvedCatalog.filter((word) => isWordLetterPlayable(word));
    if (!cfg.graphOrder.length) {
      return cloneData(letterPlayable);
    }

    return cloneData(letterPlayable.filter((word) => isWordGraphPlayable(word, selectedGraphs)));
  }

  return cloneData(resolvedCatalog.filter((word) => isWordGraphPlayable(word, selectedGraphs)));
}

export function getSelectedGraphUsageStats(settings) {
  const cfg = normalizeSettings(settings);
  const selectedGraphs = new Set(cfg.graphOrder);
  const pool = WORD_CATALOG
    .map((word) => resolveWordCompositions(word, selectedGraphs))
    .filter((word) => isWordGraphPlayable(word, selectedGraphs));
  const counts = new Map(cfg.graphOrder.map((graph) => [graph, 0]));

  for (const word of pool) {
    for (const unit of Array.isArray(word?.units) ? word.units : []) {
      const graph = String(unit?.graph || "").trim();
      let countedGraph = graph;
      if (!counts.has(countedGraph)) {
        const fallbackGraph = getAcceptedFallbackGraph(graph);
        if (fallbackGraph && counts.has(fallbackGraph)) {
          countedGraph = fallbackGraph;
        }
      }
      if (!counts.has(countedGraph)) continue;
      counts.set(countedGraph, counts.get(countedGraph) + 1);
    }
  }

  return {
    wordCount: pool.length,
    items: cfg.graphOrder.map((graph) => ({
      graph,
      label: getGraphLabel(graph),
      occurrences: counts.get(graph) || 0
    }))
  };
}

export function canGenerateQuestion(settings) {
  return getWordPool(settings).length > 0;
}

export function getRecentGraphs(settings) {
  const cfg = normalizeSettings(settings);
  const graphs = cfg.graphOrder;
  if (graphs.length <= RECENT_GRAPH_COUNT) {
    return [...graphs];
  }
  return graphs.slice(-RECENT_GRAPH_COUNT);
}

export function splitWordPoolByRecentGraphs(pool, recentGraphs) {
  const recentSet = new Set((Array.isArray(recentGraphs) ? recentGraphs : [])
    .map((graph) => String(graph || "").trim())
    .filter((graph) => graph && isKnownGraph(graph)));
  const recent = [];
  const revision = [];

  for (const word of Array.isArray(pool) ? pool : []) {
    if (wordContainsAnyNonSilentGraph(word, recentSet)) {
      recent.push(word);
    } else {
      revision.push(word);
    }
  }

  return { recent, revision };
}

export function pickWeightedWord(pool, { recentGraphs = [], avoidKey = null } = {}) {
  const candidates = Array.isArray(pool) ? pool : [];
  if (!candidates.length) return null;

  const { recent, revision } = splitWordPoolByRecentGraphs(candidates, recentGraphs);
  const preferRecent = Math.random() < RECENT_POOL_WEIGHT;
  const primary = preferRecent ? recent : revision;
  const fallback = preferRecent ? revision : recent;

  return pickRandomAvoiding(primary, avoidKey)
    || pickRandomAvoiding(fallback, avoidKey)
    || pickRandomAvoiding(candidates, avoidKey)
    || candidates[0];
}

export function pickQuestion(settings, { avoidKey = null } = {}) {
  const cfg = normalizeSettings(settings);
  const pool = getWordPool(cfg);
  if (!pool.length) return null;

  const choice = pickWeightedWord(pool, {
    recentGraphs: getRecentGraphs(cfg),
    avoidKey
  }) || pool[0];

  return {
    key: questionKey(choice),
    word: choice.word,
    slug: choice.slug,
    units: cloneData(choice.units)
  };
}

export function questionKey(question) {
  if (!question) return "";
  return String(question.slug || question.word || question.key || "").trim().toLowerCase();
}

export function evaluateWordAttempt(question, answerEntries, { selectedGraphs = [] } = {}) {
  const wordUnits = Array.isArray(question?.units) ? question.units : [];
  const selectedGraphsSet = new Set((Array.isArray(selectedGraphs) ? selectedGraphs : [])
    .map((graph) => String(graph || "").trim())
    .filter((graph) => graph && isKnownGraph(graph)));

  const studentEntries = [];
  for (const entry of Array.isArray(answerEntries) ? answerEntries : []) {
    if (!entry) continue;
    if (entry.injected) continue;
    const graph = String(entry.graph ?? entry.id ?? "").trim();
    if (!graph) continue;
    studentEntries.push({
      type: "graph",
      id: graph,
      graph,
      injected: false,
      mark: "",
      title: "",
      badge: "",
      displayGraph: null
    });
  }

  const expectedUnits = wordUnits
    .map((unit) => ({
      graph: String(unit?.graph || "").trim(),
      isSilent: unit?.isSilent === true
    }))
    .filter((unit) => unit.graph);

  const m = expectedUnits.length;
  const n = studentEntries.length;
  const INS = 1.5;

  function inSamePlausibleFamily(a, b) {
    const safeA = String(a || "").trim();
    const safeB = String(b || "").trim();
    if (!safeA || !safeB) return false;
    if (!selectedGraphsSet.has(safeB)) return false;
    const familyA = getGraphFamily(safeA);
    const familyB = getGraphFamily(safeB);
    return !!familyA && familyA === familyB;
  }

  function sameVisibleLetter(a, b) {
    return visibleTextOfGraph(a) === visibleTextOfGraph(b);
  }

  function isAcceptedFallback(expected, got) {
    const fallbackGraph = getAcceptedFallbackGraph(expected);
    return !!fallbackGraph && fallbackGraph === String(got || "").trim();
  }

  function subCost(expUnit, got) {
    const expected = expUnit.graph;

    if (expUnit.isSilent) {
      if (got === expected) return 0;
      if (sameVisibleLetter(expected, got)) return 0;
      return 3;
    }

    if (got === expected) return 0;
    if (isAcceptedFallback(expected, got)) return 0;

    if (inSamePlausibleFamily(expected, got)) {
      return 1;
    }

    return 2;
  }

  function deleteCost(expUnit) {
    return expUnit.isSilent ? 0 : 1.5;
  }

  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  const bt = Array.from({ length: m + 1 }, () => Array(n + 1).fill(""));

  for (let i = 1; i <= m; i += 1) {
    dp[i][0] = dp[i - 1][0] + deleteCost(expectedUnits[i - 1]);
    bt[i][0] = "U";
  }

  for (let j = 1; j <= n; j += 1) {
    dp[0][j] = dp[0][j - 1] + INS;
    bt[0][j] = "L";
  }

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cDiag = dp[i - 1][j - 1] + subCost(expectedUnits[i - 1], studentEntries[j - 1].graph);
      const cUp = dp[i - 1][j] + deleteCost(expectedUnits[i - 1]);
      const cLeft = dp[i][j - 1] + INS;

      let best = cDiag;
      let dir = "D";

      if (cUp < best) {
        best = cUp;
        dir = "U";
      }

      if (cLeft < best) {
        best = cLeft;
        dir = "L";
      }

      dp[i][j] = best;
      bt[i][j] = dir;
    }
  }

  const aligned = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    const dir = bt[i][j] || (i > 0 ? "U" : "L");

    if (dir === "D") {
      aligned.push({
        expected: expectedUnits[i - 1],
        got: studentEntries[j - 1]
      });
      i -= 1;
      j -= 1;
      continue;
    }

    if (dir === "U") {
      aligned.push({
        expected: expectedUnits[i - 1],
        got: null
      });
      i -= 1;
      continue;
    }

    aligned.push({
      expected: null,
      got: studentEntries[j - 1]
    });
    j -= 1;
  }

  aligned.reverse();

  const displayEntries = [];
  let hasOrange = false;
  let hasRed = false;

  for (const pair of aligned) {
    if (pair.expected && pair.got) {
      const expected = pair.expected.graph;
      const got = pair.got.graph;

      if (pair.expected.isSilent) {
        if (got === expected || sameVisibleLetter(expected, got)) {
          pair.got.mark = "green-dotted";
          pair.got.title = "Lettre muette correcte.";
          pair.got.displayGraph = expected;
        } else {
          pair.got.mark = "red";
          pair.got.title = `Ici, on attendait la lettre muette ${visibleTextOfGraph(expected)}.`;
          pair.got.displayGraph = got;
          hasRed = true;
        }

        displayEntries.push(pair.got);
        continue;
      }

      if (got === expected || isAcceptedFallback(expected, got)) {
        pair.got.mark = "green";
        pair.got.title = "Correct.";
        pair.got.displayGraph = expected;
        displayEntries.push(pair.got);
        continue;
      }

      if (inSamePlausibleFamily(expected, got)) {
        pair.got.mark = "orange";
        pair.got.title = `Graphème plausible ici, mais on attendait ${visibleTextOfGraph(expected)}.`;
        pair.got.displayGraph = got;
        displayEntries.push(pair.got);
        hasOrange = true;
        continue;
      }

      pair.got.mark = "red";
      pair.got.title = `Ici, on attendait ${visibleTextOfGraph(expected)}.`;
      pair.got.displayGraph = got;
      displayEntries.push(pair.got);
      hasRed = true;
      continue;
    }

    if (pair.expected && !pair.got) {
      const expected = pair.expected.graph;

      if (pair.expected.isSilent) {
        displayEntries.push({
          type: "graph",
          id: expected,
          graph: expected,
          injected: true,
          mark: "green-dotted",
          title: "Lettre muette ajoutée automatiquement.",
          badge: "",
          displayGraph: expected
        });
      } else {
        hasRed = true;
      }
      continue;
    }

    if (!pair.expected && pair.got) {
      pair.got.mark = "red";
      pair.got.title = "Graphème en trop.";
      pair.got.displayGraph = pair.got.graph;
      displayEntries.push(pair.got);
      hasRed = true;
    }
  }

  const verdict = hasRed ? "red" : hasOrange ? "orange" : "green";

  return {
    verdict,
    entries: displayEntries
  };
}

export function evaluateLetterAttempt(question, answerEntries, { preserveSlots = false } = {}) {
  const expectedLetters = buildLetterUnitsFromWord(question?.word).map((unit) => unit.id);
  const rawEntries = Array.isArray(answerEntries) ? answerEntries : [];
  const max = preserveSlots ? expectedLetters.length : Math.max(expectedLetters.length, rawEntries.length);
  const entries = [];
  let hasRed = false;

  for (let index = 0; index < max; index += 1) {
    const expected = expectedLetters[index] || "";
    const raw = rawEntries[index] || null;
    const got = String(raw?.id ?? raw?.letter ?? raw?.graph ?? "").trim();

    if (!raw || raw.injected) {
      if (expected) hasRed = true;
      if (preserveSlots) entries.push(null);
      continue;
    }

    const isCorrect = !!expected && got === expected;
    if (!isCorrect) hasRed = true;

    entries.push({
      type: "letter",
      id: got,
      graph: got,
      letter: got,
      injected: false,
      mark: isCorrect ? "green" : "red",
      title: isCorrect ? "Correct." : expected ? `Ici, on attendait ${expected}.` : "Lettre en trop.",
      badge: "",
      displayGraph: got
    });
  }

  if (rawEntries.length > expectedLetters.length) {
    hasRed = true;
  }

  return {
    verdict: hasRed ? "red" : "green",
    entries: preserveSlots ? entries : entries.filter(Boolean)
  };
}

export function buildCanonicalAnswerEntries(question, options = {}) {
  const inputMode = normalizeInputMode(typeof options === "string" ? options : options?.inputMode);
  if (inputMode === INPUT_MODES.LETTERS) {
    return buildCanonicalLetterAnswerEntries(question);
  }
  return buildCanonicalGraphAnswerEntries(question);
}

export function buildCanonicalGraphAnswerEntries(question) {
  const units = Array.isArray(question?.units) ? question.units : [];

  return units.map((unit) => {
    const graph = String(unit?.graph || "").trim();
    const isSilent = unit?.isSilent === true;

    return {
      type: "graph",
      id: graph,
      graph,
      injected: false,
      mark: isSilent ? "green-dotted" : "green",
      title: isSilent ? "Lettre muette correcte." : "Correct.",
      badge: "",
      displayGraph: graph
    };
  }).filter((entry) => entry.graph);
}

export function buildCanonicalLetterAnswerEntries(question) {
  return buildLetterUnitsFromWord(question?.word).map((unit) => ({
    type: "letter",
    id: unit.id,
    graph: unit.id,
    letter: unit.id,
    injected: false,
    mark: "green",
    title: "Correct.",
    badge: "",
    displayGraph: unit.id
  }));
}

export function buildLetterUnitsFromWord(word) {
  return Array.from(String(word || "").normalize("NFC").toLocaleLowerCase("fr-FR"))
    .filter((char) => !/\s/u.test(char))
    .map((char) => ({ type: "letter", id: char, label: char }))
    .filter((unit) => isDisplayableLetter(unit.id));
}

export function getLetterChoicesForQuestion(question) {
  const choices = [...BASE_LETTERS];
  const seen = new Set(choices);

  for (const unit of buildLetterUnitsFromWord(question?.word)) {
    if (seen.has(unit.id)) continue;
    seen.add(unit.id);
    choices.push(unit.id);
  }

  return choices;
}

export function getLetterAsset(letter) {
  const safeLetter = String(letter || "").trim().toLocaleLowerCase("fr-FR");
  if (/^[a-z]$/.test(safeLetter)) {
    return `${safeLetter.toLocaleUpperCase("fr-FR")}.webp`;
  }
  return "";
}

export function getLetterImageUrl(letter) {
  const asset = getLetterAsset(letter);
  if (!asset) return "";
  return new URL(`../../shared/ui-assets/lettres/${asset}`, import.meta.url).href;
}

export function getAcceptedFallbackGraph(graph) {
  const safeGraph = String(graph || "").trim();
  return FALLBACKS[safeGraph] || "";
}

function normalizeInputMode(value) {
  return String(value || "").trim() === INPUT_MODES.LETTERS
    ? INPUT_MODES.LETTERS
    : INPUT_MODES.GRAPHEMES;
}

function normalizeLengthHintMode(value, legacyMode = null) {
  const safeValue = String(value || "").trim();
  if (safeValue === LENGTH_HINT_MODES.BOXES) return LENGTH_HINT_MODES.BOXES;
  if (safeValue === LENGTH_HINT_MODES.NONE) return LENGTH_HINT_MODES.NONE;
  return legacyMode === RESPONSE_MODES.CASES ? LENGTH_HINT_MODES.BOXES : LENGTH_HINT_MODES.NONE;
}

function normalizeIndividualValidationMode(value) {
  const safeValue = String(value || "").trim();
  if (safeValue === INDIVIDUAL_VALIDATION_MODES.GRAPHO_TOLERANCE) {
    return INDIVIDUAL_VALIDATION_MODES.GRAPHO_TOLERANCE;
  }
  if (safeValue === INDIVIDUAL_VALIDATION_MODES.LIMITED_ATTEMPTS) {
    return INDIVIDUAL_VALIDATION_MODES.LIMITED_ATTEMPTS;
  }
  return INDIVIDUAL_VALIDATION_MODES.UNLIMITED;
}

function normalizeGraphOrder(graphOrder) {
  const uniqueGraphs = [];
  const seen = new Set();

  for (const graph of Array.isArray(graphOrder) ? graphOrder : []) {
    const safeGraph = String(graph || "").trim();
    if (!safeGraph) continue;
    if (!GRAPH_SET.has(safeGraph)) continue;
    if (seen.has(safeGraph)) continue;
    seen.add(safeGraph);
    uniqueGraphs.push(safeGraph);
  }

  return uniqueGraphs;
}

function getGraphUnitRef(id) {
  return GRAPH_BY_ID.get(String(id || "").trim()) || null;
}

function normalizeWordCatalog(words) {
  return (Array.isArray(words) ? words : [])
    .map((word) => ({
      word: String(word?.word || "").trim(),
      slug: String(word?.slug || "").trim().toLowerCase(),
      units: normalizeWordUnits(word?.units)
    }))
    .filter((word) => word.word && word.slug && word.units.length > 0);
}

function normalizeWordUnits(units) {
  return (Array.isArray(units) ? units : [])
    .map((unit) => ({
      graph: String(unit?.graph || "").trim(),
      text: String(unit?.text || "").trim().normalize("NFC"),
      isSilent: unit?.isSilent === true
    }))
    .filter((unit) => unit.graph);
}

function resolveWordCompositions(word, selectedGraphs) {
  const units = resolveCompositionUnits(word?.units, selectedGraphs);
  return {
    ...word,
    units
  };
}

function resolveCompositionUnits(units, selectedGraphs) {
  const source = Array.isArray(units) ? units : [];
  if (!(selectedGraphs instanceof Set) || selectedGraphs.size === 0) {
    return source.map((unit) => ({ ...unit }));
  }

  const availableCompositions = GRAPH_COMPOSITIONS
    .filter((composition) => selectedGraphs.has(composition.id))
    .sort((left, right) => right.parts.length - left.parts.length);
  if (!availableCompositions.length) {
    return source.map((unit) => ({ ...unit }));
  }

  const resolved = [];
  let index = 0;
  while (index < source.length) {
    const composition = availableCompositions.find((candidate) => {
      return candidate.parts.every((part, partIndex) => {
        const unit = source[index + partIndex];
        return unitMatchesCompositionPart(unit, part);
      });
    });

    if (!composition) {
      resolved.push({ ...source[index] });
      index += 1;
      continue;
    }

    const matchedUnits = source.slice(index, index + composition.parts.length);
    resolved.push({
      graph: composition.id,
      text: matchedUnits.map((unit) => String(unit?.text || "")).join(""),
      isSilent: false
    });
    index += composition.parts.length;
  }

  return resolved;
}

function unitMatchesCompositionPart(unit, part) {
  if (!unit || !part) return false;
  if (String(unit.graph || "").trim() !== String(part.graph || "").trim()) return false;
  if (typeof part.isSilent === "boolean" && (unit.isSilent === true) !== part.isSilent) return false;
  if (part.text) {
    const unitText = String(unit.text || "").normalize("NFC").toLocaleLowerCase("fr-FR");
    const expectedText = String(part.text).normalize("NFC").toLocaleLowerCase("fr-FR");
    if (unitText !== expectedText) return false;
  }
  return true;
}

function getGraphsForStarterSelection() {
  return getGraphsForPresetLevel(1);
}

function getGraphsForPresetLevel(level) {
  const maxLevel = clampInt(level, 1, LEVELS.length || 1, 1);
  const out = [];
  const seen = new Set();

  for (const entry of LEVELS) {
    if (entry.level > maxLevel) break;
    for (const graph of entry.graphs || []) {
      const safeGraph = String(graph || "").trim();
      if (!safeGraph || seen.has(safeGraph)) continue;
      if (!GRAPH_SET.has(safeGraph)) continue;
      seen.add(safeGraph);
      out.push(safeGraph);
    }
  }

  return out;
}

function isWordGraphPlayable(word, selectedGraphs) {
  const units = Array.isArray(word?.units) ? word.units : [];
  if (!units.length) return false;

  return units.every((unit) => {
    if (!unit) return false;
    const graph = String(unit.graph || "").trim();
    if (!graph) return false;

    const fallbackGraph = getAcceptedFallbackGraph(graph);
    const isKnownOrAliased = isKnownGraph(graph) || !!fallbackGraph;
    if (!isKnownOrAliased) return false;

    if (unit.isSilent === true) return true;
    if (selectedGraphs.has(graph)) return true;
    return !!fallbackGraph && selectedGraphs.has(fallbackGraph);
  });
}

function isWordLetterPlayable(word) {
  const expected = buildLetterUnitsFromWord(word?.word);
  const raw = Array.from(String(word?.word || "").normalize("NFC").toLocaleLowerCase("fr-FR"))
    .filter((char) => !/\s/u.test(char));
  return raw.length > 0 && expected.length === raw.length;
}

function wordContainsAnyNonSilentGraph(word, recentSet) {
  if (!(recentSet instanceof Set) || recentSet.size === 0) return false;
  return (Array.isArray(word?.units) ? word.units : []).some((unit) => {
    if (!unit || unit.isSilent === true) return false;
    const graph = String(unit.graph || "").trim();
    if (recentSet.has(graph)) return true;
    const fallbackGraph = getAcceptedFallbackGraph(graph);
    return !!fallbackGraph && recentSet.has(fallbackGraph);
  });
}

function pickRandomAvoiding(pool, avoidKey) {
  const candidates = Array.isArray(pool) ? pool : [];
  if (!candidates.length) return null;
  const usable = avoidKey
    ? candidates.filter((item) => questionKey(item) !== avoidKey)
    : candidates;
  if (!usable.length) return null;
  return usable[Math.floor(Math.random() * usable.length)] || null;
}

function isDisplayableLetter(char) {
  return /^\p{L}$/u.test(String(char || ""));
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampInt(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}
