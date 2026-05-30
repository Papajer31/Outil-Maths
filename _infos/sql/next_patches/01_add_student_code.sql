-- =========================================================
-- PATCH 01 — ajouter le code élève sur la base actuelle
-- Non destructif pour students.
-- =========================================================

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

alter table public.students
  add column if not exists student_code text null;

alter table public.students
  drop constraint if exists students_student_code_format;

alter table public.students
  add constraint students_student_code_format
  check (student_code is null or student_code ~ '^[A-HJ-NP-Z2-9]{3}$');

create unique index if not exists students_unique_code_per_class
on public.students (teacher_class_id, student_code)
where student_code is not null;

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
        select 1 from public.students s
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

-- Backfill des élèves existants
update public.students
set student_code = null
where student_code is null;

-- Le trigger ne s’exécute pas sur un update qui ne touche pas student_code/teacher_class_id.
-- On force donc la génération en réassignant un marqueur vide.
update public.students
set student_code = ''
where student_code is null;

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

grant execute on function public.verify_student_code(text, bigint, text) to anon, authenticated;
