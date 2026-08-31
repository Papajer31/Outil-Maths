export const PHONOLOGY_SCHOOL_LEVELS = Object.freeze([
  Object.freeze({ id:"CP", label:"CP" }),
  Object.freeze({ id:"CE1", label:"CE1" }),
  Object.freeze({ id:"CE2", label:"CE2" }),
  Object.freeze({ id:"CM", label:"CM" })
]);

const LEVEL_RANK = Object.freeze({ CP:0, CE1:1, CE2:2, CM:3 });
const DEFAULT_LEVEL = "CP";
const DEFAULT_REGULARITY_SCORE = 50;

export function normalizePhonologySchoolLevel(value, { allowX = false, fallback = DEFAULT_LEVEL } = {}) {
  const raw = String(value || "").trim().toLocaleUpperCase("fr-FR");
  if (Object.prototype.hasOwnProperty.call(LEVEL_RANK, raw)) return raw;
  if (allowX && raw === "X") return "X";
  const safeFallback = String(fallback || DEFAULT_LEVEL).trim().toLocaleUpperCase("fr-FR");
  if (Object.prototype.hasOwnProperty.call(LEVEL_RANK, safeFallback)) return safeFallback;
  if (allowX && safeFallback === "X") return "X";
  return DEFAULT_LEVEL;
}

export function isPhonologyWordAllowedAtLevel(wordOrLevel, selectedLevel = DEFAULT_LEVEL) {
  const wordLevel = normalizePhonologySchoolLevel(
    typeof wordOrLevel === "object" && wordOrLevel !== null ? wordOrLevel.schoolLevel ?? wordOrLevel.school_level : wordOrLevel,
    { allowX:true, fallback:"X" }
  );
  if (wordLevel === "X") return false;
  const selected = normalizePhonologySchoolLevel(selectedLevel);
  return LEVEL_RANK[wordLevel] <= LEVEL_RANK[selected];
}

export function normalizePhonologyRegularityScore(value, fallback = DEFAULT_REGULARITY_SCORE) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Math.max(0, Math.min(100, Math.round(Number(fallback) || DEFAULT_REGULARITY_SCORE)));
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function getPhonologyWordRegularityWeight(word) {
  // Pondération volontairement transparente : un score 100 pèse deux fois
  // plus qu'un score 50. Aucun score n'exclut jamais un mot éligible.
  return Math.max(1, normalizePhonologyRegularityScore(word?.regularityScore ?? word?.regularity_score));
}

export function pickPhonologyWordByRegularity(words, random = Math.random) {
  const source = Array.isArray(words) ? words.filter(Boolean) : [];
  if (!source.length) return null;

  const weighted = source.map((word) => ({ word, weight:getPhonologyWordRegularityWeight(word) }));
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  if (!(total > 0)) return source[0] || null;

  const raw = Number(typeof random === "function" ? random() : Math.random());
  const unit = Number.isFinite(raw) ? Math.max(0, Math.min(0.999999999999, raw)) : Math.random();
  let cursor = unit * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor < 0) return item.word;
  }
  return weighted[weighted.length - 1]?.word || null;
}

export function pickPhonologyWordsByRegularity(words, count, random = Math.random) {
  const remaining = Array.isArray(words) ? words.filter(Boolean) : [];
  const requested = Math.max(0, Math.trunc(Number(count) || 0));
  const selected = [];
  while (remaining.length && selected.length < requested) {
    const chosen = pickPhonologyWordByRegularity(remaining, random);
    if (!chosen) break;
    selected.push(chosen);
    const index = remaining.indexOf(chosen);
    if (index >= 0) remaining.splice(index, 1);
  }
  return selected;
}
