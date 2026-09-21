-- =========================================================
-- PATCH 50 — SÉQUENCES D’ACTIVITÉS
-- À exécuter APRÈS 49_activity_assignments.sql.
--
-- Une séquence est une liste ordonnée d’activités (catalogue ou personnelles)
-- enregistrée côté enseignant puis attribuable comme une Mission côté élève.
-- =========================================================

begin;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------
-- 1) Séquences et étapes
-- ---------------------------------------------------------

create table if not exists public.teacher_sequences (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  title text not null,
  title_normalized text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_sequences_title_not_blank check (btrim(title) <> ''),
  constraint teacher_sequences_title_normalized_not_blank check (btrim(title_normalized) <> '')
);

create index if not exists teacher_sequences_space_title_idx
on public.teacher_sequences (teacher_space_id, title_normalized, created_at desc);

drop trigger if exists trg_teacher_sequences_updated_at on public.teacher_sequences;
create trigger trg_teacher_sequences_updated_at
before update on public.teacher_sequences
for each row execute function public.set_updated_at();

create table if not exists public.teacher_sequence_items (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.teacher_sequences(id) on delete cascade,
  position integer not null default 0,
  source_type text not null,
  source_id text not null,
  title_snapshot text not null,
  difficulty_mode text not null default 'fixed',
  difficulty_level smallint null,
  execution_limit_mode text not null default 'questions',
  execution_limit_value integer null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_sequence_items_position_check check (position >= 0),
  constraint teacher_sequence_items_source_type_check check (source_type in ('catalog_activity', 'teacher_activity')),
  constraint teacher_sequence_items_source_id_not_blank check (btrim(source_id) <> ''),
  constraint teacher_sequence_items_title_not_blank check (btrim(title_snapshot) <> ''),
  constraint teacher_sequence_items_difficulty_mode_check check (difficulty_mode in ('adaptive', 'fixed')),
  constraint teacher_sequence_items_difficulty_level_check check (difficulty_level is null or difficulty_level between 1 and 5),
  constraint teacher_sequence_items_difficulty_shape_check check (
    (difficulty_mode = 'adaptive' and difficulty_level is null)
    or (difficulty_mode = 'fixed' and difficulty_level between 1 and 5)
  ),
  constraint teacher_sequence_items_execution_mode_check check (execution_limit_mode in ('questions', 'time', 'intrinsic')),
  constraint teacher_sequence_items_execution_value_check check (
    (execution_limit_mode = 'intrinsic' and execution_limit_value is null)
    or (execution_limit_mode in ('questions', 'time') and execution_limit_value is not null and execution_limit_value > 0)
  )
);

create index if not exists teacher_sequence_items_sequence_position_idx
on public.teacher_sequence_items (sequence_id, position, created_at);

create index if not exists teacher_sequence_items_source_idx
on public.teacher_sequence_items (source_type, source_id);

drop trigger if exists trg_teacher_sequence_items_updated_at on public.teacher_sequence_items;
create trigger trg_teacher_sequence_items_updated_at
before update on public.teacher_sequence_items
for each row execute function public.set_updated_at();

create or replace function public.validate_teacher_sequence_item_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_space_id bigint;
begin
  select ts.teacher_space_id into v_space_id
  from public.teacher_sequences ts
  where ts.id = new.sequence_id;

  if v_space_id is null then
    raise exception 'Séquence introuvable.' using errcode = '23503';
  end if;

  if new.source_type = 'teacher_activity' then
    if not exists (
      select 1 from public.teacher_activities ta
      where ta.id::text = new.source_id
        and ta.teacher_space_id = v_space_id
    ) then
      raise exception 'Activité personnelle introuvable pour cette séquence.' using errcode = '23503';
    end if;
  elsif new.source_type = 'catalog_activity' then
    if not exists (
      select 1 from public.catalog_activities ca
      where ca.id = new.source_id
        and ca.status = 'published'
    ) then
      raise exception 'Activité du catalogue introuvable ou non publiée.' using errcode = '23503';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_teacher_sequence_item_source on public.teacher_sequence_items;
create trigger trg_validate_teacher_sequence_item_source
before insert or update of sequence_id, source_type, source_id
on public.teacher_sequence_items
for each row execute function public.validate_teacher_sequence_item_source();

alter table public.teacher_sequences enable row level security;
alter table public.teacher_sequence_items enable row level security;

drop policy if exists teacher_sequences_owner_all on public.teacher_sequences;
create policy teacher_sequences_owner_all
on public.teacher_sequences
for all
to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = teacher_sequences.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = teacher_sequences.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

drop policy if exists teacher_sequence_items_owner_all on public.teacher_sequence_items;
create policy teacher_sequence_items_owner_all
on public.teacher_sequence_items
for all
to authenticated
using (
  exists (
    select 1
    from public.teacher_sequences seq
    join public.teacher_spaces ts on ts.id = seq.teacher_space_id
    where seq.id = teacher_sequence_items.sequence_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.teacher_sequences seq
    join public.teacher_spaces ts on ts.id = seq.teacher_space_id
    where seq.id = teacher_sequence_items.sequence_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.teacher_sequences to authenticated;
grant select, insert, update, delete on public.teacher_sequence_items to authenticated;
revoke all on public.teacher_sequences from anon;
revoke all on public.teacher_sequence_items from anon;

-- ---------------------------------------------------------
-- 2) Les attributions peuvent désormais viser une séquence
-- ---------------------------------------------------------

alter table public.activity_assignments
  drop constraint if exists activity_assignments_source_type_check;

alter table public.activity_assignments
  add constraint activity_assignments_source_type_check
  check (source_type in ('catalog_activity', 'teacher_activity', 'sequence'));

create or replace function public.validate_activity_assignment_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_type = 'teacher_activity' then
    if not exists (
      select 1 from public.teacher_activities ta
      where ta.id::text = new.source_id
        and ta.teacher_space_id = new.teacher_space_id
    ) then
      raise exception 'Activité personnelle introuvable pour cet espace.' using errcode = '23503';
    end if;
  elsif new.source_type = 'catalog_activity' then
    if not exists (
      select 1 from public.catalog_activities ca
      where ca.id = new.source_id
        and ca.status = 'published'
    ) then
      raise exception 'Activité du catalogue introuvable ou non publiée.' using errcode = '23503';
    end if;
  elsif new.source_type = 'sequence' then
    if not exists (
      select 1 from public.teacher_sequences seq
      where seq.id::text = new.source_id
        and seq.teacher_space_id = new.teacher_space_id
    ) then
      raise exception 'Séquence introuvable pour cet espace.' using errcode = '23503';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------
-- 3) Vue publique agrégée : activité seule OU séquence
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
        when a.source_type = 'sequence' then (
          select jsonb_build_object(
            'id', seq.id,
            'title', seq.title,
            'items', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', item.id,
                  'position', item.position,
                  'source_type', item.source_type,
                  'source_id', item.source_id,
                  'title_snapshot', item.title_snapshot,
                  'difficulty_mode', item.difficulty_mode,
                  'difficulty_level', item.difficulty_level,
                  'execution_limit_mode', item.execution_limit_mode,
                  'execution_limit_value', item.execution_limit_value,
                  'activity_json', case
                    when item.source_type = 'catalog_activity' then (
                      select to_jsonb(ca)
                      from public.catalog_activities ca
                      where ca.id = item.source_id
                        and ca.status = 'published'
                    )
                    when item.source_type = 'teacher_activity' then (
                      select to_jsonb(ta)
                      from public.teacher_activities ta
                      where ta.id::text = item.source_id
                        and ta.teacher_space_id = seq.teacher_space_id
                    )
                    else null
                  end
                ) order by item.position, item.created_at
              )
              from public.teacher_sequence_items item
              where item.sequence_id = seq.id
            ), '[]'::jsonb)
          )
          from public.teacher_sequences seq
          where seq.id::text = a.source_id
            and seq.teacher_space_id = a.teacher_space_id
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

commit;
