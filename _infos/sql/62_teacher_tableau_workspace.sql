-- =========================================================
-- PATCH 62 — SAUVEGARDE DU TABLEAU ENSEIGNANT
--
-- Un seul workspace persistant par espace enseignant.
-- Les fichiers locaux utilisés par le Tableau sont stockés dans un bucket
-- privé dédié et restent des dépendances techniques, hors de « Mes ressources ».
-- =========================================================

begin;

grant usage on schema public to authenticated;

create table if not exists public.teacher_tableau_workspaces (
  teacher_space_id bigint primary key references public.teacher_spaces(id) on delete cascade,
  workspace_version integer not null default 1,
  workspace jsonb not null default '{}'::jsonb,
  assets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_tableau_workspaces_version_positive check (workspace_version >= 1),
  constraint teacher_tableau_workspaces_workspace_object check (jsonb_typeof(workspace) = 'object'),
  constraint teacher_tableau_workspaces_assets_object check (jsonb_typeof(assets) = 'object')
);

drop trigger if exists trg_teacher_tableau_workspaces_updated_at on public.teacher_tableau_workspaces;
create trigger trg_teacher_tableau_workspaces_updated_at
before update on public.teacher_tableau_workspaces
for each row execute function public.set_updated_at();

alter table public.teacher_tableau_workspaces enable row level security;

drop policy if exists teacher_tableau_workspaces_owner_all on public.teacher_tableau_workspaces;
create policy teacher_tableau_workspaces_owner_all
on public.teacher_tableau_workspaces
for all
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_tableau_workspaces.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_tableau_workspaces.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.teacher_tableau_workspaces to authenticated;

-- Bucket privé dédié aux dépendances temporaires du Tableau.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'teacher-tableau',
  'teacher-tableau',
  false,
  52428800,
  null
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Convention de chemin : <auth.uid()>/<teacher_space_id>/<asset_uuid>-<nom>

drop policy if exists teacher_tableau_storage_select on storage.objects;
create policy teacher_tableau_storage_select
on storage.objects for select to authenticated
using (
  bucket_id = 'teacher-tableau'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists teacher_tableau_storage_insert on storage.objects;
create policy teacher_tableau_storage_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'teacher-tableau'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists teacher_tableau_storage_update on storage.objects;
create policy teacher_tableau_storage_update
on storage.objects for update to authenticated
using (
  bucket_id = 'teacher-tableau'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'teacher-tableau'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists teacher_tableau_storage_delete on storage.objects;
create policy teacher_tableau_storage_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'teacher-tableau'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

commit;
