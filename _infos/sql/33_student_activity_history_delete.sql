-- =========================================================
-- 33_student_activity_history_delete.sql
-- Suppression contrôlée d’une tentative depuis l’historique enseignant.
-- À exécuter une seule fois après le patch Historique élèves.
--
-- La suppression d’une session supprime en cascade ses questions détaillées.
-- Elle NE recalcule PAS les progressions / jauges déjà appliquées.
-- =========================================================

begin;

alter table public.student_activity_sessions enable row level security;

drop policy if exists student_activity_sessions_delete_own on public.student_activity_sessions;
create policy student_activity_sessions_delete_own
on public.student_activity_sessions
for delete
to authenticated
using (
  exists (
    select 1
    from public.students s
    join public.teacher_classes tc on tc.id = s.teacher_class_id
    join public.teacher_spaces ts on ts.id = tc.teacher_space_id
    where s.id = student_activity_sessions.student_id
      and ts.owner_user_id = auth.uid()
  )
);

grant delete on public.student_activity_sessions to authenticated;

commit;
