-- =========================================================
-- 06_RESSOURCES_PERSONNELLES — presets Encodage, listes Conjugaison
-- =========================================================

-- ---------------------------------------------------------
-- Presets personnels de graphèmes / Encodage
-- ---------------------------------------------------------

create table public.teacher_phonology_presets (
  id text primary key,
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  tool_key text not null default 'encodage',
  name text not null,
  graph_order jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_phonology_presets_name_not_blank check (btrim(name) <> ''),
  constraint teacher_phonology_presets_graph_order_is_array check (jsonb_typeof(graph_order) = 'array')
);

create index teacher_phonology_presets_space_tool_idx
on public.teacher_phonology_presets (teacher_space_id, tool_key);

create index teacher_phonology_presets_space_tool_name_idx
on public.teacher_phonology_presets (teacher_space_id, tool_key, name);

drop trigger if exists trg_teacher_phonology_presets_updated_at on public.teacher_phonology_presets;
create trigger trg_teacher_phonology_presets_updated_at
before update on public.teacher_phonology_presets
for each row execute function public.set_updated_at();

alter table public.teacher_phonology_presets enable row level security;

create policy teacher_phonology_presets_select_own
on public.teacher_phonology_presets
for select to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_phonology_presets.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy teacher_phonology_presets_insert_own
on public.teacher_phonology_presets
for insert to authenticated
with check (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_phonology_presets.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy teacher_phonology_presets_update_own
on public.teacher_phonology_presets
for update to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_phonology_presets.teacher_space_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_phonology_presets.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy teacher_phonology_presets_delete_own
on public.teacher_phonology_presets
for delete to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_phonology_presets.teacher_space_id and ts.owner_user_id = auth.uid()));

grant select, insert, update, delete on public.teacher_phonology_presets to authenticated;

-- ---------------------------------------------------------
-- Listes personnelles de verbes / Conjugaison
-- ---------------------------------------------------------

create table public.teacher_conjugation_lists (
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

create unique index teacher_conjugation_lists_space_normalized_name_uidx
on public.teacher_conjugation_lists (teacher_space_id, normalized_name);

create index teacher_conjugation_lists_space_name_idx
on public.teacher_conjugation_lists (teacher_space_id, name);

drop trigger if exists trg_teacher_conjugation_lists_updated_at on public.teacher_conjugation_lists;
create trigger trg_teacher_conjugation_lists_updated_at
before update on public.teacher_conjugation_lists
for each row execute function public.set_updated_at();

alter table public.teacher_conjugation_lists enable row level security;

create policy teacher_conjugation_lists_select_own
on public.teacher_conjugation_lists
for select to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_conjugation_lists.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy teacher_conjugation_lists_insert_own
on public.teacher_conjugation_lists
for insert to authenticated
with check (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_conjugation_lists.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy teacher_conjugation_lists_update_own
on public.teacher_conjugation_lists
for update to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_conjugation_lists.teacher_space_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_conjugation_lists.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy teacher_conjugation_lists_delete_own
on public.teacher_conjugation_lists
for delete to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = teacher_conjugation_lists.teacher_space_id and ts.owner_user_id = auth.uid()));

grant select, insert, update, delete on public.teacher_conjugation_lists to authenticated;

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
