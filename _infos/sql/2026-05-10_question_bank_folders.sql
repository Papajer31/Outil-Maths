-- =========================================================
-- Dossiers dédiés aux banques de questions
-- À exécuter dans Supabase SQL Editor.
-- =========================================================

create table if not exists public.question_bank_folders (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  parent_id uuid null references public.question_bank_folders(id) on delete cascade,
  name text not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint question_bank_folders_name_not_blank check (btrim(name) <> ''),
  constraint question_bank_folders_no_self_parent check (parent_id is null or parent_id <> id)
);

alter table public.question_bank_folders enable row level security;

create index if not exists question_bank_folders_teacher_space_idx
  on public.question_bank_folders (teacher_space_id);

create index if not exists question_bank_folders_parent_idx
  on public.question_bank_folders (parent_id);

create index if not exists question_bank_folders_order_idx
  on public.question_bank_folders (teacher_space_id, parent_id, display_order, name);

create unique index if not exists question_bank_folders_sibling_name_unique
  on public.question_bank_folders (
    teacher_space_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(btrim(name))
  );

alter table public.question_banks
  add column if not exists folder_id uuid null;

alter table public.question_banks
  add column if not exists display_order integer;

alter table public.question_banks
  alter column display_order set default 0;

update public.question_banks
set display_order = 0
where display_order is null;

alter table public.question_banks
  alter column display_order set not null;

update public.question_banks
set folder_id = null
where is_system is true;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'question_banks_folder_id_fkey'
      and conrelid = 'public.question_banks'::regclass
  ) then
    alter table public.question_banks
      add constraint question_banks_folder_id_fkey
      foreign key (folder_id)
      references public.question_bank_folders(id)
      on delete set null;
  end if;
end $$;

create index if not exists question_banks_folder_idx
  on public.question_banks (folder_id);

create index if not exists question_banks_folder_order_idx
  on public.question_banks (teacher_space_id, folder_id, display_order, title);

with ranked as (
  select
    id,
    row_number() over (
      partition by teacher_space_id, is_system, folder_id
      order by title asc, created_at asc, id asc
    ) - 1 as next_order
  from public.question_banks
)
update public.question_banks qb
set display_order = ranked.next_order
from ranked
where qb.id = ranked.id;

create or replace function public.validate_question_bank_folder_parent()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  parent_space_id bigint;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Un dossier de banque ne peut pas être son propre parent.';
  end if;

  select qbf.teacher_space_id
    into parent_space_id
  from public.question_bank_folders qbf
  where qbf.id = new.parent_id;

  if parent_space_id is null or parent_space_id <> new.teacher_space_id then
    raise exception 'Le dossier parent ne correspond pas à l’espace enseignant.';
  end if;

  if tg_op = 'UPDATE' then
    if exists (
      with recursive descendants as (
        select child.id, child.parent_id
        from public.question_bank_folders child
        where child.parent_id = new.id

        union all

        select child.id, child.parent_id
        from public.question_bank_folders child
        join descendants d on d.id = child.parent_id
      )
      select 1
      from descendants
      where descendants.id = new.parent_id
    ) then
      raise exception 'Un dossier de banque ne peut pas être déplacé dans l’un de ses sous-dossiers.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_question_bank_folder_parent on public.question_bank_folders;

create trigger trg_validate_question_bank_folder_parent
before insert or update of parent_id, teacher_space_id
on public.question_bank_folders
for each row
execute function public.validate_question_bank_folder_parent();

create or replace function public.validate_question_bank_folder()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  folder_space_id bigint;
begin
  if new.is_system is true then
    new.folder_id := null;
    return new;
  end if;

  if new.folder_id is null then
    return new;
  end if;

  select qbf.teacher_space_id
    into folder_space_id
  from public.question_bank_folders qbf
  where qbf.id = new.folder_id;

  if folder_space_id is null or folder_space_id <> new.teacher_space_id then
    raise exception 'Le dossier de banque ne correspond pas à l’espace enseignant.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_question_bank_folder on public.question_banks;

create trigger trg_validate_question_bank_folder
before insert or update of folder_id, teacher_space_id, is_system
on public.question_banks
for each row
execute function public.validate_question_bank_folder();

drop policy if exists question_bank_folders_select_own on public.question_bank_folders;
drop policy if exists question_bank_folders_insert_own on public.question_bank_folders;
drop policy if exists question_bank_folders_update_own on public.question_bank_folders;
drop policy if exists question_bank_folders_delete_own on public.question_bank_folders;

create policy question_bank_folders_select_own
on public.question_bank_folders
for select
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = question_bank_folders.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_bank_folders_insert_own
on public.question_bank_folders
for insert
to authenticated
with check (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = question_bank_folders.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_bank_folders_update_own
on public.question_bank_folders
for update
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = question_bank_folders.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = question_bank_folders.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_bank_folders_delete_own
on public.question_bank_folders
for delete
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = question_bank_folders.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);
