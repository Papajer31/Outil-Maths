WITH valid_graphs(graph) AS (
  VALUES
    ('a'), ('i'), ('r'), ('l'), ('o'), ('s_s'), ('e_aigu'), ('u'), ('f'), ('e'),
    ('ch'), ('m'), ('ou'), ('v'), ('e_grave'), ('e_circonflexe'), ('n'), ('an'),
    ('t'), ('oi'), ('c_k'), ('en'), ('p'), ('d'), ('on'), ('z'), ('ai'), ('b'),
    ('y_i'), ('o_circonflexe'), ('au'), ('eau'), ('j'), ('in'), ('ss'), ('s_z'),
    ('g_g'), ('gu'), ('es'), ('er'), ('ez'), ('c_s'), ('c_cedille'), ('sc'),
    ('ei'), ('et'), ('am'), ('em'), ('im'), ('om'), ('qu'), ('q'), ('k'), ('eu'),
    ('oeu'), ('g_j'), ('ge'), ('es_cons'), ('el_cons'), ('ef_cons'), ('ec_cons'),
    ('er_cons'), ('h'), ('ph'), ('ette'), ('esse'), ('elle'), ('erre'), ('enne'),
    ('gn'), ('ain'), ('ein'), ('ill'), ('ail'), ('aille'), ('eil'), ('eille'),
    ('euil'), ('euille'), ('ouil'), ('ouille'), ('ion'), ('ien'), ('ieu'), ('ian'),
    ('ier'), ('y_y'), ('y_ii'), ('eur'), ('euf'), ('eul'), ('oeuf'), ('oeur'),
    ('x_ks'), ('x_gz'), ('x_s'), ('x_z'), ('un'), ('um'), ('oin'), ('w_w'),
    ('w_v'), ('tion'), ('tie'), ('tien'), ('tial'), ('tiel'), ('tieu')
),
used_graphs AS (
  SELECT
    unit.value ->> 'graph' AS graph,
    count(*) AS occurrences
  FROM public.phonology_words pw
  CROSS JOIN LATERAL jsonb_array_elements(pw.units) AS unit(value)
  GROUP BY unit.value ->> 'graph'
)
SELECT used_graphs.graph, used_graphs.occurrences
FROM used_graphs
LEFT JOIN valid_graphs ON valid_graphs.graph = used_graphs.graph
WHERE valid_graphs.graph IS NULL
ORDER BY used_graphs.graph;
