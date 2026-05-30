-- =========================================================
-- 07_ADAPTATION_AVENTURE — niveaux adaptatifs par élève/activité
-- =========================================================

-- Cette partie prépare l’Aventure.
-- Elle peut être appliquée dès maintenant, même si le front ne l’utilise pas encore.

create table public.student_catalog_activity_levels (
  student_id bigint not null references public.students(id) on delete cascade,
  catalog_activity_id text not null,
  current_level smallint not null default 3,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (student_id, catalog_activity_id),
  constraint student_catalog_activity_levels_activity_not_blank check (btrim(catalog_activity_id) <> ''),
  constraint student_catalog_activity_levels_level_check check (current_level between 1 and 5)
);

create index student_catalog_activity_levels_activity_idx
on public.student_catalog_activity_levels (catalog_activity_id, current_level);

drop trigger if exists trg_student_catalog_activity_levels_updated_at on public.student_catalog_activity_levels;
create trigger trg_student_catalog_activity_levels_updated_at
before update on public.student_catalog_activity_levels
for each row execute function public.set_updated_at();

create table public.student_catalog_activity_attempts (
  id uuid primary key default gen_random_uuid(),
  student_id bigint not null references public.students(id) on delete cascade,
  catalog_activity_id text not null,
  level_before smallint not null,
  level_after smallint not null,
  success boolean not null,
  source text not null default 'exploration',
  created_at timestamptz not null default now(),

  constraint student_catalog_activity_attempts_activity_not_blank check (btrim(catalog_activity_id) <> ''),
  constraint student_catalog_activity_attempts_level_before_check check (level_before between 1 and 5),
  constraint student_catalog_activity_attempts_level_after_check check (level_after between 1 and 5),
  constraint student_catalog_activity_attempts_source_check check (source in ('exploration', 'aventure', 'mission'))
);

create index student_catalog_activity_attempts_student_activity_idx
on public.student_catalog_activity_attempts (student_id, catalog_activity_id, created_at desc);

create index student_catalog_activity_attempts_activity_idx
on public.student_catalog_activity_attempts (catalog_activity_id, created_at desc);

alter table public.student_catalog_activity_levels enable row level security;
alter table public.student_catalog_activity_attempts enable row level security;

create policy student_catalog_activity_levels_select_own
on public.student_catalog_activity_levels
for select to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where s.id = student_catalog_activity_levels.student_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy student_catalog_activity_attempts_select_own
on public.student_catalog_activity_attempts
for select to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where s.id = student_catalog_activity_attempts.student_id
      and ts.owner_user_id = auth.uid()
  )
);

-- Pas de grant insert/update direct pour authenticated côté navigateur enseignant :
-- la mise à jour élève passe par RPC vérifiant le code élève.
grant select on public.student_catalog_activity_levels to authenticated;
grant select on public.student_catalog_activity_attempts to authenticated;

create or replace function public.record_catalog_activity_result(
  p_access_code text,
  p_student_id bigint,
  p_student_code text,
  p_catalog_activity_id text,
  p_success boolean,
  p_source text default 'exploration'
)
returns table (
  current_level smallint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_activity_id text := trim(coalesce(p_catalog_activity_id, ''));
  safe_source text := coalesce(nullif(trim(p_source), ''), 'exploration');
  previous_level smallint;
  next_level smallint;
begin
  if safe_activity_id = '' then
    raise exception 'catalog_activity_id is required';
  end if;

  if safe_source not in ('exploration', 'aventure', 'mission') then
    safe_source := 'exploration';
  end if;

  if not public.verify_student_code(p_access_code, p_student_id, p_student_code) then
    raise exception 'Code élève invalide.';
  end if;

  select scal.current_level into previous_level
  from public.student_catalog_activity_levels scal
  where scal.student_id = p_student_id
    and scal.catalog_activity_id = safe_activity_id;

  previous_level := coalesce(previous_level, 3);

  if coalesce(p_success, false) then
    next_level := least(5, previous_level + 1);
  else
    next_level := greatest(1, previous_level - 1);
  end if;

  insert into public.student_catalog_activity_levels (student_id, catalog_activity_id, current_level, updated_at)
  values (p_student_id, safe_activity_id, next_level, now())
  on conflict (student_id, catalog_activity_id) do update
  set current_level = excluded.current_level,
      updated_at = now();

  insert into public.student_catalog_activity_attempts (
    student_id,
    catalog_activity_id,
    level_before,
    level_after,
    success,
    source
  ) values (
    p_student_id,
    safe_activity_id,
    previous_level,
    next_level,
    coalesce(p_success, false),
    safe_source
  );

  return query select next_level;
end;
$$;

grant execute on function public.record_catalog_activity_result(text, bigint, text, text, boolean, text) to anon, authenticated;
