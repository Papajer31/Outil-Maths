-- =========================================================
-- PATCH 24 — Options génériques d'import et suppression d'images système
-- À exécuter une seule fois après 23_system_image_resources_explorer.sql.
--
-- - ajoute un dossier de destination facultatif aux imports ;
-- - crée automatiquement les dossiers système manquants ;
-- - conserve exactement le titre transmis par l'importateur ;
-- - permet au super-admin de supprimer une image système inutilisée.
-- =========================================================

begin;

-- Corrige uniquement les titres qui correspondent encore exactement à
-- l’ancienne capitalisation automatique. Les renommages manuels sont conservés.
with automatic_titles as (
  select
    ia.slug,
    ia.resource_id,
    regexp_replace(coalesce(ia.metadata ->> 'original_name', ''), '\.[^.]+$', '') as exact_title,
    upper(left(replace(replace(ia.slug, '_', ' '), '-', ' '), 1))
      || substr(replace(replace(ia.slug, '_', ' '), '-', ' '), 2) as old_automatic_title,
    initcap(replace(replace(ia.slug, '_', ' '), '-', ' ')) as old_sql_fallback_title
  from public.image_assets ia
)
update public.resources r
set
  title = a.exact_title,
  alt_text = case when r.alt_text in (a.old_automatic_title, a.old_sql_fallback_title) then a.exact_title else r.alt_text end
from automatic_titles a
where r.id = a.resource_id
  and a.exact_title <> ''
  and r.title in (a.old_automatic_title, a.old_sql_fallback_title);

with automatic_notes as (
  select
    ia.slug,
    regexp_replace(coalesce(ia.metadata ->> 'original_name', ''), '\.[^.]+$', '') as exact_title,
    upper(left(replace(replace(ia.slug, '_', ' '), '-', ' '), 1))
      || substr(replace(replace(ia.slug, '_', ' '), '-', ' '), 2) as old_automatic_title,
    initcap(replace(replace(ia.slug, '_', ' '), '-', ' ')) as old_sql_fallback_title
  from public.image_assets ia
)
update public.image_assets ia
set notes = a.exact_title
from automatic_notes a
where ia.slug = a.slug
  and a.exact_title <> ''
  and ia.notes in (a.old_automatic_title, a.old_sql_fallback_title);

create or replace function public.ensure_system_image_folder_path_as_admin(
  p_folder_path text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text := btrim(coalesce(p_folder_path, ''));
  v_root_id uuid;
  v_unclassified_id uuid;
  v_parent_id uuid;
  v_folder_id uuid;
  v_segment text;
  v_segment_index integer := 0;
  v_effective_segment_count integer := 0;
begin
  if not public.is_super_admin() then
    raise exception 'not allowed';
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

  if v_path = '' then
    return v_unclassified_id;
  end if;

  v_path := regexp_replace(replace(replace(v_path, E'\\', '/'), '>', '/'), '/+', '/', 'g');
  v_path := trim(both '/' from v_path);
  if v_path = '' then
    return v_unclassified_id;
  end if;

  v_parent_id := v_root_id;

  foreach v_segment in array regexp_split_to_array(v_path, '/')
  loop
    v_segment := btrim(v_segment);
    if v_segment = '' or v_segment = '.' or v_segment = '..' then
      continue;
    end if;

    v_segment_index := v_segment_index + 1;
    -- « Images » désigne déjà la racine technique masquée.
    if v_segment_index = 1 and lower(v_segment) = 'images' then
      continue;
    end if;

    v_effective_segment_count := v_effective_segment_count + 1;
    v_folder_id := null;
    select id into v_folder_id
    from public.resource_folders
    where is_system = true
      and parent_id is not distinct from v_parent_id
      and lower(btrim(name)) = lower(v_segment)
    order by created_at
    limit 1;

    if v_folder_id is null then
      insert into public.resource_folders (
        teacher_space_id,
        parent_id,
        name,
        metadata,
        display_order,
        is_system
      ) values (
        null,
        v_parent_id,
        v_segment,
        jsonb_build_object('resource_type', 'image'),
        coalesce((
          select max(display_order) + 1
          from public.resource_folders
          where is_system = true
            and parent_id is not distinct from v_parent_id
        ), 0),
        true
      )
      returning id into v_folder_id;
    end if;

    v_parent_id := v_folder_id;
  end loop;

  if v_effective_segment_count = 0 then
    return v_unclassified_id;
  end if;

  return coalesce(v_parent_id, v_unclassified_id);
end;
$$;

create or replace function public.upsert_system_image_asset_as_admin(
  p_slug text,
  p_storage_path text,
  p_tags text[],
  p_notes text,
  p_metadata jsonb,
  p_folder_path text
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
  v_folder_path text := btrim(coalesce(p_folder_path, ''));
  v_target_folder_id uuid;
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

  -- Le titre visible est fourni par l'importateur : aucune capitalisation
  -- ni transformation typographique n'est appliquée ici.
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
        'image_asset_slug', v_slug
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
    -- Sans dossier explicitement demandé, un remplacement conserve le
    -- classement existant. Avec un dossier demandé, il déplace la ressource.
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

-- Compatibilité avec les appels antérieurs qui ne fournissent pas de dossier.
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
    ''::text
  );
$$;

create or replace function public.delete_system_image_asset_as_admin(
  p_resource_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_storage_bucket text;
  v_storage_path text;
  v_slug text;
  v_quiz_usage_count integer := 0;
begin
  if not public.is_super_admin() then
    raise exception 'not allowed';
  end if;

  select r.storage_bucket, r.storage_path, ia.slug
  into v_storage_bucket, v_storage_path, v_slug
  from public.resources r
  join public.image_assets ia on ia.resource_id = r.id
  where r.id = p_resource_id
    and r.is_system = true
    and r.resource_type = 'image'
    and r.storage_bucket = 'images'
  limit 1;

  if not found then
    raise exception 'system image resource not found';
  end if;

  select count(*) into v_quiz_usage_count
  from public.quiz_resources
  where resource_id = p_resource_id;

  if v_quiz_usage_count > 0 then
    raise exception using
      errcode = '23503',
      message = format('system image is used by %s quiz(es)', v_quiz_usage_count);
  end if;

  delete from public.image_assets
  where resource_id = p_resource_id;

  delete from public.resources
  where id = p_resource_id
    and is_system = true;

  return jsonb_build_object(
    'resource_id', p_resource_id,
    'slug', v_slug,
    'storage_bucket', v_storage_bucket,
    'storage_path', v_storage_path
  );
end;
$$;

revoke all on function public.ensure_system_image_folder_path_as_admin(text) from public;
revoke all on function public.upsert_system_image_asset_as_admin(text, text, text[], text, jsonb, text) from public;
revoke all on function public.upsert_system_image_asset_as_admin(text, text, text[], text, jsonb) from public;
revoke all on function public.delete_system_image_asset_as_admin(uuid) from public;

grant execute on function public.upsert_system_image_asset_as_admin(text, text, text[], text, jsonb, text) to authenticated;
grant execute on function public.upsert_system_image_asset_as_admin(text, text, text[], text, jsonb) to authenticated;
grant execute on function public.delete_system_image_asset_as_admin(uuid) to authenticated;

commit;
