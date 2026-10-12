# Outils, Quiz et Tableau

Dernière revue globale : 2026-08-07. Mise à jour ciblée : 2026-10-11 (registre et Catalogue).

## Outils élèves

Les outils vivent dans `tools/` et sont déclarés dans `tools/registry.js`. La règle reste **tools-first** : chaque outil actif doit correspondre à une action élève claire.

Le registre contient 43 outils :

| Outil | Libellé |
|---|---|
| `addition` | Addition |
| `soustraction` | Soustraction |
| `multiplication-posee` | Multiplication posée |
| `addition-trous` | Addition à trous |
| `soustraction-trous` | Soustraction à trous |
| `multiplication-trous` | Multiplication à trous |
| `tables-multiplication` | Tables de multiplication |
| `boites-jetons` | Boites à jetons |
| `plus-moins-autant` | Plus, moins, autant |
| `comparaison` | Différence entre collections |
| `comparaison-signes` | Comparaison (introduction) |
| `somme-difference` | Somme ou différence ? |
| `collection` | Collection |
| `calcul-cible` | Calcul ciblé |
| `compte-est-bon` | Compte est bon |
| `frise-picbille` | Frise Picbille |
| `droite-numerique-simple` | Repérage sur droite simple |
| `droite-numerique-complete` | Repérage sur droite complète |
| `ordre-alphabetique-lettres` | Ordre alphabétique — Lettres |
| `ordre-alphabetique-mots` | Ordre alphabétique — Mots |
| `representation-picbille` | Représentation décimale — Picbille |
| `representation-dede` | Représentation décimale — Dédé |
| `representation-carres` | Représentation décimale — Carrés |
| `representation-tuiles` | Représentation décimale — Tuiles |
| `monnaie-representation` | Monnaie — Représentation |
| `m-millimetre` | M. Millimètre |
| `points-alignes` | Points alignés |
| `encodage` | Encodage |
| `reperage-graphemes` | Repérer les graphèmes |
| `dictee-muette` | Dictée muette |
| `presence-son` | Présence du son |
| `nuage-lettres` | Nuage de lettres |
| `segmenter-mots` | Segmenter les mots |
| `recomposer-mots-syllabes` | Recomposer les mots |
| `mot-cache` | Mot caché |
| `reperage-occurrences` | Repérage personnalisé |
| `reperage-mots` | Repérage de mots |
| `geste-graphique` | Geste graphique |
| `copie` | Copie |
| `nombres-lettres` | Nombres en lettres |
| `identifier-verbe` | Identifier le verbe |
| `conjugaison` | Conjugaison |
| `quiz` | Quiz |

L’Exploration dépend exclusivement de Supabase pour les activités (`catalog_activities`) et l’arborescence (`pedagogical_nodes`). Le module `shared/catalogue.js` conserve les fonctions partagées nécessaires au runtime.

## Atelier Quiz

Le Quiz stocke ses questions, variantes et widgets dans son propre document, sans banque externe.

Éléments disponibles :

- Texte ;
- Réponse de l’élève ;
- Image ;
- Audio ;
- Clavier numérique ;
- QCM texte ;
- Sélection de mots.

Évolution conservée : ajouter plus tard **Texte flash** et **Image flash** en réutilisant les moteurs existants, sans second éditeur ni nouveau format de données.

## Ressources utilisées par les outils

Les ressources pédagogiques sont chargées depuis Supabase. Les assets statiques sont réservés au fonctionnement interne des outils.

Les cartons de graphèmes utilisent des slugs `grapheme_*`. Les émojis utilisent des slugs `emoji_*` et sont chargés par `shared/public-emoji-assets.js`.

`Dictée muette` croise `lexical_entries` avec les images actuellement classées dans `Ressources système > Imagier` (sous-dossiers compris). Le mot est choisi selon la sélection configurée ; le préfixe éventuel est donné à l’élève. Les aides disponibles sont une case par lettre et la mise en évidence des lettres utiles sur le clavier alphabétique.

Les outils d’étude du code utilisent le widget commun `shared/word-selection-selector.js`. `Sélection des mots` propose deux entrées : `Entrée phonémique`, fondée sur `shared/phonology-target-selector.js` et le référentiel strict `shared/phonology-targets.js`, et `Entrée graphémique`, fondée sur une ou plusieurs suites de lettres saisies librement. L’entrée phonémique ne contient plus que Voyelles, Voyelles nasales, Semi-voyelles et Consonnes. Les compositions (`oi`, `ien`, `ouille`, etc.) et les groupes graphiques (`vr`, `pr`, `ette`, `esse`, etc.) relèvent de l’entrée graphémique. L’entrée graphémique possède deux listes : `Inclure` (au moins une suite doit être présente) et `Exclure` (veto absolu : si une suite exclue apparait dans le mot, celui-ci est rejeté avant tout autre calcul). Exemple : inclure `ion` et exclure `tion` permet de conserver `avion` ou `lion` tout en rejetant `action` ou `attention`.

Dans `Entrée phonémique`, l’ordre des graphies et leur classement `fréquentes / rares` sont des données fixes du référentiel `shared/phonology-targets.js`. Ils ne dépendent ni du niveau de mots choisi, ni du pool disponible dans un outil, ni des graphies déjà cochées. Cocher ou décocher une graphie ne modifie donc jamais sa position ni sa catégorie.

Les outils d’étude du code lisent désormais `lexical_entries`, via la vue runtime commune de `shared/lexical-bank.js`. Le niveau lexical est strictement `1`, `2` ou `3` et le filtre est cumulatif : 1 = niveau 1 ; 2 = niveaux 1+2 ; 3 = niveaux 1+2+3. Ils appliquent ensuite leurs contraintes explicites (cible phonémique ou graphémique, graphies activées, lettres muettes, complexité CGP, longueur, image, nombre de syllabes, etc.). Le score de régularité G-P reste uniquement une pondération de tirage : il est recalculé à partir des unités phonologiques de la nouvelle banque et ne peut jamais exclure un mot.

`shared/tool-assets/collection-allowed-assets.js` contient la liste blanche des images autorisées dans les collections. Elle empêche qu’une image disponible dans l’imagier soit automatiquement utilisée dans un contexte pédagogique inadapté.

Les images restent invisibles jusqu’à la fin de leur chargement afin d’éviter le flash du texte alternatif.

## Tableau projetable

Les widgets vivent dans `teacher/js/teacher-tools/widgets/` :

- Arrière-plan — widget système obligatoire ;
- Élève au hasard ;
- Image ;
- Images multiples ;
- Horloge ;
- Instruments de géométrie ;
- Grille ;
- Étiquettes ;
- Couche de dessin.

L’arrière-plan est toujours présent, mais non supprimable, non duplicable, non déplaçable et non projeté comme widget indépendant. Son état reste dans `scene.background`.

## Outils supprimés

`question-reponse`, `qcm`, `selection`, `flash-question-reponse` et `flash-qcm` ne font plus partie du projet actif. Le QCM texte et la sélection de mots existent uniquement comme éléments du Quiz.
