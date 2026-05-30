# Seeds propres

À exécuter après les fichiers `sql/from_scratch/*.sql`.

## Ordre

1. `01_seed_image_assets.sql`
2. `02_seed_vocabulary_default_words.sql`
3. `03_seed_phonology_words.sql`

Optionnel : `02b_post_seed_vocabulary_backfill_existing_spaces.sql` si des `teacher_spaces` existent déjà.

## Notes

- `02_seed_vocabulary_default_words.sql` fusionne la seed principale et le complément historique.
- `03_seed_phonology_words.sql` n’est pas une copie brute de l’ancien fichier : les graphèmes historiques ont été normalisés directement.
