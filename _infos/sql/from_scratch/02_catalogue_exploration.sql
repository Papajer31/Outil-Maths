-- =========================================================
-- 02_CATALOGUE_EXPLORATION — visibilité des activités du Catalogue
-- =========================================================

-- Le Catalogue complet est défini côté code pour l’instant.
-- Cette table ne stocke que les overrides de visibilité par enseignant.
-- Absence de ligne = comportement par défaut = visible.

create table public.catalog_activity_visibility (
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  catalog_activity_id text not null,
  is_visible boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (teacher_space_id, catalog_activity_id),
  constraint catalog_activity_visibility_id_not_blank check (length(trim(catalog_activity_id)) > 0),
  constraint catalog_activity_visibility_id_format check (catalog_activity_id ~ '^[a-z0-9][a-z0-9._-]{1,160}$')
);

create index catalog_activity_visibility_space_visible_idx
on public.catalog_activity_visibility (teacher_space_id, is_visible, catalog_activity_id);

drop trigger if exists trg_catalog_activity_visibility_updated_at on public.catalog_activity_visibility;
create trigger trg_catalog_activity_visibility_updated_at
before update on public.catalog_activity_visibility
for each row execute function public.set_updated_at();

alter table public.catalog_activity_visibility enable row level security;

create policy catalog_activity_visibility_select_own
on public.catalog_activity_visibility
for select to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = catalog_activity_visibility.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy catalog_activity_visibility_insert_own
on public.catalog_activity_visibility
for insert to authenticated
with check (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = catalog_activity_visibility.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy catalog_activity_visibility_update_own
on public.catalog_activity_visibility
for update to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = catalog_activity_visibility.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = catalog_activity_visibility.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy catalog_activity_visibility_delete_own
on public.catalog_activity_visibility
for delete to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = catalog_activity_visibility.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.catalog_activity_visibility to authenticated;

create or replace function public.get_catalog_visibility_for_space(p_access_code text)
returns table (
  catalog_activity_id text,
  is_visible boolean,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select cav.catalog_activity_id, cav.is_visible, cav.updated_at
  from public.teacher_spaces ts
  join public.catalog_activity_visibility cav on cav.teacher_space_id = ts.id
  where ts.access_code = upper(trim(p_access_code))
  order by cav.catalog_activity_id asc;
$$;

grant execute on function public.get_catalog_visibility_for_space(text) to anon, authenticated;
