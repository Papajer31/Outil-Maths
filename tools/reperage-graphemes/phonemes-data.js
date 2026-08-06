import { PHONOLOGY_GRAPH_BY_ID } from "../../shared/phonology-graph-data.js";

// Référentiel pédagogique validé pour le projet.
// Un même son peut accepter plusieurs codes graphémiques selon le mot.
const RAW_PHONEMES = [
  { id:"a", ipa:"a", bubbleText:"a", example:"chat", graphIds:["a", "e_a"] },
  { id:"i", ipa:"i", bubbleText:"i", example:"lit", graphIds:["i", "y_i"] },
  { id:"u", ipa:"y", bubbleText:"u", example:"lune", graphIds:["u", "eu_u"] },
  { id:"ou", ipa:"u", bubbleText:"ou", example:"roue", graphIds:["ou", "aou", "oo_ou"] },
  { id:"e_aigu", ipa:"e", bubbleText:"é", example:"vélo", graphIds:["e_aigu", "e_ferme", "er", "ez", "es_ferme", "et_ferme", "ai_ferme"] },
  { id:"e_ouvert", ipa:"ɛ", bubbleText:"è", example:"père", graphIds:["e_grave", "e_circonflexe", "e_ouvert", "ai_ouvert", "ei", "et_ouvert", "ey"] },
  { id:"e", ipa:"ə", bubbleText:"e", example:"cheval", graphIds:["e_caduc", "ai_caduc", "on_caduc"] },
  { id:"eu", ipa:"ø;œ", bubbleText:"eu", example:"feu", graphIds:["eu", "oeu", "oe", "u_eu"] },
  { id:"o", ipa:"o;ɔ", bubbleText:"o", example:"moto", graphIds:["o", "au", "eau", "oo_o", "u_o"] },

  { id:"an", ipa:"ɑ̃", bubbleText:"an", example:"manteau", graphIds:["an", "am", "en_an", "em", "aon"] },
  { id:"on", ipa:"ɔ̃", bubbleText:"on", example:"pont", graphIds:["on", "om"] },
  { id:"in", ipa:"ɛ̃", bubbleText:"in", example:"lapin", graphIds:["in", "im", "ain", "aim", "ein", "eim", "en_in", "yn", "ym"] },
  { id:"un", ipa:"œ̃", bubbleText:"un", example:"brun", graphIds:["un", "um"] },

  { id:"y", ipa:"j", bubbleText:"y", example:"pied", graphIds:["i_yod", "y_yod", "il_yod", "ill"] },
  { id:"uw", ipa:"ɥ", bubbleText:"u", example:"huit", graphIds:["u_glisse"] },
  { id:"w", ipa:"w", bubbleText:"ou", example:"oui", graphIds:["ou_glisse", "w_w"] },

  { id:"p", ipa:"p", bubbleText:"p", example:"poule", graphIds:["p"] },
  { id:"b", ipa:"b", bubbleText:"b", example:"bateau", graphIds:["b"] },
  { id:"t", ipa:"t", bubbleText:"t", example:"tapis", graphIds:["t", "th"] },
  { id:"d", ipa:"d", bubbleText:"d", example:"domino", graphIds:["d"] },
  { id:"k", ipa:"k", bubbleText:"k", example:"carte", graphIds:["c_k", "k", "q", "qu", "ck", "cqu", "ch_k"] },
  { id:"g", ipa:"g", bubbleText:"g", example:"gâteau", graphIds:["g_g", "gu", "c_g", "gh"] },
  { id:"f", ipa:"f", bubbleText:"f", example:"farine", graphIds:["f", "ph"] },
  { id:"v", ipa:"v", bubbleText:"v", example:"vélo", graphIds:["v", "w_v"] },
  { id:"s", ipa:"s", bubbleText:"s", example:"salade", graphIds:["s_s", "c_s", "ç", "sc", "t_s", "x_s"] },
  { id:"z", ipa:"z", bubbleText:"z", example:"zéro", graphIds:["z", "s_z", "x_z"] },
  { id:"ch", ipa:"ʃ", bubbleText:"ch", example:"chat", graphIds:["ch", "sch", "sh"] },
  { id:"j", ipa:"ʒ", bubbleText:"j", example:"jupe", graphIds:["j", "g_j", "ge"] },
  { id:"m", ipa:"m", bubbleText:"m", example:"moto", graphIds:["m"] },
  { id:"n", ipa:"n", bubbleText:"n", example:"nid", graphIds:["n"] },
  { id:"gn", ipa:"ɲ", bubbleText:"gn", example:"montagne", graphIds:["gn"] },
  { id:"l", ipa:"l", bubbleText:"l", example:"lune", graphIds:["l"] },
  { id:"r", ipa:"ʁ", bubbleText:"r", example:"rat", graphIds:["r"] },

  { id:"ks", ipa:"k+s", bubbleText:"ks", example:"taxi", graphIds:["x_ks"] },
  { id:"gz", ipa:"g+z", bubbleText:"gz", example:"examen", graphIds:["x_gz"] },

  // Compositions pédagogiques : elles restent proposées comme cibles entières.
  { id:"oi", ipa:"w+a", bubbleText:"oi", example:"roi", graphIds:["oi"] },
  { id:"oy", ipa:"w+a+j", bubbleText:"oy", example:"noyau", graphIds:["oy"] },
  { id:"ay", ipa:"ɛ+j", bubbleText:"ay", example:"rayé", graphIds:["ay"] },
  { id:"oin", ipa:"w+ɛ̃", bubbleText:"oin", example:"loin", graphIds:["oin"] },
  { id:"ui", ipa:"ɥ+i", bubbleText:"ui", example:"pluie", graphIds:["ui"], graphSequences:[["u_glisse", "i"]] },
  { id:"ien", ipa:"j+ɛ̃", bubbleText:"ien", example:"bien", graphIds:["ien"], graphSequences:[["i_yod", "en_in"]] },
  { id:"ion", ipa:"j+ɔ̃", bubbleText:"ion", example:"lion", graphIds:["ion"], graphSequences:[["i_yod", "on"]] },
  { id:"ill_ij", ipa:"i+j", bubbleText:"ill", example:"chenille", graphIds:["ill_ij"] },
  { id:"ouil", ipa:"u+j", bubbleText:"ouil", example:"fenouil", graphIds:["ouil"], graphSequences:[["ou", "il_yod"]] },
  { id:"ouille", ipa:"u+j", bubbleText:"ouille", example:"grenouille", graphIds:["ouille"], graphSequences:[["ou", "ill"]] },
  { id:"ail", ipa:"a+j", bubbleText:"ail", example:"travail", graphIds:["ail"], graphSequences:[["a", "il_yod"]] },
  { id:"aille", ipa:"a+j", bubbleText:"aille", example:"paille", graphIds:["aille"], graphSequences:[["a", "ill"]] },
  { id:"eil", ipa:"ɛ+j", bubbleText:"eil", example:"soleil", graphIds:["eil"], graphSequences:[["e_ouvert", "il_yod"]] },
  { id:"eille", ipa:"ɛ+j", bubbleText:"eille", example:"bouteille", graphIds:["eille"], graphSequences:[["e_ouvert", "ill"]] },
  { id:"euil", ipa:"œ+j", bubbleText:"euil", example:"chevreuil", graphIds:["euil"], graphSequences:[["eu", "il_yod"]] },
  { id:"euille", ipa:"œ+j", bubbleText:"euille", example:"feuille", graphIds:["euille"], graphSequences:[["eu", "ill"]] }
];

function graphSpellings(graphId) {
  const graph = PHONOLOGY_GRAPH_BY_ID.get(graphId);
  return Array.isArray(graph?.variants) && graph.variants.length
    ? [...graph.variants]
    : [String(graph?.label || graphId)];
}

export const PHONEME_TARGETS = Object.freeze(
  RAW_PHONEMES.map((phoneme) => {
    const graphIds = phoneme.graphIds.filter((graphId) => PHONOLOGY_GRAPH_BY_ID.has(graphId));
    const spellings = Array.from(new Set(graphIds.flatMap(graphSpellings)));
    return Object.freeze({
      ...phoneme,
      label: `Son « ${phoneme.bubbleText} »`,
      graphIds: Object.freeze(graphIds),
      graphSequences: Object.freeze((phoneme.graphSequences || []).map((sequence) => Object.freeze([...sequence]))),
      spellings: Object.freeze(spellings)
    });
  }).filter((phoneme) => phoneme.graphIds.length > 0)
);

const PHONEME_BY_ID = new Map(PHONEME_TARGETS.map((phoneme) => [phoneme.id, phoneme]));

export function getPhonemeTargets() {
  return PHONEME_TARGETS.map((phoneme) => ({
    ...phoneme,
    graphIds: [...phoneme.graphIds],
    graphSequences: (phoneme.graphSequences || []).map((sequence) => [...sequence]),
    spellings: [...phoneme.spellings]
  }));
}

export function getPhonemeTarget(phonemeId) {
  const target = PHONEME_BY_ID.get(String(phonemeId || "").trim())
    || PHONEME_BY_ID.get("ou")
    || PHONEME_TARGETS[0];
  return target ? {
    ...target,
    graphIds: [...target.graphIds],
    graphSequences: (target.graphSequences || []).map((sequence) => [...sequence]),
    spellings: [...target.spellings]
  } : null;
}
