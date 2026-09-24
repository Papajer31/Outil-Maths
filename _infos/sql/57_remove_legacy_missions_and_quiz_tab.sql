-- =========================================================
-- PATCH 57 — SUPPRESSION DE L’ANCIEN SYSTÈME MISSIONS
--              + NETTOYAGE DU CATALOGUE / AVENTURE
-- À exécuter APRÈS 56_student_history_full_reset.sql.
--
-- IMPORTANT :
-- - « Mission » reste le vocabulaire / lore côté élève ;
-- - les Missions élève reposent désormais uniquement sur
--   activity_assignments / teacher_sequences ;
-- - ce patch supprime l’ANCIEN modèle missions/mission_steps.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Realtime : retirer les triggers de l’ancien modèle
-- ---------------------------------------------------------

drop trigger if exists trg_tujer_realtime_missions on public.missions;
drop trigger if exists trg_tujer_realtime_mission_assignments on public.mission_assignments;
drop trigger if exists trg_tujer_realtime_mission_steps on public.mission_steps;

drop function if exists public.tujer_realtime_mission_child_change();

-- ---------------------------------------------------------
-- 2) Historique : détacher les anciennes FK Mission
-- ---------------------------------------------------------

-- L’historique élève a été volontairement réinitialisé avant ce patch.
update public.student_activity_sessions
set mission_id = null,
    mission_step_id = null,
    mission_run = null
where mission_id is not null
   or mission_step_id is not null
   or mission_run is not null;

-- Ces colonnes restent temporairement présentes pour ne pas changer, dans ce
-- même patch, la signature des RPC d’historique. Elles seront désormais NULL
-- pour les nouvelles Missions fondées sur activity_assignments.
alter table public.student_activity_sessions
  drop constraint if exists student_activity_sessions_mission_id_fkey;
alter table public.student_activity_sessions
  drop constraint if exists student_activity_sessions_mission_step_id_fkey;

drop trigger if exists trg_student_activity_mission_run
on public.student_activity_sessions;

drop trigger if exists trg_student_mission_progress_refresh_status
on public.student_mission_step_progress;

-- ---------------------------------------------------------
-- 3) Fonctions exclusivement liées à l’ancien modèle
-- ---------------------------------------------------------

drop function if exists public.get_space_missions(text, bigint[], boolean);
drop function if exists public.get_space_mission_steps(text, uuid);
drop function if exists public.get_space_mission_steps(text, uuid, bigint);
drop function if exists public.reactivate_mission_as_teacher(uuid);
drop function if exists public.refresh_mission_completion_status(uuid);
drop function if exists public.stamp_student_activity_mission_run();
drop function if exists public.on_student_mission_progress_refresh_status();

-- Ce trigger dépend encore de validate_mission_assignment(). Il faut le retirer
-- AVANT de supprimer la fonction (PostgreSQL refuse sinon le DROP FUNCTION).
drop trigger if exists trg_validate_mission_assignment on public.mission_assignments;
drop function if exists public.validate_mission_assignment();

-- ---------------------------------------------------------
-- 4) Tables de l’ancien système Missions
-- ---------------------------------------------------------

drop table if exists public.student_mission_step_progress;
drop table if exists public.mission_assignments;
drop table if exists public.mission_steps;
drop table if exists public.missions;
drop table if exists public.mission_folders;

-- Fonctions de validation devenues orphelines avec les anciennes tables.
drop function if exists public.validate_mission_folder_ref();
drop function if exists public.validate_mission_folder_parent();

-- Activité technique créée uniquement pour les anciens « Quiz directs » de Mission.
delete from public.student_adventure_passages
where catalog_activity_id = 'system.quiz.direct';
delete from public.student_activity_sessions
where catalog_activity_id = 'system.quiz.direct';
delete from public.student_activity_progress
where catalog_activity_id = 'system.quiz.direct';
delete from public.catalog_activity_visibility
where catalog_activity_id = 'system.quiz.direct';
delete from public.catalog_activities
where id = 'system.quiz.direct';

-- ---------------------------------------------------------
-- 5) Finalisation d’historique : Exploration + Aventure uniquement
-- ---------------------------------------------------------

-- La nouvelle Mission (activity_assignments) ne crée pas actuellement
-- d’historique détaillé : elle utilise skip_detailed_history côté élève.
-- On retire ici les branches de progression qui dépendaient des anciennes
-- tables Missions afin qu’Exploration et Aventure ne gardent aucune référence
-- morte au schéma supprimé.
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
          count(*),
          count(*) filter (where sap.status not in ('completed', 'skipped'))
          into v_passage_count, v_open_passage_count
        from public.student_adventure_passages sap
        where sap.adventure_day_id = v_passage.adventure_day_id;

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

revoke all on function public.apply_activity_attempt_progress(uuid)
from public, anon, authenticated;

-- ---------------------------------------------------------
-- 5 bis) Fonctions transversales : retirer leurs branches anciennes Missions
-- ---------------------------------------------------------

-- Le trigger d'effets adaptatifs reste utile à Exploration. Les nouvelles
-- « Missions » élève fondées sur activity_assignments ne créent pas d'historique
-- détaillé (skip_detailed_history), donc elles n'ont plus besoin de mission_steps.
create or replace function public.sync_student_activity_attempt_effect_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.questions_count, 0) <= 0 then
    return new;
  end if;

  if new.context = 'exploration' then
    new.affects_adaptive_level := true;
  elsif new.context = 'mission'
        and jsonb_typeof(coalesce(new.metadata_json, '{}'::jsonb)) = 'object'
        and coalesce(new.metadata_json, '{}'::jsonb) ? 'catalogAdaptive'
        and lower(coalesce(new.metadata_json ->> 'catalogAdaptive', 'false')) = 'true' then
    -- Compatibilité douce si un jour l'historique détaillé des nouvelles
    -- Missions est réactivé : le flag embarqué suffit, sans ancienne table.
    new.affects_adaptive_level := true;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_student_activity_attempt_effect_flags()
from public, anon, authenticated;

-- Le reset complet d'un élève doit continuer à fonctionner après la disparition
-- de student_mission_step_progress.
create or replace function public.delete_all_student_activity_data_as_teacher(
  p_student_id bigint
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_deleted_sessions integer := 0;
begin
  if p_student_id is null or p_student_id <= 0 then
    raise exception 'Élève invalide.' using errcode = '22023';
  end if;

  select ts.owner_user_id
    into v_owner
  from public.students s
  join public.teacher_classes tc on tc.id = s.teacher_class_id
  join public.teacher_spaces ts on ts.id = tc.teacher_space_id
  where s.id = p_student_id;

  if v_owner is null then
    raise exception 'Élève introuvable.' using errcode = '22023';
  end if;

  if auth.uid() is null or v_owner is distinct from auth.uid() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  delete from public.student_activity_assignment_progress where student_id = p_student_id;
  delete from public.student_activity_progress_baseline where student_id = p_student_id;
  delete from public.student_activity_progress where student_id = p_student_id;
  delete from public.student_catalog_activity_attempts where student_id = p_student_id;
  delete from public.student_catalog_activity_levels where student_id = p_student_id;
  delete from public.student_adventure_days where student_id = p_student_id;
  delete from public.student_adventure_tier_progress where student_id = p_student_id;

  delete from public.student_activity_sessions where student_id = p_student_id;
  get diagnostics v_deleted_sessions = row_count;
  return v_deleted_sessions;
end;
$$;

revoke all on function public.delete_all_student_activity_data_as_teacher(bigint)
from public, anon;
grant execute on function public.delete_all_student_activity_data_as_teacher(bigint)
to authenticated;

-- Le patch historique « Quiz direct en Mission » avait étendu cette fonction
-- aux anciennes tables mission_steps/missions. On la recale sur le Catalogue
-- ET sur le nouveau système d'attributions/séquences.
create or replace function public.is_public_catalog_quiz_resource(p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Quiz/Séries système publiés dans Exploration.
    exists (
      select 1
      from public.quiz_resources qr
      join public.quizzes q on q.id = qr.quiz_id
      join public.catalog_activities ca
        on ca.status = 'published'
       and ca.tool_id = 'quiz'
      where qr.resource_id = p_resource_id
        and (
          (ca.levels_json -> '__editor_source' ->> 'source_quiz_id') = q.id::text
          or exists (
            select 1
            from jsonb_each(ca.levels_json) as level(level_key, level_value)
            where (level.level_value #>> '{settings,quizId}') = q.id::text
          )
        )
    )
    or
    -- Quiz/Séries personnels réellement attribués dans le NOUVEAU système
    -- « Mission » élève, directement ou à l'intérieur d'une séquence.
    exists (
      select 1
      from public.quiz_resources qr
      join public.quizzes q on q.id = qr.quiz_id
      join public.teacher_activities ta on ta.source_quiz_id = q.id
      where qr.resource_id = p_resource_id
        and exists (
          select 1
          from public.activity_assignments aa
          where aa.teacher_space_id = ta.teacher_space_id
            and exists (
              select 1
              from public.activity_assignment_targets aat
              where aat.assignment_id = aa.id
            )
            and (
              (aa.source_type = 'teacher_activity' and aa.source_id = ta.id::text)
              or
              (aa.source_type = 'sequence' and exists (
                select 1
                from public.teacher_sequence_items tsi
                join public.teacher_sequences ts on ts.id = tsi.sequence_id
                where tsi.sequence_id::text = aa.source_id
                  and ts.teacher_space_id = ta.teacher_space_id
                  and tsi.source_type = 'teacher_activity'
                  and tsi.source_id = ta.id::text
              ))
            )
        )
    );
$$;

revoke all on function public.is_public_catalog_quiz_resource(uuid) from public;
grant execute on function public.is_public_catalog_quiz_resource(uuid) to anon, authenticated;

-- ---------------------------------------------------------
-- 6) Usage admin du catalogue : plus de compteur ancienne Mission
-- ---------------------------------------------------------

drop function if exists public.get_catalog_activity_usage_as_admin(text);

create function public.get_catalog_activity_usage_as_admin(p_activity_id text)
returns table (
  catalog_activity_id text,
  progress_count integer,
  sessions_count integer,
  visibility_count integer,
  adventure_passages_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_activity_id text := btrim(coalesce(p_activity_id, ''));
begin
  if not public.is_super_admin() then
    raise exception 'not allowed';
  end if;

  return query
  select
    v_activity_id,
    (select count(*)::integer from public.student_activity_progress sap where sap.catalog_activity_id = v_activity_id),
    (select count(*)::integer from public.student_activity_sessions sas where sas.catalog_activity_id = v_activity_id),
    (select count(*)::integer from public.catalog_activity_visibility cav where cav.catalog_activity_id = v_activity_id),
    (select count(*)::integer from public.student_adventure_passages sap where sap.catalog_activity_id = v_activity_id);
end;
$$;

grant execute on function public.get_catalog_activity_usage_as_admin(text)
to authenticated;

-- ---------------------------------------------------------
-- 7) Suppression définitive d’une activité système
-- ---------------------------------------------------------

-- Les menus Aventure sont déjà en ON DELETE CASCADE. Les passages d’une journée
-- avaient volontairement ON DELETE RESTRICT : on les retire explicitement avant
-- l’activité. On nettoie aussi le quiz/série système source lorsqu’il n’est plus
-- référencé par aucune autre activité système.
create or replace function public.delete_catalog_activity_cascade(p_activity_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id text := btrim(coalesce(p_activity_id, ''));
  v_source_quiz_id uuid;
begin
  if not public.is_super_admin() then
    raise exception 'not allowed';
  end if;
  if v_activity_id = '' then
    raise exception 'activity id is required';
  end if;

  begin
    select nullif(ca.levels_json -> '__editor_source' ->> 'source_quiz_id', '')::uuid
      into v_source_quiz_id
    from public.catalog_activities ca
    where ca.id = v_activity_id;
  exception when invalid_text_representation then
    v_source_quiz_id := null;
  end;

  delete from public.student_adventure_passages where catalog_activity_id = v_activity_id;
  delete from public.student_activity_sessions where catalog_activity_id = v_activity_id;
  delete from public.student_activity_progress where catalog_activity_id = v_activity_id;
  delete from public.catalog_activity_visibility where catalog_activity_id = v_activity_id;

  if to_regclass('public.student_catalog_activity_attempts') is not null then
    execute 'delete from public.student_catalog_activity_attempts where catalog_activity_id = $1' using v_activity_id;
  end if;
  if to_regclass('public.student_catalog_activity_levels') is not null then
    execute 'delete from public.student_catalog_activity_levels where catalog_activity_id = $1' using v_activity_id;
  end if;

  delete from public.catalog_activities where id = v_activity_id;

  if v_source_quiz_id is not null
     and not exists (
       select 1
       from public.teacher_activities ta
       where ta.source_quiz_id = v_source_quiz_id
     )
     and not exists (
       select 1
       from public.catalog_activities ca
       where nullif(ca.levels_json -> '__editor_source' ->> 'source_quiz_id', '') = v_source_quiz_id::text
     ) then
    delete from public.quizzes
    where id = v_source_quiz_id
      and is_system = true;
  end if;
end;
$$;

grant execute on function public.delete_catalog_activity_cascade(text)
to authenticated;

commit;
