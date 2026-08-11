-- =========================================================
-- PATCH 29 — Familiarité lexicale de phonology_words
-- À exécuter après 28_phonology_words_replace.sql.
--
-- La banque finale utilise :
--   mot|codes|syllabation|familiarite
-- Exemple :
--   cabane|c_k/a/b/a/n/*e|ca/bane|84
--
-- familiarity est un entier 0–100. Les anciennes lignes reçoivent
-- provisoirement la valeur neutre 50 jusqu'au prochain remplacement.
-- =========================================================

alter table public.phonology_words
  add column if not exists familiarity smallint not null default 50;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'phonology_words_familiarity_range'
      and conrelid = 'public.phonology_words'::regclass
  ) then
    alter table public.phonology_words
      add constraint phonology_words_familiarity_range
      check (familiarity between 0 and 100);
  end if;
end;
$$;

create or replace function public.sync_phonology_words_as_admin(
  p_words jsonb,
  p_deactivate_missing boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_payload_count integer := 0;
  v_inserted_count integer := 0;
  v_modified_count integer := 0;
  v_reactivated_count integer := 0;
  v_unchanged_count integer := 0;
  v_deactivated_count integer := 0;
  v_active_count integer := 0;
  v_total_count integer := 0;
begin
  if auth.uid() is null or not public.is_super_admin() then
    raise exception 'Accès réservé au super-admin.' using errcode = '42501';
  end if;

  if p_words is null or jsonb_typeof(p_words) <> 'array' then
    raise exception 'Le contenu à importer doit être un tableau JSON.' using errcode = '22023';
  end if;

  v_payload_count := jsonb_array_length(p_words);
  if v_payload_count = 0 then
    raise exception 'La banque à importer est vide.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_words) as incoming(
      slug text, word text, prefix text, units jsonb, syllables jsonb,
      familiarity integer, is_active boolean
    )
    where btrim(coalesce(incoming.slug, '')) = ''
       or btrim(coalesce(incoming.word, '')) = ''
       or incoming.units is null
       or jsonb_typeof(incoming.units) <> 'array'
       or jsonb_array_length(incoming.units) = 0
       or incoming.syllables is null
       or jsonb_typeof(incoming.syllables) <> 'array'
       or incoming.familiarity is null
       or incoming.familiarity < 0
       or incoming.familiarity > 100
  ) then
    raise exception 'Un ou plusieurs mots sont incomplets ou ont une familiarité invalide.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_words) as incoming(
      slug text, word text, prefix text, units jsonb, syllables jsonb,
      familiarity integer, is_active boolean
    )
    cross join lateral jsonb_array_elements(incoming.units) as unit(value)
    where jsonb_typeof(unit.value) <> 'object'
       or btrim(coalesce(unit.value ->> 'graph', '')) = ''
       or btrim(coalesce(unit.value ->> 'text', '')) = ''
  ) then
    raise exception 'Une ou plusieurs unités phonologiques sont invalides.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_words) as incoming(
      slug text, word text, prefix text, units jsonb, syllables jsonb,
      familiarity integer, is_active boolean
    )
    cross join lateral jsonb_array_elements(incoming.syllables) as syllable(value)
    where jsonb_typeof(syllable.value) <> 'string'
       or btrim(syllable.value #>> '{}') = ''
  ) then
    raise exception 'Une ou plusieurs syllabes sont invalides.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_words) as incoming(
      slug text, word text, prefix text, units jsonb, syllables jsonb,
      familiarity integer, is_active boolean
    )
    group by lower(btrim(incoming.slug))
    having count(*) > 1
  ) then
    raise exception 'La banque contient des identifiants de mots en double.' using errcode = '22023';
  end if;

  with incoming as (
    select
      lower(btrim(item.slug)) as slug,
      btrim(item.word) as word,
      btrim(coalesce(item.prefix, '')) as prefix,
      item.units,
      item.syllables,
      item.familiarity::smallint as familiarity
    from jsonb_to_recordset(p_words) as item(
      slug text, word text, prefix text, units jsonb, syllables jsonb,
      familiarity integer, is_active boolean
    )
  ), comparison as (
    select incoming.*,
      existing.slug as existing_slug,
      existing.word as existing_word,
      existing.prefix as existing_prefix,
      existing.units as existing_units,
      existing.syllables as existing_syllables,
      existing.familiarity as existing_familiarity,
      existing.is_active as existing_is_active
    from incoming
    left join public.phonology_words existing on existing.slug = incoming.slug
  )
  select
    count(*) filter (where existing_slug is null),
    count(*) filter (
      where existing_slug is not null
        and (
          existing_word is distinct from word
          or existing_prefix is distinct from prefix
          or existing_units is distinct from units
          or existing_syllables is distinct from syllables
          or existing_familiarity is distinct from familiarity
        )
    ),
    count(*) filter (where existing_slug is not null and existing_is_active = false),
    count(*) filter (
      where existing_slug is not null
        and existing_word is not distinct from word
        and existing_prefix is not distinct from prefix
        and existing_units is not distinct from units
        and existing_syllables is not distinct from syllables
        and existing_familiarity is not distinct from familiarity
        and existing_is_active = true
    )
  into v_inserted_count, v_modified_count, v_reactivated_count, v_unchanged_count
  from comparison;

  insert into public.phonology_words (slug, word, prefix, units, syllables, familiarity, is_active, updated_at)
  select
    lower(btrim(item.slug)),
    btrim(item.word),
    btrim(coalesce(item.prefix, '')),
    item.units,
    item.syllables,
    item.familiarity::smallint,
    true,
    now()
  from jsonb_to_recordset(p_words) as item(
    slug text, word text, prefix text, units jsonb, syllables jsonb,
    familiarity integer, is_active boolean
  )
  on conflict (slug) do update
  set
    word = excluded.word,
    prefix = excluded.prefix,
    units = excluded.units,
    syllables = excluded.syllables,
    familiarity = excluded.familiarity,
    is_active = true,
    updated_at = now();

  if p_deactivate_missing then
    update public.phonology_words existing
    set is_active = false, updated_at = now()
    where existing.is_active = true
      and not exists (
        select 1
        from jsonb_to_recordset(p_words) as item(
          slug text, word text, prefix text, units jsonb, syllables jsonb,
          familiarity integer, is_active boolean
        )
        where lower(btrim(item.slug)) = existing.slug
      );
    get diagnostics v_deactivated_count = row_count;
  end if;

  select
    count(*) filter (where is_active = true),
    count(*)
  into v_active_count, v_total_count
  from public.phonology_words;

  return jsonb_build_object(
    'received_count', v_payload_count,
    'inserted_count', v_inserted_count,
    'modified_count', v_modified_count,
    'reactivated_count', v_reactivated_count,
    'unchanged_count', v_unchanged_count,
    'deactivated_count', v_deactivated_count,
    'active_count', v_active_count,
    'total_count', v_total_count
  );
end;
$$;

revoke all on function public.sync_phonology_words_as_admin(jsonb, boolean) from public;
grant execute on function public.sync_phonology_words_as_admin(jsonb, boolean) to authenticated;
