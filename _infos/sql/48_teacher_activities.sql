-- =========================================================
-- 48_TEACHER_ACTIVITIES — espace personnel « Mes activités »
-- =========================================================
-- Cette migration ouvre un nouvel espace parallèle au système Missions.
-- Aucune donnée existante n'est migrée ni modifiée.

begin;

-- ---------------------------------------------------------
-- Dossiers personnels d'activités
-- ---------------------------------------------------------

create table if not exists public.teacher_activity_folders (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  parent_id uuid null references public.teacher_activity_folders(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_activity_folders_name_not_blank check (btrim(name) <> ''),
  constraint teacher_activity_folders_no_self_parent check (parent_id is null or parent_id <> id)
);

create index if not exists teacher_activity_folders_teacher_space_idx
on public.teacher_activity_folders (teacher_space_id);

create index if not exists teacher_activity_folders_parent_idx
on public.teacher_activity_folders (parent_id);

create index if not exists teacher_activity_folders_order_idx
on public.teacher_activity_folders (teacher_space_id, parent_id, display_order, name);

create unique index if not exists teacher_activity_folders_sibling_name_unique
on public.teacher_activity_folders (
  teacher_space_id,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

create or replace function public.validate_teacher_activity_folder_parent()
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
    raise exception 'Un dossier d''activités ne peut pas être son propre parent.';
  end if;

  select f.teacher_space_id into parent_space_id
  from public.teacher_activity_folders f
  where f.id = new.parent_id;

  if parent_space_id is null or parent_space_id <> new.teacher_space_id then
    raise exception 'Le dossier parent ne correspond pas à l''espace enseignant.';
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      with recursive descendants as (
        select child.id, child.parent_id
        from public.teacher_activity_folders child
        where child.parent_id = new.id
        union all
        select child.id, child.parent_id
        from public.teacher_activity_folders child
        join descendants d on d.id = child.parent_id
      )
      select 1 from descendants where descendants.id = new.parent_id
    ) then
      raise exception 'Un dossier d''activités ne peut pas être déplacé dans l''un de ses sous-dossiers.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_teacher_activity_folders_updated_at on public.teacher_activity_folders;
create trigger trg_teacher_activity_folders_updated_at
before update on public.teacher_activity_folders
for each row execute function public.set_updated_at();

drop trigger if exists trg_validate_teacher_activity_folder_parent on public.teacher_activity_folders;
create trigger trg_validate_teacher_activity_folder_parent
before insert or update of parent_id, teacher_space_id
on public.teacher_activity_folders
for each row execute function public.validate_teacher_activity_folder_parent();

-- ---------------------------------------------------------
-- Activités personnelles
-- ---------------------------------------------------------

create table if not exists public.teacher_activities (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  folder_id uuid null references public.teacher_activity_folders(id) on delete set null,
  title text not null,
  title_normalized text not null,
  activity_type text not null,
  difficulty_mode text not null default 'single',
  source_quiz_id uuid null references public.quizzes(id) on delete cascade,
  config_json jsonb not null default '{}'::jsonb,
  levels_json jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_activities_title_not_blank check (btrim(title) <> ''),
  constraint teacher_activities_title_normalized_not_blank check (btrim(title_normalized) <> ''),
  constraint teacher_activities_type_check check (activity_type in ('quiz', 'series', 'tool')),
  constraint teacher_activities_difficulty_mode_check check (difficulty_mode in ('single', 'adaptive')),
  constraint teacher_activities_config_object check (jsonb_typeof(config_json) = 'object'),
  constraint teacher_activities_levels_object check (jsonb_typeof(levels_json) = 'object'),
  constraint teacher_activities_source_check check (
    (activity_type in ('quiz', 'series') and source_quiz_id is not null)
    or (activity_type = 'tool' and source_quiz_id is null)
  )
);

create index if not exists teacher_activities_space_order_idx
on public.teacher_activities (teacher_space_id, display_order, title);

create index if not exists teacher_activities_folder_order_idx
on public.teacher_activities (teacher_space_id, folder_id, display_order, title);

create index if not exists teacher_activities_source_quiz_idx
on public.teacher_activities (source_quiz_id)
where source_quiz_id is not null;

create or replace function public.validate_teacher_activity_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  folder_space_id bigint;
  quiz_space_id bigint;
  quiz_is_system boolean;
begin
  if new.folder_id is not null then
    select f.teacher_space_id into folder_space_id
    from public.teacher_activity_folders f
    where f.id = new.folder_id;

    if folder_space_id is null or folder_space_id <> new.teacher_space_id then
      raise exception 'Le dossier d''activité ne correspond pas à l''espace enseignant.';
    end if;
  end if;

  if new.source_quiz_id is not null then
    select q.teacher_space_id, q.is_system into quiz_space_id, quiz_is_system
    from public.quizzes q
    where q.id = new.source_quiz_id;

    if quiz_is_system is not true and (quiz_space_id is null or quiz_space_id <> new.teacher_space_id) then
      raise exception 'Le quiz source ne correspond pas à l''espace enseignant.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_teacher_activities_updated_at on public.teacher_activities;
create trigger trg_teacher_activities_updated_at
before update on public.teacher_activities
for each row execute function public.set_updated_at();

drop trigger if exists trg_validate_teacher_activity_refs on public.teacher_activities;
create trigger trg_validate_teacher_activity_refs
before insert or update of teacher_space_id, folder_id, source_quiz_id
on public.teacher_activities
for each row execute function public.validate_teacher_activity_refs();

-- ---------------------------------------------------------
-- RLS : strictement lié au compte enseignant
-- ---------------------------------------------------------

alter table public.teacher_activity_folders enable row level security;
alter table public.teacher_activities enable row level security;

drop policy if exists teacher_activity_folders_select_own on public.teacher_activity_folders;
create policy teacher_activity_folders_select_own on public.teacher_activity_folders
for select to authenticated
using (exists (
  select 1 from public.teacher_spaces ts
  where ts.id = teacher_activity_folders.teacher_space_id
    and ts.owner_user_id = auth.uid()
));

drop policy if exists teacher_activity_folders_insert_own on public.teacher_activity_folders;
create policy teacher_activity_folders_insert_own on public.teacher_activity_folders
for insert to authenticated
with check (exists (
  select 1 from public.teacher_spaces ts
  where ts.id = teacher_activity_folders.teacher_space_id
    and ts.owner_user_id = auth.uid()
));

drop policy if exists teacher_activity_folders_update_own on public.teacher_activity_folders;
create policy teacher_activity_folders_update_own on public.teacher_activity_folders
for update to authenticated
using (exists (
  select 1 from public.teacher_spaces ts
  where ts.id = teacher_activity_folders.teacher_space_id
    and ts.owner_user_id = auth.uid()
))
with check (exists (
  select 1 from public.teacher_spaces ts
  where ts.id = teacher_activity_folders.teacher_space_id
    and ts.owner_user_id = auth.uid()
));

drop policy if exists teacher_activity_folders_delete_own on public.teacher_activity_folders;
create policy teacher_activity_folders_delete_own on public.teacher_activity_folders
for delete to authenticated
using (exists (
  select 1 from public.teacher_spaces ts
  where ts.id = teacher_activity_folders.teacher_space_id
    and ts.owner_user_id = auth.uid()
));

drop policy if exists teacher_activities_select_own on public.teacher_activities;
create policy teacher_activities_select_own on public.teacher_activities
for select to authenticated
using (exists (
  select 1 from public.teacher_spaces ts
  where ts.id = teacher_activities.teacher_space_id
    and ts.owner_user_id = auth.uid()
));

drop policy if exists teacher_activities_insert_own on public.teacher_activities;
create policy teacher_activities_insert_own on public.teacher_activities
for insert to authenticated
with check (exists (
  select 1 from public.teacher_spaces ts
  where ts.id = teacher_activities.teacher_space_id
    and ts.owner_user_id = auth.uid()
));

drop policy if exists teacher_activities_update_own on public.teacher_activities;
create policy teacher_activities_update_own on public.teacher_activities
for update to authenticated
using (exists (
  select 1 from public.teacher_spaces ts
  where ts.id = teacher_activities.teacher_space_id
    and ts.owner_user_id = auth.uid()
))
with check (exists (
  select 1 from public.teacher_spaces ts
  where ts.id = teacher_activities.teacher_space_id
    and ts.owner_user_id = auth.uid()
));

drop policy if exists teacher_activities_delete_own on public.teacher_activities;
create policy teacher_activities_delete_own on public.teacher_activities
for delete to authenticated
using (exists (
  select 1 from public.teacher_spaces ts
  where ts.id = teacher_activities.teacher_space_id
    and ts.owner_user_id = auth.uid()
));

grant select, insert, update, delete on public.teacher_activity_folders to authenticated;
grant select, insert, update, delete on public.teacher_activities to authenticated;

commit;
