-- =========================================================
-- PATCH 35 — LONGUEUR D'EXÉCUTION EXTERNE DES ACTIVITÉS
-- À exécuter APRÈS 34_student_mission_progress.sql.
--
-- Principes :
-- - une activité générative ne possède plus de nombre de questions propre ;
-- - Exploration utilise son défaut système ;
-- - chaque étape de Mission choisit questions OU temps ;
-- - chaque case Aventure choisit questions OU temps ;
-- - une activité finie (ex. quiz) ignore cette limite et joue son contenu réel ;
-- - en mode temps, la question en cours est toujours terminée avant l'arrêt.
-- =========================================================

begin;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------
-- 1) Aventure : la règle d'arrêt fait partie de la case puis
--    de la journée figée de l'élève.
-- ---------------------------------------------------------

alter table public.adventure_default_menu_slots
  add column if not exists execution_limit jsonb not null
  default '{"mode":"questions","value":5}'::jsonb;

alter table public.teacher_adventure_menu_slots
  add column if not exists execution_limit jsonb not null
  default '{"mode":"questions","value":5}'::jsonb;

alter table public.student_adventure_passages
  add column if not exists execution_limit jsonb not null
  default '{"mode":"questions","value":5}'::jsonb;

alter table public.adventure_default_menu_slots
  drop constraint if exists adventure_default_menu_execution_limit_check;
alter table public.adventure_default_menu_slots
  add constraint adventure_default_menu_execution_limit_check check (
    jsonb_typeof(execution_limit) = 'object'
    and execution_limit->>'mode' in ('questions','time')
    and case
      when coalesce(execution_limit->>'value', '') ~ '^[0-9]+$'
        then (execution_limit->>'value')::integer > 0
      else false
    end
  );

alter table public.teacher_adventure_menu_slots
  drop constraint if exists teacher_adventure_menu_execution_limit_check;
alter table public.teacher_adventure_menu_slots
  add constraint teacher_adventure_menu_execution_limit_check check (
    jsonb_typeof(execution_limit) = 'object'
    and execution_limit->>'mode' in ('questions','time')
    and case
      when coalesce(execution_limit->>'value', '') ~ '^[0-9]+$'
        then (execution_limit->>'value')::integer > 0
      else false
    end
  );

alter table public.student_adventure_passages
  drop constraint if exists student_adventure_passages_execution_limit_check;
alter table public.student_adventure_passages
  add constraint student_adventure_passages_execution_limit_check check (
    jsonb_typeof(execution_limit) = 'object'
    and execution_limit->>'mode' in ('questions','time')
    and case
      when coalesce(execution_limit->>'value', '') ~ '^[0-9]+$'
        then (execution_limit->>'value')::integer > 0
      else false
    end
  );

-- ---------------------------------------------------------
-- 2) Missions : migration douce de l'ancien nombre global
--    vers chaque étape. Le JSON de mission_steps suffit.
-- ---------------------------------------------------------

update public.mission_steps ms
set step_options_json = jsonb_set(
  coalesce(ms.step_options_json, '{}'::jsonb),
  '{execution_limit}',
  jsonb_build_object('mode','questions','value',greatest(1, coalesce(m.question_count, 5))),
  true
)
from public.missions m
where m.id = ms.mission_id
  and not (coalesce(ms.step_options_json, '{}'::jsonb) ? 'execution_limit');

-- ---------------------------------------------------------
-- 3) Sauvegarde des menus système Aventure avec execution_limit
-- ---------------------------------------------------------

create or replace function public.replace_adventure_default_menu(
  p_grade_level text,
  p_slots jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé au super-admin.';
  end if;

  if p_grade_level not in ('CP', 'CE1', 'CE2', 'CM1', 'CM2') then
    raise exception 'Niveau Aventure invalide : %.', p_grade_level;
  end if;

  if jsonb_typeof(coalesce(p_slots, '[]'::jsonb)) <> 'array' then
    raise exception 'La liste des cases Aventure doit être un tableau JSON.';
  end if;

  delete from public.adventure_default_menu_slots
  where grade_level = p_grade_level;

  insert into public.adventure_default_menu_slots (
    grade_level, menu_number, day_number, slot_number,
    item_type, grade_folder_id, catalog_activity_id, execution_limit
  )
  select
    p_grade_level,
    item.menu_number,
    item.day_number,
    item.slot_number,
    item.item_type,
    nullif(item.grade_folder_id, ''),
    nullif(item.catalog_activity_id, ''),
    case
      when item.execution_limit is not null
       and jsonb_typeof(item.execution_limit) = 'object'
       and item.execution_limit->>'mode' in ('questions','time')
       and case
         when coalesce(item.execution_limit->>'value', '') ~ '^[0-9]+$'
           then (item.execution_limit->>'value')::integer > 0
         else false
       end
        then item.execution_limit
      else '{"mode":"questions","value":5}'::jsonb
    end
  from jsonb_to_recordset(coalesce(p_slots, '[]'::jsonb)) as item(
    menu_number integer,
    day_number integer,
    slot_number integer,
    item_type text,
    grade_folder_id text,
    catalog_activity_id text,
    execution_limit jsonb
  );
end;
$$;

grant execute on function public.replace_adventure_default_menu(text, jsonb) to authenticated;

-- ---------------------------------------------------------
-- 4) Projection effective V2 : même logique que le moteur
--    existant, avec la règle d'arrêt.
-- ---------------------------------------------------------

create or replace function public.get_effective_adventure_menu_slots_v2(
  p_teacher_space_id bigint,
  p_grade_level text,
  p_menu_number integer,
  p_day_number integer
)
returns table (
  slot_number integer,
  item_type text,
  grade_folder_id text,
  catalog_activity_id text,
  execution_limit jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    generated.slot_number,
    case
      when teacher_slot.item_type = 'empty' then 'empty'
      else coalesce(teacher_slot.item_type, default_slot.item_type, 'empty')
    end as item_type,
    case
      when teacher_slot.item_type = 'empty' then null
      when teacher_slot.item_type = 'objective' then teacher_slot.grade_folder_id
      when teacher_slot.item_type = 'activity' then null
      else default_slot.grade_folder_id
    end as grade_folder_id,
    case
      when teacher_slot.item_type = 'empty' then null
      when teacher_slot.item_type = 'activity' then teacher_slot.catalog_activity_id
      when teacher_slot.item_type = 'objective' then null
      else default_slot.catalog_activity_id
    end as catalog_activity_id,
    case
      when teacher_slot.item_type = 'empty' then '{"mode":"questions","value":5}'::jsonb
      when teacher_slot.item_type is not null then teacher_slot.execution_limit
      else coalesce(default_slot.execution_limit, '{"mode":"questions","value":5}'::jsonb)
    end as execution_limit
  from generate_series(1, 6) as generated(slot_number)
  left join public.teacher_adventure_menu_slots teacher_slot
    on teacher_slot.teacher_space_id = p_teacher_space_id
   and teacher_slot.grade_level = p_grade_level
   and teacher_slot.menu_number = p_menu_number
   and teacher_slot.day_number = p_day_number
   and teacher_slot.slot_number = generated.slot_number
  left join public.adventure_default_menu_slots default_slot
    on default_slot.grade_level = p_grade_level
   and default_slot.menu_number = p_menu_number
   and default_slot.day_number = p_day_number
   and default_slot.slot_number = generated.slot_number
  order by generated.slot_number;
$$;

revoke all on function public.get_effective_adventure_menu_slots_v2(bigint,text,integer,integer)
from public, anon, authenticated;

-- ---------------------------------------------------------
-- 5) L'ouverture d'une journée fige aussi execution_limit.
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
    from public.get_effective_adventure_menu_slots_v2(
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
      execution_limit,
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
      effective.execution_limit,
      'pending'
    from public.get_effective_adventure_menu_slots_v2(
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


grant execute
on function public.open_student_adventure_day(text, bigint, text)
to anon, authenticated;

commit;
