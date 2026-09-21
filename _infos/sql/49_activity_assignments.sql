-- =========================================================
-- PATCH 49 — ATTRIBUTION DIRECTE D'ACTIVITÉS
-- À exécuter APRÈS 48_teacher_activities.sql.
--
-- Ce système est volontairement indépendant :
-- - des anciennes Missions / mission_steps ;
-- - de student_activity_sessions et de l'historique détaillé.
--
-- Une attribution peut viser :
-- - une activité du catalogue système ;
-- - une activité personnelle teacher_activities.
--
-- La progression minimale est uniquement : activité terminée par élève.
-- =========================================================

begin;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------
-- 1) Attribution
-- ---------------------------------------------------------

create table if not exists public.activity_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  source_type text not null,
  source_id text not null,
  title_snapshot text not null,
  difficulty_mode text not null default 'fixed',
  difficulty_level smallint null,
  execution_limit_mode text not null default 'questions',
  execution_limit_value integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint activity_assignments_source_type_check
    check (source_type in ('catalog_activity', 'teacher_activity')),
  constraint activity_assignments_source_id_not_blank
    check (btrim(source_id) <> ''),
  constraint activity_assignments_title_not_blank
    check (btrim(title_snapshot) <> ''),
  constraint activity_assignments_difficulty_mode_check
    check (difficulty_mode in ('adaptive', 'fixed')),
  constraint activity_assignments_difficulty_level_check
    check (difficulty_level is null or difficulty_level between 1 and 5),
  constraint activity_assignments_difficulty_shape_check
    check (
      (difficulty_mode = 'adaptive' and difficulty_level is null)
      or (difficulty_mode = 'fixed' and difficulty_level between 1 and 5)
    ),
  constraint activity_assignments_execution_mode_check
    check (execution_limit_mode in ('questions', 'time', 'intrinsic')),
  constraint activity_assignments_execution_value_check
    check (
      (execution_limit_mode = 'intrinsic' and execution_limit_value is null)
      or (execution_limit_mode in ('questions', 'time') and execution_limit_value is not null and execution_limit_value > 0)
    )
);

create index if not exists activity_assignments_space_created_idx
on public.activity_assignments (teacher_space_id, created_at desc);

create index if not exists activity_assignments_source_idx
on public.activity_assignments (source_type, source_id);

drop trigger if exists trg_activity_assignments_updated_at
on public.activity_assignments;

create trigger trg_activity_assignments_updated_at
before update on public.activity_assignments
for each row execute function public.set_updated_at();

create or replace function public.validate_activity_assignment_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_type = 'teacher_activity' then
    if not exists (
      select 1
      from public.teacher_activities ta
      where ta.id::text = new.source_id
        and ta.teacher_space_id = new.teacher_space_id
    ) then
      raise exception 'Activité personnelle introuvable pour cet espace.' using errcode = '23503';
    end if;
  elsif new.source_type = 'catalog_activity' then
    if not exists (
      select 1
      from public.catalog_activities ca
      where ca.id = new.source_id
        and ca.status = 'published'
    ) then
      raise exception 'Activité du catalogue introuvable ou non publiée.' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_activity_assignment_source
on public.activity_assignments;

create trigger trg_validate_activity_assignment_source
before insert or update of teacher_space_id, source_type, source_id
on public.activity_assignments
for each row execute function public.validate_activity_assignment_source();

alter table public.activity_assignments enable row level security;

drop policy if exists activity_assignments_teacher_all
on public.activity_assignments;

create policy activity_assignments_teacher_all
on public.activity_assignments
for all
to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = activity_assignments.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = activity_assignments.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.activity_assignments to authenticated;
revoke all on public.activity_assignments from anon;

-- ---------------------------------------------------------
-- 2) Destinataires
-- ---------------------------------------------------------

create table if not exists public.activity_assignment_targets (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.activity_assignments(id) on delete cascade,
  target_type text not null,
  teacher_class_id bigint null references public.teacher_classes(id) on delete cascade,
  student_id bigint null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint activity_assignment_targets_type_check
    check (target_type in ('class', 'student')),
  constraint activity_assignment_targets_shape_check
    check (
      (target_type = 'class' and teacher_class_id is not null and student_id is null)
      or (target_type = 'student' and student_id is not null and teacher_class_id is null)
    )
);

create unique index if not exists activity_assignment_targets_class_unique
on public.activity_assignment_targets (assignment_id, teacher_class_id)
where target_type = 'class';

create unique index if not exists activity_assignment_targets_student_unique
on public.activity_assignment_targets (assignment_id, student_id)
where target_type = 'student';

create index if not exists activity_assignment_targets_assignment_idx
on public.activity_assignment_targets (assignment_id);

create or replace function public.validate_activity_assignment_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id bigint;
begin
  select a.teacher_space_id into v_space_id
  from public.activity_assignments a
  where a.id = new.assignment_id;

  if v_space_id is null then
    raise exception 'Attribution introuvable.' using errcode = '23503';
  end if;

  if new.target_type = 'class' then
    if not exists (
      select 1 from public.teacher_classes tc
      where tc.id = new.teacher_class_id
        and tc.teacher_space_id = v_space_id
    ) then
      raise exception 'Classe incompatible avec cette attribution.' using errcode = '23503';
    end if;
  else
    if not exists (
      select 1
      from public.students s
      join public.teacher_classes tc on tc.id = s.teacher_class_id
      where s.id = new.student_id
        and tc.teacher_space_id = v_space_id
    ) then
      raise exception 'Élève incompatible avec cette attribution.' using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_activity_assignment_target
on public.activity_assignment_targets;

create trigger trg_validate_activity_assignment_target
before insert or update of assignment_id, target_type, teacher_class_id, student_id
on public.activity_assignment_targets
for each row execute function public.validate_activity_assignment_target();

alter table public.activity_assignment_targets enable row level security;

drop policy if exists activity_assignment_targets_teacher_all
on public.activity_assignment_targets;

create policy activity_assignment_targets_teacher_all
on public.activity_assignment_targets
for all
to authenticated
using (
  exists (
    select 1
    from public.activity_assignments a
    join public.teacher_spaces ts on ts.id = a.teacher_space_id
    where a.id = activity_assignment_targets.assignment_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.activity_assignments a
    join public.teacher_spaces ts on ts.id = a.teacher_space_id
    where a.id = activity_assignment_targets.assignment_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.activity_assignment_targets to authenticated;
revoke all on public.activity_assignment_targets from anon;

-- ---------------------------------------------------------
-- 3) Progression minimale indépendante de l'historique
-- ---------------------------------------------------------

create table if not exists public.student_activity_assignment_progress (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.activity_assignments(id) on delete cascade,
  student_id bigint not null references public.students(id) on delete cascade,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint student_activity_assignment_progress_unique
    unique (assignment_id, student_id)
);

create index if not exists student_activity_assignment_progress_student_idx
on public.student_activity_assignment_progress (student_id, completed_at desc);

create index if not exists student_activity_assignment_progress_assignment_idx
on public.student_activity_assignment_progress (assignment_id, student_id);

drop trigger if exists trg_student_activity_assignment_progress_updated_at
on public.student_activity_assignment_progress;

create trigger trg_student_activity_assignment_progress_updated_at
before update on public.student_activity_assignment_progress
for each row execute function public.set_updated_at();

alter table public.student_activity_assignment_progress enable row level security;

drop policy if exists student_activity_assignment_progress_teacher_select
on public.student_activity_assignment_progress;

create policy student_activity_assignment_progress_teacher_select
on public.student_activity_assignment_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.activity_assignments a
    join public.teacher_spaces ts on ts.id = a.teacher_space_id
    where a.id = student_activity_assignment_progress.assignment_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select on public.student_activity_assignment_progress to authenticated;
revoke insert, update, delete on public.student_activity_assignment_progress from anon, authenticated;

-- ---------------------------------------------------------
-- 4) Liste publique des activités attribuées
-- ---------------------------------------------------------

create or replace function public.get_space_activity_assignments(
  p_access_code text,
  p_student_ids bigint[] default '{}'::bigint[],
  p_is_group boolean default false
)
returns table (
  id uuid,
  title text,
  source_type text,
  source_id text,
  difficulty_mode text,
  difficulty_level smallint,
  execution_limit_mode text,
  execution_limit_value integer,
  updated_at timestamptz,
  activity_json jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  with space as (
    select id
    from public.teacher_spaces
    where access_code = upper(trim(p_access_code))
  ), selected_students as (
    select s.id, s.teacher_class_id
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join space sp on sp.id = tc.teacher_space_id
    where s.is_active = true
      and s.id = any(coalesce(p_student_ids, '{}'::bigint[]))
  ), selected_classes as (
    select distinct teacher_class_id from selected_students
  ), selected_individual as (
    select id from selected_students order by id limit 1
  ), candidates as (
    select a.*,
      case
        when a.source_type = 'catalog_activity' then (
          select to_jsonb(ca)
          from public.catalog_activities ca
          where ca.id = a.source_id
            and ca.status = 'published'
        )
        when a.source_type = 'teacher_activity' then (
          select to_jsonb(ta)
          from public.teacher_activities ta
          where ta.id::text = a.source_id
            and ta.teacher_space_id = a.teacher_space_id
        )
        else null
      end as source_json
    from public.activity_assignments a
    join space sp on sp.id = a.teacher_space_id
    where (
      (coalesce(p_is_group, false) = true and exists (
        select 1
        from public.activity_assignment_targets aat
        join selected_classes sc on sc.teacher_class_id = aat.teacher_class_id
        where aat.assignment_id = a.id
          and aat.target_type = 'class'
      ))
      or
      (coalesce(p_is_group, false) = false and exists (
        select 1
        from public.activity_assignment_targets aat
        left join selected_classes sc
          on sc.teacher_class_id = aat.teacher_class_id
         and aat.target_type = 'class'
        left join selected_students ss
          on ss.id = aat.student_id
         and aat.target_type = 'student'
        where aat.assignment_id = a.id
          and (sc.teacher_class_id is not null or ss.id is not null)
      ))
    )
  )
  select
    c.id,
    c.title_snapshot as title,
    c.source_type,
    c.source_id,
    c.difficulty_mode,
    c.difficulty_level,
    c.execution_limit_mode,
    c.execution_limit_value,
    c.updated_at,
    c.source_json as activity_json
  from candidates c
  where c.source_json is not null
    and (
      coalesce(p_is_group, false) = true
      or not exists (
        select 1
        from selected_individual si
        join public.student_activity_assignment_progress saap
          on saap.student_id = si.id
         and saap.assignment_id = c.id
      )
    )
  order by c.created_at desc, lower(c.title_snapshot) asc;
$$;

grant execute on function public.get_space_activity_assignments(text, bigint[], boolean)
to anon, authenticated;

-- ---------------------------------------------------------
-- 5) Fin d'une attribution (individuel uniquement côté UI)
-- ---------------------------------------------------------

create or replace function public.complete_space_activity_assignment(
  p_access_code text,
  p_assignment_id uuid,
  p_student_id bigint,
  p_student_code text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id bigint;
  v_student_class_id bigint;
begin
  if not public.verify_student_code(p_access_code, p_student_id, p_student_code) then
    return false;
  end if;

  select ts.id, s.teacher_class_id
    into v_space_id, v_student_class_id
  from public.teacher_spaces ts
  join public.teacher_classes tc on tc.teacher_space_id = ts.id
  join public.students s on s.teacher_class_id = tc.id
  where ts.access_code = upper(trim(p_access_code))
    and s.id = p_student_id
    and s.is_active = true;

  if v_space_id is null then
    return false;
  end if;

  if not exists (
    select 1
    from public.activity_assignments a
    where a.id = p_assignment_id
      and a.teacher_space_id = v_space_id
      and exists (
        select 1
        from public.activity_assignment_targets aat
        where aat.assignment_id = a.id
          and (
            (aat.target_type = 'student' and aat.student_id = p_student_id)
            or
            (aat.target_type = 'class' and aat.teacher_class_id = v_student_class_id)
          )
      )
  ) then
    return false;
  end if;

  insert into public.student_activity_assignment_progress (
    assignment_id,
    student_id,
    completed_at
  ) values (
    p_assignment_id,
    p_student_id,
    now()
  )
  on conflict (assignment_id, student_id) do update
  set completed_at = excluded.completed_at,
      updated_at = now();

  return true;
end;
$$;

grant execute on function public.complete_space_activity_assignment(text, uuid, bigint, text)
to anon, authenticated;

commit;
