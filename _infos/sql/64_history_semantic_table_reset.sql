-- =========================================================
-- PATCH 64 — HISTORIQUE SÉMANTIQUE : TABLE RASE
-- À exécuter APRÈS 63_tujer_creations_foundation.sql.
--
-- Objectifs :
-- - supprimer définitivement toutes les anciennes tentatives d'historique ;
-- - conserver la progression Exploration déjà acquise comme baseline ;
-- - conserver les états Aventure / Missions existants ;
-- - n'accepter ensuite que le nouveau contrat d'historique sémantique
--   ({ "history": ... }) ou un instantané vide (outil pas encore raccordé).
--
-- Cette migration est volontairement destructive pour l'HISTORIQUE,
-- mais elle ne remet pas les progressions pédagogiques à zéro.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Figer la progression Exploration actuelle avant purge
-- ---------------------------------------------------------
-- Après la purge des sessions, cette baseline représente exactement tout ce
-- qui a été acquis avant le nouvel historique. Les nouvelles tentatives
-- viendront ensuite s'ajouter normalement lors des futurs recalculs.

insert into public.student_activity_progress_baseline (
  student_id,
  catalog_activity_id,
  total_sessions,
  total_questions,
  total_correct,
  total_wrong,
  current_level,
  level_played_at
)
select
  sap.student_id,
  sap.catalog_activity_id,
  greatest(0, coalesce(sap.total_sessions, 0)),
  greatest(0, coalesce(sap.total_questions, 0)),
  greatest(0, coalesce(sap.total_correct, 0)),
  greatest(0, coalesce(sap.total_wrong, 0)),
  greatest(1, least(5, coalesce(sap.current_level, 1))),
  sap.last_played_at
from public.student_activity_progress sap
on conflict (student_id, catalog_activity_id)
do update set
  total_sessions = excluded.total_sessions,
  total_questions = excluded.total_questions,
  total_correct = excluded.total_correct,
  total_wrong = excluded.total_wrong,
  current_level = excluded.current_level,
  level_played_at = excluded.level_played_at;

-- ---------------------------------------------------------
-- 2) Supprimer toutes les anciennes traces
-- ---------------------------------------------------------
-- Les questions sont supprimées en cascade. Les références de reprise vers
-- une tentative utilisent ON DELETE SET NULL ; l'état fonctionnel des
-- Missions et d'Aventure reste donc en place.

delete from public.student_activity_sessions;

-- ---------------------------------------------------------
-- 3) Interdire le retour des anciens snapshots
-- ---------------------------------------------------------
-- Un outil non encore raccordé au nouvel historique écrit {}.
-- Un outil raccordé écrit uniquement un objet racine { "history": {...} }.

alter table public.student_activity_session_questions
  drop constraint if exists student_activity_questions_question_history_contract_check,
  drop constraint if exists student_activity_questions_answer_history_contract_check,
  drop constraint if exists student_activity_questions_correction_history_contract_check;

alter table public.student_activity_session_questions
  add constraint student_activity_questions_question_history_contract_check
  check (
    question_snapshot = '{}'::jsonb
    or (
      jsonb_typeof(question_snapshot) = 'object'
      and question_snapshot ? 'history'
      and jsonb_typeof(question_snapshot -> 'history') = 'object'
    )
  ),
  add constraint student_activity_questions_answer_history_contract_check
  check (
    answer_snapshot = '{}'::jsonb
    or (
      jsonb_typeof(answer_snapshot) = 'object'
      and answer_snapshot ? 'history'
      and jsonb_typeof(answer_snapshot -> 'history') = 'object'
    )
  ),
  add constraint student_activity_questions_correction_history_contract_check
  check (
    correction_snapshot = '{}'::jsonb
    or (
      jsonb_typeof(correction_snapshot) = 'object'
      and correction_snapshot ? 'history'
      and jsonb_typeof(correction_snapshot -> 'history') = 'object'
    )
  );

commit;
