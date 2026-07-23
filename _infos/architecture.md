# Architecture — repères actuels

Dernière mise à jour : 2026-07-12.

## Entrées principales

- `index.html` : entrée générale.
- `student/` : interface élève.
- `teacher/` : dashboard enseignant, Catalogue, Missions, Banques, Tableau, Admin.
- `shared/` : logique partagée entre élève, enseignant et runtime.
- `tools/` : outils d’activité côté élève.
- `teacher/js/teacher-tools/` : widgets du Tableau enseignant.

## Règles structurantes

1. Une activité Catalogue configure un outil.
2. Une Mission assemble des activités Catalogue.
3. Une Banque stocke des contenus réutilisables.
4. Le Tableau manipule des widgets projetables.
5. Les anciennes activités personnelles ne doivent pas être réintroduites comme modèle produit actif.

## Runtime élève

Le runtime consomme une configuration normalisée : outil, questions, temps, consigne, feedback, phases de réponse. Le réglage `answer_display_seconds = 0` signifie désormais : **ne pas afficher la phase de réponse automatique**.

## Tableau enseignant

Le Tableau possède une scène et des widgets. La scène porte notamment :

```js
scene: {
  background: "space",
  locked: false
}
```

L’arrière-plan est exposé dans l’interface comme widget système obligatoire, mais il reste stocké dans `scene.background`. Il n’est pas envoyé à la projection comme widget manipulable.

## Convention `shared/tool-ui/` et `shared/tool-commons/`

Les dossiers `shared/tool-ui/` et `shared/tool-commons/` ne doivent pas devenir deux fourre-tout concurrents.

- `shared/tool-ui/` contient les briques UI génériques et bas niveau, réutilisables par plusieurs outils sans connaître leur métier : clavier numérique, champ de réponse numérique, auto-ajustement visuel, formatage d'affichage, helpers d'interaction.
- `shared/tool-commons/` contient les communs fonctionnels ou les socles de familles d'outils : sélection de questions, sélecteur de banque, cœurs partagés d'une famille pédagogique, logique commune d'éditeur ou de runtime.

Règle pratique : si le module peut être utilisé tel quel par des outils très différents, il va plutôt dans `tool-ui`. S'il connaît une famille d'outils, une banque, une activité ou une logique pédagogique, il va plutôt dans `tool-commons`.

Les nouveaux communs de famille doivent être rangés dans un sous-dossier explicite, par exemple :

```text
shared/tool-commons/calcul/
shared/tool-commons/general-tools/
shared/tool-commons/decimal-representation/
```

Les nouveaux imports doivent cibler les fichiers canoniques, pas les façades racine.

## Assets partagés

Les ressources système utilisées par les outils peuvent être stockées dans `shared/tool-assets/`.

- `shared/tool-assets/images/...` : images système pour les outils ;
- `shared/tool-assets/audio/...` : sons système à venir ;
- `shared/tool-assets/manifest.json` : index exploitable par l’interface ;
- `shared/tool-assets/tool-assets.js` : helper de chargement, recherche et résolution des assets ;
- `shared/tool-assets/asset-picker.js` / `.css` : sélecteur visuel commun pour choisir un asset depuis l’interface.

L’interface ne scanne pas les dossiers directement : elle lit le manifest. Le script `dev/generate-tool-assets-manifest.mjs` peut régénérer ce manifest à partir des fichiers présents.

Le QCM v2 utilise cette base via des références `asset:identifiant-image` ou `{{asset:identifiant-image}}` dans les champs des banques QCM. L’éditeur de banque QCM propose un bouton `Insérer une image` qui ouvre le sélecteur d’assets et insère la référence dans la case active.

Dans l’éditeur d’activité, QCM v2 peut filtrer une banque par niveau adaptatif : le widget `Sélection de questions` stocke dans les réglages du niveau courant une sélection stable de questions, sous la forme `questionSelection: { mode, questionKeys }`. Le runtime filtre le deck avant le tirage dans l’ordre ou aléatoire.

## Legacy

Les anciens fichiers et RPC liés à `activity_configs` / `activity_folders` ne constituent plus l’architecture active. Voir `legacy.md`.
