# Supabase — état documentaire actuel

Dernière mise à jour : 2026-08-04.

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
- fondations de progression Aventure ;
- super-admin ;
- Quiz Supabase ;
- ressources personnelles Supabase et Storage ;
- ressources techniques utilisées par certains outils.

## Tables utilisées par le code JavaScript

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
- `open_student_adventure_day`
- `get_student_adventure_progress`
- `is_super_admin`
- `start_student_activity_attempt`
- `record_student_activity_attempt_question`
- `finish_student_activity_attempt`
- `record_student_activity_session` (compatibilité de déploiement uniquement)
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

Les tables `image_assets`, `phonology_words` et `vocabulary_default_words` restent actives pour les outils qui les consomment. Le tableau de bord super-admin possède un importateur pour `phonology_words` et un importateur en masse pour `image_assets`. Le bucket public `images` stocke les illustrations pédagogiques sous `bank/<slug>/<empreinte>.<extension>`.

Depuis la migration 23, chaque `image_assets` est lié par `resource_id` à une ligne système de `resources`. La racine technique `resource_folders.metadata.system_role = "system_images_root"` est masquée dans l’interface ; ses enfants apparaissent directement sous `Ressources système > Images`. Les images existantes sont initialement placées dans le dossier logique `À classer`. Le déplacement, le renommage visible et les tags modifient uniquement les métadonnées de `resources` : le slug et le chemin Storage restent stables.


## Arborescence pédagogique d’Exploration

Les migrations historiques `13_catalog_pedagogical_tree.sql` et `14_pedagogical_tree_naming.sql` ont introduit puis renommé l’ancienne arborescence.

Le script hors numérotation `seed_pedagogical_tree_cp_cm2.sql` la remplace par le modèle définitif :

```text
discipline > domain > theme > learning_objective > grade_level
```

Les colonnes historiques `grade_scope_mode` et `grade_levels` sont supprimées. Un nœud `grade_level` porte directement le nom `CP`, `CE1`, `CE2`, `CM1` ou `CM2`. `catalog_activities.pedagogical_node_id` doit toujours viser un tel dossier ; un trigger Supabase protège cette règle.

Le script sauvegarde les anciens nœuds et liens d’activités, reclasse les 26 activités historiques connues et place les autres dans une branche inactive « À reclasser (migration) ».

## Historique détaillé des activités

La migration `12_activity_attempt_history.sql` transforme `student_activity_sessions` en tentative complète et ajoute `student_activity_session_questions`. Le runtime écrit le niveau après chaque réponse, y compris après la dernière question, puis finalise la tentative avec un statut explicite. Les détails sont actuellement produits uniquement pour un élève identifié en passation individuelle. Voir `historique-activites.md`.

## Fondations Aventure

La migration `20_adventure_engine_foundations.sql` ajoute le curseur Menu/Jour par classe et par niveau, les jauges multi-paliers et le gel des dix passages d’une journée élève. Les tables de progression ne sont jamais écrites directement par le client anonyme : les élèves passent par des RPC `security definer` qui vérifient le code de classe, l’identifiant de l’élève et son code individuel.
