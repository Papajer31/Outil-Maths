import { PHONOLOGY_GRAPH_BY_ID } from "./phonology-graph-data.js";
import { getPhonemeTargets } from "./phonology-targets.js";
import {
  findPhonologyTargetOccurrences,
  getPhonologyUnitSurfaceText,
  normalizePhonologySpelling
} from "./phonology-target-matcher.js";
import { findGraphemicOccurrences, normalizeGraphemicEntry } from "./graphemic-targets.js";

export const PHONOLOGY_RELEVANCE_LEVELS = Object.freeze([
  Object.freeze({ id:"simple", label:"Simple", min:90, max:100 }),
  Object.freeze({ id:"normal", label:"Normal", min:80, max:89.999 }),
  Object.freeze({ id:"complexe", label:"Complexe", min:60, max:79.999 })
]);

export const PHONOLOGY_RELEVANCE_THRESHOLDS = Object.freeze({
  simple: 90,
  normal: 80,
  complexe: 60
});

// Le niveau choisi ne change jamais le score objectif d’un mot. Il définit
// uniquement la distribution des catégories dans lesquelles le tirage peut
// puiser. Les pourcentages sont statistiques : ils convergent sur la durée et
// sont renormalisés automatiquement si une catégorie n’a plus de candidats.
export const PHONOLOGY_RELEVANCE_SELECTION_WEIGHTS = Object.freeze({
  simple:Object.freeze({ simple:1 }),
  normal:Object.freeze({ normal:0.70, simple:0.30 }),
  complexe:Object.freeze({ complexe:0.70, normal:0.20, simple:0.10 })
});

const DEFAULT_LEVEL = "normal";
const SIMPLE_VOWEL_TARGET_CATEGORIES = new Set(["vowels", "nasals"]);
const GLIDE_BEARING_GRAPH_IDS = new Set([
  "i_yod", "y_yod", "il_yod", "ill", "ill_ij",
  "u_glisse", "ou_glisse", "w_w", "i_ij", "y_ij"
]);
const POLYPHONEMIC_GRAPH_IDS = new Set([
  "i_ij", "y_ij", "x_ks", "x_gz", "qu_kw", "oe_wa", "oê_wa"
]);
const SCHWA_GRAPH_IDS = new Set(["e_schwa", "ai_schwa", "on_schwa"]);
const STRONGLY_CONTEXTUAL_COSTS = Object.freeze({
  b_p: 0.20,
  c_g: 0.18,
  gh: 0.20,
  w_v: 0.16,
  x_s: 0.18,
  x_z: 0.18,
  t_s: 0.16,
  ch_k: 0.14,
  c_s: 0.11,
  g_j: 0.11,
  s_z: 0.10,
  sc: 0.10,
  ge: 0.08,
  ç: 0.06,
  qu: 0.05,
  gu: 0.05,
  ph: 0.05,
  th: 0.05
});

const TARGETS = getPhonemeTargets();
const DIRECT_MEMBERSHIPS_BY_GRAPH = buildDirectMembershipIndex(TARGETS);
// Ces familles sont des propriétés des unités de la banque, pas des cibles du
// sélecteur phonémique. Elles restent donc connues du moteur de pertinence même
// après le nettoyage du référentiel phono strict.
const COMPOSITION_GRAPH_IDS = new Set([
  "oi", "oy", "ay", "ay_ferme", "ay_ei", "oin", "ui", "ien", "ion",
  "ouil", "ouille", "ail", "aille", "eil", "eille", "euil", "euille"
]);
const VOWEL_LIKE_GRAPH_IDS = new Set([
  ...TARGETS.filter((target) => ["vowels", "nasals", "semivowels"].includes(target.category))
    .flatMap((target) => target.graphIds || []),
  ...GLIDE_BEARING_GRAPH_IDS,
  ...COMPOSITION_GRAPH_IDS
]);

export function normalizePhonologyRelevanceLevel(value) {
  const id = String(value || "").trim().toLocaleLowerCase("fr-FR");
  return PHONOLOGY_RELEVANCE_LEVELS.some((level) => level.id === id) ? id : DEFAULT_LEVEL;
}

export function classifyPhonologyRelevanceScore(score) {
  const value = Number(score);
  if (!Number.isFinite(value) || value < PHONOLOGY_RELEVANCE_THRESHOLDS.complexe) return "excluded";
  if (value >= PHONOLOGY_RELEVANCE_THRESHOLDS.simple) return "simple";
  if (value >= PHONOLOGY_RELEVANCE_THRESHOLDS.normal) return "normal";
  return "complexe";
}

export function getPhonologyRelevanceSelectionWeights(relevanceLevel) {
  const level = normalizePhonologyRelevanceLevel(relevanceLevel);
  return { ...PHONOLOGY_RELEVANCE_SELECTION_WEIGHTS[level] };
}

export function isPhonologyRelevanceCategoryAllowed(category, relevanceLevel) {
  const id = String(category || "").trim().toLocaleLowerCase("fr-FR");
  return Number(getPhonologyRelevanceSelectionWeights(relevanceLevel)[id]) > 0;
}

export function pickPhonologyRelevanceCategory(availableCategories, relevanceLevel, random = Math.random) {
  const available = new Set((Array.isArray(availableCategories) ? availableCategories : [])
    .map((category) => String(category || "").trim().toLocaleLowerCase("fr-FR"))
    .filter(Boolean));
  const weights = getPhonologyRelevanceSelectionWeights(relevanceLevel);
  const candidates = Object.entries(weights)
    .filter(([category, weight]) => available.has(category) && Number(weight) > 0);
  if (!candidates.length) return "";

  const totalWeight = candidates.reduce((sum, [, weight]) => sum + Number(weight), 0);
  if (!(totalWeight > 0)) return candidates[0][0];
  const raw = Number(typeof random === "function" ? random() : Math.random());
  const unit = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999999, raw)) : Math.random();
  let cursor = unit * totalWeight;
  for (const [category, weight] of candidates) {
    cursor -= Number(weight);
    if (cursor < 0) return category;
  }
  return candidates[candidates.length - 1][0];
}

export function scorePhonologyWord(word, target, {
  enabledSpellings = null,
  requireAllOccurrencesAllowed = true
} = {}) {
  const safeWord = normalizeWord(word);
  const safeTarget = target && typeof target === "object" ? target : null;
  if (!safeWord.word || !safeWord.units.length || !safeTarget?.id) {
    return excludedResult("invalid_input", "Mot ou cible invalide.");
  }

  const allOccurrences = findPhonologyTargetOccurrences(safeWord.units, safeTarget);
  if (!allOccurrences.length) {
    return excludedResult("target_absent", "Le son ciblé est absent du mot.");
  }

  const allowedSpellings = enabledSpellings === null
    ? new Set((safeTarget.spellings || []).map(normalizePhonologySpelling).filter(Boolean))
    : new Set((Array.isArray(enabledSpellings) ? enabledSpellings : []).map(normalizePhonologySpelling).filter(Boolean));
  const allowedOccurrences = allOccurrences.filter((occurrence) => allowedSpellings.has(normalizePhonologySpelling(occurrence.spelling)));

  if (!allowedOccurrences.length) {
    return excludedResult("selected_spelling_absent", "Aucune occurrence n’utilise une graphie sélectionnée.", { allOccurrences });
  }
  if (requireAllOccurrencesAllowed && allowedOccurrences.length !== allOccurrences.length) {
    return excludedResult("unselected_target_spelling", "Le mot contient aussi le son ciblé avec une graphie non sélectionnée.", { allOccurrences });
  }

  const occurrences = requireAllOccurrencesAllowed ? allOccurrences : allowedOccurrences;
  const layout = buildWordLayout(safeWord);
  const occurrenceDetails = occurrences.map((occurrence) => scoreOccurrence(safeWord, occurrence, safeTarget, layout));
  const purityNormalized = aggregateOccurrencePurity(occurrenceDetails);
  const occurrenceNormalized = scoreOccurrenceCount(occurrences.length);
  const structureDetail = scoreWordStructure(safeWord, occurrences, layout);
  const targetIndexes = new Set(occurrences.flatMap((occurrence) => occurrence.indexes || []));
  const cleanlinessDetail = scoreParasiteCleanliness(safeWord, targetIndexes);
  const familiarityNormalized = clamp(safeWord.familiarity / 100, 0, 1);

  const components = {
    purity: component(purityNormalized, 30),
    occurrences: component(occurrenceNormalized, 10),
    structure: component(structureDetail.normalized, 15),
    cleanliness: component(cleanlinessDetail.normalized, 30),
    familiarity: component(familiarityNormalized, 15)
  };

  const rawScore = round1(Object.values(components).reduce((total, item) => total + item.points, 0));
  const severePurityIssue = occurrenceDetails.some((detail) => detail.severePurityIssue === true);
  // Une voyelle/nasale perceptivement soudée à une semi-voyelle dans la même syllabe
  // reste linguistiquement présente, mais n'est pas un exemple pédagogique exploitable
  // du phonème simple. La familiarité ou la brièveté du mot ne doivent pas pouvoir la sauver.
  const severePurityCeiling = PHONOLOGY_RELEVANCE_THRESHOLDS.complexe - 0.1;
  const score = severePurityIssue ? Math.min(rawScore, severePurityCeiling) : rawScore;
  const category = classifyPhonologyRelevanceScore(score);

  return {
    compatible: true,
    score,
    rawScore,
    category,
    targetId: safeTarget.id,
    occurrenceCount: occurrences.length,
    occurrences: occurrenceDetails,
    components,
    structure: structureDetail,
    cleanliness: cleanlinessDetail,
    familiarity: safeWord.familiarity,
    severePurityIssue,
    exclusionReason: category === "excluded"
      ? (severePurityIssue ? "severe_target_impurity" : "score_below_threshold")
      : ""
  };
}

export function scoreGraphemicWord(word, graphemeOrTarget) {
  const safeWord = normalizeWord(word);
  const grapheme = normalizeGraphemicEntry(graphemeOrTarget?.grapheme || graphemeOrTarget);
  if (!safeWord.word || !safeWord.units.length || !grapheme) {
    return excludedResult("invalid_input", "Mot ou entrée graphémique invalide.");
  }

  const charOccurrences = findGraphemicOccurrences(safeWord.word, grapheme);
  if (!charOccurrences.length) {
    return excludedResult("target_absent", "La graphie ciblée est absente du mot.");
  }

  const layout = buildWordLayout(safeWord);
  const occurrences = charOccurrences.map((occurrence) => {
    const unitIndexes = layout.unitSpans
      .map((span, index) => ({ span, index }))
      .filter(({ span }) => occurrence.start < span.end && occurrence.end > span.start)
      .map(({ index }) => index);
    const syllableIndexes = Array.from(new Set(layout.syllableSpans
      .map((span, index) => ({ span, index }))
      .filter(({ span }) => occurrence.start < span.end && occurrence.end > span.start)
      .map(({ index }) => index)));
    const purity = syllableIndexes.length <= 1 ? 1 : 0.72;
    return {
      indexes:unitIndexes,
      spelling:String(occurrence.spelling || grapheme),
      syllableIndexes,
      purity,
      severePurityIssue:false,
      reasons:syllableIndexes.length > 1 ? ["graphie répartie sur plusieurs syllabes"] : []
    };
  }).filter((occurrence) => occurrence.indexes.length);

  if (!occurrences.length) {
    return excludedResult("target_alignment_failed", "La graphie est présente mais ne peut pas être alignée sur le codage du mot.");
  }

  const purityNormalized = aggregateOccurrencePurity(occurrences);
  const occurrenceNormalized = scoreOccurrenceCount(occurrences.length);
  const structureDetail = scoreWordStructure(safeWord, occurrences, layout);
  const targetIndexes = new Set(occurrences.flatMap((occurrence) => occurrence.indexes));
  const cleanlinessDetail = scoreParasiteCleanliness(safeWord, targetIndexes);
  const familiarityNormalized = clamp(safeWord.familiarity / 100, 0, 1);

  const components = {
    purity:component(purityNormalized, 30),
    occurrences:component(occurrenceNormalized, 10),
    structure:component(structureDetail.normalized, 15),
    cleanliness:component(cleanlinessDetail.normalized, 30),
    familiarity:component(familiarityNormalized, 15)
  };
  const score = round1(Object.values(components).reduce((total, item) => total + item.points, 0));
  const category = classifyPhonologyRelevanceScore(score);

  return {
    compatible:true,
    score,
    rawScore:score,
    category,
    targetId:`grapheme:${grapheme}`,
    grapheme,
    occurrenceCount:occurrences.length,
    occurrences,
    components,
    structure:structureDetail,
    cleanliness:cleanlinessDetail,
    familiarity:safeWord.familiarity,
    severePurityIssue:false,
    exclusionReason:category === "excluded" ? "score_below_threshold" : ""
  };
}

export function filterGraphemicWordsByRelevance(words, grapheme, relevanceLevel) {
  const level = normalizePhonologyRelevanceLevel(relevanceLevel);
  return (Array.isArray(words) ? words : [])
    .map((word) => ({ word, relevance:scoreGraphemicWord(word, grapheme) }))
    .filter((entry) => entry.relevance.compatible && entry.relevance.category === level)
    .sort((left, right) => right.relevance.score - left.relevance.score
      || String(left.word?.word || "").localeCompare(String(right.word?.word || ""), "fr"));
}

export function rankPhonologyWords(words, target, options = {}) {
  return (Array.isArray(words) ? words : [])
    .map((word) => ({ word, relevance:scorePhonologyWord(word, target, options) }))
    .filter((entry) => entry.relevance.compatible)
    .sort((left, right) => right.relevance.score - left.relevance.score
      || String(left.word?.word || "").localeCompare(String(right.word?.word || ""), "fr"));
}

export function filterPhonologyWordsByRelevance(words, target, relevanceLevel, options = {}) {
  const level = normalizePhonologyRelevanceLevel(relevanceLevel);
  return rankPhonologyWords(words, target, options)
    .filter((entry) => entry.relevance.category === level);
}

export function getPhonologyGraphPedagogicalCost(graphId, unit = null) {
  if (unit?.isSilent === true || String(graphId || "") === "__silent__") return 0.06;
  const id = String(graphId || "").trim();
  if (!id) return 0;
  if (POLYPHONEMIC_GRAPH_IDS.has(id)) return 0.22;
  if (COMPOSITION_GRAPH_IDS.has(id)) return 0.16;
  if (GLIDE_BEARING_GRAPH_IDS.has(id)) return 0.14;
  if (SCHWA_GRAPH_IDS.has(id)) return 0.08;
  if (isDoubleConsonantCode(id)) return 0.08;

  const explicit = Number(STRONGLY_CONTEXTUAL_COSTS[id]);
  if (Number.isFinite(explicit)) return explicit;

  const memberships = DIRECT_MEMBERSHIPS_BY_GRAPH.get(id) || [];
  let cost = memberships.reduce((highest, membership) => {
    if (membership.category === "nasals") return Math.max(highest, membership.index === 0 ? 0.04 : 0.07);
    if (membership.category === "vowels") return Math.max(highest, membership.index === 0 ? 0 : Math.min(0.08, 0.025 + membership.index * 0.007));
    if (membership.category === "consonants") return Math.max(highest, membership.index === 0 ? 0 : Math.min(0.08, 0.02 + membership.index * 0.012));
    return highest;
  }, 0);

  const surfaceLength = Array.from(getPhonologyUnitSurfaceText(unit || { graph:id })).length;
  if (surfaceLength > 1 && cost < 0.04) cost = 0.02;
  return round3(cost);
}

export function getPhonologyRelevanceLabel(category) {
  if (category === "simple") return "Simple";
  if (category === "normal") return "Normal";
  if (category === "complexe") return "Complexe";
  return "Exclu";
}

function scoreOccurrence(word, occurrence, target, layout) {
  const indexes = Array.isArray(occurrence?.indexes) ? occurrence.indexes : [];
  const syllableIndexes = Array.from(new Set(indexes
    .map((index) => layout.unitToSyllable[index])
    .filter((value) => Number.isInteger(value) && value >= 0)));
  let normalized = 1;
  const reasons = [];
  let severePurityIssue = false;

  if (syllableIndexes.length > 1) {
    normalized *= 0.55;
    reasons.push("occurrence répartie sur plusieurs syllabes");
  }

  if (SIMPLE_VOWEL_TARGET_CATEGORIES.has(target.category)) {
    const firstIndex = Math.min(...indexes);
    const lastIndex = Math.max(...indexes);
    const occurrenceSyllable = syllableIndexes.length === 1 ? syllableIndexes[0] : -1;
    const neighbors = [
      findNeighborUnitIndex(word.units, firstIndex, -1),
      findNeighborUnitIndex(word.units, lastIndex, 1)
    ].filter((index) => index >= 0);

    for (const neighborIndex of neighbors) {
      const neighbor = word.units[neighborIndex];
      const neighborGraph = String(neighbor?.graph || "");
      if (!GLIDE_BEARING_GRAPH_IDS.has(neighborGraph)) continue;
      if (occurrenceSyllable < 0 || layout.unitToSyllable[neighborIndex] !== occurrenceSyllable) continue;
      normalized = Math.min(normalized, 0.15);
      severePurityIssue = true;
      reasons.push(`semi-voyelle adjacente dans la même syllabe (${neighborGraph})`);
    }
  }

  return {
    indexes:[...indexes],
    spelling: normalizePhonologySpelling(occurrence?.spelling),
    syllableIndexes,
    purity:round3(clamp(normalized, 0, 1)),
    severePurityIssue,
    reasons
  };
}

function aggregateOccurrencePurity(details) {
  if (!details.length) return 0;
  const values = details.map((detail) => clamp(Number(detail.purity) || 0, 0, 1));
  const worst = Math.min(...values);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return clamp(worst * 0.70 + average * 0.30, 0, 1);
}

function scoreOccurrenceCount(count) {
  if (count <= 1) return 1;
  if (count === 2) return 0.72;
  if (count === 3) return 0.50;
  if (count === 4) return 0.32;
  return 0.20;
}

function scoreWordStructure(word, occurrences, layout) {
  const letterCount = Array.from(word.word).filter((char) => /\p{L}/u.test(char)).length;
  const syllableCount = word.syllables.length || 1;
  const lengthScore = letterCount <= 4 ? 1 : clamp(1 - (letterCount - 4) * 0.06, 0.35, 1);
  const syllableScore = syllableCount <= 1 ? 1
    : syllableCount === 2 ? 0.92
      : syllableCount === 3 ? 0.80
        : syllableCount === 4 ? 0.66
          : syllableCount === 5 ? 0.52
            : 0.40;

  const occurrenceSyllables = Array.from(new Set(occurrences.flatMap((occurrence) => (occurrence.indexes || [])
    .map((index) => layout.unitToSyllable[index])
    .filter((value) => Number.isInteger(value) && value >= 0))));
  const targetSyllableLengths = occurrenceSyllables.map((index) => Array.from(word.syllables[index] || word.word).length);
  const worstTargetSyllableLength = targetSyllableLengths.length ? Math.max(...targetSyllableLengths) : letterCount;
  const targetSyllableScore = worstTargetSyllableLength <= 3 ? 1
    : worstTargetSyllableLength === 4 ? 0.90
      : worstTargetSyllableLength === 5 ? 0.78
        : worstTargetSyllableLength === 6 ? 0.65
          : 0.50;

  const maxConsonantCluster = getMaxConsonantCluster(word, layout);
  const clusterScore = maxConsonantCluster <= 1 ? 1
    : maxConsonantCluster === 2 ? 0.90
      : maxConsonantCluster === 3 ? 0.72
        : maxConsonantCluster === 4 ? 0.55
          : 0.40;

  const normalized = clamp(
    lengthScore * 0.35
      + syllableScore * 0.35
      + targetSyllableScore * 0.20
      + clusterScore * 0.10,
    0,
    1
  );

  return {
    normalized:round3(normalized),
    letterCount,
    syllableCount,
    worstTargetSyllableLength,
    maxConsonantCluster,
    factors:{
      length:round3(lengthScore),
      syllables:round3(syllableScore),
      targetSyllable:round3(targetSyllableScore),
      consonantCluster:round3(clusterScore)
    }
  };
}

function scoreParasiteCleanliness(word, targetIndexes) {
  const units = [];
  let totalCost = 0;
  word.units.forEach((unit, index) => {
    if (targetIndexes.has(index)) return;
    const cost = getPhonologyGraphPedagogicalCost(unit?.graph, unit);
    totalCost += cost;
    if (cost > 0) {
      units.push({
        index,
        graph:String(unit?.graph || ""),
        text:getPhonologyUnitSurfaceText(unit),
        cost:round3(cost),
        isSilent:unit?.isSilent === true
      });
    }
  });
  const normalized = clamp(Math.exp(-1.45 * totalCost), 0, 1);
  return {
    normalized:round3(normalized),
    totalCost:round3(totalCost),
    units
  };
}

function buildWordLayout(word) {
  const unitSpans = [];
  let unitCursor = 0;
  word.units.forEach((unit) => {
    const length = Array.from(getPhonologyUnitSurfaceText(unit)).length;
    unitSpans.push({ start:unitCursor, end:unitCursor + length });
    unitCursor += length;
  });

  const syllableSpans = [];
  let syllableCursor = 0;
  const sourceSyllables = word.syllables.length ? word.syllables : [word.word];
  sourceSyllables.forEach((syllable) => {
    const length = Array.from(String(syllable || "")).length;
    syllableSpans.push({ start:syllableCursor, end:syllableCursor + length });
    syllableCursor += length;
  });

  const unitToSyllable = unitSpans.map((unitSpan) => {
    const index = syllableSpans.findIndex((syllableSpan) => unitSpan.start < syllableSpan.end && unitSpan.end > syllableSpan.start);
    return index >= 0 ? index : 0;
  });
  return { unitSpans, syllableSpans, unitToSyllable };
}

function getMaxConsonantCluster(word, layout) {
  let maxCluster = 0;
  for (let syllableIndex = 0; syllableIndex < (word.syllables.length || 1); syllableIndex += 1) {
    let current = 0;
    word.units.forEach((unit, unitIndex) => {
      if (layout.unitToSyllable[unitIndex] !== syllableIndex) return;
      const graphId = String(unit?.graph || "");
      if (unit?.isSilent === true || VOWEL_LIKE_GRAPH_IDS.has(graphId)) {
        current = 0;
        return;
      }
      current += 1;
      maxCluster = Math.max(maxCluster, current);
    });
  }
  return maxCluster;
}

function findNeighborUnitIndex(units, startIndex, direction) {
  for (let index = startIndex + direction; index >= 0 && index < units.length; index += direction) {
    if (units[index]?.isSilent === true) continue;
    return index;
  }
  return -1;
}

function normalizeWord(word) {
  return {
    ...word,
    word:String(word?.word || "").trim().normalize("NFC"),
    units:(Array.isArray(word?.units) ? word.units : []).map((unit) => ({
      graph:String(unit?.graph || "").trim(),
      text:String(unit?.text || "").trim().normalize("NFC"),
      isSilent:unit?.isSilent === true
    })).filter((unit) => unit.graph),
    syllables:(Array.isArray(word?.syllables) ? word.syllables : [])
      .map((syllable) => String(syllable || "").trim().normalize("NFC"))
      .filter(Boolean),
    familiarity:Number.isFinite(Number(word?.familiarity))
      ? clamp(Math.round(Number(word.familiarity)), 0, 100)
      : 50
  };
}

function buildDirectMembershipIndex(targets) {
  const map = new Map();
  for (const target of targets) {
    (target.graphIds || []).forEach((graphId, index) => {
      if (!map.has(graphId)) map.set(graphId, []);
      map.get(graphId).push({ targetId:target.id, category:target.category, index });
    });
  }
  return map;
}

function isDoubleConsonantCode(id) {
  const chars = Array.from(String(id || ""));
  return chars.length === 2 && chars[0] === chars[1] && /^[bcdfgjlmnprstz]$/i.test(chars[0]);
}

function component(normalized, weight) {
  const safe = clamp(Number(normalized) || 0, 0, 1);
  return { normalized:round3(safe), weight, points:round1(safe * weight) };
}

function excludedResult(reason, message, extras = {}) {
  return {
    compatible:false,
    score:0,
    rawScore:0,
    category:"excluded",
    exclusionReason:reason,
    exclusionMessage:message,
    occurrenceCount:Array.isArray(extras.allOccurrences) ? extras.allOccurrences.length : 0,
    occurrences:[],
    components:{},
    ...extras
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round1(value) {
  return Math.round((Number(value) || 0) * 10) / 10;
}

function round3(value) {
  return Math.round((Number(value) || 0) * 1000) / 1000;
}
