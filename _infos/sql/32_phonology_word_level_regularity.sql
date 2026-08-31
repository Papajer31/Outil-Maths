-- =========================================================
-- PATCH 32 — Niveau scolaire + régularité graphème-phonème
-- À exécuter après 29_phonology_word_familiarity.sql.
--
-- Nouveau format de banque :
--   mot|codes|syllabation|niveau|score_regularite
-- Exemple :
--   cabane|c_k/a/b/a/n/*e|ca/bane|CP|90
--
-- Niveaux : CP / CE1 / CE2 / CM / X
-- X reste hors sélection automatique.
-- Le score 0–100 ne filtre jamais les mots : il sert uniquement au tirage.
-- =========================================================

alter table public.phonology_words
  add column if not exists school_level text not null default 'X';

alter table public.phonology_words
  add column if not exists regularity_score smallint not null default 50;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'phonology_words_school_level_check'
      and conrelid = 'public.phonology_words'::regclass
  ) then
    alter table public.phonology_words
      add constraint phonology_words_school_level_check
      check (school_level in ('CP', 'CE1', 'CE2', 'CM', 'X'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'phonology_words_regularity_score_range'
      and conrelid = 'public.phonology_words'::regclass
  ) then
    alter table public.phonology_words
      add constraint phonology_words_regularity_score_range
      check (regularity_score between 0 and 100);
  end if;
end;
$$;

create index if not exists phonology_words_active_level_idx
on public.phonology_words (is_active, school_level, slug);

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
      school_level text, regularity_score integer, is_active boolean
    )
    where btrim(coalesce(incoming.slug, '')) = ''
       or btrim(coalesce(incoming.word, '')) = ''
       or incoming.units is null
       or jsonb_typeof(incoming.units) <> 'array'
       or jsonb_array_length(incoming.units) = 0
       or incoming.syllables is null
       or jsonb_typeof(incoming.syllables) <> 'array'
       or upper(btrim(coalesce(incoming.school_level, ''))) not in ('CP', 'CE1', 'CE2', 'CM', 'X')
       or incoming.regularity_score is null
       or incoming.regularity_score < 0
       or incoming.regularity_score > 100
  ) then
    raise exception 'Un ou plusieurs mots sont incomplets ou ont un niveau / score invalide.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_words) as incoming(
      slug text, word text, prefix text, units jsonb, syllables jsonb,
      school_level text, regularity_score integer, is_active boolean
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
      school_level text, regularity_score integer, is_active boolean
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
      school_level text, regularity_score integer, is_active boolean
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
      upper(btrim(item.school_level)) as school_level,
      item.regularity_score::smallint as regularity_score
    from jsonb_to_recordset(p_words) as item(
      slug text, word text, prefix text, units jsonb, syllables jsonb,
      school_level text, regularity_score integer, is_active boolean
    )
  ), comparison as (
    select incoming.*,
      existing.slug as existing_slug,
      existing.word as existing_word,
      existing.prefix as existing_prefix,
      existing.units as existing_units,
      existing.syllables as existing_syllables,
      existing.school_level as existing_school_level,
      existing.regularity_score as existing_regularity_score,
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
          or existing_school_level is distinct from school_level
          or existing_regularity_score is distinct from regularity_score
        )
    ),
    count(*) filter (where existing_slug is not null and existing_is_active = false),
    count(*) filter (
      where existing_slug is not null
        and existing_word is not distinct from word
        and existing_prefix is not distinct from prefix
        and existing_units is not distinct from units
        and existing_syllables is not distinct from syllables
        and existing_school_level is not distinct from school_level
        and existing_regularity_score is not distinct from regularity_score
        and existing_is_active = true
    )
  into v_inserted_count, v_modified_count, v_reactivated_count, v_unchanged_count
  from comparison;

  insert into public.phonology_words (
    slug, word, prefix, units, syllables, school_level, regularity_score, is_active, updated_at
  )
  select
    lower(btrim(item.slug)),
    btrim(item.word),
    btrim(coalesce(item.prefix, '')),
    item.units,
    item.syllables,
    upper(btrim(item.school_level)),
    item.regularity_score::smallint,
    true,
    now()
  from jsonb_to_recordset(p_words) as item(
    slug text, word text, prefix text, units jsonb, syllables jsonb,
    school_level text, regularity_score integer, is_active boolean
  )
  on conflict (slug) do update
  set
    word = excluded.word,
    prefix = excluded.prefix,
    units = excluded.units,
    syllables = excluded.syllables,
    school_level = excluded.school_level,
    regularity_score = excluded.regularity_score,
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
          school_level text, regularity_score integer, is_active boolean
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

-- La colonne familiarity de la migration 29 est volontairement conservée
-- pour une transition sans casse. Le nouveau client ne la lit plus et le
-- nouvel import ne la met plus à jour. Elle pourra être supprimée plus tard.
