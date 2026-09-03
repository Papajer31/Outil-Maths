-- =========================================================
-- PATCH 34 — PROGRESSION INDIVIDUELLE DES MISSIONS
-- À exécuter APRÈS 33_student_activity_history_delete.sql.
--
-- Objectifs :
-- - mémoriser chaque étape de Mission terminée par élève ;
-- - reprendre une Mission à la première étape non terminée ;
-- - ne plus proposer une Mission entièrement terminée ;
-- - conserver cette progression même si l'historique détaillé est supprimé.
--
-- La progression Missions reste distincte :
-- - de student_activity_sessions (historique supprimable),
-- - de student_activity_progress (progression Exploration),
-- - des jauges Aventure.
-- =========================================================

begin;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------
-- 1) Une ligne persistante par étape de Mission terminée
-- ---------------------------------------------------------

create table if not exists public.student_mission_step_progress (
  id uuid primary key default gen_random_uuid(),
  student_id bigint not null references public.students(id) on delete cascade,
  mission_id uuid not null references public.missions(id) on delete cascade,
  mission_step_id uuid not null references public.mission_steps(id) on delete cascade,
  completed_at timestamptz not null default now(),
  last_attempt_id uuid null references public.student_activity_sessions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint student_mission_step_progress_unique unique (student_id, mission_step_id)
);

create index if not exists student_mission_step_progress_student_mission_idx
on public.student_mission_step_progress (student_id, mission_id, completed_at);

create index if not exists student_mission_step_progress_mission_idx
on public.student_mission_step_progress (mission_id, student_id);

drop trigger if exists trg_student_mission_step_progress_updated_at
on public.student_mission_step_progress;

create trigger trg_student_mission_step_progress_updated_at
before update on public.student_mission_step_progress
for each row execute function public.set_updated_at();

alter table public.student_mission_step_progress enable row level security;

drop policy if exists student_mission_step_progress_select_own
on public.student_mission_step_progress;

create policy student_mission_step_progress_select_own
on public.student_mission_step_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where s.id = student_mission_step_progress.student_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select on public.student_mission_step_progress to authenticated;
revoke insert, update, delete on public.student_mission_step_progress from anon, authenticated;

-- ---------------------------------------------------------
-- 2) Progression appliquée à la finalisation d'une tentative
-- ---------------------------------------------------------
-- On reprend exactement le comportement du patch 31 pour
-- Exploration + Aventure, en ajoutant uniquement la branche Mission.

create or replace function public.apply_activity_attempt_progress(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.student_activity_sessions%rowtype;
  v_passage public.student_adventure_passages%rowtype;
  v_grade_folder_id text;
  v_adventure_tier integer;
  v_required_count integer := 0;
  v_required_completed integer := 0;
begin
  select * into v_run
  from public.student_activity_sessions
  where id = p_session_id
  for update;

  if not found or v_run.progress_applied = true then
    return;
  end if;

  -- Exploration : comportement historique inchangé.
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

  -- Mission : une étape terminée est mémorisée indépendamment de l'historique.
  if v_run.context = 'mission'
     and v_run.status = 'completed'
     and v_run.mission_id is not null
     and v_run.mission_step_id is not null
     and exists (
       select 1
       from public.mission_steps ms
       where ms.id = v_run.mission_step_id
         and ms.mission_id = v_run.mission_id
     ) then
    insert into public.student_mission_step_progress (
      student_id,
      mission_id,
      mission_step_id,
      completed_at,
      last_attempt_id
    ) values (
      v_run.student_id,
      v_run.mission_id,
      v_run.mission_step_id,
      coalesce(v_run.ended_at, now()),
      v_run.id
    )
    on conflict (student_id, mission_step_id) do update
    set mission_id = excluded.mission_id,
        last_attempt_id = excluded.last_attempt_id,
        updated_at = now();
  end if;

  -- Aventure : comportement du patch 31 conservé à l'identique.
  if v_run.context = 'adventure' then
    select sap.* into v_passage
    from public.student_adventure_passages sap
    join public.student_adventure_days sad on sad.id = sap.adventure_day_id
    where sap.activity_attempt_id = v_run.id
      and sad.student_id = v_run.student_id
    for update of sap;

    if found then
      if v_run.status = 'completed' then
        select ca.pedagogical_node_id, ca.adventure_tier
          into v_grade_folder_id, v_adventure_tier
        from public.catalog_activities ca
        where ca.id = v_run.catalog_activity_id;

        if v_grade_folder_id is null or v_adventure_tier is null then
          raise exception 'Activité Aventure sans dossier de niveau ou palier.' using errcode = '22023';
        end if;

        insert into public.student_adventure_tier_progress (
          student_id,
          grade_folder_id,
          adventure_tier,
          gauge_value,
          total_passages,
          total_questions,
          total_correct,
          total_wrong,
          first_encountered_at,
          last_practiced_at
        ) values (
          v_run.student_id,
          v_grade_folder_id,
          v_adventure_tier,
          0,
          1,
          0,
          0,
          0,
          coalesce(v_run.started_at, now()),
          coalesce(v_run.ended_at, now())
        )
        on conflict (student_id, grade_folder_id, adventure_tier) do update
        set total_passages = public.student_adventure_tier_progress.total_passages + 1,
            last_practiced_at = coalesce(excluded.last_practiced_at, now()),
            updated_at = now();

        update public.student_adventure_passages
        set status = 'completed',
            started_at = coalesce(started_at, v_run.started_at, now()),
            completed_at = coalesce(completed_at, v_run.ended_at, now()),
            adventure_tier = coalesce(adventure_tier, v_adventure_tier)
        where id = v_passage.id;

        select
          count(*) filter (where sap.passage_type = 'required'),
          count(*) filter (where sap.passage_type = 'required' and sap.status = 'completed')
          into v_required_count, v_required_completed
        from public.student_adventure_passages sap
        where sap.adventure_day_id = v_passage.adventure_day_id;

        -- MVP rentrée : les 4 adaptatifs sont différés. Dès que les six
        -- obligatoires sont terminés, ils sont explicitement ignorés.
        if v_required_count = 6 and v_required_completed = 6 then
          update public.student_adventure_passages
          set status = 'skipped',
              completed_at = coalesce(completed_at, now())
          where adventure_day_id = v_passage.adventure_day_id
            and passage_type = 'adaptive'
            and status in ('pending', 'interrupted');

          update public.student_adventure_days
          set status = 'completed',
              completed_at = coalesce(completed_at, now())
          where id = v_passage.adventure_day_id
            and status <> 'completed';
        end if;
      else
        update public.student_adventure_passages
        set status = 'interrupted',
            started_at = coalesce(started_at, v_run.started_at, now()),
            completed_at = null
        where id = v_passage.id
          and status <> 'completed';
      end if;
    end if;
  end if;

  update public.student_activity_sessions
  set progress_applied = true
  where id = p_session_id;
end;
$$;

revoke all on function public.apply_activity_attempt_progress(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------
-- 3) Missions publiques : progression + exclusion des terminées
-- ---------------------------------------------------------

drop function if exists public.get_space_missions(text, bigint[], boolean);

create function public.get_space_missions(
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
  updated_at timestamptz,
  total_steps integer,
  completed_steps integer
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
    select id
    from selected_students
    order by id
    limit 1
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
    m.updated_at,
    counts.total_steps,
    case
      when coalesce(p_is_group, false) then 0
      else counts.completed_steps
    end as completed_steps
  from public.missions m
  join space sp on sp.id = m.teacher_space_id
  cross join lateral (
    select
      count(*)::integer as total_steps,
      count(*) filter (
        where exists (
          select 1
          from selected_individual si
          join public.student_mission_step_progress smsp
            on smsp.student_id = si.id
           and smsp.mission_step_id = ms.id
        )
      )::integer as completed_steps
    from public.mission_steps ms
    where ms.mission_id = m.id
  ) counts
  where m.status = 'active'
    and counts.total_steps > 0
    and (
      -- En groupe : uniquement missions de classe. La progression reste
      -- volontairement individuelle et n'est donc pas consommée ici.
      (coalesce(p_is_group, false) = true and exists (
        select 1
        from public.mission_assignments ma
        join selected_classes sc on sc.teacher_class_id = ma.teacher_class_id
        where ma.mission_id = m.id
          and ma.target_type = 'class'
      ))
      or
      -- En individuel : missions de l'élève + missions de sa classe.
      (coalesce(p_is_group, false) = false
       and exists (
         select 1
         from public.mission_assignments ma
         left join selected_classes sc
           on sc.teacher_class_id = ma.teacher_class_id
          and ma.target_type = 'class'
         left join selected_students ss
           on ss.id = ma.student_id
          and ma.target_type = 'student'
         where ma.mission_id = m.id
           and (sc.teacher_class_id is not null or ss.id is not null)
       )
       -- Une Mission entièrement terminée disparaît de la liste « à faire ».
       and counts.completed_steps < counts.total_steps)
    )
  order by m.display_order asc, lower(m.title) asc, m.updated_at desc;
$$;

grant execute on function public.get_space_missions(text, bigint[], boolean) to anon, authenticated;

-- ---------------------------------------------------------
-- 4) Étapes publiques : indiquer celles déjà terminées
-- ---------------------------------------------------------

drop function if exists public.get_space_mission_steps(text, uuid);
drop function if exists public.get_space_mission_steps(text, uuid, bigint);

create function public.get_space_mission_steps(
  p_access_code text,
  p_mission_id uuid,
  p_student_id bigint default null
)
returns table (
  id uuid,
  mission_id uuid,
  catalog_activity_id text,
  "position" integer,
  difficulty_mode text,
  difficulty_level smallint,
  step_options_json jsonb,
  is_completed boolean
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
    ms.position as "position",
    ms.difficulty_mode,
    ms.difficulty_level,
    ms.step_options_json,
    case
      when p_student_id is null then false
      else exists (
        select 1
        from public.student_mission_step_progress smsp
        join public.students s on s.id = smsp.student_id
        join public.teacher_classes tc on tc.id = s.teacher_class_id
        where smsp.student_id = p_student_id
          and smsp.mission_step_id = ms.id
          and tc.teacher_space_id = ts.id
      )
    end as is_completed
  from public.teacher_spaces ts
  join public.missions m on m.teacher_space_id = ts.id
  join public.mission_steps ms on ms.mission_id = m.id
  where ts.access_code = upper(trim(p_access_code))
    and m.id = p_mission_id
    and m.status = 'active'
  order by ms.position asc, ms.created_at asc;
$$;

grant execute on function public.get_space_mission_steps(text, uuid, bigint) to anon, authenticated;

commit;
