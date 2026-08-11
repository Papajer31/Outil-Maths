-- =========================================================
-- PATCH 28 — Remplacement intégral de phonology_words
-- À exécuter une seule fois après 27_phonology_word_syllables.sql.
--
-- Ajoute un RPC super-admin distinct de la synchronisation normale.
-- Le remplacement est atomique : la table est vidée puis la banque reçue
-- est réimportée. Si la validation ou l'insertion échoue, PostgreSQL annule
-- toute l'opération, suppression comprise.
-- =========================================================

create or replace function public.replace_phonology_words_as_admin(
  p_words jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted_count integer := 0;
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Accès réservé au super-admin.' using errcode = '42501';
  end if;

  select count(*) into v_deleted_count
  from public.phonology_words;

  delete from public.phonology_words
  where slug is not null;

  -- sync_phonology_words_as_admin effectue toute la validation du payload.
  -- Une exception à ce stade annule aussi le DELETE précédent.
  v_result := public.sync_phonology_words_as_admin(p_words, false);

  return coalesce(v_result, '{}'::jsonb) || jsonb_build_object(
    'replace_all', true,
    'deleted_count', v_deleted_count
  );
end;
$$;

revoke all on function public.replace_phonology_words_as_admin(jsonb) from public;
grant execute on function public.replace_phonology_words_as_admin(jsonb) to authenticated;
