# Outils et widgets

Dernière mise à jour : 2026-07-24.

## Outils élèves

Les outils élèves vivent dans `tools/`. Le registre principal est `tools/registry.js`.

La règle structurante reste la logique **tools-first** : chaque outil actif doit correspondre à une action élève claire. Une activité du Catalogue configure ensuite un outil précis.

Le registre actif contient 29 outils. Il n’existe plus de registre legacy parallèle.

## Registre actif actuel

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
| `geste-graphique` | Geste graphique | oui |
| `nombres-lettres` | Nombres en lettres | non |
| `conjugaison` | Conjugaison | non |
| `quiz` | Quiz | non |

## Atelier Quiz

`quiz` est l’outil de questions composées. Il stocke ses questions, variantes et widgets dans un document propre, sans banque externe.

Éléments actuellement disponibles dans l’atelier :

- Texte ;
- Réponse de l’élève ;
- Image ;
- Audio ;
- Clavier numérique ;
- QCM texte ;
- Sélection de mots.

Évolution décidée : ajouter plus tard **Texte flash** et **Image flash** comme éléments explicites de la palette. En interne, ils devront réutiliser les moteurs Texte et Image avec un comportement Flash, sans second éditeur ni nouveau format indépendant.

## Outils supprimés avec les banques

Les outils suivants ne font plus partie du registre ni du projet actif :

- `question-reponse` ;
- `qcm` ;
- `selection` ;
- `flash-question-reponse` ;
- `flash-qcm`.

Le QCM texte et la sélection de mots restent disponibles comme éléments du Quiz ; ils ne correspondent pas aux anciens outils autonomes.

## Assets système des outils et des Quiz

Les assets locaux partagés vivent dans `shared/tool-assets/`.

```text
shared/tool-assets/
├─ manifest.json
├─ tool-assets.js
├─ images/
└─ audio/
```

Le navigateur lit `manifest.json` pour afficher les images et sons disponibles. Le script suivant régénère le manifest :

```bash
node _dev/generate-tool-assets-manifest.mjs
```

Les Quiz système doivent utiliser uniquement ces assets locaux. Les Quiz personnels peuvent aussi utiliser les ressources personnelles Supabase.

## Catalogue de secours

`CATALOG_ACTIVITIES` dans `shared/catalogue.js` contient 26 activités et couvre 26 outils actifs.

Les trois outils actifs absents du catalogue local sont :

- `nombres-lettres` ;
- `conjugaison` ;
- `quiz`.

Supabase reste la source principale du Catalogue lorsque la table système est disponible.

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

Le widget Arrière-plan est masqué dans le sélecteur « Ajouter widget », car il est toujours présent.
