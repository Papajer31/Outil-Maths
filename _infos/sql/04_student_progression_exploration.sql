-- =========================================================
-- PATCH 04 — PROGRESSION ÉLÈVE + EXPLORATION ADAPTATIVE MVP
-- À exécuter dans le projet Supabase v2 APRÈS 03_superadmin_catalogue.sql.
-- =========================================================

begin;

grant usage on schema public to anon, authenticated;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- 1) Progression actuelle : une ligne par élève et activité
-- ---------------------------------------------------------

create table if not exists public.student_activity_progress (
  id uuid primary key default gen_random_uuid(),
  student_id bigint not null references public.students(id) on delete cascade,
  catalog_activity_id text not null references public.catalog_activities(id) on delete cascade,
  current_level integer not null default 3,
  total_sessions integer not null default 0,
  total_questions integer not null default 0,
  total_correct integer not null default 0,
  total_wrong integer not null default 0,
  last_played_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint student_activity_progress_unique unique (student_id, catalog_activity_id),
  constraint student_activity_progress_level_check check (current_level between 1 and 5),
  constraint student_activity_progress_counters_check check (
    total_sessions >= 0 and total_questions >= 0 and total_correct >= 0 and total_wrong >= 0
  )
);

create index if not exists student_activity_progress_student_idx
on public.student_activity_progress (student_id, catalog_activity_id);

create index if not exists student_activity_progress_activity_idx
on public.student_activity_progress (catalog_activity_id, current_level);

drop trigger if exists trg_student_activity_progress_updated_at on public.student_activity_progress;
create trigger trg_student_activity_progress_updated_at
before update on public.student_activity_progress
for each row execute function public.set_updated_at();

alter table public.student_activity_progress enable row level security;

-- Lecture enseignant propriétaire ; écriture directe réservée aux RPC publiques ci-dessous.
drop policy if exists student_activity_progress_select_own on public.student_activity_progress;
create policy student_activity_progress_select_own
on public.student_activity_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where s.id = student_activity_progress.student_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select on public.student_activity_progress to authenticated;

-- ---------------------------------------------------------
-- 2) Historique léger : une ligne par lancement d'activité
-- ---------------------------------------------------------

create table if not exists public.student_activity_sessions (
  id uuid primary key default gen_random_uuid(),
  student_id bigint not null references public.students(id) on delete cascade,
  catalog_activity_id text not null references public.catalog_activities(id) on delete cascade,
  context text not null default 'exploration',
  started_level integer not null default 3,
  ended_level integer not null default 3,
  questions_count integer not null default 0,
  correct_count integer not null default 0,
  wrong_count integer not null default 0,
  duration_ms integer not null default 0,
  played_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint student_activity_sessions_context_check check (context in ('exploration', 'mission', 'aventure')),
  constraint student_activity_sessions_levels_check check (started_level between 1 and 5 and ended_level between 1 and 5),
  constraint student_activity_sessions_counters_check check (
    questions_count >= 0 and correct_count >= 0 and wrong_count >= 0 and duration_ms >= 0
  )
);

create index if not exists student_activity_sessions_student_played_idx
on public.student_activity_sessions (student_id, played_at desc);

create index if not exists student_activity_sessions_activity_played_idx
on public.student_activity_sessions (catalog_activity_id, played_at desc);

alter table public.student_activity_sessions enable row level security;

drop policy if exists student_activity_sessions_select_own on public.student_activity_sessions;
create policy student_activity_sessions_select_own
on public.student_activity_sessions
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where s.id = student_activity_sessions.student_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select on public.student_activity_sessions to authenticated;

-- ---------------------------------------------------------
-- 3) RPC publiques avec code classe + code élève
-- ---------------------------------------------------------

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
    coalesce(sap.current_level, 3)::integer as current_level,
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

create or replace function public.record_student_activity_session(
  p_access_code text,
  p_student_id bigint,
  p_student_code text,
  p_catalog_activity_id text,
  p_context text,
  p_started_level integer,
  p_ended_level integer,
  p_questions_count integer,
  p_correct_count integer,
  p_wrong_count integer,
  p_duration_ms integer
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
security definer
set search_path = public
as $$
declare
  v_student_id bigint;
  v_activity_id text := btrim(coalesce(p_catalog_activity_id, ''));
  v_context text := lower(btrim(coalesce(p_context, 'exploration')));
  v_started_level integer := greatest(1, least(5, coalesce(p_started_level, 3)));
  v_ended_level integer := greatest(1, least(5, coalesce(p_ended_level, 3)));
  v_questions integer := greatest(0, coalesce(p_questions_count, 0));
  v_correct integer := greatest(0, coalesce(p_correct_count, 0));
  v_wrong integer := greatest(0, coalesce(p_wrong_count, 0));
  v_duration integer := greatest(0, coalesce(p_duration_ms, 0));
begin
  if v_context not in ('exploration', 'mission', 'aventure') then
    v_context := 'exploration';
  end if;

  if v_correct > v_questions then
    v_correct := v_questions;
  end if;

  if v_wrong <= 0 then
    v_wrong := greatest(0, v_questions - v_correct);
  end if;

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
    raise exception 'Code élève invalide.' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.catalog_activities ca
    where ca.id = v_activity_id
      and ca.status = 'published'
  ) then
    raise exception 'Activité de catalogue introuvable.' using errcode = '22023';
  end if;

  insert into public.student_activity_sessions (
    student_id,
    catalog_activity_id,
    context,
    started_level,
    ended_level,
    questions_count,
    correct_count,
    wrong_count,
    duration_ms
  ) values (
    v_student_id,
    v_activity_id,
    v_context,
    v_started_level,
    v_ended_level,
    v_questions,
    v_correct,
    v_wrong,
    v_duration
  );

  insert into public.student_activity_progress (
    student_id,
    catalog_activity_id,
    current_level,
    total_sessions,
    total_questions,
    total_correct,
    total_wrong,
    last_played_at
  ) values (
    v_student_id,
    v_activity_id,
    v_ended_level,
    1,
    v_questions,
    v_correct,
    v_wrong,
    now()
  )
  on conflict (student_id, catalog_activity_id) do update
  set current_level = excluded.current_level,
      total_sessions = public.student_activity_progress.total_sessions + 1,
      total_questions = public.student_activity_progress.total_questions + excluded.total_questions,
      total_correct = public.student_activity_progress.total_correct + excluded.total_correct,
      total_wrong = public.student_activity_progress.total_wrong + excluded.total_wrong,
      last_played_at = now(),
      updated_at = now();

  return query
  select
    sap.student_id,
    sap.catalog_activity_id,
    sap.current_level,
    sap.total_sessions,
    sap.total_questions,
    sap.total_correct,
    sap.total_wrong,
    sap.last_played_at
  from public.student_activity_progress sap
  where sap.student_id = v_student_id
    and sap.catalog_activity_id = v_activity_id;
end;
$$;

grant execute on function public.get_student_activity_progress(text, bigint, text, text) to anon, authenticated;
grant execute on function public.record_student_activity_session(text, bigint, text, text, text, integer, integer, integer, integer, integer, integer) to anon, authenticated;

commit;
