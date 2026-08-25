-- =========================================================
-- PATCH 31 — RUNTIME AVENTURE : PASSAGES « ACTIVITÉ » OBLIGATOIRES
-- À exécuter APRÈS 20_adventure_engine_foundations.sql et après le seed
-- pédagogique actuellement en production.
--
-- Objectif MVP rentrée :
-- - exécuter les 6 passages obligatoires lorsqu'ils ciblent des activités précises ;
-- - démarrer une activité Aventure au niveau 2 lors de la première rencontre ;
-- - reprendre ensuite le dernier niveau atteint dans CETTE activité en Aventure ;
-- - lier une tentative d'activité à son passage Aventure ;
-- - appliquer la matrice lente, question par question, côté base ;
-- - rendre l'écriture idempotente en cas de retry réseau ;
-- - clore le passage puis, après les 6 obligatoires, clore la journée ;
-- - ignorer temporairement les 4 passages adaptatifs en les passant à « skipped ».
--
-- CONTRAT CLIENT POUR LE PATCH SUIVANT :
-- une tentative context='adventure' doit fournir dans metadata_json :
--   { "adventure_passage_id": "<uuid du passage>" }
-- Le niveau de lancement à utiliser côté moteur est renvoyé par
-- open_student_adventure_day(...).passages[].started_level.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Les points d'une question peuvent être négatifs en Aventure
-- ---------------------------------------------------------

alter table public.student_activity_session_questions
  drop constraint if exists student_activity_session_questions_values_check;

alter table public.student_activity_session_questions
  add constraint student_activity_session_questions_values_check check (
    points_awarded between -10000 and 10000
    and duration_ms >= 0
  );

-- ---------------------------------------------------------
-- 2) Helper privé : niveau de départ propre à une activité Aventure
-- ---------------------------------------------------------
-- Première rencontre : niveau 2.
-- Ensuite : dernier ended_level enregistré dans le seul contexte Aventure.
-- Une tentative encore « running » est volontairement prise en compte : après
-- un crash navigateur, ended_level contient déjà le niveau sauvegardé après la
-- dernière question reçue par le serveur.

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
    2
  );
$$;

revoke all
on function public.get_student_adventure_activity_start_level(bigint, text)
from public, anon, authenticated;

-- ---------------------------------------------------------
-- 3) Finalisation de progression : Exploration inchangée + Aventure
-- ---------------------------------------------------------
-- La jauge Aventure est déjà mise à jour question par question. Ici, on ne la
-- recompte surtout pas : on finalise uniquement le passage / la journée et le
-- compteur de passages terminés.

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

  -- Comportement Exploration historique, conservé à l'identique.
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
-- 4) Ouvrir une tentative : branche Aventure sécurisée
-- ---------------------------------------------------------
-- Pour Aventure, le serveur :
-- - exige adventure_passage_id dans metadata_json ;
-- - vérifie que le passage appartient bien à l'élève et cible l'activité ;
-- - impose le niveau de départ (2 puis dernier niveau Aventure) ;
-- - crée la jauge du palier à la première rencontre ;
-- - lie atomiquement tentative et passage.

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
  v_passage_id uuid;
  v_passage_status text;
  v_passage_activity_id text;
  v_passage_type text;
  v_passage_source_type text;
  v_day_status text;
  v_grade_folder_id text;
  v_adventure_tier integer;
  v_activity_grade text;
  v_metadata jsonb := coalesce(p_metadata_json, '{}'::jsonb);
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

  if jsonb_typeof(v_metadata) <> 'object'
     or octet_length(v_metadata::text) > 98304 then
    raise exception 'Métadonnées d’historique invalides ou trop volumineuses.' using errcode = '22023';
  end if;

  if jsonb_typeof(coalesce(p_config_snapshot, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_config_snapshot, '{}'::jsonb)::text) > 98304 then
    raise exception 'Configuration d’historique invalide ou trop volumineuse.' using errcode = '22023';
  end if;

  if v_context = 'adventure' then
    begin
      v_passage_id := nullif(btrim(coalesce(v_metadata ->> 'adventure_passage_id', '')), '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Identifiant de passage Aventure invalide.' using errcode = '22023';
    end;

    if v_passage_id is null then
      raise exception 'Passage Aventure manquant.' using errcode = '22023';
    end if;

    select
      sap.status,
      sap.catalog_activity_id,
      sap.passage_type,
      sap.source_item_type,
      sad.status,
      ca.pedagogical_node_id,
      ca.adventure_tier,
      pn.name
      into
      v_passage_status,
      v_passage_activity_id,
      v_passage_type,
      v_passage_source_type,
      v_day_status,
      v_grade_folder_id,
      v_adventure_tier,
      v_activity_grade
    from public.student_adventure_passages sap
    join public.student_adventure_days sad on sad.id = sap.adventure_day_id
    join public.catalog_activities ca on ca.id = sap.catalog_activity_id
    join public.pedagogical_nodes pn on pn.id = ca.pedagogical_node_id
    where sap.id = v_passage_id
      and sad.student_id = v_student_id
    for update of sap, sad;

    if not found then
      raise exception 'Passage Aventure introuvable pour cet élève.' using errcode = '28000';
    end if;

    if v_day_status <> 'in_progress' then
      raise exception 'Cette journée Aventure est déjà terminée.' using errcode = '22023';
    end if;

    if v_passage_type <> 'required'
       or v_passage_source_type <> 'activity'
       or v_passage_activity_id is distinct from v_activity_id then
      raise exception 'Ce passage ne correspond pas à cette activité Aventure.' using errcode = '22023';
    end if;

    if v_passage_status in ('completed', 'skipped') then
      raise exception 'Ce passage Aventure est déjà terminé.' using errcode = '22023';
    end if;

    if v_adventure_tier is null or v_adventure_tier < 1
       or v_grade_folder_id is null
       or v_activity_grade is null then
      raise exception 'Activité Aventure mal classée.' using errcode = '22023';
    end if;

    -- Le niveau fourni par le navigateur est ignoré en Aventure.
    v_level := public.get_student_adventure_activity_start_level(v_student_id, v_activity_id);

    insert into public.student_adventure_tier_progress (
      student_id,
      grade_folder_id,
      adventure_tier,
      gauge_value,
      first_encountered_at
    ) values (
      v_student_id,
      v_grade_folder_id,
      v_adventure_tier,
      0,
      now()
    )
    on conflict (student_id, grade_folder_id, adventure_tier) do nothing;
  end if;

  if p_client_attempt_id is not null then
    select id into v_existing_id
    from public.student_activity_sessions
    where client_attempt_id = p_client_attempt_id
      and student_id = v_student_id
    limit 1;

    if v_existing_id is not null then
      if v_context = 'adventure' and not exists (
        select 1
        from public.student_adventure_passages sap
        where sap.id = v_passage_id
          and sap.activity_attempt_id = v_existing_id
      ) then
        raise exception 'Cette tentative Aventure est déjà liée à un autre passage.' using errcode = '22023';
      end if;
      return v_existing_id;
    end if;
  end if;

  -- Une seule tentative active par élève. Les anciennes tentatives non closes
  -- sont interrompues avant d'ouvrir la nouvelle ; apply_activity_attempt_progress
  -- marque aussi leur éventuel passage Aventure comme interrompu.
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
    v_metadata,
    coalesce(p_config_snapshot, '{}'::jsonb),
    false
  )
  returning id into v_attempt_id;

  if v_context = 'adventure' then
    update public.student_adventure_passages
    set status = 'running',
        activity_attempt_id = v_attempt_id,
        adventure_tier = v_adventure_tier,
        started_at = coalesce(started_at, now()),
        completed_at = null
    where id = v_passage_id
      and status in ('pending', 'running', 'interrupted');

    if not found then
      raise exception 'Le passage Aventure ne peut plus être démarré.' using errcode = '22023';
    end if;
  end if;

  return v_attempt_id;
end;
$$;

-- ---------------------------------------------------------
-- 5) Matrice lente appliquée question par question
-- ---------------------------------------------------------
-- Le p_points_awarded envoyé par le client reste utilisé hors Aventure.
-- En Aventure il est IGNORÉ : le serveur calcule lui-même la variation à partir
-- de la jauge avant réponse, du niveau réellement présenté et du résultat.
-- Le point enregistré est la variation réelle après bornage 0..50.

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
  v_existing_question public.student_activity_session_questions%rowtype;
  v_outcome text := lower(btrim(coalesce(p_outcome, 'unanswered')));
  v_level_presented integer := greatest(1, least(5, coalesce(p_level_presented, 3)));
  v_level_after integer := greatest(1, least(5, coalesce(p_level_after, v_level_presented)));
  v_question_index integer := greatest(0, coalesce(p_question_index, 0));
  v_points integer := greatest(0, coalesce(p_points_awarded, 0));
  v_grade_folder_id text;
  v_adventure_tier integer;
  v_passage_id uuid;
  v_gauge_before integer := 0;
  v_gauge_after integer := 0;
  v_raw_points integer := 0;
  v_is_retry boolean := false;
begin
  v_student_id := public.resolve_history_student(p_access_code, p_student_id, p_student_code);
  if v_student_id is null then
    raise exception 'Code élève invalide.' using errcode = '28000';
  end if;

  if v_outcome not in ('correct', 'incorrect', 'unanswered') then
    v_outcome := 'unanswered';
  end if;

  if v_question_index > 100000 then
    raise exception 'Index de question invalide.' using errcode = '22023';
  end if;

  if coalesce(p_points_awarded, 0) not between -10000 and 10000 then
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

  if v_run.context = 'adventure' then
    select
      sap.id,
      ca.pedagogical_node_id,
      ca.adventure_tier
      into
      v_passage_id,
      v_grade_folder_id,
      v_adventure_tier
    from public.student_adventure_passages sap
    join public.student_adventure_days sad on sad.id = sap.adventure_day_id
    join public.catalog_activities ca on ca.id = v_run.catalog_activity_id
    where sap.activity_attempt_id = v_run.id
      and sad.student_id = v_run.student_id
      and sap.status = 'running'
    for update of sap;

    if not found or v_grade_folder_id is null or v_adventure_tier is null then
      raise exception 'Tentative Aventure non liée à un passage actif.' using errcode = '22023';
    end if;

    -- Si la même question revient après un retry réseau, on ne la recompte pas.
    select * into v_existing_question
    from public.student_activity_session_questions q
    where q.session_id = p_attempt_id
      and q.question_index = v_question_index;

    if found then
      if v_existing_question.level_presented <> v_level_presented
         or v_existing_question.outcome <> v_outcome then
        raise exception 'Une question Aventure déjà enregistrée ne peut pas être rescorrigée.' using errcode = '22023';
      end if;

      v_level_after := v_existing_question.level_after;
      v_points := v_existing_question.points_awarded;
      v_is_retry := true;
    else
      -- Le serveur impose également la transition de niveau. Le navigateur ne
      -- peut donc ni gonfler le niveau présenté, ni choisir lui-même le niveau
      -- de la question suivante.
      if v_level_presented <> v_run.ended_level then
        raise exception 'Niveau Aventure incohérent avec la tentative en cours.' using errcode = '22023';
      end if;

      v_level_after := case
        when v_outcome = 'correct' then least(5, v_level_presented + 1)
        when v_outcome = 'incorrect' then greatest(1, v_level_presented - 1)
        else v_level_presented
      end;

      insert into public.student_adventure_tier_progress (
        student_id,
        grade_folder_id,
        adventure_tier,
        gauge_value,
        first_encountered_at
      ) values (
        v_student_id,
        v_grade_folder_id,
        v_adventure_tier,
        0,
        coalesce(v_run.started_at, now())
      )
      on conflict (student_id, grade_folder_id, adventure_tier) do nothing;

      select satp.gauge_value
        into v_gauge_before
      from public.student_adventure_tier_progress satp
      where satp.student_id = v_student_id
        and satp.grade_folder_id = v_grade_folder_id
        and satp.adventure_tier = v_adventure_tier
      for update;

      if not found then
        raise exception 'Jauge Aventure introuvable.' using errcode = '22023';
      end if;

      if v_outcome = 'correct' then
        v_raw_points := case
          when v_gauge_before between 0 and 10 then
            case v_level_presented when 1 then 1 when 2 then 2 when 3 then 3 when 4 then 4 else 5 end
          when v_gauge_before between 11 and 20 then
            case v_level_presented when 1 then 0 when 2 then 1 when 3 then 2 when 4 then 3 else 4 end
          when v_gauge_before between 21 and 30 then
            case v_level_presented when 1 then 0 when 2 then 0 when 3 then 1 when 4 then 2 else 3 end
          when v_gauge_before between 31 and 40 then
            case v_level_presented when 1 then 0 when 2 then 0 when 3 then 0 when 4 then 2 else 3 end
          else
            case v_level_presented when 1 then 0 when 2 then 0 when 3 then 0 when 4 then 1 else 2 end
        end;
      elsif v_outcome = 'incorrect' then
        v_raw_points := case
          when v_gauge_before between 0 and 20 then 0
          when v_gauge_before between 21 and 30 then
            case v_level_presented when 1 then -1 else 0 end
          when v_gauge_before between 31 and 40 then
            case v_level_presented when 1 then -2 when 2 then -1 else 0 end
          else
            case v_level_presented when 1 then -3 when 2 then -2 when 3 then -1 else 0 end
        end;
      else
        v_raw_points := 0;
      end if;

      v_gauge_after := greatest(0, least(50, v_gauge_before + v_raw_points));
      v_points := v_gauge_after - v_gauge_before;

      if v_outcome in ('correct', 'incorrect') then
        update public.student_adventure_tier_progress
        set gauge_value = v_gauge_after,
            total_questions = total_questions + 1,
            total_correct = total_correct + case when v_outcome = 'correct' then 1 else 0 end,
            total_wrong = total_wrong + case when v_outcome = 'incorrect' then 1 else 0 end,
            last_practiced_at = now(),
            mastered_at = case
              when v_gauge_after = 50 then coalesce(mastered_at, now())
              else null
            end,
            updated_at = now()
        where student_id = v_student_id
          and grade_folder_id = v_grade_folder_id
          and adventure_tier = v_adventure_tier;

        update public.student_adventure_passages
        set points_awarded = points_awarded + v_points
        where id = v_passage_id;
      end if;
    end if;
  end if;

  insert into public.student_activity_session_questions as existing_q (
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
    v_question_index,
    left(btrim(coalesce(p_tool_id, '')), 200),
    left(btrim(coalesce(p_tool_instance_id, '')), 200),
    v_level_presented,
    v_level_after,
    v_outcome,
    case when v_outcome = 'correct' then true when v_outcome = 'incorrect' then false else null end,
    v_points,
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
      -- En Aventure, outcome/niveaux/points restent immuables lors d'un retry.
      level_presented = case
        when v_run.context = 'adventure' then existing_q.level_presented
        else excluded.level_presented
      end,
      level_after = case
        when v_run.context = 'adventure' then existing_q.level_after
        else excluded.level_after
      end,
      outcome = case
        when v_run.context = 'adventure' then existing_q.outcome
        else excluded.outcome
      end,
      is_correct = case
        when v_run.context = 'adventure' then existing_q.is_correct
        else excluded.is_correct
      end,
      points_awarded = case
        when v_run.context = 'adventure' then existing_q.points_awarded
        else excluded.points_awarded
      end,
      duration_ms = greatest(existing_q.duration_ms, excluded.duration_ms),
      question_snapshot = excluded.question_snapshot,
      answer_snapshot = excluded.answer_snapshot,
      correction_snapshot = excluded.correction_snapshot,
      answered_at = case
        when v_run.context = 'adventure' and v_is_retry then existing_q.answered_at
        else excluded.answered_at
      end,
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

  -- Sauvegarde immédiate du niveau d'Exploration, inchangée.
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
-- 6) Ouvrir / reprendre le jour courant — variante MVP
-- ---------------------------------------------------------
-- Correction incluse : une journée déjà figée est relue AVANT de revalider le
-- menu enseignant. Modifier le menu après le démarrage d'un élève ne peut donc
-- plus rendre sa journée existante inaccessible.
--
-- Pour le MVP, un nouveau jour n'est « ready » que si ses 6 cases sont des
-- activités précises. Les cases Objectif seront réactivées dans le patch dédié.

create or replace function public.open_student_adventure_day(
  p_access_code text,
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
  v_teacher_class_id bigint;
  v_teacher_space_id bigint;
  v_grade_level text;
  v_cursor public.adventure_class_cursors%rowtype;
  v_configured_count integer := 0;
  v_ready_count integer := 0;
  v_activity_count integer := 0;
  v_day_id uuid;
  v_day_status text;
  v_passages jsonb := '[]'::jsonb;
begin
  v_student_id := public.resolve_history_student(p_access_code, p_student_id, p_student_code);
  if v_student_id is null then
    raise exception 'Code élève invalide.' using errcode = '28000';
  end if;

  select s.teacher_class_id, s.grade_level, tc.teacher_space_id
    into v_teacher_class_id, v_grade_level, v_teacher_space_id
  from public.students s
  join public.teacher_classes tc on tc.id = s.teacher_class_id
  where s.id = v_student_id;

  if v_grade_level is null
     or v_grade_level not in ('CP', 'CE1', 'CE2', 'CM1', 'CM2') then
    return jsonb_build_object(
      'availability', 'missing_grade',
      'message', 'Aucun niveau scolaire n’est défini pour cet élève.'
    );
  end if;

  select * into v_cursor
  from public.adventure_class_cursors
  where teacher_class_id = v_teacher_class_id
    and grade_level = v_grade_level;

  if not found or v_cursor.is_enabled is not true then
    return jsonb_build_object(
      'availability', 'disabled',
      'grade_level', v_grade_level,
      'message', 'Le mode Aventure n’est pas encore ouvert pour ce niveau.'
    );
  end if;

  -- D'abord reprendre une journée déjà figée, sans dépendre du menu actuel.
  select sad.id, sad.status
    into v_day_id, v_day_status
  from public.student_adventure_days sad
  where sad.student_id = v_student_id
    and sad.grade_level = v_grade_level
    and sad.menu_number = v_cursor.menu_number
    and sad.day_number = v_cursor.day_number;

  if v_day_id is null then
    select
      count(*) filter (where effective.item_type <> 'empty'),
      count(*) filter (
        where
          (
            effective.item_type = 'objective'
            and exists (
              select 1
              from public.pedagogical_nodes pn
              where pn.id = effective.grade_folder_id
                and pn.node_type = 'grade_level'
                and pn.name = v_grade_level
                and pn.is_active = true
            )
            and exists (
              select 1
              from public.catalog_activities ca
              where ca.pedagogical_node_id = effective.grade_folder_id
                and ca.status = 'published'
            )
          )
          or
          (
            effective.item_type = 'activity'
            and exists (
              select 1
              from public.catalog_activities ca
              join public.pedagogical_nodes pn on pn.id = ca.pedagogical_node_id
              where ca.id = effective.catalog_activity_id
                and ca.status = 'published'
                and ca.adventure_tier >= 1
                and pn.node_type = 'grade_level'
                and pn.name = v_grade_level
                and pn.is_active = true
            )
          )
      ),
      count(*) filter (
        where effective.item_type = 'activity'
          and exists (
            select 1
            from public.catalog_activities ca
            join public.pedagogical_nodes pn on pn.id = ca.pedagogical_node_id
            where ca.id = effective.catalog_activity_id
              and ca.status = 'published'
              and ca.adventure_tier >= 1
              and pn.node_type = 'grade_level'
              and pn.name = v_grade_level
              and pn.is_active = true
          )
      )
      into v_configured_count, v_ready_count, v_activity_count
    from public.get_effective_adventure_menu_slots(
      v_teacher_space_id,
      v_grade_level,
      v_cursor.menu_number,
      v_cursor.day_number
    ) effective;

    if v_ready_count <> 6 then
      return jsonb_build_object(
        'availability', 'menu_incomplete',
        'grade_level', v_grade_level,
        'menu_number', v_cursor.menu_number,
        'day_number', v_cursor.day_number,
        'configured_required_count', v_configured_count,
        'ready_required_count', v_ready_count,
        'message', 'Le jour courant doit contenir six passages obligatoires valides.'
      );
    end if;

    if v_activity_count <> 6 then
      return jsonb_build_object(
        'availability', 'menu_requires_activities',
        'grade_level', v_grade_level,
        'menu_number', v_cursor.menu_number,
        'day_number', v_cursor.day_number,
        'activity_required_count', v_activity_count,
        'message', 'Pour la première version d’Aventure, les six cases du jour doivent cibler des activités précises.'
      );
    end if;

    insert into public.student_adventure_days (
      student_id,
      grade_level,
      menu_number,
      day_number,
      status
    ) values (
      v_student_id,
      v_grade_level,
      v_cursor.menu_number,
      v_cursor.day_number,
      'in_progress'
    )
    on conflict (student_id, grade_level, menu_number, day_number) do nothing
    returning id, status into v_day_id, v_day_status;

    if v_day_id is null then
      select id, status
        into v_day_id, v_day_status
      from public.student_adventure_days
      where student_id = v_student_id
        and grade_level = v_grade_level
        and menu_number = v_cursor.menu_number
        and day_number = v_cursor.day_number;
    end if;

    insert into public.student_adventure_passages (
      adventure_day_id,
      passage_number,
      passage_type,
      source_slot_number,
      source_item_type,
      grade_folder_id,
      catalog_activity_id,
      adventure_tier,
      status
    )
    select
      v_day_id,
      effective.slot_number,
      'required',
      effective.slot_number,
      'activity',
      null,
      effective.catalog_activity_id,
      ca.adventure_tier,
      'pending'
    from public.get_effective_adventure_menu_slots(
      v_teacher_space_id,
      v_grade_level,
      v_cursor.menu_number,
      v_cursor.day_number
    ) effective
    join public.catalog_activities ca on ca.id = effective.catalog_activity_id
    where effective.item_type = 'activity'
    on conflict (adventure_day_id, passage_number) do nothing;

    insert into public.student_adventure_passages (
      adventure_day_id,
      passage_number,
      passage_type,
      source_slot_number,
      source_item_type,
      status
    )
    select
      v_day_id,
      generated.passage_number,
      'adaptive',
      null,
      'adaptive',
      'pending'
    from generate_series(7, 10) as generated(passage_number)
    on conflict (adventure_day_id, passage_number) do nothing;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sap.id,
        'passage_number', sap.passage_number,
        'passage_type', sap.passage_type,
        'source_slot_number', sap.source_slot_number,
        'source_item_type', sap.source_item_type,
        'grade_folder_id', sap.grade_folder_id,
        'catalog_activity_id', sap.catalog_activity_id,
        'adventure_tier', sap.adventure_tier,
        'started_level', case
          when sap.catalog_activity_id is not null
            then public.get_student_adventure_activity_start_level(v_student_id, sap.catalog_activity_id)
          else null
        end,
        'status', sap.status,
        'activity_attempt_id', sap.activity_attempt_id,
        'points_awarded', sap.points_awarded
      )
      order by sap.passage_number
    ),
    '[]'::jsonb
  ) into v_passages
  from public.student_adventure_passages sap
  where sap.adventure_day_id = v_day_id;

  return jsonb_build_object(
    'availability', 'ready',
    'grade_level', v_grade_level,
    'menu_number', v_cursor.menu_number,
    'day_number', v_cursor.day_number,
    'day_id', v_day_id,
    'day_status', v_day_status,
    'passages', v_passages
  );
end;
$$;

-- ---------------------------------------------------------
-- 7) Droits (signatures inchangées côté API publique)
-- ---------------------------------------------------------

grant execute
on function public.open_student_adventure_day(text, bigint, text)
to anon, authenticated;

grant execute
on function public.start_student_activity_attempt(
  text, bigint, text, text, text, uuid, uuid, uuid,
  text, text, text, integer, jsonb, jsonb
)
to anon, authenticated;

grant execute
on function public.record_student_activity_attempt_question(
  text, bigint, text, uuid, integer, text, text, integer, integer,
  text, integer, integer, jsonb, jsonb, jsonb
)
to anon, authenticated;

commit;
