-- =========================================================
-- PATCH 02 — autoriser I/O/1/0 dans les codes élèves
-- Garde la limite à 3 caractères alphanumériques en majuscules.
-- N'élargit pas le format au-delà de A-Z et 0-9.
-- =========================================================

alter table public.students
  drop constraint if exists students_student_code_format;

alter table public.students
  add constraint students_student_code_format
  check (student_code is null or student_code ~ '^[A-Z0-9]{3}$');

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

  if new.student_code !~ '^[A-Z0-9]{3}$' then
    raise exception 'Code élève invalide. Utiliser 3 caractères alphanumériques.';
  end if;

  return new;
end;
$$;
