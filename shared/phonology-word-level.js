export const PHONOLOGY_SILENT_LETTERS_MODES = Object.freeze({
  ALLOW:"allow",
  FORBID:"forbid"
});

export const PHONOLOGY_SCHOOL_LEVELS = Object.freeze([
  Object.freeze({ id:"CP", label:"CP" }),
  Object.freeze({ id:"CE1", label:"CE1" }),
  Object.freeze({ id:"CE2", label:"CE2" }),
  Object.freeze({ id:"CM", label:"CM" })
]);

const LEVEL_RANK = Object.freeze({ CP:0, CE1:1, CE2:2, CM:3 });
const DEFAULT_LEVEL = "CP";
const DEFAULT_REGULARITY_SCORE = 50;

export const PHONOLOGY_CGP_COMPLEXITY_LEVELS = Object.freeze([1, 2, 3, 4, 5]);

// Miroir runtime de _infos/phono/referentiel_complexite-grapho-phonologique_v2.txt.
// Le site ne charge pas le fichier documentaire : toute évolution du référentiel
// doit être reportée ici pour modifier le comportement des activités.
const PHONOLOGY_CGP_COMPLEXITY_BY_GRAPH = Object.freeze({
  'a':1,
  'a=à':1,
  'a=â':1,
  'i':1,
  'i=ï':1,
  'u':1,
  'u=û':1,
  'ou':1,
  'e_aigu':1,
  'e_grave':1,
  'o':1,
  'o=ô':1,
  'p':1,
  'b':1,
  't':1,
  'd':1,
  'f':1,
  'v':1,
  's_s':1,
  'z':1,
  'ch':1,
  'j':1,
  'm':1,
  'n':1,
  'l':1,
  'r':1,
  'y_i':2,
  'e_schwa':2,
  'er':2,
  'ez':2,
  'eu':2,
  'au':2,
  'eau':2,
  'an':2,
  'en_an':2,
  'on':2,
  'in':2,
  'un':2,
  'c_k':2,
  'k':2,
  'q':2,
  'qu':2,
  'g_g':2,
  'ss':2,
  'gn':2,
  'oi':2,
  'e_ferme':3,
  'es_ferme':3,
  'et_ferme':3,
  'ai_ferme':3,
  'e_circonflexe':3,
  'e_ouvert':3,
  'ai_ouvert':3,
  'ei':3,
  'et_ouvert':3,
  'oeu':3,
  'oeu=œu':3,
  'am':3,
  'em':3,
  'om':3,
  'im':3,
  'ain':3,
  'i_yod':3,
  'y_yod':3,
  'u_glisse':3,
  'ou_glisse':3,
  'pp':3,
  'bb':3,
  'tt':3,
  'dd':3,
  'ff':3,
  'mm':3,
  'nn':3,
  'll':3,
  'rr':3,
  'cc':3,
  'gg':3,
  'gu':3,
  'ph':3,
  'c_s':3,
  'ç':3,
  's_z':3,
  'g_j':3,
  'th':3,
  'oin':3,
  'ui':3,
  'e_circonflexe_ferme':4,
  'ai_circonflexe_ouvert':4,
  'aim':4,
  'ein':4,
  'en_in':4,
  'um':4,
  'il_yod':4,
  'ill':4,
  'ill_ij':4,
  'w_w':4,
  'ck':4,
  'w_v':4,
  'sc':4,
  'zz':4,
  'sh':4,
  'ge':4,
  'i_ij':4,
  'y_ij':4,
  'x_ks':4,
  'oy':4,
  'ay':4,
  'ay_ferme':4,
  'ien':4,
  'ion':4,
  'ouil':4,
  'ouille':4,
  'ail':4,
  'aille':4,
  'eil':4,
  'eille':4,
  'euil':4,
  'euille':4,
  'e_a':5,
  'eu_u':5,
  'aou':5,
  'oo_ou':5,
  'e_trema_ferme':5,
  'ey':5,
  'ai_schwa':5,
  'on_schwa':5,
  'e_eu':5,
  'oe':5,
  'u_eu':5,
  'oo_o':5,
  'u_o':5,
  'aon':5,
  'eim':5,
  'yn':5,
  'ym':5,
  'b_p':5,
  'cqu':5,
  'ch_k':5,
  'c_g':5,
  'gh':5,
  't_s':5,
  'x_s':5,
  'x_z':5,
  'sch':5,
  'x_gz':5,
  'qu_kw':5,
  'oe_wa':5,
  'oê_wa':5,
  'ay_ei':5,
});
const DEFAULT_CGP_COMPLEXITY_LEVEL = 5;

export function normalizePhonologySchoolLevel(value, { allowX = false, fallback = DEFAULT_LEVEL } = {}) {
  const raw = String(value || "").trim().toLocaleUpperCase("fr-FR");
  if (Object.prototype.hasOwnProperty.call(LEVEL_RANK, raw)) return raw;
  if (allowX && raw === "X") return "X";
  const safeFallback = String(fallback || DEFAULT_LEVEL).trim().toLocaleUpperCase("fr-FR");
  if (Object.prototype.hasOwnProperty.call(LEVEL_RANK, safeFallback)) return safeFallback;
  if (allowX && safeFallback === "X") return "X";
  return DEFAULT_LEVEL;
}

export function normalizePhonologySilentLettersMode(value) {
  return String(value || "").trim().toLowerCase() === PHONOLOGY_SILENT_LETTERS_MODES.FORBID
    ? PHONOLOGY_SILENT_LETTERS_MODES.FORBID
    : PHONOLOGY_SILENT_LETTERS_MODES.ALLOW;
}

export function isPhonologyWordAllowedBySilentLetters(word, mode = PHONOLOGY_SILENT_LETTERS_MODES.ALLOW) {
  if (normalizePhonologySilentLettersMode(mode) !== PHONOLOGY_SILENT_LETTERS_MODES.FORBID) return true;
  return !(Array.isArray(word?.units) ? word.units : []).some((unit) => unit?.isSilent === true);
}

export function normalizePhonologyCgpComplexityLevel(value, fallback = DEFAULT_CGP_COMPLEXITY_LEVEL) {
  const requested = Math.trunc(Number(value));
  if (PHONOLOGY_CGP_COMPLEXITY_LEVELS.includes(requested)) return requested;
  const safeFallback = Math.trunc(Number(fallback));
  return PHONOLOGY_CGP_COMPLEXITY_LEVELS.includes(safeFallback) ? safeFallback : DEFAULT_CGP_COMPLEXITY_LEVEL;
}

export function getPhonologyWordCgpComplexity(word) {
  const units = Array.isArray(word?.units) ? word.units : [];
  let highest = 1;
  let hasPronouncedUnit = false;
  for (const unit of units) {
    if (unit?.isSilent === true || String(unit?.graph || "").trim() === "__silent__") continue;
    hasPronouncedUnit = true;
    const graph = String(unit?.graph || "").trim();
    // Un code nouveau/non référencé est traité prudemment comme niveau 5 :
    // il ne doit jamais se glisser dans un exercice réglé sur des CGP simples.
    const level = Number(PHONOLOGY_CGP_COMPLEXITY_BY_GRAPH[graph] ?? DEFAULT_CGP_COMPLEXITY_LEVEL);
    highest = Math.max(highest, normalizePhonologyCgpComplexityLevel(level));
  }
  return hasPronouncedUnit ? highest : DEFAULT_CGP_COMPLEXITY_LEVEL;
}

export function isPhonologyWordAllowedByCgpComplexity(word, maxLevel = DEFAULT_CGP_COMPLEXITY_LEVEL) {
  return getPhonologyWordCgpComplexity(word) <= normalizePhonologyCgpComplexityLevel(maxLevel);
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
