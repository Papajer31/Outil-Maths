# Outils, Quiz et Tableau

Dernière mise à jour : 2026-08-07.

## Outils élèves

Les outils vivent dans `tools/` et sont déclarés dans `tools/registry.js`. La règle reste **tools-first** : chaque outil actif doit correspondre à une action élève claire.

Le registre contient 32 outils :

| Outil | Libellé | Secours local |
|---|---|---|
| `addition` | Addition | oui |
| `soustraction` | Soustraction | oui |
| `multiplication-posee` | Multiplication posée | oui |
| `addition-trous` | Addition à trous | oui |
| `soustraction-trous` | Soustraction à trous | oui |
| `multiplication-trous` | Multiplication à trous | oui |
| `tables-multiplication` | Tables de multiplication | oui |
| `boites-jetons` | Boites à jetons | oui |
| `plus-moins-autant` | Plus, moins, autant | oui |
| `comparaison` | Comparaison | oui |
| `somme-difference` | Somme ou différence ? | oui |
| `collection` | Collection | oui |
| `calcul-cible` | Calcul ciblé | oui |
| `compte-est-bon` | Compte est bon | oui |
| `frise-picbille` | Frise Picbille | oui |
| `droite-numerique-simple` | Repérage sur droite simple | oui |
| `droite-numerique-complete` | Repérage sur droite complète | oui |
| `ordre-alphabetique-lettres` | Ordre alphabétique — Lettres | oui |
| `ordre-alphabetique-mots` | Ordre alphabétique — Mots | oui |
| `representation-picbille` | Représentation décimale — Picbille | oui |
| `representation-dede` | Représentation décimale — Dédé | oui |
| `representation-carres` | Représentation décimale — Carrés | oui |
| `representation-tuiles` | Représentation décimale — Tuiles | oui |
| `monnaie-representation` | Monnaie — Représentation | oui |
| `encodage` | Encodage | oui |
| `reperage-graphemes` | Repérage de graphèmes | non |
| `dictee-muette` | Dictée muette | non |
| `nuage-lettres` | Nuage de lettres | non |
| `geste-graphique` | Geste graphique | oui |
| `nombres-lettres` | Nombres en lettres | non |
| `conjugaison` | Conjugaison | non |
| `quiz` | Quiz | non |

`shared/catalogue.js` contient 26 activités de secours. Supabase reste la source principale de l’Exploration.

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

`Dictée muette` croise `phonology_words` avec les images actuellement classées dans `Ressources système > Imagier` (sous-dossiers compris). Le mot est choisi selon la sélection configurée ; le préfixe éventuel est donné à l’élève. Les aides disponibles sont une case par lettre et la mise en évidence des lettres utiles sur le clavier alphabétique.

Les outils d’étude du code utilisent le widget commun `shared/word-selection-selector.js`. `Sélection des mots` propose deux entrées : `Entrée phonémique`, fondée sur `shared/phonology-target-selector.js` et le référentiel strict `shared/phonology-targets.js`, et `Entrée graphémique`, fondée sur une ou plusieurs suites de lettres saisies librement. L’entrée phonémique ne contient plus que Voyelles, Voyelles nasales, Semi-voyelles et Consonnes. Les compositions (`oi`, `ien`, `ouille`, etc.) et les groupes graphiques (`vr`, `pr`, `ette`, `esse`, etc.) relèvent de l’entrée graphémique. L’entrée graphémique possède deux listes : `Inclure` (au moins une suite doit être présente) et `Exclure` (veto absolu : si une suite exclue apparait dans le mot, celui-ci est rejeté avant tout autre calcul). Exemple : inclure `ion` et exclure `tion` permet de conserver `avion` ou `lion` tout en rejetant `action` ou `attention`.

`Repérer les graphèmes` utilise désormais le moteur commun `shared/phonology-word-relevance.js`. La banque reste descriptive (`mot`, unités phonologiques, syllabation, familiarité 0–100) et le moteur calcule une pertinence pour chaque couple `(mot, son ciblé)`. Le score unique est réparti en `Simple` (90–100), `Normal` (80–89,9), `Complexe` (60–79,9) et `Exclu` (<60). Les cinq composantes provisoires sont : pureté de la cible 30, nombre d’occurrences 10, structure 15, absence de difficultés parasites 30 et familiarité 15. Une voyelle simple perceptivement soudée à une semi-voyelle dans la même syllabe constitue une impureté critique et ne peut pas être sauvée par la familiarité. Le panneau de diagnostic de l’outil permet de tester les scores avant généralisation aux autres outils.

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
