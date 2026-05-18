// Façade d’accès aux données internes prévalidées de l’outil Conjugaison.
// Les données modifiables sont stockées dans forms-core.json.

import data from "./forms-core.json" with { type: "json" };

const safeData = data && typeof data === "object" ? data : {};

export const CONJUGATION_PERSONS = Object.freeze(safeData.persons || {});
export const CONJUGATION_TENSES = Object.freeze(safeData.tenses || {});
export const CONJUGATION_PRESETS = Object.freeze(safeData.presets || {});
export const CONJUGATION_VERBS = Object.freeze(Array.isArray(safeData.verbs) ? safeData.verbs : []);
