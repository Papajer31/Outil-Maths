# Supabase — état documentaire actuel

Dernière mise à jour : 2026-07-24.

## Statut des SQL

Le dossier `_infos/sql` constitue l’historique des requêtes ayant construit et fait évoluer le projet. Ces fichiers ne doivent pas être rejoués comme un ensemble de migrations de production.

`10_remove_question_banks.sql` a été exécuté avec succès le 24 juillet 2026. Il est désormais lui aussi historique.

## Modèle actif

Blocs actifs ou attendus :

- espaces enseignants ;
- classes et élèves ;
- Catalogue système ;
- visibilité du Catalogue par enseignant ;
- Missions ;
- progression élève par activité Catalogue ;
- super-admin ;
- Quiz Supabase ;
- ressources personnelles Supabase et Storage ;
- ressources techniques utilisées par certains outils.

## Tables utilisées par le code JavaScript

- `catalog_activities`
- `catalog_activity_visibility`
- `image_assets`
- `mission_assignments`
- `mission_folders`
- `mission_steps`
- `missions`
- `phonology_words`
- `quiz_folders`
- `quiz_resources`
- `quizzes`
- `resource_folders`
- `resources`
- `students`
- `teacher_classes`
- `teacher_phonology_presets`
- `teacher_spaces`
- `teacher_vocabulary_words`
- `vocabulary_default_words`

## RPC utilisées par le code JavaScript

- `access_code_exists`
- `delete_catalog_activity_cascade`
- `get_catalog_activity_usage_as_admin`
- `get_catalog_visibility_for_space`
- `get_conjugation_personal_list`
- `get_space_classes`
- `get_space_mission_steps`
- `get_space_missions`
- `get_space_students`
- `get_space_vocabulary_words`
- `get_student_activity_progress`
- `is_super_admin`
- `record_student_activity_session`
- `replace_teacher_vocabulary_words`
- `reset_teacher_vocabulary_words`
- `verify_student_code`

## Ancien modèle des banques

Les objets suivants ont été supprimés physiquement de Supabase :

- `question_banks` ;
- `question_bank_items` ;
- `question_bank_folders` ;
- les fonctions et politiques exclusivement liées à ces tables.

Aucune rétrocompatibilité n’est prévue.

Les expressions « banque de mots » présentes dans les outils d’ordre alphabétique désignent des listes de vocabulaire. Elles n’ont aucun lien avec l’ancien modèle des banques de questions.

## Quiz

L’Atelier Quiz utilise `quiz_folders` et `quizzes`. Le document complet du Quiz est stocké en `jsonb` dans `quizzes.document`, avec une version de schéma séparée.

Les liaisons avec les ressources personnelles utilisent `quiz_resources`.

## Ressources personnelles

Les dossiers et métadonnées utilisent `resource_folders` et `resources`. Le bucket privé `teacher-resources` peut exposer temporairement au runtime élève les ressources réellement utilisées par un Quiz.

La migration `11_resource_recordings_folder.sql` ajoute `resource_folders.metadata`. Le rôle interne `recordings` identifie le dossier automatique des enregistrements sans dépendre de son nom ni de sa position. Les fichiers audio sont stockés sous une clé physique immuable contenant l’UUID de la ressource ; renommer ou déplacer une ressource ne modifie donc pas les références des Quiz.

## Ressources système et techniques

Les ressources système de l’interface sont locales et indexées par `shared/tool-assets/manifest.json`.

Les tables `image_assets`, `phonology_words` et `vocabulary_default_words` restent actives pour les outils qui les consomment. Leur ancienne interface d’administration a disparu. Un outil d’import technique indépendant pourra être créé ultérieurement.
