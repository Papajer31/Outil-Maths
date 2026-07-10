-- =========================================================
-- PATCH 05 — SUPER-ADMIN : SUPPRESSION CATALOGUE + RESSOURCES + BANQUES SYSTÈME
-- À exécuter dans Supabase v2 APRÈS 04_student_progression_exploration.sql.
-- =========================================================

begin;

grant usage on schema public to anon, authenticated;

-- ---------------------------------------------------------
-- 1) Suppression définitive d’une activité Catalogue
-- ---------------------------------------------------------

create or replace function public.get_catalog_activity_usage_as_admin(p_activity_id text)
returns table (
  catalog_activity_id text,
  mission_steps_count integer,
  missions_count integer,
  progress_count integer,
  sessions_count integer,
  visibility_count integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_activity_id text := btrim(coalesce(p_activity_id, ''));
begin
  if not public.is_super_admin() then
    raise exception 'not allowed';
  end if;

  return query
  select
    v_activity_id as catalog_activity_id,
    (select count(*)::integer from public.mission_steps ms where ms.catalog_activity_id = v_activity_id) as mission_steps_count,
    (select count(distinct ms.mission_id)::integer from public.mission_steps ms where ms.catalog_activity_id = v_activity_id) as missions_count,
    (select count(*)::integer from public.student_activity_progress sap where sap.catalog_activity_id = v_activity_id) as progress_count,
    (select count(*)::integer from public.student_activity_sessions sas where sas.catalog_activity_id = v_activity_id) as sessions_count,
    (select count(*)::integer from public.catalog_activity_visibility cav where cav.catalog_activity_id = v_activity_id) as visibility_count;
end;
$$;

grant execute on function public.get_catalog_activity_usage_as_admin(text) to authenticated;

create or replace function public.delete_catalog_activity_cascade(p_activity_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_activity_id text := btrim(coalesce(p_activity_id, ''));
begin
  if not public.is_super_admin() then
    raise exception 'not allowed';
  end if;

  if v_activity_id = '' then
    raise exception 'activity id is required';
  end if;

  delete from public.student_activity_sessions where catalog_activity_id = v_activity_id;
  delete from public.student_activity_progress where catalog_activity_id = v_activity_id;

  -- Anciennes tables éventuelles conservées par le schéma initial.
  if to_regclass('public.student_catalog_activity_attempts') is not null then
    execute 'delete from public.student_catalog_activity_attempts where catalog_activity_id = $1' using v_activity_id;
  end if;
  if to_regclass('public.student_catalog_activity_levels') is not null then
    execute 'delete from public.student_catalog_activity_levels where catalog_activity_id = $1' using v_activity_id;
  end if;

  delete from public.catalog_activity_visibility where catalog_activity_id = v_activity_id;
  delete from public.mission_steps where catalog_activity_id = v_activity_id;
  delete from public.catalog_activities where id = v_activity_id;
end;
$$;

grant execute on function public.delete_catalog_activity_cascade(text) to authenticated;

-- ---------------------------------------------------------
-- 2) RLS super-admin sur les ressources système
-- ---------------------------------------------------------

-- image_assets
alter table public.image_assets enable row level security;

drop policy if exists image_assets_admin_insert on public.image_assets;
create policy image_assets_admin_insert
on public.image_assets
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists image_assets_admin_update on public.image_assets;
create policy image_assets_admin_update
on public.image_assets
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists image_assets_admin_delete on public.image_assets;
create policy image_assets_admin_delete
on public.image_assets
for delete
to authenticated
using (public.is_super_admin());

grant insert, update, delete on public.image_assets to authenticated;

-- phonology_words
alter table public.phonology_words enable row level security;

drop policy if exists phonology_words_admin_insert on public.phonology_words;
create policy phonology_words_admin_insert
on public.phonology_words
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists phonology_words_admin_update on public.phonology_words;
create policy phonology_words_admin_update
on public.phonology_words
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists phonology_words_admin_delete on public.phonology_words;
create policy phonology_words_admin_delete
on public.phonology_words
for delete
to authenticated
using (public.is_super_admin());

grant insert, update, delete on public.phonology_words to authenticated;

-- vocabulary_default_words
alter table public.vocabulary_default_words enable row level security;

drop policy if exists vocabulary_default_words_admin_insert on public.vocabulary_default_words;
create policy vocabulary_default_words_admin_insert
on public.vocabulary_default_words
for insert
to authenticated
with check (public.is_super_admin());

drop policy if exists vocabulary_default_words_admin_update on public.vocabulary_default_words;
create policy vocabulary_default_words_admin_update
on public.vocabulary_default_words
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

drop policy if exists vocabulary_default_words_admin_delete on public.vocabulary_default_words;
create policy vocabulary_default_words_admin_delete
on public.vocabulary_default_words
for delete
to authenticated
using (public.is_super_admin());

grant insert, update, delete on public.vocabulary_default_words to authenticated;

grant usage, select on sequence public.vocabulary_default_words_id_seq to authenticated;

-- ---------------------------------------------------------
-- 3) Banques système : écriture super-admin
-- ---------------------------------------------------------

drop policy if exists question_banks_insert_admin_system on public.question_banks;
create policy question_banks_insert_admin_system
on public.question_banks
for insert
to authenticated
with check (is_system = true and teacher_space_id is null and public.is_super_admin());

drop policy if exists question_banks_update_admin_system on public.question_banks;
create policy question_banks_update_admin_system
on public.question_banks
for update
to authenticated
using (is_system = true and public.is_super_admin())
with check (is_system = true and teacher_space_id is null and public.is_super_admin());

drop policy if exists question_banks_delete_admin_system on public.question_banks;
create policy question_banks_delete_admin_system
on public.question_banks
for delete
to authenticated
using (is_system = true and public.is_super_admin());

drop policy if exists question_bank_items_insert_admin_system on public.question_bank_items;
create policy question_bank_items_insert_admin_system
on public.question_bank_items
for insert
to authenticated
with check (
  public.is_super_admin()
  and exists (
    select 1 from public.question_banks qb
    where qb.id = question_bank_items.bank_id
      and qb.is_system = true
  )
);

drop policy if exists question_bank_items_update_admin_system on public.question_bank_items;
create policy question_bank_items_update_admin_system
on public.question_bank_items
for update
to authenticated
using (
  public.is_super_admin()
  and exists (
    select 1 from public.question_banks qb
    where qb.id = question_bank_items.bank_id
      and qb.is_system = true
  )
)
with check (
  public.is_super_admin()
  and exists (
    select 1 from public.question_banks qb
    where qb.id = question_bank_items.bank_id
      and qb.is_system = true
  )
);

drop policy if exists question_bank_items_delete_admin_system on public.question_bank_items;
create policy question_bank_items_delete_admin_system
on public.question_bank_items
for delete
to authenticated
using (
  public.is_super_admin()
  and exists (
    select 1 from public.question_banks qb
    where qb.id = question_bank_items.bank_id
      and qb.is_system = true
  )
);

commit;
