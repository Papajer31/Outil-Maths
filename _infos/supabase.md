# Supabase — état cible propre du Site d’outils

Version de cadrage : **refonte sans rétrocompatibilité**.

Ce document décrit la base Supabase cible **comme si le projet repartait de zéro**. Il ne cherche pas à préserver les anciennes activités, ni l’ancien modèle `activity_configs + activity_folders`.

## 1. Principe général

Le nouveau modèle sépare clairement les responsabilités.

| Zone produit | Rôle |
|---|---|
| **Catalogue** | Activités proposées par le site, fixes pour l’enseignant normal. Le prof peut tester et masquer/afficher pour l’Exploration. |
| **Exploration** | Côté élève : accès libre à l’arborescence globale du site, filtrée par les activités visibles pour la classe. |
| **Aventure** | Côté élève : progression adaptative personnelle définie par le site. Visible uniquement en mode seul. Anciennement appelée “Expédition” dans le cadrage. |
| **Missions** | Côté prof : espace où le prof assemble des activités du Catalogue, règle la passation et attribue à la classe ou à des élèves. Côté élève : une Mission apparait seulement si elle est attribuée. |
| **Banques** | Ressources personnelles ou système utilisées par certains outils : questions, vocabulaire, listes de verbes, graphèmes, images, etc. |

Le flux élève cible est :

```txt
Code classe
→ seul / groupe
→ prénom(s)
→ code élève uniquement en mode seul
→ écran principal
   - Exploration
   - Aventure uniquement en mode seul
   - Mission uniquement si disponible
```

## 2. Ce qui disparait volontairement

Les éléments suivants appartiennent à l’ancien modèle et ne doivent pas être conservés dans le socle cible :

| Ancien élément | Décision |
|---|---|
| `activity_configs` | Supprimé du modèle cible. Une activité n’est plus une configuration personnelle séquencée. |
| `activity_folders` | Supprimé du Catalogue. La logique d’arborescence libre est transférée vers `mission_folders`. |
| `config_json.sequence` | Supprimé comme modèle métier d’activité. Les suites vivent dans les Missions. |
| `get_space_activities` | Remplacé par la logique Catalogue/visibilité et Missions. |
| `get_activity_config` | Remplacé par le chargement des activités du Catalogue côté code, puis par le futur super-admin. |
| `get_space_activity_folders` | Remplacé par l’arborescence fixe du Catalogue côté code et les Missions attribuées. |
| Bloc “Mode de passation général” | Supprimé du Catalogue. La passation est définie par la porte d’entrée ou par la Mission. |
| Réglages communs dans les activités du Catalogue | Supprimés pour l’enseignant normal. Exploration a des réglages système fixes ; Aventure adapte ; Mission règle explicitement. |

## 3. Tables principales du socle

## 3.1 `teacher_spaces`

Espace propriétaire d’un enseignant authentifié.

Colonnes principales :

- `id`
- `owner_user_id`
- `access_code`
- `created_at`
- `updated_at`
- `last_opened_at`

Contraintes :

- un espace par utilisateur ;
- `access_code` unique ;
- format recommandé : `^[A-Z]{3,12}$`.

## 3.2 `teacher_classes`

Classes internes d’un espace enseignant.

Colonnes principales :

- `id`
- `teacher_space_id`
- `name`
- `display_order`

La table reste multi-classes, même si le flux courant utilise souvent une classe principale.

## 3.3 `students`

Élèves rattachés à une classe.

Colonnes principales :

- `id`
- `teacher_class_id`
- `first_name`
- `grade_level`
- `student_code`
- `display_order`
- `is_active`

`student_code` est le **code élève** interne à la classe :

- 3 caractères ;
- lisible et modifiable par l’enseignant ;
- utilisé uniquement en mode seul ;
- destiné à éviter qu’un élève modifie l’Aventure personnelle d’un camarade ;
- ce n’est pas un mot de passe confidentiel.

## 4. Catalogue et Exploration

## 4.1 Catalogue fixe

Le Catalogue est d’abord défini côté code, pas en base.

Arborescence cible :

```txt
Français
  Lecture
  Écriture
  Oral
  Vocabulaire
  Grammaire
  Orthographe

Mathématiques
  Nombres
  Calculs
  Résolution de problèmes
  Grandeurs et mesures
  Espace et géométrie
  Organisation et gestion de données

EMC
Questionner le monde
Anglais
Autres
```

Chaque activité du Catalogue aura un identifiant stable côté code, par exemple :

```txt
maths.calculs.operations.additions-sans-retenue
francais.lecture.encodage.graphèmes-simples
```

## 4.2 `catalog_activity_visibility`

Table d’overrides par espace enseignant.

Rôle :

- stocker ce que l’enseignant masque ou réaffiche dans l’Exploration ;
- ne pas stocker le Catalogue complet ;
- absence de ligne = comportement par défaut, donc activité visible.

Colonnes principales :

- `teacher_space_id`
- `catalog_activity_id`
- `is_visible`

## 4.3 Réglages d’Exploration

Exploration utilise des réglages système imposés :

```txt
Nombre de questions : 5
Temps par question : infini
Temps d’affichage réponse : infini
Temps entre questions : 0
Durée maximale : infini
Consigne : consigne par défaut de l’outil
```

Ces réglages ne sont pas modifiables par l’enseignant normal dans le Catalogue.

## 5. Missions

L’onglet **Missions** remplace l’ancien rôle de l’onglet Activités composé.

Une Mission est :

```txt
une suite ordonnée d’activités du Catalogue
+ des réglages de passation
+ une attribution à la classe ou à des élèves
+ un rangement libre dans une arborescence personnelle
```

## 5.1 `mission_folders`

Arborescence libre personnelle de l’enseignant pour ranger ses Missions.

Elle reprend l’esprit de l’ancien `activity_folders`, mais sans confusion avec le Catalogue.

Attention RLS :

- ne pas valider parent/enfant dans une policy RLS qui relit `mission_folders` ;
- utiliser une policy simple + trigger `SECURITY DEFINER` pour éviter les récursions infinies.

## 5.2 `missions`

Objet principal créé par l’enseignant.

Colonnes principales :

- `id`
- `teacher_space_id`
- `folder_id`
- `title`
- `title_normalized`
- `status` : `draft`, `active`, `archived`
- `answer_mode` : `student_input`, `manual_validation`
- `intent_mode` : `practice`, `evaluation`
- `question_count`
- `question_time_seconds` : `null` = infini
- `answer_display_seconds` : `null` = infini
- `transition_seconds`
- `mission_time_seconds` : `null` = infini
- `instructions`

## 5.3 `mission_steps`

Suite ordonnée d’activités du Catalogue.

Colonnes principales :

- `mission_id`
- `catalog_activity_id`
- `position`
- `difficulty_mode`
- `difficulty_level`
- `step_options_json`

Pour le MVP, `difficulty_level = 3` et `difficulty_mode = 'normal'` suffisent. Les raffinements peuvent attendre.

## 5.4 `mission_assignments`

Attribution d’une Mission.

Cibles MVP :

- toute une classe ;
- un ou plusieurs élèves sélectionnés.

Pas encore de groupes enregistrés dans ce socle.

Côté élève :

```txt
Mode seul
→ missions attribuées à l’élève + missions de sa classe

Mode groupe
→ missions attribuées à la classe
```

## 6. Aventure et adaptation

L’Aventure est la progression adaptative personnelle définie par le site.

Elle est :

- visible uniquement en mode seul ;
- protégée par le code élève ;
- définie par le site / futur super-admin ;
- transparente pour l’élève.

## 6.1 Niveaux adaptatifs

Chaque activité du Catalogue aura à terme 5 niveaux :

| Niveau | Libellé interne |
|---:|---|
| 1 | Grande difficulté |
| 2 | Petite difficulté |
| 3 | Normal |
| 4 | Réussite |
| 5 | Grande réussite |

Niveau de départ : **3 — Normal**.

Règle MVP :

```txt
réussite → +1 niveau
erreur → -1 niveau
bornes → 1 à 5
```

Ces niveaux ne sont pas affichés à l’élève.

## 6.2 `student_catalog_activity_levels`

Stocke le niveau actuel d’un élève pour une activité du Catalogue.

Clé logique :

```txt
student_id + catalog_activity_id
```

## 6.3 `student_catalog_activity_attempts`

Journal léger des essais, utile pour l’Aventure et les futurs suivis.

## 7. Banques et ressources

## 7.1 `question_banks`, `question_bank_items`, `question_bank_folders`

Modèle conservé et nettoyé.

Rôle :

- banques système ;
- banques personnelles enseignant ;
- items typés : `text_answer`, `qcm`, `selection`, etc. ;
- rangement libre des banques personnelles.

Important : les banques système ne sont pas rangées dans les dossiers personnels.

## 7.2 `vocabulary_default_words`, `teacher_vocabulary_words`

Conservé pour les outils qui utilisent une banque de mots générale, notamment Ordre alphabétique.

À terme, ce modèle pourra être absorbé par les banques système/personnelles, mais il reste utile pour ne pas exploser le patch.

## 7.3 `image_assets`

Ressources images globales.

Modèle retenu :

- `slug` comme clé stable ;
- `storage_path` unique ;
- `tags`, `notes`, `is_active`.

Bucket Storage actuel : `images`.

## 7.4 `phonology_words`

Mots de l’outil Encodage :

- `slug`
- `word`
- `units`
- `is_active`

`units` contient les graphèmes normalisés et les lettres muettes.

## 7.5 `teacher_phonology_presets`

Presets personnels de graphèmes pour Encodage.

À conserver tant que l’outil en dépend.

## 7.6 `teacher_conjugation_lists`

Listes personnelles de verbes pour Conjugaison.

## 8. RLS

Règles générales :

- les données enseignant sont protégées par `teacher_spaces.owner_user_id = auth.uid()` ;
- les ressources système actives peuvent être lues publiquement quand nécessaire ;
- les séances élèves passent par des RPC `SECURITY DEFINER` contrôlées par `access_code` ;
- les fonctions puissantes d’écriture publique sont interdites ;
- la clé `service_role` ne doit jamais être utilisée côté navigateur.

## 9. RPC publiques utiles côté élève

| Fonction | Rôle |
|---|---|
| `access_code_exists(access_code)` | Vérifie l’existence d’un code classe. |
| `get_space_classes(access_code)` | Liste les classes de l’espace. |
| `get_space_students(access_code)` | Liste les élèves actifs, sans exposer les codes élèves. |
| `verify_student_code(access_code, student_id, student_code)` | Valide le code élève en mode seul. |
| `get_catalog_visibility_for_space(access_code)` | Récupère les overrides de visibilité Exploration. |
| `get_space_missions(access_code, student_ids, is_group)` | Liste les Missions actives disponibles. |
| `get_space_mission_steps(access_code, mission_id)` | Récupère les étapes d’une Mission. |
| `get_question_bank_items_for_space(access_code, bank_id)` | Lit les items actifs d’une banque système ou personnelle de l’espace. |
| `get_space_vocabulary_words(access_code)` | Lit la banque de vocabulaire enseignant. |
| `get_conjugation_personal_list(access_code, list_id)` | Lit une liste personnelle de verbes autorisée par l’espace. |
| `record_catalog_activity_result(...)` | Met à jour le niveau adaptatif d’un élève après vérification du code élève. |

## 10. Ordre d’exécution SQL proposé

Pour une base neuve ou après reset destructif :

```txt
00_reset_destructif.sql            optionnel, destructif
01_core.sql                        espaces, classes, élèves, code élève
02_catalogue_exploration.sql       visibilité Catalogue → Exploration
03_missions.sql                    missions, étapes, attributions
04_banques_questions.sql           banques de questions
05_ressources_systeme.sql          images, phonologie, vocabulaire
06_ressources_personnelles.sql     presets graphèmes, listes verbes
07_adaptation_aventure.sql         niveaux adaptatifs et journal léger
```

Les seeds volumineux sont séparés dans `sql/seeds/`.

Les scripts de diagnostic sont séparés dans `sql/checks/`.

## 11. Patch JS à prévoir après SQL

Le SQL cible ne suffit pas : le front actuel attend encore des objets de l’ancien modèle.

À modifier côté code :

1. **Élève**
   - ajouter le code élève en mode seul ;
   - afficher `Exploration`, `Aventure`, `Mission` ;
   - masquer `Aventure` en mode groupe ;
   - charger Exploration depuis le Catalogue fixe + `catalog_activity_visibility` ;
   - charger Mission via `get_space_missions`.

2. **Prof**
   - renommer `Activités` → `Catalogue` ;
   - retirer l’éditeur d’activités pour l’enseignant normal ;
   - garder `Tester` et `Masquer/Afficher` ;
   - créer l’onglet `Missions` à partir de l’ancienne UX d’Activités ;
   - remplacer `activity_folders` par `mission_folders` ;
   - remplacer `activity_configs` par `missions + mission_steps`.

3. **Runtime**
   - Exploration lance une activité unique avec réglages système ;
   - Mission transforme ses étapes en séquence runtime ;
   - Aventure restera un chantier séparé.

## 12. Décision sur la rétrocompatibilité

Aucune rétrocompatibilité.

Les anciennes activités peuvent être supprimées. L’objectif est de vérifier que le nouveau modèle rend la recréation simple.
