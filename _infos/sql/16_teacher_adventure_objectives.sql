-- =========================================================
-- PATCH 16 — CONFIGURATION AVENTURE PAR ESPACE ENSEIGNANT
-- À exécuter APRÈS 15_adventure_objective_registry.sql.
--
-- Objectif :
-- - conserver l'activation et l'ordre des OdApp propres à chaque compte ;
-- - laisser l'arborescence pédagogique fournir l'ordre initial ;
-- - rendre les écritures accessibles uniquement au propriétaire de l'espace ;
-- - conserver le registre global du patch 15 comme historique, sans l'utiliser
--   dans le nouvel écran enseignant.
-- =========================================================

begin;

create table if not exists public.teacher_adventure_objectives (
  teacher_space_id bigint not null
    references public.teacher_spaces(id)
    on delete cascade,
  grade_folder_id text not null
    references public.pedagogical_nodes(id)
    on update cascade
    on delete cascade,
  display_order integer not null default 0,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (teacher_space_id, grade_folder_id),

  constraint teacher_adventure_objectives_order_check
    check (display_order >= 0)
);

create index if not exists teacher_adventure_objectives_space_order_idx
on public.teacher_adventure_objectives
  (teacher_space_id, display_order, grade_folder_id);

create index if not exists teacher_adventure_objectives_space_enabled_idx
on public.teacher_adventure_objectives
  (teacher_space_id, is_enabled);

create or replace function public.validate_teacher_adventure_objective()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  folder_type text;
begin
  select node_type
  into folder_type
  from public.pedagogical_nodes
  where id = new.grade_folder_id;

  if folder_type is null then
    raise exception 'Dossier pédagogique % introuvable.', new.grade_folder_id;
  end if;

  if folder_type <> 'grade_level' then
    raise exception 'Une configuration Aventure doit cibler un dossier de niveau, pas un nœud de type %.', folder_type;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_teacher_adventure_objective
on public.teacher_adventure_objectives;
create trigger trg_validate_teacher_adventure_objective
before insert or update of grade_folder_id
on public.teacher_adventure_objectives
for each row execute function public.validate_teacher_adventure_objective();

drop trigger if exists trg_teacher_adventure_objectives_updated_at
on public.teacher_adventure_objectives;
create trigger trg_teacher_adventure_objectives_updated_at
before update on public.teacher_adventure_objectives
for each row execute function public.set_updated_at();

alter table public.teacher_adventure_objectives enable row level security;

drop policy if exists teacher_adventure_objectives_select_own
on public.teacher_adventure_objectives;
drop policy if exists teacher_adventure_objectives_insert_own
on public.teacher_adventure_objectives;
drop policy if exists teacher_adventure_objectives_update_own
on public.teacher_adventure_objectives;
drop policy if exists teacher_adventure_objectives_delete_own
on public.teacher_adventure_objectives;

create policy teacher_adventure_objectives_select_own
on public.teacher_adventure_objectives
for select
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_adventure_objectives.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy teacher_adventure_objectives_insert_own
on public.teacher_adventure_objectives
for insert
to authenticated
with check (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_adventure_objectives.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy teacher_adventure_objectives_update_own
on public.teacher_adventure_objectives
for update
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_adventure_objectives.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_adventure_objectives.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy teacher_adventure_objectives_delete_own
on public.teacher_adventure_objectives
for delete
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_adventure_objectives.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete
on public.teacher_adventure_objectives
to authenticated;

commit;
