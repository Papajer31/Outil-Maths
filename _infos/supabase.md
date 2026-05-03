# Supabase — état actuel du projet

## 1) Rôle global

Supabase sert de backend principal pour :
- l’authentification enseignant ;
- le stockage des espaces enseignant ;
- la gestion des classes internes et des élèves ;
- le stockage des activités, de leur configuration et de leur organisation en dossiers ;
- la gestion des banques de mots de vocabulaire ;
- la gestion des presets de phonologie enseignant ;
- la gestion des banques de contenus / questions ;
- la diffusion publique de certaines données aux élèves via RPC ou tables publiques en lecture ;
- la résolution des images et des mots de l’outil Encodage.

Ce document résume **l’état structurel déductible du dépôt courant et des attentes front**.

Important :
- le zip courant ne contient pas directement les migrations SQL ;
- les fichiers joints actuels ne contiennent pas non plus de fichier SQL complet ;
- cette doc décrit donc ce que le front attend réellement aujourd’hui, pas une migration exhaustive prête à appliquer ;
- dans l’organisation documentaire du projet, d’éventuels SQL de référence peuvent être conservés sous `_infos/`.

---

## 2) Conventions générales

- schéma utilisé : `public` ;
- tables privées enseignant protégées par RLS ;
- accès publics élève via RPC contrôlées ;
- bucket Storage utilisé pour Encodage : `images` ;
- convention d’assets image :
  - `slug` = identifiant technique stable ;
  - `storage_path` pointe vers le fichier public dans le bucket.

---

## 3) Tables principales attendues par le front

## 3.1. `teacher_spaces`

### Rôle

Espace enseignant principal.
Un enseignant authentifié possède un unique espace, identifié publiquement par un `access_code`.

### Colonnes attendues par le front

- `id` ;
- `owner_user_id` ;
- `access_code` ;
- `created_at` ;
- `updated_at` ;
- `last_opened_at`.

### Usage visible dans le code

- lecture de l’espace courant ;
- création de l’espace si absent ;
- mise à jour du code d’accès ;
- mise à jour de `last_opened_at`.

---

## 3.2. `teacher_classes`

### Rôle

Conteneur interne de classes lié à un espace enseignant.

### Colonnes attendues par le front

- `id` ;
- `teacher_space_id` ;
- `name` ;
- `display_order` ;
- `created_at` ;
- `updated_at`.

### Usage visible dans le code

- lecture des classes d’un espace ;
- création ;
- renommage ;
- réordonnancement ;
- suppression.

Remarque :
- le produit fonctionne très souvent avec une logique « Ma classe » ;
- la structure de table reste néanmoins multi-classes.

---

## 3.3. `students`

### Rôle

Élèves rattachés à une classe enseignant.

### Colonnes attendues par le front

- `id` ;
- `teacher_class_id` ;
- `first_name` ;
- `grade_level` ;
- `display_order` ;
- `is_active` ;
- `created_at` ;
- `updated_at`.

### Usage visible dans le code

- lecture des élèves par classe ;
- lecture agrégée pour l’espace enseignant ;
- création ;
- modification ;
- suppression logique ou physique selon implémentation SQL ;
- réordonnancement.

---

## 3.4. `activity_configs`

### Rôle

Stockage principal des activités et de leur configuration JSON.

### Colonnes attendues par le front

- `id` ;
- `teacher_space_id` ;
- `module_key` ;
- `config_name` ;
- `config_name_normalized` ;
- `config_json` ;
- `created_at` ;
- `updated_at`.

### Point métier important

Dans l’état actuel du projet :
- les activités sont stockées comme des configurations JSON séquencées ;
- `config_json.sequence` contient une suite ordonnée d’outils ;
- les métadonnées de dashboard et de mode d’activité sont aussi portées dans `config_json`.

### Point de transition important

Le champ `module_key` existe toujours en base.
Dans le flux actif actuel :
- la clé logique réellement utilisée côté app est essentiellement `tools`.

Autrement dit :
- le stockage reste compatible avec l’ancienne notion de module ;
- le produit actif s’oriente maintenant vers une racine unique d’outils.

---

## 3.5. `activity_folders`

### Rôle

Organisation des activités en dossiers / sous-dossiers dans le dashboard enseignant et dans la navigation élève.

### Colonnes attendues par le front

- `id` ;
- `teacher_space_id` ;
- `parent_id` ;
- `name` ;
- `display_order` ;
- `created_at` ;
- `updated_at`.

### Usage visible dans le code

- lecture privée enseignant ;
- lecture publique par RPC ;
- création ;
- renommage ;
- déplacement logique par `parent_id` ;
- suppression.

---

## 3.6. `teacher_vocabulary_words`

### Rôle

Banque de mots de vocabulaire propre à chaque espace enseignant.

### Colonnes attendues par le front

- `id` ;
- `teacher_space_id` ;
- `word` ;
- `word_normalized` ;
- `dictionary_page` ;
- `created_at` ;
- `updated_at`.

### Usage visible dans le code

- lecture de la banque enseignant ;
- remplacement complet via RPC ;
- reset depuis la banque par défaut via RPC.

---

## 3.7. `vocabulary_default_words`

### Rôle

Liste publique de mots servant de base à la banque de vocabulaire de chaque espace enseignant.

### Colonnes attendues

- `id` ;
- `word` ;
- `word_normalized` ;
- `dictionary_page` ;
- `created_at` ;
- `updated_at`.

### Usage visible côté produit

- source de clonage initial ou de reset pour `teacher_vocabulary_words`.

---

## 3.8. `teacher_phonology_presets`

### Rôle

Presets enseignant liés à la phonologie, actuellement utilisés pour Encodage.

### Colonnes attendues par le front

- `id` ;
- `teacher_space_id` ;
- `tool_key` ;
- `name` ;
- `graph_order` ;
- `created_at` ;
- `updated_at`.

### Usage visible dans le code

- lecture ;
- upsert ;
- suppression.

Remarque :
- rien d’équivalent n’est encore branché pour les nouveaux outils mathématiques `operations`, `nombre-cible`, `monnaie` ou `operations-trous` ;
- leurs réglages vivent dans `activity_configs.config_json`.

---

## 3.9. `image_assets`

### Rôle

Catalogue public minimal d’assets image, utilisé notamment pour Encodage.

### Colonnes attendues par le front

- `slug` ;
- `storage_path` ;
- `is_active`.

Le front exploite surtout ces champs.

### Usage visible dans le code

- lecture publique ;
- filtrage éventuel sur `is_active` ;
- résolution d’URL publique via Storage.

---

## 3.10. `phonology_words`

### Rôle

Table publique de mots pour Encodage.

### Colonnes attendues par le front

- `slug` ;
- `word` ;
- `units` ;
- `is_active`.

### Usage visible dans le code

- lecture publique ;
- filtrage éventuel sur `is_active` ;
- consommation directe de `units` côté front.

---

## 3.11. `question_banks`

### Rôle

Table de banques de contenus, conçue pour rester extensible.

Types réellement exploités par le front :
- `text_answer` → questions à réponse textuelle courte ;
- `qcm` → questions à choix unique ;
- `selection` → sélection de mots dans un énoncé.

La table reste volontairement générique afin de pouvoir accueillir plus tard d’autres mécaniques.

### Colonnes attendues / utilisées

- `id` ;
- `teacher_space_id` ;
- `source_bank_id` ;
- `bank_type` ;
- `title` ;
- `title_normalized` ;
- `description` ;
- `subject` ;
- `grade_level` ;
- `tags` ;
- `is_system` ;
- `share_code` ;
- `created_at` ;
- `updated_at`.

### Statuts prévus

- banque personnelle : `is_system = false`, rattachée à un `teacher_space_id` ;
- banque système : `is_system = true`, sans `teacher_space_id`, lisible par tous les enseignants connectés ;
- banque copiée/importée : banque personnelle pouvant référencer une banque source via `source_bank_id`.

Le partage par code est préparé par la colonne `share_code`, mais l’UX complète d’import par code peut être ajoutée plus tard.

---

## 3.12. `question_bank_items`

### Rôle

Items ordonnés d’une banque.
Chaque item possède un `item_type` et un `payload_json` afin que la structure reste extensible.

### Colonnes attendues / utilisées

- `id` ;
- `bank_id` ;
- `item_type` ;
- `prompt` ;
- `payload_json` ;
- `position` ;
- `is_active` ;
- `created_at` ;
- `updated_at`.

### Payload `text_answer`

Le front exploite notamment :

```json
{
  "mainAnswer": "Charlemagne",
  "acceptedAnswers": ["Charles le Grand", "Charles Ier"],
  "explanation": ""
}
```

### Payload `qcm`

Le front exploite notamment :

```json
{
  "correctAnswer": "Charlemagne",
  "distractors": ["Clovis", "Louis XIV", "Charles Martel"],
  "explanation": ""
}
```

Dans l’import rapide, les distracteurs QCM sont saisis dans une seule colonne `Distracteurs`, séparés par `;`.
L’éditeur les affiche ensuite en colonnes `Distracteur 1`, `Distracteur 2`, etc., avec uniquement les colonnes utiles plus une colonne vide d’avance.
Le front transforme le tout en tableau `distractors` avant sauvegarde.

### Payload `selection`

Le front exploite notamment :

```json
{
  "expectedTokenIndexes": [1, 2, 8],
  "expectedSelectionText": "gentil; petit; jaune",
  "explanation": "Les adjectifs précisent les noms."
}
```

`expectedTokenIndexes` stocke les indices des tokens-mots dans l’énoncé, afin de gérer correctement les mots répétés.
La consigne d’un exercice de sélection appartient à l’activité via le widget commun de consigne personnalisable ; elle n’est pas stockée item par item dans la banque.

---

## 4) RPC publiques attendues par le front élève

Le front élève appelle actuellement les RPC suivantes :
- `access_code_exists` ;
- `get_space_activities` ;
- `get_activity_config` ;
- `get_space_activity_folders` ;
- `get_space_classes` ;
- `get_space_students` ;
- `get_space_vocabulary_words` ;
- `get_question_bank_items_for_space`.

### Détail attendu pour `get_question_bank_items_for_space`

Le front attend :
- paramètres `p_access_code text`, `p_bank_id uuid` ;
- retour des items actifs seulement ;
- accès autorisé si la banque est système ou si elle appartient à l’espace correspondant au code d’accès ;
- exécution possible pour l’accès élève public.

---

## 5) Fonctions privées / RPC utilisées côté enseignant

Le front enseignant appelle ou attend notamment :
- `replace_teacher_vocabulary_words` ;
- `reset_teacher_vocabulary_words` ;
- `replace_question_bank_items`.

### Détail attendu pour `replace_question_bank_items`

Le front attend :
- paramètres `p_bank_id uuid`, `p_items jsonb` ;
- remplacement atomique ou équivalent fiable : suppression des items de la banque puis insertion de la nouvelle liste ;
- maintien des contrôles RLS si la fonction est exécutée avec les droits de l’utilisateur courant ;
- exécution réservée aux utilisateurs authentifiés.

Le front possède aussi un fallback : si la RPC est absente, il tente suppression puis insertion directe côté client. Une RPC opérationnelle rend normalement ce fallback inutile.

---

## 6) Lecture fonctionnelle de `activity_configs.config_json`

Une activité active contient notamment :
- `sequence` → séquence ordonnée d’outils ;
- `globals` → réglages globaux d’activité ;
- `activity_mode` → mode de passation ;
- `dashboard` → métadonnées d’affichage / visibilité / dossier / ordre.

Conséquence produit :
- la table `activity_configs` ne stocke plus seulement une configuration d’ancien module ;
- elle stocke désormais un **conteneur d’activité** capable d’héberger une séquence d’outils.

Les outils actifs, y compris `nombre-cible`, `monnaie` et `operations-trous`, sont stockés comme items de `sequence` avec leurs réglages propres dans `draft.settings`.

---

## 7) RLS / exposition attendue

### Tables privées enseignant

Attendu en accès propriétaire authentifié :
- `teacher_spaces` ;
- `teacher_classes` ;
- `students` ;
- `activity_configs` ;
- `activity_folders` ;
- `teacher_vocabulary_words` ;
- `teacher_phonology_presets` ;
- `question_banks` personnelles ;
- `question_bank_items` des banques personnelles.

### Tables publiques en lecture

Attendu en lecture publique ou semi-publique selon SQL :
- `image_assets` ;
- `phonology_words` ;
- probablement `vocabulary_default_words`.

### Banques système

Pour `question_banks` :
- les banques système sont lisibles par les comptes authentifiés ;
- elles ne sont pas modifiables par le front enseignant ;
- les items héritent des droits de leur banque parente.

### Accès élève aux banques

L’élève ne lit pas directement `question_banks` / `question_bank_items`.
Il passe par `get_question_bank_items_for_space`, qui contrôle :
- le code d’accès ;
- la banque demandée ;
- le statut système ou propriétaire de la banque ;
- `is_active = true` sur les items.

---

## 8) Mini-langage de mise en forme

Les champs d’énoncé et d’explication peuvent utiliser un mini-langage stocké en texte brut :

- `§` → retour à la ligne ;
- `*mot*` → gras ;
- `_mot_` → italique ;
- `[mot]` → mise en évidence colorée.

Le rendu est assuré côté front par :
- `shared/simple-markup.js` ;
- `shared/simple-markup.css`.

Le HTML n’est pas stocké directement en base.

---

## 9) Ce que Supabase ne porte pas encore pour le nouveau coeur tools-first

Dans l’état visible du dépôt :
- il n’y a pas de table dédiée aux presets du nouvel outil `operations` ;
- il n’y a pas de table dédiée à `nombre-cible` ;
- il n’y a pas de table dédiée à `monnaie` ;
- il n’y a pas de table dédiée à `operations-trous` ;
- il n’y a pas encore de table spécifique au coeur `tools/` lui-même ;
- les outils vivent principalement dans `activity_configs.config_json` ;
- les contenus réutilisables génériques passent maintenant par `question_banks` et `question_bank_items` ;
- les assets de l’outil `monnaie` sont locaux au dépôt, pas dans Supabase Storage dans l’état courant.

Autrement dit :
- l’architecture front est tools-first ;
- le stockage des activités reste généraliste ;
- seules certaines familles de contenus disposent de tables dédiées.

---

## 10) Limites de cette doc

Ce fichier ne remplace pas :
- les migrations SQL réelles ;
- les policies exactes ligne par ligne ;
- les contraintes exhaustives ;
- les données seed ;
- les éventuels réglages manuels Supabase non visibles dans le dépôt.

Il sert de **contexte backend pratique aligné avec le front actuellement présent dans le zip**.
