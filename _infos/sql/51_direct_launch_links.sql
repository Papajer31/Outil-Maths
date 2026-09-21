-- =========================================================
-- 51_DIRECT_LAUNCH_LINKS — QR / liens directs anonymes
-- =========================================================
-- À exécuter APRÈS 48_teacher_activities.sql et 50_teacher_sequences.sql.
-- Un lien direct vise une activité système, une activité personnelle ou une séquence.
-- Il n'attribue rien à un élève et ne crée aucun historique nominatif.

begin;

create table if not exists public.direct_launch_links (
  id uuid primary key default gen_random_uuid(),
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  token text not null default replace(gen_random_uuid()::text, '-', ''),
  source_type text not null,
  source_id text not null,
  title_snapshot text not null,
  difficulty_mode text not null default 'fixed',
  difficulty_level smallint null,
  execution_limit_mode text not null default 'questions',
  execution_limit_value integer null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint direct_launch_links_token_not_blank check (btrim(token) <> ''),
  constraint direct_launch_links_source_type_check check (source_type in ('catalog_activity', 'teacher_activity', 'sequence')),
  constraint direct_launch_links_source_id_not_blank check (btrim(source_id) <> ''),
  constraint direct_launch_links_title_not_blank check (btrim(title_snapshot) <> ''),
  constraint direct_launch_links_difficulty_mode_check check (difficulty_mode in ('fixed', 'adaptive')),
  constraint direct_launch_links_difficulty_level_check check (difficulty_level is null or difficulty_level between 1 and 5),
  constraint direct_launch_links_difficulty_shape_check check (
    (difficulty_mode = 'adaptive' and difficulty_level is null)
    or (difficulty_mode = 'fixed' and difficulty_level between 1 and 5)
  ),
  constraint direct_launch_links_execution_mode_check check (execution_limit_mode in ('questions', 'time', 'intrinsic')),
  constraint direct_launch_links_execution_value_check check (
    (execution_limit_mode = 'intrinsic' and execution_limit_value is null)
    or (execution_limit_mode <> 'intrinsic' and execution_limit_value is not null and execution_limit_value > 0)
  )
);

create unique index if not exists direct_launch_links_token_unique
on public.direct_launch_links (token);

-- Un seul lien stable par ressource et par espace. Rouvrir le dialogue QR met à jour
-- ses paramètres sans changer le token déjà imprimé ou affiché ailleurs.
create unique index if not exists direct_launch_links_source_unique
on public.direct_launch_links (teacher_space_id, source_type, source_id);

create index if not exists direct_launch_links_space_idx
on public.direct_launch_links (teacher_space_id, updated_at desc);

drop trigger if exists trg_direct_launch_links_updated_at on public.direct_launch_links;
create trigger trg_direct_launch_links_updated_at
before update on public.direct_launch_links
for each row execute function public.set_updated_at();

create or replace function public.validate_direct_launch_source()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.source_type = 'catalog_activity' then
    if not exists (
      select 1 from public.catalog_activities ca
      where ca.id = new.source_id and ca.status = 'published'
    ) then
      raise exception 'Activité système introuvable ou non publiée.';
    end if;
  elsif new.source_type = 'teacher_activity' then
    if not exists (
      select 1 from public.teacher_activities ta
      where ta.id::text = new.source_id
        and ta.teacher_space_id = new.teacher_space_id
    ) then
      raise exception 'Activité personnelle introuvable.';
    end if;
  elsif new.source_type = 'sequence' then
    if not exists (
      select 1 from public.teacher_sequences seq
      where seq.id::text = new.source_id
        and seq.teacher_space_id = new.teacher_space_id
    ) then
      raise exception 'Séquence introuvable.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_direct_launch_source on public.direct_launch_links;
create trigger trg_validate_direct_launch_source
before insert or update of teacher_space_id, source_type, source_id
on public.direct_launch_links
for each row execute function public.validate_direct_launch_source();

alter table public.direct_launch_links enable row level security;

drop policy if exists direct_launch_links_teacher_all on public.direct_launch_links;
create policy direct_launch_links_teacher_all
on public.direct_launch_links
for all to authenticated
using (exists (
  select 1 from public.teacher_spaces ts
  where ts.id = direct_launch_links.teacher_space_id
    and ts.owner_user_id = auth.uid()
))
with check (exists (
  select 1 from public.teacher_spaces ts
  where ts.id = direct_launch_links.teacher_space_id
    and ts.owner_user_id = auth.uid()
));

grant select, insert, update, delete on public.direct_launch_links to authenticated;
revoke all on public.direct_launch_links from anon;

-- Résolution publique par token. Le token est l'unique capacité d'accès au lien.
-- Le code classe est renvoyé uniquement pour que les outils qui chargent des
-- ressources publiques existantes puissent continuer à fonctionner.
create or replace function public.resolve_direct_launch(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  link_row public.direct_launch_links%rowtype;
  access_code_value text;
  source_json jsonb;
begin
  select * into link_row
  from public.direct_launch_links dl
  where dl.token = btrim(coalesce(p_token, ''))
    and dl.is_active = true
  limit 1;

  if link_row.id is null then
    return null;
  end if;

  select ts.access_code into access_code_value
  from public.teacher_spaces ts
  where ts.id = link_row.teacher_space_id;

  if link_row.source_type = 'catalog_activity' then
    select to_jsonb(ca) into source_json
    from public.catalog_activities ca
    where ca.id = link_row.source_id
      and ca.status = 'published';

  elsif link_row.source_type = 'teacher_activity' then
    select to_jsonb(ta) into source_json
    from public.teacher_activities ta
    where ta.id::text = link_row.source_id
      and ta.teacher_space_id = link_row.teacher_space_id;

  elsif link_row.source_type = 'sequence' then
    select jsonb_build_object(
      'id', seq.id,
      'title', seq.title,
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', item.id,
            'position', item.position,
            'source_type', item.source_type,
            'source_id', item.source_id,
            'title_snapshot', item.title_snapshot,
            'difficulty_mode', item.difficulty_mode,
            'difficulty_level', item.difficulty_level,
            'execution_limit_mode', item.execution_limit_mode,
            'execution_limit_value', item.execution_limit_value,
            'activity_json', case
              when item.source_type = 'catalog_activity' then (
                select to_jsonb(ca)
                from public.catalog_activities ca
                where ca.id = item.source_id
                  and ca.status = 'published'
              )
              when item.source_type = 'teacher_activity' then (
                select to_jsonb(ta)
                from public.teacher_activities ta
                where ta.id::text = item.source_id
                  and ta.teacher_space_id = seq.teacher_space_id
              )
              else null
            end
          ) order by item.position, item.created_at
        )
        from public.teacher_sequence_items item
        where item.sequence_id = seq.id
      ), '[]'::jsonb)
    ) into source_json
    from public.teacher_sequences seq
    where seq.id::text = link_row.source_id
      and seq.teacher_space_id = link_row.teacher_space_id;
  end if;

  if source_json is null then
    return null;
  end if;

  return jsonb_build_object(
    'id', link_row.id,
    'token', link_row.token,
    'title', link_row.title_snapshot,
    'source_type', link_row.source_type,
    'source_id', link_row.source_id,
    'difficulty_mode', link_row.difficulty_mode,
    'difficulty_level', link_row.difficulty_level,
    'execution_limit_mode', link_row.execution_limit_mode,
    'execution_limit_value', link_row.execution_limit_value,
    'access_code', access_code_value,
    'activity_json', source_json
  );
end;
$$;

grant execute on function public.resolve_direct_launch(text) to anon, authenticated;

commit;
