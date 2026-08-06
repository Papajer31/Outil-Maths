-- =========================================================
-- PATCH 13 — ARBORESCENCE PÉDAGOGIQUE DU CATALOGUE EN BASE
-- À exécuter APRÈS 12_activity_attempt_history.sql.
--
-- Objectif :
-- - conserver les identifiants historiques des catégories ;
-- - rendre l'arborescence administrable par le super-admin ;
-- - préparer Domaine > Matière > Élément du programme > Compétence ;
-- - porter les niveaux CP à CM2 par héritage ;
-- - ne déplacer ni ne supprimer aucune activité existante.
-- =========================================================

begin;

create table if not exists public.catalog_folders (
  id text primary key,
  parent_id text null references public.catalog_folders(id) on update cascade on delete restrict,
  name text not null,
  node_type text not null,
  display_order integer not null default 0,
  is_active boolean not null default true,
  grade_scope_mode text not null default 'inherit',
  grade_levels text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint catalog_folders_id_format check (id ~ '^[a-z0-9][a-z0-9._-]{0,159}$'),
  constraint catalog_folders_name_not_blank check (btrim(name) <> ''),
  constraint catalog_folders_type_check check (node_type in ('domain', 'subject', 'program_element', 'competency')),
  constraint catalog_folders_order_nonnegative check (display_order >= 0),
  constraint catalog_folders_scope_mode_check check (grade_scope_mode in ('inherit', 'custom')),
  constraint catalog_folders_grade_levels_check check (
    grade_levels <@ array['CP','CE1','CE2','CM1','CM2']::text[]
  ),
  constraint catalog_folders_root_scope_check check (
    parent_id is not null or grade_scope_mode = 'custom'
  )
);

create index if not exists catalog_folders_parent_order_idx
on public.catalog_folders (parent_id, display_order, name);

create index if not exists catalog_folders_active_idx
on public.catalog_folders (is_active);

drop trigger if exists trg_catalog_folders_updated_at on public.catalog_folders;
create trigger trg_catalog_folders_updated_at
before update on public.catalog_folders
for each row execute function public.set_updated_at();

create or replace function public.validate_catalog_folder_tree()
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
    if new.node_type <> 'domain' then
      raise exception 'Seuls les domaines peuvent être placés à la racine.';
    end if;
    if new.grade_scope_mode <> 'custom' then
      raise exception 'Un domaine racine doit définir explicitement ses niveaux.';
    end if;
    return new;
  end if;

  select node_type into parent_type
  from public.catalog_folders
  where id = new.parent_id;

  if parent_type is null then
    raise exception 'Le parent pédagogique % est introuvable.', new.parent_id;
  end if;

  if not (
    (parent_type = 'domain' and new.node_type = 'subject')
    or (parent_type = 'subject' and new.node_type = 'program_element')
    or (parent_type = 'program_element' and new.node_type = 'competency')
  ) then
    raise exception 'Hiérarchie invalide : % ne peut pas contenir %.', parent_type, new.node_type;
  end if;

  cursor_id := new.parent_id;
  while cursor_id is not null loop
    if cursor_id = new.id then
      raise exception 'Ce déplacement créerait une boucle dans l’arborescence.';
    end if;
    select parent_id into cursor_id
    from public.catalog_folders
    where id = cursor_id;
  end loop;

  return new;
end;
$$;

-- Arborescence historique codée jusque-là dans shared/catalogue.js.
insert into public.catalog_folders
  (id, parent_id, name, node_type, display_order, is_active, grade_scope_mode, grade_levels)
values
  ('francais', null, 'Français', 'domain', 0, true, 'custom', array['CP','CE1','CE2','CM1','CM2']),
  ('francais.lecture', 'francais', 'Lecture', 'subject', 0, true, 'inherit', '{}'),
  ('francais.ecriture', 'francais', 'Écriture', 'subject', 1, true, 'inherit', '{}'),
  ('francais.oral', 'francais', 'Oral', 'subject', 2, true, 'inherit', '{}'),
  ('francais.vocabulaire', 'francais', 'Vocabulaire', 'subject', 3, true, 'inherit', '{}'),
  ('francais.grammaire', 'francais', 'Grammaire', 'subject', 4, true, 'inherit', '{}'),
  ('francais.orthographe', 'francais', 'Orthographe', 'subject', 5, true, 'inherit', '{}'),

  ('mathematiques', null, 'Mathématiques', 'domain', 1, true, 'custom', array['CP','CE1','CE2','CM1','CM2']),
  ('mathematiques.nombres', 'mathematiques', 'Nombres', 'subject', 0, true, 'inherit', '{}'),
  ('mathematiques.calculs', 'mathematiques', 'Calculs', 'subject', 1, true, 'inherit', '{}'),
  ('mathematiques.resolution-problemes', 'mathematiques', 'Résolution de problèmes', 'subject', 2, true, 'inherit', '{}'),
  ('mathematiques.grandeurs-mesures', 'mathematiques', 'Grandeurs et mesures', 'subject', 3, true, 'inherit', '{}'),
  ('mathematiques.espace-geometrie', 'mathematiques', 'Espace et géométrie', 'subject', 4, true, 'inherit', '{}'),
  ('mathematiques.donnees', 'mathematiques', 'Organisation et gestion de données', 'subject', 5, true, 'inherit', '{}'),

  ('questionner-le-monde', null, 'Questionner le monde', 'domain', 2, true, 'custom', array['CP','CE1','CE2','CM1','CM2']),
  ('emc', null, 'EMC', 'domain', 3, true, 'custom', array['CP','CE1','CE2','CM1','CM2']),
  ('autres', null, 'Autres', 'domain', 5, true, 'custom', array['CP','CE1','CE2','CM1','CM2'])
on conflict (id) do nothing;


-- La validation stricte est activée après l’import de l’arborescence historique.
drop trigger if exists trg_validate_catalog_folder_tree on public.catalog_folders;
create trigger trg_validate_catalog_folder_tree
before insert or update of parent_id, node_type, grade_scope_mode
on public.catalog_folders
for each row execute function public.validate_catalog_folder_tree();

-- La migration refuse de masquer silencieusement une ancienne catégorie inconnue.
do $$
declare
  unknown_categories text;
begin
  select string_agg(distinct ca.category_id, ', ' order by ca.category_id)
  into unknown_categories
  from public.catalog_activities ca
  left join public.catalog_folders cf on cf.id = ca.category_id
  where cf.id is null;

  if unknown_categories is not null then
    raise exception 'Catégories d’activités inconnues : %. Ajoute-les à catalog_folders avant de relancer la migration.', unknown_categories;
  end if;
end;
$$;

-- La clé étrangère protège désormais les déplacements et les suppressions.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_activities_category_fk'
      and conrelid = 'public.catalog_activities'::regclass
  ) then
    alter table public.catalog_activities
      add constraint catalog_activities_category_fk
      foreign key (category_id)
      references public.catalog_folders(id)
      on update cascade
      on delete restrict;
  end if;
end;
$$;

alter table public.catalog_folders enable row level security;

-- Les métadonnées pédagogiques ne sont pas secrètes. Tout le monde peut les lire ;
-- l’application masque ensuite les nœuds inactifs et les niveaux non concernés.
drop policy if exists catalog_folders_select_all on public.catalog_folders;
create policy catalog_folders_select_all
on public.catalog_folders
for select
to anon, authenticated
using (true);

drop policy if exists catalog_folders_insert_admin on public.catalog_folders;
create policy catalog_folders_insert_admin
on public.catalog_folders
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists catalog_folders_update_admin on public.catalog_folders;
create policy catalog_folders_update_admin
on public.catalog_folders
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists catalog_folders_delete_admin on public.catalog_folders;
create policy catalog_folders_delete_admin
on public.catalog_folders
for delete
to authenticated
using (public.is_super_admin());

grant select on public.catalog_folders to anon, authenticated;
grant insert, update, delete on public.catalog_folders to authenticated;

commit;
