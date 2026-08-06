-- =========================================================
-- PATCH 22 — Import en masse des images pédagogiques système
-- À exécuter une seule fois après 21_phonology_words_import.sql.
--
-- - garantit le bucket public `images` ;
-- - réserve l'écriture sous `bank/` au super-admin ;
-- - ajoute des métadonnées techniques à `image_assets` ;
-- - permet l'import en masse depuis le tableau de bord.
-- =========================================================

begin;

alter table public.image_assets
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.image_assets
  drop constraint if exists image_assets_metadata_object_check;

alter table public.image_assets
  add constraint image_assets_metadata_object_check
  check (jsonb_typeof(metadata) = 'object');

alter table public.image_assets enable row level security;

-- Lecture publique des images actives : utilisée par les activités élèves.
drop policy if exists image_assets_public_read_active on public.image_assets;
create policy image_assets_public_read_active
on public.image_assets
for select
to anon, authenticated
using (is_active = true);

-- Le super-admin peut aussi voir les lignes désactivées dans l'importateur.
drop policy if exists image_assets_admin_select on public.image_assets;
create policy image_assets_admin_select
on public.image_assets
for select
to authenticated
using (public.is_super_admin());

drop policy if exists image_assets_admin_insert on public.image_assets;
create policy image_assets_admin_insert
on public.image_assets
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists image_assets_admin_update on public.image_assets;
create policy image_assets_admin_update
on public.image_assets
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists image_assets_admin_delete on public.image_assets;
create policy image_assets_admin_delete
on public.image_assets
for delete
to authenticated
using (public.is_super_admin());

grant select on public.image_assets to anon, authenticated;
grant insert, update, delete on public.image_assets to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'images',
  'images',
  true,
  10485760,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/avif',
    'image/svg+xml'
  ]::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Un bucket public rend uniquement la lecture publique. Les écritures restent
-- protégées par les politiques ci-dessous.
drop policy if exists system_image_bank_insert on storage.objects;
create policy system_image_bank_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'bank'
  and public.is_super_admin()
);

drop policy if exists system_image_bank_update on storage.objects;
create policy system_image_bank_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'bank'
  and public.is_super_admin()
)
with check (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'bank'
  and public.is_super_admin()
);

drop policy if exists system_image_bank_delete on storage.objects;
create policy system_image_bank_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'images'
  and (storage.foldername(name))[1] = 'bank'
  and public.is_super_admin()
);

commit;
