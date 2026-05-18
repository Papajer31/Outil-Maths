-- Listes personnelles de verbes pour l’outil Conjugaison.
-- À exécuter dans Supabase après les tables teacher_spaces et activity_configs.

create table if not exists public.teacher_conjugation_lists (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  verbs_json jsonb not null default '{"infinitives": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teacher_conjugation_lists_name_not_empty check (btrim(name) <> ''),
  constraint teacher_conjugation_lists_normalized_name_not_empty check (btrim(normalized_name) <> ''),
  constraint teacher_conjugation_lists_verbs_object check (jsonb_typeof(verbs_json) = 'object'),
  constraint teacher_conjugation_lists_infinitives_array check (
    verbs_json ? 'infinitives'
    and jsonb_typeof(verbs_json -> 'infinitives') = 'array'
  )
);

create unique index if not exists teacher_conjugation_lists_space_normalized_name_uidx
  on public.teacher_conjugation_lists(teacher_space_id, normalized_name);

create index if not exists teacher_conjugation_lists_space_name_idx
  on public.teacher_conjugation_lists(teacher_space_id, name);

create or replace function public.set_teacher_conjugation_lists_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_teacher_conjugation_lists_updated_at on public.teacher_conjugation_lists;
create trigger trg_teacher_conjugation_lists_updated_at
before update on public.teacher_conjugation_lists
for each row
execute function public.set_teacher_conjugation_lists_updated_at();

alter table public.teacher_conjugation_lists enable row level security;

drop policy if exists teacher_conjugation_lists_select_own on public.teacher_conjugation_lists;
create policy teacher_conjugation_lists_select_own
on public.teacher_conjugation_lists
for select
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_conjugation_lists.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

drop policy if exists teacher_conjugation_lists_insert_own on public.teacher_conjugation_lists;
create policy teacher_conjugation_lists_insert_own
on public.teacher_conjugation_lists
for insert
to authenticated
with check (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_conjugation_lists.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

drop policy if exists teacher_conjugation_lists_update_own on public.teacher_conjugation_lists;
create policy teacher_conjugation_lists_update_own
on public.teacher_conjugation_lists
for update
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_conjugation_lists.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_conjugation_lists.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

drop policy if exists teacher_conjugation_lists_delete_own on public.teacher_conjugation_lists;
create policy teacher_conjugation_lists_delete_own
on public.teacher_conjugation_lists
for delete
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_conjugation_lists.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

-- RPC publique contrôlée : permet au runtime élève de résoudre une liste personnelle
-- uniquement si elle appartient à l’espace dont le code d’accès charge l’activité.
create or replace function public.get_conjugation_personal_list(
  p_access_code text,
  p_list_id uuid
)
returns table (
  id uuid,
  name text,
  verbs_json jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select l.id, l.name, l.verbs_json
  from public.teacher_conjugation_lists l
  join public.teacher_spaces ts on ts.id = l.teacher_space_id
  where ts.access_code = upper(regexp_replace(coalesce(p_access_code, ''), '[^A-Za-z]', '', 'g'))
    and l.id = p_list_id
  limit 1;
$$;

grant execute on function public.get_conjugation_personal_list(text, uuid) to anon, authenticated;
