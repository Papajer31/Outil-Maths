# Architecture — repères actuels

Dernière mise à jour : 2026-08-07.

## Entrées principales

- `index.html` — entrée générale.
- `student/` — interface élève.
- `teacher/` — dashboard enseignant.
- `tools/` — outils d’activité.
- `shared/` — contrats, API et composants partagés.
- `teacher/js/teacher-tools/` — widgets du Tableau.

Il n’existe plus d’onglet Admin ni d’onglet Banques.

## Règles structurantes

1. Une activité d’Exploration configure un outil.
2. Une Mission assemble des activités d’Exploration.
3. Un Quiz stocke directement ses questions, variantes et widgets.
4. Toute ressource pédagogique est stockée dans Supabase.
5. Les fichiers de `shared/tool-assets/` sont uniquement des dépendances techniques chargées explicitement par les outils.
6. Le Tableau manipule des widgets projetables.
7. Les actions super-admin sont intégrées aux écrans métier.

Les anciens modèles d’activités personnelles et de banques ne doivent pas être réintroduits.

## Exploration et super-admin

`teacher/js/dashboard/activities-view.js` est l’explorateur commun.

`pedagogical_nodes` porte l’arborescence unique :

```text
discipline > domain > theme > learning_objective > grade_level
```

Une activité système doit viser un nœud terminal `grade_level`. Le super-admin complète l’explorateur avec `catalog-admin-view.js` et `catalog-tree-admin-dialog.js` ; il n’existe pas de second catalogue parallèle.

## Quiz

Les Quiz personnels appartiennent à un espace enseignant. Les Quiz système ont `is_system = true` et sont modifiables uniquement par le super-admin.

Un Quiz système ne peut référencer que des ressources système. Un Quiz personnel peut aussi référencer les ressources personnelles de son espace. Les documents stockent l’UUID de la ressource, jamais un chemin local ni une URL temporaire.

## Runtime élève et historique

Le runtime consomme une configuration normalisée : outil, questions, temps, consigne, feedback et phases de réponse. `answer_display_seconds = 0` désactive la phase automatique d’affichage de la réponse.

Chaque activité individuelle ouvre une tentative, écrit les questions dans l’ordre puis finalise la tentative. Le contrat est commun aux contextes `exploration`, `mission` et `adventure`. Un outil peut fournir `getHistorySnapshot(stage, container, context)` ; un instantané DOM compact sert de repli. Le détail est documenté dans `historique-activites.md`.

## Modules partagés des outils

- `shared/tool-ui/` — composants UI génériques et bas niveau.
- `shared/tool-commons/` — logique fonctionnelle ou pédagogique commune à une famille d’outils.

Un module utilisable tel quel par des outils très différents va plutôt dans `tool-ui`. Un module qui connaît une famille pédagogique va dans `tool-commons`, dans un sous-dossier explicite.

## Ressources et assets

Les ressources visibles dans l’explorateur vivent dans Supabase (`resources`, `resource_folders`, Storage). Les images système possèdent en plus une entrée `image_assets` avec un slug stable.

`shared/tool-assets/` ne contient que :

```text
personnages/                 personnages intégrés aux outils
monnaie/                     pièces et billets techniques
representation/              images techniques des représentations
asset-picker.js / .css       sélecteur visuel partagé
labels.js                    libellés du sélecteur
collection-allowed-assets.js liste blanche des collections
```

Il n’existe plus de manifeste statique. Les banques pédagogiques sont chargées explicitement depuis Supabase, par exemple par `shared/public-emoji-assets.js` pour les `emoji_*`.

## Tableau enseignant

La scène contient notamment son arrière-plan et son verrouillage. L’arrière-plan est exposé comme widget système obligatoire, mais reste stocké dans `scene.background` et n’est pas envoyé à la projection comme widget manipulable.

## Historique de l’architecture

Les modèles `activity_configs` / `activity_folders`, `question_banks` / `question_bank_items` / `question_bank_folders`, la portée héritée des niveaux et le catalogue statique de ressources ont été supprimés. Voir `legacy.md` et `supabase.md`.
