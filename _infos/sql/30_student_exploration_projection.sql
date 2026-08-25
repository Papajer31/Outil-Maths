-- =========================================================
-- PATCH 30 — PROJECTION ÉLÈVE DE L’ARBORESCENCE EXPLORATION
-- À exécuter APRÈS 29_phonology_word_familiarity.sql.
--
-- Objectif :
-- - conserver l’arborescence pédagogique réelle inchangée ;
-- - permettre un libellé plus court côté élève ;
-- - permettre de rendre un nœud transparent dans Exploration ;
-- - ne modifier aucun parent_id ni aucun rattachement d’activité.
--
-- Règle applicative :
-- - les nœuds grade_level sont toujours transparents côté élève,
--   indépendamment de student_navigation_mode ;
-- - student_label = NULL signifie « utiliser name » ;
-- - student_navigation_mode = 'folder' conserve une étape visible ;
-- - student_navigation_mode = 'transparent' remonte ses enfants au
--   premier ancêtre visible dans la projection élève.
-- =========================================================

begin;

alter table public.pedagogical_nodes
  add column if not exists student_label text null;

alter table public.pedagogical_nodes
  add column if not exists student_navigation_mode text not null default 'folder';

update public.pedagogical_nodes
set student_label = null
where student_label is not null
  and btrim(student_label) = '';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pedagogical_nodes'::regclass
      and conname = 'pedagogical_nodes_student_label_not_blank'
  ) then
    alter table public.pedagogical_nodes
      add constraint pedagogical_nodes_student_label_not_blank
      check (student_label is null or btrim(student_label) <> '');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.pedagogical_nodes'::regclass
      and conname = 'pedagogical_nodes_student_navigation_mode_check'
  ) then
    alter table public.pedagogical_nodes
      add constraint pedagogical_nodes_student_navigation_mode_check
      check (student_navigation_mode in ('folder', 'transparent'));
  end if;
end;
$$;

comment on column public.pedagogical_nodes.student_label is
  'Libellé court facultatif utilisé uniquement dans la projection élève Exploration. NULL = nom pédagogique officiel.';

comment on column public.pedagogical_nodes.student_navigation_mode is
  'Mode de navigation côté élève : folder = étape visible ; transparent = nœud sauté et enfants remontés. Les grade_level restent toujours transparents applicativement.';

commit;
