# Outils et widgets

Dernière mise à jour : 2026-07-05.

## Outils élèves

Les outils élèves vivent dans `tools/`. Le registre principal est `tools/registry.js`.

La règle structurante reste la logique **tools-first** : chaque outil actif doit correspondre à une action élève claire. Une activité du Catalogue configure ensuite un outil précis.

`operations-trous` a été retiré. Il ne doit pas être réactivé sans nouvelle décision métier.

## Registre actif actuel

Le registre actif contient 29 outils.

| Outil | Libellé | Catalogue de secours |
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
| `nombres-lettres` | Nombres en lettres | non |
| `conjugaison` | Conjugaison | non |
| `question-reponse` | Question/Réponse | non |
| `qcm` | QCM | non |
| `flash-texte` | Flash-Texte | non |
| `flash-qcm` | Flash-QCM | non |
| `selection` | Sélection | non |

### Flash-Texte et Flash-QCM

`flash-texte` et `flash-qcm` sont deux outils dédiés au mode flash. Ils ne créent pas de nouveau type de banque : `flash-texte` utilise les banques Texte existantes et `flash-qcm` utilise les banques QCM existantes.

Le runtime reprend le layout de Question/Réponse ou QCM sans déplacer les zones : seul le contenu de l’item/question est affiché brièvement puis masqué, comme un carton que l’on retourne.

Réglages spécifiques : temps d’affichage de l’item en millisecondes, apparition des réponses directement ou après masquage de la question, et possibilité de revoir l’item une fois.


### QCM v2

`qcm` est désormais un moteur QCM multimédia. Il reste compatible avec les banques QCM texte existantes, mais les champs de question, bonne réponse et distracteurs peuvent aussi référencer un asset image système.

Formats acceptés dans une banque QCM :

- `asset:identifiant-image` pour afficher une image seule ;
- `{{asset:identifiant-image}} Texte complémentaire` pour afficher image + texte.

Les réglages de l’activité permettent de choisir séparément le layout global (automatique, vertical, horizontal) et le layout des réponses (automatique, grille, colonne, ligne).

Sous le widget `Banque`, le widget `Sélection de questions` permet, pour chaque niveau adaptatif, d’utiliser toute la banque ou une sélection personnalisée. La sélection personnalisée accepte un champ rapide du type `1-5, 10-15`, des boutons `Tout cocher` / `Tout décocher`, et une liste scrollable en lecture seule avec aperçu miniature de la question et de la bonne réponse.

Dans l’éditeur de banque QCM, le bouton `Insérer une image` ouvre le sélecteur d’assets partagé. L’image choisie est insérée dans la case active du tableau, avec un surlignage jaune pour éviter l’ambiguïté.

### Plus, moins, autant

`plus-moins-autant` est un outil de comparaison de collections par correspondance terme à terme. Il propose des objets rouges et bleus déplaçables librement dans une zone de manipulation. Le déplacement est une aide disponible pour l’élève, mais il n’est pas obligatoire : l’élève peut répondre directement s’il visualise déjà la comparaison.

Réglages principaux : disposition des objets, taille des collections, écart entre les collections et style d’objets (cubes, jetons, émojis aléatoires). La correction range rapidement les objets par paires pour faire apparaître les objets restants ou l’égalité.

### Monnaie — Représentation

`monnaie-representation` est le premier découpage métier de l’ancien outil `monnaie`. Il couvre uniquement :

- lire une somme ;
- composer une somme ;
- alterner les deux modes.

La difficulté n’est pas portée par des niveaux internes. Elle est pilotée par les réglages de l’activité : bornes min/max, pièces et billets disponibles, formats d’affichage, nombre d’essais, correction explicite ou non, et contrainte d’utilisation du minimum de pièces/billets.


## Assets système des outils

Les assets locaux partagés par les outils vivent dans `shared/tool-assets/`.

Structure retenue :

```text
shared/tool-assets/
├─ manifest.json
├─ tool-assets.js
├─ images/
└─ audio/
```

Le navigateur ne peut pas explorer librement un dossier local. L’interface doit donc lire `shared/tool-assets/manifest.json` pour afficher les images ou sons disponibles. Les fichiers images sont déposés dans `shared/tool-assets/images/...`.

Cette base sert notamment au **QCM v2 multimédia** : question texte/image et réponses texte/image, puis plus tard audio.

Un script de génération existe pour faciliter la maintenance du manifest :

```bash
node dev/generate-tool-assets-manifest.mjs
```

Pour commencer, le manifest peut rester minimal et être généré ou complété à partir des fichiers réellement présents.

## Catalogue de secours

Le catalogue de secours est la constante `CATALOG_ACTIVITIES` dans `shared/catalogue.js`.

Il sert uniquement de réserve côté code si la table système Supabase n’est pas encore disponible ou pour travailler hors Supabase. Dès que `catalog_activities` est disponible, Supabase doit rester la source principale du Catalogue.

État actuel :

- 22 activités sont présentes dans le catalogue de secours ;
- 5 outils actifs ne sont pas représentés dans ce catalogue local : `nombres-lettres`, `conjugaison`, `question-reponse`, `qcm`, `selection`.

Cette absence n’est pas forcément une erreur : ces outils peuvent être alimentés par Supabase, par les banques ou par des parcours spécifiques. Elle doit simplement rester documentée et volontaire.

## Outil legacy

Le registre legacy contient encore `monnaie`. Depuis le patch Monnaie — Représentation, la partie **Lire une somme / Composer une somme** a été extraite dans un outil actif séparé. Le legacy reste une réserve de code pour les autres modes : comparer des sommes, acheter des objets, trouver plusieurs façons, rendre la monnaie, etc.

## Widgets du Tableau

Les widgets enseignant vivent dans `teacher/js/teacher-tools/widgets/`.

Widgets présents :

- Arrière-plan — widget système obligatoire ;
- Élève au hasard ;
- Image ;
- Images multiples ;
- Horloge ;
- Instruments de géométrie ;
- Grille ;
- Étiquettes ;
- Couche de dessin.

Le widget Arrière-plan est masqué dans le sélecteur “Ajouter widget”, car il est toujours présent.
