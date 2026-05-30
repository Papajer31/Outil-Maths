-- =========================================================
-- 01_CORE — espaces enseignants, classes, élèves, code élève
-- =========================================================

grant usage on schema public to anon, authenticated;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------
-- Fonction générique updated_at
-- ---------------------------------------------------------

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
-- Espaces enseignants
-- ---------------------------------------------------------

create table public.teacher_spaces (
  id bigint generated always as identity primary key,
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  access_code text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_opened_at timestamptz null,

  constraint teacher_spaces_owner_unique unique (owner_user_id),
  constraint teacher_spaces_access_code_unique unique (access_code),
  constraint teacher_spaces_access_code_format check (access_code ~ '^[A-Z]{3,12}$')
);

create index teacher_spaces_owner_last_opened_idx
on public.teacher_spaces (owner_user_id, last_opened_at desc);

drop trigger if exists trg_teacher_spaces_updated_at on public.teacher_spaces;
create trigger trg_teacher_spaces_updated_at
before update on public.teacher_spaces
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Classes
-- ---------------------------------------------------------

create table public.teacher_classes (
  id bigint generated always as identity primary key,
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  name text not null,
  display_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint teacher_classes_name_not_blank check (length(trim(name)) > 0),
  constraint teacher_classes_unique_name_per_space unique (teacher_space_id, name)
);

create index teacher_classes_space_id_idx
on public.teacher_classes (teacher_space_id);

create index teacher_classes_space_order_idx
on public.teacher_classes (teacher_space_id, display_order, id);

drop trigger if exists trg_teacher_classes_updated_at on public.teacher_classes;
create trigger trg_teacher_classes_updated_at
before update on public.teacher_classes
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Élèves + code élève
-- ---------------------------------------------------------

create or replace function public.random_student_code()
returns text
language plpgsql
volatile
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
begin
  for i in 1..3 loop
    result := result || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return result;
end;
$$;

create table public.students (
  id bigint generated always as identity primary key,
  teacher_class_id bigint not null references public.teacher_classes(id) on delete cascade,
  first_name text not null,
  grade_level text null,
  student_code text null,
  display_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint students_first_name_not_blank check (length(trim(first_name)) > 0),
  constraint students_grade_level_check check (
    grade_level is null or grade_level in ('CP', 'CE1', 'CE2', 'CM1', 'CM2')
  ),
  constraint students_student_code_format check (
    student_code is null or student_code ~ '^[A-HJ-NP-Z2-9]{3}$'
  )
);

create unique index students_unique_first_name_per_class
on public.students (teacher_class_id, lower(trim(first_name)));

create unique index students_unique_code_per_class
on public.students (teacher_class_id, student_code)
where student_code is not null;

create index students_teacher_class_id_idx
on public.students (teacher_class_id);

create index students_teacher_class_order_idx
on public.students (teacher_class_id, display_order, id);

create or replace function public.set_student_code()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  tries int := 0;
begin
  new.student_code := upper(regexp_replace(coalesce(new.student_code, ''), '[^A-Za-z0-9]', '', 'g'));

  if new.student_code = '' then
    loop
      tries := tries + 1;
      candidate := public.random_student_code();

      exit when not exists (
        select 1
        from public.students s
        where s.teacher_class_id = new.teacher_class_id
          and s.student_code = candidate
          and (tg_op = 'INSERT' or s.id <> new.id)
      );

      if tries > 30 then
        raise exception 'Impossible de générer un code élève unique.';
      end if;
    end loop;

    new.student_code := candidate;
  end if;

  if new.student_code !~ '^[A-HJ-NP-Z2-9]{3}$' then
    raise exception 'Code élève invalide. Utiliser 3 caractères lisibles, sans 0/O/1/I.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_students_student_code on public.students;
create trigger trg_students_student_code
before insert or update of student_code, teacher_class_id
on public.students
for each row execute function public.set_student_code();

drop trigger if exists trg_students_updated_at on public.students;
create trigger trg_students_updated_at
before update on public.students
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------

alter table public.teacher_spaces enable row level security;
alter table public.teacher_classes enable row level security;
alter table public.students enable row level security;

create policy teacher_spaces_select_own on public.teacher_spaces
for select to authenticated
using (auth.uid() = owner_user_id);

create policy teacher_spaces_insert_own on public.teacher_spaces
for insert to authenticated
with check (auth.uid() = owner_user_id);

create policy teacher_spaces_update_own on public.teacher_spaces
for update to authenticated
using (auth.uid() = owner_user_id)
with check (auth.uid() = owner_user_id);

create policy teacher_spaces_delete_own on public.teacher_spaces
for delete to authenticated
using (auth.uid() = owner_user_id);

create policy teacher_classes_select_own on public.teacher_classes
for select to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = teacher_classes.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy teacher_classes_insert_own on public.teacher_classes
for insert to authenticated
with check (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = teacher_classes.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy teacher_classes_update_own on public.teacher_classes
for update to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = teacher_classes.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = teacher_classes.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy teacher_classes_delete_own on public.teacher_classes
for delete to authenticated
using (
  exists (
    select 1 from public.teacher_spaces ts
    where ts.id = teacher_classes.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy students_select_own on public.students
for select to authenticated
using (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = students.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy students_insert_own on public.students
for insert to authenticated
with check (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = students.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy students_update_own on public.students
for update to authenticated
using (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = students.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = students.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy students_delete_own on public.students
for delete to authenticated
using (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = students.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- Grants
-- ---------------------------------------------------------

grant select, insert, update, delete on public.teacher_spaces to authenticated;
grant select, insert, update, delete on public.teacher_classes to authenticated;
grant select, insert, update, delete on public.students to authenticated;

-- ---------------------------------------------------------
-- RPC publiques élèves
-- ---------------------------------------------------------

create or replace function public.access_code_exists(p_access_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_spaces
    where access_code = upper(trim(p_access_code))
  );
$$;

create or replace function public.get_space_classes(p_access_code text)
returns table (
  class_id bigint,
  class_name text,
  display_order int
)
language sql
stable
security definer
set search_path = public
as $$
  select tc.id, tc.name, tc.display_order
  from public.teacher_spaces ts
  join public.teacher_classes tc on tc.teacher_space_id = ts.id
  where ts.access_code = upper(trim(p_access_code))
  order by tc.display_order asc, lower(tc.name) asc, tc.id asc;
$$;

create or replace function public.get_space_students(p_access_code text)
returns table (
  id bigint,
  teacher_class_id bigint,
  first_name text,
  grade_level text,
  display_order int,
  class_name text,
  class_display_order int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.teacher_class_id,
    s.first_name,
    s.grade_level,
    s.display_order,
    tc.name as class_name,
    tc.display_order as class_display_order
  from public.teacher_spaces ts
  join public.teacher_classes tc on tc.teacher_space_id = ts.id
  join public.students s on s.teacher_class_id = tc.id
  where ts.access_code = upper(trim(p_access_code))
    and s.is_active = true
  order by tc.display_order asc, s.display_order asc, lower(s.first_name) asc, s.id asc;
$$;

create or replace function public.verify_student_code(
  p_access_code text,
  p_student_id bigint,
  p_student_code text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.teacher_spaces ts
    join public.teacher_classes tc on tc.teacher_space_id = ts.id
    join public.students s on s.teacher_class_id = tc.id
    where ts.access_code = upper(trim(p_access_code))
      and s.id = p_student_id
      and s.is_active = true
      and s.student_code = upper(regexp_replace(coalesce(p_student_code, ''), '[^A-Za-z0-9]', '', 'g'))
  );
$$;

grant execute on function public.access_code_exists(text) to anon, authenticated;
grant execute on function public.get_space_classes(text) to anon, authenticated;
grant execute on function public.get_space_students(text) to anon, authenticated;
grant execute on function public.verify_student_code(text, bigint, text) to anon, authenticated;
