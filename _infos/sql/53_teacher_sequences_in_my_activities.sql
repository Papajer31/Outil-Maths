-- =========================================================
-- PATCH 53 — SÉQUENCES DANS « MES ACTIVITÉS »
-- À exécuter APRÈS 50_teacher_sequences.sql.
--
-- Les séquences deviennent des objets de l’explorateur personnel :
-- elles peuvent être rangées dans les mêmes dossiers que les activités.
-- =========================================================

begin;

alter table public.teacher_sequences
  add column if not exists folder_id uuid null,
  add column if not exists display_order integer not null default 0;

-- FK vers les dossiers de Mes activités : lorsqu’un dossier est supprimé,
-- la séquence est conservée et revient à la racine.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teacher_sequences_folder_id_fkey'
      and conrelid = 'public.teacher_sequences'::regclass
  ) then
    alter table public.teacher_sequences
      add constraint teacher_sequences_folder_id_fkey
      foreign key (folder_id)
      references public.teacher_activity_folders(id)
      on delete set null;
  end if;
end;
$$;

alter table public.teacher_sequences
  drop constraint if exists teacher_sequences_display_order_check;

alter table public.teacher_sequences
  add constraint teacher_sequences_display_order_check
  check (display_order >= 0);

create index if not exists teacher_sequences_space_folder_order_idx
on public.teacher_sequences (teacher_space_id, folder_id, display_order, title_normalized);

-- Les séquences déjà présentes restent à la racine, dans un ordre stable.
with ranked as (
  select id,
         (row_number() over (
           partition by teacher_space_id, folder_id
           order by created_at, title_normalized, id
         ) - 1)::integer as next_order
  from public.teacher_sequences
)
update public.teacher_sequences seq
set display_order = ranked.next_order
from ranked
where ranked.id = seq.id;

commit;
