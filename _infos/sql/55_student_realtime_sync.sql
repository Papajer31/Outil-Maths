-- =========================================================
-- PATCH 55 — SYNCHRONISATION TEMPS RÉEL ÉLÈVE
-- À exécuter APRÈS 54_activity_assignment_lifecycle.sql.
--
-- Objectif : prévenir les navigateurs élèves qu'un contenu visible a changé,
-- sans envoyer de donnée pédagogique sensible dans Realtime.
-- Le client reçoit seulement un signal puis recharge les RPC publiques existantes.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Helpers Broadcast
-- ---------------------------------------------------------

create or replace function public.tujer_realtime_send_space(
  p_teacher_space_id bigint,
  p_kind text,
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_access_code text;
begin
  if p_teacher_space_id is null then
    return;
  end if;

  select upper(trim(ts.access_code))
    into v_access_code
  from public.teacher_spaces ts
  where ts.id = p_teacher_space_id;

  if v_access_code is null or v_access_code = '' then
    return;
  end if;

  perform realtime.send(
    jsonb_build_object(
      'kind', coalesce(nullif(trim(p_kind), ''), 'content'),
      'operation', coalesce(nullif(trim(p_operation), ''), 'UPDATE')
    ),
    'content_changed',
    'tujer:space:' || v_access_code,
    false
  );
end;
$$;

revoke all on function public.tujer_realtime_send_space(bigint, text, text)
from public, anon, authenticated;

create or replace function public.tujer_realtime_send_catalog(
  p_kind text,
  p_operation text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform realtime.send(
    jsonb_build_object(
      'kind', coalesce(nullif(trim(p_kind), ''), 'catalog'),
      'operation', coalesce(nullif(trim(p_operation), ''), 'UPDATE')
    ),
    'content_changed',
    'tujer:catalog',
    false
  );
end;
$$;

revoke all on function public.tujer_realtime_send_catalog(text, text)
from public, anon, authenticated;

-- ---------------------------------------------------------
-- 2) Tables portant directement teacher_space_id
-- ---------------------------------------------------------

create or replace function public.tujer_realtime_direct_space_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_space_id bigint;
begin
  if tg_op = 'DELETE' then
    v_space_id := old.teacher_space_id;
  else
    v_space_id := new.teacher_space_id;
  end if;

  perform public.tujer_realtime_send_space(v_space_id, tg_table_name, tg_op);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.tujer_realtime_direct_space_change()
from public, anon, authenticated;

-- Une attribution directe ajoutée/modifiée/suspendue/supprimée.
drop trigger if exists trg_tujer_realtime_activity_assignments on public.activity_assignments;
create trigger trg_tujer_realtime_activity_assignments
after insert or update or delete on public.activity_assignments
for each row execute function public.tujer_realtime_direct_space_change();

-- Une activité personnelle utilisée dans une attribution ou une séquence.
drop trigger if exists trg_tujer_realtime_teacher_activities on public.teacher_activities;
create trigger trg_tujer_realtime_teacher_activities
after insert or update or delete on public.teacher_activities
for each row execute function public.tujer_realtime_direct_space_change();

-- Une séquence attribuable.
drop trigger if exists trg_tujer_realtime_teacher_sequences on public.teacher_sequences;
create trigger trg_tujer_realtime_teacher_sequences
after insert or update or delete on public.teacher_sequences
for each row execute function public.tujer_realtime_direct_space_change();

-- Missions historiques encore utilisées côté élève.
drop trigger if exists trg_tujer_realtime_missions on public.missions;
create trigger trg_tujer_realtime_missions
after insert or update or delete on public.missions
for each row execute function public.tujer_realtime_direct_space_change();

-- ---------------------------------------------------------
-- 3) Tables filles : retrouver l'espace via le parent
-- ---------------------------------------------------------

create or replace function public.tujer_realtime_assignment_target_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_id uuid;
  v_space_id bigint;
begin
  if tg_op = 'DELETE' then
    v_assignment_id := old.assignment_id;
  else
    v_assignment_id := new.assignment_id;
  end if;

  select a.teacher_space_id into v_space_id
  from public.activity_assignments a
  where a.id = v_assignment_id;

  perform public.tujer_realtime_send_space(v_space_id, 'activity_assignment_targets', tg_op);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.tujer_realtime_assignment_target_change()
from public, anon, authenticated;

drop trigger if exists trg_tujer_realtime_activity_assignment_targets on public.activity_assignment_targets;
create trigger trg_tujer_realtime_activity_assignment_targets
after insert or update or delete on public.activity_assignment_targets
for each row execute function public.tujer_realtime_assignment_target_change();

create or replace function public.tujer_realtime_sequence_item_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sequence_id uuid;
  v_space_id bigint;
begin
  if tg_op = 'DELETE' then
    v_sequence_id := old.sequence_id;
  else
    v_sequence_id := new.sequence_id;
  end if;

  select seq.teacher_space_id into v_space_id
  from public.teacher_sequences seq
  where seq.id = v_sequence_id;

  perform public.tujer_realtime_send_space(v_space_id, 'teacher_sequence_items', tg_op);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.tujer_realtime_sequence_item_change()
from public, anon, authenticated;

drop trigger if exists trg_tujer_realtime_teacher_sequence_items on public.teacher_sequence_items;
create trigger trg_tujer_realtime_teacher_sequence_items
after insert or update or delete on public.teacher_sequence_items
for each row execute function public.tujer_realtime_sequence_item_change();

create or replace function public.tujer_realtime_mission_child_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mission_id uuid;
  v_space_id bigint;
begin
  if tg_op = 'DELETE' then
    v_mission_id := old.mission_id;
  else
    v_mission_id := new.mission_id;
  end if;

  select m.teacher_space_id into v_space_id
  from public.missions m
  where m.id = v_mission_id;

  perform public.tujer_realtime_send_space(v_space_id, tg_table_name, tg_op);

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.tujer_realtime_mission_child_change()
from public, anon, authenticated;

drop trigger if exists trg_tujer_realtime_mission_assignments on public.mission_assignments;
create trigger trg_tujer_realtime_mission_assignments
after insert or update or delete on public.mission_assignments
for each row execute function public.tujer_realtime_mission_child_change();

drop trigger if exists trg_tujer_realtime_mission_steps on public.mission_steps;
create trigger trg_tujer_realtime_mission_steps
after insert or update or delete on public.mission_steps
for each row execute function public.tujer_realtime_mission_child_change();

-- ---------------------------------------------------------
-- 4) Catalogue système : canal global, événement minimal
-- ---------------------------------------------------------

create or replace function public.tujer_realtime_catalog_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.tujer_realtime_send_catalog('catalog_activities', tg_op);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.tujer_realtime_catalog_change()
from public, anon, authenticated;

drop trigger if exists trg_tujer_realtime_catalog_activities on public.catalog_activities;
create trigger trg_tujer_realtime_catalog_activities
after insert or update or delete on public.catalog_activities
for each row execute function public.tujer_realtime_catalog_change();

-- ---------------------------------------------------------
-- 5) Garder les titres d'attribution / séquence synchronisés
-- ---------------------------------------------------------

create or replace function public.tujer_sync_teacher_activity_titles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.title is distinct from old.title then
    update public.activity_assignments
    set title_snapshot = new.title
    where source_type = 'teacher_activity'
      and source_id = new.id::text
      and teacher_space_id = new.teacher_space_id
      and title_snapshot is distinct from new.title;

    update public.teacher_sequence_items item
    set title_snapshot = new.title
    from public.teacher_sequences seq
    where item.sequence_id = seq.id
      and seq.teacher_space_id = new.teacher_space_id
      and item.source_type = 'teacher_activity'
      and item.source_id = new.id::text
      and item.title_snapshot is distinct from new.title;
  end if;
  return new;
end;
$$;

revoke all on function public.tujer_sync_teacher_activity_titles()
from public, anon, authenticated;

drop trigger if exists trg_tujer_sync_teacher_activity_titles on public.teacher_activities;
create trigger trg_tujer_sync_teacher_activity_titles
after update of title on public.teacher_activities
for each row execute function public.tujer_sync_teacher_activity_titles();

create or replace function public.tujer_sync_teacher_sequence_titles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.title is distinct from old.title then
    update public.activity_assignments
    set title_snapshot = new.title
    where source_type = 'sequence'
      and source_id = new.id::text
      and teacher_space_id = new.teacher_space_id
      and title_snapshot is distinct from new.title;
  end if;
  return new;
end;
$$;

revoke all on function public.tujer_sync_teacher_sequence_titles()
from public, anon, authenticated;

drop trigger if exists trg_tujer_sync_teacher_sequence_titles on public.teacher_sequences;
create trigger trg_tujer_sync_teacher_sequence_titles
after update of title on public.teacher_sequences
for each row execute function public.tujer_sync_teacher_sequence_titles();

create or replace function public.tujer_sync_catalog_activity_titles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.title is distinct from old.title then
    update public.activity_assignments
    set title_snapshot = new.title
    where source_type = 'catalog_activity'
      and source_id = new.id
      and title_snapshot is distinct from new.title;

    update public.teacher_sequence_items
    set title_snapshot = new.title
    where source_type = 'catalog_activity'
      and source_id = new.id
      and title_snapshot is distinct from new.title;
  end if;
  return new;
end;
$$;

revoke all on function public.tujer_sync_catalog_activity_titles()
from public, anon, authenticated;

drop trigger if exists trg_tujer_sync_catalog_activity_titles on public.catalog_activities;
create trigger trg_tujer_sync_catalog_activity_titles
after update of title on public.catalog_activities
for each row execute function public.tujer_sync_catalog_activity_titles();

commit;
