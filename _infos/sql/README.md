# SQL — mode d’emploi

Dernière mise à jour : 2026-09-03.

## Règle absolue

Les fichiers numérotés sont l’historique séquentiel du projet. **Ne jamais sélectionner tout le dossier et l’exécuter sur la base actuelle.** Avant toute requête : sauvegarder la base, vérifier ce qui a déjà été appliqué et exécuter uniquement le script explicitement requis par le patch en cours.

## Lecture rapide

| Fichiers | Rôle | Statut |
|---|---|---|
| `01` à `06` | socle initial, super-admin et anciennes banques | historique ; les parties Banques sont obsolètes |
| `07` à `09` | Quiz, ressources et protection contre les suppressions | historique appliqué |
| `10` | suppression définitive des banques | exécuté le 24/07/2026 |
| `11` | dossier logique des enregistrements | migration active historique |
| `12` | tentatives et historique par question | migration active historique |
| `13` et `14` | premières versions de l’arborescence pédagogique | remplacées par le seed contrôlé |
| `15` et `16` | anciens registres Aventure | historique, non utilisés par l’écran actuel |
| `17` | paliers d’activités | migration active historique |
| `18` | mini-clavier des codes élèves | migration active historique |
| `19` et `20` | menus et fondations du moteur Aventure | migrations actives historiques |
| `21` | import de `phonology_words` | migration active historique |
| `22` à `24` | images système, explorateur, options d’import et suppression | migrations actives historiques |
| `25` | préfixe d’affichage optionnel pour `phonology_words` | migration active historique |
| `26` | lecture publique ciblée d’un dossier d’images système | migration active historique |
| `27` | syllabation de `phonology_words` et import synchronisé | migration active historique |
| `28` | remplacement atomique complet de `phonology_words` | migration à appliquer avant d’utiliser « Remplacer complètement la base » |
| `29` | ancienne familiarité lexicale de `phonology_words` | historique ; colonne conservée provisoirement mais non utilisée |
| `30` | projection élève d’Exploration : libellé court et nœuds transparents | migration active |
| `31` | runtime MVP Aventure pour les 6 passages obligatoires de type Activité | migration active |
| `32` | niveau lexical CP/CE1/CE2/CM/X + score de régularité G-P de `phonology_words` | **migration à appliquer avant d’importer la nouvelle banque** |
| `33` | première suppression contrôlée d’une tentative dans l’historique élève | historique ; comportement remplacé par `37` |
| `34` | progression individuelle des Missions : reprise, compteur et fin persistante | **migration à appliquer avant d’utiliser la reprise des Missions** |
| `35` | limites d’exécution externes : Questions / Temps / contenu intrinsèque | **migration à appliquer avant les réglages de longueur Aventure/Missions** |
| `36` | difficulté par étape de Mission : Adaptative ou N1 à N5, avec mémoire du niveau adaptatif | **migration à appliquer avant d’utiliser la difficulté adaptative des Missions** |
| `37` | séparation trace/progression et réinitialisation fine des tentatives Exploration/Missions | **migration à appliquer avant les nouvelles actions de l’historique** |
| `38` | audios système de l’interface élève | **migration à appliquer avant l’enregistrement des consignes audio** |
| `39` | cycle de vie des Missions et sessions de réactivation | **migration à appliquer avant la désactivation/réactivation automatique des Missions** |
| `40` | niveau initial des activités adaptatives à N1, sans modifier les progressions existantes | **migration à appliquer avec le patch de rentrée du 03/09/2026** |

## Script spécial d’arborescence

`seed_pedagogical_tree_cp_cm2.sql` n’est pas une migration ordinaire. Il reconstruit l’arborescence :

```text
discipline > domain > theme > learning_objective > grade_level
```

Il lit les référentiels Français et Mathématiques, sauvegarde les anciens nœuds et rattachements, reclasse les activités historiques connues et place les inconnues dans une branche inactive. Il doit être exécuté seul, après sauvegarde, uniquement lorsqu’un patch le demande explicitement.

## Images système

- `22_system_image_assets_import.sql` crée le bucket public `images` et l’import super-admin.
- `23_system_image_resources_explorer.sql` relie `image_assets` à des ressources système classables.
- `24_system_image_import_options_and_delete.sql` ajoute le préfixe technique, le dossier de destination, le nom visible non capitalisé et la suppression contrôlée.
- `26_public_system_image_folder_runtime.sql` expose en lecture publique les images actuellement classées dans un dossier système précis (et ses sous-dossiers), sans exposer les ressources personnelles.

La recréation des sous-dossiers est une évolution applicative et ne nécessite pas de SQL supplémentaire.

## Scripts obsolètes sensibles

`01_first_request.sql`, `05_superadmin_resources_banks_delete.sql` et `06_question_bank_instruction.sql` contiennent des éléments liés aux banques supprimées. Ils sont conservés uniquement comme historique.

`10_remove_question_banks.sql` documente leur suppression ; il ne doit pas être rejoué sans audit spécifique.

- `30_unicode_image_word_mapping.sql` associe explicitement chaque image système à un mot Unicode (`word_slug`) et permet à l’imagier de distinguer correctement `pâte` / `pâté`, `école`, `hameçon`, etc.
