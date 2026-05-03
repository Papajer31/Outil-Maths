import {
  LEVELS,
  GRAPH_ORDER,
  PLAUSIBLE_GROUPS,
  VARIANT_HINTS,
  FALLBACKS
} from "./graphs-data.js";

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
const MIN_INDIVIDUAL_MAX_ATTEMPTS = 1;
const MAX_INDIVIDUAL_MAX_ATTEMPTS = 12;

const GRAPH_SET = new Set(GRAPH_ORDER);
let WORD_CATALOG = [];

export function setWordCatalog(words) {
  WORD_CATALOG = normalizeWordCatalog(words);
}

export function getWordCatalog() {
  return cloneData(WORD_CATALOG);
}

export function getDefaultSettings() {
  return {
    mode: RESPONSE_MODES.LIBRE,
    individualValidationMode: INDIVIDUAL_VALIDATION_MODES.UNLIMITED,
    individualMaxAttempts: DEFAULT_INDIVIDUAL_MAX_ATTEMPTS,
    graphOrder: getGraphsForStarterSelection()
  };
}

export function getAvailableGraphs() {
  return [...GRAPH_ORDER];
}

const GRAPH_FILENAME_OVERRIDES = Object.freeze({
  "é": "e_aigu",
  "è": "e_grave",
  "ê": "e_circonflexe",
  "ç": "c_cedille"
});

export function getGraphFilename(graph) {
  const safeGraph = String(graph || "").trim();
  if (!safeGraph) return "";

  const baseName = GRAPH_FILENAME_OVERRIDES[safeGraph] || safeGraph;
  if (/^[a-z0-9_]+$/i.test(baseName)) {
    return `${baseName}.jpg`;
  }

  return `${encodeLegacyFilenameBase(baseName)}.jpg`;
}

export function getGraphLabel(graph) {
  const example = VARIANT_HINTS[String(graph || "").trim()];
  if (example) {
    return `${visibleTextOfGraph(graph)} (${example})`;
  }
  return visibleTextOfGraph(graph);
}

export function normalizeSettings(settings) {
  const base = {
    ...getDefaultSettings(),
    ...(settings ?? {})
  };

  base.mode = base.mode === RESPONSE_MODES.CASES
    ? RESPONSE_MODES.CASES
    : RESPONSE_MODES.LIBRE;

  base.individualValidationMode = normalizeIndividualValidationMode(base.individualValidationMode);
  base.individualMaxAttempts = clampInt(
    base.individualMaxAttempts,
    MIN_INDIVIDUAL_MAX_ATTEMPTS,
    MAX_INDIVIDUAL_MAX_ATTEMPTS,
    DEFAULT_INDIVIDUAL_MAX_ATTEMPTS
  );

  const uniqueGraphs = [];
  const seen = new Set();

  for (const graph of Array.isArray(base.graphOrder) ? base.graphOrder : []) {
    const safeGraph = String(graph || "").trim();
    if (!safeGraph) continue;
    if (!GRAPH_SET.has(safeGraph)) continue;
    if (seen.has(safeGraph)) continue;
    seen.add(safeGraph);
    uniqueGraphs.push(safeGraph);
  }

  base.graphOrder = uniqueGraphs;

  return {
    mode: base.mode,
    individualValidationMode: base.individualValidationMode,
    individualMaxAttempts: base.individualMaxAttempts,
    graphOrder: base.graphOrder
  };
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

export function getWordPool(settings) {
  const cfg = normalizeSettings(settings);
  const selectedGraphs = new Set(cfg.graphOrder);

  return WORD_CATALOG.filter((word) => isWordPlayable(word, selectedGraphs));
}

export function getSelectedGraphUsageStats(settings) {
  const cfg = normalizeSettings(settings);
  const pool = getWordPool(cfg);
  const counts = new Map(cfg.graphOrder.map((graph) => [graph, 0]));

  for (const word of pool) {
    for (const unit of Array.isArray(word?.units) ? word.units : []) {
      const graph = String(unit?.graph || "").trim();
      if (!counts.has(graph)) continue;
      counts.set(graph, counts.get(graph) + 1);
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

export function pickQuestion(settings, { avoidKey = null } = {}) {
  const pool = getWordPool(settings);
  if (!pool.length) return null;

  let choice = null;

  if (pool.length === 1) {
    choice = pool[0];
  } else {
    for (let attempt = 0; attempt < 60; attempt += 1) {
      const candidate = pool[Math.floor(Math.random() * pool.length)];
      if (!avoidKey || questionKey(candidate) !== avoidKey) {
        choice = candidate;
        break;
      }
      if (!choice) choice = candidate;
    }
  }

  choice ||= pool[0];

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

export function visibleTextOfGraph(graph) {
  if (graph === "s1" || graph === "s2") return "s";
  if (graph === "c1" || graph === "c2") return "c";
  if (graph === "g1" || graph === "g2") return "g";
  return String(graph || "");
}

export function evaluateWordAttempt(question, answerEntries, { selectedGraphs = [] } = {}) {
  const wordUnits = Array.isArray(question?.units) ? question.units : [];
  const selectedGraphsSet = new Set((Array.isArray(selectedGraphs) ? selectedGraphs : []).map((graph) => String(graph || "").trim()).filter(Boolean));

  const studentEntries = [];
  for (const entry of Array.isArray(answerEntries) ? answerEntries : []) {
    if (!entry) continue;
    if (entry.injected) continue;
    studentEntries.push({
      graph: entry.graph,
      injected: false,
      mark: "",
      title: "",
      badge: "",
      displayGraph: null
    });
  }

  const expectedUnits = wordUnits.map((unit) => ({
    graph: unit.graph,
    isSilent: unit.isSilent === true
  }));

  const m = expectedUnits.length;
  const n = studentEntries.length;
  const INS = 1.5;

  function inSamePlausibleClass(a, b) {
    const safeA = String(a || "").trim();
    const safeB = String(b || "").trim();
    if (!safeA || !safeB) return false;
    return PLAUSIBLE_GROUPS.some((group) => group.includes(safeA) && group.includes(safeB));
  }

  function isVariantGroup(graph) {
    return graph === "s1" || graph === "s2" || graph === "c1" || graph === "c2" || graph === "g1" || graph === "g2";
  }

  function sameVisibleLetter(a, b) {
    return visibleTextOfGraph(a) === visibleTextOfGraph(b);
  }

  function makeVariantTooltip(expected, got) {
    const expHint = VARIANT_HINTS[expected] ?? expected;
    const gotHint = VARIANT_HINTS[got] ?? got;
    const letter = visibleTextOfGraph(expected);
    return `Tu as choisi le ${letter} de "${gotHint}", ici c’est plutôt le ${letter} de "${expHint}".`;
  }

  function subCost(expUnit, got) {
    const expected = expUnit.graph;

    if (expUnit.isSilent) {
      if (got === expected) return 0;
      if (sameVisibleLetter(expected, got)) return 0;
      return 3;
    }

    if (got === expected) return 0;

    if (isVariantGroup(expected) && isVariantGroup(got) && sameVisibleLetter(expected, got)) {
      return 0.2;
    }

    if (inSamePlausibleClass(expected, got) && selectedGraphsSet.has(got)) {
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
          pair.got.displayGraph = visibleTextOfGraph(expected);
        } else {
          pair.got.mark = "red";
          pair.got.title = `Ici, on attendait la lettre muette ${visibleTextOfGraph(expected)}.`;
          pair.got.displayGraph = visibleTextOfGraph(got);
          hasRed = true;
        }

        displayEntries.push(pair.got);
        continue;
      }

      if (got === expected) {
        pair.got.mark = "green";
        pair.got.title = "Correct.";
        pair.got.displayGraph = visibleTextOfGraph(expected);
        displayEntries.push(pair.got);
        continue;
      }

      if (isVariantGroup(expected) && isVariantGroup(got) && sameVisibleLetter(expected, got)) {
        pair.got.mark = "orange";
        pair.got.title = makeVariantTooltip(expected, got);
        pair.got.displayGraph = visibleTextOfGraph(expected);
        displayEntries.push(pair.got);
        hasOrange = true;
        continue;
      }

      if (inSamePlausibleClass(expected, got) && selectedGraphsSet.has(got)) {
        pair.got.mark = "orange";
        pair.got.title = `Graphème plausible ici, mais on attendait ${visibleTextOfGraph(expected)}.`;
        pair.got.displayGraph = visibleTextOfGraph(got);
        displayEntries.push(pair.got);
        hasOrange = true;
        continue;
      }

      pair.got.mark = "red";
      pair.got.title = `Ici, on attendait ${visibleTextOfGraph(expected)}.`;
      pair.got.displayGraph = visibleTextOfGraph(got);
      displayEntries.push(pair.got);
      hasRed = true;
      continue;
    }

    if (pair.expected && !pair.got) {
      const expected = pair.expected.graph;

      if (pair.expected.isSilent) {
        displayEntries.push({
          graph: expected,
          injected: true,
          mark: "green-dotted",
          title: "Lettre muette ajoutée automatiquement.",
          badge: "",
          displayGraph: visibleTextOfGraph(expected)
        });
      } else {
        hasRed = true;
      }
      continue;
    }

    if (!pair.expected && pair.got) {
      pair.got.mark = "red";
      pair.got.title = "Graphème en trop.";
      pair.got.displayGraph = visibleTextOfGraph(pair.got.graph);
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

export function buildCanonicalAnswerEntries(question) {
  const units = Array.isArray(question?.units) ? question.units : [];

  return units.map((unit) => {
    const graph = String(unit?.graph || "").trim();
    const isSilent = unit?.isSilent === true;

    return {
      graph,
      injected: false,
      mark: isSilent ? "green-dotted" : "green",
      title: isSilent ? "Lettre muette correcte." : "Correct.",
      badge: "",
      displayGraph: visibleTextOfGraph(graph)
    };
  }).filter((entry) => entry.graph);
}

export function getAcceptedFallbackGraph(graph) {
  const safeGraph = String(graph || "").trim();
  return FALLBACKS[safeGraph] || "";
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
      isSilent: unit?.isSilent === true
    }))
    .filter((unit) => unit.graph);
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

function isWordPlayable(word, selectedGraphs) {
  const units = Array.isArray(word?.units) ? word.units : [];
  if (!units.length) return false;

  return units.every((unit) => {
    if (!unit) return false;
    if (unit.isSilent === true) return true;
    return selectedGraphs.has(String(unit.graph || "").trim());
  });
}

function encodeLegacyFilenameBase(graph) {
  const safeGraph = String(graph || "");
  let out = "";

  for (const char of safeGraph) {
    const code = char.codePointAt(0);
    if (code == null) continue;

    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122)) {
      out += char;
    } else {
      out += `#U${code.toString(16).padStart(4, "0")}`;
    }
  }

  return out;
}

function cloneData(value) {
  return JSON.parse(JSON.stringify(value));
}

function clampInt(value, min, max, fallback = min) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}
