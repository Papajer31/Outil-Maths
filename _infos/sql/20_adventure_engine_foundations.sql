-- =========================================================
-- PATCH 20 — FONDATIONS DU MOTEUR ÉLÈVE AVENTURE
-- À exécuter APRÈS 19_adventure_weekly_menus.sql.
--
-- Objectif :
-- - piloter le Menu/Jour actif pour chaque classe et chaque niveau ;
-- - créer les jauges Aventure 0–50 propres à chaque palier d’un OdApp ;
-- - figer les dix passages d’une journée élève pour permettre sa reprise ;
-- - exposer une RPC publique sécurisée qui ouvre ou reprend le jour courant ;
-- - ne modifier ni Exploration ni Missions.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Curseur Menu/Jour par classe ET par niveau
-- ---------------------------------------------------------
-- Une même classe peut contenir plusieurs niveaux. Chaque niveau dispose donc
-- de son propre curseur dans la même classe.

create table if not exists public.adventure_class_cursors (
  teacher_class_id bigint not null
    references public.teacher_classes(id)
    on delete cascade,
  grade_level text not null,
  menu_number smallint not null default 1,
  day_number smallint not null default 1,
  is_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (teacher_class_id, grade_level),

  constraint adventure_class_cursors_grade_check
    check (grade_level in ('CP', 'CE1', 'CE2', 'CM1', 'CM2')),
  constraint adventure_class_cursors_menu_check
    check (menu_number between 1 and 34),
  constraint adventure_class_cursors_day_check
    check (day_number between 1 and 4)
);

create index if not exists adventure_class_cursors_class_idx
on public.adventure_class_cursors (teacher_class_id, grade_level);

drop trigger if exists trg_adventure_class_cursors_updated_at
on public.adventure_class_cursors;
create trigger trg_adventure_class_cursors_updated_at
before update on public.adventure_class_cursors
for each row execute function public.set_updated_at();

alter table public.adventure_class_cursors enable row level security;

drop policy if exists adventure_class_cursors_select_own
on public.adventure_class_cursors;
drop policy if exists adventure_class_cursors_insert_own
on public.adventure_class_cursors;
drop policy if exists adventure_class_cursors_update_own
on public.adventure_class_cursors;
drop policy if exists adventure_class_cursors_delete_own
on public.adventure_class_cursors;

create policy adventure_class_cursors_select_own
on public.adventure_class_cursors
for select
to authenticated
using (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = adventure_class_cursors.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy adventure_class_cursors_insert_own
on public.adventure_class_cursors
for insert
to authenticated
with check (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = adventure_class_cursors.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy adventure_class_cursors_update_own
on public.adventure_class_cursors
for update
to authenticated
using (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = adventure_class_cursors.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = adventure_class_cursors.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
);

create policy adventure_class_cursors_delete_own
on public.adventure_class_cursors
for delete
to authenticated
using (
  exists (
    select 1
    from public.teacher_classes tc
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where tc.id = adventure_class_cursors.teacher_class_id
      and ts.owner_user_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- 2) Jauge Aventure propre à chaque palier d’un OdApp
-- ---------------------------------------------------------
-- Un OdApp à plusieurs paliers possède plusieurs cycles indépendants 0–50.
-- L’existence d’une ligne signifie aussi que l’OdApp a déjà été rencontré.

create table if not exists public.student_adventure_tier_progress (
  student_id bigint not null
    references public.students(id)
    on delete cascade,
  grade_folder_id text not null
    references public.pedagogical_nodes(id)
    on update cascade
    on delete restrict,
  adventure_tier integer not null,
  gauge_value smallint not null default 0,
  total_passages integer not null default 0,
  total_questions integer not null default 0,
  total_correct integer not null default 0,
  total_wrong integer not null default 0,
  first_encountered_at timestamptz not null default now(),
  last_practiced_at timestamptz null,
  mastered_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (student_id, grade_folder_id, adventure_tier),

  constraint student_adventure_tier_positive_check
    check (adventure_tier >= 1),
  constraint student_adventure_gauge_check
    check (gauge_value between 0 and 50),
  constraint student_adventure_counters_check
    check (
      total_passages >= 0
      and total_questions >= 0
      and total_correct >= 0
      and total_wrong >= 0
    )
);

create index if not exists student_adventure_progress_student_gauge_idx
on public.student_adventure_tier_progress
  (student_id, gauge_value, last_practiced_at);

create index if not exists student_adventure_progress_objective_idx
on public.student_adventure_tier_progress
  (grade_folder_id, adventure_tier, gauge_value);

drop trigger if exists trg_student_adventure_tier_progress_updated_at
on public.student_adventure_tier_progress;
create trigger trg_student_adventure_tier_progress_updated_at
before update on public.student_adventure_tier_progress
for each row execute function public.set_updated_at();

alter table public.student_adventure_tier_progress enable row level security;

drop policy if exists student_adventure_tier_progress_select_own
on public.student_adventure_tier_progress;
create policy student_adventure_tier_progress_select_own
on public.student_adventure_tier_progress
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where s.id = student_adventure_tier_progress.student_id
      and ts.owner_user_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- 3) Journées et passages figés pour la reprise
-- ---------------------------------------------------------

create table if not exists public.student_adventure_days (
  id uuid primary key default gen_random_uuid(),
  student_id bigint not null
    references public.students(id)
    on delete cascade,
  grade_level text not null,
  menu_number smallint not null,
  day_number smallint not null,
  status text not null default 'in_progress',
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint student_adventure_days_unique
    unique (student_id, grade_level, menu_number, day_number),
  constraint student_adventure_days_grade_check
    check (grade_level in ('CP', 'CE1', 'CE2', 'CM1', 'CM2')),
  constraint student_adventure_days_menu_check
    check (menu_number between 1 and 34),
  constraint student_adventure_days_day_check
    check (day_number between 1 and 4),
  constraint student_adventure_days_status_check
    check (status in ('in_progress', 'completed', 'abandoned')),
  constraint student_adventure_days_completed_at_check
    check (
      (status = 'completed' and completed_at is not null)
      or status <> 'completed'
    )
);

create index if not exists student_adventure_days_student_status_idx
on public.student_adventure_days (student_id, status, updated_at desc);

drop trigger if exists trg_student_adventure_days_updated_at
on public.student_adventure_days;
create trigger trg_student_adventure_days_updated_at
before update on public.student_adventure_days
for each row execute function public.set_updated_at();

alter table public.student_adventure_days enable row level security;

drop policy if exists student_adventure_days_select_own
on public.student_adventure_days;
create policy student_adventure_days_select_own
on public.student_adventure_days
for select
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where s.id = student_adventure_days.student_id
      and ts.owner_user_id = auth.uid()
  )
);

create table if not exists public.student_adventure_passages (
  id uuid primary key default gen_random_uuid(),
  adventure_day_id uuid not null
    references public.student_adventure_days(id)
    on delete cascade,
  passage_number smallint not null,
  passage_type text not null,
  source_slot_number smallint null,
  source_item_type text not null,
  grade_folder_id text null
    references public.pedagogical_nodes(id)
    on update cascade
    on delete restrict,
  catalog_activity_id text null
    references public.catalog_activities(id)
    on update cascade
    on delete restrict,
  adventure_tier integer null,
  status text not null default 'pending',
  activity_attempt_id uuid null
    references public.student_activity_sessions(id)
    on delete set null,
  points_awarded integer not null default 0,
  started_at timestamptz null,
  completed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint student_adventure_passages_unique
    unique (adventure_day_id, passage_number),
  constraint student_adventure_passages_number_check
    check (passage_number between 1 and 10),
  constraint student_adventure_passages_type_check
    check (passage_type in ('required', 'adaptive')),
  constraint student_adventure_passages_slot_check
    check (
      (passage_type = 'required' and source_slot_number between 1 and 6)
      or
      (passage_type = 'adaptive' and source_slot_number is null)
    ),
  constraint student_adventure_passages_source_check
    check (source_item_type in ('objective', 'activity', 'adaptive')),
  constraint student_adventure_passages_required_target_check
    check (
      passage_type = 'adaptive'
      or (source_item_type = 'objective' and grade_folder_id is not null and catalog_activity_id is null)
      or (source_item_type = 'activity' and grade_folder_id is null and catalog_activity_id is not null)
    ),
  constraint student_adventure_passages_tier_check
    check (adventure_tier is null or adventure_tier >= 1),
  constraint student_adventure_passages_status_check
    check (status in ('pending', 'running', 'completed', 'interrupted', 'skipped')),
  constraint student_adventure_passages_points_check
    check (points_awarded between -10000 and 10000)
);

create index if not exists student_adventure_passages_day_order_idx
on public.student_adventure_passages (adventure_day_id, passage_number);

create unique index if not exists student_adventure_passages_attempt_unique
on public.student_adventure_passages (activity_attempt_id)
where activity_attempt_id is not null;

drop trigger if exists trg_student_adventure_passages_updated_at
on public.student_adventure_passages;
create trigger trg_student_adventure_passages_updated_at
before update on public.student_adventure_passages
for each row execute function public.set_updated_at();

alter table public.student_adventure_passages enable row level security;

drop policy if exists student_adventure_passages_select_own
on public.student_adventure_passages;
create policy student_adventure_passages_select_own
on public.student_adventure_passages
for select
to authenticated
using (
  exists (
    select 1
    from public.student_adventure_days sad
    join public.students s on s.id = sad.student_id
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where sad.id = student_adventure_passages.adventure_day_id
      and ts.owner_user_id = auth.uid()
  )
);

-- ---------------------------------------------------------
-- 4) Validation renforcée des futures cases de menu
-- ---------------------------------------------------------
-- L’interface ne propose déjà que les activités publiées. Le contrôle est aussi
-- imposé en base pour éviter un menu ciblant une activité brouillon ou archivée.

create or replace function public.validate_adventure_menu_slot()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  folder_type text;
  folder_grade text;
  folder_active boolean;
  activity_grade text;
  activity_status text;
begin
  if new.item_type = 'empty' then
    return new;
  end if;

  if new.item_type = 'objective' then
    select node_type, name, is_active
      into folder_type, folder_grade, folder_active
    from public.pedagogical_nodes
    where id = new.grade_folder_id;

    if folder_type is null then
      raise exception 'Objectif Aventure % introuvable.', new.grade_folder_id;
    end if;
    if folder_type <> 'grade_level' then
      raise exception 'Une case Objectif doit cibler un dossier de niveau, pas un nœud de type %.', folder_type;
    end if;
    if folder_grade <> new.grade_level then
      raise exception 'Le dossier % appartient au niveau %, pas au niveau %.', new.grade_folder_id, folder_grade, new.grade_level;
    end if;
    if folder_active is not true then
      raise exception 'Le dossier de niveau % est désactivé.', new.grade_folder_id;
    end if;
    return new;
  end if;

  select pn.name, ca.status
    into activity_grade, activity_status
  from public.catalog_activities ca
  join public.pedagogical_nodes pn on pn.id = ca.pedagogical_node_id
  where ca.id = new.catalog_activity_id
    and pn.node_type = 'grade_level'
    and pn.is_active = true;

  if activity_grade is null then
    raise exception 'Activité Aventure % introuvable ou mal classée.', new.catalog_activity_id;
  end if;
  if activity_grade <> new.grade_level then
    raise exception 'L''activité % appartient au niveau %, pas au niveau %.', new.catalog_activity_id, activity_grade, new.grade_level;
  end if;
  if activity_status <> 'published' then
    raise exception 'L''activité % doit être publiée pour être placée dans un menu Aventure.', new.catalog_activity_id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------
-- 5) Résolution privée d’un menu effectif
-- ---------------------------------------------------------
-- Une exception enseignant remplace la case système. Une exception « empty »
-- masque explicitement la case système.

create or replace function public.get_effective_adventure_menu_slots(
  p_teacher_space_id bigint,
  p_grade_level text,
  p_menu_number integer,
  p_day_number integer
)
returns table (
  slot_number integer,
  item_type text,
  grade_folder_id text,
  catalog_activity_id text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    generated.slot_number,
    case
      when teacher_slot.item_type = 'empty' then 'empty'
      else coalesce(teacher_slot.item_type, default_slot.item_type, 'empty')
    end as item_type,
    case
      when teacher_slot.item_type = 'empty' then null
      when teacher_slot.item_type = 'objective' then teacher_slot.grade_folder_id
      when teacher_slot.item_type = 'activity' then null
      else default_slot.grade_folder_id
    end as grade_folder_id,
    case
      when teacher_slot.item_type = 'empty' then null
      when teacher_slot.item_type = 'activity' then teacher_slot.catalog_activity_id
      when teacher_slot.item_type = 'objective' then null
      else default_slot.catalog_activity_id
    end as catalog_activity_id
  from generate_series(1, 6) as generated(slot_number)
  left join public.teacher_adventure_menu_slots teacher_slot
    on teacher_slot.teacher_space_id = p_teacher_space_id
   and teacher_slot.grade_level = p_grade_level
   and teacher_slot.menu_number = p_menu_number
   and teacher_slot.day_number = p_day_number
   and teacher_slot.slot_number = generated.slot_number
  left join public.adventure_default_menu_slots default_slot
    on default_slot.grade_level = p_grade_level
   and default_slot.menu_number = p_menu_number
   and default_slot.day_number = p_day_number
   and default_slot.slot_number = generated.slot_number
  order by generated.slot_number;
$$;

revoke all
on function public.get_effective_adventure_menu_slots(bigint, text, integer, integer)
from public, anon, authenticated;

-- ---------------------------------------------------------
-- 6) RPC publique : ouvrir ou reprendre le jour courant
-- ---------------------------------------------------------
-- La première ouverture fige les six cases obligatoires et crée quatre passages
-- adaptatifs encore sans cible. Les ouvertures suivantes relisent exactement le
-- même plan, même si le menu enseignant est modifié entre-temps.

create or replace function public.open_student_adventure_day(
  p_access_code text,
  p_student_id bigint,
  p_student_code text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id bigint;
  v_teacher_class_id bigint;
  v_teacher_space_id bigint;
  v_grade_level text;
  v_cursor public.adventure_class_cursors%rowtype;
  v_configured_count integer := 0;
  v_ready_count integer := 0;
  v_day_id uuid;
  v_day_status text;
  v_passages jsonb := '[]'::jsonb;
begin
  v_student_id := public.resolve_history_student(p_access_code, p_student_id, p_student_code);
  if v_student_id is null then
    raise exception 'Code élève invalide.' using errcode = '28000';
  end if;

  select s.teacher_class_id, s.grade_level, tc.teacher_space_id
    into v_teacher_class_id, v_grade_level, v_teacher_space_id
  from public.students s
  join public.teacher_classes tc on tc.id = s.teacher_class_id
  where s.id = v_student_id;

  if v_grade_level is null
     or v_grade_level not in ('CP', 'CE1', 'CE2', 'CM1', 'CM2') then
    return jsonb_build_object(
      'availability', 'missing_grade',
      'message', 'Aucun niveau scolaire n’est défini pour cet élève.'
    );
  end if;

  select * into v_cursor
  from public.adventure_class_cursors
  where teacher_class_id = v_teacher_class_id
    and grade_level = v_grade_level;

  if not found or v_cursor.is_enabled is not true then
    return jsonb_build_object(
      'availability', 'disabled',
      'grade_level', v_grade_level,
      'message', 'Le mode Aventure n’est pas encore ouvert pour ce niveau.'
    );
  end if;

  select
    count(*) filter (where effective.item_type <> 'empty'),
    count(*) filter (
      where
        (
          effective.item_type = 'objective'
          and exists (
            select 1
            from public.pedagogical_nodes pn
            where pn.id = effective.grade_folder_id
              and pn.node_type = 'grade_level'
              and pn.name = v_grade_level
              and pn.is_active = true
          )
          and exists (
            select 1
            from public.catalog_activities ca
            where ca.pedagogical_node_id = effective.grade_folder_id
              and ca.status = 'published'
          )
        )
        or
        (
          effective.item_type = 'activity'
          and exists (
            select 1
            from public.catalog_activities ca
            join public.pedagogical_nodes pn on pn.id = ca.pedagogical_node_id
            where ca.id = effective.catalog_activity_id
              and ca.status = 'published'
              and pn.node_type = 'grade_level'
              and pn.name = v_grade_level
              and pn.is_active = true
          )
        )
    )
    into v_configured_count, v_ready_count
  from public.get_effective_adventure_menu_slots(
    v_teacher_space_id,
    v_grade_level,
    v_cursor.menu_number,
    v_cursor.day_number
  ) effective;

  if v_ready_count <> 6 then
    return jsonb_build_object(
      'availability', 'menu_incomplete',
      'grade_level', v_grade_level,
      'menu_number', v_cursor.menu_number,
      'day_number', v_cursor.day_number,
      'configured_required_count', v_configured_count,
      'ready_required_count', v_ready_count,
      'message', 'Le jour courant doit contenir six passages obligatoires valides.'
    );
  end if;

  insert into public.student_adventure_days (
    student_id,
    grade_level,
    menu_number,
    day_number,
    status
  ) values (
    v_student_id,
    v_grade_level,
    v_cursor.menu_number,
    v_cursor.day_number,
    'in_progress'
  )
  on conflict (student_id, grade_level, menu_number, day_number) do nothing
  returning id, status into v_day_id, v_day_status;

  if v_day_id is null then
    select id, status
      into v_day_id, v_day_status
    from public.student_adventure_days
    where student_id = v_student_id
      and grade_level = v_grade_level
      and menu_number = v_cursor.menu_number
      and day_number = v_cursor.day_number;
  end if;

  insert into public.student_adventure_passages (
    adventure_day_id,
    passage_number,
    passage_type,
    source_slot_number,
    source_item_type,
    grade_folder_id,
    catalog_activity_id,
    status
  )
  select
    v_day_id,
    effective.slot_number,
    'required',
    effective.slot_number,
    effective.item_type,
    effective.grade_folder_id,
    effective.catalog_activity_id,
    'pending'
  from public.get_effective_adventure_menu_slots(
    v_teacher_space_id,
    v_grade_level,
    v_cursor.menu_number,
    v_cursor.day_number
  ) effective
  where effective.item_type in ('objective', 'activity')
  on conflict (adventure_day_id, passage_number) do nothing;

  insert into public.student_adventure_passages (
    adventure_day_id,
    passage_number,
    passage_type,
    source_slot_number,
    source_item_type,
    status
  )
  select
    v_day_id,
    generated.passage_number,
    'adaptive',
    null,
    'adaptive',
    'pending'
  from generate_series(7, 10) as generated(passage_number)
  on conflict (adventure_day_id, passage_number) do nothing;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', sap.id,
        'passage_number', sap.passage_number,
        'passage_type', sap.passage_type,
        'source_slot_number', sap.source_slot_number,
        'source_item_type', sap.source_item_type,
        'grade_folder_id', sap.grade_folder_id,
        'catalog_activity_id', sap.catalog_activity_id,
        'adventure_tier', sap.adventure_tier,
        'status', sap.status,
        'activity_attempt_id', sap.activity_attempt_id,
        'points_awarded', sap.points_awarded
      )
      order by sap.passage_number
    ),
    '[]'::jsonb
  ) into v_passages
  from public.student_adventure_passages sap
  where sap.adventure_day_id = v_day_id;

  return jsonb_build_object(
    'availability', 'ready',
    'grade_level', v_grade_level,
    'menu_number', v_cursor.menu_number,
    'day_number', v_cursor.day_number,
    'day_id', v_day_id,
    'day_status', v_day_status,
    'passages', v_passages
  );
end;
$$;

-- ---------------------------------------------------------
-- 7) RPC publique : lire les jauges du seul élève authentifié par code
-- ---------------------------------------------------------

create or replace function public.get_student_adventure_progress(
  p_access_code text,
  p_student_id bigint,
  p_student_code text
)
returns table (
  grade_folder_id text,
  adventure_tier integer,
  gauge_value integer,
  total_passages integer,
  total_questions integer,
  total_correct integer,
  total_wrong integer,
  first_encountered_at timestamptz,
  last_practiced_at timestamptz,
  mastered_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_student_id bigint;
begin
  v_student_id := public.resolve_history_student(p_access_code, p_student_id, p_student_code);
  if v_student_id is null then
    raise exception 'Code élève invalide.' using errcode = '28000';
  end if;

  return query
  select
    satp.grade_folder_id,
    satp.adventure_tier,
    satp.gauge_value::integer,
    satp.total_passages,
    satp.total_questions,
    satp.total_correct,
    satp.total_wrong,
    satp.first_encountered_at,
    satp.last_practiced_at,
    satp.mastered_at
  from public.student_adventure_tier_progress satp
  where satp.student_id = v_student_id
  order by satp.grade_folder_id, satp.adventure_tier;
end;
$$;

-- ---------------------------------------------------------
-- 8) Droits
-- ---------------------------------------------------------

grant select, insert, update, delete
on public.adventure_class_cursors
to authenticated;

grant select
on public.student_adventure_tier_progress,
   public.student_adventure_days,
   public.student_adventure_passages
to authenticated;

grant execute
on function public.open_student_adventure_day(text, bigint, text)
to anon, authenticated;

grant execute
on function public.get_student_adventure_progress(text, bigint, text)
to anon, authenticated;

commit;
