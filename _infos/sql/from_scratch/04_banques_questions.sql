-- =========================================================
-- 04_BANQUES_QUESTIONS — banques typées + dossiers
-- =========================================================

grant usage on schema public to anon, authenticated;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- Banques
-- ---------------------------------------------------------

create table public.question_banks (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint null references public.teacher_spaces(id) on delete cascade,
  source_bank_id uuid null references public.question_banks(id) on delete set null,
  bank_type text not null default 'text_answer',
  title text not null,
  title_normalized text not null,
  description text not null default '',
  subject text not null default '',
  grade_level text not null default '',
  tags text[] not null default '{}',
  is_system boolean not null default false,
  share_code text null unique,
  folder_id uuid null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint question_banks_type_format check (bank_type ~ '^[a-z0-9_\-]{2,64}$'),
  constraint question_banks_title_not_blank check (length(trim(title)) > 0),
  constraint question_banks_title_norm_not_blank check (length(trim(title_normalized)) > 0),
  constraint question_banks_owner_or_system check (
    (is_system = true and teacher_space_id is null)
    or
    (is_system = false and teacher_space_id is not null)
  ),
  constraint question_banks_share_code_format check (
    share_code is null or share_code ~ '^[A-Z0-9]{4,16}$'
  )
);

create index question_banks_teacher_space_idx
on public.question_banks (teacher_space_id, bank_type, title_normalized);

create index question_banks_system_idx
on public.question_banks (is_system, bank_type, title_normalized);

create unique index question_banks_teacher_title_unique
on public.question_banks (teacher_space_id, title_normalized)
where is_system = false;

-- ---------------------------------------------------------
-- Dossiers de banques personnelles
-- ---------------------------------------------------------

create table public.question_bank_folders (
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

alter table public.question_banks
add constraint question_banks_folder_id_fkey
foreign key (folder_id)
references public.question_bank_folders(id)
on delete set null;

create index question_bank_folders_teacher_space_idx
on public.question_bank_folders (teacher_space_id);

create index question_bank_folders_parent_idx
on public.question_bank_folders (parent_id);

create index question_bank_folders_order_idx
on public.question_bank_folders (teacher_space_id, parent_id, display_order, name);

create unique index question_bank_folders_sibling_name_unique
on public.question_bank_folders (
  teacher_space_id,
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

create index question_banks_folder_idx
on public.question_banks (folder_id);

create index question_banks_folder_order_idx
on public.question_banks (teacher_space_id, folder_id, display_order, title);

-- ---------------------------------------------------------
-- Items
-- ---------------------------------------------------------

create table public.question_bank_items (
  id uuid primary key default gen_random_uuid(),
  bank_id uuid not null references public.question_banks(id) on delete cascade,
  item_type text not null default 'text_answer',
  prompt text not null default '',
  payload_json jsonb not null default '{}'::jsonb,
  position integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint question_bank_items_type_format check (item_type ~ '^[a-z0-9_\-]{2,64}$'),
  constraint question_bank_items_position_nonnegative check (position >= 0),
  constraint question_bank_items_payload_object check (jsonb_typeof(payload_json) = 'object')
);

create index question_bank_items_bank_position_idx
on public.question_bank_items (bank_id, position, created_at);

-- ---------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------

drop trigger if exists trg_question_banks_updated_at on public.question_banks;
create trigger trg_question_banks_updated_at
before update on public.question_banks
for each row execute function public.set_updated_at();

drop trigger if exists trg_question_bank_items_updated_at on public.question_bank_items;
create trigger trg_question_bank_items_updated_at
before update on public.question_bank_items
for each row execute function public.set_updated_at();

drop trigger if exists trg_question_bank_folders_updated_at on public.question_bank_folders;
create trigger trg_question_bank_folders_updated_at
before update on public.question_bank_folders
for each row execute function public.set_updated_at();

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

  select qbf.teacher_space_id into parent_space_id
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
      select 1 from descendants where descendants.id = new.parent_id
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
for each row execute function public.validate_question_bank_folder_parent();

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

  select qbf.teacher_space_id into folder_space_id
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
for each row execute function public.validate_question_bank_folder();

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------

alter table public.question_banks enable row level security;
alter table public.question_bank_items enable row level security;
alter table public.question_bank_folders enable row level security;

create policy question_banks_select_policy
on public.question_banks
for select to authenticated
using (
  is_system = true
  or exists (
    select 1 from public.teacher_spaces ts
    where ts.id = question_banks.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_banks_insert_policy
on public.question_banks
for insert to authenticated
with check (
  is_system = false
  and exists (
    select 1 from public.teacher_spaces ts
    where ts.id = question_banks.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_banks_update_policy
on public.question_banks
for update to authenticated
using (
  is_system = false
  and exists (
    select 1 from public.teacher_spaces ts
    where ts.id = question_banks.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  is_system = false
  and exists (
    select 1 from public.teacher_spaces ts
    where ts.id = question_banks.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_banks_delete_policy
on public.question_banks
for delete to authenticated
using (
  is_system = false
  and exists (
    select 1 from public.teacher_spaces ts
    where ts.id = question_banks.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_bank_items_select_policy
on public.question_bank_items
for select to authenticated
using (
  exists (
    select 1 from public.question_banks qb
    where qb.id = question_bank_items.bank_id
      and (
        qb.is_system = true
        or exists (
          select 1 from public.teacher_spaces ts
          where ts.id = qb.teacher_space_id
            and ts.owner_user_id = auth.uid()
        )
      )
  )
);

create policy question_bank_items_insert_policy
on public.question_bank_items
for insert to authenticated
with check (
  exists (
    select 1
    from public.question_banks qb
    join public.teacher_spaces ts on ts.id = qb.teacher_space_id
    where qb.id = question_bank_items.bank_id
      and qb.is_system = false
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_bank_items_update_policy
on public.question_bank_items
for update to authenticated
using (
  exists (
    select 1
    from public.question_banks qb
    join public.teacher_spaces ts on ts.id = qb.teacher_space_id
    where qb.id = question_bank_items.bank_id
      and qb.is_system = false
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.question_banks qb
    join public.teacher_spaces ts on ts.id = qb.teacher_space_id
    where qb.id = question_bank_items.bank_id
      and qb.is_system = false
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_bank_items_delete_policy
on public.question_bank_items
for delete to authenticated
using (
  exists (
    select 1
    from public.question_banks qb
    join public.teacher_spaces ts on ts.id = qb.teacher_space_id
    where qb.id = question_bank_items.bank_id
      and qb.is_system = false
      and ts.owner_user_id = auth.uid()
  )
);

create policy question_bank_folders_select_own
on public.question_bank_folders
for select to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = question_bank_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy question_bank_folders_insert_own
on public.question_bank_folders
for insert to authenticated
with check (exists (select 1 from public.teacher_spaces ts where ts.id = question_bank_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy question_bank_folders_update_own
on public.question_bank_folders
for update to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = question_bank_folders.teacher_space_id and ts.owner_user_id = auth.uid()))
with check (exists (select 1 from public.teacher_spaces ts where ts.id = question_bank_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

create policy question_bank_folders_delete_own
on public.question_bank_folders
for delete to authenticated
using (exists (select 1 from public.teacher_spaces ts where ts.id = question_bank_folders.teacher_space_id and ts.owner_user_id = auth.uid()));

grant select, insert, update, delete on public.question_banks to authenticated;
grant select, insert, update, delete on public.question_bank_items to authenticated;
grant select, insert, update, delete on public.question_bank_folders to authenticated;

-- ---------------------------------------------------------
-- RPC
-- ---------------------------------------------------------

create or replace function public.replace_question_bank_items(
  p_bank_id uuid,
  p_items jsonb default '[]'::jsonb
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_bank_id is null then
    raise exception 'bank_id is required';
  end if;

  if p_items is null then
    p_items := '[]'::jsonb;
  end if;

  if jsonb_typeof(p_items) <> 'array' then
    raise exception 'items must be a JSON array';
  end if;

  delete from public.question_bank_items
  where bank_id = p_bank_id;

  insert into public.question_bank_items (
    bank_id,
    item_type,
    prompt,
    payload_json,
    position,
    is_active,
    updated_at
  )
  select
    p_bank_id,
    coalesce(nullif(trim(item->>'item_type'), ''), 'text_answer'),
    coalesce(item->>'prompt', ''),
    case
      when jsonb_typeof(item->'payload_json') = 'object' then item->'payload_json'
      else '{}'::jsonb
    end,
    greatest(0, coalesce(nullif(item->>'position', '')::integer, ordinality - 1)),
    coalesce(nullif(item->>'is_active', '')::boolean, true),
    now()
  from jsonb_array_elements(p_items) with ordinality as source(item, ordinality);
end;
$$;

grant execute on function public.replace_question_bank_items(uuid, jsonb) to authenticated;

create or replace function public.get_question_bank_items_for_space(
  p_access_code text,
  p_bank_id uuid
)
returns table (
  id uuid,
  bank_id uuid,
  item_type text,
  prompt text,
  payload_json jsonb,
  "position" integer,
  is_active boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    qbi.id,
    qbi.bank_id,
    qbi.item_type,
    qbi.prompt,
    qbi.payload_json,
    qbi.position as "position",
    qbi.is_active
  from public.question_bank_items qbi
  join public.question_banks qb on qb.id = qbi.bank_id
  join public.teacher_spaces ts on ts.access_code = upper(trim(p_access_code))
  where qbi.bank_id = p_bank_id
    and qbi.is_active = true
    and (
      qb.is_system = true
      or qb.teacher_space_id = ts.id
    )
  order by qbi.position asc, qbi.created_at asc;
$$;

grant execute on function public.get_question_bank_items_for_space(text, uuid) to anon, authenticated;
