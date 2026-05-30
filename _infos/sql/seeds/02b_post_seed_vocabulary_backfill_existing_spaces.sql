-- =========================================================
-- POST-SEED OPTIONNEL : recopier vocabulary_default_words dans les espaces enseignants existants
-- À exécuter seulement si des teacher_spaces existent déjà avant l’import des seeds.
-- =========================================================

insert into public.teacher_vocabulary_words (teacher_space_id, word, word_normalized, dictionary_page, updated_at)
select
  ts.id,
  d.word,
  d.word_normalized,
  d.dictionary_page,
  now()
from public.teacher_spaces ts
cross join public.vocabulary_default_words d
on conflict (teacher_space_id, word_normalized) do update
set
  word = excluded.word,
  dictionary_page = excluded.dictionary_page,
  updated_at = now();
