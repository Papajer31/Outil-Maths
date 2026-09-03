-- =========================================================
-- 38_interface_audio_system.sql
-- Moteur audio transversal : audios d'interface système.
-- À exécuter APRÈS 37_student_attempt_reset_controls.sql.
--
-- Le registre des phrases reste dans le code. Cette table contient seulement
-- les enregistrements qui remplacent la synthèse vocale.
-- owner_key prépare les futurs remplacements propres à un enseignant :
--   system
--   teacher:<teacher_space_id>
-- =========================================================

begin;

create table if not exists public.interface_audio_assets (
  owner_key text not null,
  audio_key text not null,
  teacher_space_id bigint null references public.teacher_spaces(id) on delete cascade,
  title text not null default '',
  source_text text not null default '',
  storage_bucket text not null default 'interface-audio',
  storage_path text not null,
  mime_type text not null default 'audio/webm',
  size_bytes bigint not null default 0,
  duration_seconds numeric not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (owner_key, audio_key),
  constraint interface_audio_assets_key_not_blank check (length(trim(audio_key)) > 0),
  constraint interface_audio_assets_owner_check check (
    (owner_key = 'system' and teacher_space_id is null)
    or
    (teacher_space_id is not null and owner_key = ('teacher:' || teacher_space_id::text))
  ),
  constraint interface_audio_assets_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint interface_audio_assets_size_check check (size_bytes >= 0),
  constraint interface_audio_assets_duration_check check (duration_seconds >= 0)
);

create index if not exists interface_audio_assets_teacher_idx
on public.interface_audio_assets (teacher_space_id, audio_key)
where teacher_space_id is not null;

drop trigger if exists trg_interface_audio_assets_updated_at on public.interface_audio_assets;
create trigger trg_interface_audio_assets_updated_at
before update on public.interface_audio_assets
for each row execute function public.set_updated_at();

alter table public.interface_audio_assets enable row level security;

drop policy if exists interface_audio_assets_select_system on public.interface_audio_assets;
create policy interface_audio_assets_select_system
on public.interface_audio_assets for select to anon, authenticated
using (owner_key = 'system');

drop policy if exists interface_audio_assets_admin_insert_system on public.interface_audio_assets;
create policy interface_audio_assets_admin_insert_system
on public.interface_audio_assets for insert to authenticated
with check (owner_key = 'system' and teacher_space_id is null and public.is_super_admin());

drop policy if exists interface_audio_assets_admin_update_system on public.interface_audio_assets;
create policy interface_audio_assets_admin_update_system
on public.interface_audio_assets for update to authenticated
using (owner_key = 'system' and public.is_super_admin())
with check (owner_key = 'system' and teacher_space_id is null and public.is_super_admin());

drop policy if exists interface_audio_assets_admin_delete_system on public.interface_audio_assets;
create policy interface_audio_assets_admin_delete_system
on public.interface_audio_assets for delete to authenticated
using (owner_key = 'system' and public.is_super_admin());

grant select on public.interface_audio_assets to anon, authenticated;
grant insert, update, delete on public.interface_audio_assets to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'interface-audio',
  'interface-audio',
  true,
  26214400,
  array['audio/*']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Les fichiers système sont administrables uniquement par le super-admin.
drop policy if exists interface_audio_storage_insert_system on storage.objects;
create policy interface_audio_storage_insert_system
on storage.objects for insert to authenticated
with check (
  bucket_id = 'interface-audio'
  and (storage.foldername(name))[1] = 'system'
  and public.is_super_admin()
);

drop policy if exists interface_audio_storage_update_system on storage.objects;
create policy interface_audio_storage_update_system
on storage.objects for update to authenticated
using (
  bucket_id = 'interface-audio'
  and (storage.foldername(name))[1] = 'system'
  and public.is_super_admin()
)
with check (
  bucket_id = 'interface-audio'
  and (storage.foldername(name))[1] = 'system'
  and public.is_super_admin()
);

drop policy if exists interface_audio_storage_delete_system on storage.objects;
create policy interface_audio_storage_delete_system
on storage.objects for delete to authenticated
using (
  bucket_id = 'interface-audio'
  and (storage.foldername(name))[1] = 'system'
  and public.is_super_admin()
);

-- Résolution publique. Le paramètre access_code prépare les futurs audios
-- personnels : une ligne teacher:<id> remplacera alors la ligne system.
create or replace function public.get_interface_audio_assets(p_access_code text default null)
returns table (
  audio_key text,
  owner_key text,
  storage_bucket text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  duration_seconds numeric,
  source_text text,
  title text
)
language sql
security definer
set search_path = public
stable
as $$
  with target_space as (
    select ts.id
    from public.teacher_spaces ts
    where p_access_code is not null
      and ts.access_code = upper(trim(p_access_code))
    limit 1
  ), candidates as (
    select
      ia.audio_key,
      ia.owner_key,
      ia.storage_bucket,
      ia.storage_path,
      ia.mime_type,
      ia.size_bytes,
      ia.duration_seconds,
      ia.source_text,
      ia.title,
      case when ia.teacher_space_id = (select id from target_space) then 0 else 1 end as priority
    from public.interface_audio_assets ia
    where ia.owner_key = 'system'
       or ia.teacher_space_id = (select id from target_space)
  )
  select distinct on (c.audio_key)
    c.audio_key,
    c.owner_key,
    c.storage_bucket,
    c.storage_path,
    c.mime_type,
    c.size_bytes,
    c.duration_seconds,
    c.source_text,
    c.title
  from candidates c
  order by c.audio_key, c.priority, c.owner_key;
$$;

revoke all on function public.get_interface_audio_assets(text) from public;
grant execute on function public.get_interface_audio_assets(text) to anon, authenticated;

commit;
