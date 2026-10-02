-- =========================================================
-- PATCH 61 — RÉGLAGES DES GÉNÉRATEURS IMPRIMABLES
--
-- Mémorise silencieusement, par espace enseignant et par générateur,
-- la dernière configuration utilisée. Les exercices générés eux-mêmes
-- ne sont pas enregistrés.
-- =========================================================

begin;

grant usage on schema public to authenticated;

create table if not exists public.teacher_generator_settings (
  teacher_space_id bigint not null references public.teacher_spaces(id) on delete cascade,
  generator_key text not null,
  settings_version integer not null default 1,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (teacher_space_id, generator_key),
  constraint teacher_generator_settings_key_not_blank check (btrim(generator_key) <> ''),
  constraint teacher_generator_settings_key_format check (generator_key ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  constraint teacher_generator_settings_version_positive check (settings_version >= 1),
  constraint teacher_generator_settings_json_object check (jsonb_typeof(settings) = 'object')
);

drop trigger if exists trg_teacher_generator_settings_updated_at on public.teacher_generator_settings;
create trigger trg_teacher_generator_settings_updated_at
before update on public.teacher_generator_settings
for each row execute function public.set_updated_at();

alter table public.teacher_generator_settings enable row level security;

drop policy if exists teacher_generator_settings_owner_all on public.teacher_generator_settings;
create policy teacher_generator_settings_owner_all
on public.teacher_generator_settings
for all
to authenticated
using (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_generator_settings.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.teacher_spaces ts
    where ts.id = teacher_generator_settings.teacher_space_id
      and ts.owner_user_id = auth.uid()
  )
);

grant select, insert, update, delete on public.teacher_generator_settings to authenticated;

commit;
