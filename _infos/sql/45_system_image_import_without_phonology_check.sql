-- =========================================================
-- PATCH 45 — Import d’images système indépendant de phonology_words
-- À exécuter une seule fois après la migration 44.
--
-- Objectif :
-- - conserver word_slug comme association textuelle dérivée du nom de fichier ;
-- - supprimer le contrôle bloquant contre l’ancienne banque phonologique ;
-- - permettre l’enrichissement de l’Imagier avant la future bascule vers
--   lexical_entries_v1.
-- =========================================================

begin;

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

  -- Le nom associé à l’image est désormais autonome.
  -- Il n’a plus besoin d’exister dans la banque historique phonology_words.

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

comment on function public.upsert_system_image_asset_as_admin(text, text, text[], text, jsonb, text, text) is
  'Importe ou remplace une image système sans imposer la présence de word_slug dans phonology_words.';

commit;
