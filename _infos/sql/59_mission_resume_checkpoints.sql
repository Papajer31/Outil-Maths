-- =========================================================
-- PATCH 59 — CHECKPOINTS / REPRISE DES MISSIONS MODERNES
-- À exécuter APRÈS 58_activity_history_v2.sql.
--
-- Sauvegarde l'endroit exact où un élève s'est arrêté dans une Mission.
-- Suspension : checkpoint conservé.
-- Réactivation / réattribution : checkpoint + progression supprimés.
-- =========================================================

begin;

grant usage on schema public to anon, authenticated;

create table if not exists public.student_activity_assignment_checkpoints (
  assignment_id uuid not null references public.activity_assignments(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  mission_run_id uuid not null,
  checkpoint_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (assignment_id, student_id),
  constraint student_activity_assignment_checkpoint_object_check
    check (jsonb_typeof(checkpoint_json) = 'object')
);

create index if not exists student_activity_assignment_checkpoints_student_idx
on public.student_activity_assignment_checkpoints (student_id, updated_at desc);

alter table public.student_activity_assignment_checkpoints enable row level security;
revoke all on public.student_activity_assignment_checkpoints from anon, authenticated;

create or replace function public.get_space_activity_assignment_checkpoint(
  p_access_code text,
  p_assignment_id uuid,
  p_student_id bigint,
  p_student_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id bigint;
  v_teacher_space_id bigint;
  v_teacher_class_id bigint;
  v_result jsonb;
begin
  v_student_id := public.resolve_history_student(p_access_code, p_student_id, p_student_code);
  if v_student_id is null then return null; end if;

  select ts.id, tc.id into v_teacher_space_id, v_teacher_class_id
  from public.students s
  join public.teacher_classes tc on tc.id = s.teacher_class_id
  join public.teacher_spaces ts on ts.id = tc.teacher_space_id
  where s.id = v_student_id;

  if not exists (
    select 1
    from public.activity_assignments a
    where a.id = p_assignment_id
      and a.teacher_space_id = v_teacher_space_id
      and a.is_active = true
      and exists (
        select 1 from public.activity_assignment_targets t
        where t.assignment_id = a.id
          and ((t.target_type = 'student' and t.student_id = v_student_id)
            or (t.target_type = 'class' and t.teacher_class_id = v_teacher_class_id))
      )
  ) then return null; end if;

  select jsonb_build_object(
    'mission_run_id', c.mission_run_id,
    'checkpoint_json', c.checkpoint_json,
    'updated_at', c.updated_at
  ) into v_result
  from public.student_activity_assignment_checkpoints c
  where c.assignment_id = p_assignment_id and c.student_id = v_student_id;

  return v_result;
end;
$$;

grant execute on function public.get_space_activity_assignment_checkpoint(text, uuid, bigint, text)
to anon, authenticated;

create or replace function public.save_space_activity_assignment_checkpoint(
  p_access_code text,
  p_assignment_id uuid,
  p_student_id bigint,
  p_student_code text,
  p_mission_run_id uuid,
  p_checkpoint_json jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id bigint;
  v_teacher_space_id bigint;
  v_teacher_class_id bigint;
  v_payload jsonb := coalesce(p_checkpoint_json, '{}'::jsonb);
begin
  if p_mission_run_id is null then return false; end if;
  if jsonb_typeof(v_payload) <> 'object' or octet_length(v_payload::text) > 262144 then
    raise exception 'Checkpoint de Mission invalide ou trop volumineux.' using errcode = '22023';
  end if;

  v_student_id := public.resolve_history_student(p_access_code, p_student_id, p_student_code);
  if v_student_id is null then return false; end if;

  select ts.id, tc.id into v_teacher_space_id, v_teacher_class_id
  from public.students s
  join public.teacher_classes tc on tc.id = s.teacher_class_id
  join public.teacher_spaces ts on ts.id = tc.teacher_space_id
  where s.id = v_student_id;

  if not exists (
    select 1
    from public.activity_assignments a
    where a.id = p_assignment_id
      and a.teacher_space_id = v_teacher_space_id
      and a.is_active = true
      and exists (
        select 1 from public.activity_assignment_targets t
        where t.assignment_id = a.id
          and ((t.target_type = 'student' and t.student_id = v_student_id)
            or (t.target_type = 'class' and t.teacher_class_id = v_teacher_class_id))
      )
  ) then return false; end if;

  if exists (
    select 1 from public.student_activity_assignment_progress p
    where p.assignment_id = p_assignment_id and p.student_id = v_student_id
  ) then return false; end if;

  insert into public.student_activity_assignment_checkpoints (
    assignment_id, student_id, mission_run_id, checkpoint_json, updated_at
  ) values (
    p_assignment_id, v_student_id, p_mission_run_id, v_payload, now()
  )
  on conflict (assignment_id, student_id) do update
  set mission_run_id = excluded.mission_run_id,
      checkpoint_json = excluded.checkpoint_json,
      updated_at = now();

  return true;
end;
$$;

grant execute on function public.save_space_activity_assignment_checkpoint(text, uuid, bigint, text, uuid, jsonb)
to anon, authenticated;

-- Une Mission terminée n'a plus besoin de checkpoint.
create or replace function public.clear_assignment_checkpoint_on_completion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.student_activity_assignment_checkpoints
  where assignment_id = new.assignment_id and student_id = new.student_id;
  return new;
end;
$$;

drop trigger if exists trg_clear_assignment_checkpoint_on_completion
on public.student_activity_assignment_progress;
create trigger trg_clear_assignment_checkpoint_on_completion
after insert or update on public.student_activity_assignment_progress
for each row execute function public.clear_assignment_checkpoint_on_completion();

-- Réactiver (pause -> active) signifie recommencer depuis le début pour tous.
create or replace function public.reset_assignment_state_on_reactivation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.is_active = false and new.is_active = true then
    delete from public.student_activity_assignment_progress where assignment_id = new.id;
    delete from public.student_activity_assignment_checkpoints where assignment_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reset_assignment_state_on_reactivation
on public.activity_assignments;
create trigger trg_reset_assignment_state_on_reactivation
after update of is_active on public.activity_assignments
for each row execute function public.reset_assignment_state_on_reactivation();

-- Le bouton « Réattribuer » produit le même reset, même si l'attribution est déjà active.
create or replace function public.reassign_activity_assignment(p_assignment_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer := 0;
  v_checkpoint_count integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1 from public.activity_assignments a
    join public.teacher_spaces ts on ts.id = a.teacher_space_id
    where a.id = p_assignment_id and ts.owner_user_id = auth.uid()
  ) then
    raise exception 'Attribution introuvable ou inaccessible.' using errcode = '42501';
  end if;

  delete from public.student_activity_assignment_progress where assignment_id = p_assignment_id;
  get diagnostics v_deleted_count = row_count;
  delete from public.student_activity_assignment_checkpoints where assignment_id = p_assignment_id;
  get diagnostics v_checkpoint_count = row_count;

  update public.activity_assignments set updated_at = now() where id = p_assignment_id;
  return v_deleted_count + v_checkpoint_count;
end;
$$;

revoke all on function public.reassign_activity_assignment(uuid) from public, anon;
grant execute on function public.reassign_activity_assignment(uuid) to authenticated;

commit;
