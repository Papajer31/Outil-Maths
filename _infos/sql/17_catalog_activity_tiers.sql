-- =========================================================
-- PATCH 17 — PALIERS INTERNES DES ACTIVITÉS D’UN ODAPP
-- À exécuter APRÈS 16_teacher_adventure_objectives.sql.
--
-- Objectif :
-- - affecter chaque activité système à un palier interne de son OdApp ;
-- - placer toutes les activités existantes au palier 1 ;
-- - conserver display_order comme ordre de l’activité dans son palier ;
-- - préparer la sélection progressive des activités par le moteur Aventure.
-- =========================================================

begin;

alter table public.catalog_activities
  add column if not exists adventure_tier integer;

update public.catalog_activities
set adventure_tier = 1
where adventure_tier is null or adventure_tier < 1;

alter table public.catalog_activities
  alter column adventure_tier set default 1,
  alter column adventure_tier set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'catalog_activities_adventure_tier_positive'
      and conrelid = 'public.catalog_activities'::regclass
  ) then
    alter table public.catalog_activities
      add constraint catalog_activities_adventure_tier_positive
      check (adventure_tier >= 1);
  end if;
end;
$$;

create index if not exists catalog_activities_status_node_tier_order_idx
on public.catalog_activities
  (status, pedagogical_node_id, adventure_tier, display_order, title);

commit;
