-- =========================================================
-- 11_resource_recordings_folder.sql
-- Dossier logique stable pour les enregistrements audio personnels.
-- À exécuter une seule fois dans le SQL Editor Supabase.
-- =========================================================

begin;

alter table public.resource_folders
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.resource_folders
  drop constraint if exists resource_folders_metadata_object_check;

alter table public.resource_folders
  add constraint resource_folders_metadata_object_check
  check (jsonb_typeof(metadata) = 'object');

create unique index if not exists resource_folders_teacher_system_role_unique
on public.resource_folders (teacher_space_id, (metadata ->> 'system_role'))
where is_system = false
  and coalesce(metadata ->> 'system_role', '') <> '';

commit;
