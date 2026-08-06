-- =========================================================
-- PATCH 23 — Images Supabase dans l’explorateur de ressources
-- À exécuter une seule fois après 22_system_image_assets_import.sql.
--
-- - relie chaque image_assets à une ressource système stable ;
-- - migre les images déjà importées sans déplacer les fichiers Storage ;
-- - crée le dossier logique Images > À classer ;
-- - expose une RPC atomique pour les futurs imports ;
-- - permet ensuite au super-admin de classer les images par dossiers.
-- =========================================================

begin;

alter table public.resource_folders
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.image_assets
  add column if not exists resource_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'image_assets_resource_id_fkey'
      and conrelid = 'public.image_assets'::regclass
  ) then
    alter table public.image_assets
      add constraint image_assets_resource_id_fkey
      foreign key (resource_id)
      references public.resources(id)
      on delete set null;
  end if;
end;
$$;

create unique index if not exists image_assets_resource_id_unique
on public.image_assets (resource_id)
where resource_id is not null;

create unique index if not exists resource_folders_system_role_unique
on public.resource_folders ((metadata ->> 'system_role'))
where is_system = true
  and coalesce(metadata ->> 'system_role', '') <> '';

-- Racine technique masquée par l’interface : ses enfants sont affichés
-- directement sous « Ressources système > Images ».
insert into public.resource_folders (
  teacher_space_id,
  parent_id,
  name,
  metadata,
  display_order,
  is_system
)
select
  null,
  null,
  'Images',
  jsonb_build_object(
    'system_role', 'system_images_root',
    'resource_type', 'image',
    'hidden_in_explorer', true
  ),
  0,
  true
where not exists (
  select 1
  from public.resource_folders
  where is_system = true
    and metadata ->> 'system_role' = 'system_images_root'
);

insert into public.resource_folders (
  teacher_space_id,
  parent_id,
  name,
  metadata,
  display_order,
  is_system
)
select
  null,
  root.id,
  'À classer',
  jsonb_build_object(
    'system_role', 'system_images_unclassified',
    'resource_type', 'image'
  ),
  0,
  true
from public.resource_folders root
where root.is_system = true
  and root.metadata ->> 'system_role' = 'system_images_root'
  and not exists (
    select 1
    from public.resource_folders child
    where child.is_system = true
      and child.metadata ->> 'system_role' = 'system_images_unclassified'
  );

-- Les imports antérieurs au patch 23 sont transformés en ressources système.
do $$
declare
  v_unclassified_id uuid;
  v_asset public.image_assets%rowtype;
  v_resource_id uuid;
  v_title text;
  v_metadata jsonb;
begin
  select id into v_unclassified_id
  from public.resource_folders
  where is_system = true
    and metadata ->> 'system_role' = 'system_images_unclassified'
  limit 1;

  if v_unclassified_id is null then
    raise exception 'system images unclassified folder is missing';
  end if;

  for v_asset in
    select * from public.image_assets order by slug
  loop
    v_resource_id := null;

    if v_asset.resource_id is not null then
      select id into v_resource_id
      from public.resources
      where id = v_asset.resource_id
        and is_system = true;
    end if;

    if v_resource_id is null then
      select id into v_resource_id
      from public.resources
      where is_system = true
        and (
          (storage_bucket = 'images' and storage_path = v_asset.storage_path)
          or metadata ->> 'image_asset_slug' = v_asset.slug
        )
      order by updated_at desc
      limit 1;
    end if;

    v_title := nullif(btrim(v_asset.notes), '');
    if v_title is null then
      v_title := initcap(replace(replace(v_asset.slug, '_', ' '), '-', ' '));
    end if;

    v_metadata := coalesce(v_asset.metadata, '{}'::jsonb)
      || jsonb_build_object(
        'source', 'image_assets',
        'image_asset_slug', v_asset.slug
      );

    if v_resource_id is null then
      insert into public.resources (
        teacher_space_id,
        folder_id,
        title,
        resource_type,
        storage_bucket,
        storage_path,
        mime_type,
        size_bytes,
        width,
        height,
        duration_seconds,
        alt_text,
        tags,
        metadata,
        display_order,
        is_system
      )
      values (
        null,
        v_unclassified_id,
        v_title,
        'image',
        'images',
        v_asset.storage_path,
        coalesce(v_asset.metadata ->> 'mime_type', ''),
        case when coalesce(v_asset.metadata ->> 'size_bytes', '') ~ '^[0-9]+$' then (v_asset.metadata ->> 'size_bytes')::bigint else 0 end,
        case when coalesce(v_asset.metadata ->> 'width', '') ~ '^[0-9]+$' then (v_asset.metadata ->> 'width')::integer else 0 end,
        case when coalesce(v_asset.metadata ->> 'height', '') ~ '^[0-9]+$' then (v_asset.metadata ->> 'height')::integer else 0 end,
        0,
        v_title,
        coalesce(v_asset.tags, '{}'::text[]),
        v_metadata,
        coalesce((
          select max(r.display_order) + 1
          from public.resources r
          where r.folder_id = v_unclassified_id
        ), 0),
        true
      )
      returning id into v_resource_id;
    else
      update public.resources
      set
        resource_type = 'image',
        storage_bucket = 'images',
        storage_path = v_asset.storage_path,
        mime_type = coalesce(v_asset.metadata ->> 'mime_type', mime_type, ''),
        size_bytes = case when coalesce(v_asset.metadata ->> 'size_bytes', '') ~ '^[0-9]+$' then (v_asset.metadata ->> 'size_bytes')::bigint else size_bytes end,
        width = case when coalesce(v_asset.metadata ->> 'width', '') ~ '^[0-9]+$' then (v_asset.metadata ->> 'width')::integer else width end,
        height = case when coalesce(v_asset.metadata ->> 'height', '') ~ '^[0-9]+$' then (v_asset.metadata ->> 'height')::integer else height end,
        tags = coalesce(v_asset.tags, '{}'::text[]),
        metadata = coalesce(metadata, '{}'::jsonb) || v_metadata,
        is_system = true,
        teacher_space_id = null
      where id = v_resource_id;
    end if;

    update public.image_assets
    set resource_id = v_resource_id
    where slug = v_asset.slug
      and resource_id is distinct from v_resource_id;
  end loop;
end;
$$;

create or replace function public.upsert_system_image_asset_as_admin(
  p_slug text,
  p_storage_path text,
  p_tags text[] default '{}'::text[],
  p_notes text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns public.image_assets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := lower(btrim(coalesce(p_slug, '')));
  v_storage_path text := btrim(coalesce(p_storage_path, ''));
  v_tags text[] := coalesce(p_tags, '{}'::text[]);
  v_notes text := btrim(coalesce(p_notes, ''));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_root_id uuid;
  v_unclassified_id uuid;
  v_resource_id uuid;
  v_existing_tags text[] := '{}'::text[];
  v_title text;
  v_asset public.image_assets%rowtype;
begin
  if not public.is_super_admin() then
    raise exception 'not allowed';
  end if;

  if v_slug !~ '^[a-z0-9][a-z0-9_-]{0,119}$' then
    raise exception 'invalid image slug';
  end if;
  if v_storage_path = '' or v_storage_path not like ('bank/' || v_slug || '/%') then
    raise exception 'invalid image storage path';
  end if;
  if jsonb_typeof(v_metadata) is distinct from 'object' then
    raise exception 'image metadata must be an object';
  end if;

  select id into v_root_id
  from public.resource_folders
  where is_system = true
    and metadata ->> 'system_role' = 'system_images_root'
  limit 1;

  if v_root_id is null then
    insert into public.resource_folders (
      teacher_space_id, parent_id, name, metadata, display_order, is_system
    ) values (
      null,
      null,
      'Images',
      jsonb_build_object(
        'system_role', 'system_images_root',
        'resource_type', 'image',
        'hidden_in_explorer', true
      ),
      0,
      true
    )
    returning id into v_root_id;
  end if;

  select id into v_unclassified_id
  from public.resource_folders
  where is_system = true
    and metadata ->> 'system_role' = 'system_images_unclassified'
  limit 1;

  if v_unclassified_id is null then
    insert into public.resource_folders (
      teacher_space_id, parent_id, name, metadata, display_order, is_system
    ) values (
      null,
      v_root_id,
      'À classer',
      jsonb_build_object(
        'system_role', 'system_images_unclassified',
        'resource_type', 'image'
      ),
      0,
      true
    )
    returning id into v_unclassified_id;
  end if;

  select resource_id, tags into v_resource_id, v_existing_tags
  from public.image_assets
  where slug = v_slug;

  v_tags := array(
    select distinct btrim(tag)
    from unnest(coalesce(v_existing_tags, '{}'::text[]) || v_tags) as tag
    where btrim(tag) <> ''
    order by btrim(tag)
  );

  insert into public.image_assets (
    slug,
    storage_path,
    tags,
    notes,
    metadata,
    is_active,
    updated_at
  )
  values (
    v_slug,
    v_storage_path,
    v_tags,
    v_notes,
    v_metadata,
    true,
    now()
  )
  on conflict (slug) do update
  set
    storage_path = excluded.storage_path,
    tags = excluded.tags,
    notes = excluded.notes,
    metadata = excluded.metadata,
    is_active = true,
    updated_at = now()
  returning * into v_asset;

  if v_resource_id is not null and not exists (
    select 1 from public.resources where id = v_resource_id and is_system = true
  ) then
    v_resource_id := null;
  end if;

  if v_resource_id is null then
    select id into v_resource_id
    from public.resources
    where is_system = true
      and (
        (storage_bucket = 'images' and storage_path = v_storage_path)
        or metadata ->> 'image_asset_slug' = v_slug
      )
    order by updated_at desc
    limit 1;
  end if;

  v_title := nullif(v_notes, '');
  if v_title is null then
    v_title := initcap(replace(replace(v_slug, '_', ' '), '-', ' '));
  end if;

  if v_resource_id is null then
    insert into public.resources (
      teacher_space_id,
      folder_id,
      title,
      resource_type,
      storage_bucket,
      storage_path,
      mime_type,
      size_bytes,
      width,
      height,
      duration_seconds,
      alt_text,
      tags,
      metadata,
      display_order,
      is_system
    ) values (
      null,
      v_unclassified_id,
      v_title,
      'image',
      'images',
      v_storage_path,
      coalesce(v_metadata ->> 'mime_type', ''),
      case when coalesce(v_metadata ->> 'size_bytes', '') ~ '^[0-9]+$' then (v_metadata ->> 'size_bytes')::bigint else 0 end,
      case when coalesce(v_metadata ->> 'width', '') ~ '^[0-9]+$' then (v_metadata ->> 'width')::integer else 0 end,
      case when coalesce(v_metadata ->> 'height', '') ~ '^[0-9]+$' then (v_metadata ->> 'height')::integer else 0 end,
      0,
      v_title,
      v_tags,
      v_metadata || jsonb_build_object(
        'source', 'image_assets',
        'image_asset_slug', v_slug
      ),
      coalesce((
        select max(r.display_order) + 1
        from public.resources r
        where r.folder_id = v_unclassified_id
      ), 0),
      true
    )
    returning id into v_resource_id;
  else
    -- Le classement, le titre visible et l’ordre choisis dans l’explorateur
    -- sont volontairement conservés lors du remplacement du fichier.
    update public.resources
    set
      storage_bucket = 'images',
      storage_path = v_storage_path,
      mime_type = coalesce(v_metadata ->> 'mime_type', ''),
      size_bytes = case when coalesce(v_metadata ->> 'size_bytes', '') ~ '^[0-9]+$' then (v_metadata ->> 'size_bytes')::bigint else 0 end,
      width = case when coalesce(v_metadata ->> 'width', '') ~ '^[0-9]+$' then (v_metadata ->> 'width')::integer else 0 end,
      height = case when coalesce(v_metadata ->> 'height', '') ~ '^[0-9]+$' then (v_metadata ->> 'height')::integer else 0 end,
      tags = v_tags,
      metadata = coalesce(metadata, '{}'::jsonb)
        || v_metadata
        || jsonb_build_object(
          'source', 'image_assets',
          'image_asset_slug', v_slug
        ),
      is_system = true,
      teacher_space_id = null
    where id = v_resource_id;
  end if;

  update public.image_assets
  set resource_id = v_resource_id
  where slug = v_slug
  returning * into v_asset;

  return v_asset;
end;
$$;

create or replace function public.sync_image_asset_tags_from_resource()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text := btrim(coalesce(new.metadata ->> 'image_asset_slug', ''));
begin
  if new.is_system = true
     and new.storage_bucket = 'images'
     and v_slug <> ''
     and new.tags is distinct from old.tags then
    update public.image_assets
    set tags = new.tags
    where resource_id = new.id
       or slug = v_slug;
  end if;
  return new;
end;
$$;

drop trigger if exists resources_sync_image_asset_tags on public.resources;
create trigger resources_sync_image_asset_tags
after update of tags on public.resources
for each row
execute function public.sync_image_asset_tags_from_resource();

revoke all on function public.upsert_system_image_asset_as_admin(text, text, text[], text, jsonb) from public;
grant execute on function public.upsert_system_image_asset_as_admin(text, text, text[], text, jsonb) to authenticated;

commit;
