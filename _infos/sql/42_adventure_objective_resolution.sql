-- =========================================================
-- 42_adventure_objective_resolution.sql
-- Aventure : résolution réelle des cases « Objectif ».
-- À exécuter APRÈS 41_direct_quiz_missions.sql.
--
-- Principes :
-- - une case Objectif reste figée sur son dossier de niveau (OdApp) ;
-- - l'activité n'est PAS choisie au début de la journée ;
-- - elle est résolue seulement quand ce passage devient le prochain à jouer ;
-- - le palier courant = premier palier disponible dont la jauge est < 50 ;
-- - si tous les paliers sont à 50, le dernier palier reste jouable ;
-- - dans le palier, on évite autant que possible de rejouer immédiatement
--   la même activité et on privilégie les activités les moins récemment jouées ;
-- - une fois choisie, l'activité est mémorisée dans le passage : une reprise
--   après coupure rejoue donc exactement la même activité ;
-- - les passages adaptatifs 7 à 10 restent volontairement différés : le
--   comportement de fin du patch 36 est conservé pour l'instant.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Un passage Objectif peut mémoriser son activité résolue
-- ---------------------------------------------------------
-- grade_folder_id reste la cible pédagogique d'origine.
-- catalog_activity_id est NULL tant que le passage n'a pas été résolu, puis
-- contient l'activité effectivement choisie pour CET élève et CETTE journée.

alter table public.student_adventure_passages
  drop constraint if exists student_adventure_passages_required_target_check;

alter table public.student_adventure_passages
  add constraint student_adventure_passages_required_target_check check (
    passage_type = 'adaptive'
    or (
      source_item_type = 'objective'
      and grade_folder_id is not null
    )
    or (
      source_item_type = 'activity'
      and grade_folder_id is null
      and catalog_activity_id is not null
    )
  );

-- ---------------------------------------------------------
-- 2) Helper privé : résoudre le prochain passage Objectif
-- ---------------------------------------------------------

create or replace function public.resolve_student_adventure_next_required_passage(
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
  v_day_grade text;
  v_tier integer;
  v_last_activity_id text;
  v_activity_id text;
begin
  -- On ne touche qu'au PREMIER passage obligatoire encore ouvert. Cela évite
  -- de figer trop tôt les passages suivants : les jauges peuvent évoluer avec
  -- les activités qui les précèdent dans la journée.
  select sap.*
    into v_passage
  from public.student_adventure_passages sap
  join public.student_adventure_days sad on sad.id = sap.adventure_day_id
  where sap.adventure_day_id = p_adventure_day_id
    and sad.student_id = p_student_id
    and sad.status = 'in_progress'
    and sap.passage_type = 'required'
    and sap.status not in ('completed', 'skipped')
  order by sap.passage_number
  limit 1
  for update of sap;

  if not found then
    return;
  end if;

  -- Une activité imposée, une case Objectif déjà résolue ou une reprise ne
  -- nécessitent aucun nouveau tirage.
  if v_passage.source_item_type <> 'objective'
     or v_passage.catalog_activity_id is not null then
    return;
  end if;

  if v_passage.grade_folder_id is null then
    raise exception 'Passage Objectif Aventure sans dossier pédagogique.' using errcode = '22023';
  end if;

  select sad.grade_level
    into v_day_grade
  from public.student_adventure_days sad
  where sad.id = p_adventure_day_id
    and sad.student_id = p_student_id;

  if v_day_grade is null then
    raise exception 'Journée Aventure introuvable pour cet élève.' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.pedagogical_nodes pn
    where pn.id = v_passage.grade_folder_id
      and pn.node_type = 'grade_level'
      and pn.name = v_day_grade
      and pn.is_active = true
  ) then
    raise exception 'Objectif Aventure invalide pour le niveau de cet élève.' using errcode = '22023';
  end if;

  -- Premier palier réellement disponible dont la jauge n'est pas à 50.
  -- Si tout est maîtrisé, on garde le palier disponible le plus élevé afin
  -- qu'une case Objectif planifiée reste toujours jouable en entretien.
  select tiers.adventure_tier
    into v_tier
  from (
    select distinct ca.adventure_tier
    from public.catalog_activities ca
    where ca.pedagogical_node_id = v_passage.grade_folder_id
      and ca.status = 'published'
      and ca.adventure_tier is not null
      and ca.adventure_tier >= 1
  ) tiers
  left join public.student_adventure_tier_progress satp
    on satp.student_id = p_student_id
   and satp.grade_folder_id = v_passage.grade_folder_id
   and satp.adventure_tier = tiers.adventure_tier
  order by
    case when coalesce(satp.gauge_value, 0) < 50 then 0 else 1 end,
    case when coalesce(satp.gauge_value, 0) < 50 then tiers.adventure_tier end asc,
    case when coalesce(satp.gauge_value, 0) >= 50 then tiers.adventure_tier end desc
  limit 1;

  if v_tier is null then
    raise exception 'Aucune activité Aventure publiée n’est disponible pour cet objectif.' using errcode = '22023';
  end if;

  -- Dernière activité Aventure jouée dans ce même OdApp/palier.
  select sas.catalog_activity_id
    into v_last_activity_id
  from public.student_activity_sessions sas
  join public.catalog_activities previous_ca on previous_ca.id = sas.catalog_activity_id
  where sas.student_id = p_student_id
    and sas.context = 'adventure'
    and previous_ca.pedagogical_node_id = v_passage.grade_folder_id
    and previous_ca.adventure_tier = v_tier
  order by sas.started_at desc, sas.created_at desc, sas.id desc
  limit 1;

  -- On privilégie :
  -- 1. une activité différente de la précédente si une alternative existe ;
  -- 2. une activité jamais jouée / la moins récemment jouée ;
  -- 3. l'ordre pédagogique du Catalogue pour rendre le choix déterministe.
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
  where ca.pedagogical_node_id = v_passage.grade_folder_id
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
    raise exception 'Impossible de résoudre une activité pour ce passage Objectif.' using errcode = '22023';
  end if;

  update public.student_adventure_passages
  set catalog_activity_id = v_activity_id,
      adventure_tier = v_tier
  where id = v_passage.id
    and source_item_type = 'objective'
    and catalog_activity_id is null;
end;
$$;

revoke all
on function public.resolve_student_adventure_next_required_passage(bigint, uuid)
from public, anon, authenticated;

-- ---------------------------------------------------------
-- 3) Ouverture de journée : Objectif OU Activité
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

  -- Résolution paresseuse : au plus le prochain passage obligatoire Objectif.
  if v_day_status = 'in_progress' then
    perform public.resolve_student_adventure_next_required_passage(v_student_id, v_day_id);
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
-- 4) Ouverture d'une tentative : accepter un Objectif résolu
-- ---------------------------------------------------------
-- Version du patch 31 conservée, avec une seule extension fonctionnelle :
-- un passage required peut provenir d'une case activity OU objective. Pour une
-- case objective, l'activité choisie doit appartenir au dossier OdApp figé.

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

    if v_passage_type <> 'required'
       or v_passage_source_type not in ('activity', 'objective')
       or v_passage_activity_id is distinct from v_activity_id then
      raise exception 'Ce passage ne correspond pas à cette activité Aventure.' using errcode = '22023';
    end if;

    if v_passage_source_type = 'objective'
       and v_source_grade_folder_id is distinct from v_grade_folder_id then
      raise exception 'L’activité résolue ne correspond pas à l’objectif Aventure prévu.' using errcode = '22023';
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
