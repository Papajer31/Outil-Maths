# Legacy — ce qui ne doit plus piloter le projet

Dernière mise à jour : 2026-07-24.

## Ancien éditeur d’activités personnelles

Le modèle `activity_configs` / `activity_folders` n’est plus le modèle produit actif. Le dashboard s’appuie sur le Catalogue système, les Missions et les Quiz.

Les anciens modules d’édition personnelle ne doivent pas être réintroduits.

## Anciennes banques de questions

Le modèle suivant a été supprimé de l’application et de Supabase :

- `question_banks` ;
- `question_bank_items` ;
- `question_bank_folders`.

Les outils entièrement dépendants de ce modèle ont également été supprimés :

- `question-reponse` ;
- `qcm` ;
- `selection` ;
- `flash-question-reponse` ;
- `flash-qcm`.

Aucune rétrocompatibilité n’est prévue. Les futurs comportements équivalents doivent être développés dans l’Atelier Quiz.

## SQL historiques

Les fichiers SQL ayant créé ou modifié les anciennes banques sont conservés pour témoigner de l’historique du projet. Ils sont obsolètes et ne doivent pas être rejoués.

La suppression physique a été réalisée avec `10_remove_question_banks.sql`.

## Registre legacy

Le registre actif ne contient plus de registre legacy parallèle. Un ancien code peut rester documenté pour mémoire, mais il ne doit pas être exposé par `tools/registry.js`.

## Monnaie

L’ancien outil monolithique `monnaie` n’est plus présent. `monnaie-representation` couvre Lire une somme et Composer une somme. Les autres usages éventuels devront être créés sous forme d’outils autonomes.

## Règle

Un élément legacy peut rester documenté ou archivé, mais il ne doit pas servir de point d’appui implicite aux nouveaux développements.
