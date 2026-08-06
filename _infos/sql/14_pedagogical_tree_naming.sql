-- =========================================================
-- PATCH 14 — NOMENCLATURE DE L’ARBORESCENCE PÉDAGOGIQUE
-- À exécuter APRÈS 13_catalog_pedagogical_tree.sql.
--
-- Objectif :
-- - renommer catalog_folders en pedagogical_nodes ;
-- - renommer catalog_activities.category_id en pedagogical_node_id ;
-- - fixer la hiérarchie rigide :
--     discipline > domain > theme > learning_objective ;
-- - conserver tous les identifiants, rattachements, niveaux et droits ;
-- - ne déplacer ni ne supprimer aucune activité.
-- =========================================================

begin;

-- 1) Renommage des objets principaux, avec garde-fous explicites.
do $$
begin
  if to_regclass('public.catalog_folders') is not null
     and to_regclass('public.pedagogical_nodes') is not null then
    raise exception 'Migration impossible : catalog_folders et pedagogical_nodes existent simultanément.';
  end if;

  if to_regclass('public.catalog_folders') is not null then
    alter table public.catalog_folders rename to pedagogical_nodes;
  elsif to_regclass('public.pedagogical_nodes') is null then
    raise exception 'Migration impossible : aucune table d’arborescence pédagogique trouvée.';
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'catalog_activities'
      and column_name = 'category_id'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'catalog_activities'
      and column_name = 'pedagogical_node_id'
  ) then
    raise exception 'Migration impossible : category_id et pedagogical_node_id existent simultanément.';
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'catalog_activities'
      and column_name = 'category_id'
  ) then
    alter table public.catalog_activities rename column category_id to pedagogical_node_id;
  elsif not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'catalog_activities'
      and column_name = 'pedagogical_node_id'
  ) then
    raise exception 'Migration impossible : aucun rattachement pédagogique trouvé sur catalog_activities.';
  end if;
end;
$$;

-- 2) Retrait temporaire des anciens garde-fous avant la conversion des types.
-- L’ancien trigger et l’ancien CHECK ne connaissent que l’ancienne nomenclature.
drop trigger if exists trg_validate_catalog_folder_tree on public.pedagogical_nodes;
drop trigger if exists trg_validate_pedagogical_node_tree on public.pedagogical_nodes;
drop function if exists public.validate_catalog_folder_tree();

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pedagogical_nodes'::regclass
      and conname = 'catalog_folders_type_check'
  ) then
    alter table public.pedagogical_nodes drop constraint catalog_folders_type_check;
  end if;
  if exists (
    select 1 from pg_constraint
    where conrelid = 'public.pedagogical_nodes'::regclass
      and conname = 'pedagogical_nodes_type_check'
  ) then
    alter table public.pedagogical_nodes drop constraint pedagogical_nodes_type_check;
  end if;
end;
$$;

-- 3) Conversion des quatre types existants, sans toucher aux nœuds eux-mêmes.
update public.pedagogical_nodes
set node_type = case node_type
  when 'domain' then 'discipline'
  when 'subject' then 'domain'
  when 'program_element' then 'theme'
  when 'competency' then 'learning_objective'
  else node_type
end
where node_type in ('domain', 'subject', 'program_element', 'competency');

alter table public.pedagogical_nodes
  add constraint pedagogical_nodes_type_check
  check (node_type in ('discipline', 'domain', 'theme', 'learning_objective'));

-- 4) Renommage des contraintes et index conservés par PostgreSQL.
do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.pedagogical_nodes'::regclass and conname = 'catalog_folders_pkey') then
    alter table public.pedagogical_nodes rename constraint catalog_folders_pkey to pedagogical_nodes_pkey;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.pedagogical_nodes'::regclass and conname = 'catalog_folders_parent_id_fkey') then
    alter table public.pedagogical_nodes rename constraint catalog_folders_parent_id_fkey to pedagogical_nodes_parent_id_fkey;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.pedagogical_nodes'::regclass and conname = 'catalog_folders_id_format') then
    alter table public.pedagogical_nodes rename constraint catalog_folders_id_format to pedagogical_nodes_id_format;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.pedagogical_nodes'::regclass and conname = 'catalog_folders_name_not_blank') then
    alter table public.pedagogical_nodes rename constraint catalog_folders_name_not_blank to pedagogical_nodes_name_not_blank;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.pedagogical_nodes'::regclass and conname = 'catalog_folders_order_nonnegative') then
    alter table public.pedagogical_nodes rename constraint catalog_folders_order_nonnegative to pedagogical_nodes_order_nonnegative;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.pedagogical_nodes'::regclass and conname = 'catalog_folders_scope_mode_check') then
    alter table public.pedagogical_nodes rename constraint catalog_folders_scope_mode_check to pedagogical_nodes_scope_mode_check;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.pedagogical_nodes'::regclass and conname = 'catalog_folders_grade_levels_check') then
    alter table public.pedagogical_nodes rename constraint catalog_folders_grade_levels_check to pedagogical_nodes_grade_levels_check;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.pedagogical_nodes'::regclass and conname = 'catalog_folders_root_scope_check') then
    alter table public.pedagogical_nodes rename constraint catalog_folders_root_scope_check to pedagogical_nodes_root_scope_check;
  end if;

  if exists (select 1 from pg_constraint where conrelid = 'public.catalog_activities'::regclass and conname = 'catalog_activities_category_not_blank') then
    alter table public.catalog_activities rename constraint catalog_activities_category_not_blank to catalog_activities_pedagogical_node_not_blank;
  end if;
  if exists (select 1 from pg_constraint where conrelid = 'public.catalog_activities'::regclass and conname = 'catalog_activities_category_fk') then
    alter table public.catalog_activities rename constraint catalog_activities_category_fk to catalog_activities_pedagogical_node_fk;
  end if;
end;
$$;

do $$
begin
  if to_regclass('public.catalog_folders_parent_order_idx') is not null then
    alter index public.catalog_folders_parent_order_idx rename to pedagogical_nodes_parent_order_idx;
  end if;
  if to_regclass('public.catalog_folders_active_idx') is not null then
    alter index public.catalog_folders_active_idx rename to pedagogical_nodes_active_idx;
  end if;
  if to_regclass('public.catalog_activities_status_category_idx') is not null then
    alter index public.catalog_activities_status_category_idx rename to catalog_activities_status_node_idx;
  end if;
end;
$$;

-- 5) Nouvelle validation stricte et lisible.
create or replace function public.validate_pedagogical_node_tree()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_type text;
  cursor_id text;
begin
  if new.parent_id = new.id then
    raise exception 'Un nœud pédagogique ne peut pas être son propre parent.';
  end if;

  if new.parent_id is null then
    if new.node_type <> 'discipline' then
      raise exception 'Seules les disciplines peuvent être placées à la racine.';
    end if;
    if new.grade_scope_mode <> 'custom' then
      raise exception 'Une discipline racine doit définir explicitement ses niveaux.';
    end if;
    return new;
  end if;

  select node_type into parent_type
  from public.pedagogical_nodes
  where id = new.parent_id;

  if parent_type is null then
    raise exception 'Le parent pédagogique % est introuvable.', new.parent_id;
  end if;

  if not (
    (parent_type = 'discipline' and new.node_type = 'domain')
    or (parent_type = 'domain' and new.node_type = 'theme')
    or (parent_type = 'theme' and new.node_type = 'learning_objective')
  ) then
    raise exception 'Hiérarchie invalide : % ne peut pas contenir %.', parent_type, new.node_type;
  end if;

  cursor_id := new.parent_id;
  while cursor_id is not null loop
    if cursor_id = new.id then
      raise exception 'Ce déplacement créerait une boucle dans l’arborescence.';
    end if;
    select parent_id into cursor_id
    from public.pedagogical_nodes
    where id = cursor_id;
  end loop;

  return new;
end;
$$;

create trigger trg_validate_pedagogical_node_tree
before insert or update of parent_id, node_type, grade_scope_mode
on public.pedagogical_nodes
for each row execute function public.validate_pedagogical_node_tree();

-- 6) Trigger updated_at avec le nouveau nom.
drop trigger if exists trg_catalog_folders_updated_at on public.pedagogical_nodes;
drop trigger if exists trg_pedagogical_nodes_updated_at on public.pedagogical_nodes;
create trigger trg_pedagogical_nodes_updated_at
before update on public.pedagogical_nodes
for each row execute function public.set_updated_at();

-- 7) Politiques RLS renommées. Les règles d’accès restent inchangées.
drop policy if exists catalog_folders_select_all on public.pedagogical_nodes;
drop policy if exists catalog_folders_insert_admin on public.pedagogical_nodes;
drop policy if exists catalog_folders_update_admin on public.pedagogical_nodes;
drop policy if exists catalog_folders_delete_admin on public.pedagogical_nodes;
drop policy if exists pedagogical_nodes_select_all on public.pedagogical_nodes;
drop policy if exists pedagogical_nodes_insert_admin on public.pedagogical_nodes;
drop policy if exists pedagogical_nodes_update_admin on public.pedagogical_nodes;
drop policy if exists pedagogical_nodes_delete_admin on public.pedagogical_nodes;

create policy pedagogical_nodes_select_all
on public.pedagogical_nodes
for select
to anon, authenticated
using (true);

create policy pedagogical_nodes_insert_admin
on public.pedagogical_nodes
for insert
to authenticated
with check (public.is_super_admin());

create policy pedagogical_nodes_update_admin
on public.pedagogical_nodes
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy pedagogical_nodes_delete_admin
on public.pedagogical_nodes
for delete
to authenticated
using (public.is_super_admin());

grant select on public.pedagogical_nodes to anon, authenticated;
grant insert, update, delete on public.pedagogical_nodes to authenticated;

-- 8) Vérifications finales : aucune activité ni aucun lien ne doit avoir disparu.
do $$
declare
  orphan_count bigint;
  invalid_type_count bigint;
begin
  select count(*) into orphan_count
  from public.catalog_activities ca
  left join public.pedagogical_nodes pn on pn.id = ca.pedagogical_node_id
  where pn.id is null;

  if orphan_count <> 0 then
    raise exception 'Migration annulée : % activité(s) ne sont plus rattachées à un nœud pédagogique.', orphan_count;
  end if;

  select count(*) into invalid_type_count
  from public.pedagogical_nodes
  where node_type not in ('discipline', 'domain', 'theme', 'learning_objective');

  if invalid_type_count <> 0 then
    raise exception 'Migration annulée : % type(s) de nœud non converti(s).', invalid_type_count;
  end if;
end;
$$;

commit;
