export const PHONOLOGY_SILENT_LETTERS_MODES = Object.freeze({
  ALLOW:"allow",
  FORBID:"forbid"
});

const DEFAULT_REGULARITY_SCORE = 50;

// Miroir runtime de _infos/phono/referentiel_score_regularite_gp.txt.
// Les codes absents du référentiel reçoivent la valeur neutre 50 ; ils ne
// sont jamais exclus pour cette raison.
const PHONOLOGY_REGULARITY_BY_GRAPH = Object.freeze({
  'a':100,
  'a=à':55,
  'a=â':70,
  'ai_ferme':70,
  'ai_ouvert':80,
  'ain':80,
  'am':80,
  'an':90,
  'au':90,
  'ay':55,
  'ay_ferme':55,
  'b':100,
  'c_k':90,
  'c_s':80,
  'cc':70,
  'ch':100,
  'ch_k':55,
  'd':100,
  'dd':70,
  'e_aigu':100,
  'e_circonflexe':55,
  'e_circonflexe_ferme':55,
  'e_ferme':80,
  'e_grave':100,
  'e_ouvert':80,
  'e_schwa':80,
  'eau':90,
  'ei':70,
  'ein':70,
  'em':80,
  'en_an':90,
  'en_in':70,
  'er':90,
  'et_ouvert':55,
  'eu':90,
  'ez':80,
  'f':100,
  'ff':70,
  'g_g':90,
  'g_j':80,
  'ge':80,
  'gg':70,
  'gn':90,
  'gu':80,
  'i':100,
  'i=ï':70,
  'i_ij':55,
  'i_yod':80,
  'il_yod':70,
  'ill':70,
  'ill_ij':55,
  'im':80,
  'in':90,
  'j':100,
  'k':70,
  'l':100,
  'll':70,
  'm':100,
  'mm':70,
  'n':100,
  'nn':70,
  'o':100,
  'o=ô':70,
  'oeu=œu':70,
  'oi':90,
  'oin':70,
  'om':80,
  'on':100,
  'ou':100,
  'ou_glisse':70,
  'oy':70,
  'p':100,
  'ph':70,
  'pp':70,
  'qu':90,
  'r':100,
  'rr':70,
  's_s':90,
  's_z':70,
  'sc':55,
  'ss':90,
  't':100,
  't_s':55,
  'th':70,
  'tt':70,
  'u':100,
  'u=û':70,
  'u_eu':55,
  'u_glisse':80,
  'um':55,
  'un':70,
  'v':100,
  'w_v':55,
  'w_w':55,
  'x_gz':55,
  'x_ks':55,
  'x_z':55,
  'y_i':80,
  'y_ij':55,
  'y_yod':55,
  'ym':55,
  'z':100,
  'ç':80,
});

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

export function normalizePhonologyRegularityScore(value, fallback = DEFAULT_REGULARITY_SCORE) {
  const number = Number(value);
  if (!Number.isFinite(number)) return Math.max(0, Math.min(100, Math.round(Number(fallback) || DEFAULT_REGULARITY_SCORE)));
  return Math.max(0, Math.min(100, Math.round(number)));
}

export function getPhonologyWordRegularityScore(word) {
  const explicit = Number(word?.regularityScore ?? word?.regularity_score);
  if (Number.isFinite(explicit)) return normalizePhonologyRegularityScore(explicit);

  const units = Array.isArray(word?.units) ? word.units : [];
  const scores = units.map((unit) => {
    if (unit?.isSilent === true || String(unit?.graph || "").trim() === "__silent__") {
      const text = String(unit?.text || "").trim().normalize("NFC").toLocaleLowerCase("fr-FR");
      if (text === "e") return 60;
      if (text === "h") return 30;
      return 40;
    }
    const graph = String(unit?.graph || "").trim();
    return Number(PHONOLOGY_REGULARITY_BY_GRAPH[graph] ?? DEFAULT_REGULARITY_SCORE);
  }).filter(Number.isFinite);

  if (!scores.length) return DEFAULT_REGULARITY_SCORE;
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  // Règle historique : moyenne arithmétique ramenée au multiple de 5 inférieur.
  return normalizePhonologyRegularityScore(Math.floor(mean / 5) * 5);
}

export function getPhonologyWordRegularityWeight(word) {
  // Pondération volontairement transparente : un score 100 pèse deux fois
  // plus qu'un score 50. Aucun score n'exclut jamais un mot éligible.
  return Math.max(1, getPhonologyWordRegularityScore(word));
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
