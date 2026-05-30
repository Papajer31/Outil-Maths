-- =========================================================
-- RESET DESTRUCTIF OPTIONNEL
-- À exécuter uniquement si tu acceptes de perdre les données.
-- Faire un backup Supabase avant.
-- =========================================================

begin;

-- Fonctions RPC / triggers connues

drop function if exists public.access_code_exists(text) cascade;
drop function if exists public.get_space_classes(text) cascade;
drop function if exists public.get_space_students(text) cascade;
drop function if exists public.verify_student_code(text, bigint, text) cascade;
drop function if exists public.get_space_activities(text) cascade;
drop function if exists public.get_activity_config(text, text) cascade;
drop function if exists public.get_space_activity_folders(text) cascade;
drop function if exists public.get_catalog_visibility_for_space(text) cascade;
drop function if exists public.get_space_missions(text, bigint[], boolean) cascade;
drop function if exists public.get_space_mission_steps(text, uuid) cascade;
drop function if exists public.get_space_vocabulary_words(text) cascade;
drop function if exists public.get_question_bank_items_for_space(text, uuid) cascade;
drop function if exists public.get_conjugation_personal_list(text, uuid) cascade;
drop function if exists public.replace_question_bank_items(uuid, jsonb) cascade;
drop function if exists public.replace_teacher_vocabulary_words(bigint, jsonb) cascade;
drop function if exists public.reset_teacher_vocabulary_words(bigint) cascade;
drop function if exists public.record_catalog_activity_result(text, bigint, text, text, boolean) cascade;

-- Fonctions utilitaires / triggers

drop function if exists public.set_updated_at() cascade;
drop function if exists public.random_student_code() cascade;
drop function if exists public.set_student_code() cascade;
drop function if exists public.validate_mission_folder_parent() cascade;
drop function if exists public.validate_mission_folder_ref() cascade;
drop function if exists public.validate_mission_assignment() cascade;
drop function if exists public.validate_question_bank_folder_parent() cascade;
drop function if exists public.validate_question_bank_folder() cascade;
drop function if exists public.copy_default_vocabulary_words_to_teacher_space() cascade;
drop function if exists public.set_teacher_conjugation_lists_updated_at() cascade;

-- Anciennes migrations Encodage ponctuelles

drop function if exists public.encodage_v2_graph_id(text) cascade;
drop function if exists public.encodage_v2_migrate_graph_order(jsonb) cascade;
drop function if exists public.encodage_v2_migrate_config_json(jsonb) cascade;

-- Tables nouvelles / cibles

drop table if exists public.student_catalog_activity_attempts cascade;
drop table if exists public.student_catalog_activity_levels cascade;
drop table if exists public.mission_assignments cascade;
drop table if exists public.mission_steps cascade;
drop table if exists public.missions cascade;
drop table if exists public.mission_folders cascade;
drop table if exists public.catalog_activity_visibility cascade;

-- Tables de ressources / banques

drop table if exists public.teacher_conjugation_lists cascade;
drop table if exists public.teacher_phonology_presets cascade;
drop table if exists public.teacher_vocabulary_words cascade;
drop table if exists public.vocabulary_default_words cascade;
drop table if exists public.question_bank_items cascade;
drop table if exists public.question_banks cascade;
drop table if exists public.question_bank_folders cascade;
drop table if exists public.phonology_words cascade;
drop table if exists public.image_assets cascade;

-- Anciennes tables activités

drop table if exists public.activity_configs cascade;
drop table if exists public.activity_folders cascade;

-- Socle

drop table if exists public.students cascade;
drop table if exists public.teacher_classes cascade;
drop table if exists public.teacher_spaces cascade;

commit;
