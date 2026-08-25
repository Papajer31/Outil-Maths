-- =========================================================
-- PATCH 30 — Association explicite image système ↔ mot Unicode
-- À exécuter une seule fois après 29.
--
-- Objectif :
-- - dissocier l'identifiant technique de l'image (slug ASCII) du mot
--   réellement associé (word_slug Unicode) ;
-- - permettre des couples distincts comme « pâte » / « pâté » ;
-- - faire reposer Dictée muette sur cette association explicite plutôt que
--   sur la normalisation ASCII du mot.
-- =========================================================

begin;

alter table public.image_assets
  add column if not exists word_slug text;

create index if not exists image_assets_word_slug_idx
  on public.image_assets (word_slug)
  where word_slug is not null and btrim(word_slug) <> '';

with inferred_words as (
  select
    ia.slug,
    lower(btrim(coalesce(
      nullif(ia.word_slug, ''),
      nullif(ia.metadata ->> 'image_word_slug', ''),
      nullif(ia.metadata ->> 'image_word', ''),
      nullif(regexp_replace(coalesce(ia.metadata ->> 'original_name', ''), '\\.[^.]+$', ''), ''),
      nullif(r.title, ''),
      nullif(ia.notes, ''),
      nullif(ia.slug, '')
    ))) as inferred_word_slug
  from public.image_assets ia
  left join public.resources r on r.id = ia.resource_id
)
update public.image_assets ia
set word_slug = iw.inferred_word_slug
from inferred_words iw
where ia.slug = iw.slug
  and btrim(coalesce(iw.inferred_word_slug, '')) <> ''
  and btrim(coalesce(ia.word_slug, '')) = '';

update public.image_assets
set metadata = coalesce(metadata, '{}'::jsonb)
  || case
      when btrim(coalesce(word_slug, '')) <> '' then jsonb_build_object('image_word_slug', word_slug)
      else '{}'::jsonb
    end
where btrim(coalesce(word_slug, '')) <> '';

update public.resources r
set metadata = coalesce(r.metadata, '{}'::jsonb)
  || jsonb_build_object('image_word_slug', ia.word_slug)
from public.image_assets ia
where ia.resource_id = r.id
  and btrim(coalesce(ia.word_slug, '')) <> '';

create or replace function public.upsert_system_image_asset_as_admin(
  p_slug text,
  p_storage_path text,
  p_tags text[] default '{}'::text[],
  p_notes text default '',
  p_metadata jsonb default '{}'::jsonb,
  p_folder_path text default ''::text,
  p_word_slug text default ''::text
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
  v_existing_tags text[] := '{}'::text[];
  v_notes text := btrim(coalesce(p_notes, ''));
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  v_folder_path text := btrim(coalesce(p_folder_path, ''));
  v_word_slug text := lower(btrim(coalesce(p_word_slug, '')));
  v_resource_id uuid;
  v_target_folder_id uuid;
  v_asset public.image_assets%rowtype;
  v_title text;
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
  if v_word_slug = '' then
    raise exception 'missing image word slug';
  end if;

  select slug into v_word_slug
  from public.phonology_words
  where slug = v_word_slug
    and is_active = true
  limit 1;

  if v_word_slug is null then
    raise exception 'unknown phonology word slug';
  end if;

  v_target_folder_id := public.ensure_system_image_folder_path_as_admin(v_folder_path);

  select resource_id, tags into v_resource_id, v_existing_tags
  from public.image_assets
  where slug = v_slug;

  v_tags := array(
    select distinct btrim(tag)
    from unnest(coalesce(v_existing_tags, '{}'::text[]) || v_tags) as tag
    where btrim(tag) <> ''
    order by btrim(tag)
  );

  v_metadata := v_metadata || jsonb_build_object('image_word_slug', v_word_slug);

  insert into public.image_assets (
    slug,
    word_slug,
    storage_path,
    tags,
    notes,
    metadata,
    is_active,
    updated_at
  )
  values (
    v_slug,
    v_word_slug,
    v_storage_path,
    v_tags,
    v_notes,
    v_metadata,
    true,
    now()
  )
  on conflict (slug) do update
  set
    word_slug = excluded.word_slug,
    storage_path = excluded.storage_path,
    tags = excluded.tags,
    notes = excluded.notes,
    metadata = excluded.metadata,
    is_active = true,
    updated_at = now()
  returning * into v_asset;

  if v_resource_id is not null and not exists (
    select 1
    from public.resources
    where id = v_resource_id
      and is_system = true
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
    v_title := v_slug;
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
      v_target_folder_id,
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
        'image_asset_slug', v_slug,
        'image_word_slug', v_word_slug
      ),
      coalesce((
        select max(r.display_order) + 1
        from public.resources r
        where r.folder_id = v_target_folder_id
      ), 0),
      true
    )
    returning id into v_resource_id;
  else
    update public.resources
    set
      folder_id = case when v_folder_path <> '' then v_target_folder_id else folder_id end,
      title = case
        when title in (
          upper(left(replace(replace(v_slug, '_', ' '), '-', ' '), 1))
            || substr(replace(replace(v_slug, '_', ' '), '-', ' '), 2),
          initcap(replace(replace(v_slug, '_', ' '), '-', ' '))
        ) then v_title
        else title
      end,
      alt_text = case
        when alt_text in (
          upper(left(replace(replace(v_slug, '_', ' '), '-', ' '), 1))
            || substr(replace(replace(v_slug, '_', ' '), '-', ' '), 2),
          initcap(replace(replace(v_slug, '_', ' '), '-', ' '))
        ) then v_title
        else alt_text
      end,
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
          'image_asset_slug', v_slug,
          'image_word_slug', v_word_slug
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

create or replace function public.upsert_system_image_asset_as_admin(
  p_slug text,
  p_storage_path text,
  p_tags text[] default '{}'::text[],
  p_notes text default '',
  p_metadata jsonb default '{}'::jsonb,
  p_folder_path text default ''::text
)
returns public.image_assets
language sql
security definer
set search_path = public
as $$
  select public.upsert_system_image_asset_as_admin(
    p_slug,
    p_storage_path,
    p_tags,
    p_notes,
    p_metadata,
    p_folder_path,
    ''::text
  );
$$;

create or replace function public.upsert_system_image_asset_as_admin(
  p_slug text,
  p_storage_path text,
  p_tags text[] default '{}'::text[],
  p_notes text default '',
  p_metadata jsonb default '{}'::jsonb
)
returns public.image_assets
language sql
security definer
set search_path = public
as $$
  select public.upsert_system_image_asset_as_admin(
    p_slug,
    p_storage_path,
    p_tags,
    p_notes,
    p_metadata,
    ''::text,
    ''::text
  );
$$;

drop function if exists public.list_public_system_image_assets_in_folder(text);
create function public.list_public_system_image_assets_in_folder(
  p_folder_name text
)
returns table (
  slug text,
  word_slug text,
  storage_path text
)
language sql
stable
security definer
set search_path = public
as $$
  with recursive
  image_root as (
    select rf.id
    from public.resource_folders rf
    where rf.is_system = true
      and rf.metadata ->> 'system_role' = 'system_images_root'
    order by rf.created_at
    limit 1
  ),
  requested_root as (
    select rf.id
    from public.resource_folders rf
    join image_root root on rf.parent_id = root.id
    where rf.is_system = true
      and lower(btrim(rf.name)) = lower(btrim(coalesce(p_folder_name, '')))
    order by rf.created_at
    limit 1
  ),
  requested_tree as (
    select rr.id
    from requested_root rr

    union all

    select child.id
    from public.resource_folders child
    join requested_tree parent on child.parent_id = parent.id
    where child.is_system = true
  )
  select ia.slug, ia.word_slug, ia.storage_path
  from public.image_assets ia
  join public.resources r
    on r.id = ia.resource_id
  join requested_tree tree
    on tree.id = r.folder_id
  where ia.is_active = true
    and r.is_system = true
    and r.resource_type = 'image'
    and r.storage_bucket = 'images'
    and btrim(coalesce(ia.slug, '')) <> ''
    and btrim(coalesce(ia.word_slug, '')) <> ''
    and btrim(coalesce(ia.storage_path, '')) <> ''
  order by ia.word_slug, ia.slug;
$$;

revoke all on function public.list_public_system_image_assets_in_folder(text) from public;
grant execute on function public.list_public_system_image_assets_in_folder(text) to anon, authenticated;

commit;
