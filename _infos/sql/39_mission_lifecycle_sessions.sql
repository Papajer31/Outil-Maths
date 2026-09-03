-- 39_mission_lifecycle_sessions.sql
-- Cycle de vie des Missions : draft / active / inactive, réactivation en nouvelle
-- session interne, désactivation automatique quand tous les élèves attribués ont
-- terminé, et suppression définitive côté enseignant.
-- À exécuter APRÈS 38_interface_audio_system.sql.

begin;

-- ---------------------------------------------------------
-- 1) Remplacer l'ancien état "archived" par "inactive"
-- ---------------------------------------------------------
-- L'ancien index excluait archived : on le retire avant la conversion pour ne
-- pas provoquer de conflit si une mission du même nom a été recréée depuis.

drop index if exists public.missions_unique_title_per_space;

alter table public.missions
  drop constraint if exists missions_status_check;

alter table public.missions
  add column if not exists current_run integer not null default 1,
  add column if not exists inactive_reason text null;

update public.missions
set status = 'inactive',
    inactive_reason = coalesce(inactive_reason, 'manual')
where status = 'archived';

update public.missions
set current_run = 1
where current_run is null or current_run < 1;

alter table public.missions
  add constraint missions_status_check
  check (status in ('draft', 'active', 'inactive'));

alter table public.missions
  drop constraint if exists missions_current_run_positive;
alter table public.missions
  add constraint missions_current_run_positive
  check (current_run > 0);

alter table public.missions
  drop constraint if exists missions_inactive_reason_check;
alter table public.missions
  add constraint missions_inactive_reason_check
  check (inactive_reason is null or inactive_reason in ('manual', 'completed'));

-- Les missions inactives peuvent avoir le même nom qu'une mission courante,
-- exactement comme les anciennes archives. Une réactivation vérifiera le conflit.
create unique index missions_unique_title_per_space
on public.missions (teacher_space_id, title_normalized)
where status <> 'inactive';

-- ---------------------------------------------------------
-- 2) Numéro de session interne sur l'historique des tentatives
-- ---------------------------------------------------------
-- Il n'est pas affiché à l'enseignant. Il permet seulement de savoir à quelle
-- réactivation appartenait une ancienne tentative.

alter table public.student_activity_sessions
  add column if not exists mission_run integer null;

update public.student_activity_sessions
set mission_run = 1
where context = 'mission'
  and mission_run is null;

alter table public.student_activity_sessions
  drop constraint if exists student_activity_sessions_mission_run_positive;
alter table public.student_activity_sessions
  add constraint student_activity_sessions_mission_run_positive
  check (mission_run is null or mission_run > 0);

create or replace function public.stamp_student_activity_mission_run()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.context = 'mission' and new.mission_id is not null then
    select m.current_run
      into new.mission_run
    from public.missions m
    where m.id = new.mission_id;

    new.mission_run := coalesce(new.mission_run, 1);
  else
    new.mission_run := null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_student_activity_mission_run
on public.student_activity_sessions;

create trigger trg_student_activity_mission_run
before insert on public.student_activity_sessions
for each row execute function public.stamp_student_activity_mission_run();

-- ---------------------------------------------------------
-- 3) Désactivation automatique quand tous les destinataires ont terminé
-- ---------------------------------------------------------

create or replace function public.refresh_mission_completion_status(p_mission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_step_count integer := 0;
  v_assigned_count integer := 0;
  v_completed_students integer := 0;
begin
  select m.status
    into v_status
  from public.missions m
  where m.id = p_mission_id;

  if not found or v_status <> 'active' then
    return;
  end if;

  select count(*)::integer
    into v_step_count
  from public.mission_steps ms
  where ms.mission_id = p_mission_id;

  if v_step_count <= 0 then
    return;
  end if;

  with assigned_students as (
    select distinct ma.student_id as student_id
    from public.mission_assignments ma
    join public.students s on s.id = ma.student_id
    where ma.mission_id = p_mission_id
      and ma.target_type = 'student'
      and ma.student_id is not null
      and s.is_active = true

    union

    select distinct s.id as student_id
    from public.mission_assignments ma
    join public.students s on s.teacher_class_id = ma.teacher_class_id
    where ma.mission_id = p_mission_id
      and ma.target_type = 'class'
      and ma.teacher_class_id is not null
      and s.is_active = true
  )
  select count(*)::integer
    into v_assigned_count
  from assigned_students;

  if v_assigned_count <= 0 then
    return;
  end if;

  with assigned_students as (
    select distinct ma.student_id as student_id
    from public.mission_assignments ma
    join public.students s on s.id = ma.student_id
    where ma.mission_id = p_mission_id
      and ma.target_type = 'student'
      and ma.student_id is not null
      and s.is_active = true

    union

    select distinct s.id as student_id
    from public.mission_assignments ma
    join public.students s on s.teacher_class_id = ma.teacher_class_id
    where ma.mission_id = p_mission_id
      and ma.target_type = 'class'
      and ma.teacher_class_id is not null
      and s.is_active = true
  )
  select count(*)::integer
    into v_completed_students
  from assigned_students a
  where not exists (
    select 1
    from public.mission_steps ms
    where ms.mission_id = p_mission_id
      and not exists (
        select 1
        from public.student_mission_step_progress smsp
        where smsp.student_id = a.student_id
          and smsp.mission_id = p_mission_id
          and smsp.mission_step_id = ms.id
      )
  );

  if v_completed_students = v_assigned_count then
    update public.missions
    set status = 'inactive',
        inactive_reason = 'completed'
    where id = p_mission_id
      and status = 'active';
  end if;
end;
$$;

revoke all on function public.refresh_mission_completion_status(uuid)
from public, anon, authenticated;

create or replace function public.on_student_mission_progress_refresh_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.refresh_mission_completion_status(new.mission_id);
  return new;
end;
$$;

drop trigger if exists trg_student_mission_progress_refresh_status
on public.student_mission_step_progress;

create trigger trg_student_mission_progress_refresh_status
after insert or update on public.student_mission_step_progress
for each row execute function public.on_student_mission_progress_refresh_status();

-- Mettre immédiatement à jour les missions déjà entièrement terminées.
do $$
declare
  v_mission record;
begin
  for v_mission in
    select id from public.missions where status = 'active'
  loop
    perform public.refresh_mission_completion_status(v_mission.id);
  end loop;
end;
$$;

-- ---------------------------------------------------------
-- 4) Réactivation = nouvelle session, progression Mission remise à zéro
-- ---------------------------------------------------------

create or replace function public.reactivate_mission_as_teacher(p_mission_id uuid)
returns table (
  id uuid,
  status text,
  current_run integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mission public.missions%rowtype;
  v_owner uuid;
begin
  select m.*
    into v_mission
  from public.missions m
  where m.id = p_mission_id
  for update;

  if not found then
    raise exception 'Mission introuvable.' using errcode = '22023';
  end if;

  select ts.owner_user_id
    into v_owner
  from public.teacher_spaces ts
  where ts.id = v_mission.teacher_space_id;

  if auth.uid() is null or v_owner is distinct from auth.uid() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  if v_mission.status <> 'inactive' then
    raise exception 'Seule une mission inactive peut être réactivée.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.missions other
    where other.teacher_space_id = v_mission.teacher_space_id
      and other.id <> v_mission.id
      and other.title_normalized = v_mission.title_normalized
      and other.status <> 'inactive'
  ) then
    raise exception 'Une mission active ou en brouillon porte déjà ce titre.' using errcode = '23505';
  end if;

  -- La progression de Mission représente uniquement la session courante.
  -- Les anciennes tentatives restent dans student_activity_sessions.
  delete from public.student_mission_step_progress
  where mission_id = v_mission.id;

  update public.missions m
  set status = 'active',
      inactive_reason = null,
      current_run = greatest(1, coalesce(m.current_run, 1)) + 1
  where m.id = v_mission.id
  returning m.id, m.status, m.current_run
  into id, status, current_run;

  return next;
end;
$$;

revoke all on function public.reactivate_mission_as_teacher(uuid)
from public, anon;
grant execute on function public.reactivate_mission_as_teacher(uuid)
to authenticated;

-- ---------------------------------------------------------
-- 5) Réinitialisation fine : ne jamais toucher à une autre session de Mission
-- ---------------------------------------------------------
-- Le patch 37 annulait les étapes ciblée + suivantes sans notion de session.
-- Maintenant, les tentatives historiques d'une ancienne session ne doivent pas
-- remettre à zéro la session courante. Si la session courante avait été mise
-- inactive automatiquement car terminée, annuler une tentative la réactive dans
-- LA MÊME session ; une désactivation manuelle, elle, reste respectée.

create or replace function public.reset_student_activity_attempt_as_teacher(
  p_attempt_id uuid,
  p_student_id bigint,
  p_delete_history boolean default false
)
returns table (
  context text,
  reset_attempts integer,
  reset_mission_steps integer,
  deleted_history boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_run public.student_activity_sessions%rowtype;
  v_target_position integer;
  v_reset_attempts integer := 0;
  v_reset_steps integer := 0;
  v_activity_id text;
  v_now timestamptz := now();
  v_current_mission_run integer;
  v_mission_inactive_reason text;
begin
  select sas.*
    into v_run
  from public.student_activity_sessions sas
  where sas.id = p_attempt_id
    and sas.student_id = p_student_id
  for update;

  if not found then
    raise exception 'Tentative introuvable.' using errcode = '22023';
  end if;

  select ts.owner_user_id
    into v_owner
  from public.students s
  join public.teacher_classes tc on tc.id = s.teacher_class_id
  join public.teacher_spaces ts on ts.id = tc.teacher_space_id
  where s.id = v_run.student_id;

  if auth.uid() is null or v_owner is distinct from auth.uid() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  if v_run.context not in ('exploration', 'mission') then
    raise exception 'La réinitialisation fine de ce mode n''est pas encore disponible.' using errcode = '22023';
  end if;

  if v_run.context = 'exploration' then
    update public.student_activity_sessions sas
    set progress_voided_at = coalesce(sas.progress_voided_at, v_now),
        status = case when sas.status = 'running' then 'abandoned' else sas.status end,
        ended_at = case when sas.status = 'running' then coalesce(sas.ended_at, v_now) else sas.ended_at end
    where sas.id = v_run.id;

    get diagnostics v_reset_attempts = row_count;

    perform public.recompute_student_activity_progress_state(
      v_run.student_id,
      v_run.catalog_activity_id
    );

  else
    select m.current_run, m.inactive_reason
      into v_current_mission_run, v_mission_inactive_reason
    from public.missions m
    where m.id = v_run.mission_id;

    select ms.position
      into v_target_position
    from public.mission_steps ms
    where ms.id = v_run.mission_step_id
      and ms.mission_id = v_run.mission_id;

    if v_target_position is null then
      update public.student_activity_sessions sas
      set progress_voided_at = coalesce(sas.progress_voided_at, v_now),
          status = case when sas.status = 'running' then 'abandoned' else sas.status end,
          ended_at = case when sas.status = 'running' then coalesce(sas.ended_at, v_now) else sas.ended_at end
      where sas.id = v_run.id;

      get diagnostics v_reset_attempts = row_count;

      perform public.recompute_student_activity_progress_state(
        v_run.student_id,
        v_run.catalog_activity_id
      );
    else
      -- Annuler uniquement les tentatives de la même session interne.
      update public.student_activity_sessions sas
      set progress_voided_at = coalesce(sas.progress_voided_at, v_now),
          status = case when sas.status = 'running' then 'abandoned' else sas.status end,
          ended_at = case when sas.status = 'running' then coalesce(sas.ended_at, v_now) else sas.ended_at end
      from public.mission_steps ms
      where sas.student_id = v_run.student_id
        and sas.context = 'mission'
        and sas.mission_id = v_run.mission_id
        and coalesce(sas.mission_run, 1) = coalesce(v_run.mission_run, 1)
        and sas.mission_step_id = ms.id
        and ms.mission_id = v_run.mission_id
        and ms.position >= v_target_position;

      get diagnostics v_reset_attempts = row_count;

      -- student_mission_step_progress ne représente que la session courante.
      if v_current_mission_run is not null
         and coalesce(v_run.mission_run, 1) = v_current_mission_run then
        delete from public.student_mission_step_progress smsp
        using public.mission_steps ms
        where smsp.student_id = v_run.student_id
          and smsp.mission_id = v_run.mission_id
          and smsp.mission_step_id = ms.id
          and ms.mission_id = v_run.mission_id
          and ms.position >= v_target_position;

        get diagnostics v_reset_steps = row_count;

        -- Si la Mission s'était désactivée automatiquement parce que tout le
        -- monde avait terminé, l'annulation la rend à nouveau visible. Une
        -- désactivation manuelle n'est jamais contournée.
        if v_mission_inactive_reason = 'completed' then
          update public.missions
          set status = 'active',
              inactive_reason = null
          where id = v_run.mission_id
            and status = 'inactive'
            and inactive_reason = 'completed';
        end if;
      end if;

      for v_activity_id in
        select distinct sas.catalog_activity_id
        from public.student_activity_sessions sas
        join public.mission_steps ms on ms.id = sas.mission_step_id
        where sas.student_id = v_run.student_id
          and sas.context = 'mission'
          and sas.mission_id = v_run.mission_id
          and coalesce(sas.mission_run, 1) = coalesce(v_run.mission_run, 1)
          and ms.mission_id = v_run.mission_id
          and ms.position >= v_target_position
          and btrim(coalesce(sas.catalog_activity_id, '')) <> ''
      loop
        perform public.recompute_student_activity_progress_state(
          v_run.student_id,
          v_activity_id
        );
      end loop;
    end if;
  end if;

  if coalesce(p_delete_history, false) then
    delete from public.student_activity_sessions sas
    where sas.id = v_run.id
      and sas.student_id = v_run.student_id;
  end if;

  return query
  select
    v_run.context,
    v_reset_attempts,
    v_reset_steps,
    coalesce(p_delete_history, false);
end;
$$;

revoke all on function public.reset_student_activity_attempt_as_teacher(uuid, bigint, boolean)
from public, anon;
grant execute on function public.reset_student_activity_attempt_as_teacher(uuid, bigint, boolean)
to authenticated;

commit;
