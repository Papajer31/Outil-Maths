-- Réinitialisation complète des données d'activité d'un élève.
-- Supprime les tentatives, leur détail et tous les états de progression liés.

begin;

create or replace function public.delete_all_student_activity_data_as_teacher(
  p_student_id bigint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_deleted_sessions integer := 0;
begin
  if p_student_id is null or p_student_id <= 0 then
    raise exception 'Élève invalide.' using errcode = '22023';
  end if;

  select ts.owner_user_id
    into v_owner
  from public.students s
  join public.teacher_classes tc on tc.id = s.teacher_class_id
  join public.teacher_spaces ts on ts.id = tc.teacher_space_id
  where s.id = p_student_id;

  if v_owner is null then
    raise exception 'Élève introuvable.' using errcode = '22023';
  end if;

  if auth.uid() is null or v_owner is distinct from auth.uid() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  -- Les états de progression sont indépendants des sessions : chacun doit être
  -- supprimé afin que l'élève reparte réellement de zéro.
  delete from public.student_activity_assignment_progress where student_id = p_student_id;
  delete from public.student_mission_step_progress where student_id = p_student_id;
  delete from public.student_activity_progress_baseline where student_id = p_student_id;
  delete from public.student_activity_progress where student_id = p_student_id;
  delete from public.student_catalog_activity_attempts where student_id = p_student_id;
  delete from public.student_catalog_activity_levels where student_id = p_student_id;
  delete from public.student_adventure_days where student_id = p_student_id;
  delete from public.student_adventure_tier_progress where student_id = p_student_id;

  -- Les questions détaillées sont supprimées en cascade avec leur tentative.
  delete from public.student_activity_sessions where student_id = p_student_id;

  get diagnostics v_deleted_sessions = row_count;
  return v_deleted_sessions;
end;
$$;

revoke all on function public.delete_all_student_activity_data_as_teacher(bigint)
from public, anon;
grant execute on function public.delete_all_student_activity_data_as_teacher(bigint)
to authenticated;

commit;
