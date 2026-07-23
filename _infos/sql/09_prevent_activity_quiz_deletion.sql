-- =========================================================
-- PATCH 09 — INTERDIRE LA SUPPRESSION D’UN QUIZ UTILISÉ
-- À exécuter UNE FOIS dans le SQL Editor Supabase.
--
-- Une activité du Catalogue conserve un snapshot de quiz dans levels_json.
-- Ce trigger empêche que ce snapshot devienne orphelin.
-- =========================================================

begin;

create or replace function public.prevent_catalog_activity_quiz_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.catalog_activities ca
    cross join lateral jsonb_each(ca.levels_json) as level(level_key, level_value)
    where coalesce(
      level.level_value #>> '{settings,quizId}',
      level.level_value #>> '{settings,quiz_id}',
      level.level_value #>> '{settings,quizSnapshot,id}',
      level.level_value #>> '{settings,quiz_snapshot,id}'
    ) = old.id::text
  ) then
    raise exception 'Ce quiz est encore utilisé par une activité et ne peut pas être supprimé.'
      using errcode = '23503';
  end if;

  return old;
end;
$$;

drop trigger if exists quizzes_prevent_catalog_activity_delete on public.quizzes;
create trigger quizzes_prevent_catalog_activity_delete
before delete on public.quizzes
for each row
execute function public.prevent_catalog_activity_quiz_delete();

commit;
