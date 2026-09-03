const ROOT_TOOLS_META = Object.freeze({
  key: "tools",
  label: "Outils"
});

const ACTIVE_TOOLS_REGISTRY = Object.freeze([
  {
    id: "addition",
    label: "Addition",
    entry: "../tools/addition/tool.js",
    description: "Travailler les additions avec une réponse numérique simple.",
    tags: ["maths", "calcul", "addition", "clavier", "projection"]
  },

  {
    id: "soustraction",
    label: "Soustraction",
    entry: "../tools/soustraction/tool.js",
    description: "Travailler les soustractions avec une réponse numérique simple.",
    tags: ["maths", "calcul", "soustraction", "clavier", "projection"]
  },
  {
    id: "multiplication-posee",
    label: "Multiplication posée",
    entry: "../tools/multiplication-posee/tool.js",
    description: "Travailler les multiplications posées avec une réponse numérique simple.",
    tags: ["maths", "calcul", "multiplication", "multiplication-posée", "clavier", "projection"]
  },
  {
    id: "addition-trous",
    label: "Addition à trous",
    entry: "../tools/addition-trous/tool.js",
    description: "Retrouver un terme manquant dans une addition à deux termes.",
    tags: ["maths", "calcul", "addition", "trou", "clavier", "projection"]
  },
  {
    id: "soustraction-trous",
    label: "Soustraction à trous",
    entry: "../tools/soustraction-trous/tool.js",
    description: "Retrouver un terme manquant dans une soustraction.",
    tags: ["maths", "calcul", "soustraction", "trou", "clavier", "projection"]
  },
  {
    id: "multiplication-trous",
    label: "Multiplication à trous",
    entry: "../tools/multiplication-trous/tool.js",
    description: "Retrouver un facteur manquant dans une multiplication.",
    tags: ["maths", "calcul", "multiplication", "trou", "clavier", "projection"]
  },
  {
    id: "tables-multiplication",
    label: "Tables de multiplication",
    entry: "../tools/tables-multiplication/tool.js",
    description: "Travailler les tables de multiplication avec une réponse numérique simple.",
    tags: ["maths", "calcul", "tables", "multiplication", "clavier", "projection"]
  },
  {
    id: "boites-jetons",
    label: "Boites à jetons",
    entry: "../tools/boites-jetons/tool.js",
    description: "Composer une cible en cliquant sur des boites de jetons.",
    tags: ["maths", "calcul", "décomposition", "jetons", "manipulation", "projection"]
  },
  {
    id: "plus-moins-autant",
    label: "Plus, moins, autant",
    entry: "../tools/plus-moins-autant/tool.js",
    description: "Comparer deux collections par correspondance terme à terme avec objets manipulables.",
    tags: ["maths", "nombres", "comparaison", "collections", "plus-moins-autant", "manipulation", "drag-drop", "projection"]
  },
  {
    id: "comparaison",
    label: "Comparaison",
    entry: "../tools/comparaison/tool.js",
    description: "Comparer deux collections terme à terme pour trouver la différence.",
    tags: ["maths", "nombres", "comparaison", "collections", "difference", "jetons", "trace", "projection"]
  },

  {
    id: "somme-difference",
    label: "Somme ou différence ?",
    entry: "../tools/somme-difference/tool.js",
    description: "Choisir entre addition et soustraction à partir de deux collections, puis écrire l'opération complète.",
    tags: ["maths", "calcul", "addition", "soustraction", "collections", "opération", "trace", "projection"]
  },
  {
    id: "collection",
    label: "Collection",
    entry: "../tools/collection/tool.js",
    description: "Comparer un nombre et une collection homogène d’objets en répondant oui ou non.",
    tags: ["maths", "nombres", "quantite", "collections", "oui-non", "projection"]
  },
  {
    id: "calcul-cible",
    label: "Calcul ciblé",
    entry: "../tools/calcul-cible/tool.js",
    description: "Atteindre une cible en utilisant tous les nombres proposés.",
    tags: ["maths", "calcul", "nombre-cible", "manipulation", "projection"]
  },
  {
    id: "compte-est-bon",
    label: "Compte est bon",
    entry: "../tools/compte-est-bon/tool.js",
    description: "Atteindre une cible avec six nombres proposés.",
    tags: ["maths", "calcul", "nombre-cible", "compte-est-bon", "projection"]
  },

  {
    id: "frise-picbille",
    label: "Frise Picbille",
    entry: "../tools/frise-picbille/tool.js",
    description: "Lire ou placer un nombre sur une frise Picbille.",
    tags: ["maths", "nombres", "picbille", "frise", "repérage", "projection"]
  },
  {
    id: "droite-numerique-simple",
    label: "Repérage sur droite simple",
    entry: "../tools/droite-numerique-simple/tool.js",
    description: "Lire ou placer un nombre sur une droite graduée simple.",
    tags: ["maths", "nombres", "droite-graduée", "repérage", "projection"]
  },
  {
    id: "droite-numerique-complete",
    label: "Repérage sur droite complète",
    entry: "../tools/droite-numerique-complete/tool.js",
    description: "Lire ou placer un nombre sur une droite graduée complète.",
    tags: ["maths", "nombres", "droite-graduée", "repérage", "projection"]
  },
  {
    id: "ordre-alphabetique-lettres",
    label: "Ordre alphabétique — Lettres",
    entry: "../tools/ordre-alphabetique-lettres/tool.js",
    description: "Ranger des lettres dans l’ordre alphabétique par manipulation.",
    tags: ["vocabulaire", "alphabet", "lettres", "glisser-deposer", "projection"]
  },
  {
    id: "ordre-alphabetique-mots",
    label: "Ordre alphabétique — Mots",
    entry: "../tools/ordre-alphabetique-mots/tool.js",
    description: "Ranger des mots dans l’ordre alphabétique par manipulation.",
    tags: ["vocabulaire", "alphabet", "mots", "glisser-deposer", "projection"]
  },
  {
    id: "representation-picbille",
    label: "Représentation décimale — Picbille",
    entry: "../tools/representation-picbille/tool.js",
    description: "Lire ou construire une représentation décimale avec le support Picbille.",
    tags: ["maths", "nombres", "représentation", "picbille", "projection"]
  },
  {
    id: "representation-dede",
    label: "Représentation décimale — Dédé",
    entry: "../tools/representation-dede/tool.js",
    description: "Lire ou construire une représentation décimale avec le support Dédé.",
    tags: ["maths", "nombres", "représentation", "dédé", "projection"]
  },
  {
    id: "representation-carres",
    label: "Représentation décimale — Carrés",
    entry: "../tools/representation-carres/tool.js",
    description: "Lire ou construire une représentation décimale avec des carrés de base 10.",
    tags: ["maths", "nombres", "représentation", "base10", "projection"]
  },
  {
    id: "representation-tuiles",
    label: "Représentation décimale — Tuiles",
    entry: "../tools/representation-tuiles/tool.js",
    description: "Lire ou construire une représentation décimale avec des tuiles centaines/dizaines/unités.",
    tags: ["maths", "nombres", "représentation", "tuiles", "projection"]
  },

  {
    id: "monnaie-representation",
    label: "Monnaie — Représentation",
    entry: "../tools/monnaie-representation/tool.js",
    description: "Lire ou composer une somme avec des pièces et billets manipulables.",
    tags: ["maths", "monnaie", "argent", "grandeurs", "mesures", "manipulation", "projection"]
  },

  {
    id: "encodage",
    label: "Encodage",
    entry: "../tools/encodage/tool.js",
    description: "Encodage phonographique avec graphèmes manipulables, réponse libre ou en cases.",
    tags: ["phonologie", "encodage", "graphèmes", "drag-drop", "projection"]
  },
  {
    id: "reperage-graphemes",
    label: "Repérer les graphèmes",
    entry: "../tools/reperage-graphemes/tool.js",
    description: "Repérer dans plusieurs mots une cible phonémique ou graphémique.",
    tags: ["français", "lecture", "étude-du-code", "phonologie", "graphèmes", "sélection", "projection"]
  },
  {
    id: "dictee-muette",
    label: "Dictée muette",
    entry: "../tools/dictee-muette/tool.js",
    description: "Écrire le mot correspondant à une image de l’Imagier avec plusieurs niveaux d’aide.",
    tags: ["français", "étude-du-code", "encodage", "dictée", "orthographe", "image", "clavier", "projection"]
  },
  {
    id: "presence-son",
    label: "Présence du son",
    entry: "../tools/presence-son/tool.js",
    description: "Repérer un son dans le mot représenté par une image, par existence ou par place dans les syllabes.",
    tags: ["français", "lecture", "étude-du-code", "phonologie", "sons", "syllabes", "imagier", "oui-non", "projection"]
  },
  {
    id: "nuage-lettres",
    label: "Nuage de lettres",
    entry: "../tools/nuage-lettres/tool.js",
    description: "Reconstituer un mot sélectionné par entrée phonémique ou graphémique à partir de lettres mélangées.",
    tags: ["français", "lecture", "étude-du-code", "phonologie", "orthographe", "lettres", "manipulation", "projection"]
  },
  {
    id: "segmenter-mots",
    label: "Segmenter les mots",
    entry: "../tools/segmenter-mots/tool.js",
    description: "Segmenter une suite continue de lettres pour retrouver les mots sélectionnés dans la banque phonologique.",
    tags: ["français", "lecture", "étude-du-code", "segmentation", "mots", "phonologie", "graphèmes", "tablette", "manipulation", "projection"]
  },
  {
    id: "recomposer-mots-syllabes",
    label: "Recomposer les mots",
    entry: "../tools/recomposer-mots-syllabes/tool.js",
    description: "Recomposer plusieurs mots à partir de leurs syllabes mélangées.",
    tags: ["français", "lecture", "étude-du-code", "syllabes", "mots", "phonologie", "graphèmes", "tablette", "manipulation", "projection"]
  },
  {
    id: "mot-cache",
    label: "Mot caché",
    entry: "../tools/mot-cache/tool.js",
    description: "Retrouver un mot caché horizontalement ou verticalement dans une grille de lettres.",
    tags: ["français", "lecture", "étude-du-code", "phonologie", "graphèmes", "mots-mêlés", "grille", "tablette", "sélection", "projection"]
  },
  {
    id: "reperage-occurrences",
    label: "Repérage personnalisé",
    entry: "../tools/reperage-occurrences/tool.js",
    description: "Repérer toutes les occurrences d’une cible tirée parmi plusieurs possibilités personnalisées.",
    tags: ["français", "lecture", "étude-du-code", "discrimination-visuelle", "lettres", "graphèmes", "mots", "sélection", "projection"]
  },
  {
    id: "reperage-mots",
    label: "Repérage de mots",
    entry: "../tools/reperage-mots/tool.js",
    description: "Repérer toutes les occurrences d’un mot de la banque parmi des distracteurs graphiquement proches.",
    tags: ["français", "lecture", "étude-du-code", "phonologie", "graphèmes", "mots", "discrimination-visuelle", "sélection", "projection"]
  },
  {
    id: "geste-graphique",
    label: "Geste graphique",
    entry: "../tools/geste-graphique/tool.js",
    description: "Travailler le geste graphique des chiffres en repassant le tracé sur tablette.",
    tags: ["graphisme", "écriture", "chiffres", "tracé", "tablette", "projection"]
  },
  {
    id: "nombres-lettres",
    label: "Nombres en lettres",
    entry: "../tools/nombres-lettres/tool.js",
    description: "Lire et écrire les nombres en toutes lettres ou en chiffres, avec rendu Seyès dynamique.",
    tags: ["maths", "nombres", "ecriture", "seyes", "projection"]
  },
  {
    id: "conjugaison",
    label: "Conjugaison",
    entry: "../tools/conjugaison/tool.js",
    description: "Générer des questions de conjugaison à partir d’une base interne de formes verbales.",
    tags: ["français", "conjugaison", "verbe", "texte", "projection"]
  },
  {
    id: "quiz",
    label: "Quiz",
    entry: "../tools/quiz/tool.js",
    description: "Questions composées librement sur un canevas de widgets.",
    tags: ["quiz", "question", "reponse", "texte", "canevas", "projection"]
  },
]);

export function getToolRegistryMeta() {
  return ROOT_TOOLS_META;
}

export function getActiveToolsRegistry() {
  return [...ACTIVE_TOOLS_REGISTRY];
}

