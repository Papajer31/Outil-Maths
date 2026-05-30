SELECT
  pw.slug,
  pw.word,
  unit.ord AS position,
  unit.value ->> 'graph' AS graph,
  unit.value AS unit_json,
  pw.units
FROM public.phonology_words pw
CROSS JOIN LATERAL jsonb_array_elements(pw.units) WITH ORDINALITY AS unit(value, ord)
WHERE unit.value ->> 'graph' IN ('â', 'g', 's', 'x', 's1', 's2', 'c1', 'c2', 'g1', 'g2', 'é', 'è', 'ê', 'ç', 'y', 'ô')
ORDER BY graph, pw.slug, position;
