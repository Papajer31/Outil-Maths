-- =========================================================
-- PATCH 15 — REGISTRE GLOBAL DES OBJECTIFS D'AVENTURE
-- À exécuter APRÈS seed_pedagogical_tree_cp_cm2.sql.
--
-- Objectif :
-- - définir, pour chaque niveau CP à CM2, les dossiers de niveau
--   proposés par le futur moteur Aventure ;
-- - enregistrer leur activation et leur ordre global ;
-- - réserver les écritures au super-admin ;
-- - laisser la lecture disponible au futur runtime élève.
-- =========================================================

begin;

create table if not exists public.adventure_objective_registry (
  grade_folder_id text primary key
    references public.pedagogical_nodes(id)
    on update cascade
    on delete cascade,
  grade_level text not null,
  display_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint adventure_objective_registry_grade_check
    check (grade_level in ('CP', 'CE1', 'CE2', 'CM1', 'CM2')),
  constraint adventure_objective_registry_order_check
    check (display_order >= 0)
);

create index if not exists adventure_objective_registry_grade_order_idx
on public.adventure_objective_registry (grade_level, display_order, grade_folder_id);

create index if not exists adventure_objective_registry_enabled_idx
on public.adventure_objective_registry (grade_level, is_enabled);

create or replace function public.validate_adventure_objective_registry()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  folder_type text;
  folder_name text;
begin
  select node_type, name
  into folder_type, folder_name
  from public.pedagogical_nodes
  where id = new.grade_folder_id;

  if folder_type is null then
    raise exception 'Dossier pédagogique % introuvable.', new.grade_folder_id;
  end if;

  if folder_type <> 'grade_level' then
    raise exception 'Le registre Aventure doit cibler un dossier de niveau, pas un nœud de type %.', folder_type;
  end if;

  if folder_name <> new.grade_level then
    raise exception 'Le dossier % appartient au niveau %, pas au niveau %.', new.grade_folder_id, folder_name, new.grade_level;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_adventure_objective_registry
on public.adventure_objective_registry;
create trigger trg_validate_adventure_objective_registry
before insert or update of grade_folder_id, grade_level
on public.adventure_objective_registry
for each row execute function public.validate_adventure_objective_registry();

drop trigger if exists trg_adventure_objective_registry_updated_at
on public.adventure_objective_registry;
create trigger trg_adventure_objective_registry_updated_at
before update on public.adventure_objective_registry
for each row execute function public.set_updated_at();

-- Inscrit automatiquement tout nouveau dossier de niveau. L'ordre initial
-- est placé après les éléments déjà enregistrés pour le même niveau.
create or replace function public.sync_adventure_registry_from_grade_folder()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  next_order integer;
begin
  if new.node_type <> 'grade_level' then
    delete from public.adventure_objective_registry
    where grade_folder_id = new.id;
    return new;
  end if;

  select coalesce(max(display_order) + 1, 0)
  into next_order
  from public.adventure_objective_registry
  where grade_level = new.name
    and grade_folder_id <> new.id;

  insert into public.adventure_objective_registry
    (grade_folder_id, grade_level, display_order, is_enabled)
  values
    (new.id, new.name, next_order, true)
  on conflict (grade_folder_id) do update
  set grade_level = excluded.grade_level;

  return new;
end;
$$;

drop trigger if exists trg_sync_adventure_registry_from_grade_folder
on public.pedagogical_nodes;
create trigger trg_sync_adventure_registry_from_grade_folder
after insert or update of node_type, name
on public.pedagogical_nodes
for each row execute function public.sync_adventure_registry_from_grade_folder();

-- Premier remplissage selon l'ordre complet de l'arborescence pédagogique.
with recursive ordered_tree as (
  select
    pn.id,
    pn.parent_id,
    pn.name,
    pn.node_type,
    pn.display_order,
    lpad(pn.display_order::text, 6, '0') || ':' || lower(pn.name) || ':' || pn.id as sort_path
  from public.pedagogical_nodes pn
  where pn.parent_id is null

  union all

  select
    child.id,
    child.parent_id,
    child.name,
    child.node_type,
    child.display_order,
    parent.sort_path || '/' || lpad(child.display_order::text, 6, '0') || ':' || lower(child.name) || ':' || child.id
  from public.pedagogical_nodes child
  join ordered_tree parent on parent.id = child.parent_id
), ranked_grade_folders as (
  select
    id as grade_folder_id,
    name as grade_level,
    row_number() over (partition by name order by sort_path) - 1 as display_order
  from ordered_tree
  where node_type = 'grade_level'
    and name in ('CP', 'CE1', 'CE2', 'CM1', 'CM2')
)
insert into public.adventure_objective_registry
  (grade_folder_id, grade_level, display_order, is_enabled)
select
  grade_folder_id,
  grade_level,
  display_order,
  true
from ranked_grade_folders
on conflict (grade_folder_id) do nothing;

alter table public.adventure_objective_registry enable row level security;

drop policy if exists adventure_objective_registry_select_all
on public.adventure_objective_registry;
drop policy if exists adventure_objective_registry_insert_admin
on public.adventure_objective_registry;
drop policy if exists adventure_objective_registry_update_admin
on public.adventure_objective_registry;
drop policy if exists adventure_objective_registry_delete_admin
on public.adventure_objective_registry;

create policy adventure_objective_registry_select_all
on public.adventure_objective_registry
for select
to anon, authenticated
using (true);

create policy adventure_objective_registry_insert_admin
on public.adventure_objective_registry
for insert
to authenticated
with check (public.is_super_admin());

create policy adventure_objective_registry_update_admin
on public.adventure_objective_registry
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy adventure_objective_registry_delete_admin
on public.adventure_objective_registry
for delete
to authenticated
using (public.is_super_admin());

grant select on public.adventure_objective_registry to anon, authenticated;
grant insert, update, delete on public.adventure_objective_registry to authenticated;

commit;
