# Supabase — état documentaire actuel

Dernière mise à jour : 2026-06-27.

## Statut des SQL

Le dossier `_infos/sql` est un historique de requêtes. Il sert à comprendre l’évolution du projet, mais il ne doit pas être rejoué comme une migration propre de production.

À terme, il faudra distinguer clairement :

- les SQL historiques conservés pour mémoire ;
- les migrations réellement rejouables ;
- les scripts ponctuels d’administration.

## Modèle actif

Blocs actifs ou attendus :

- espaces enseignants ;
- classes et élèves ;
- Catalogue système ;
- visibilité du Catalogue par enseignant ;
- Missions ;
- progression élève par activité Catalogue ;
- ressources système ;
- banques personnelles et système ;
- super-admin.

## Tables utilisées par le code JS

Cette liste documente les tables actuellement référencées dans le code côté client.

- `catalog_activities`
- `catalog_activity_visibility`
- `image_assets`
- `mission_assignments`
- `mission_folders`
- `mission_steps`
- `missions`
- `phonology_words`
- `question_bank_folders`
- `question_bank_items`
- `question_banks`
- `students`
- `teacher_classes`
- `teacher_phonology_presets`
- `teacher_spaces`
- `teacher_vocabulary_words`
- `vocabulary_default_words`

## RPC utilisées par le code JS

- `access_code_exists`
- `delete_catalog_activity_cascade`
- `get_catalog_activity_usage_as_admin`
- `get_catalog_visibility_for_space`
- `get_conjugation_personal_list`
- `get_question_bank_items_for_space`
- `get_space_classes`
- `get_space_mission_steps`
- `get_space_missions`
- `get_space_students`
- `get_space_vocabulary_words`
- `get_student_activity_progress`
- `is_super_admin`
- `record_student_activity_session`
- `replace_question_bank_items`
- `replace_teacher_vocabulary_words`
- `reset_teacher_vocabulary_words`
- `verify_student_code`

## Ancien modèle

`activity_configs` et `activity_folders` sont legacy. Ils ne doivent plus guider les nouveaux écrans ni les nouvelles fonctions API.

## Banques

Tables principales :

- `question_banks` ;
- `question_bank_items` ;
- `question_bank_folders`.

Deux familles doivent être distinguées : banques personnelles et banques système protégées. La duplication d’une banque système vers les banques personnelles existe côté code et doit rester vérifiée/documentée en usage réel.
