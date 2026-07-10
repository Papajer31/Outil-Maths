-- =========================================================
-- SUPABASE — RESET COMPLET + SCHÉMA PROPRE + SEEDS
-- Projet Site d'outils — refonte Catalogue / Missions / Aventure
-- IMPORTANT : destructif pour les tables applicatives public.* listées.
-- Faire un backup avant exécution.
-- =========================================================



-- =========================================================
-- SOURCE: sql/from_scratch/00_reset_destructif.sql
-- =========================================================

-- =========================================================
-- RESET DESTRUCTIF OPTIONNEL
-- À exécuter uniquement si tu acceptes de perdre les données.
-- Faire un backup Supabase avant.
-- =========================================================

begin;

-- Fonctions RPC / triggers connues

drop function if exists public.access_code_exists(text) cascade;
drop function if exists public.get_space_classes(text) cascade;
drop function if exists public.get_space_students(text) cascade;
drop function if exists public.verify_student_code(text, bigint, text) cascade;
drop function if exists public.get_space_activities(text) cascade;
drop function if exists public.get_activity_config(text, text) cascade;
drop function if exists public.get_space_activity_folders(text) cascade;
drop function if exists public.get_catalog_visibility_for_space(text) cascade;
drop function if exists public.get_space_missions(text, bigint[], boolean) cascade;
drop function if exists public.get_space_mission_steps(text, uuid) cascade;
drop function if exists public.get_space_vocabulary_words(text) cascade;
drop function if exists public.get_question_bank_items_for_space(text, uuid) cascade;
drop function if exists public.get_conjugation_personal_list(text, uuid) cascade;
drop function if exists public.replace_question_bank_items(uuid, jsonb) cascade;
drop function if exists public.replace_teacher_vocabulary_words(bigint, jsonb) cascade;
drop function if exists public.reset_teacher_vocabulary_words(bigint) cascade;
drop function if exists public.record_catalog_activity_result(text, bigint, text, text, boolean) cascade;

-- Fonctions utilitaires / triggers

drop function if exists public.set_updated_at() cascade;
drop function if exists public.random_student_code() cascade;
drop function if exists public.set_student_code() cascade;
drop function if exists public.validate_mission_folder_parent() cascade;
drop function if exists public.validate_mission_folder_ref() cascade;
drop function if exists public.validate_mission_assignment() cascade;
drop function if exists public.validate_question_bank_folder_parent() cascade;
drop function if exists public.validate_question_bank_folder() cascade;
drop function if exists public.copy_default_vocabulary_words_to_teacher_space() cascade;
drop function if exists public.set_teacher_conjugation_lists_updated_at() cascade;

-- Anciennes migrations Encodage ponctuelles

drop function if exists public.encodage_v2_graph_id(text) cascade;
drop function if exists public.encodage_v2_migrate_graph_order(jsonb) cascade;
drop function if exists public.encodage_v2_migrate_config_json(jsonb) cascade;

-- Tables nouvelles / cibles

drop table if exists public.student_catalog_activity_attempts cascade;
drop table if exists public.student_catalog_activity_levels cascade;
drop table if exists public.mission_assignments cascade;
drop table if exists public.mission_steps cascade;
drop table if exists public.missions cascade;
drop table if exists public.mission_folders cascade;
drop table if exists public.catalog_activity_visibility cascade;

-- Tables de ressources / banques

drop table if exists public.teacher_conjugation_lists cascade;
drop table if exists public.teacher_phonology_presets cascade;
drop table if exists public.teacher_vocabulary_words cascade;
drop table if exists public.vocabulary_default_words cascade;
drop table if exists public.question_bank_items cascade;
drop table if exists public.question_banks cascade;
drop table if exists public.question_bank_folders cascade;
drop table if exists public.phonology_words cascade;
drop table if exists public.image_assets cascade;

-- Anciennes tables activités

drop table if exists public.activity_configs cascade;
drop table if exists public.activity_folders cascade;

-- Socle

drop table if exists public.students cascade;
drop table if exists public.teacher_classes cascade;
drop table if exists public.teacher_spaces cascade;

commit;



-- =========================================================
-- SOURCE: sql/from_scratch/01_core.sql
-- =========================================================

-- =========================================================
-- 01_CORE — espaces enseignants, classes, élèves, code élève
-- =========================================================

grant usage on schema public to anon, authenticated;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- Fonction générique updated_at
-- ---------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------
-- Espaces enseignants
-- ---------------------------------------------------------

create table public.teacher_spaces (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  access_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz null,

  constraint teacher_spaces_owner_unique unique (owner_user_id),
  constraint teacher_spaces_access_code_unique unique (access_code),
  constraint teacher_spaces_access_code_format check (access_code ~ '^[A-Z]{3,12}$')
);

create index teacher_spaces_owner_last_opened_idx
on public.teacher_spaces (owner_user_id, last_opened_at desc);

drop trigger if exists trg_teacher_spaces_updated_at on public.teacher_spaces;
create trigger trg_teacher_spaces_updated_at
before update on public.teacher_spaces
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Classes
-- ---------------------------------------------------------

create table public.teacher_classes (
  id bigint generated always as identity primary key,
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  name text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_classes_name_not_blank check (length(trim(name)) > 0),
  constraint teacher_classes_unique_name_per_space unique (teacher_space_id, name)
);

create index teacher_classes_space_id_idx
on public.teacher_classes (teacher_space_id);

create index teacher_classes_space_order_idx
on public.teacher_classes (teacher_space_id, display_order, id);

drop trigger if exists trg_teacher_classes_updated_at on public.teacher_classes;
create trigger trg_teacher_classes_updated_at
before update on public.teacher_classes
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Élèves + code élève
-- ---------------------------------------------------------

create or replace function public.random_student_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..3 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create table public.students (
  id bigint generated always as identity primary key,
  teacher_class_id bigint not null references public.teacher_classes(id) on delete cascade,
  first_name text not null,
  grade_level text null,
  student_code text null,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint students_first_name_not_blank check (length(trim(first_name)) > 0),
  constraint students_grade_level_check check (
    grade_level is null or grade_level in ('CP', 'CE1', 'CE2', 'CM1', 'CM2')
  ),
  constraint students_student_code_format check (
    student_code is null or student_code ~ '^[A-HJ-NP-Z2-9]{3}$'
  )
);

create unique index students_unique_first_name_per_class
on public.students (teacher_class_id, lower(trim(first_name)));

create unique index students_unique_code_per_class
on public.students (teacher_class_id, student_code)
where student_code is not null;

create index students_teacher_class_id_idx
on public.students (teacher_class_id);

create index students_teacher_class_order_idx
on public.students (teacher_class_id, display_order, id);

create or replace function public.set_student_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  tries int := 0;
begin
  new.student_code := upper(regexp_replace(coalesce(new.student_code, ''), '[^A-Za-z0-9]', '', 'g'));

  if new.student_code = '' then
    loop
      tries := tries + 1;
      candidate := public.random_student_code();

      exit when not exists (
        select 1
        from public.students s
        where s.teacher_class_id = new.teacher_class_id
          and s.student_code = candidate
          and (tg_op = 'INSERT' or s.id <> new.id)
      );

      if tries > 30 then
        raise exception 'Impossible de générer un code élève unique.';
      end if;
    end loop;

    new.student_code := candidate;
  end if;

  if new.student_code !~ '^[A-HJ-NP-Z2-9]{3}$' then
    raise exception 'Code élève invalide. Utiliser 3 caractères lisibles, sans 0/O/1/I.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_students_student_code on public.students;
create trigger trg_students_student_code
before insert or update of student_code, teacher_class_id
on public.students
for each row execute function public.set_student_code();

drop trigger if exists trg_students_updated_at on public.students;
create trigger trg_students_updated_at
before update on public.students
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------

alter table public.teacher_spaces enable row level security;
alter table public.teacher_classes enable row level security;
alter table public.students enable row level security;

create policy teacher_spaces_select_own on public.teacher_spaces
for select to authenticated
using (auth.uid() = owner_user_id);

create policy teacher_spaces_insert_own on public.teacher_spaces
for insert to authenticated
with check (auth.uid() = owner_user_id);

create policy teacher_spaces_update_own on public.teacher_spaces
for update to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy teacher_spaces_delete_own on public.teacher_spaces
for delete to authenticated
using (auth.uid() = owner_user_id);

create policy teacher_classes_select_own on public.teacher_classes
for select to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = teacher_classes.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy teacher_classes_insert_own on public.teacher_classes
for insert to authenticated
with check (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = teacher_classes.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy teacher_classes_update_own on public.teacher_classes
for update to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = teacher_classes.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = teacher_classes.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy teacher_classes_delete_own on public.teacher_classes
for delete to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = teacher_classes.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy students_select_own on public.students
for select to authenticated
using (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = students.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy students_insert_own on public.students
for insert to authenticated
with check (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = students.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy students_update_own on public.students
for update to authenticated
using (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = students.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = students.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy students_delete_own on public.students
for delete to authenticated
using (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = students.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- Grants
-- ---------------------------------------------------------

grant select, insert, update, delete on public.teacher_spaces to authenticated;
grant select, insert, update, delete on public.teacher_classes to authenticated;
grant select, insert, update, delete on public.students to authenticated;

-- ---------------------------------------------------------
-- RPC publiques élèves
-- ---------------------------------------------------------

create or replace function public.access_code_exists(p_access_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_spaces
    where access_code = upper(trim(p_access_code))
  );
$$;

create or replace function public.get_space_classes(p_access_code text)
returns table (
  class_id bigint,
  class_name text,
  display_order int
)
language sql
stable
security definer
set search_path = public
as $$
  select tc.id, tc.name, tc.display_order
  from public.teacher_spaces ts
  join public.teacher_classes tc on tc.teacher_space_id = ts.id
  where ts.access_code = upper(trim(p_access_code))
  order by tc.display_order asc, lower(tc.name) asc, tc.id asc;
$$;

create or replace function public.get_space_students(p_access_code text)
returns table (
  id bigint,
  teacher_class_id bigint,
  first_name text,
  grade_level text,
  display_order int,
  class_name text,
  class_display_order int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.teacher_class_id,
    s.first_name,
    s.grade_level,
    s.display_order,
    tc.name as class_name,
    tc.display_order as class_display_order
  from public.teacher_spaces ts
  join public.teacher_classes tc on tc.teacher_space_id = ts.id
  join public.students s on s.teacher_class_id = tc.id
  where ts.access_code = upper(trim(p_access_code))
    and s.is_active = true
  order by tc.display_order asc, s.display_order asc, lower(s.first_name) asc, s.id asc;
$$;

create or replace function public.verify_student_code(
  p_access_code text,
  p_student_id bigint,
  p_student_code text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_spaces ts
    join public.teacher_classes tc on tc.teacher_space_id = ts.id
    join public.students s on s.teacher_class_id = tc.id
    where ts.access_code = upper(trim(p_access_code))
      and s.id = p_student_id
      and s.is_active = true
      and s.student_code = upper(regexp_replace(coalesce(p_student_code, ''), '[^A-Za-z0-9]', '', 'g'))
  );
$$;

grant execute on function public.access_code_exists(text) to anon, authenticated;
grant execute on function public.get_space_classes(text) to anon, authenticated;
grant execute on function public.get_space_students(text) to anon, authenticated;
grant execute on function public.verify_student_code(text, bigint, text) to anon, authenticated;



-- =========================================================
-- SOURCE: sql/from_scratch/02_catalogue_exploration.sql
-- =========================================================

-- =========================================================
-- 02_CATALOGUE_EXPLORATION — visibilité des activités du Catalogue
-- =========================================================

-- Le Catalogue complet est défini côté code pour l’instant.
-- Cette table ne stocke que les overrides de visibilité par enseignant.
-- Absence de ligne = comportement par défaut = visible.

create table public.catalog_activity_visibility (
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  catalog_activity_id text not null,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (teacher_space_id, catalog_activity_id),
  constraint catalog_activity_visibility_id_not_blank check (length(trim(catalog_activity_id)) > 0),
  constraint catalog_activity_visibility_id_format check (catalog_activity_id ~ '^[a-z0-9][a-z0-9._-]{1,160}$')
);

create index catalog_activity_visibility_space_visible_idx
on public.catalog_activity_visibility (teacher_space_id, is_visible, catalog_activity_id);

drop trigger if exists trg_catalog_activity_visibility_updated_at on public.catalog_activity_visibility;
create trigger trg_catalog_activity_visibility_updated_at
before update on public.catalog_activity_visibility
for each row execute function public.set_updated_at();

alter table public.catalog_activity_visibility enable row level security;

create policy catalog_activity_visibility_select_own
on public.catalog_activity_visibility
for select to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = catalog_activity_visibility.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy catalog_activity_visibility_insert_own
on public.catalog_activity_visibility
for insert to authenticated
with check (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = catalog_activity_visibility.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy catalog_activity_visibility_update_own
on public.catalog_activity_visibility
for update to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = catalog_activity_visibility.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = catalog_activity_visibility.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy catalog_activity_visibility_delete_own
on public.catalog_activity_visibility
for delete to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = catalog_activity_visibility.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.catalog_activity_visibility to authenticated;

create or replace function public.get_catalog_visibility_for_space(p_access_code text)
returns table (
  catalog_activity_id text,
  is_visible boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select cav.catalog_activity_id, cav.is_visible, cav.updated_at
  from public.teacher_spaces ts
  join public.catalog_activity_visibility cav on cav.teacher_space_id = ts.id
  where ts.access_code = upper(trim(p_access_code))
  order by cav.catalog_activity_id asc;
$$;

grant execute on function public.get_catalog_visibility_for_space(text) to anon, authenticated;



-- =========================================================
-- SOURCE: sql/from_scratch/03_missions.sql
-- =========================================================

-- =========================================================
-- 03_MISSIONS — arborescence libre, suite d’activités, attributions
-- =========================================================

-- ---------------------------------------------------------
-- Dossiers de Missions
-- ---------------------------------------------------------

create table public.mission_folders (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  parent_id uuid null references public.mission_folders(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint mission_folders_name_not_blank check (btrim(name) <> ''),
  constraint mission_folders_no_self_parent check (parent_id is null or parent_id <> id)
);

create index mission_folders_teacher_space_idx
on public.mission_folders (teacher_space_id);

create index mission_folders_parent_idx
on public.mission_folders (parent_id);

create index mission_folders_order_idx
on public.mission_folders (teacher_space_id, parent_id, display_order, name);

create unique index mission_folders_sibling_name_unique
on public.mission_folders (
  teacher_space_id,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

drop trigger if exists trg_mission_folders_updated_at on public.mission_folders;
create trigger trg_mission_folders_updated_at
before update on public.mission_folders
for each row execute function public.set_updated_at();

create or replace function public.validate_mission_folder_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_space_id bigint;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Un dossier de mission ne peut pas être son propre parent.';
  end if;

  select mf.teacher_space_id into parent_space_id
  from public.mission_folders mf
  where mf.id = new.parent_id;

  if parent_space_id is null or parent_space_id <> new.teacher_space_id then
    raise exception 'Le dossier parent ne correspond pas à l’espace enseignant.';
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      with recursive descendants as (
        select child.id, child.parent_id
        from public.mission_folders child
        where child.parent_id = new.id
        union all
        select child.id, child.parent_id
        from public.mission_folders child
        join descendants d on d.id = child.parent_id
      )
      select 1 from descendants where descendants.id = new.parent_id
    ) then
      raise exception 'Un dossier de mission ne peut pas être déplacé dans l’un de ses sous-dossiers.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_mission_folder_parent on public.mission_folders;
create trigger trg_validate_mission_folder_parent
before insert or update of parent_id, teacher_space_id
on public.mission_folders
for each row execute function public.validate_mission_folder_parent();

-- ---------------------------------------------------------
-- Missions
-- ---------------------------------------------------------

create table public.missions (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  folder_id uuid null references public.mission_folders(id) on delete set null,
  title text not null,
  title_normalized text not null,
  description text not null default '',
  status text not null default 'draft',

  -- Passation choisie par le professeur
  answer_mode text not null default 'student_input',
  intent_mode text not null default 'practice',

  -- Déroulé commun de la Mission
  question_count integer not null default 5,
  question_time_seconds integer null,
  answer_display_seconds integer null,
  transition_seconds integer not null default 0,
  mission_time_seconds integer null,
  instructions text null,

  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint missions_title_not_blank check (btrim(title) <> ''),
  constraint missions_title_normalized_not_blank check (btrim(title_normalized) <> ''),
  constraint missions_status_check check (status in ('draft', 'active', 'archived')),
  constraint missions_answer_mode_check check (answer_mode in ('student_input', 'manual_validation')),
  constraint missions_intent_mode_check check (intent_mode in ('practice', 'evaluation')),
  constraint missions_question_count_positive check (question_count > 0),
  constraint missions_question_time_nonnegative check (question_time_seconds is null or question_time_seconds >= 0),
  constraint missions_answer_display_nonnegative check (answer_display_seconds is null or answer_display_seconds >= 0),
  constraint missions_transition_nonnegative check (transition_seconds >= 0),
  constraint missions_time_nonnegative check (mission_time_seconds is null or mission_time_seconds >= 0)
);

create index missions_space_status_idx
on public.missions (teacher_space_id, status, display_order, title);

create index missions_folder_order_idx
on public.missions (teacher_space_id, folder_id, display_order, title);

create unique index missions_unique_title_per_space
on public.missions (teacher_space_id, title_normalized)
where status <> 'archived';

drop trigger if exists trg_missions_updated_at on public.missions;
create trigger trg_missions_updated_at
before update on public.missions
for each row execute function public.set_updated_at();

create or replace function public.validate_mission_folder_ref()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  folder_space_id bigint;
begin
  if new.folder_id is null then
    return new;
  end if;

  select mf.teacher_space_id into folder_space_id
  from public.mission_folders mf
  where mf.id = new.folder_id;

  if folder_space_id is null or folder_space_id <> new.teacher_space_id then
    raise exception 'Le dossier de mission ne correspond pas à l’espace enseignant.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_mission_folder_ref on public.missions;
create trigger trg_validate_mission_folder_ref
before insert or update of folder_id, teacher_space_id
on public.missions
for each row execute function public.validate_mission_folder_ref();

-- ---------------------------------------------------------
-- Étapes de Mission
-- ---------------------------------------------------------

create table public.mission_steps (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  catalog_activity_id text not null,
  position integer not null default 0,
  difficulty_mode text not null default 'normal',
  difficulty_level smallint not null default 3,
  step_options_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint mission_steps_catalog_activity_not_blank check (btrim(catalog_activity_id) <> ''),
  constraint mission_steps_position_nonnegative check (position >= 0),
  constraint mission_steps_difficulty_mode_check check (difficulty_mode in ('normal', 'fixed', 'adaptive')),
  constraint mission_steps_difficulty_level_check check (difficulty_level between 1 and 5),
  constraint mission_steps_options_object check (jsonb_typeof(step_options_json) = 'object')
);

create index mission_steps_mission_position_idx
on public.mission_steps (mission_id, position, created_at);

drop trigger if exists trg_mission_steps_updated_at on public.mission_steps;
create trigger trg_mission_steps_updated_at
before update on public.mission_steps
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Attributions
-- ---------------------------------------------------------

create table public.mission_assignments (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  target_type text not null,
  teacher_class_id bigint null references public.teacher_classes(id) on delete cascade,
  student_id bigint null references public.students(id) on delete cascade,
  created_at timestamptz not null default now(),

  constraint mission_assignments_target_type_check check (target_type in ('class', 'student')),
  constraint mission_assignments_one_target check (
    (target_type = 'class' and teacher_class_id is not null and student_id is null)
    or
    (target_type = 'student' and student_id is not null and teacher_class_id is null)
  )
);

create unique index mission_assignments_unique_class
on public.mission_assignments (mission_id, teacher_class_id)
where target_type = 'class';

create unique index mission_assignments_unique_student
on public.mission_assignments (mission_id, student_id)
where target_type = 'student';

create index mission_assignments_mission_idx
on public.mission_assignments (mission_id);

create index mission_assignments_class_idx
on public.mission_assignments (teacher_class_id)
where target_type = 'class';

create index mission_assignments_student_idx
on public.mission_assignments (student_id)
where target_type = 'student';

create or replace function public.validate_mission_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  mission_space_id bigint;
  target_space_id bigint;
begin
  select m.teacher_space_id into mission_space_id
  from public.missions m
  where m.id = new.mission_id;

  if mission_space_id is null then
    raise exception 'Mission introuvable.';
  end if;

  if new.target_type = 'class' then
    select tc.teacher_space_id into target_space_id
    from public.teacher_classes tc
    where tc.id = new.teacher_class_id;
  elsif new.target_type = 'student' then
    select tc.teacher_space_id into target_space_id
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    where s.id = new.student_id;
  end if;

  if target_space_id is null or target_space_id <> mission_space_id then
    raise exception 'La cible de mission ne correspond pas à l’espace enseignant.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_mission_assignment on public.mission_assignments;
create trigger trg_validate_mission_assignment
before insert or update of mission_id, target_type, teacher_class_id, student_id
on public.mission_assignments
for each row execute function public.validate_mission_assignment();

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------

alter table public.mission_folders enable row level security;
alter table public.missions enable row level security;
alter table public.mission_steps enable row level security;
alter table public.mission_assignments enable row level security;

create policy mission_folders_select_own on public.mission_folders
for select to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = mission_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy mission_folders_insert_own on public.mission_folders
for insert to authenticated
with check (exists (select 1 from public.teacher_spaces ts where ts.id = mission_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy mission_folders_update_own on public.mission_folders
for update to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = mission_folders.teacher_space_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.teacher_spaces ts where ts.id = mission_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy mission_folders_delete_own on public.mission_folders
for delete to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = mission_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy missions_select_own on public.missions
for select to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = missions.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy missions_insert_own on public.missions
for insert to authenticated
with check (exists (select 1 from public.teacher_spaces ts where ts.id = missions.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy missions_update_own on public.missions
for update to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = missions.teacher_space_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.teacher_spaces ts where ts.id = missions.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy missions_delete_own on public.missions
for delete to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = missions.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy mission_steps_select_own on public.mission_steps
for select to authenticated
using (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_steps.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_steps_insert_own on public.mission_steps
for insert to authenticated
with check (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_steps.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_steps_update_own on public.mission_steps
for update to authenticated
using (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_steps.mission_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_steps.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_steps_delete_own on public.mission_steps
for delete to authenticated
using (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_steps.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_assignments_select_own on public.mission_assignments
for select to authenticated
using (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_assignments.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_assignments_insert_own on public.mission_assignments
for insert to authenticated
with check (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_assignments.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_assignments_update_own on public.mission_assignments
for update to authenticated
using (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_assignments.mission_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_assignments.mission_id and ts.owner_user_id = auth.uid()));

create policy mission_assignments_delete_own on public.mission_assignments
for delete to authenticated
using (exists (select 1 from public.missions m join public.teacher_spaces ts on ts.id = m.teacher_space_id where m.id = mission_assignments.mission_id and ts.owner_user_id = auth.uid()));

grant select, insert, update, delete on public.mission_folders to authenticated;
grant select, insert, update, delete on public.missions to authenticated;
grant select, insert, update, delete on public.mission_steps to authenticated;
grant select, insert, update, delete on public.mission_assignments to authenticated;

-- ---------------------------------------------------------
-- RPC publiques élèves
-- ---------------------------------------------------------

create or replace function public.get_space_missions(
  p_access_code text,
  p_student_ids bigint[] default '{}'::bigint[],
  p_is_group boolean default false
)
returns table (
  id uuid,
  title text,
  description text,
  answer_mode text,
  intent_mode text,
  question_count integer,
  question_time_seconds integer,
  answer_display_seconds integer,
  transition_seconds integer,
  mission_time_seconds integer,
  instructions text,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with space as (
    select id from public.teacher_spaces where access_code = upper(trim(p_access_code))
  ), selected_students as (
    select s.id, s.teacher_class_id
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join space sp on sp.id = tc.teacher_space_id
    where s.is_active = true
      and s.id = any(coalesce(p_student_ids, '{}'::bigint[]))
  ), selected_classes as (
    select distinct teacher_class_id from selected_students
  )
  select
    m.id,
    m.title,
    m.description,
    m.answer_mode,
    m.intent_mode,
    m.question_count,
    m.question_time_seconds,
    m.answer_display_seconds,
    m.transition_seconds,
    m.mission_time_seconds,
    m.instructions,
    m.updated_at
  from public.missions m
  join space sp on sp.id = m.teacher_space_id
  where m.status = 'active'
    and exists (select 1 from public.mission_steps ms where ms.mission_id = m.id)
    and (
      -- En groupe : uniquement missions de classe pour le MVP.
      (coalesce(p_is_group, false) = true and exists (
        select 1
        from public.mission_assignments ma
        join selected_classes sc on sc.teacher_class_id = ma.teacher_class_id
        where ma.mission_id = m.id
          and ma.target_type = 'class'
      ))
      or
      -- En individuel : missions de l’élève + missions de sa classe.
      (coalesce(p_is_group, false) = false and exists (
        select 1
        from public.mission_assignments ma
        left join selected_classes sc on sc.teacher_class_id = ma.teacher_class_id and ma.target_type = 'class'
        left join selected_students ss on ss.id = ma.student_id and ma.target_type = 'student'
        where ma.mission_id = m.id
          and (sc.teacher_class_id is not null or ss.id is not null)
      ))
    )
  order by m.display_order asc, lower(m.title) asc, m.updated_at desc;
$$;

create or replace function public.get_space_mission_steps(
  p_access_code text,
  p_mission_id uuid
)
returns table (
  id uuid,
  mission_id uuid,
  catalog_activity_id text,
  "position" integer,
  difficulty_mode text,
  difficulty_level smallint,
  step_options_json jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ms.id,
    ms.mission_id,
    ms.catalog_activity_id,
    ms.position as "position",
    ms.difficulty_mode,
    ms.difficulty_level,
    ms.step_options_json
  from public.teacher_spaces ts
  join public.missions m on m.teacher_space_id = ts.id
  join public.mission_steps ms on ms.mission_id = m.id
  where ts.access_code = upper(trim(p_access_code))
    and m.id = p_mission_id
    and m.status = 'active'
  order by ms.position asc, ms.created_at asc;
$$;

grant execute on function public.get_space_missions(text, bigint[], boolean) to anon, authenticated;
grant execute on function public.get_space_mission_steps(text, uuid) to anon, authenticated;



-- =========================================================
-- SOURCE: sql/from_scratch/04_banques_questions.sql
-- =========================================================

-- =========================================================
-- 04_BANQUES_QUESTIONS — banques typées + dossiers
-- =========================================================

grant usage on schema public to anon, authenticated;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- Banques
-- ---------------------------------------------------------

create table public.question_banks (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint null references public.teacher_spaces(id) on delete cascade,
  source_bank_id uuid null references public.question_banks(id) on delete set null,
  bank_type text not null default 'text_answer',
  title text not null,
  title_normalized text not null,
  description text not null default '',
  subject text not null default '',
  grade_level text not null default '',
  tags text[] not null default '{}',
  is_system boolean not null default false,
  share_code text null unique,
  folder_id uuid null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint question_banks_type_format check (bank_type ~ '^[a-z0-9_\-]{2,64}$'),
  constraint question_banks_title_not_blank check (length(trim(title)) > 0),
  constraint question_banks_title_norm_not_blank check (length(trim(title_normalized)) > 0),
  constraint question_banks_owner_or_system check (
    (is_system = true and teacher_space_id is null)
    or
    (is_system = false and teacher_space_id is not null)
  ),
  constraint question_banks_share_code_format check (
    share_code is null or share_code ~ '^[A-Z0-9]{4,16}$'
  )
);

create index question_banks_teacher_space_idx
on public.question_banks (teacher_space_id, bank_type, title_normalized);

create index question_banks_system_idx
on public.question_banks (is_system, bank_type, title_normalized);

create unique index question_banks_teacher_title_unique
on public.question_banks (teacher_space_id, title_normalized)
where is_system = false;

-- ---------------------------------------------------------
-- Dossiers de banques personnelles
-- ---------------------------------------------------------

create table public.question_bank_folders (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  parent_id uuid null references public.question_bank_folders(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint question_bank_folders_name_not_blank check (btrim(name) <> ''),
  constraint question_bank_folders_no_self_parent check (parent_id is null or parent_id <> id)
);

alter table public.question_banks
add constraint question_banks_folder_id_fkey
foreign key (folder_id)
references public.question_bank_folders(id)
on delete set null;

create index question_bank_folders_teacher_space_idx
on public.question_bank_folders (teacher_space_id);

create index question_bank_folders_parent_idx
on public.question_bank_folders (parent_id);

create index question_bank_folders_order_idx
on public.question_bank_folders (teacher_space_id, parent_id, display_order, name);

create unique index question_bank_folders_sibling_name_unique
on public.question_bank_folders (
  teacher_space_id,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

create index question_banks_folder_idx
on public.question_banks (folder_id);

create index question_banks_folder_order_idx
on public.question_banks (teacher_space_id, folder_id, display_order, title);

-- ---------------------------------------------------------
-- Items
-- ---------------------------------------------------------

create table public.question_bank_items (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  item_type text not null default 'text_answer',
  prompt text not null default '',
  payload_json jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint question_bank_items_type_format check (item_type ~ '^[a-z0-9_\-]{2,64}$'),
  constraint question_bank_items_position_nonnegative check (position >= 0),
  constraint question_bank_items_payload_object check (jsonb_typeof(payload_json) = 'object')
);

create index question_bank_items_bank_position_idx
on public.question_bank_items (bank_id, position, created_at);

-- ---------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------

drop trigger if exists trg_question_banks_updated_at on public.question_banks;
create trigger trg_question_banks_updated_at
before update on public.question_banks
for each row execute function public.set_updated_at();

drop trigger if exists trg_question_bank_items_updated_at on public.question_bank_items;
create trigger trg_question_bank_items_updated_at
before update on public.question_bank_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_question_bank_folders_updated_at on public.question_bank_folders;
create trigger trg_question_bank_folders_updated_at
before update on public.question_bank_folders
for each row execute function public.set_updated_at();

create or replace function public.validate_question_bank_folder_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_space_id bigint;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Un dossier de banque ne peut pas être son propre parent.';
  end if;

  select qbf.teacher_space_id into parent_space_id
  from public.question_bank_folders qbf
  where qbf.id = new.parent_id;

  if parent_space_id is null or parent_space_id <> new.teacher_space_id then
    raise exception 'Le dossier parent ne correspond pas à l’espace enseignant.';
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      with recursive descendants as (
        select child.id, child.parent_id
        from public.question_bank_folders child
        where child.parent_id = new.id
        union all
        select child.id, child.parent_id
        from public.question_bank_folders child
        join descendants d on d.id = child.parent_id
      )
      select 1 from descendants where descendants.id = new.parent_id
    ) then
      raise exception 'Un dossier de banque ne peut pas être déplacé dans l’un de ses sous-dossiers.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_question_bank_folder_parent on public.question_bank_folders;
create trigger trg_validate_question_bank_folder_parent
before insert or update of parent_id, teacher_space_id
on public.question_bank_folders
for each row execute function public.validate_question_bank_folder_parent();

create or replace function public.validate_question_bank_folder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  folder_space_id bigint;
begin
  if new.is_system is true then
    new.folder_id := null;
    return new;
  end if;

  if new.folder_id is null then
    return new;
  end if;

  select qbf.teacher_space_id into folder_space_id
  from public.question_bank_folders qbf
  where qbf.id = new.folder_id;

  if folder_space_id is null or folder_space_id <> new.teacher_space_id then
    raise exception 'Le dossier de banque ne correspond pas à l’espace enseignant.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_question_bank_folder on public.question_banks;
create trigger trg_validate_question_bank_folder
before insert or update of folder_id, teacher_space_id, is_system
on public.question_banks
for each row execute function public.validate_question_bank_folder();

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------

alter table public.question_banks enable row level security;
alter table public.question_bank_items enable row level security;
alter table public.question_bank_folders enable row level security;

create policy question_banks_select_policy
on public.question_banks
for select to authenticated
using (
  is_system = true
  or exists (
    select 1 from public.teacher_spaces ts
    where ts.id = question_banks.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_banks_insert_policy
on public.question_banks
for insert to authenticated
with check (
  is_system = false
  and exists (
    select 1 from public.teacher_spaces ts
    where ts.id = question_banks.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_banks_update_policy
on public.question_banks
for update to authenticated
using (
  is_system = false
  and exists (
    select 1 from public.teacher_spaces ts
    where ts.id = question_banks.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  is_system = false
  and exists (
    select 1 from public.teacher_spaces ts
    where ts.id = question_banks.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_banks_delete_policy
on public.question_banks
for delete to authenticated
using (
  is_system = false
  and exists (
    select 1 from public.teacher_spaces ts
    where ts.id = question_banks.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_bank_items_select_policy
on public.question_bank_items
for select to authenticated
using (
  exists (
    select 1 from public.question_banks qb
    where qb.id = question_bank_items.bank_id
      and (
        qb.is_system = true
        or exists (
          select 1 from public.teacher_spaces ts
          where ts.id = qb.teacher_space_id
            and ts.owner_user_id = auth.uid()
        )
      )
  )
);

create policy question_bank_items_insert_policy
on public.question_bank_items
for insert to authenticated
with check (
  exists (
    select 1
    from public.question_banks qb
    join public.teacher_spaces ts on ts.id = qb.teacher_space_id
    where qb.id = question_bank_items.bank_id
      and qb.is_system = false
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_bank_items_update_policy
on public.question_bank_items
for update to authenticated
using (
  exists (
    select 1
    from public.question_banks qb
    join public.teacher_spaces ts on ts.id = qb.teacher_space_id
    where qb.id = question_bank_items.bank_id
      and qb.is_system = false
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.question_banks qb
    join public.teacher_spaces ts on ts.id = qb.teacher_space_id
    where qb.id = question_bank_items.bank_id
      and qb.is_system = false
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_bank_items_delete_policy
on public.question_bank_items
for delete to authenticated
using (
  exists (
    select 1
    from public.question_banks qb
    join public.teacher_spaces ts on ts.id = qb.teacher_space_id
    where qb.id = question_bank_items.bank_id
      and qb.is_system = false
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_bank_folders_select_own
on public.question_bank_folders
for select to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = question_bank_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy question_bank_folders_insert_own
on public.question_bank_folders
for insert to authenticated
with check (exists (select 1 from public.teacher_spaces ts where ts.id = question_bank_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy question_bank_folders_update_own
on public.question_bank_folders
for update to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = question_bank_folders.teacher_space_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.teacher_spaces ts where ts.id = question_bank_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy question_bank_folders_delete_own
on public.question_bank_folders
for delete to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = question_bank_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

grant select, insert, update, delete on public.question_banks to authenticated;
grant select, insert, update, delete on public.question_bank_items to authenticated;
grant select, insert, update, delete on public.question_bank_folders to authenticated;

-- ---------------------------------------------------------
-- RPC
-- ---------------------------------------------------------

create or replace function public.replace_question_bank_items(
  p_bank_id uuid,
  p_items jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_bank_id is null then
    raise exception 'bank_id is required';
  end if;

  if p_items is null then
    p_items := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;

  delete from public.question_bank_items
  where bank_id = p_bank_id;

  insert into public.question_bank_items (
    bank_id,
    item_type,
    prompt,
    payload_json,
    position,
    is_active,
    updated_at
  )
  select
    p_bank_id,
    coalesce(nullif(trim(item->>'item_type'), ''), 'text_answer'),
    coalesce(item->>'prompt', ''),
    case
      when jsonb_typeof(item->'payload_json') = 'object' then item->'payload_json'
      else '{}'::jsonb
    end,
    greatest(0, coalesce(nullif(item->>'position', '')::integer, ordinality - 1)),
    coalesce(nullif(item->>'is_active', '')::boolean, true),
    now()
  from jsonb_array_elements(p_items) with ordinality as source(item, ordinality);
end;
$$;

grant execute on function public.replace_question_bank_items(uuid, jsonb) to authenticated;

create or replace function public.get_question_bank_items_for_space(
  p_access_code text,
  p_bank_id uuid
)
returns table (
  id uuid,
  bank_id uuid,
  item_type text,
  prompt text,
  payload_json jsonb,
  "position" integer,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    qbi.id,
    qbi.bank_id,
    qbi.item_type,
    qbi.prompt,
    qbi.payload_json,
    qbi.position as "position",
    qbi.is_active
  from public.question_bank_items qbi
  join public.question_banks qb on qb.id = qbi.bank_id
  join public.teacher_spaces ts on ts.access_code = upper(trim(p_access_code))
  where qbi.bank_id = p_bank_id
    and qbi.is_active = true
    and (
      qb.is_system = true
      or qb.teacher_space_id = ts.id
    )
  order by qbi.position asc, qbi.created_at asc;
$$;

grant execute on function public.get_question_bank_items_for_space(text, uuid) to anon, authenticated;



-- =========================================================
-- SOURCE: sql/from_scratch/05_ressources_systeme.sql
-- =========================================================

-- =========================================================
-- 05_RESSOURCES_SYSTEME — images, phonologie, vocabulaire
-- =========================================================

-- ---------------------------------------------------------
-- Images système
-- ---------------------------------------------------------

create table public.image_assets (
  slug text primary key,
  storage_path text not null unique,
  tags text[] not null default '{}',
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint image_assets_slug_not_blank check (length(trim(slug)) > 0),
  constraint image_assets_storage_path_not_blank check (length(trim(storage_path)) > 0)
);

create index image_assets_active_slug_idx
on public.image_assets (is_active, slug);

drop trigger if exists trg_image_assets_updated_at on public.image_assets;
create trigger trg_image_assets_updated_at
before update on public.image_assets
for each row execute function public.set_updated_at();

alter table public.image_assets enable row level security;

create policy image_assets_public_read_active
on public.image_assets
for select to anon, authenticated
using (is_active = true);

-- Pas de grant d’écriture pour authenticated : écriture réservée au futur super-admin / SQL Editor.
grant select on public.image_assets to anon, authenticated;

-- ---------------------------------------------------------
-- Mots Encodage / phonologie
-- ---------------------------------------------------------

create table public.phonology_words (
  slug text primary key,
  word text not null,
  units jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint phonology_words_slug_not_blank check (length(trim(slug)) > 0),
  constraint phonology_words_word_not_blank check (length(trim(word)) > 0),
  constraint phonology_words_units_array check (jsonb_typeof(units) = 'array')
);

create index phonology_words_active_slug_idx
on public.phonology_words (is_active, slug);

drop trigger if exists trg_phonology_words_updated_at on public.phonology_words;
create trigger trg_phonology_words_updated_at
before update on public.phonology_words
for each row execute function public.set_updated_at();

alter table public.phonology_words enable row level security;

create policy phonology_words_public_read_active
on public.phonology_words
for select to anon, authenticated
using (is_active = true);

grant select on public.phonology_words to anon, authenticated;

-- ---------------------------------------------------------
-- Banque de vocabulaire système + copie enseignant
-- ---------------------------------------------------------

create table public.vocabulary_default_words (
  id bigint generated always as identity primary key,
  word text not null,
  word_normalized text not null,
  dictionary_page int null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vocabulary_default_words_word_not_blank check (length(trim(word)) > 0),
  constraint vocabulary_default_words_word_normalized_not_blank check (length(trim(word_normalized)) > 0),
  constraint vocabulary_default_words_dictionary_page_positive check (dictionary_page is null or dictionary_page > 0),
  constraint vocabulary_default_words_word_normalized_unique unique (word_normalized)
);

create index vocabulary_default_words_word_normalized_idx
on public.vocabulary_default_words (word_normalized);

drop trigger if exists trg_vocabulary_default_words_updated_at on public.vocabulary_default_words;
create trigger trg_vocabulary_default_words_updated_at
before update on public.vocabulary_default_words
for each row execute function public.set_updated_at();

alter table public.vocabulary_default_words enable row level security;

create policy vocabulary_default_words_public_read
on public.vocabulary_default_words
for select to anon, authenticated
using (true);

grant select on public.vocabulary_default_words to anon, authenticated;

create table public.teacher_vocabulary_words (
  id bigint generated always as identity primary key,
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  word text not null,
  word_normalized text not null,
  dictionary_page int null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_vocabulary_words_word_not_blank check (length(trim(word)) > 0),
  constraint teacher_vocabulary_words_word_normalized_not_blank check (length(trim(word_normalized)) > 0),
  constraint teacher_vocabulary_words_dictionary_page_positive check (dictionary_page is null or dictionary_page > 0),
  constraint teacher_vocabulary_words_unique_word_per_space unique (teacher_space_id, word_normalized)
);

create index teacher_vocabulary_words_space_word_idx
on public.teacher_vocabulary_words (teacher_space_id, word_normalized);

drop trigger if exists trg_teacher_vocabulary_words_updated_at on public.teacher_vocabulary_words;
create trigger trg_teacher_vocabulary_words_updated_at
before update on public.teacher_vocabulary_words
for each row execute function public.set_updated_at();

alter table public.teacher_vocabulary_words enable row level security;

create policy teacher_vocabulary_words_select_own
on public.teacher_vocabulary_words
for select to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_vocabulary_words.teacher_space_id and ts.owner_user_id = auth.uid()));

grant select on public.teacher_vocabulary_words to authenticated;

create or replace function public.copy_default_vocabulary_words_to_teacher_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.teacher_vocabulary_words (teacher_space_id, word, word_normalized, dictionary_page, updated_at)
  select new.id, d.word, d.word_normalized, d.dictionary_page, now()
  from public.vocabulary_default_words d
  on conflict (teacher_space_id, word_normalized) do update
  set word = excluded.word,
      dictionary_page = excluded.dictionary_page,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists teacher_spaces_copy_default_vocabulary_words on public.teacher_spaces;
create trigger teacher_spaces_copy_default_vocabulary_words
after insert on public.teacher_spaces
for each row execute function public.copy_default_vocabulary_words_to_teacher_space();

create or replace function public.reset_teacher_vocabulary_words(p_teacher_space_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not exists (select 1 from public.teacher_spaces ts where ts.id = p_teacher_space_id and ts.owner_user_id = auth.uid()) then
    raise exception 'Accès refusé à cette banque de mots.';
  end if;

  delete from public.teacher_vocabulary_words where teacher_space_id = p_teacher_space_id;

  insert into public.teacher_vocabulary_words (teacher_space_id, word, word_normalized, dictionary_page, updated_at)
  select p_teacher_space_id, d.word, d.word_normalized, d.dictionary_page, now()
  from public.vocabulary_default_words d;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.replace_teacher_vocabulary_words(
  p_teacher_space_id bigint,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not exists (select 1 from public.teacher_spaces ts where ts.id = p_teacher_space_id and ts.owner_user_id = auth.uid()) then
    raise exception 'Accès refusé à cette banque de mots.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Format de banque de mots invalide.';
  end if;

  delete from public.teacher_vocabulary_words where teacher_space_id = p_teacher_space_id;

  with parsed as (
    select
      trim(x.word) as word,
      lower(trim(x.word)) as word_normalized,
      case when x.dictionary_page is not null and x.dictionary_page > 0 then x.dictionary_page else null end as dictionary_page
    from jsonb_to_recordset(p_items) as x(word text, dictionary_page int)
  ), cleaned as (
    select distinct on (word_normalized) word, word_normalized, dictionary_page
    from parsed
    where word is not null and length(trim(word)) > 0
    order by word_normalized, word
  )
  insert into public.teacher_vocabulary_words (teacher_space_id, word, word_normalized, dictionary_page, updated_at)
  select p_teacher_space_id, c.word, c.word_normalized, c.dictionary_page, now()
  from cleaned c;

  get diagnostics v_count = row_count;

  if v_count <= 0 then
    raise exception 'La banque de mots doit contenir au moins un mot valide.';
  end if;

  return v_count;
end;
$$;

create or replace function public.get_space_vocabulary_words(p_access_code text)
returns table (
  word text,
  dictionary_page int
)
language sql
stable
security definer
set search_path = public
as $$
  select tvw.word, tvw.dictionary_page
  from public.teacher_spaces ts
  join public.teacher_vocabulary_words tvw on tvw.teacher_space_id = ts.id
  where ts.access_code = upper(trim(p_access_code))
  order by tvw.word_normalized asc, tvw.word asc, tvw.id asc;
$$;

grant execute on function public.reset_teacher_vocabulary_words(bigint) to authenticated;
grant execute on function public.replace_teacher_vocabulary_words(bigint, jsonb) to authenticated;
grant execute on function public.get_space_vocabulary_words(text) to anon, authenticated;



-- =========================================================
-- SOURCE: sql/from_scratch/06_ressources_personnelles.sql
-- =========================================================

-- =========================================================
-- 06_RESSOURCES_PERSONNELLES — presets Encodage, listes Conjugaison
-- =========================================================

-- ---------------------------------------------------------
-- Presets personnels de graphèmes / Encodage
-- ---------------------------------------------------------

create table public.teacher_phonology_presets (
  id text primary key,
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  tool_key text not null default 'encodage',
  name text not null,
  graph_order jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_phonology_presets_name_not_blank check (btrim(name) <> ''),
  constraint teacher_phonology_presets_graph_order_is_array check (jsonb_typeof(graph_order) = 'array')
);

create index teacher_phonology_presets_space_tool_idx
on public.teacher_phonology_presets (teacher_space_id, tool_key);

create index teacher_phonology_presets_space_tool_name_idx
on public.teacher_phonology_presets (teacher_space_id, tool_key, name);

drop trigger if exists trg_teacher_phonology_presets_updated_at on public.teacher_phonology_presets;
create trigger trg_teacher_phonology_presets_updated_at
before update on public.teacher_phonology_presets
for each row execute function public.set_updated_at();

alter table public.teacher_phonology_presets enable row level security;

create policy teacher_phonology_presets_select_own
on public.teacher_phonology_presets
for select to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_phonology_presets.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy teacher_phonology_presets_insert_own
on public.teacher_phonology_presets
for insert to authenticated
with check (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_phonology_presets.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy teacher_phonology_presets_update_own
on public.teacher_phonology_presets
for update to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_phonology_presets.teacher_space_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_phonology_presets.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy teacher_phonology_presets_delete_own
on public.teacher_phonology_presets
for delete to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_phonology_presets.teacher_space_id and ts.owner_user_id = auth.uid()));

grant select, insert, update, delete on public.teacher_phonology_presets to authenticated;

-- ---------------------------------------------------------
-- Listes personnelles de verbes / Conjugaison
-- ---------------------------------------------------------

create table public.teacher_conjugation_lists (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  verbs_json jsonb not null default '{"infinitives": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_conjugation_lists_name_not_empty check (btrim(name) <> ''),
  constraint teacher_conjugation_lists_normalized_name_not_empty check (btrim(normalized_name) <> ''),
  constraint teacher_conjugation_lists_verbs_object check (jsonb_typeof(verbs_json) = 'object'),
  constraint teacher_conjugation_lists_infinitives_array check (
    verbs_json ? 'infinitives'
    and jsonb_typeof(verbs_json -> 'infinitives') = 'array'
  )
);

create unique index teacher_conjugation_lists_space_normalized_name_uidx
on public.teacher_conjugation_lists (teacher_space_id, normalized_name);

create index teacher_conjugation_lists_space_name_idx
on public.teacher_conjugation_lists (teacher_space_id, name);

drop trigger if exists trg_teacher_conjugation_lists_updated_at on public.teacher_conjugation_lists;
create trigger trg_teacher_conjugation_lists_updated_at
before update on public.teacher_conjugation_lists
for each row execute function public.set_updated_at();

alter table public.teacher_conjugation_lists enable row level security;

create policy teacher_conjugation_lists_select_own
on public.teacher_conjugation_lists
for select to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_conjugation_lists.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy teacher_conjugation_lists_insert_own
on public.teacher_conjugation_lists
for insert to authenticated
with check (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_conjugation_lists.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy teacher_conjugation_lists_update_own
on public.teacher_conjugation_lists
for update to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_conjugation_lists.teacher_space_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_conjugation_lists.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy teacher_conjugation_lists_delete_own
on public.teacher_conjugation_lists
for delete to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_conjugation_lists.teacher_space_id and ts.owner_user_id = auth.uid()));

grant select, insert, update, delete on public.teacher_conjugation_lists to authenticated;

create or replace function public.get_conjugation_personal_list(
  p_access_code text,
  p_list_id uuid
)
returns table (
  id uuid,
  name text,
  verbs_json jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.name, l.verbs_json
  from public.teacher_conjugation_lists l
  join public.teacher_spaces ts on ts.id = l.teacher_space_id
  where ts.access_code = upper(regexp_replace(coalesce(p_access_code, ''), '[^A-Za-z]', '', 'g'))
    and l.id = p_list_id
  limit 1;
$$;

grant execute on function public.get_conjugation_personal_list(text, uuid) to anon, authenticated;



-- =========================================================
-- SOURCE: sql/from_scratch/07_adaptation_aventure.sql
-- =========================================================

-- =========================================================
-- 07_ADAPTATION_AVENTURE — niveaux adaptatifs par élève/activité
-- =========================================================

-- Cette partie prépare l’Aventure.
-- Elle peut être appliquée dès maintenant, même si le front ne l’utilise pas encore.

create table public.student_catalog_activity_levels (
  student_id bigint not null references public.students(id) on delete cascade,
  catalog_activity_id text not null,
  current_level smallint not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (student_id, catalog_activity_id),
  constraint student_catalog_activity_levels_activity_not_blank check (btrim(catalog_activity_id) <> ''),
  constraint student_catalog_activity_levels_level_check check (current_level between 1 and 5)
);

create index student_catalog_activity_levels_activity_idx
on public.student_catalog_activity_levels (catalog_activity_id, current_level);

drop trigger if exists trg_student_catalog_activity_levels_updated_at on public.student_catalog_activity_levels;
create trigger trg_student_catalog_activity_levels_updated_at
before update on public.student_catalog_activity_levels
for each row execute function public.set_updated_at();

create table public.student_catalog_activity_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id bigint not null references public.students(id) on delete cascade,
  catalog_activity_id text not null,
  level_before smallint not null,
  level_after smallint not null,
  success boolean not null,
  source text not null default 'exploration',
  created_at timestamptz not null default now(),

  constraint student_catalog_activity_attempts_activity_not_blank check (btrim(catalog_activity_id) <> ''),
  constraint student_catalog_activity_attempts_level_before_check check (level_before between 1 and 5),
  constraint student_catalog_activity_attempts_level_after_check check (level_after between 1 and 5),
  constraint student_catalog_activity_attempts_source_check check (source in ('exploration', 'aventure', 'mission'))
);

create index student_catalog_activity_attempts_student_activity_idx
on public.student_catalog_activity_attempts (student_id, catalog_activity_id, created_at desc);

create index student_catalog_activity_attempts_activity_idx
on public.student_catalog_activity_attempts (catalog_activity_id, created_at desc);

alter table public.student_catalog_activity_levels enable row level security;
alter table public.student_catalog_activity_attempts enable row level security;

create policy student_catalog_activity_levels_select_own
on public.student_catalog_activity_levels
for select to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where s.id = student_catalog_activity_levels.student_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy student_catalog_activity_attempts_select_own
on public.student_catalog_activity_attempts
for select to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where s.id = student_catalog_activity_attempts.student_id
      and ts.owner_user_id = auth.uid()
  )
);

-- Pas de grant insert/update direct pour authenticated côté navigateur enseignant :
-- la mise à jour élève passe par RPC vérifiant le code élève.
grant select on public.student_catalog_activity_levels to authenticated;
grant select on public.student_catalog_activity_attempts to authenticated;

create or replace function public.record_catalog_activity_result(
  p_access_code text,
  p_student_id bigint,
  p_student_code text,
  p_catalog_activity_id text,
  p_success boolean,
  p_source text default 'exploration'
)
returns table (
  current_level smallint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_activity_id text := trim(coalesce(p_catalog_activity_id, ''));
  safe_source text := coalesce(nullif(trim(p_source), ''), 'exploration');
  previous_level smallint;
  next_level smallint;
begin
  if safe_activity_id = '' then
    raise exception 'catalog_activity_id is required';
  end if;

  if safe_source not in ('exploration', 'aventure', 'mission') then
    safe_source := 'exploration';
  end if;

  if not public.verify_student_code(p_access_code, p_student_id, p_student_code) then
    raise exception 'Code élève invalide.';
  end if;

  select scal.current_level into previous_level
  from public.student_catalog_activity_levels scal
  where scal.student_id = p_student_id
    and scal.catalog_activity_id = safe_activity_id;

  previous_level := coalesce(previous_level, 3);

  if coalesce(p_success, false) then
    next_level := least(5, previous_level + 1);
  else
    next_level := greatest(1, previous_level - 1);
  end if;

  insert into public.student_catalog_activity_levels (student_id, catalog_activity_id, current_level, updated_at)
  values (p_student_id, safe_activity_id, next_level, now())
  on conflict (student_id, catalog_activity_id) do update
  set current_level = excluded.current_level,
      updated_at = now();

  insert into public.student_catalog_activity_attempts (
    student_id,
    catalog_activity_id,
    level_before,
    level_after,
    success,
    source
  ) values (
    p_student_id,
    safe_activity_id,
    previous_level,
    next_level,
    coalesce(p_success, false),
    safe_source
  );

  return query select next_level;
end;
$$;

grant execute on function public.record_catalog_activity_result(text, bigint, text, text, boolean, text) to anon, authenticated;