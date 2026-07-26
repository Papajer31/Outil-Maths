# SQL historiques

Dernière mise à jour : 2026-07-24.

Les fichiers `01` à `10` retracent l’évolution du modèle Supabase. Ils sont conservés comme historique du projet et ne doivent pas être rejoués en bloc sur la base actuelle.

## Suppression des anciennes banques

`10_remove_question_banks.sql` a été exécuté avec succès le 24 juillet 2026.

Il a supprimé définitivement :

- `question_bank_items` ;
- `question_banks` ;
- `question_bank_folders` ;
- les RPC, fonctions, politiques, triggers, contraintes et index exclusivement liés à ces tables.

Le fichier reste conservé pour documenter la suppression.

## Scripts obsolètes liés aux banques

Les parties relatives aux banques dans les anciens scripts, notamment :

- `01_first_request.sql` ;
- `05_superadmin_resources_banks_delete.sql` ;
- `06_question_bank_instruction.sql` ;

sont historiques et ne doivent plus être exécutées sur la base actuelle.

## Quiz et ressources personnelles

Les scripts `07`, `08` et `09` documentent la mise en place du modèle Quiz et de ses ressources. Ils ne dépendent pas des anciennes banques.

## 11_resource_recordings_folder.sql

Ajoute une métadonnée JSON aux dossiers de ressources et un rôle interne unique par espace enseignant. Le rôle `recordings` permet de retrouver le dossier automatique des enregistrements audio même s’il est renommé ou déplacé. Cette migration doit être exécutée avant le patch de gestion centralisée des enregistrements audio.
