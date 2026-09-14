-- =========================================================
-- 44_lexical_entries_v1.sql
-- Nouvelle banque lexicale V1, parallèle à phonology_words.
-- Aucun outil élève n'est rebranché par cette migration.
-- =========================================================

begin;

create table if not exists public.lexical_entries_v1 (
  id uuid primary key default gen_random_uuid(),
  entry_key text not null unique,
  entry text not null,
  category text not null,
  lexical_level text not null,
  phonology text[] not null default '{}'::text[],
  syllabifications text[] not null default '{}'::text[],
  introducers text[] not null default '{}'::text[],
  masc_sing text null,
  fem_sing text null,
  masc_plur text null,
  fem_plur text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint lexical_entries_v1_key_not_blank check (length(btrim(entry_key)) > 0),
  constraint lexical_entries_v1_entry_not_blank check (length(btrim(entry)) > 0),
  constraint lexical_entries_v1_category_not_blank check (length(btrim(category)) > 0),
  constraint lexical_entries_v1_level_check check (lexical_level in ('CP','CE1','CE2','CM'))
);

create index if not exists lexical_entries_v1_level_idx
on public.lexical_entries_v1 (lexical_level, entry_key);

create index if not exists lexical_entries_v1_category_idx
on public.lexical_entries_v1 (category, entry_key);

drop trigger if exists trg_lexical_entries_v1_updated_at on public.lexical_entries_v1;
create trigger trg_lexical_entries_v1_updated_at
before update on public.lexical_entries_v1
for each row execute function public.set_updated_at();

alter table public.lexical_entries_v1 enable row level security;

drop policy if exists lexical_entries_v1_read_authenticated on public.lexical_entries_v1;
create policy lexical_entries_v1_read_authenticated
on public.lexical_entries_v1
for select
to authenticated
using (is_active = true or public.is_super_admin());

drop policy if exists lexical_entries_v1_admin_insert on public.lexical_entries_v1;
create policy lexical_entries_v1_admin_insert
on public.lexical_entries_v1
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists lexical_entries_v1_admin_update on public.lexical_entries_v1;
create policy lexical_entries_v1_admin_update
on public.lexical_entries_v1
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists lexical_entries_v1_admin_delete on public.lexical_entries_v1;
create policy lexical_entries_v1_admin_delete
on public.lexical_entries_v1
for delete
to authenticated
using (public.is_super_admin());

grant select on public.lexical_entries_v1 to authenticated;
grant insert, update, delete on public.lexical_entries_v1 to authenticated;

commit;
