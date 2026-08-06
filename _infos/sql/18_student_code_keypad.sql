-- =========================================================
-- PATCH 18 — mini-clavier de code élève
-- Retourne dix touches : les caractères du code, complétés par
-- des distracteurs alphanumériques, puis mélangés aléatoirement.
-- =========================================================

create or replace function public.get_student_code_keypad(
  p_access_code text,
  p_student_id bigint
)
returns table (keypad_characters text[])
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_code text;
  v_code_characters text[];
  v_distractors text[];
  v_keys text[];
begin
  select s.student_code
  into v_code
  from public.teacher_spaces ts
  join public.teacher_classes tc on tc.teacher_space_id = ts.id
  join public.students s on s.teacher_class_id = tc.id
  where ts.access_code = upper(btrim(coalesce(p_access_code, '')))
    and s.id = p_student_id
    and s.is_active = true
  limit 1;

  if v_code is null then
    return;
  end if;

  select array_agg(character)
  into v_code_characters
  from (
    select distinct character
    from regexp_split_to_table(v_code, '') as characters(character)
  ) characters;

  select array_agg(character)
  into v_distractors
  from (
    select character
    from regexp_split_to_table('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789', '') as characters(character)
    where character <> all(v_code_characters)
    order by random()
    limit greatest(0, 10 - cardinality(v_code_characters))
  ) distractors;

  v_keys := v_code_characters || coalesce(v_distractors, '{}'::text[]);

  return query
  select array_agg(character order by random())
  from unnest(v_keys) as characters(character);
end;
$$;

grant execute on function public.get_student_code_keypad(text, bigint) to anon, authenticated;
