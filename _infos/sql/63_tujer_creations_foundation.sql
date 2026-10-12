-- =========================================================
-- PATCH 63 — SOCLE « CRÉATIONS TUJER »
--
-- - autorise les créations natives Tujer et les PDF personnels ;
-- - conserve les créations dans le bucket personnel teacher-resources ;
-- - ajoute les dépendances création -> ressources afin d'empêcher la
--   suppression d'un fichier encore utilisé par une création.
--
-- Les dossiers « Créations Tujer » et « Mes fichiers locaux » sont créés
-- à la demande par le client avec un metadata.system_role stable.
-- =========================================================

begin;

grant usage on schema public to authenticated;

-- ---------------------------------------------------------
-- 1) Types supplémentaires dans Mes ressources
-- ---------------------------------------------------------

alter table public.resources
  drop constraint if exists resources_resource_type_check;

alter table public.resources
  add constraint resources_resource_type_check
  check (resource_type in ('image', 'audio', 'seyes', 'document', 'creation'));

-- Le bucket personnel doit accepter les JSON propriétaires et les PDF en
-- plus des images/audio. Le plafond de fichier unitaire reste 25 Mo.
update storage.buckets
set allowed_mime_types = array[
  'image/*',
  'audio/*',
  'application/pdf',
  'application/vnd.site-outils.seyes+json',
  'application/vnd.tujer.creation+json'
]::text[]
where id = 'teacher-resources';

-- ---------------------------------------------------------
-- 2) Dépendances d'une création vers des ressources
-- ---------------------------------------------------------

create table if not exists public.tujer_creation_resource_refs (
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  creation_resource_id uuid not null references public.resources(id) on delete cascade,
  dependency_resource_id uuid not null references public.resources(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (creation_resource_id, dependency_resource_id),
  constraint tujer_creation_resource_refs_no_self check (creation_resource_id <> dependency_resource_id)
);

create index if not exists tujer_creation_resource_refs_dependency_idx
on public.tujer_creation_resource_refs (dependency_resource_id, creation_resource_id);

create index if not exists tujer_creation_resource_refs_space_idx
on public.tujer_creation_resource_refs (teacher_space_id, creation_resource_id);

create or replace function public.validate_tujer_creation_resource_ref()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_creation public.resources%rowtype;
  v_dependency public.resources%rowtype;
begin
  select * into v_creation from public.resources where id = new.creation_resource_id;
  if not found then
    raise exception 'creation resource not found';
  end if;

  select * into v_dependency from public.resources where id = new.dependency_resource_id;
  if not found then
    raise exception 'dependency resource not found';
  end if;

  if v_creation.is_system = true or v_creation.resource_type <> 'creation' then
    raise exception 'creation_resource_id must reference a personal Tujer creation';
  end if;

  if v_creation.teacher_space_id is distinct from new.teacher_space_id
     or v_dependency.teacher_space_id is distinct from new.teacher_space_id
     or v_dependency.is_system = true then
    raise exception 'creation dependency scope mismatch';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_tujer_creation_resource_ref on public.tujer_creation_resource_refs;
create trigger trg_validate_tujer_creation_resource_ref
before insert or update
on public.tujer_creation_resource_refs
for each row execute function public.validate_tujer_creation_resource_ref();

alter table public.tujer_creation_resource_refs enable row level security;

drop policy if exists tujer_creation_resource_refs_select on public.tujer_creation_resource_refs;
create policy tujer_creation_resource_refs_select
on public.tujer_creation_resource_refs for select to authenticated
using (public.owns_teacher_space(teacher_space_id));

drop policy if exists tujer_creation_resource_refs_insert on public.tujer_creation_resource_refs;
create policy tujer_creation_resource_refs_insert
on public.tujer_creation_resource_refs for insert to authenticated
with check (public.owns_teacher_space(teacher_space_id));

drop policy if exists tujer_creation_resource_refs_update on public.tujer_creation_resource_refs;
create policy tujer_creation_resource_refs_update
on public.tujer_creation_resource_refs for update to authenticated
using (public.owns_teacher_space(teacher_space_id))
with check (public.owns_teacher_space(teacher_space_id));

drop policy if exists tujer_creation_resource_refs_delete on public.tujer_creation_resource_refs;
create policy tujer_creation_resource_refs_delete
on public.tujer_creation_resource_refs for delete to authenticated
using (public.owns_teacher_space(teacher_space_id));

grant select, insert, update, delete on public.tujer_creation_resource_refs to authenticated;

-- Remplacement atomique des dépendances d'une création.
create or replace function public.replace_tujer_creation_resource_refs(
  p_teacher_space_id bigint,
  p_creation_resource_id uuid,
  p_dependency_resource_ids uuid[] default '{}'::uuid[]
)
returns table (creation_resource_id uuid, dependency_resource_id uuid)
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not public.owns_teacher_space(p_teacher_space_id) then
    raise exception 'teacher space access denied';
  end if;

  delete from public.tujer_creation_resource_refs r
  where r.teacher_space_id = p_teacher_space_id
    and r.creation_resource_id = p_creation_resource_id;

  insert into public.tujer_creation_resource_refs (teacher_space_id, creation_resource_id, dependency_resource_id)
  select p_teacher_space_id, p_creation_resource_id, dependency_id
  from (
    select distinct unnest(coalesce(p_dependency_resource_ids, '{}'::uuid[])) as dependency_id
  ) deps
  where dependency_id is not null
    and dependency_id <> p_creation_resource_id;

  return query
  select r.creation_resource_id, r.dependency_resource_id
  from public.tujer_creation_resource_refs r
  where r.teacher_space_id = p_teacher_space_id
    and r.creation_resource_id = p_creation_resource_id;
end;
$$;

grant execute on function public.replace_tujer_creation_resource_refs(bigint, uuid, uuid[]) to authenticated;

commit;
