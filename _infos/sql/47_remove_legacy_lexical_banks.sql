-- =========================================================
-- 47_remove_legacy_lexical_banks.sql
-- Nettoyage définitif après bascule vers public.lexical_entries.
--
-- À exécuter après 46 et après déploiement du patch 4/5.
--
-- - supprime public.phonology_words et ses RPC d'administration ;
-- - supprime public.vocabulary_default_words ;
-- - conserve la banque personnalisable teacher_vocabulary_words, mais son
--   initialisation/réinitialisation est désormais alimentée par le niveau 1
--   de lexical_entries (aucune dépendance à l'ancienne banque par défaut).
-- =========================================================

begin;

-- Les anciennes RPC phonologiques n'ont plus aucun appelant applicatif.
drop function if exists public.replace_phonology_words_as_admin(jsonb);
drop function if exists public.sync_phonology_words_as_admin(jsonb, boolean);

-- La banque enseignant historique peut continuer à exister sans sa table
-- de valeurs par défaut : le niveau lexical 1 devient la source d'initialisation.
create or replace function public.copy_default_vocabulary_words_to_teacher_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.teacher_vocabulary_words (
    teacher_space_id,
    word,
    word_normalized,
    dictionary_page,
    updated_at
  )
  select
    new.id,
    le.entry,
    lower(btrim(le.entry)),
    null,
    now()
  from public.lexical_entries le
  where le.is_active = true
    and le.lexical_level = 1
  on conflict (teacher_space_id, word_normalized) do update
  set word = excluded.word,
      dictionary_page = null,
      updated_at = now();

  return new;
end;
$$;

create or replace function public.reset_teacher_vocabulary_words(p_teacher_space_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = p_teacher_space_id
      and ts.owner_user_id = auth.uid()
  ) then
    raise exception 'Accès refusé à cette banque de mots.';
  end if;

  delete from public.teacher_vocabulary_words
  where teacher_space_id = p_teacher_space_id;

  insert into public.teacher_vocabulary_words (
    teacher_space_id,
    word,
    word_normalized,
    dictionary_page,
    updated_at
  )
  select
    p_teacher_space_id,
    le.entry,
    lower(btrim(le.entry)),
    null,
    now()
  from public.lexical_entries le
  where le.is_active = true
    and le.lexical_level = 1;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Les deux tables sont désormais réellement obsolètes.
drop table if exists public.phonology_words cascade;
drop table if exists public.vocabulary_default_words cascade;

commit;
