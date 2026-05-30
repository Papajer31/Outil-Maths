-- =========================================================
-- POST-SEED : normalisation Encodage V2
-- À appliquer uniquement si la seed phonology_words rejouée contient
-- encore les anciens graphèmes : s1, s2, c1, c2, g1, g2, é, è, ê, ç, y, ô.
-- =========================================================

begin;

create or replace function public.encodage_v2_graph_id(p_graph text)
returns text
language sql
immutable
as $$
  select case trim(coalesce(p_graph, ''))
    when 's1' then 's_s'
    when 's2' then 's_z'
    when 'c1' then 'c_k'
    when 'c2' then 'c_s'
    when 'g1' then 'g_g'
    when 'g2' then 'g_j'
    when 'é' then 'e_aigu'
    when 'è' then 'e_grave'
    when 'ê' then 'e_circonflexe'
    when 'ç' then 'c_cedille'
    when 'y' then 'y_i'
    when 'ô' then 'o_circonflexe'
    else trim(coalesce(p_graph, ''))
  end;
$$;

update public.phonology_words as pw
set units = migrated.new_units
from (
  select
    pw_inner.slug,
    jsonb_agg(
      case
        when jsonb_typeof(unit.value) = 'object'
          then jsonb_set(
            unit.value,
            '{graph}',
            to_jsonb(public.encodage_v2_graph_id(unit.value ->> 'graph')),
            false
          )
        else unit.value
      end
      order by unit.ord
    ) as new_units
  from public.phonology_words as pw_inner
  cross join lateral jsonb_array_elements(pw_inner.units) with ordinality as unit(value, ord)
  group by pw_inner.slug
) as migrated
where pw.slug = migrated.slug
  and pw.units is distinct from migrated.new_units;

-- Graphèmes résiduels utilisés comme lettres muettes dans certaines anciennes lignes.
update public.phonology_words as pw
set units = migrated.new_units
from (
  select
    pw_inner.slug,
    jsonb_agg(
      case
        when unit.value ->> 'graph' = 'g'
          then jsonb_set(jsonb_set(unit.value, '{graph}', to_jsonb('g_g'::text), false), '{isSilent}', 'true'::jsonb, true)
        when unit.value ->> 'graph' = 's'
          then jsonb_set(jsonb_set(unit.value, '{graph}', to_jsonb('s_s'::text), false), '{isSilent}', 'true'::jsonb, true)
        when unit.value ->> 'graph' = 'x'
          then jsonb_set(jsonb_set(unit.value, '{graph}', to_jsonb('x_ks'::text), false), '{isSilent}', 'true'::jsonb, true)
        else unit.value
      end
      order by unit.ord
    ) as new_units
  from public.phonology_words as pw_inner
  cross join lateral jsonb_array_elements(pw_inner.units) with ordinality as unit(value, ord)
  where exists (
    select 1
    from jsonb_array_elements(pw_inner.units) as u(value)
    where u.value ->> 'graph' in ('g', 's', 'x')
  )
  group by pw_inner.slug
) as migrated
where pw.slug = migrated.slug
  and pw.units is distinct from migrated.new_units;

commit;
