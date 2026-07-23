-- =========================================================
-- PATCH 07 — QUIZ + RESSOURCES PERSONNELLES
-- À exécuter UNE FOIS dans le SQL Editor Supabase.
-- Ce script est additif : il ne modifie pas les anciennes banques.
-- =========================================================

begin;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------
-- 1) Dossiers de Quiz
-- ---------------------------------------------------------

create table public.quiz_folders (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint references public.teacher_spaces(id) on delete cascade,
  parent_id uuid references public.quiz_folders(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  display_order integer not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_folders_scope_check check (
    (is_system = true and teacher_space_id is null)
    or
    (is_system = false and teacher_space_id is not null)
  )
);

create index quiz_folders_teacher_space_idx
on public.quiz_folders (teacher_space_id, parent_id, display_order, name);

create index quiz_folders_system_idx
on public.quiz_folders (is_system, parent_id, display_order, name);

create trigger quiz_folders_set_updated_at
before update on public.quiz_folders
for each row execute function public.set_updated_at();

create or replace function public.validate_quiz_folder_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent public.quiz_folders%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into v_parent
  from public.quiz_folders
  where id = new.parent_id;

  if not found then
    raise exception 'quiz parent folder not found';
  end if;

  if v_parent.is_system is distinct from new.is_system
     or v_parent.teacher_space_id is distinct from new.teacher_space_id then
    raise exception 'quiz folder scope mismatch';
  end if;

  if new.id = new.parent_id then
    raise exception 'a folder cannot be its own parent';
  end if;

  return new;
end;
$$;

create trigger quiz_folders_validate_parent
before insert or update of parent_id, teacher_space_id, is_system
on public.quiz_folders
for each row execute function public.validate_quiz_folder_parent();

-- ---------------------------------------------------------
-- 2) Quiz : document JSONB versionné
-- ---------------------------------------------------------

create table public.quizzes (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint references public.teacher_spaces(id) on delete cascade,
  folder_id uuid references public.quiz_folders(id) on delete restrict,
  title text not null check (btrim(title) <> ''),
  document jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1 check (schema_version >= 1),
  display_order integer not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quizzes_document_object_check check (jsonb_typeof(document) = 'object'),
  constraint quizzes_scope_check check (
    (is_system = true and teacher_space_id is null)
    or
    (is_system = false and teacher_space_id is not null)
  )
);

create index quizzes_teacher_space_idx
on public.quizzes (teacher_space_id, folder_id, display_order, title);

create index quizzes_system_idx
on public.quizzes (is_system, folder_id, display_order, title);

create index quizzes_document_gin_idx
on public.quizzes using gin (document jsonb_path_ops);

create trigger quizzes_set_updated_at
before update on public.quizzes
for each row execute function public.set_updated_at();

create or replace function public.validate_quiz_folder_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_folder public.quiz_folders%rowtype;
begin
  if new.folder_id is null then
    return new;
  end if;

  select * into v_folder
  from public.quiz_folders
  where id = new.folder_id;

  if not found then
    raise exception 'quiz folder not found';
  end if;

  if v_folder.is_system is distinct from new.is_system
     or v_folder.teacher_space_id is distinct from new.teacher_space_id then
    raise exception 'quiz and folder scopes do not match';
  end if;

  return new;
end;
$$;

create trigger quizzes_validate_folder_scope
before insert or update of folder_id, teacher_space_id, is_system
on public.quizzes
for each row execute function public.validate_quiz_folder_scope();

-- ---------------------------------------------------------
-- 3) Dossiers de ressources
-- ---------------------------------------------------------

create table public.resource_folders (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint references public.teacher_spaces(id) on delete cascade,
  parent_id uuid references public.resource_folders(id) on delete restrict,
  name text not null check (btrim(name) <> ''),
  display_order integer not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resource_folders_scope_check check (
    (is_system = true and teacher_space_id is null)
    or
    (is_system = false and teacher_space_id is not null)
  )
);

create index resource_folders_teacher_space_idx
on public.resource_folders (teacher_space_id, parent_id, display_order, name);

create index resource_folders_system_idx
on public.resource_folders (is_system, parent_id, display_order, name);

create trigger resource_folders_set_updated_at
before update on public.resource_folders
for each row execute function public.set_updated_at();

create or replace function public.validate_resource_folder_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_parent public.resource_folders%rowtype;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into v_parent
  from public.resource_folders
  where id = new.parent_id;

  if not found then
    raise exception 'resource parent folder not found';
  end if;

  if v_parent.is_system is distinct from new.is_system
     or v_parent.teacher_space_id is distinct from new.teacher_space_id then
    raise exception 'resource folder scope mismatch';
  end if;

  if new.id = new.parent_id then
    raise exception 'a folder cannot be its own parent';
  end if;

  return new;
end;
$$;

create trigger resource_folders_validate_parent
before insert or update of parent_id, teacher_space_id, is_system
on public.resource_folders
for each row execute function public.validate_resource_folder_parent();

-- ---------------------------------------------------------
-- 4) Métadonnées des ressources
-- ---------------------------------------------------------

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint references public.teacher_spaces(id) on delete cascade,
  folder_id uuid references public.resource_folders(id) on delete restrict,
  title text not null check (btrim(title) <> ''),
  resource_type text not null check (resource_type in ('image', 'audio')),
  storage_bucket text not null default 'teacher-resources',
  storage_path text not null check (btrim(storage_path) <> ''),
  mime_type text not null default '',
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  width integer not null default 0 check (width >= 0),
  height integer not null default 0 check (height >= 0),
  duration_seconds numeric not null default 0 check (duration_seconds >= 0),
  alt_text text not null default '',
  tags text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  display_order integer not null default 0,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint resources_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint resources_storage_unique unique (storage_bucket, storage_path),
  constraint resources_scope_check check (
    (is_system = true and teacher_space_id is null)
    or
    (is_system = false and teacher_space_id is not null)
  )
);

create index resources_teacher_space_idx
on public.resources (teacher_space_id, folder_id, display_order, title);

create index resources_system_idx
on public.resources (is_system, folder_id, display_order, title);

create index resources_tags_gin_idx
on public.resources using gin (tags);

create trigger resources_set_updated_at
before update on public.resources
for each row execute function public.set_updated_at();

create or replace function public.validate_resource_folder_scope()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_folder public.resource_folders%rowtype;
begin
  if new.folder_id is null then
    return new;
  end if;

  select * into v_folder
  from public.resource_folders
  where id = new.folder_id;

  if not found then
    raise exception 'resource folder not found';
  end if;

  if v_folder.is_system is distinct from new.is_system
     or v_folder.teacher_space_id is distinct from new.teacher_space_id then
    raise exception 'resource and folder scopes do not match';
  end if;

  return new;
end;
$$;

create trigger resources_validate_folder_scope
before insert or update of folder_id, teacher_space_id, is_system
on public.resources
for each row execute function public.validate_resource_folder_scope();

-- ---------------------------------------------------------
-- 5) Références Quiz ↔ ressources
-- ---------------------------------------------------------

create table public.quiz_resources (
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  resource_id uuid not null references public.resources(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (quiz_id, resource_id)
);

create index quiz_resources_resource_idx
on public.quiz_resources (resource_id, quiz_id);

-- ---------------------------------------------------------
-- 6) RLS : fonctions de contrôle communes
-- ---------------------------------------------------------

create or replace function public.owns_teacher_space(p_teacher_space_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = p_teacher_space_id
      and ts.owner_user_id = (select auth.uid())
  );
$$;

revoke all on function public.owns_teacher_space(bigint) from public;
grant execute on function public.owns_teacher_space(bigint) to authenticated;

alter table public.quiz_folders enable row level security;
alter table public.quizzes enable row level security;
alter table public.resource_folders enable row level security;
alter table public.resources enable row level security;
alter table public.quiz_resources enable row level security;

-- Quiz folders
create policy quiz_folders_select
on public.quiz_folders for select to authenticated
using (is_system = true or public.owns_teacher_space(teacher_space_id));

create policy quiz_folders_insert
on public.quiz_folders for insert to authenticated
with check (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and teacher_space_id is null and public.is_super_admin())
);

create policy quiz_folders_update
on public.quiz_folders for update to authenticated
using (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and public.is_super_admin())
)
with check (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and teacher_space_id is null and public.is_super_admin())
);

create policy quiz_folders_delete
on public.quiz_folders for delete to authenticated
using (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and public.is_super_admin())
);

-- Quizzes
create policy quizzes_select
on public.quizzes for select to authenticated
using (is_system = true or public.owns_teacher_space(teacher_space_id));

create policy quizzes_insert
on public.quizzes for insert to authenticated
with check (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and teacher_space_id is null and public.is_super_admin())
);

create policy quizzes_update
on public.quizzes for update to authenticated
using (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and public.is_super_admin())
)
with check (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and teacher_space_id is null and public.is_super_admin())
);

create policy quizzes_delete
on public.quizzes for delete to authenticated
using (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and public.is_super_admin())
);

-- Resource folders
create policy resource_folders_select
on public.resource_folders for select to authenticated
using (is_system = true or public.owns_teacher_space(teacher_space_id));

create policy resource_folders_insert
on public.resource_folders for insert to authenticated
with check (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and teacher_space_id is null and public.is_super_admin())
);

create policy resource_folders_update
on public.resource_folders for update to authenticated
using (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and public.is_super_admin())
)
with check (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and teacher_space_id is null and public.is_super_admin())
);

create policy resource_folders_delete
on public.resource_folders for delete to authenticated
using (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and public.is_super_admin())
);

-- Resources
create policy resources_select
on public.resources for select to authenticated
using (is_system = true or public.owns_teacher_space(teacher_space_id));

create policy resources_insert
on public.resources for insert to authenticated
with check (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and teacher_space_id is null and public.is_super_admin())
);

create policy resources_update
on public.resources for update to authenticated
using (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and public.is_super_admin())
)
with check (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and teacher_space_id is null and public.is_super_admin())
);

create policy resources_delete
on public.resources for delete to authenticated
using (
  (is_system = false and public.owns_teacher_space(teacher_space_id))
  or
  (is_system = true and public.is_super_admin())
);

-- Quiz/resource links
create policy quiz_resources_select
on public.quiz_resources for select to authenticated
using (
  exists (
    select 1 from public.quizzes q
    where q.id = quiz_resources.quiz_id
      and (q.is_system = true or public.owns_teacher_space(q.teacher_space_id))
  )
);

create policy quiz_resources_insert
on public.quiz_resources for insert to authenticated
with check (
  exists (
    select 1 from public.quizzes q
    where q.id = quiz_resources.quiz_id
      and (
        (q.is_system = false and public.owns_teacher_space(q.teacher_space_id))
        or (q.is_system = true and public.is_super_admin())
      )
  )
  and exists (
    select 1 from public.resources r
    where r.id = quiz_resources.resource_id
      and (r.is_system = true or public.owns_teacher_space(r.teacher_space_id))
  )
);

create policy quiz_resources_delete
on public.quiz_resources for delete to authenticated
using (
  exists (
    select 1 from public.quizzes q
    where q.id = quiz_resources.quiz_id
      and (
        (q.is_system = false and public.owns_teacher_space(q.teacher_space_id))
        or (q.is_system = true and public.is_super_admin())
      )
  )
);

grant select, insert, update, delete on
  public.quiz_folders,
  public.quizzes,
  public.resource_folders,
  public.resources,
  public.quiz_resources
to authenticated;

-- ---------------------------------------------------------
-- 7) Bucket privé pour les futures images et pistes audio
-- ---------------------------------------------------------
-- Les objets personnels seront rangés sous :
--   <auth.uid()>/<resource_uuid>/<nom_de_fichier>
-- Les éventuelles ressources système seront rangées sous :
--   system/<resource_uuid>/<nom_de_fichier>

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'teacher-resources',
  'teacher-resources',
  false,
  26214400,
  array['image/*', 'audio/*']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy teacher_resources_select
on storage.objects for select to authenticated
using (
  bucket_id = 'teacher-resources'
  and (
    owner_id = (select auth.uid()::text)
    or (storage.foldername(name))[1] = 'system'
  )
);

create policy teacher_resources_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'teacher-resources'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or (
      (storage.foldername(name))[1] = 'system'
      and public.is_super_admin()
    )
  )
);

create policy teacher_resources_update
on storage.objects for update to authenticated
using (
  bucket_id = 'teacher-resources'
  and (
    owner_id = (select auth.uid()::text)
    or (
      (storage.foldername(name))[1] = 'system'
      and public.is_super_admin()
    )
  )
)
with check (
  bucket_id = 'teacher-resources'
  and (
    (storage.foldername(name))[1] = (select auth.uid()::text)
    or (
      (storage.foldername(name))[1] = 'system'
      and public.is_super_admin()
    )
  )
);

create policy teacher_resources_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'teacher-resources'
  and (
    owner_id = (select auth.uid()::text)
    or (
      (storage.foldername(name))[1] = 'system'
      and public.is_super_admin()
    )
  )
);

commit;
