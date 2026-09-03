-- =========================================================
-- 37_student_attempt_reset_controls.sql
-- Contrôle fin des tentatives élève : Exploration + Missions.
-- À exécuter APRÈS 36_mission_step_difficulty.sql.
--
-- Principes :
-- - l'historique est une trace ;
-- - la progression est un état séparé ;
-- - masquer une trace ne doit pas modifier la progression ;
-- - réinitialiser les effets doit recalculer l'état à partir des autres tentatives ;
-- - supprimer totalement = réinitialiser les effets + supprimer physiquement la tentative.
--
-- Aventure reste volontairement hors du périmètre de réinitialisation fine.
-- =========================================================

begin;

grant usage on schema public to authenticated;

-- ---------------------------------------------------------
-- 1) Marqueurs indépendants : visibilité / effets pédagogiques
-- ---------------------------------------------------------

alter table public.student_activity_sessions
  add column if not exists history_hidden_at timestamptz null,
  add column if not exists progress_voided_at timestamptz null,
  add column if not exists affects_adaptive_level boolean not null default false;

create index if not exists student_activity_sessions_visible_history_idx
on public.student_activity_sessions (student_id, started_at desc)
where history_hidden_at is null;

create index if not exists student_activity_sessions_progress_rebuild_idx
on public.student_activity_sessions (student_id, catalog_activity_id, started_at desc)
where progress_voided_at is null;

-- Backfill : Exploration a toujours piloté le niveau adaptatif.
update public.student_activity_sessions
set affects_adaptive_level = true
where context = 'exploration'
  and questions_count > 0
  and affects_adaptive_level is distinct from true;

-- Backfill Missions adaptatives existantes. Pour les nouvelles tentatives,
-- le booléen est figé au fil des mises à jour grâce au trigger ci-dessous.
update public.student_activity_sessions sas
set affects_adaptive_level = true
from public.mission_steps ms
where sas.context = 'mission'
  and sas.mission_step_id = ms.id
  and ms.difficulty_mode = 'adaptive'
  and sas.questions_count > 0
  and sas.affects_adaptive_level is distinct from true;

-- ---------------------------------------------------------
-- 2) Figer le fait qu'une tentative affecte le niveau adaptatif
-- ---------------------------------------------------------

create or replace function public.sync_student_activity_attempt_effect_flags()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata_has_flag boolean := false;
  v_metadata_adaptive boolean := false;
  v_step_adaptive boolean := false;
begin
  if coalesce(new.questions_count, 0) <= 0 then
    return new;
  end if;

  if new.context = 'exploration' then
    new.affects_adaptive_level := true;
    return new;
  end if;

  if new.context <> 'mission' then
    return new;
  end if;

  if jsonb_typeof(coalesce(new.metadata_json, '{}'::jsonb)) = 'object'
     and coalesce(new.metadata_json, '{}'::jsonb) ? 'catalogAdaptive' then
    v_metadata_has_flag := true;
    v_metadata_adaptive := lower(coalesce(new.metadata_json ->> 'catalogAdaptive', 'false')) = 'true';
  end if;

  if v_metadata_has_flag then
    if v_metadata_adaptive then
      new.affects_adaptive_level := true;
    end if;
    return new;
  end if;

  if new.mission_step_id is not null then
    select (ms.difficulty_mode = 'adaptive')
      into v_step_adaptive
    from public.mission_steps ms
    where ms.id = new.mission_step_id;

    if coalesce(v_step_adaptive, false) then
      new.affects_adaptive_level := true;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_student_activity_attempt_effect_flags
on public.student_activity_sessions;

create trigger trg_student_activity_attempt_effect_flags
before insert or update of questions_count, context, mission_step_id, metadata_json
on public.student_activity_sessions
for each row execute function public.sync_student_activity_attempt_effect_flags();

revoke all on function public.sync_student_activity_attempt_effect_flags() from public, anon, authenticated;

-- ---------------------------------------------------------
-- 3) Baseline de compatibilité pour les suppressions antérieures au patch 37
-- ---------------------------------------------------------
-- Le patch 33 supprimait physiquement les traces sans toucher aux agrégats.
-- On conserve donc ici uniquement la part de progression actuelle qui n'est
-- plus explicable par les sessions encore présentes. Cette baseline évite
-- qu'un recalcul futur fasse disparaître une ancienne progression légitime.

create table if not exists public.student_activity_progress_baseline (
  student_id bigint not null references public.students(id) on delete cascade,
  catalog_activity_id text not null references public.catalog_activities(id) on delete cascade,
  total_sessions integer not null default 0,
  total_questions integer not null default 0,
  total_correct integer not null default 0,
  total_wrong integer not null default 0,
  current_level integer null,
  level_played_at timestamptz null,
  created_at timestamptz not null default now(),

  primary key (student_id, catalog_activity_id),
  constraint student_activity_progress_baseline_counters_check check (
    total_sessions >= 0 and total_questions >= 0 and total_correct >= 0 and total_wrong >= 0
  ),
  constraint student_activity_progress_baseline_level_check check (
    current_level is null or current_level between 1 and 5
  )
);

alter table public.student_activity_progress_baseline enable row level security;
revoke all on public.student_activity_progress_baseline from anon, authenticated;

insert into public.student_activity_progress_baseline (
  student_id,
  catalog_activity_id,
  total_sessions,
  total_questions,
  total_correct,
  total_wrong,
  current_level,
  level_played_at
)
select
  sap.student_id,
  sap.catalog_activity_id,
  greatest(0, sap.total_sessions - coalesce(hist.total_sessions, 0)),
  greatest(0, sap.total_questions - coalesce(hist.total_questions, 0)),
  greatest(0, sap.total_correct - coalesce(hist.total_correct, 0)),
  greatest(0, sap.total_wrong - coalesce(hist.total_wrong, 0)),
  case when represented.has_matching_event then null else sap.current_level end,
  case when represented.has_matching_event then null else sap.last_played_at end
from public.student_activity_progress sap
left join lateral (
  select
    count(*)::integer as total_sessions,
    coalesce(sum(sas.questions_count), 0)::integer as total_questions,
    coalesce(sum(sas.correct_count), 0)::integer as total_correct,
    coalesce(sum(sas.wrong_count), 0)::integer as total_wrong
  from public.student_activity_sessions sas
  where sas.student_id = sap.student_id
    and sas.catalog_activity_id = sap.catalog_activity_id
    and sas.context = 'exploration'
    and sas.progress_applied = true
    and sas.questions_count > 0
) hist on true
left join lateral (
  select exists (
    select 1
    from public.student_activity_sessions sas
    where sas.student_id = sap.student_id
      and sas.catalog_activity_id = sap.catalog_activity_id
      and sas.affects_adaptive_level = true
      and sas.questions_count > 0
      and (sas.context = 'exploration' or sas.progress_applied = true)
      and sap.last_played_at is not null
      and abs(extract(epoch from (
        coalesce(sas.ended_at, sas.started_at, sas.played_at, sas.created_at) - sap.last_played_at
      ))) <= 2
      and greatest(1, least(5, coalesce(sas.ended_level, 3))) = sap.current_level
  ) as has_matching_event
) represented on true
on conflict (student_id, catalog_activity_id) do nothing;

-- ---------------------------------------------------------
-- 4) Reconstruction d'une progression activité
-- ---------------------------------------------------------
-- student_activity_progress contient :
-- - les compteurs Exploration seulement ;
-- - le dernier niveau adaptatif partagé Exploration / Mission adaptative.
-- Cette fonction reconstruit ces deux dimensions à partir des tentatives
-- encore actives, y compris les traces masquées de l'historique.

create or replace function public.recompute_student_activity_progress_state(
  p_student_id bigint,
  p_catalog_activity_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id text := btrim(coalesce(p_catalog_activity_id, ''));
  v_total_sessions integer := 0;
  v_total_questions integer := 0;
  v_total_correct integer := 0;
  v_total_wrong integer := 0;
  v_base_sessions integer := 0;
  v_base_questions integer := 0;
  v_base_correct integer := 0;
  v_base_wrong integer := 0;
  v_current_level integer := 3;
  v_last_played_at timestamptz := null;
  v_has_level_effect boolean := false;
begin
  if p_student_id is null or v_activity_id = '' then
    return;
  end if;

  select
    coalesce(b.total_sessions, 0),
    coalesce(b.total_questions, 0),
    coalesce(b.total_correct, 0),
    coalesce(b.total_wrong, 0)
  into
    v_base_sessions,
    v_base_questions,
    v_base_correct,
    v_base_wrong
  from (select 1) one
  left join public.student_activity_progress_baseline b
    on b.student_id = p_student_id
   and b.catalog_activity_id = v_activity_id;

  select
    v_base_sessions + count(*)::integer,
    v_base_questions + coalesce(sum(sas.questions_count), 0)::integer,
    v_base_correct + coalesce(sum(sas.correct_count), 0)::integer,
    v_base_wrong + coalesce(sum(sas.wrong_count), 0)::integer
  into
    v_total_sessions,
    v_total_questions,
    v_total_correct,
    v_total_wrong
  from public.student_activity_sessions sas
  where sas.student_id = p_student_id
    and sas.catalog_activity_id = v_activity_id
    and sas.context = 'exploration'
    and sas.progress_applied = true
    and sas.progress_voided_at is null
    and sas.questions_count > 0;

  select event_level, event_time
  into v_current_level, v_last_played_at
  from (
    select
      greatest(1, least(5, b.current_level)) as event_level,
      b.level_played_at as event_time,
      0 as event_priority
    from public.student_activity_progress_baseline b
    where b.student_id = p_student_id
      and b.catalog_activity_id = v_activity_id
      and b.current_level is not null
      and b.level_played_at is not null

    union all

    select
      greatest(1, least(5, coalesce(sas.ended_level, 3))) as event_level,
      coalesce(sas.ended_at, sas.started_at, sas.played_at, sas.created_at) as event_time,
      1 as event_priority
    from public.student_activity_sessions sas
    where sas.student_id = p_student_id
      and sas.catalog_activity_id = v_activity_id
      and sas.progress_voided_at is null
      and sas.affects_adaptive_level = true
      and sas.questions_count > 0
      -- Exploration mémorise le niveau question par question ; une Mission
      -- adaptative ne le mémorise qu'à la finalisation de la tentative.
      and (sas.context = 'exploration' or sas.progress_applied = true)
  ) events
  where event_time is not null
  order by event_time desc, event_priority desc
  limit 1;

  v_has_level_effect := found;

  if v_total_sessions <= 0 and not v_has_level_effect then
    delete from public.student_activity_progress sap
    where sap.student_id = p_student_id
      and sap.catalog_activity_id = v_activity_id;
    return;
  end if;

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
    p_student_id,
    v_activity_id,
    case when v_has_level_effect then v_current_level else 3 end,
    greatest(0, v_total_sessions),
    greatest(0, v_total_questions),
    greatest(0, v_total_correct),
    greatest(0, v_total_wrong),
    v_last_played_at
  )
  on conflict (student_id, catalog_activity_id) do update
  set current_level = excluded.current_level,
      total_sessions = excluded.total_sessions,
      total_questions = excluded.total_questions,
      total_correct = excluded.total_correct,
      total_wrong = excluded.total_wrong,
      last_played_at = excluded.last_played_at,
      updated_at = now();
end;
$$;

revoke all on function public.recompute_student_activity_progress_state(bigint, text)
from public, anon, authenticated;

-- ---------------------------------------------------------
-- 5) Masquer seulement la trace historique
-- ---------------------------------------------------------
-- La ligne technique est conservée pour permettre les recalculs ultérieurs.

create or replace function public.hide_student_activity_attempt_as_teacher(
  p_attempt_id uuid,
  p_student_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_run public.student_activity_sessions%rowtype;
begin
  select sas.*
    into v_run
  from public.student_activity_sessions sas
  where sas.id = p_attempt_id
    and sas.student_id = p_student_id
  for update;

  if not found then
    raise exception 'Tentative introuvable.' using errcode = '22023';
  end if;

  select ts.owner_user_id
    into v_owner
  from public.students s
  join public.teacher_classes tc on tc.id = s.teacher_class_id
  join public.teacher_spaces ts on ts.id = tc.teacher_space_id
  where s.id = v_run.student_id;

  if auth.uid() is null or v_owner is distinct from auth.uid() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  update public.student_activity_sessions
  set history_hidden_at = coalesce(history_hidden_at, now())
  where id = v_run.id;

  return true;
end;
$$;

revoke all on function public.hide_student_activity_attempt_as_teacher(uuid, bigint)
from public, anon;
grant execute on function public.hide_student_activity_attempt_as_teacher(uuid, bigint)
to authenticated;

-- ---------------------------------------------------------
-- 6) Réinitialiser les effets d'une tentative
-- ---------------------------------------------------------
-- Exploration : annule uniquement cette tentative puis reconstruit l'activité.
-- Mission : remet l'étape ciblée ET toutes les suivantes à faire ; les effets
-- adaptatifs des tentatives de ces étapes sont eux aussi annulés.
--
-- p_delete_history = true supprime ensuite physiquement la tentative ciblée.

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
  v_target_position integer;
  v_reset_attempts integer := 0;
  v_reset_steps integer := 0;
  v_activity_id text;
  v_now timestamptz := now();
begin
  select sas.*
    into v_run
  from public.student_activity_sessions sas
  where sas.id = p_attempt_id
    and sas.student_id = p_student_id
  for update;

  if not found then
    raise exception 'Tentative introuvable.' using errcode = '22023';
  end if;

  select ts.owner_user_id
    into v_owner
  from public.students s
  join public.teacher_classes tc on tc.id = s.teacher_class_id
  join public.teacher_spaces ts on ts.id = tc.teacher_space_id
  where s.id = v_run.student_id;

  if auth.uid() is null or v_owner is distinct from auth.uid() then
    raise exception 'Accès refusé.' using errcode = '42501';
  end if;

  if v_run.context not in ('exploration', 'mission') then
    raise exception 'La réinitialisation fine de ce mode n''est pas encore disponible.' using errcode = '22023';
  end if;

  if v_run.context = 'exploration' then
    update public.student_activity_sessions sas
    set progress_voided_at = coalesce(sas.progress_voided_at, v_now),
        status = case when sas.status = 'running' then 'abandoned' else sas.status end,
        ended_at = case when sas.status = 'running' then coalesce(sas.ended_at, v_now) else sas.ended_at end
    where sas.id = v_run.id;

    get diagnostics v_reset_attempts = row_count;

    perform public.recompute_student_activity_progress_state(
      v_run.student_id,
      v_run.catalog_activity_id
    );

  else
    -- Une Mission est séquentielle : revenir sur une étape invalide la suite.
    select ms.position
      into v_target_position
    from public.mission_steps ms
    where ms.id = v_run.mission_step_id
      and ms.mission_id = v_run.mission_id;

    if v_target_position is null then
      -- Cas dégradé : étape supprimée depuis. On peut tout de même annuler
      -- l'effet adaptatif de la tentative sélectionnée.
      update public.student_activity_sessions sas
      set progress_voided_at = coalesce(sas.progress_voided_at, v_now),
          status = case when sas.status = 'running' then 'abandoned' else sas.status end,
          ended_at = case when sas.status = 'running' then coalesce(sas.ended_at, v_now) else sas.ended_at end
      where sas.id = v_run.id;

      get diagnostics v_reset_attempts = row_count;

      perform public.recompute_student_activity_progress_state(
        v_run.student_id,
        v_run.catalog_activity_id
      );
    else
      -- Toutes les tentatives des étapes ciblée + suivantes deviennent
      -- sans effet pédagogique, mais restent visibles dans l'historique.
      update public.student_activity_sessions sas
      set progress_voided_at = coalesce(sas.progress_voided_at, v_now),
          status = case when sas.status = 'running' then 'abandoned' else sas.status end,
          ended_at = case when sas.status = 'running' then coalesce(sas.ended_at, v_now) else sas.ended_at end
      from public.mission_steps ms
      where sas.student_id = v_run.student_id
        and sas.context = 'mission'
        and sas.mission_id = v_run.mission_id
        and sas.mission_step_id = ms.id
        and ms.mission_id = v_run.mission_id
        and ms.position >= v_target_position;

      get diagnostics v_reset_attempts = row_count;

      delete from public.student_mission_step_progress smsp
      using public.mission_steps ms
      where smsp.student_id = v_run.student_id
        and smsp.mission_id = v_run.mission_id
        and smsp.mission_step_id = ms.id
        and ms.mission_id = v_run.mission_id
        and ms.position >= v_target_position;

      get diagnostics v_reset_steps = row_count;

      -- Plusieurs étapes peuvent employer plusieurs activités : chacune doit
      -- être reconstruite pour restaurer son niveau adaptatif exact.
      for v_activity_id in
        select distinct sas.catalog_activity_id
        from public.student_activity_sessions sas
        join public.mission_steps ms on ms.id = sas.mission_step_id
        where sas.student_id = v_run.student_id
          and sas.context = 'mission'
          and sas.mission_id = v_run.mission_id
          and ms.mission_id = v_run.mission_id
          and ms.position >= v_target_position
          and btrim(coalesce(sas.catalog_activity_id, '')) <> ''
      loop
        perform public.recompute_student_activity_progress_state(
          v_run.student_id,
          v_activity_id
        );
      end loop;
    end if;
  end if;

  if coalesce(p_delete_history, false) then
    delete from public.student_activity_sessions sas
    where sas.id = v_run.id
      and sas.student_id = v_run.student_id;
  end if;

  return query
  select
    v_run.context,
    v_reset_attempts,
    v_reset_steps,
    coalesce(p_delete_history, false);
end;
$$;

revoke all on function public.reset_student_activity_attempt_as_teacher(uuid, bigint, boolean)
from public, anon;
grant execute on function public.reset_student_activity_attempt_as_teacher(uuid, bigint, boolean)
to authenticated;

-- La suppression directe introduite au patch 33 contournerait désormais le
-- mécanisme de reconstruction. On la retire au profit des RPC ci-dessus.
revoke delete on public.student_activity_sessions from authenticated;
drop policy if exists student_activity_sessions_delete_own on public.student_activity_sessions;

commit;
