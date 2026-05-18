const ROOT_TOOLS_META = Object.freeze({
  key: "tools",
  label: "Outils"
});

const ACTIVE_TOOLS_REGISTRY = Object.freeze([
  {
    id: "operations",
    label: "Opérations",
    entry: "../tools/operations/tool.js",
    description: "Opérations paramétrables avec saisie clavier.",
    tags: ["maths", "calcul", "clavier", "projection"]
  },
  {
    id: "nombre-cible",
    label: "Nombre cible",
    entry: "../tools/nombre-cible/tool.js",
    description: "Composer un nombre cible à partir de boites à jetons.",
    tags: ["maths", "calcul", "décomposition", "nombre-cible", "jetons", "projection"]
  },
  {
    id: "monnaie",
    label: "Monnaie",
    entry: "../tools/monnaie/tool.js",
    description: "Lire, composer et comparer des sommes avec des pièces et billets manipulables.",
    tags: ["maths", "monnaie", "argent", "manipulation", "projection"]
  },
  {
    id: "operations-trous",
    label: "Opérations à trous",
    entry: "../tools/operations-trous/tool.js",
    description: "Retrouver le terme manquant dans une opération.",
    tags: ["maths", "calcul", "operation", "trou", "clavier", "projection"]
  },
  {
    id: "representation-decimale",
    label: "Représentation décimale",
    entry: "../tools/representation-decimale/tool.js",
    description: "Représentations décimales dynamiques en SVG.",
    tags: ["maths", "nombres", "svg", "representation", "projection"]
  },
  {
    id: "ordre-alphabetique",
    label: "Ordre alphabétique",
    entry: "../tools/ordre-alphabetique/tool.js",
    description: "Classer des lettres ou des mots dans l’ordre alphabétique par manipulation.",
    tags: ["vocabulaire", "alphabet", "glisser-deposer", "projection"]
  },
  {
    id: "encodage",
    label: "Encodage",
    entry: "../tools/encodage/tool.js",
    description: "Encodage phonographique avec graphèmes manipulables, réponse libre ou en cases.",
    tags: ["phonologie", "encodage", "graphèmes", "drag-drop", "projection"]
  },
  {
    id: "nombres-lettres",
    label: "Nombres en lettres",
    entry: "../tools/nombres-lettres/tool.js",
    description: "Lire et écrire les nombres en toutes lettres ou en chiffres, avec rendu Seyès dynamique.",
    tags: ["maths", "nombres", "ecriture", "seyes", "projection"]
  },
  {
    id: "reperage-numerique",
    label: "Repérage numérique",
    entry: "../tools/reperage-numerique/tool.js",
    description: "Lire et placer des nombres sur une frise Picbille ou une droite graduée.",
    tags: ["maths", "nombres", "droite-graduee", "picbille", "projection"]
  },
  {
    id: "conjugaison",
    label: "Conjugaison",
    entry: "../tools/conjugaison/tool.js",
    description: "Générer des questions de conjugaison à partir d’une base interne de formes verbales.",
    tags: ["français", "conjugaison", "verbe", "texte", "projection"]
  },
  {
    id: "question-reponse",
    label: "Question/Réponse",
    entry: "../tools/question-reponse/tool.js",
    description: "Questions à réponse textuelle courte issues d’une banque de contenus.",
    tags: ["question", "reponse", "texte", "banque", "projection"]
  },
  {
    id: "qcm",
    label: "QCM",
    entry: "../tools/qcm/tool.js",
    description: "Questionnaires à choix unique issus d’une banque QCM.",
    tags: ["qcm", "question", "choix", "banque", "projection"]
  },
  {
    id: "selection",
    label: "Sélection",
    entry: "../tools/selection/tool.js",
    description: "Sélectionner des mots dans un énoncé issu d’une banque de contenus.",
    tags: ["selection", "mots", "grammaire", "banque", "projection"]
  }
]);

export function getToolRegistryMeta() {
  return ROOT_TOOLS_META;
}

export function getActiveToolsRegistry() {
  return [...ACTIVE_TOOLS_REGISTRY];
}
