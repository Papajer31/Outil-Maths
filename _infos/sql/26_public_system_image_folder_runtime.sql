-- =========================================================
-- PATCH 26 — Lecture publique d'un dossier d'images système
-- À exécuter une seule fois après 25_phonology_word_prefix.sql.
--
-- Besoin initial : l'outil « Dictée muette » doit utiliser uniquement les
-- images actuellement classées dans Ressources système > Imagier, y compris
-- ses éventuels sous-dossiers. Le classement courant dans resource_folders
-- est la source de vérité : déplacer une image dans l'explorateur modifie
-- immédiatement son éligibilité sans toucher à image_assets.metadata.
-- =========================================================

begin;

create or replace function public.list_public_system_image_assets_in_folder(
  p_folder_name text
)
returns table (
  slug text,
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
  select ia.slug, ia.storage_path
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
    and btrim(coalesce(ia.storage_path, '')) <> ''
  order by ia.slug;
$$;

revoke all on function public.list_public_system_image_assets_in_folder(text) from public;
grant execute on function public.list_public_system_image_assets_in_folder(text) to anon, authenticated;

commit;
