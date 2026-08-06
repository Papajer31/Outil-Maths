// Regroupements pédagogiques utilisés par l'encodage.
// La banque conserve une segmentation phonologique fine ; l'outil peut ensuite
// réunir plusieurs unités en une seule étiquette déjà enseignée aux élèves.
export const GRAPH_COMPOSITIONS = Object.freeze([
  Object.freeze({ id: "es_cons", parts: Object.freeze([
    Object.freeze({ graph: "e_ouvert" }),
    Object.freeze({ graph: "s_s", text: "s" })
  ]) }),
  Object.freeze({ id: "el_cons", parts: Object.freeze([
    Object.freeze({ graph: "e_ouvert" }),
    Object.freeze({ graph: "l", text: "l" })
  ]) }),
  Object.freeze({ id: "ef_cons", parts: Object.freeze([
    Object.freeze({ graph: "e_ouvert" }),
    Object.freeze({ graph: "f", text: "f" })
  ]) }),
  Object.freeze({ id: "ec_cons", parts: Object.freeze([
    Object.freeze({ graph: "e_ouvert" }),
    Object.freeze({ graph: "c_k", text: "c" })
  ]) }),
  Object.freeze({ id: "er_cons", parts: Object.freeze([
    Object.freeze({ graph: "e_ouvert" }),
    Object.freeze({ graph: "r", text: "r" })
  ]) }),

  Object.freeze({ id: "ette", parts: Object.freeze([
    Object.freeze({ graph: "e_ouvert" }),
    Object.freeze({ graph: "t", text: "tt" }),
    Object.freeze({ graph: "e", isSilent: true, text: "e" })
  ]) }),
  Object.freeze({ id: "esse", parts: Object.freeze([
    Object.freeze({ graph: "e_ouvert" }),
    Object.freeze({ graph: "ss" }),
    Object.freeze({ graph: "e", isSilent: true, text: "e" })
  ]) }),
  Object.freeze({ id: "elle", parts: Object.freeze([
    Object.freeze({ graph: "e_ouvert" }),
    Object.freeze({ graph: "l", text: "ll" }),
    Object.freeze({ graph: "e", isSilent: true, text: "e" })
  ]) }),
  Object.freeze({ id: "erre", parts: Object.freeze([
    Object.freeze({ graph: "e_ouvert" }),
    Object.freeze({ graph: "r", text: "rr" }),
    Object.freeze({ graph: "e", isSilent: true, text: "e" })
  ]) }),
  Object.freeze({ id: "enne", parts: Object.freeze([
    Object.freeze({ graph: "e_ouvert" }),
    Object.freeze({ graph: "n", text: "nn" }),
    Object.freeze({ graph: "e", isSilent: true, text: "e" })
  ]) })
]);

export const COMPOSITION_BY_ID = new Map(
  GRAPH_COMPOSITIONS.map((composition) => [composition.id, composition])
);
