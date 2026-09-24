-- =========================================================
-- PATCH 54 — CYCLE DE VIE DES ATTRIBUTIONS D'ACTIVITÉS
-- À exécuter APRÈS 53_teacher_sequences_in_my_activities.sql.
--
-- Ajoute :
-- - la suspension / réactivation d'une attribution ;
-- - la remise à zéro de sa progression minimale afin de la réattribuer.
-- =========================================================

begin;

alter table public.activity_assignments
  add column if not exists is_active boolean not null default true;

create index if not exists activity_assignments_space_active_created_idx
on public.activity_assignments (teacher_space_id, is_active, created_at desc);

-- La remise à zéro est volontairement limitée au marqueur « attribution
-- terminée ». L'historique détaillé des tentatives reste intact.
create or replace function public.reassign_activity_assignment(
  p_assignment_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.activity_assignments a
    join public.teacher_spaces ts on ts.id = a.teacher_space_id
    where a.id = p_assignment_id
      and ts.owner_user_id = auth.uid()
  ) then
    raise exception 'Attribution introuvable ou inaccessible.' using errcode = '42501';
  end if;

  delete from public.student_activity_assignment_progress
  where assignment_id = p_assignment_id;

  get diagnostics v_deleted_count = row_count;

  update public.activity_assignments
  set updated_at = now()
  where id = p_assignment_id;

  return v_deleted_count;
end;
$$;

revoke all on function public.reassign_activity_assignment(uuid) from public, anon;
grant execute on function public.reassign_activity_assignment(uuid) to authenticated;

-- Les attributions suspendues restent visibles par l'enseignant, mais ne sont
-- plus proposées aux élèves.
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

-- Une session déjà ouverte ne peut pas valider une attribution suspendue.
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
      and a.is_active = true
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
