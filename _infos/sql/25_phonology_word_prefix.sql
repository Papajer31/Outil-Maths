-- =========================================================
-- PATCH 25 — Préfixe d’affichage des mots phonologiques
-- À exécuter une seule fois après 21_phonology_words_import.sql.
--
-- Exemple de source :
--   (un) abricot|a/b/r/i/c_k/o/*t
--
-- La base conserve séparément :
--   prefix = 'un'
--   word   = 'abricot'
-- afin que le préfixe reste purement visuel et ne participe jamais
-- à la segmentation phonologique, au slug ni au lien avec les images.
-- =========================================================

alter table public.phonology_words
  add column if not exists prefix text not null default '';

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
    from jsonb_to_recordset(p_words) as incoming(slug text, word text, prefix text, units jsonb, is_active boolean)
    where btrim(coalesce(incoming.slug, '')) = ''
       or btrim(coalesce(incoming.word, '')) = ''
       or incoming.units is null
       or jsonb_typeof(incoming.units) <> 'array'
       or jsonb_array_length(incoming.units) = 0
  ) then
    raise exception 'Un ou plusieurs mots sont incomplets.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_words) as incoming(slug text, word text, prefix text, units jsonb, is_active boolean)
    cross join lateral jsonb_array_elements(incoming.units) as unit(value)
    where jsonb_typeof(unit.value) <> 'object'
       or btrim(coalesce(unit.value ->> 'graph', '')) = ''
       or btrim(coalesce(unit.value ->> 'text', '')) = ''
  ) then
    raise exception 'Une ou plusieurs unités phonologiques sont invalides.' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_words) as incoming(slug text, word text, prefix text, units jsonb, is_active boolean)
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
      item.units
    from jsonb_to_recordset(p_words) as item(slug text, word text, prefix text, units jsonb, is_active boolean)
  ), comparison as (
    select incoming.*,
      existing.slug as existing_slug,
      existing.word as existing_word,
      existing.prefix as existing_prefix,
      existing.units as existing_units,
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
        )
    ),
    count(*) filter (where existing_slug is not null and existing_is_active = false),
    count(*) filter (
      where existing_slug is not null
        and existing_word is not distinct from word
        and existing_prefix is not distinct from prefix
        and existing_units is not distinct from units
        and existing_is_active = true
    )
  into v_inserted_count, v_modified_count, v_reactivated_count, v_unchanged_count
  from comparison;

  insert into public.phonology_words (slug, word, prefix, units, is_active, updated_at)
  select
    lower(btrim(item.slug)),
    btrim(item.word),
    btrim(coalesce(item.prefix, '')),
    item.units,
    true,
    now()
  from jsonb_to_recordset(p_words) as item(slug text, word text, prefix text, units jsonb, is_active boolean)
  on conflict (slug) do update
  set
    word = excluded.word,
    prefix = excluded.prefix,
    units = excluded.units,
    is_active = true,
    updated_at = now();

  if p_deactivate_missing then
    update public.phonology_words existing
    set is_active = false, updated_at = now()
    where existing.is_active = true
      and not exists (
        select 1
        from jsonb_to_recordset(p_words) as item(slug text, word text, prefix text, units jsonb, is_active boolean)
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
