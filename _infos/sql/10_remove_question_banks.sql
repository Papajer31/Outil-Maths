-- =========================================================
-- PATCH 10 — SUPPRESSION DÉFINITIVE DES ANCIENNES BANQUES
-- À exécuter UNE FOIS dans le SQL Editor Supabase.
--
-- Prérequis :
--   1) l’application déployée ne doit plus appeler les banques ;
--   2) les activités utilisant les anciens outils doivent avoir été supprimées ;
--   3) les données à conserver doivent avoir été exportées avant exécution.
--
-- Cette migration est destructive et ne prévoit aucune rétrocompatibilité.
-- Elle n’utilise volontairement pas CASCADE : toute dépendance inconnue fait
-- échouer la transaction au lieu d’être supprimée silencieusement.
-- =========================================================

begin;

-- ---------------------------------------------------------
-- 1) Garde-fou : aucun ancien outil ne doit rester au Catalogue
-- ---------------------------------------------------------

do $$
declare
  v_remaining_activities text;
begin
  if to_regclass('public.catalog_activities') is not null then
    select string_agg(
      format('%s [%s]', ca.id, ca.tool_id),
      ', '
      order by ca.id
    )
    into v_remaining_activities
    from public.catalog_activities ca
    where ca.tool_id in (
      'question-reponse',
      'qcm',
      'selection',
      'flash-question-reponse',
      'flash-qcm'
    );

    if v_remaining_activities is not null then
      raise exception using
        message = 'Suppression des banques annulée : des activités utilisant les anciens outils existent encore.',
        detail = v_remaining_activities,
        hint = 'Supprimez définitivement ces activités du Catalogue, puis relancez cette migration.';
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------
-- 2) Information sur les données qui vont être supprimées
-- ---------------------------------------------------------

do $$
declare
  v_folders_count bigint := 0;
  v_banks_count bigint := 0;
  v_items_count bigint := 0;
begin
  if to_regclass('public.question_bank_folders') is not null then
    execute 'select count(*) from public.question_bank_folders'
      into v_folders_count;
  end if;

  if to_regclass('public.question_banks') is not null then
    execute 'select count(*) from public.question_banks'
      into v_banks_count;
  end if;

  if to_regclass('public.question_bank_items') is not null then
    execute 'select count(*) from public.question_bank_items'
      into v_items_count;
  end if;

  raise notice 'Suppression banques : % dossier(s), % banque(s), % élément(s).',
    v_folders_count,
    v_banks_count,
    v_items_count;
end;
$$;

-- ---------------------------------------------------------
-- 3) Retrait des triggers qui dépendent des fonctions métier
-- ---------------------------------------------------------

do $$
begin
  if to_regclass('public.question_banks') is not null then
    execute 'drop trigger if exists trg_validate_question_bank_folder on public.question_banks';
  end if;

  if to_regclass('public.question_bank_folders') is not null then
    execute 'drop trigger if exists trg_validate_question_bank_folder_parent on public.question_bank_folders';
  end if;
end;
$$;

-- Les triggers updated_at, les politiques RLS, les index et les contraintes
-- sont attachés aux tables et disparaîtront automatiquement avec elles.

-- ---------------------------------------------------------
-- 4) Suppression des RPC et fonctions propres aux banques
-- ---------------------------------------------------------

drop function if exists public.get_question_bank_items_for_space(text, uuid);
drop function if exists public.replace_question_bank_items(uuid, jsonb);
drop function if exists public.validate_question_bank_folder();
drop function if exists public.validate_question_bank_folder_parent();

-- ---------------------------------------------------------
-- 5) Suppression des tables, dans l’ordre des dépendances
-- ---------------------------------------------------------

drop table if exists public.question_bank_items restrict;
drop table if exists public.question_banks restrict;
drop table if exists public.question_bank_folders restrict;

-- ---------------------------------------------------------
-- 6) Vérification finale dans la même transaction
-- ---------------------------------------------------------

do $$
begin
  if to_regclass('public.question_bank_items') is not null
     or to_regclass('public.question_banks') is not null
     or to_regclass('public.question_bank_folders') is not null
     or to_regprocedure('public.get_question_bank_items_for_space(text,uuid)') is not null
     or to_regprocedure('public.replace_question_bank_items(uuid,jsonb)') is not null
     or to_regprocedure('public.validate_question_bank_folder()') is not null
     or to_regprocedure('public.validate_question_bank_folder_parent()') is not null then
    raise exception 'La suppression des objets Supabase liés aux banques est incomplète.';
  end if;
end;
$$;

commit;
