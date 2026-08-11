// Compatibilité interne : les anciennes « cibles de graphèmes » sont désormais
// des cibles de sons. Le référentiel canonique est désormais partagé dans shared/phonology-targets.js.
export {
  PHONEME_TARGETS as GRAPHEME_TARGETS,
  getPhonemeTargets as getGraphemeTargets,
  getPhonemeTarget as getGraphemeTarget
} from "./phonemes-data.js";
