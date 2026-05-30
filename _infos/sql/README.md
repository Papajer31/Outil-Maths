# Pack SQL complet — refonte Catalogue / Missions / Aventure

Ce dossier contient les requêtes nettoyées pour repartir sur une base Supabase propre.

## Ordre recommandé pour une base neuve

1. `sql/from_scratch/00_reset_destructif.sql` — optionnel, uniquement après backup.
2. `sql/from_scratch/01_core.sql`
3. `sql/from_scratch/02_catalogue_exploration.sql`
4. `sql/from_scratch/03_missions.sql`
5. `sql/from_scratch/04_banques_questions.sql`
6. `sql/from_scratch/05_ressources_systeme.sql`
7. `sql/from_scratch/06_ressources_personnelles.sql`
8. `sql/from_scratch/07_adaptation_aventure.sql`
9. Seeds :
   - `sql/seeds/01_seed_image_assets.sql`
   - `sql/seeds/02_seed_vocabulary_default_words.sql`
   - `sql/seeds/03_seed_phonology_words.sql`
10. Checks utiles :
   - `sql/checks/encodage_graphs_integrity.sql`
   - `sql/checks/encodage_legacy_graphs.sql`

## Seeds intégrées

- Vocabulaire : 629 entrées fusionnées, seed initiale + complément `sage → zoologie`.
- Encodage / phonologie : 185 mots, avec graphèmes directement normalisés.
- Images : seed complète issue de la liste `image_assets`.

## Important

Le fichier `02b_post_seed_vocabulary_backfill_existing_spaces.sql` est optionnel : il sert uniquement si des espaces enseignants existent déjà avant l’import du vocabulaire.

Le dossier `legacy_migrations/` garde les anciennes migrations correctives pour mémoire. Pour une base neuve, on ne les exécute pas : les seeds propres intègrent déjà l’état final.
