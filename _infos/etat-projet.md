# État actuel du projet — Site d’outils

Dernière mise à jour : 2026-07-24.

## Intention générale

Le site est une plateforme web d’outils pédagogiques pour la classe.

- Côté élève : accès simple à des activités lisibles, manipulables et adaptées.
- Côté enseignant : Classe, Catalogue, Missions, Quiz, Ressources et Tableau projetable.
- Côté super-admin : fonctions supplémentaires intégrées au Catalogue et aux Quiz système.

Il n’existe plus d’onglet Admin ni d’onglet Banques.

La logique produit reste **tools-first** : un outil visible correspond à une action élève claire. Les activités du Catalogue configurent ces outils. Les Missions assemblent des activités, tandis que l’Atelier Quiz permet de créer directement des questions composées.

## Vocabulaire produit

Côté élève :

- **Exploration** : accès libre aux activités visibles du Catalogue.
- **Aventure** : progression adaptative personnelle avec code élève.
- **Mission** : parcours attribué par l’enseignant.

Côté enseignant :

- **Classe** : élèves, niveaux, codes et informations de classe.
- **Catalogue** : activités système consultables, testables et visibles ou masquées dans Exploration.
- **Missions** : parcours attribuables.
- **Quiz** : Quiz personnels et Quiz système.
- **Ressources** : ressources personnelles Supabase et ressources système locales.
- **Tableau** : widgets projetables.

## Catalogue

Le Catalogue est l’interface commune à tous les enseignants.

Un enseignant normal peut consulter, tester, afficher ou masquer une activité. Le super-admin utilise le même explorateur et dispose en plus des actions de création, modification, duplication, suppression, publication et réorganisation.

Chaque activité peut comporter cinq niveaux fonctionnels : grande difficulté, petite difficulté, normal, réussite et grande réussite. Le niveau 3 est le point de départ normal.

### Catalogue de secours

`shared/catalogue.js` contient 26 activités locales couvrant 26 des 29 outils actifs. Il sert uniquement hors Supabase ou si le Catalogue système est indisponible.

Les outils actifs absents du catalogue local sont :

- `nombres-lettres` ;
- `conjugaison` ;
- `quiz`.

## Missions

Une Mission est un parcours construit à partir d’activités du Catalogue. Elle n’est pas une ancienne activité personnelle renommée.

## Quiz

Les Quiz personnels sont modifiables par leur enseignant. Les Quiz système sont visibles par tous et modifiables uniquement par le super-admin.

Le document du Quiz contient directement les questions, variantes et widgets. Il ne dépend d’aucune banque de questions.

Les Quiz système ne doivent utiliser que des ressources système locales issues du manifest.

## Ressources

- Les ressources système restent dans le projet et sont indexées par `shared/tool-assets/manifest.json`.
- Les ressources personnelles sont stockées dans Supabase et le bucket privé associé.
- Les enregistrements audio réalisés depuis Ressources ou depuis un widget Audio de Quiz deviennent immédiatement des ressources personnelles. Le Quiz conserve leur UUID, jamais leur chemin Storage.
- Le dossier logique `Enregistrements` est retrouvé grâce à `resource_folders.metadata.system_role = "recordings"`, même s’il est renommé ou déplacé.
- Les données techniques `image_assets`, `phonology_words` et `vocabulary_default_words` restent en base, mais ne possèdent plus d’interface Admin.

## Suppression des banques

Les anciennes banques et les cinq outils qui en dépendaient ont été supprimés fonctionnellement. Les tables Supabase correspondantes ont été supprimées le 24 juillet 2026 avec `10_remove_question_banks.sql`.

Les fichiers SQL antérieurs sont conservés comme historique et ne doivent pas être rejoués.

## Tableau

Le Tableau fonctionne avec des widgets. L’arrière-plan est un widget système obligatoire : visible dans la colonne des widgets, mais non supprimable, non duplicable et non projeté comme cadre manipulable.
