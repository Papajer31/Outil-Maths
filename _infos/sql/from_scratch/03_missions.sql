-- =========================================================
-- 03_MISSIONS — arborescence libre, suite d’activités, attributions
-- =========================================================

-- ---------------------------------------------------------
-- Dossiers de Missions
-- ---------------------------------------------------------

create table public.mission_folders (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  parent_id uuid null references public.mission_folders(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint mission_folders_name_not_blank check (btrim(name) <> ''),
  constraint mission_folders_no_self_parent check (parent_id is null or parent_id <> id)
);

create index mission_folders_teacher_space_idx
on public.mission_folders (teacher_space_id);

create index mission_folders_parent_idx
on public.mission_folders (parent_id);

create index mission_folders_order_idx
on public.mission_folders (teacher_space_id, parent_id, display_order, name);

create unique index mission_folders_sibling_name_unique
on public.mission_folders (
  teacher_space_id,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

drop trigger if exists trg_mission_folders_updated_at on public.mission_folders;
create trigger trg_mission_folders_updated_at
before update on public.mission_folders
for each row execute function public.set_updated_at();

create or replace function public.validate_mission_folder_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_space_id bigint;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Un dossier de mission ne peut pas être son propre parent.';
  end if;

  select mf.teacher_space_id into parent_space_id
  from public.mission_folders mf
  where mf.id = new.parent_id;

  if parent_space_id is null or parent_space_id <> new.teacher_space_id then
    raise exception 'Le dossier parent ne correspond pas à l’espace enseignant.';
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      with recursive descendants as (
        select child.id, child.parent_id
        from public.mission_folders child
        where child.parent_id = new.id
        union all
        select child.id, child.parent_id
        from public.mission_folders child
        join descendants d on d.id = child.parent_id
      )
      select 1 from descendants where descendants.id = new.parent_id
    ) then
      raise exception 'Un dossier de mission ne peut pas être déplacé dans l’un de ses sous-dossiers.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_mission_folder_parent on public.mission_folders;
create trigger trg_validate_mission_folder_parent
before insert or update of parent_id, teacher_space_id
on public.mission_folders
for each row execute function public.validate_mission_folder_parent();

-- ---------------------------------------------------------
-- Missions
-- ---------------------------------------------------------

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  folder_id uuid null references public.mission_folders(id) on delete set null,
  title text not null,
  title_normalized text not null,
  description text not null default '',
  status text not null default 'draft',

  -- Passation choisie par le professeur
  answer_mode text not null default 'student_input',
  intent_mode text not null default 'practice',

  -- Déroulé commun de la Mission
  question_count integer not null default 5,
  question_time_seconds integer null,
  answer_display_seconds integer null,
  transition_seconds integer not null default 0,
  mission_time_seconds integer null,
  instructions text null,

  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint missions_title_not_blank check (btrim(title) <> ''),
  constraint missions_title_normalized_not_blank check (btrim(title_normalized) <> ''),
  constraint missions_status_check check (status in ('draft', 'active', 'archived')),
  constraint missions_answer_mode_check check (answer_mode in ('student_input', 'manual_validation')),
  constraint missions_intent_mode_check check (intent_mode in ('practice', 'evaluation')),
  constraint missions_question_count_positive check (question_count > 0),
  constraint missions_question_time_nonnegative check (question_time_seconds is null or question_time_seconds >= 0),
  constraint missions_answer_display_nonnegative check (answer_display_seconds is null or answer_display_seconds >= 0),
  constraint missions_transition_nonnegative check (transition_seconds >= 0),
  constraint missions_time_nonnegative check (mission_time_seconds is null or mission_time_seconds >= 0)
);

create index missions_space_status_idx
on public.missions (teacher_space_id, status, display_order, title);

create index missions_folder_order_idx
on public.missions (teacher_space_id, folder_id, display_order, title);

create unique index missions_unique_title_per_space
on public.missions (teacher_space_id, title_normalized)
where status <> 'archived';

drop trigger if exists trg_missions_updated_at on public.missions;
create trigger trg_missions_updated_at
before update on public.missions
for each row execute function public.set_updated_at();

create or replace function public.validate_mission_folder_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  folder_space_id bigint;
begin
  if new.folder_id is null then
    return new;
  end if;

  select mf.teacher_space_id into folder_space_id
  from public.mission_folders mf
  where mf.id = new.folder_id;

  if folder_space_id is null or folder_space_id <> new.teacher_space_id then
    raise exception 'Le dossier de mission ne correspond pas à l’espace enseignant.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_mission_folder_ref on public.missions;
create trigger trg_validate_mission_folder_ref
before insert or update of folder_id, teacher_space_id
on public.missions
for each row execute function public.validate_mission_folder_ref();

-- ---------------------------------------------------------
-- Étapes de Mission
-- ---------------------------------------------------------

create table public.mission_steps (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  catalog_activity_id text not null,
  position integer not null default 0,
  difficulty_mode text not null default 'normal',
  difficulty_level smallint not null default 3,
  step_options_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint mission_steps_catalog_activity_not_blank check (btrim(catalog_activity_id) <> ''),
  constraint mission_steps_position_nonnegative check (position >= 0),
  constraint mission_steps_difficulty_mode_check check (difficulty_mode in ('normal', 'fixed', 'adaptive')),
  constraint mission_steps_difficulty_level_check check (difficulty_level between 1 and 5),
  constraint mission_steps_options_object check (jsonb_typeof(step_options_json) = 'object')
);

create index mission_steps_mission_position_idx
on public.mission_steps (mission_id, position, created_at);

drop trigger if exists trg_mission_steps_updated_at on public.mission_steps;
create trigger trg_mission_steps_updated_at
before update on public.mission_steps
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Attributions
-- ---------------------------------------------------------

create table public.mission_assignments (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  target_type text not null,
  teacher_class_id bigint null references public.teacher_classes(id) on delete cascade,
  student_id bigint null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint mission_assignments_target_type_check check (target_type in ('class', 'student')),
  constraint mission_assignments_one_target check (
    (target_type = 'class' and teacher_class_id is not null and student_id is null)
    or
    (target_type = 'student' and student_id is not null and teacher_class_id is null)
  )
);

create unique index mission_assignments_unique_class
on public.mission_assignments (mission_id, teacher_class_id)
where target_type = 'class';

create unique index mission_assignments_unique_student
on public.mission_assignments (mission_id, student_id)
where target_type = 'student';

create index mission_assignments_mission_idx
on public.mission_assignments (mission_id);

create index mission_assignments_class_idx
on public.mission_assignments (teacher_class_id)
where target_type = 'class';

create index mission_assignments_student_idx
on public.mission_assignments (student_id)
where target_type = 'student';

create or replace function public.validate_mission_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mission_space_id bigint;
  target_space_id bigint;
begin
  select m.teacher_space_id into mission_space_id
  from public.missions m
  where m.id = new.mission_id;

  if mission_space_id is null then
    raise exception 'Mission introuvable.';
  end if;

  if new.target_type = 'class' then
    select tc.teacher_space_id into target_space_id
    from public.teacher_classes tc
    where tc.id = new.teacher_class_id;
  elsif new.target_type = 'student' then
    select tc.teacher_space_id into target_space_id
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    where s.id = new.student_id;
  end if;

  if target_space_id is null or target_space_id <> mission_space_id then
    raise exception 'La cible de mission ne correspond pas à l’espace enseignant.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_mission_assignment on public.mission_assignments;
create trigger trg_validate_mission_assignment
before insert or update of mission_id, target_type, teacher_class_id, student_id
on public.mission_assignments
for each row execute function public.validate_mission_assignment();

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------

alter table public.mission_folders enable row level security;
alter table public.missions enable row level security;
alter table public.mission_steps enable row level security;
alter table public.mission_assignments enable row level security;

create policy mission_folders_select_own on public.mission_folders
for select to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = mission_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy mission_folders_insert_own on public.mission_folders
for insert to authenticated
with check (exists (select 1 from public.teacher_spaces ts where ts.id = mission_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy mission_folders_update_own on public.mission_folders
for update to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = mission_folders.teacher_space_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.teacher_spaces ts where ts.id = mission_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy mission_folders_delete_own on public.mission_folders
for delete to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = mission_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy missions_select_own on public.missions
for select to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = missions.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy missions_insert_own on public.missions
for insert to authenticated
with check (exists (select 1 from public.teacher_spaces ts where ts.id = missions.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy missions_update_own on public.missions
for update to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = missions.teacher_space_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.teacher_spaces ts where ts.id = missions.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy missions_delete_own on public.missions
for delete to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = missions.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy mission_steps_select_own on public.mission_steps
for select to authenticated
using (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_steps.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_steps_insert_own on public.mission_steps
for insert to authenticated
with check (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_steps.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_steps_update_own on public.mission_steps
for update to authenticated
using (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_steps.mission_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_steps.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_steps_delete_own on public.mission_steps
for delete to authenticated
using (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_steps.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_assignments_select_own on public.mission_assignments
for select to authenticated
using (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_assignments.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_assignments_insert_own on public.mission_assignments
for insert to authenticated
with check (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_assignments.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_assignments_update_own on public.mission_assignments
for update to authenticated
using (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_assignments.mission_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_assignments.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_assignments_delete_own on public.mission_assignments
for delete to authenticated
using (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_assignments.mission_id and ts.owner_user_id = auth.uid()));

grant select, insert, update, delete on public.mission_folders to authenticated;
grant select, insert, update, delete on public.missions to authenticated;
grant select, insert, update, delete on public.mission_steps to authenticated;
grant select, insert, update, delete on public.mission_assignments to authenticated;

-- ---------------------------------------------------------
-- RPC publiques élèves
-- ---------------------------------------------------------

create or replace function public.get_space_missions(
  p_access_code text,
  p_student_ids bigint[] default '{}'::bigint[],
  p_is_group boolean default false
)
returns table (
  id uuid,
  title text,
  description text,
  answer_mode text,
  intent_mode text,
  question_count integer,
  question_time_seconds integer,
  answer_display_seconds integer,
  transition_seconds integer,
  mission_time_seconds integer,
  instructions text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with space as (
    select id from public.teacher_spaces where access_code = upper(trim(p_access_code))
  ), selected_students as (
    select s.id, s.teacher_class_id
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join space sp on sp.id = tc.teacher_space_id
    where s.is_active = true
      and s.id = any(coalesce(p_student_ids, '{}'::bigint[]))
  ), selected_classes as (
    select distinct teacher_class_id from selected_students
  )
  select
    m.id,
    m.title,
    m.description,
    m.answer_mode,
    m.intent_mode,
    m.question_count,
    m.question_time_seconds,
    m.answer_display_seconds,
    m.transition_seconds,
    m.mission_time_seconds,
    m.instructions,
    m.updated_at
  from public.missions m
  join space sp on sp.id = m.teacher_space_id
  where m.status = 'active'
    and exists (select 1 from public.mission_steps ms where ms.mission_id = m.id)
    and (
      -- En groupe : uniquement missions de classe pour le MVP.
      (coalesce(p_is_group, false) = true and exists (
        select 1
        from public.mission_assignments ma
        join selected_classes sc on sc.teacher_class_id = ma.teacher_class_id
        where ma.mission_id = m.id
          and ma.target_type = 'class'
      ))
      or
      -- En individuel : missions de l’élève + missions de sa classe.
      (coalesce(p_is_group, false) = false and exists (
        select 1
        from public.mission_assignments ma
        left join selected_classes sc on sc.teacher_class_id = ma.teacher_class_id and ma.target_type = 'class'
        left join selected_students ss on ss.id = ma.student_id and ma.target_type = 'student'
        where ma.mission_id = m.id
          and (sc.teacher_class_id is not null or ss.id is not null)
      ))
    )
  order by m.display_order asc, lower(m.title) asc, m.updated_at desc;
$$;

create or replace function public.get_space_mission_steps(
  p_access_code text,
  p_mission_id uuid
)
returns table (
  id uuid,
  mission_id uuid,
  catalog_activity_id text,
  position integer,
  difficulty_mode text,
  difficulty_level smallint,
  step_options_json jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ms.id,
    ms.mission_id,
    ms.catalog_activity_id,
    ms.position,
    ms.difficulty_mode,
    ms.difficulty_level,
    ms.step_options_json
  from public.teacher_spaces ts
  join public.missions m on m.teacher_space_id = ts.id
  join public.mission_steps ms on ms.mission_id = m.id
  where ts.access_code = upper(trim(p_access_code))
    and m.id = p_mission_id
    and m.status = 'active'
  order by ms.position asc, ms.created_at asc;
$$;

grant execute on function public.get_space_missions(text, bigint[], boolean) to anon, authenticated;
grant execute on function public.get_space_mission_steps(text, uuid) to anon, authenticated;
