-- =========================================================
-- 43_adventure_adaptive_passages.sql
-- Aventure : activation réelle des passages adaptatifs 7 à 10.
-- À exécuter APRÈS 42_adventure_objective_resolution.sql.
--
-- Principes :
-- - les 6 passages programmés restent inchangés ;
-- - après le passage 6, les passages 7 à 10 sont résolus un par un ;
-- - le pool est limité aux OdApp déjà rencontrés par l'élève ;
-- - priorité aux OdApp les plus faibles, avec diversification sur la journée ;
-- - le passage suivant n'est résolu qu'après la fin du précédent ;
-- - une cible résolue est figée pour permettre une reprise identique ;
-- - la journée se termine après les 10 passages (hors garde-fou d'indisponibilité).
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Helper privé : résoudre le prochain passage adaptatif
-- ---------------------------------------------------------
-- Règles de sélection :
-- - uniquement après les six passages obligatoires ;
-- - uniquement parmi les OdApp déjà rencontrés par l'élève ;
-- - nœud de niveau actif et au moins une activité Aventure publiée ;
-- - palier courant = premier palier disponible dont la jauge est < 50,
--   sinon dernier palier disponible pour l'entretien ;
-- - priorité aux OdApp non encore utilisés dans les adaptatifs de cette journée ;
-- - puis jauge la plus faible ;
-- - à égalité : palier le moins récemment travaillé, puis identifiant stable ;
-- - l'activité est ensuite choisie avec la même diversification que pour une
--   case Objectif et figée dans le passage pour garantir la reprise.

create or replace function public.resolve_student_adventure_next_adaptive_passage(
  p_student_id bigint,
  p_adventure_day_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_passage public.student_adventure_passages%rowtype;
  v_grade_level text;
  v_grade_folder_id text;
  v_tier integer;
  v_last_activity_id text;
  v_activity_id text;
begin
  select sad.grade_level
    into v_grade_level
  from public.student_adventure_days sad
  where sad.id = p_adventure_day_id
    and sad.student_id = p_student_id
    and sad.status = 'in_progress';

  if not found then
    return;
  end if;

  -- Aucun adaptatif ne peut être résolu tant qu'un obligatoire reste ouvert.
  if exists (
    select 1
    from public.student_adventure_passages sap
    where sap.adventure_day_id = p_adventure_day_id
      and sap.passage_type = 'required'
      and sap.status not in ('completed', 'skipped')
  ) then
    return;
  end if;

  -- On ne résout qu'un passage adaptatif à la fois. Ainsi le résultat du 7
  -- peut changer le choix du 8, etc.
  select sap.*
    into v_passage
  from public.student_adventure_passages sap
  where sap.adventure_day_id = p_adventure_day_id
    and sap.passage_type = 'adaptive'
    and sap.status not in ('completed', 'skipped')
  order by sap.passage_number
  limit 1
  for update of sap;

  if not found then
    update public.student_adventure_days
    set status = 'completed',
        completed_at = coalesce(completed_at, now())
    where id = p_adventure_day_id
      and student_id = p_student_id
      and status = 'in_progress';
    return;
  end if;

  -- Une reprise conserve la cible déjà résolue.
  if v_passage.catalog_activity_id is not null then
    return;
  end if;

  -- Sélection de l'OdApp actuellement le plus faible.
  -- « déjà rencontré » = présence d'au moins une ligne de progression pour
  -- ce dossier. Un OdApp totalement neuf ne peut donc pas être introduit par
  -- les quatre passages de remédiation.
  with candidates as (
    select
      pn.id as grade_folder_id,
      tier_choice.adventure_tier,
      tier_choice.gauge_value,
      tier_choice.last_practiced_at,
      exists (
        select 1
        from public.student_adventure_passages previous_adaptive
        where previous_adaptive.adventure_day_id = p_adventure_day_id
          and previous_adaptive.passage_type = 'adaptive'
          and previous_adaptive.passage_number < v_passage.passage_number
          and previous_adaptive.grade_folder_id = pn.id
          and previous_adaptive.status in ('running', 'completed', 'interrupted')
      ) as already_used_today
    from public.pedagogical_nodes pn
    join lateral (
      select
        tiers.adventure_tier,
        coalesce(satp.gauge_value, 0)::integer as gauge_value,
        satp.last_practiced_at
      from (
        select distinct ca.adventure_tier
        from public.catalog_activities ca
        where ca.pedagogical_node_id = pn.id
          and ca.status = 'published'
          and ca.adventure_tier is not null
          and ca.adventure_tier >= 1
      ) tiers
      left join public.student_adventure_tier_progress satp
        on satp.student_id = p_student_id
       and satp.grade_folder_id = pn.id
       and satp.adventure_tier = tiers.adventure_tier
      order by
        case when coalesce(satp.gauge_value, 0) < 50 then 0 else 1 end,
        case when coalesce(satp.gauge_value, 0) < 50 then tiers.adventure_tier end asc,
        case when coalesce(satp.gauge_value, 0) >= 50 then tiers.adventure_tier end desc
      limit 1
    ) tier_choice on true
    where pn.node_type = 'grade_level'
      and pn.name = v_grade_level
      and pn.is_active = true
      and exists (
        select 1
        from public.student_adventure_tier_progress encountered
        where encountered.student_id = p_student_id
          and encountered.grade_folder_id = pn.id
      )
  )
  select c.grade_folder_id, c.adventure_tier
    into v_grade_folder_id, v_tier
  from candidates c
  order by
    c.already_used_today asc,
    c.gauge_value asc,
    c.last_practiced_at asc nulls first,
    c.grade_folder_id asc
  limit 1;

  -- Situation normalement exceptionnelle : les six obligatoires ont été
  -- joués mais plus aucun de leurs OdApp (ni aucun OdApp antérieur) ne possède
  -- encore d'activité publiée/active. On ne bloque pas l'élève : les adaptatifs
  -- restants sont soldés puis la journée est clôturée.
  if v_grade_folder_id is null or v_tier is null then
    update public.student_adventure_passages
    set status = 'skipped',
        completed_at = coalesce(completed_at, now())
    where adventure_day_id = p_adventure_day_id
      and passage_type = 'adaptive'
      and status in ('pending', 'interrupted')
      and catalog_activity_id is null;

    if not exists (
      select 1
      from public.student_adventure_passages sap
      where sap.adventure_day_id = p_adventure_day_id
        and sap.status not in ('completed', 'skipped')
    ) then
      update public.student_adventure_days
      set status = 'completed',
          completed_at = coalesce(completed_at, now())
      where id = p_adventure_day_id
        and student_id = p_student_id
        and status = 'in_progress';
    end if;
    return;
  end if;

  -- Dernière activité jouée dans le même OdApp/palier.
  select sas.catalog_activity_id
    into v_last_activity_id
  from public.student_activity_sessions sas
  join public.catalog_activities previous_ca on previous_ca.id = sas.catalog_activity_id
  where sas.student_id = p_student_id
    and sas.context = 'adventure'
    and previous_ca.pedagogical_node_id = v_grade_folder_id
    and previous_ca.adventure_tier = v_tier
  order by sas.started_at desc, sas.created_at desc, sas.id desc
  limit 1;

  select ca.id
    into v_activity_id
  from public.catalog_activities ca
  left join lateral (
    select max(sas.started_at) as last_played_at
    from public.student_activity_sessions sas
    where sas.student_id = p_student_id
      and sas.context = 'adventure'
      and sas.catalog_activity_id = ca.id
  ) history on true
  where ca.pedagogical_node_id = v_grade_folder_id
    and ca.status = 'published'
    and ca.adventure_tier = v_tier
  order by
    case when ca.id = v_last_activity_id then 1 else 0 end,
    history.last_played_at asc nulls first,
    ca.display_order asc,
    ca.title asc,
    ca.id asc
  limit 1;

  if v_activity_id is null then
    raise exception 'Impossible de résoudre une activité pour ce passage adaptatif.' using errcode = '22023';
  end if;

  update public.student_adventure_passages
  set grade_folder_id = v_grade_folder_id,
      catalog_activity_id = v_activity_id,
      adventure_tier = v_tier
  where id = v_passage.id
    and passage_type = 'adaptive'
    and source_item_type = 'adaptive'
    and catalog_activity_id is null;
end;
$$;

revoke all
on function public.resolve_student_adventure_next_adaptive_passage(bigint, uuid)
from public, anon, authenticated;

-- ---------------------------------------------------------
-- 2) Finalisation : ne plus ignorer les passages 7 à 10
-- ---------------------------------------------------------

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
  v_passage_count integer := 0;
  v_open_passage_count integer := 0;
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

  -- Mission adaptative : le dernier niveau atteint devient le niveau mémorisé
  -- de cette activité. On ne mélange pas pour autant les compteurs de Mission
  -- avec les statistiques d'Exploration : seuls current_level et last_played_at
  -- sont mis à jour ici. Une tentative interrompue peut donc reprendre plus tard
  -- au niveau qu'elle avait réellement atteint.
  if v_run.context = 'mission'
     and v_run.questions_count > 0
     and v_run.mission_id is not null
     and v_run.mission_step_id is not null
     and exists (
       select 1
       from public.mission_steps ms
       where ms.id = v_run.mission_step_id
         and ms.mission_id = v_run.mission_id
         and ms.difficulty_mode = 'adaptive'
     ) then
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
      0,
      0,
      0,
      0,
      coalesce(v_run.ended_at, now())
    )
    on conflict (student_id, catalog_activity_id) do update
    set current_level = excluded.current_level,
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

  -- Aventure : les passages obligatoires ET adaptatifs utilisent désormais
  -- la même finalisation de jauge et de passage.
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
          count(*),
          count(*) filter (where sap.status not in ('completed', 'skipped'))
          into v_passage_count, v_open_passage_count
        from public.student_adventure_passages sap
        where sap.adventure_day_id = v_passage.adventure_day_id;

        -- Patch 43 : la journée ne se termine plus au sixième obligatoire.
        -- Les passages 7 à 10 sont réellement joués. La clôture intervient
        -- seulement lorsque les dix passages sont soldés. « skipped » reste
        -- un garde-fou uniquement si aucun OdApp déjà rencontré n'est encore
        -- jouable au moment de résoudre les adaptatifs.
        if v_passage_count = 10 and v_open_passage_count = 0 then
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
-- 3) Ouverture de journée : résoudre le prochain adaptatif au dernier moment
-- ---------------------------------------------------------

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

  -- Reprendre en priorité une journée déjà figée, sans dépendre d'une
  -- modification ultérieure du menu enseignant.
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
                and ca.adventure_tier is not null
                and ca.adventure_tier >= 1
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
                and ca.adventure_tier is not null
                and ca.adventure_tier >= 1
                and pn.node_type = 'grade_level'
                and pn.name = v_grade_level
                and pn.is_active = true
            )
          )
      )
      into v_configured_count, v_ready_count
    from public.get_effective_adventure_menu_slots_v2(
      v_teacher_space_id,
      v_grade_level,
      v_cursor.menu_number,
      v_cursor.day_number
    ) effective;

    if v_configured_count <> 6 or v_ready_count <> 6 then
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

    -- On fige les SIX CIBLES du menu, mais une case Objectif conserve encore
    -- catalog_activity_id = NULL. Elle sera résolue seulement lorsqu'elle sera
    -- effectivement la prochaine à jouer.
    insert into public.student_adventure_passages (
      adventure_day_id,
      passage_number,
      passage_type,
      source_slot_number,
      source_item_type,
      grade_folder_id,
      catalog_activity_id,
      adventure_tier,
      execution_limit,
      status
    )
    select
      v_day_id,
      effective.slot_number,
      'required',
      effective.slot_number,
      effective.item_type,
      case when effective.item_type = 'objective' then effective.grade_folder_id else null end,
      case when effective.item_type = 'activity' then effective.catalog_activity_id else null end,
      case when effective.item_type = 'activity' then ca.adventure_tier else null end,
      effective.execution_limit,
      'pending'
    from public.get_effective_adventure_menu_slots_v2(
      v_teacher_space_id,
      v_grade_level,
      v_cursor.menu_number,
      v_cursor.day_number
    ) effective
    left join public.catalog_activities ca
      on effective.item_type = 'activity'
     and ca.id = effective.catalog_activity_id
    where effective.item_type in ('objective', 'activity')
    on conflict (adventure_day_id, passage_number) do nothing;

    insert into public.student_adventure_passages (
      adventure_day_id,
      passage_number,
      passage_type,
      source_slot_number,
      source_item_type,
      execution_limit,
      status
    )
    select
      v_day_id,
      generated.passage_number,
      'adaptive',
      null,
      'adaptive',
      '{"mode":"questions","value":5}'::jsonb,
      'pending'
    from generate_series(7, 10) as generated(passage_number)
    on conflict (adventure_day_id, passage_number) do nothing;
  end if;

  -- Résolution paresseuse :
  -- 1) au plus le prochain passage obligatoire Objectif ;
  -- 2) une fois les six obligatoires terminés, au plus le prochain adaptatif.
  -- Le passage 8 n'est donc jamais figé avant que le 7 ait réellement modifié
  -- les jauges, et ainsi de suite jusqu'au passage 10.
  if v_day_status = 'in_progress' then
    perform public.resolve_student_adventure_next_required_passage(v_student_id, v_day_id);
    perform public.resolve_student_adventure_next_adaptive_passage(v_student_id, v_day_id);

    select sad.status
      into v_day_status
    from public.student_adventure_days sad
    where sad.id = v_day_id
      and sad.student_id = v_student_id;
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
        'execution_limit', sap.execution_limit,
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
-- 4) Démarrage : autoriser les passages adaptatifs résolus
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
  v_passage_id uuid;
  v_passage_status text;
  v_passage_activity_id text;
  v_passage_type text;
  v_passage_source_type text;
  v_source_grade_folder_id text;
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
      sap.grade_folder_id,
      sad.status,
      ca.pedagogical_node_id,
      ca.adventure_tier,
      pn.name
      into
      v_passage_status,
      v_passage_activity_id,
      v_passage_type,
      v_passage_source_type,
      v_source_grade_folder_id,
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

    if not (
         (v_passage_type = 'required' and v_passage_source_type in ('activity', 'objective'))
         or
         (v_passage_type = 'adaptive' and v_passage_source_type = 'adaptive')
       )
       or v_passage_activity_id is distinct from v_activity_id then
      raise exception 'Ce passage ne correspond pas à cette activité Aventure.' using errcode = '22023';
    end if;

    if v_passage_source_type in ('objective', 'adaptive')
       and v_source_grade_folder_id is distinct from v_grade_folder_id then
      raise exception 'L’activité résolue ne correspond pas à la cible Aventure prévue.' using errcode = '22023';
    end if;

    if v_passage_status in ('completed', 'skipped') then
      raise exception 'Ce passage Aventure est déjà terminé.' using errcode = '22023';
    end if;

    if v_adventure_tier is null or v_adventure_tier < 1
       or v_grade_folder_id is null
       or v_activity_grade is null then
      raise exception 'Activité Aventure mal classée.' using errcode = '22023';
    end if;

    -- Le navigateur ne décide jamais du niveau initial en Aventure.
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

  -- Une seule tentative active par élève.
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

revoke all
on function public.start_student_activity_attempt(
  text,bigint,text,text,text,uuid,uuid,uuid,text,text,text,integer,jsonb,jsonb
)
from public, anon, authenticated;

grant execute
on function public.start_student_activity_attempt(
  text,bigint,text,text,text,uuid,uuid,uuid,text,text,text,integer,jsonb,jsonb
)
to anon, authenticated;

grant execute
on function public.open_student_adventure_day(text, bigint, text)
to anon, authenticated;

commit;
