-- =========================================================
-- 46_lexical_entries.sql
-- Banque lexicale définitive.
--
-- - remplace lexical_entries_v1 ;
-- - niveaux lexicaux stricts 1 / 2 / 3 (smallint) ;
-- - lecture publique des entrées actives pour le futur runtime ;
-- - administration complète réservée au super-admin ;
-- - aucun outil élève n'est rebranché par cette migration.
-- =========================================================

begin;

-- La banque V1 était explicitement provisoire : on la supprime au lieu de
-- conserver une couche legacy. La V6 sera réimportée depuis Ressources > Mots.
drop table if exists public.lexical_entries_v1 cascade;

create table if not exists public.lexical_entries (
  id uuid primary key default gen_random_uuid(),
  entry_key text not null unique,
  entry text not null,
  category text not null,
  lexical_level smallint not null,
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

  constraint lexical_entries_key_not_blank check (length(btrim(entry_key)) > 0),
  constraint lexical_entries_entry_not_blank check (length(btrim(entry)) > 0),
  constraint lexical_entries_category_not_blank check (length(btrim(category)) > 0),
  constraint lexical_entries_level_check check (lexical_level between 1 and 3)
);

create index if not exists lexical_entries_level_idx
on public.lexical_entries (lexical_level, entry_key);

create index if not exists lexical_entries_category_idx
on public.lexical_entries (category, entry_key);

create index if not exists lexical_entries_active_idx
on public.lexical_entries (is_active, entry_key);

drop trigger if exists trg_lexical_entries_updated_at on public.lexical_entries;
create trigger trg_lexical_entries_updated_at
before update on public.lexical_entries
for each row execute function public.set_updated_at();

alter table public.lexical_entries enable row level security;

drop policy if exists lexical_entries_public_read_active on public.lexical_entries;
create policy lexical_entries_public_read_active
on public.lexical_entries
for select
to anon, authenticated
using (is_active = true);

drop policy if exists lexical_entries_admin_select on public.lexical_entries;
create policy lexical_entries_admin_select
on public.lexical_entries
for select
to authenticated
using (public.is_super_admin());

drop policy if exists lexical_entries_admin_insert on public.lexical_entries;
create policy lexical_entries_admin_insert
on public.lexical_entries
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists lexical_entries_admin_update on public.lexical_entries;
create policy lexical_entries_admin_update
on public.lexical_entries
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists lexical_entries_admin_delete on public.lexical_entries;
create policy lexical_entries_admin_delete
on public.lexical_entries
for delete
to authenticated
using (public.is_super_admin());

grant select on public.lexical_entries to anon, authenticated;
grant insert, update, delete on public.lexical_entries to authenticated;

commit;
