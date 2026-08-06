-- =========================================================
-- PATCH 19 — MENUS HEBDOMADAIRES DU MODE AVENTURE
-- À exécuter APRÈS 17_catalog_activity_tiers.sql.
--
-- Objectif :
-- - définir 34 menus système par niveau ;
-- - stocker 4 jours × 6 emplacements obligatoires par menu ;
-- - autoriser une case à cibler soit un OdApp, soit une activité précise ;
-- - réserver l'édition des menus système au super-admin ;
-- - permettre à chaque espace enseignant d'enregistrer des exceptions locales.
-- =========================================================

begin;

create table if not exists public.adventure_default_menu_slots (
  grade_level text not null,
  menu_number smallint not null,
  day_number smallint not null,
  slot_number smallint not null,
  item_type text not null,
  grade_folder_id text null
    references public.pedagogical_nodes(id)
    on update cascade
    on delete cascade,
  catalog_activity_id text null
    references public.catalog_activities(id)
    on update cascade
    on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (grade_level, menu_number, day_number, slot_number),

  constraint adventure_default_menu_grade_check
    check (grade_level in ('CP', 'CE1', 'CE2', 'CM1', 'CM2')),
  constraint adventure_default_menu_number_check
    check (menu_number between 1 and 34),
  constraint adventure_default_menu_day_check
    check (day_number between 1 and 4),
  constraint adventure_default_menu_slot_check
    check (slot_number between 1 and 6),
  constraint adventure_default_menu_item_type_check
    check (item_type in ('objective', 'activity')),
  constraint adventure_default_menu_target_check
    check (
      (item_type = 'objective' and grade_folder_id is not null and catalog_activity_id is null)
      or
      (item_type = 'activity' and grade_folder_id is null and catalog_activity_id is not null)
    )
);

create index if not exists adventure_default_menu_grade_menu_idx
on public.adventure_default_menu_slots
  (grade_level, menu_number, day_number, slot_number);

create table if not exists public.teacher_adventure_menu_slots (
  teacher_space_id bigint not null
    references public.teacher_spaces(id)
    on delete cascade,
  grade_level text not null,
  menu_number smallint not null,
  day_number smallint not null,
  slot_number smallint not null,
  item_type text not null,
  grade_folder_id text null
    references public.pedagogical_nodes(id)
    on update cascade
    on delete cascade,
  catalog_activity_id text null
    references public.catalog_activities(id)
    on update cascade
    on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (teacher_space_id, grade_level, menu_number, day_number, slot_number),

  constraint teacher_adventure_menu_grade_check
    check (grade_level in ('CP', 'CE1', 'CE2', 'CM1', 'CM2')),
  constraint teacher_adventure_menu_number_check
    check (menu_number between 1 and 34),
  constraint teacher_adventure_menu_day_check
    check (day_number between 1 and 4),
  constraint teacher_adventure_menu_slot_check
    check (slot_number between 1 and 6),
  constraint teacher_adventure_menu_item_type_check
    check (item_type in ('objective', 'activity', 'empty')),
  constraint teacher_adventure_menu_target_check
    check (
      (item_type = 'objective' and grade_folder_id is not null and catalog_activity_id is null)
      or
      (item_type = 'activity' and grade_folder_id is null and catalog_activity_id is not null)
      or
      (item_type = 'empty' and grade_folder_id is null and catalog_activity_id is null)
    )
);

create index if not exists teacher_adventure_menu_space_grade_menu_idx
on public.teacher_adventure_menu_slots
  (teacher_space_id, grade_level, menu_number, day_number, slot_number);

create or replace function public.validate_adventure_menu_slot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  folder_type text;
  folder_grade text;
  activity_grade text;
begin
  if new.item_type = 'empty' then
    return new;
  end if;

  if new.item_type = 'objective' then
    select node_type, name
      into folder_type, folder_grade
    from public.pedagogical_nodes
    where id = new.grade_folder_id;

    if folder_type is null then
      raise exception 'Objectif Aventure % introuvable.', new.grade_folder_id;
    end if;
    if folder_type <> 'grade_level' then
      raise exception 'Une case Objectif doit cibler un dossier de niveau, pas un nœud de type %.', folder_type;
    end if;
    if folder_grade <> new.grade_level then
      raise exception 'Le dossier % appartient au niveau %, pas au niveau %.', new.grade_folder_id, folder_grade, new.grade_level;
    end if;
    return new;
  end if;

  select pn.name
    into activity_grade
  from public.catalog_activities ca
  join public.pedagogical_nodes pn on pn.id = ca.pedagogical_node_id
  where ca.id = new.catalog_activity_id
    and pn.node_type = 'grade_level';

  if activity_grade is null then
    raise exception 'Activité Aventure % introuvable ou mal classée.', new.catalog_activity_id;
  end if;
  if activity_grade <> new.grade_level then
    raise exception 'L''activité % appartient au niveau %, pas au niveau %.', new.catalog_activity_id, activity_grade, new.grade_level;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_adventure_default_menu_slot
on public.adventure_default_menu_slots;
create trigger trg_validate_adventure_default_menu_slot
before insert or update
on public.adventure_default_menu_slots
for each row execute function public.validate_adventure_menu_slot();

drop trigger if exists trg_validate_teacher_adventure_menu_slot
on public.teacher_adventure_menu_slots;
create trigger trg_validate_teacher_adventure_menu_slot
before insert or update
on public.teacher_adventure_menu_slots
for each row execute function public.validate_adventure_menu_slot();

drop trigger if exists trg_adventure_default_menu_slots_updated_at
on public.adventure_default_menu_slots;
create trigger trg_adventure_default_menu_slots_updated_at
before update on public.adventure_default_menu_slots
for each row execute function public.set_updated_at();

drop trigger if exists trg_teacher_adventure_menu_slots_updated_at
on public.teacher_adventure_menu_slots;
create trigger trg_teacher_adventure_menu_slots_updated_at
before update on public.teacher_adventure_menu_slots
for each row execute function public.set_updated_at();

alter table public.adventure_default_menu_slots enable row level security;
alter table public.teacher_adventure_menu_slots enable row level security;

drop policy if exists adventure_default_menu_slots_select_authenticated
on public.adventure_default_menu_slots;
drop policy if exists adventure_default_menu_slots_insert_admin
on public.adventure_default_menu_slots;
drop policy if exists adventure_default_menu_slots_update_admin
on public.adventure_default_menu_slots;
drop policy if exists adventure_default_menu_slots_delete_admin
on public.adventure_default_menu_slots;

create policy adventure_default_menu_slots_select_authenticated
on public.adventure_default_menu_slots
for select
to authenticated
using (true);

create policy adventure_default_menu_slots_insert_admin
on public.adventure_default_menu_slots
for insert
to authenticated
with check (public.is_super_admin());

create policy adventure_default_menu_slots_update_admin
on public.adventure_default_menu_slots
for update
to authenticated
using (public.is_super_admin())
with check (public.is_super_admin());

create policy adventure_default_menu_slots_delete_admin
on public.adventure_default_menu_slots
for delete
to authenticated
using (public.is_super_admin());

drop policy if exists teacher_adventure_menu_slots_select_own
on public.teacher_adventure_menu_slots;
drop policy if exists teacher_adventure_menu_slots_insert_own
on public.teacher_adventure_menu_slots;
drop policy if exists teacher_adventure_menu_slots_update_own
on public.teacher_adventure_menu_slots;
drop policy if exists teacher_adventure_menu_slots_delete_own
on public.teacher_adventure_menu_slots;

create policy teacher_adventure_menu_slots_select_own
on public.teacher_adventure_menu_slots
for select
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_adventure_menu_slots.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy teacher_adventure_menu_slots_insert_own
on public.teacher_adventure_menu_slots
for insert
to authenticated
with check (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_adventure_menu_slots.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy teacher_adventure_menu_slots_update_own
on public.teacher_adventure_menu_slots
for update
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_adventure_menu_slots.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_adventure_menu_slots.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy teacher_adventure_menu_slots_delete_own
on public.teacher_adventure_menu_slots
for delete
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_adventure_menu_slots.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create or replace function public.replace_adventure_default_menu(
  p_grade_level text,
  p_slots jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Accès réservé au super-admin.';
  end if;

  if p_grade_level not in ('CP', 'CE1', 'CE2', 'CM1', 'CM2') then
    raise exception 'Niveau Aventure invalide : %.', p_grade_level;
  end if;

  if jsonb_typeof(coalesce(p_slots, '[]'::jsonb)) <> 'array' then
    raise exception 'La liste des cases Aventure doit être un tableau JSON.';
  end if;

  delete from public.adventure_default_menu_slots
  where grade_level = p_grade_level;

  insert into public.adventure_default_menu_slots (
    grade_level,
    menu_number,
    day_number,
    slot_number,
    item_type,
    grade_folder_id,
    catalog_activity_id
  )
  select
    p_grade_level,
    item.menu_number,
    item.day_number,
    item.slot_number,
    item.item_type,
    nullif(item.grade_folder_id, ''),
    nullif(item.catalog_activity_id, '')
  from jsonb_to_recordset(coalesce(p_slots, '[]'::jsonb)) as item(
    menu_number integer,
    day_number integer,
    slot_number integer,
    item_type text,
    grade_folder_id text,
    catalog_activity_id text
  );
end;
$$;

grant select, insert, update, delete
on public.adventure_default_menu_slots
to authenticated;

grant select, insert, update, delete
on public.teacher_adventure_menu_slots
to authenticated;

grant execute
on function public.replace_adventure_default_menu(text, jsonb)
to authenticated;

commit;
