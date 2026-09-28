-- =========================================================
-- PATCH 58 — HISTORIQUE V2 : OUTILS / QUIZ / SÉRIES / MISSIONS
-- À exécuter APRÈS 57_remove_legacy_missions_and_quiz_tab.sql.
--
-- Le mot « Mission » reste le vocabulaire élève, mais l'historique
-- repose désormais sur activity_assignments / teacher_sequences.
-- Les snapshots enregistrés sont autonomes : l'affichage ne reconstruit
-- jamais une ancienne question depuis l'activité actuelle.
-- =========================================================

begin;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------
-- 1) Identité moderne de la source jouée
-- ---------------------------------------------------------

alter table public.student_activity_sessions
  add column if not exists history_schema_version integer not null default 2,
  add column if not exists source_type text null,
  add column if not exists source_id text null,
  add column if not exists activity_type text not null default 'tool',
  add column if not exists activity_assignment_id uuid null references public.activity_assignments(id) on delete set null,
  add column if not exists sequence_item_id uuid null references public.teacher_sequence_items(id) on delete set null,
  add column if not exists mission_run_id uuid null;

alter table public.student_activity_sessions
  drop constraint if exists student_activity_sessions_activity_type_check;
alter table public.student_activity_sessions
  add constraint student_activity_sessions_activity_type_check
  check (activity_type in ('tool', 'quiz', 'series'));

alter table public.student_activity_sessions
  drop constraint if exists student_activity_sessions_source_type_check;
alter table public.student_activity_sessions
  add constraint student_activity_sessions_source_type_check
  check (source_type is null or source_type in ('catalog_activity', 'teacher_activity'));

-- L'historique doit survivre à la suppression d'une activité source.
alter table public.student_activity_sessions
  drop constraint if exists student_activity_sessions_catalog_activity_id_fkey;
alter table public.student_activity_sessions
  alter column catalog_activity_id drop not null;
alter table public.student_activity_sessions
  add constraint student_activity_sessions_catalog_activity_id_fkey
  foreign key (catalog_activity_id) references public.catalog_activities(id) on delete set null;

create index if not exists student_activity_sessions_assignment_idx
on public.student_activity_sessions (activity_assignment_id, mission_run_id, started_at);

create index if not exists student_activity_sessions_source_idx
on public.student_activity_sessions (source_type, source_id, started_at desc);

-- Les anciennes colonnes mission_id / mission_step_id / mission_run restent
-- temporairement présentes mais ne sont plus utilisées. Les conserver évite de
-- fragiliser d'anciennes fonctions SQL historiques encore installées ; toutes les
-- nouvelles écritures utilisent activity_assignment_id / sequence_item_id / mission_run_id.

-- ---------------------------------------------------------
-- 2) Ouvrir une tentative avec le nouveau système Mission
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
  v_activity_id text := nullif(btrim(coalesce(p_catalog_activity_id, '')), '');
  v_context text := lower(btrim(coalesce(p_context, 'exploration')));
  v_level integer := greatest(1, least(5, coalesce(p_started_level, 3)));
  v_existing_id uuid;
  v_stale record;
  v_attempt_id uuid;
  v_metadata jsonb := coalesce(p_metadata_json, '{}'::jsonb);
  v_source_type text := nullif(btrim(coalesce(v_metadata ->> 'sourceType', '')), '');
  v_source_id text := nullif(btrim(coalesce(v_metadata ->> 'sourceId', '')), '');
  v_activity_type text := lower(btrim(coalesce(v_metadata ->> 'activityType', 'tool')));
  v_assignment_id uuid;
  v_sequence_item_id uuid;
  v_mission_run_id uuid;
  v_assignment public.activity_assignments%rowtype;
  v_seq_item public.teacher_sequence_items%rowtype;
begin
  if v_context = 'aventure' then v_context := 'adventure'; end if;
  if v_context not in ('exploration', 'mission', 'adventure') then
    raise exception 'Contexte d''historique invalide.' using errcode = '22023';
  end if;

  v_student_id := public.resolve_history_student(p_access_code, p_student_id, p_student_code);
  if v_student_id is null then
    raise exception 'Code élève invalide.' using errcode = '28000';
  end if;

  select ts.id, tc.id into v_teacher_space_id, v_teacher_class_id
  from public.students s
  join public.teacher_classes tc on tc.id = s.teacher_class_id
  join public.teacher_spaces ts on ts.id = tc.teacher_space_id
  where s.id = v_student_id;

  if jsonb_typeof(v_metadata) <> 'object' or octet_length(v_metadata::text) > 98304 then
    raise exception 'Métadonnées d’historique invalides ou trop volumineuses.' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_config_snapshot, '{}'::jsonb)) <> 'object'
     or octet_length(coalesce(p_config_snapshot, '{}'::jsonb)::text) > 98304 then
    raise exception 'Configuration d’historique invalide ou trop volumineuse.' using errcode = '22023';
  end if;
  if v_activity_type not in ('tool', 'quiz', 'series') then v_activity_type := 'tool'; end if;

  if v_context in ('exploration', 'adventure') then
    v_source_type := 'catalog_activity';
    v_source_id := coalesce(v_source_id, v_activity_id);
    if v_source_id is null or not exists (
      select 1 from public.catalog_activities ca
      where ca.id = v_source_id and ca.status = 'published'
    ) then
      raise exception 'Activité de catalogue introuvable.' using errcode = '22023';
    end if;
    v_activity_id := v_source_id;
  else
    begin v_assignment_id := nullif(v_metadata ->> 'activityAssignmentId', '')::uuid;
    exception when invalid_text_representation then v_assignment_id := null; end;
    begin v_sequence_item_id := nullif(v_metadata ->> 'sequenceItemId', '')::uuid;
    exception when invalid_text_representation then v_sequence_item_id := null; end;
    begin v_mission_run_id := nullif(v_metadata ->> 'missionRunId', '')::uuid;
    exception when invalid_text_representation then v_mission_run_id := null; end;

    if v_assignment_id is null or v_mission_run_id is null then
      raise exception 'Attribution ou passage de Mission manquant.' using errcode = '22023';
    end if;

    select * into v_assignment from public.activity_assignments a
    where a.id = v_assignment_id and a.teacher_space_id = v_teacher_space_id;
    if not found then
      raise exception 'Mission introuvable pour cet espace.' using errcode = '28000';
    end if;

    if not exists (
      select 1 from public.activity_assignment_targets t
      where t.assignment_id = v_assignment_id
        and ((t.target_type = 'student' and t.student_id = v_student_id)
          or (t.target_type = 'class' and t.teacher_class_id = v_teacher_class_id))
    ) then
      raise exception 'Cette Mission n’est pas attribuée à cet élève.' using errcode = '28000';
    end if;

    if v_assignment.source_type = 'sequence' then
      if v_sequence_item_id is null then
        raise exception 'Étape de séquence manquante dans la Mission.' using errcode = '22023';
      end if;
      select tsi.* into v_seq_item
      from public.teacher_sequence_items tsi
      where tsi.id = v_sequence_item_id
        and tsi.sequence_id::text = v_assignment.source_id;
      if not found then
        raise exception 'Étape de séquence incompatible avec cette Mission.' using errcode = '28000';
      end if;
      v_source_type := v_seq_item.source_type;
      v_source_id := v_seq_item.source_id;
    else
      v_sequence_item_id := null;
      v_source_type := v_assignment.source_type;
      v_source_id := v_assignment.source_id;
    end if;

    if v_source_type = 'catalog_activity' then
      v_activity_id := v_source_id;
    else
      v_activity_id := null;
    end if;
  end if;

  if p_client_attempt_id is not null then
    select id into v_existing_id
    from public.student_activity_sessions
    where client_attempt_id = p_client_attempt_id and student_id = v_student_id
    limit 1;
    if v_existing_id is not null then return v_existing_id; end if;
  end if;

  for v_stale in
    update public.student_activity_sessions
    set status = 'interrupted', ended_at = now(),
        duration_ms = greatest(duration_ms,
          least(2147483647::numeric, floor(extract(epoch from (now() - started_at)) * 1000))::integer)
    where student_id = v_student_id and status = 'running'
    returning id
  loop
    perform public.apply_activity_attempt_progress(v_stale.id);
  end loop;

  insert into public.student_activity_sessions (
    student_id, catalog_activity_id, context, client_attempt_id,
    tool_id, tool_instance_id, activity_title, status,
    started_level, ended_level, questions_count, correct_count, wrong_count,
    duration_ms, played_at, started_at, ended_at, metadata_json, config_snapshot,
    progress_applied, history_schema_version, source_type, source_id, activity_type,
    activity_assignment_id, sequence_item_id, mission_run_id
  ) values (
    v_student_id, v_activity_id, v_context, p_client_attempt_id,
    left(btrim(coalesce(p_tool_id, '')), 200), left(btrim(coalesce(p_tool_instance_id, '')), 200),
    left(btrim(coalesce(p_activity_title, '')), 500), 'running',
    v_level, v_level, 0, 0, 0, 0, now(), now(), null,
    v_metadata, coalesce(p_config_snapshot, '{}'::jsonb), false,
    2, v_source_type, v_source_id, v_activity_type,
    v_assignment_id, v_sequence_item_id, v_mission_run_id
  ) returning id into v_attempt_id;

  return v_attempt_id;
end;
$$;

grant execute on function public.start_student_activity_attempt(
  text, bigint, text, text, text, uuid, uuid, uuid, text, text, text, integer, jsonb, jsonb
) to anon, authenticated;

-- ---------------------------------------------------------
-- 3) Progression : Mission = historique uniquement
-- ---------------------------------------------------------

-- La progression de fin de Mission reste gérée par
-- student_activity_assignment_progress. L'historique détaillé ne doit
-- donc appliquer aucun effet supplémentaire pour context='mission'.
-- La fonction du patch 57 sait déjà faire Exploration/Aventure et finit
-- par marquer progress_applied=true pour les autres contextes.

-- ---------------------------------------------------------
-- 4) Réinitialisation enseignant compatible Missions modernes
-- ---------------------------------------------------------

create or replace function public.reset_student_activity_attempt_as_teacher(
  p_attempt_id uuid,
  p_student_id bigint,
  p_delete_history boolean default false
)
returns table (
  context text,
  reset_attempts integer,
  reset_mission_steps integer,
  deleted_history boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_run public.student_activity_sessions%rowtype;
  v_reset_attempts integer := 0;
  v_reset_steps integer := 0;
  v_now timestamptz := now();
begin
  select sas.* into v_run
  from public.student_activity_sessions sas
  where sas.id = p_attempt_id and sas.student_id = p_student_id
  for update;

  if not found then raise exception 'Tentative introuvable.' using errcode = '22023'; end if;

  select ts.owner_user_id into v_owner
  from public.students s
  join public.teacher_classes tc on tc.id = s.teacher_class_id
  join public.teacher_spaces ts on ts.id = tc.teacher_space_id
  where s.id = v_run.student_id;

  if auth.uid() is null or v_owner is distinct from auth.uid() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  if v_run.context = 'exploration' then
    update public.student_activity_sessions sas
    set progress_voided_at = coalesce(sas.progress_voided_at, v_now),
        status = case when sas.status = 'running' then 'abandoned' else sas.status end,
        ended_at = case when sas.status = 'running' then coalesce(sas.ended_at, v_now) else sas.ended_at end
    where sas.id = v_run.id;
    get diagnostics v_reset_attempts = row_count;
    if v_run.catalog_activity_id is not null then
      perform public.recompute_student_activity_progress_state(v_run.student_id, v_run.catalog_activity_id);
    end if;
  elsif v_run.context = 'mission' then
    -- Une Mission moderne est un passage identifié par mission_run_id.
    update public.student_activity_sessions sas
    set progress_voided_at = coalesce(sas.progress_voided_at, v_now),
        status = case when sas.status = 'running' then 'abandoned' else sas.status end,
        ended_at = case when sas.status = 'running' then coalesce(sas.ended_at, v_now) else sas.ended_at end
    where sas.student_id = v_run.student_id
      and sas.context = 'mission'
      and (
        (v_run.mission_run_id is not null and sas.mission_run_id = v_run.mission_run_id)
        or (v_run.mission_run_id is null and sas.id = v_run.id)
      );
    get diagnostics v_reset_attempts = row_count;

    if v_run.activity_assignment_id is not null then
      delete from public.student_activity_assignment_progress
      where assignment_id = v_run.activity_assignment_id
        and student_id = v_run.student_id;
      get diagnostics v_reset_steps = row_count;
    end if;
  else
    raise exception 'La réinitialisation fine de ce mode n''est pas encore disponible.' using errcode = '22023';
  end if;

  if coalesce(p_delete_history, false) then
    if v_run.context = 'mission' and v_run.mission_run_id is not null then
      delete from public.student_activity_sessions
      where student_id = v_run.student_id and mission_run_id = v_run.mission_run_id;
    else
      delete from public.student_activity_sessions
      where id = v_run.id and student_id = v_run.student_id;
    end if;
  end if;

  return query select v_run.context, v_reset_attempts, v_reset_steps, coalesce(p_delete_history, false);
end;
$$;

revoke all on function public.reset_student_activity_attempt_as_teacher(uuid, bigint, boolean) from public, anon;
grant execute on function public.reset_student_activity_attempt_as_teacher(uuid, bigint, boolean) to authenticated;

commit;
