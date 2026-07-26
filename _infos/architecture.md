# Architecture — repères actuels

Dernière mise à jour : 2026-07-24.

## Entrées principales

- `index.html` : entrée générale.
- `student/` : interface élève.
- `teacher/` : dashboard enseignant avec Classe, Catalogue, Missions, Quiz, Ressources et Tableau.
- `shared/` : logique partagée entre élève, enseignant et runtimes.
- `tools/` : outils d’activité côté élève.
- `teacher/js/teacher-tools/` : widgets du Tableau enseignant.

Il n’existe plus d’onglet Admin ni d’onglet Banques.

## Règles structurantes

1. Une activité Catalogue configure un outil.
2. Une Mission assemble des activités Catalogue.
3. Un Quiz stocke directement ses questions, variantes et widgets dans son document.
4. Les ressources système sont locales et indexées par `shared/tool-assets/manifest.json`.
5. Les ressources personnelles sont stockées dans Supabase et son Storage.
6. Le Tableau manipule des widgets projetables.
7. Les fonctions super-admin sont intégrées aux écrans métier concernés, principalement Catalogue et Quiz.

Les anciennes activités personnelles et les anciennes banques de questions ne doivent pas être réintroduites comme modèles produit actifs.

## Catalogue et super-admin

`teacher/js/dashboard/activities-view.js` reste l’explorateur commun du Catalogue.

`teacher/js/dashboard/catalog-admin-view.js` complète cet explorateur pour le super-admin : création, édition, duplication, suppression, publication et réorganisation. Il ne construit pas un second Catalogue parallèle.

## Quiz

L’Atelier Quiz constitue le système de création de questions actuel. Les Quiz personnels appartiennent à un espace enseignant. Les Quiz système ont `is_system = true` et sont modifiables uniquement par le super-admin.

Un Quiz système ne doit utiliser que des ressources système locales. Il ne doit pas dépendre d’une ressource personnelle Supabase.

## Runtime élève

Le runtime consomme une configuration normalisée : outil, questions, temps, consigne, feedback et phases de réponse. Le réglage `answer_display_seconds = 0` signifie : ne pas afficher de phase de réponse automatique.

## Tableau enseignant

Le Tableau possède une scène et des widgets. La scène porte notamment :

```js
scene: {
  background: "space",
  locked: false
}
```

L’arrière-plan est exposé comme widget système obligatoire, mais il reste stocké dans `scene.background`. Il n’est pas envoyé à la projection comme widget manipulable.

## Convention `shared/tool-ui/` et `shared/tool-commons/`

- `shared/tool-ui/` contient les briques UI génériques et bas niveau : clavier numérique, champ de réponse numérique, formatage d’affichage, helpers d’interaction.
- `shared/tool-commons/` contient les communs fonctionnels ou les socles de familles d’outils : sélection de questions, logique partagée d’une famille pédagogique, éditeurs ou runtimes communs.

Règle pratique : si un module peut être utilisé tel quel par des outils très différents, il va plutôt dans `tool-ui`. S’il connaît une famille d’outils ou une logique pédagogique, il va plutôt dans `tool-commons`.

Les nouveaux communs de famille doivent être rangés dans un sous-dossier explicite, par exemple :

```text
shared/tool-commons/calcul/
shared/tool-commons/general-tools/
shared/tool-commons/decimal-representation/
```

## Assets partagés

Les ressources système utilisées par les outils et les Quiz vivent dans `shared/tool-assets/`.

- `shared/tool-assets/images/...` : images système ;
- `shared/tool-assets/audio/...` : sons système ;
- `shared/tool-assets/manifest.json` : index lu par l’interface ;
- `shared/tool-assets/tool-assets.js` : chargement, recherche et résolution ;
- `shared/tool-assets/asset-picker.js` / `.css` : sélecteur visuel partagé.

L’interface ne scanne pas les dossiers directement : elle lit le manifest. Le script `_dev/generate-tool-assets-manifest.mjs` peut régénérer ce manifest.

Les audios personnels des Quiz ne sont pas stockés dans IndexedDB. Ils sont créés dans `resources`, stockés dans le bucket privé `teacher-resources` et référencés par UUID dans le document du Quiz. `shared/quiz-audio-source.js` résout indifféremment une ressource Supabase ou un audio système du manifest.

## Historique

Les anciens modèles `activity_configs` / `activity_folders` et `question_banks` / `question_bank_items` / `question_bank_folders` ne font plus partie de l’architecture active. Les SQL correspondants sont conservés comme historique. Voir `legacy.md`, `supabase.md` et `audit-suppression-banques.md`.
