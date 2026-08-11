# SQL — mode d’emploi

Dernière mise à jour : 2026-08-08.

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
| `29` | familiarité lexicale 0–100 de `phonology_words` et import associé | migration active |

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
