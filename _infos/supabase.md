# Supabase — état documentaire actuel

Dernière mise à jour : 2026-08-07.

## Règle d’exécution

`_infos/sql/` est l’historique des requêtes qui ont construit le projet. Les fichiers numérotés ne doivent jamais être rejoués en bloc sur la base actuelle. Lire `sql/README.md` avant toute exécution.

## Blocs actifs

- espaces enseignants, classes et élèves ;
- Exploration système et visibilité par enseignant ;
- Missions ;
- progression et historique détaillé des activités ;
- fondations Aventure ;
- Quiz ;
- ressources personnelles et système ;
- banques techniques `image_assets`, `phonology_words` et `vocabulary_default_words`.

## Tables utilisées par le client

- `catalog_activities`
- `pedagogical_nodes`
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
- `student_activity_progress`
- `student_activity_sessions`
- `student_activity_session_questions`
- `adventure_class_cursors`
- `student_adventure_tier_progress`
- `student_adventure_days`
- `student_adventure_passages`
- `students`
- `teacher_classes`
- `teacher_phonology_presets`
- `teacher_spaces`
- `teacher_vocabulary_words`
- `vocabulary_default_words`

## RPC principales utilisées par le client

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
- `open_student_adventure_day`
- `get_student_adventure_progress`
- `is_super_admin`
- `start_student_activity_attempt`
- `record_student_activity_attempt_question`
- `finish_student_activity_attempt`
- `record_student_activity_session` — compatibilité de déploiement uniquement
- `replace_teacher_vocabulary_words`
- `reset_teacher_vocabulary_words`
- `verify_student_code`

## Quiz et ressources personnelles

Le document complet d’un Quiz est stocké en `jsonb` dans `quizzes.document`. Les liaisons aux ressources utilisent `quiz_resources`.

Les ressources personnelles utilisent `resource_folders`, `resources` et le bucket privé `teacher-resources`. Le rôle `resource_folders.metadata.system_role = "recordings"` retrouve le dossier automatique des enregistrements même s’il est renommé ou déplacé. Le Quiz conserve l’UUID de la ressource, jamais son chemin Storage.

## Images pédagogiques système

Le bucket public `images` stocke les fichiers sous `bank/<slug>/<empreinte>.<extension>`. Chaque `image_assets` est lié par `resource_id` à une ressource système affichée sous `Ressources système > Images`.

L’importateur super-admin :

- importe plusieurs fichiers ou un dossier ;
- accepte un préfixe technique facultatif ;
- crée le dossier de destination demandé ;
- peut recréer les sous-dossiers ;
- conserve le nom visible du fichier sans capitalisation automatique ;
- détecte les doublons et remplacements par empreinte ;
- conserve le classement d’une ressource remplacée ;
- permet la suppression contrôlée depuis l’explorateur.

Déplacer ou renommer une ressource modifie seulement ses métadonnées. Le slug et le chemin Storage restent stables. Le dossier `À classer` est masqué lorsqu’il est vide.

Aucune ressource pédagogique n’est chargée depuis un manifeste local. `shared/tool-assets/` est hors du modèle Ressources.

## Arborescence pédagogique

Le modèle actif est :

```text
discipline > domain > theme > learning_objective > grade_level
```

`catalog_activities.pedagogical_node_id` doit viser un dossier `grade_level`. `seed_pedagogical_tree_cp_cm2.sql` est un script contrôlé séparé qui reconstruit cette arborescence et sauvegarde l’ancien état.

## Historique des activités

`student_activity_sessions` représente une tentative et `student_activity_session_questions` ses questions. Les écritures passent par les RPC dédiées ; les détails sont produits pour les passations individuelles identifiées. Voir `historique-activites.md`.

## Aventure

Les tables `adventure_class_cursors`, `student_adventure_tier_progress`, `student_adventure_days` et `student_adventure_passages` portent les fondations du moteur. Le client anonyme n’écrit pas directement ces tables : les RPC `security definer` vérifient les codes et l’identité de l’élève.

## Modèles supprimés

`question_banks`, `question_bank_items` et `question_bank_folders` ont été supprimés physiquement avec `10_remove_question_banks.sql`. Aucune rétrocompatibilité n’est prévue.
