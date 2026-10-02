-- =========================================================
-- PATCH 60 — PASSATION « RÉUSSITE » + PARAMÈTRES DE JAUGE
-- À exécuter APRÈS 59_mission_resume_checkpoints.sql.
--
-- Ajoute un troisième mode externe de passation :
--   questions | time | success
-- Les contenus intrinsèques restent en mode intrinsic.
--
-- Pour success :
--   execution_limit_value = nombre de réussites nécessaires
--   execution_limit_config = { milestones, max_time_sec }
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Activités attribuées / séquences / liens directs
-- ---------------------------------------------------------

alter table public.activity_assignments
  add column if not exists execution_limit_config jsonb null;

alter table public.activity_assignments
  drop constraint if exists activity_assignments_execution_mode_check;
alter table public.activity_assignments
  drop constraint if exists activity_assignments_execution_value_check;
alter table public.activity_assignments
  add constraint activity_assignments_execution_mode_check
    check (execution_limit_mode in ('questions', 'time', 'success', 'intrinsic'));
alter table public.activity_assignments
  add constraint activity_assignments_execution_value_check check (
    (execution_limit_mode = 'intrinsic' and execution_limit_value is null and execution_limit_config is null)
    or
    (execution_limit_mode in ('questions', 'time') and execution_limit_value is not null and execution_limit_value > 0 and execution_limit_config is null)
    or
    (
      execution_limit_mode = 'success'
      and execution_limit_value is not null and execution_limit_value > 0
      and jsonb_typeof(execution_limit_config) = 'object'
      and case
        when coalesce(execution_limit_config->>'milestones', '') ~ '^[0-9]+$'
          then (execution_limit_config->>'milestones')::integer between 0 and 12
        else false
      end
      and case
        when coalesce(execution_limit_config->>'max_time_sec', '') ~ '^[0-9]+$'
          then (execution_limit_config->>'max_time_sec')::integer between 60 and 7200
        else false
      end
    )
  );

alter table public.teacher_sequence_items
  add column if not exists execution_limit_config jsonb null;

alter table public.teacher_sequence_items
  drop constraint if exists teacher_sequence_items_execution_mode_check;
alter table public.teacher_sequence_items
  drop constraint if exists teacher_sequence_items_execution_value_check;
alter table public.teacher_sequence_items
  add constraint teacher_sequence_items_execution_mode_check
    check (execution_limit_mode in ('questions', 'time', 'success', 'intrinsic'));
alter table public.teacher_sequence_items
  add constraint teacher_sequence_items_execution_value_check check (
    (execution_limit_mode = 'intrinsic' and execution_limit_value is null and execution_limit_config is null)
    or
    (execution_limit_mode in ('questions', 'time') and execution_limit_value is not null and execution_limit_value > 0 and execution_limit_config is null)
    or
    (
      execution_limit_mode = 'success'
      and execution_limit_value is not null and execution_limit_value > 0
      and jsonb_typeof(execution_limit_config) = 'object'
      and case
        when coalesce(execution_limit_config->>'milestones', '') ~ '^[0-9]+$'
          then (execution_limit_config->>'milestones')::integer between 0 and 12
        else false
      end
      and case
        when coalesce(execution_limit_config->>'max_time_sec', '') ~ '^[0-9]+$'
          then (execution_limit_config->>'max_time_sec')::integer between 60 and 7200
        else false
      end
    )
  );

alter table public.direct_launch_links
  add column if not exists execution_limit_config jsonb null;

alter table public.direct_launch_links
  drop constraint if exists direct_launch_links_execution_mode_check;
alter table public.direct_launch_links
  drop constraint if exists direct_launch_links_execution_value_check;
alter table public.direct_launch_links
  add constraint direct_launch_links_execution_mode_check
    check (execution_limit_mode in ('questions', 'time', 'success', 'intrinsic'));
alter table public.direct_launch_links
  add constraint direct_launch_links_execution_value_check check (
    (execution_limit_mode = 'intrinsic' and execution_limit_value is null and execution_limit_config is null)
    or
    (execution_limit_mode in ('questions', 'time') and execution_limit_value is not null and execution_limit_value > 0 and execution_limit_config is null)
    or
    (
      execution_limit_mode = 'success'
      and execution_limit_value is not null and execution_limit_value > 0
      and jsonb_typeof(execution_limit_config) = 'object'
      and case
        when coalesce(execution_limit_config->>'milestones', '') ~ '^[0-9]+$'
          then (execution_limit_config->>'milestones')::integer between 0 and 12
        else false
      end
      and case
        when coalesce(execution_limit_config->>'max_time_sec', '') ~ '^[0-9]+$'
          then (execution_limit_config->>'max_time_sec')::integer between 60 and 7200
        else false
      end
    )
  );

-- ---------------------------------------------------------
-- 2) Aventure : execution_limit reste un objet JSON
-- ---------------------------------------------------------

alter table public.adventure_default_menu_slots
  drop constraint if exists adventure_default_menu_execution_limit_check;
alter table public.adventure_default_menu_slots
  add constraint adventure_default_menu_execution_limit_check check (
    jsonb_typeof(execution_limit) = 'object'
    and execution_limit->>'mode' in ('questions','time','success')
    and case
      when coalesce(execution_limit->>'value', '') ~ '^[0-9]+$'
        then (execution_limit->>'value')::integer > 0
      else false
    end
    and (
      execution_limit->>'mode' <> 'success'
      or (
        case
          when coalesce(execution_limit->>'milestones', '') ~ '^[0-9]+$'
            then (execution_limit->>'milestones')::integer between 0 and 12
          else false
        end
        and case
          when coalesce(execution_limit->>'max_time_sec', '') ~ '^[0-9]+$'
            then (execution_limit->>'max_time_sec')::integer between 60 and 7200
          else false
        end
      )
    )
  );

alter table public.teacher_adventure_menu_slots
  drop constraint if exists teacher_adventure_menu_execution_limit_check;
alter table public.teacher_adventure_menu_slots
  add constraint teacher_adventure_menu_execution_limit_check check (
    jsonb_typeof(execution_limit) = 'object'
    and execution_limit->>'mode' in ('questions','time','success')
    and case
      when coalesce(execution_limit->>'value', '') ~ '^[0-9]+$'
        then (execution_limit->>'value')::integer > 0
      else false
    end
    and (
      execution_limit->>'mode' <> 'success'
      or (
        case
          when coalesce(execution_limit->>'milestones', '') ~ '^[0-9]+$'
            then (execution_limit->>'milestones')::integer between 0 and 12
          else false
        end
        and case
          when coalesce(execution_limit->>'max_time_sec', '') ~ '^[0-9]+$'
            then (execution_limit->>'max_time_sec')::integer between 60 and 7200
          else false
        end
      )
    )
  );

alter table public.student_adventure_passages
  drop constraint if exists student_adventure_passages_execution_limit_check;
alter table public.student_adventure_passages
  add constraint student_adventure_passages_execution_limit_check check (
    jsonb_typeof(execution_limit) = 'object'
    and execution_limit->>'mode' in ('questions','time','success')
    and case
      when coalesce(execution_limit->>'value', '') ~ '^[0-9]+$'
        then (execution_limit->>'value')::integer > 0
      else false
    end
    and (
      execution_limit->>'mode' <> 'success'
      or (
        case
          when coalesce(execution_limit->>'milestones', '') ~ '^[0-9]+$'
            then (execution_limit->>'milestones')::integer between 0 and 12
          else false
        end
        and case
          when coalesce(execution_limit->>'max_time_sec', '') ~ '^[0-9]+$'
            then (execution_limit->>'max_time_sec')::integer between 60 and 7200
          else false
        end
      )
    )
  );

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
       and item.execution_limit->>'mode' in ('questions','time','success')
       and case
         when coalesce(item.execution_limit->>'value', '') ~ '^[0-9]+$'
           then (item.execution_limit->>'value')::integer > 0
         else false
       end
       and (
         item.execution_limit->>'mode' <> 'success'
         or (
           case
             when coalesce(item.execution_limit->>'milestones', '') ~ '^[0-9]+$'
               then (item.execution_limit->>'milestones')::integer between 0 and 12
             else false
           end
           and case
             when coalesce(item.execution_limit->>'max_time_sec', '') ~ '^[0-9]+$'
               then (item.execution_limit->>'max_time_sec')::integer between 60 and 7200
             else false
           end
         )
       )
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
-- 3) Missions publiques : conserve la signature existante.
--    Le config success de l'attribution seule est injecté dans
--    activity_json pour ne pas changer le type de retour du RPC.
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
                  'execution_limit_config', item.execution_limit_config,
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
    where a.is_active = true
      and (
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
    case
      when c.execution_limit_config is not null
        then c.source_json || jsonb_build_object('__execution_limit_config', c.execution_limit_config)
      else c.source_json
    end as activity_json
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
-- 4) Liens directs : JSON public enrichi, signature inchangée.
-- ---------------------------------------------------------

create or replace function public.resolve_direct_launch(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  link_row public.direct_launch_links%rowtype;
  access_code_value text;
  source_json jsonb;
begin
  select * into link_row
  from public.direct_launch_links dl
  where dl.token = btrim(coalesce(p_token, ''))
    and dl.is_active = true
  limit 1;

  if link_row.id is null then
    return null;
  end if;

  select ts.access_code into access_code_value
  from public.teacher_spaces ts
  where ts.id = link_row.teacher_space_id;

  if link_row.source_type = 'catalog_activity' then
    select to_jsonb(ca) into source_json
    from public.catalog_activities ca
    where ca.id = link_row.source_id
      and ca.status = 'published';

  elsif link_row.source_type = 'teacher_activity' then
    select to_jsonb(ta) into source_json
    from public.teacher_activities ta
    where ta.id::text = link_row.source_id
      and ta.teacher_space_id = link_row.teacher_space_id;

  elsif link_row.source_type = 'sequence' then
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
            'execution_limit_config', item.execution_limit_config,
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
    ) into source_json
    from public.teacher_sequences seq
    where seq.id::text = link_row.source_id
      and seq.teacher_space_id = link_row.teacher_space_id;
  end if;

  if source_json is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', link_row.id,
    'token', link_row.token,
    'title', link_row.title_snapshot,
    'source_type', link_row.source_type,
    'source_id', link_row.source_id,
    'difficulty_mode', link_row.difficulty_mode,
    'difficulty_level', link_row.difficulty_level,
    'execution_limit_mode', link_row.execution_limit_mode,
    'execution_limit_value', link_row.execution_limit_value,
    'execution_limit_config', link_row.execution_limit_config,
    'access_code', access_code_value,
    'activity_json', source_json
  );
end;
$$;

grant execute on function public.resolve_direct_launch(text) to anon, authenticated;

commit;
