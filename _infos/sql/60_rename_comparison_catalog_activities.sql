-- =========================================================
-- PATCH 60 — RENOMMAGE DES ACTIVITÉS DE COMPARAISON
-- =========================================================

begin;

update public.catalog_activities
set title = case id
  when 'mathematiques.nombres.comparaison' then 'Différence entre collections'
  when 'mathematiques.nombres.comparaison-signes' then 'Comparaison (introduction)'
  else title
end
where id in (
  'mathematiques.nombres.comparaison',
  'mathematiques.nombres.comparaison-signes'
);

commit;
