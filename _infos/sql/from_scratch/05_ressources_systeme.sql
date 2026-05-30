-- =========================================================
-- 05_RESSOURCES_SYSTEME — images, phonologie, vocabulaire
-- =========================================================

-- ---------------------------------------------------------
-- Images système
-- ---------------------------------------------------------

create table public.image_assets (
  slug text primary key,
  storage_path text not null unique,
  tags text[] not null default '{}',
  notes text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint image_assets_slug_not_blank check (length(trim(slug)) > 0),
  constraint image_assets_storage_path_not_blank check (length(trim(storage_path)) > 0)
);

create index image_assets_active_slug_idx
on public.image_assets (is_active, slug);

drop trigger if exists trg_image_assets_updated_at on public.image_assets;
create trigger trg_image_assets_updated_at
before update on public.image_assets
for each row execute function public.set_updated_at();

alter table public.image_assets enable row level security;

create policy image_assets_public_read_active
on public.image_assets
for select to anon, authenticated
using (is_active = true);

-- Pas de grant d’écriture pour authenticated : écriture réservée au futur super-admin / SQL Editor.
grant select on public.image_assets to anon, authenticated;

-- ---------------------------------------------------------
-- Mots Encodage / phonologie
-- ---------------------------------------------------------

create table public.phonology_words (
  slug text primary key,
  word text not null,
  units jsonb not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint phonology_words_slug_not_blank check (length(trim(slug)) > 0),
  constraint phonology_words_word_not_blank check (length(trim(word)) > 0),
  constraint phonology_words_units_array check (jsonb_typeof(units) = 'array')
);

create index phonology_words_active_slug_idx
on public.phonology_words (is_active, slug);

drop trigger if exists trg_phonology_words_updated_at on public.phonology_words;
create trigger trg_phonology_words_updated_at
before update on public.phonology_words
for each row execute function public.set_updated_at();

alter table public.phonology_words enable row level security;

create policy phonology_words_public_read_active
on public.phonology_words
for select to anon, authenticated
using (is_active = true);

grant select on public.phonology_words to anon, authenticated;

-- ---------------------------------------------------------
-- Banque de vocabulaire système + copie enseignant
-- ---------------------------------------------------------

create table public.vocabulary_default_words (
  id bigint generated always as identity primary key,
  word text not null,
  word_normalized text not null,
  dictionary_page int null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint vocabulary_default_words_word_not_blank check (length(trim(word)) > 0),
  constraint vocabulary_default_words_word_normalized_not_blank check (length(trim(word_normalized)) > 0),
  constraint vocabulary_default_words_dictionary_page_positive check (dictionary_page is null or dictionary_page > 0),
  constraint vocabulary_default_words_word_normalized_unique unique (word_normalized)
);

create index vocabulary_default_words_word_normalized_idx
on public.vocabulary_default_words (word_normalized);

drop trigger if exists trg_vocabulary_default_words_updated_at on public.vocabulary_default_words;
create trigger trg_vocabulary_default_words_updated_at
before update on public.vocabulary_default_words
for each row execute function public.set_updated_at();

alter table public.vocabulary_default_words enable row level security;

create policy vocabulary_default_words_public_read
on public.vocabulary_default_words
for select to anon, authenticated
using (true);

grant select on public.vocabulary_default_words to anon, authenticated;

create table public.teacher_vocabulary_words (
  id bigint generated always as identity primary key,
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  word text not null,
  word_normalized text not null,
  dictionary_page int null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_vocabulary_words_word_not_blank check (length(trim(word)) > 0),
  constraint teacher_vocabulary_words_word_normalized_not_blank check (length(trim(word_normalized)) > 0),
  constraint teacher_vocabulary_words_dictionary_page_positive check (dictionary_page is null or dictionary_page > 0),
  constraint teacher_vocabulary_words_unique_word_per_space unique (teacher_space_id, word_normalized)
);

create index teacher_vocabulary_words_space_word_idx
on public.teacher_vocabulary_words (teacher_space_id, word_normalized);

drop trigger if exists trg_teacher_vocabulary_words_updated_at on public.teacher_vocabulary_words;
create trigger trg_teacher_vocabulary_words_updated_at
before update on public.teacher_vocabulary_words
for each row execute function public.set_updated_at();

alter table public.teacher_vocabulary_words enable row level security;

create policy teacher_vocabulary_words_select_own
on public.teacher_vocabulary_words
for select to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_vocabulary_words.teacher_space_id and ts.owner_user_id = auth.uid()));

grant select on public.teacher_vocabulary_words to authenticated;

create or replace function public.copy_default_vocabulary_words_to_teacher_space()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.teacher_vocabulary_words (teacher_space_id, word, word_normalized, dictionary_page, updated_at)
  select new.id, d.word, d.word_normalized, d.dictionary_page, now()
  from public.vocabulary_default_words d
  on conflict (teacher_space_id, word_normalized) do update
  set word = excluded.word,
      dictionary_page = excluded.dictionary_page,
      updated_at = now();

  return new;
end;
$$;

drop trigger if exists teacher_spaces_copy_default_vocabulary_words on public.teacher_spaces;
create trigger teacher_spaces_copy_default_vocabulary_words
after insert on public.teacher_spaces
for each row execute function public.copy_default_vocabulary_words_to_teacher_space();

create or replace function public.reset_teacher_vocabulary_words(p_teacher_space_id bigint)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not exists (select 1 from public.teacher_spaces ts where ts.id = p_teacher_space_id and ts.owner_user_id = auth.uid()) then
    raise exception 'Accès refusé à cette banque de mots.';
  end if;

  delete from public.teacher_vocabulary_words where teacher_space_id = p_teacher_space_id;

  insert into public.teacher_vocabulary_words (teacher_space_id, word, word_normalized, dictionary_page, updated_at)
  select p_teacher_space_id, d.word, d.word_normalized, d.dictionary_page, now()
  from public.vocabulary_default_words d;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.replace_teacher_vocabulary_words(
  p_teacher_space_id bigint,
  p_items jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not exists (select 1 from public.teacher_spaces ts where ts.id = p_teacher_space_id and ts.owner_user_id = auth.uid()) then
    raise exception 'Accès refusé à cette banque de mots.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Format de banque de mots invalide.';
  end if;

  delete from public.teacher_vocabulary_words where teacher_space_id = p_teacher_space_id;

  with parsed as (
    select
      trim(x.word) as word,
      lower(trim(x.word)) as word_normalized,
      case when x.dictionary_page is not null and x.dictionary_page > 0 then x.dictionary_page else null end as dictionary_page
    from jsonb_to_recordset(p_items) as x(word text, dictionary_page int)
  ), cleaned as (
    select distinct on (word_normalized) word, word_normalized, dictionary_page
    from parsed
    where word is not null and length(trim(word)) > 0
    order by word_normalized, word
  )
  insert into public.teacher_vocabulary_words (teacher_space_id, word, word_normalized, dictionary_page, updated_at)
  select p_teacher_space_id, c.word, c.word_normalized, c.dictionary_page, now()
  from cleaned c;

  get diagnostics v_count = row_count;

  if v_count <= 0 then
    raise exception 'La banque de mots doit contenir au moins un mot valide.';
  end if;

  return v_count;
end;
$$;

create or replace function public.get_space_vocabulary_words(p_access_code text)
returns table (
  word text,
  dictionary_page int
)
language sql
stable
security definer
set search_path = public
as $$
  select tvw.word, tvw.dictionary_page
  from public.teacher_spaces ts
  join public.teacher_vocabulary_words tvw on tvw.teacher_space_id = ts.id
  where ts.access_code = upper(trim(p_access_code))
  order by tvw.word_normalized asc, tvw.word asc, tvw.id asc;
$$;

grant execute on function public.reset_teacher_vocabulary_words(bigint) to authenticated;
grant execute on function public.replace_teacher_vocabulary_words(bigint, jsonb) to authenticated;
grant execute on function public.get_space_vocabulary_words(text) to anon, authenticated;
