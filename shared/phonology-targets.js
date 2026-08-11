import { PHONOLOGY_GRAPH_BY_ID } from "./phonology-graph-data.js";

// Référentiel commun des cibles strictement phonémiques proposées par les outils
// d'étude du code. Il est aligné sur :
// _infos/phono/referentiel_phono-strict-ultime.txt
//
// Les compositions graphiques (oi, ouille, ien, ion, etc.) et les unités
// polyphonémiques (x = /ks/, etc.) ne sont plus des cibles de ce sélecteur :
// elles relèvent désormais de l'entrée graphémique.
export const PHONOLOGY_TARGET_CATEGORIES = Object.freeze([
  Object.freeze({ id:"vowels", label:"Voyelles" }),
  Object.freeze({ id:"nasals", label:"Voyelles nasales" }),
  Object.freeze({ id:"semivowels", label:"Semi-voyelles" }),
  Object.freeze({ id:"consonants", label:"Consonnes" })
]);

const RAW_TARGETS = [
  { id:"a", category:"vowels", ipa:"a", bubbleText:"a", example:"chat", graphIds:["a"], includedInGraphIds:["oi", "oy"] },
  { id:"i", category:"vowels", ipa:"i", bubbleText:"i", example:"lit", graphIds:["i", "y_i"], includedInGraphIds:["i_ij", "ill_ij", "y_ij"] },
  { id:"u", category:"vowels", ipa:"y", bubbleText:"u", example:"lune", graphIds:["u"] },
  { id:"ou", category:"vowels", ipa:"u", bubbleText:"ou", example:"roue", graphIds:["ou"] },
  { id:"e_aigu", category:"vowels", ipa:"e", bubbleText:"é", example:"vélo", graphIds:["e_aigu", "e_ferme", "e_circonflexe_ferme", "er", "ez", "ai_ferme"], includedInGraphIds:["ay_ferme"] },
  { id:"e_ouvert", category:"vowels", ipa:"ɛ", bubbleText:"è", example:"père", graphIds:["e_grave", "e_circonflexe", "e_ouvert", "ai_ouvert", "ei", "et_ouvert"], includedInGraphIds:["ay"] },
  { id:"e", category:"vowels", ipa:"ə", bubbleText:"e", example:"cheval", graphIds:["e_schwa"] },
  { id:"eu", category:"vowels", ipa:"ø;œ", bubbleText:"eu", example:"feu", graphIds:["eu", "oeu", "u_eu"] },
  { id:"o", category:"vowels", ipa:"o;ɔ", bubbleText:"o", example:"moto", graphIds:["o", "au", "eau"] },

  { id:"an", category:"nasals", ipa:"ɑ̃", bubbleText:"an", example:"manteau", graphIds:["an", "am", "en_an", "em"] },
  { id:"on", category:"nasals", ipa:"ɔ̃", bubbleText:"on", example:"pont", graphIds:["on", "om"] },
  { id:"in", category:"nasals", ipa:"ɛ̃", bubbleText:"in", example:"lapin", graphIds:["in", "im", "ain", "ein", "en_in", "ym"], includedInGraphIds:["oin"] },
  { id:"un", category:"nasals", ipa:"œ̃", bubbleText:"un", example:"brun", graphIds:["un", "um"] },

  { id:"y", category:"semivowels", ipa:"j", bubbleText:"y", example:"pied", graphIds:["i_yod", "y_yod", "il_yod", "ill"], includedInGraphIds:["ay", "ay_ferme", "i_ij", "ill_ij", "oy", "y_ij"] },
  { id:"u_glisse", aliases:["uw", "ui"], category:"semivowels", ipa:"ɥ", bubbleText:"ɥ", example:"pluie", graphIds:["u_glisse"] },
  { id:"w", category:"semivowels", ipa:"w", bubbleText:"w", example:"wapiti", graphIds:["ou_glisse", "w_w"], includedInGraphIds:["oi", "oin", "oy"] },

  { id:"p", category:"consonants", ipa:"p", bubbleText:"p", example:"poule", graphIds:["p", "pp"] },
  { id:"b", category:"consonants", ipa:"b", bubbleText:"b", example:"bateau", graphIds:["b"] },
  { id:"t", category:"consonants", ipa:"t", bubbleText:"t", example:"tapis", graphIds:["t", "tt", "th"] },
  { id:"d", category:"consonants", ipa:"d", bubbleText:"d", example:"domino", graphIds:["d", "dd"] },
  { id:"k", category:"consonants", ipa:"k", bubbleText:"k", example:"carte", graphIds:["c_k", "cc", "k", "qu", "ch_k"], includedInGraphIds:["x_ks"] },
  { id:"g", category:"consonants", ipa:"g", bubbleText:"g", example:"gâteau", graphIds:["g_g", "gg", "gu"], includedInGraphIds:["x_gz"] },
  { id:"f", category:"consonants", ipa:"f", bubbleText:"f", example:"farine", graphIds:["f", "ff", "ph"] },
  { id:"v", category:"consonants", ipa:"v", bubbleText:"v", example:"vélo", graphIds:["v", "w_v"] },
  { id:"s", category:"consonants", ipa:"s", bubbleText:"s", example:"salade", graphIds:["s_s", "ss", "c_s", "ç", "sc", "t_s"], includedInGraphIds:["x_ks"] },
  { id:"z", category:"consonants", ipa:"z", bubbleText:"z", example:"zéro", graphIds:["z", "s_z", "x_z"], includedInGraphIds:["x_gz"] },
  { id:"ch", category:"consonants", ipa:"ʃ", bubbleText:"ch", example:"chat", graphIds:["ch"] },
  { id:"j", category:"consonants", ipa:"ʒ", bubbleText:"j", example:"jupe", graphIds:["j", "g_j", "ge"] },
  { id:"m", category:"consonants", ipa:"m", bubbleText:"m", example:"moto", graphIds:["m", "mm"] },
  { id:"n", category:"consonants", ipa:"n", bubbleText:"n", example:"nid", graphIds:["n", "nn"] },
  { id:"gn", category:"consonants", ipa:"ɲ", bubbleText:"gn", example:"montagne", graphIds:["gn"] },
  { id:"l", category:"consonants", ipa:"l", bubbleText:"l", example:"lune", graphIds:["l", "ll"] },
  { id:"r", category:"consonants", ipa:"ʁ", bubbleText:"r", example:"rat", graphIds:["r", "rr"] }
];

function graphSpellings(graphId) {
  const graph = PHONOLOGY_GRAPH_BY_ID.get(graphId);
  return Array.isArray(graph?.variants) && graph.variants.length
    ? [...graph.variants]
    : [String(graph?.label || graphId)];
}

function normalizeSpelling(value) {
  return String(value || "").trim().normalize("NFC").toLocaleLowerCase("fr-FR");
}

function buildTarget(raw) {
  const graphIds = (raw.graphIds || []).filter((graphId) => PHONOLOGY_GRAPH_BY_ID.has(graphId));
  const includedInGraphIds = (raw.includedInGraphIds || []).filter((graphId) => PHONOLOGY_GRAPH_BY_ID.has(graphId));
  const derivedSpellings = graphIds.flatMap(graphSpellings);
  const spellings = Array.from(new Set((raw.spellings || derivedSpellings).map(normalizeSpelling).filter(Boolean)));
  return Object.freeze({
    ...raw,
    kind:"phonemic",
    label: `Phonème « ${raw.bubbleText} »`,
    aliases: Object.freeze([...(raw.aliases || [])]),
    graphIds: Object.freeze(graphIds),
    includedInGraphIds: Object.freeze(includedInGraphIds),
    graphSequences: Object.freeze([]),
    spellings: Object.freeze(spellings)
  });
}

export const PHONEME_TARGETS = Object.freeze(RAW_TARGETS.map(buildTarget));

const TARGET_BY_ID = new Map(PHONEME_TARGETS.map((target) => [target.id, target]));
const TARGET_ALIAS_TO_ID = new Map();
for (const target of PHONEME_TARGETS) {
  for (const alias of target.aliases || []) TARGET_ALIAS_TO_ID.set(String(alias), target.id);
}

export function normalizePhonologyTargetId(targetId) {
  const id = String(targetId || "").trim();
  return TARGET_ALIAS_TO_ID.get(id) || id;
}

export function getPhonemeTargets() {
  return PHONEME_TARGETS.map(cloneTarget);
}

export function getPhonemeTarget(targetId) {
  const normalizedId = normalizePhonologyTargetId(targetId);
  const target = TARGET_BY_ID.get(normalizedId);
  return target ? cloneTarget(target) : null;
}

export function getPhonologyTargetsByCategory() {
  return PHONOLOGY_TARGET_CATEGORIES.map((category) => ({
    ...category,
    targets: PHONEME_TARGETS
      .filter((target) => target.category === category.id)
      .map(cloneTarget)
  }));
}

function cloneTarget(target) {
  return {
    ...target,
    aliases: [...(target.aliases || [])],
    graphIds: [...target.graphIds],
    includedInGraphIds: [...(target.includedInGraphIds || [])],
    graphSequences: [],
    spellings: [...target.spellings]
  };
}
