-- =========================================================
-- PATCH 03 — MINI SUPER-ADMIN + CATALOGUE SYSTÈME EN BASE
-- À exécuter dans le projet Supabase v2 APRÈS 01_first_request.sql.
-- =========================================================

begin;

grant usage on schema public to anon, authenticated;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------
-- 1) Super-admins
-- ---------------------------------------------------------

create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'super_admin',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint app_admins_role_check check (role in ('super_admin'))
);

alter table public.app_admins enable row level security;

drop trigger if exists trg_app_admins_updated_at on public.app_admins;
create trigger trg_app_admins_updated_at
before update on public.app_admins
for each row execute function public.set_updated_at();

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_admins aa
    where aa.user_id = auth.uid()
      and aa.role = 'super_admin'
  );
$$;

drop policy if exists app_admins_select_self on public.app_admins;
create policy app_admins_select_self
on public.app_admins
for select
to authenticated
using (user_id = auth.uid());

grant select on public.app_admins to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- À faire une seule fois après création du compte Jérémy dans Auth > Users :
-- Remplacer l’UUID ci-dessous par l’id du compte Auth.
-- insert into public.app_admins (user_id, role, notes)
-- values ('00000000-0000-0000-0000-000000000000', 'super_admin', 'Jérémy')
-- on conflict (user_id) do update set role = excluded.role, notes = excluded.notes, updated_at = now();

-- ---------------------------------------------------------
-- 2) Activités système du Catalogue
-- ---------------------------------------------------------

create table if not exists public.catalog_activities (
  id text primary key,
  category_id text not null,
  tool_id text not null,
  title text not null,
  description text not null default '',
  display_order integer not null default 0,
  status text not null default 'draft',
  default_visible boolean not null default true,
  levels_json jsonb not null default '{"1":{"settings":{}},"2":{"settings":{}},"3":{"settings":{}},"4":{"settings":{}},"5":{"settings":{}}}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint catalog_activities_id_format check (id ~ '^[a-z0-9][a-z0-9._-]{1,160}$'),
  constraint catalog_activities_category_not_blank check (btrim(category_id) <> ''),
  constraint catalog_activities_tool_not_blank check (btrim(tool_id) <> ''),
  constraint catalog_activities_title_not_blank check (btrim(title) <> ''),
  constraint catalog_activities_display_order_nonnegative check (display_order >= 0),
  constraint catalog_activities_status_check check (status in ('draft', 'published', 'archived')),
  constraint catalog_activities_levels_object check (jsonb_typeof(levels_json) = 'object')
);

create index if not exists catalog_activities_status_category_idx
on public.catalog_activities (status, category_id, display_order, title);

create index if not exists catalog_activities_tool_idx
on public.catalog_activities (tool_id);

drop trigger if exists trg_catalog_activities_updated_at on public.catalog_activities;
create trigger trg_catalog_activities_updated_at
before update on public.catalog_activities
for each row execute function public.set_updated_at();

alter table public.catalog_activities enable row level security;

-- Les élèves / enseignants lisent seulement les activités publiées.
-- Le super-admin lit tout.
drop policy if exists catalog_activities_select_public_or_admin on public.catalog_activities;
create policy catalog_activities_select_public_or_admin
on public.catalog_activities
for select
to anon, authenticated
using (
  status = 'published'
  or public.is_super_admin()
);

-- Le super-admin seul crée / modifie / archive.
drop policy if exists catalog_activities_insert_admin on public.catalog_activities;
create policy catalog_activities_insert_admin
on public.catalog_activities
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists catalog_activities_update_admin on public.catalog_activities;
create policy catalog_activities_update_admin
on public.catalog_activities
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists catalog_activities_delete_admin on public.catalog_activities;
create policy catalog_activities_delete_admin
on public.catalog_activities
for delete
to authenticated
using (public.is_super_admin());

grant select on public.catalog_activities to anon, authenticated;
grant insert, update, delete on public.catalog_activities to authenticated;

commit;
