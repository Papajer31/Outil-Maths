-- =========================================================
-- 40_adaptive_default_level_one.sql
-- Niveau initial des activités adaptatives : 1 au lieu de 3.
-- À exécuter APRÈS 39_mission_lifecycle_sessions.sql.
--
-- IMPORTANT : aucune progression existante n'est modifiée.
-- Seuls les élèves sans progression préalable pour l'activité démarrent à N1.
-- =========================================================

begin;

-- Défaut technique pour les futures lignes créées sans niveau explicite.
alter table public.student_activity_progress
  alter column current_level set default 1;

-- Exploration + Mission adaptative : lorsqu'aucune progression n'existe encore,
-- le RPC public renvoie désormais le niveau 1.
create or replace function public.get_student_activity_progress(
  p_access_code text,
  p_student_id bigint,
  p_student_code text,
  p_catalog_activity_id text
)
returns table (
  student_id bigint,
  catalog_activity_id text,
  current_level integer,
  total_sessions integer,
  total_questions integer,
  total_correct integer,
  total_wrong integer,
  last_played_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student_id bigint;
begin
  select s.id into v_student_id
  from public.teacher_spaces ts
  join public.teacher_classes tc on tc.teacher_space_id = ts.id
  join public.students s on s.teacher_class_id = tc.id
  where ts.access_code = upper(btrim(coalesce(p_access_code, '')))
    and s.id = p_student_id
    and s.is_active = true
    and s.student_code = upper(btrim(coalesce(p_student_code, '')))
  limit 1;

  if v_student_id is null then
    return;
  end if;

  return query
  select
    v_student_id as student_id,
    btrim(coalesce(p_catalog_activity_id, ''))::text as catalog_activity_id,
    coalesce(sap.current_level, 1)::integer as current_level,
    coalesce(sap.total_sessions, 0)::integer as total_sessions,
    coalesce(sap.total_questions, 0)::integer as total_questions,
    coalesce(sap.total_correct, 0)::integer as total_correct,
    coalesce(sap.total_wrong, 0)::integer as total_wrong,
    sap.last_played_at
  from (select 1) one
  left join public.student_activity_progress sap
    on sap.student_id = v_student_id
   and sap.catalog_activity_id = btrim(coalesce(p_catalog_activity_id, ''))
  where exists (
    select 1 from public.catalog_activities ca
    where ca.id = btrim(coalesce(p_catalog_activity_id, ''))
      and ca.status = 'published'
  );
end;
$$;

-- Aventure : première rencontre d'une activité à N1 ; les niveaux déjà
-- enregistrés en Aventure continuent d'être repris tels quels.
create or replace function public.get_student_adventure_activity_start_level(
  p_student_id bigint,
  p_catalog_activity_id text
)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select greatest(1, least(5, sas.ended_level))
      from public.student_activity_sessions sas
      where sas.student_id = p_student_id
        and sas.catalog_activity_id = btrim(coalesce(p_catalog_activity_id, ''))
        and sas.context = 'adventure'
      order by sas.started_at desc, sas.created_at desc, sas.id desc
      limit 1
    ),
    1
  );
$$;

revoke all
on function public.get_student_adventure_activity_start_level(bigint, text)
from public, anon, authenticated;

grant execute
on function public.get_student_activity_progress(text, bigint, text, text)
to anon, authenticated;

commit;
