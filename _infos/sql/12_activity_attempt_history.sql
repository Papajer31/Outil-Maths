-- =========================================================
-- PATCH 12 — CONTRAT D’EXÉCUTION + HISTORIQUE DÉTAILLÉ
-- À exécuter APRÈS 11_resource_recordings_folder.sql.
--
-- Ce patch étend student_activity_sessions au lieu de créer
-- un second historique concurrent. Les anciennes lignes sont
-- conservées et considérées comme des tentatives terminées.
-- =========================================================

begin;

create extension if not exists pgcrypto;
grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------
-- 1) Une session devient une tentative d’activité complète
-- ---------------------------------------------------------

alter table public.student_activity_sessions
  add column if not exists client_attempt_id uuid null,
  add column if not exists mission_id uuid null references public.missions(id) on delete set null,
  add column if not exists mission_step_id uuid null references public.mission_steps(id) on delete set null,
  add column if not exists tool_id text not null default '',
  add column if not exists tool_instance_id text not null default '',
  add column if not exists activity_title text not null default '',
  add column if not exists status text not null default 'completed',
  add column if not exists started_at timestamptz null,
  add column if not exists ended_at timestamptz null,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists config_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists progress_applied boolean not null default true;

update public.student_activity_sessions
set started_at = coalesce(started_at, played_at, created_at),
    ended_at = coalesce(ended_at, played_at, created_at),
    status = case
      when status in ('running', 'completed', 'interrupted', 'abandoned') then status
      else 'completed'
    end,
    progress_applied = true
where started_at is null
   or ended_at is null
   or status not in ('running', 'completed', 'interrupted', 'abandoned')
   or progress_applied is distinct from true;

alter table public.student_activity_sessions
  alter column started_at set default now();

alter table public.student_activity_sessions
  alter column started_at set not null;

alter table public.student_activity_sessions
  drop constraint if exists student_activity_sessions_context_check;

update public.student_activity_sessions
set context = 'adventure'
where lower(context) = 'aventure';

alter table public.student_activity_sessions
  add constraint student_activity_sessions_context_check
  check (context in ('exploration', 'mission', 'adventure'));

alter table public.student_activity_sessions
  drop constraint if exists student_activity_sessions_status_check;

alter table public.student_activity_sessions
  add constraint student_activity_sessions_status_check
  check (status in ('running', 'completed', 'interrupted', 'abandoned'));

drop index if exists public.student_activity_sessions_client_attempt_uidx;
create unique index student_activity_sessions_client_attempt_uidx
on public.student_activity_sessions (student_id, client_attempt_id)
where client_attempt_id is not null;

create index if not exists student_activity_sessions_status_idx
on public.student_activity_sessions (student_id, status, started_at desc);

create index if not exists student_activity_sessions_context_idx
on public.student_activity_sessions (context, played_at desc);

-- ---------------------------------------------------------
-- 2) Détail d’une tentative : une ligne par question
-- ---------------------------------------------------------

create table if not exists public.student_activity_session_questions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.student_activity_sessions(id) on delete cascade,
  question_index integer not null,
  tool_id text not null default '',
  tool_instance_id text not null default '',
  level_presented integer not null default 3,
  level_after integer not null default 3,
  outcome text not null default 'unanswered',
  is_correct boolean null,
  points_awarded integer not null default 0,
  duration_ms integer not null default 0,
  question_snapshot jsonb not null default '{}'::jsonb,
  answer_snapshot jsonb not null default '{}'::jsonb,
  correction_snapshot jsonb not null default '{}'::jsonb,
  answered_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint student_activity_session_questions_unique unique (session_id, question_index),
  constraint student_activity_session_questions_index_check check (question_index >= 0),
  constraint student_activity_session_questions_levels_check check (
    level_presented between 1 and 5 and level_after between 1 and 5
  ),
  constraint student_activity_session_questions_outcome_check check (
    outcome in ('correct', 'incorrect', 'unanswered')
  ),
  constraint student_activity_session_questions_values_check check (
    points_awarded >= 0 and duration_ms >= 0
  )
);

alter table public.student_activity_session_questions
  add column if not exists tool_id text not null default '',
  add column if not exists tool_instance_id text not null default '';

create index if not exists student_activity_session_questions_session_idx
on public.student_activity_session_questions (session_id, question_index);

alter table public.student_activity_session_questions enable row level security;

drop policy if exists student_activity_session_questions_select_own on public.student_activity_session_questions;
create policy student_activity_session_questions_select_own
on public.student_activity_session_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.student_activity_sessions sas
    join public.students s on s.id = sas.student_id
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where sas.id = student_activity_session_questions.session_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select on public.student_activity_session_questions to authenticated;

-- ---------------------------------------------------------
-- 3) Helpers privés
-- ---------------------------------------------------------

create or replace function public.resolve_history_student(
  p_access_code text,
  p_student_id bigint,
  p_student_code text
)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select s.id
  from public.teacher_spaces ts
  join public.teacher_classes tc on tc.teacher_space_id = ts.id
  join public.students s on s.teacher_class_id = tc.id
  where ts.access_code = upper(btrim(coalesce(p_access_code, '')))
    and s.id = p_student_id
    and s.is_active = true
    and s.student_code = upper(btrim(coalesce(p_student_code, '')))
  limit 1;
$$;

revoke all on function public.resolve_history_student(text, bigint, text) from public, anon, authenticated;

create or replace function public.apply_activity_attempt_progress(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.student_activity_sessions%rowtype;
begin
  select * into v_run
  from public.student_activity_sessions
  where id = p_session_id
  for update;

  if not found or v_run.progress_applied = true then
    return;
  end if;

  if v_run.context = 'exploration' and v_run.questions_count > 0 then
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
      v_run.student_id,
      v_run.catalog_activity_id,
      v_run.ended_level,
      1,
      v_run.questions_count,
      v_run.correct_count,
      v_run.wrong_count,
      coalesce(v_run.ended_at, now())
    )
    on conflict (student_id, catalog_activity_id) do update
    set current_level = excluded.current_level,
        total_sessions = public.student_activity_progress.total_sessions + 1,
        total_questions = public.student_activity_progress.total_questions + excluded.total_questions,
        total_correct = public.student_activity_progress.total_correct + excluded.total_correct,
        total_wrong = public.student_activity_progress.total_wrong + excluded.total_wrong,
        last_played_at = excluded.last_played_at,
        updated_at = now();
  end if;

  update public.student_activity_sessions
  set progress_applied = true
  where id = p_session_id;
end;
$$;

revoke all on function public.apply_activity_attempt_progress(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 4) Ouvrir une tentative
-- ---------------------------------------------------------

create or replace function public.start_student_activity_attempt(
  p_access_code text,
  p_student_id bigint,
  p_student_code text,
  p_catalog_activity_id text,
  p_context text,
  p_mission_id uuid,
  p_mission_step_id uuid,
  p_client_attempt_id uuid,
  p_tool_id text,
  p_tool_instance_id text,
  p_activity_title text,
  p_started_level integer,
  p_metadata_json jsonb,
  p_config_snapshot jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id bigint;
  v_teacher_space_id bigint;
  v_teacher_class_id bigint;
  v_activity_id text := btrim(coalesce(p_catalog_activity_id, ''));
  v_context text := lower(btrim(coalesce(p_context, 'exploration')));
  v_level integer := greatest(1, least(5, coalesce(p_started_level, 3)));
  v_mission_id uuid := p_mission_id;
  v_mission_step_id uuid := p_mission_step_id;
  v_existing_id uuid;
  v_stale record;
  v_attempt_id uuid;
begin
  if v_context = 'aventure' then
    v_context := 'adventure';
  end if;
  if v_context not in ('exploration', 'mission', 'adventure') then
    raise exception 'Contexte d''historique invalide.' using errcode = '22023';
  end if;

  v_student_id := public.resolve_history_student(p_access_code, p_student_id, p_student_code);
  if v_student_id is null then
    raise exception 'Code élève invalide.' using errcode = '28000';
  end if;

  select ts.id, tc.id
  into v_teacher_space_id, v_teacher_class_id
  from public.students s
  join public.teacher_classes tc on tc.id = s.teacher_class_id
  join public.teacher_spaces ts on ts.id = tc.teacher_space_id
  where s.id = v_student_id;

  if not exists (
    select 1
    from public.catalog_activities ca
    where ca.id = v_activity_id
      and ca.status = 'published'
  ) then
    raise exception 'Activité de catalogue introuvable.' using errcode = '22023';
  end if;

  if v_context = 'mission' then
    if v_mission_id is null or v_mission_step_id is null then
      raise exception 'Mission ou étape de Mission manquante.' using errcode = '22023';
    end if;

    if not exists (
      select 1
      from public.missions m
      join public.mission_steps ms
        on ms.mission_id = m.id
       and ms.id = v_mission_step_id
      where m.id = v_mission_id
        and m.teacher_space_id = v_teacher_space_id
        and m.status = 'active'
        and ms.catalog_activity_id = v_activity_id
        and exists (
          select 1
          from public.mission_assignments ma
          where ma.mission_id = m.id
            and (
              (ma.target_type = 'student' and ma.student_id = v_student_id)
              or
              (ma.target_type = 'class' and ma.teacher_class_id = v_teacher_class_id)
            )
        )
    ) then
      raise exception 'Cette étape de Mission n’est pas attribuée à cet élève.' using errcode = '28000';
    end if;
  else
    v_mission_id := null;
    v_mission_step_id := null;
  end if;

  if jsonb_typeof(coalesce(p_metadata_json, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_metadata_json, '{}'::jsonb)::text) > 98304 then
    raise exception 'Métadonnées d’historique invalides ou trop volumineuses.' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_config_snapshot, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_config_snapshot, '{}'::jsonb)::text) > 98304 then
    raise exception 'Configuration d’historique invalide ou trop volumineuse.' using errcode = '22023';
  end if;

  if p_client_attempt_id is not null then
    select id into v_existing_id
    from public.student_activity_sessions
    where client_attempt_id = p_client_attempt_id
      and student_id = v_student_id
    limit 1;

    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  for v_stale in
    update public.student_activity_sessions
    set status = 'interrupted',
        ended_at = now(),
        duration_ms = greatest(
          duration_ms,
          least(2147483647::numeric, floor(extract(epoch from (now() - started_at)) * 1000))::integer
        )
    where student_id = v_student_id
      and status = 'running'
    returning id
  loop
    perform public.apply_activity_attempt_progress(v_stale.id);
  end loop;

  insert into public.student_activity_sessions (
    student_id,
    catalog_activity_id,
    context,
    mission_id,
    mission_step_id,
    client_attempt_id,
    tool_id,
    tool_instance_id,
    activity_title,
    status,
    started_level,
    ended_level,
    questions_count,
    correct_count,
    wrong_count,
    duration_ms,
    played_at,
    started_at,
    ended_at,
    metadata_json,
    config_snapshot,
    progress_applied
  ) values (
    v_student_id,
    v_activity_id,
    v_context,
    v_mission_id,
    v_mission_step_id,
    p_client_attempt_id,
    left(btrim(coalesce(p_tool_id, '')), 200),
    left(btrim(coalesce(p_tool_instance_id, '')), 200),
    left(btrim(coalesce(p_activity_title, '')), 500),
    'running',
    v_level,
    v_level,
    0,
    0,
    0,
    0,
    now(),
    now(),
    null,
    coalesce(p_metadata_json, '{}'::jsonb),
    coalesce(p_config_snapshot, '{}'::jsonb),
    false
  )
  returning id into v_attempt_id;

  return v_attempt_id;
end;
$$;

-- ---------------------------------------------------------
-- 5) Enregistrer une question immédiatement
-- ---------------------------------------------------------

create or replace function public.record_student_activity_attempt_question(
  p_access_code text,
  p_student_id bigint,
  p_student_code text,
  p_attempt_id uuid,
  p_question_index integer,
  p_tool_id text,
  p_tool_instance_id text,
  p_level_presented integer,
  p_level_after integer,
  p_outcome text,
  p_points_awarded integer,
  p_duration_ms integer,
  p_question_snapshot jsonb,
  p_answer_snapshot jsonb,
  p_correction_snapshot jsonb
)
returns table (
  attempt_id uuid,
  ended_level integer,
  questions_count integer,
  correct_count integer,
  wrong_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id bigint;
  v_run public.student_activity_sessions%rowtype;
  v_outcome text := lower(btrim(coalesce(p_outcome, 'unanswered')));
  v_level_presented integer := greatest(1, least(5, coalesce(p_level_presented, 3)));
  v_level_after integer := greatest(1, least(5, coalesce(p_level_after, v_level_presented)));
begin
  v_student_id := public.resolve_history_student(p_access_code, p_student_id, p_student_code);
  if v_student_id is null then
    raise exception 'Code élève invalide.' using errcode = '28000';
  end if;

  if v_outcome not in ('correct', 'incorrect', 'unanswered') then
    v_outcome := 'unanswered';
  end if;

  if greatest(0, coalesce(p_question_index, 0)) > 100000 then
    raise exception 'Index de question invalide.' using errcode = '22023';
  end if;

  if greatest(0, coalesce(p_points_awarded, 0)) > 10000 then
    raise exception 'Nombre de points invalide.' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_question_snapshot, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_question_snapshot, '{}'::jsonb)::text) > 98304
     or jsonb_typeof(coalesce(p_answer_snapshot, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_answer_snapshot, '{}'::jsonb)::text) > 98304
     or jsonb_typeof(coalesce(p_correction_snapshot, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_correction_snapshot, '{}'::jsonb)::text) > 98304 then
    raise exception 'Instantané de question invalide ou trop volumineux.' using errcode = '22023';
  end if;

  select * into v_run
  from public.student_activity_sessions
  where id = p_attempt_id
    and student_id = v_student_id
  for update;

  if not found then
    raise exception 'Tentative introuvable.' using errcode = '22023';
  end if;

  if v_run.status <> 'running' then
    raise exception 'Cette tentative est déjà terminée.' using errcode = '22023';
  end if;

  insert into public.student_activity_session_questions (
    session_id,
    question_index,
    tool_id,
    tool_instance_id,
    level_presented,
    level_after,
    outcome,
    is_correct,
    points_awarded,
    duration_ms,
    question_snapshot,
    answer_snapshot,
    correction_snapshot,
    answered_at,
    updated_at
  ) values (
    p_attempt_id,
    greatest(0, coalesce(p_question_index, 0)),
    left(btrim(coalesce(p_tool_id, '')), 200),
    left(btrim(coalesce(p_tool_instance_id, '')), 200),
    v_level_presented,
    v_level_after,
    v_outcome,
    case when v_outcome = 'correct' then true when v_outcome = 'incorrect' then false else null end,
    greatest(0, coalesce(p_points_awarded, 0)),
    greatest(0, coalesce(p_duration_ms, 0)),
    coalesce(p_question_snapshot, '{}'::jsonb),
    coalesce(p_answer_snapshot, '{}'::jsonb),
    coalesce(p_correction_snapshot, '{}'::jsonb),
    now(),
    now()
  )
  on conflict (session_id, question_index) do update
  set tool_id = excluded.tool_id,
      tool_instance_id = excluded.tool_instance_id,
      level_presented = excluded.level_presented,
      level_after = excluded.level_after,
      outcome = excluded.outcome,
      is_correct = excluded.is_correct,
      points_awarded = excluded.points_awarded,
      duration_ms = excluded.duration_ms,
      question_snapshot = excluded.question_snapshot,
      answer_snapshot = excluded.answer_snapshot,
      correction_snapshot = excluded.correction_snapshot,
      answered_at = excluded.answered_at,
      updated_at = now();

  update public.student_activity_sessions sas
  set ended_level = v_level_after,
      questions_count = stats.questions_count,
      correct_count = stats.correct_count,
      wrong_count = stats.wrong_count,
      duration_ms = greatest(
        sas.duration_ms,
        least(2147483647::numeric, floor(extract(epoch from (now() - sas.started_at)) * 1000))::integer
      )
  from (
    select
      count(*) filter (where q.outcome in ('correct', 'incorrect'))::integer as questions_count,
      count(*) filter (where q.outcome = 'correct')::integer as correct_count,
      count(*) filter (where q.outcome = 'incorrect')::integer as wrong_count
    from public.student_activity_session_questions q
    where q.session_id = p_attempt_id
  ) stats
  where sas.id = p_attempt_id;

  -- Sauvegarde immédiate du niveau d’Exploration, y compris si la
  -- dernière question est ratée puis que le navigateur est fermé.
  if v_run.context = 'exploration' and v_outcome in ('correct', 'incorrect') then
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
      v_run.catalog_activity_id,
      v_level_after,
      0, 0, 0, 0,
      now()
    )
    on conflict (student_id, catalog_activity_id) do update
    set current_level = excluded.current_level,
        last_played_at = excluded.last_played_at,
        updated_at = now();
  end if;

  return query
  select
    sas.id,
    sas.ended_level,
    sas.questions_count,
    sas.correct_count,
    sas.wrong_count
  from public.student_activity_sessions sas
  where sas.id = p_attempt_id;
end;
$$;

-- ---------------------------------------------------------
-- 6) Finaliser une tentative
-- ---------------------------------------------------------

create or replace function public.finish_student_activity_attempt(
  p_access_code text,
  p_student_id bigint,
  p_student_code text,
  p_attempt_id uuid,
  p_status text,
  p_ended_level integer,
  p_duration_ms integer
)
returns table (
  attempt_id uuid,
  status text,
  ended_level integer,
  questions_count integer,
  correct_count integer,
  wrong_count integer,
  duration_ms integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id bigint;
  v_status text := lower(btrim(coalesce(p_status, 'interrupted')));
  v_level integer := greatest(1, least(5, coalesce(p_ended_level, 3)));
begin
  v_student_id := public.resolve_history_student(p_access_code, p_student_id, p_student_code);
  if v_student_id is null then
    raise exception 'Code élève invalide.' using errcode = '28000';
  end if;

  if v_status not in ('completed', 'interrupted', 'abandoned') then
    v_status := 'interrupted';
  end if;

  update public.student_activity_sessions as sas
  set status = case when sas.status = 'running' then v_status else sas.status end,
      ended_level = case when sas.status = 'running' then v_level else sas.ended_level end,
      ended_at = case when sas.status = 'running' then coalesce(sas.ended_at, now()) else sas.ended_at end,
      duration_ms = case
        when sas.status = 'running' then greatest(sas.duration_ms, greatest(0, coalesce(p_duration_ms, 0)))
        else sas.duration_ms
      end
  where sas.id = p_attempt_id
    and sas.student_id = v_student_id;

  if not found then
    raise exception 'Tentative introuvable.' using errcode = '22023';
  end if;

  perform public.apply_activity_attempt_progress(p_attempt_id);

  return query
  select
    sas.id,
    sas.status,
    sas.ended_level,
    sas.questions_count,
    sas.correct_count,
    sas.wrong_count,
    sas.duration_ms
  from public.student_activity_sessions sas
  where sas.id = p_attempt_id;
end;
$$;

-- ---------------------------------------------------------
-- 7) Compatibilité de déploiement de l’ancien résumé léger
-- ---------------------------------------------------------
-- Cette RPC n’est plus utilisée par le nouveau client, mais elle peut encore
-- être appelée brièvement par un onglet déjà ouvert lors du déploiement.
-- Elle écrit une tentative terminée et normalise « aventure » en « adventure ».

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
  if v_context = 'aventure' then
    v_context := 'adventure';
  end if;
  if v_context not in ('exploration', 'mission', 'adventure') then
    v_context := 'exploration';
  end if;

  if v_correct > v_questions then
    v_correct := v_questions;
  end if;
  if v_wrong <= 0 then
    v_wrong := greatest(0, v_questions - v_correct);
  end if;

  v_student_id := public.resolve_history_student(p_access_code, p_student_id, p_student_code);
  if v_student_id is null then
    raise exception 'Code élève invalide.' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.catalog_activities ca
    where ca.id = v_activity_id
      and ca.status = 'published'
  ) then
    raise exception 'Activité de catalogue introuvable.' using errcode = '22023';
  end if;

  insert into public.student_activity_sessions (
    student_id,
    catalog_activity_id,
    context,
    status,
    started_level,
    ended_level,
    questions_count,
    correct_count,
    wrong_count,
    duration_ms,
    played_at,
    started_at,
    ended_at,
    progress_applied
  ) values (
    v_student_id,
    v_activity_id,
    v_context,
    'completed',
    v_started_level,
    v_ended_level,
    v_questions,
    v_correct,
    v_wrong,
    v_duration,
    now(),
    now() - make_interval(secs => v_duration::double precision / 1000.0),
    now(),
    true
  );

  if v_context = 'exploration' then
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
  end if;

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

revoke all on function public.start_student_activity_attempt(text, bigint, text, text, text, uuid, uuid, uuid, text, text, text, integer, jsonb, jsonb) from public;
revoke all on function public.record_student_activity_attempt_question(text, bigint, text, uuid, integer, text, text, integer, integer, text, integer, integer, jsonb, jsonb, jsonb) from public;
revoke all on function public.finish_student_activity_attempt(text, bigint, text, uuid, text, integer, integer) from public;
revoke all on function public.record_student_activity_session(text, bigint, text, text, text, integer, integer, integer, integer, integer, integer) from public;

grant execute on function public.start_student_activity_attempt(text, bigint, text, text, text, uuid, uuid, uuid, text, text, text, integer, jsonb, jsonb) to anon, authenticated;
grant execute on function public.record_student_activity_attempt_question(text, bigint, text, uuid, integer, text, text, integer, integer, text, integer, integer, jsonb, jsonb, jsonb) to anon, authenticated;
grant execute on function public.finish_student_activity_attempt(text, bigint, text, uuid, text, integer, integer) to anon, authenticated;
grant execute on function public.record_student_activity_session(text, bigint, text, text, text, integer, integer, integer, integer, integer, integer) to anon, authenticated;

commit;
