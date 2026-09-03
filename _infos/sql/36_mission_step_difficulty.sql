-- 36_mission_step_difficulty.sql
-- Difficulté par étape de Mission : Adaptative ou niveau fixe N1..N5.
-- À exécuter APRÈS 35_external_activity_execution_limits.sql.
--
-- Le schéma mission_steps possédait déjà difficulty_mode / difficulty_level.
-- Cette migration ne crée donc aucune colonne : elle complète uniquement la
-- persistance du dernier niveau des étapes adaptatives.

create or replace function public.apply_activity_attempt_progress(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_run public.student_activity_sessions%rowtype;
  v_passage public.student_adventure_passages%rowtype;
  v_grade_folder_id text;
  v_adventure_tier integer;
  v_required_count integer := 0;
  v_required_completed integer := 0;
begin
  select * into v_run
  from public.student_activity_sessions
  where id = p_session_id
  for update;

  if not found or v_run.progress_applied = true then
    return;
  end if;

  -- Exploration : comportement historique inchangé.
  if v_run.context = 'exploration' and v_run.questions_count > 0 then
    insert into public.student_activity_progress (
      student_id,
      catalog_activity_id,
      current_level,
      total_sessions,
      total_questions,
      total_correct,
      total_wrong,
      last_played_at
    ) values (
      v_run.student_id,
      v_run.catalog_activity_id,
      v_run.ended_level,
      1,
      v_run.questions_count,
      v_run.correct_count,
      v_run.wrong_count,
      coalesce(v_run.ended_at, now())
    )
    on conflict (student_id, catalog_activity_id) do update
    set current_level = excluded.current_level,
        total_sessions = public.student_activity_progress.total_sessions + 1,
        total_questions = public.student_activity_progress.total_questions + excluded.total_questions,
        total_correct = public.student_activity_progress.total_correct + excluded.total_correct,
        total_wrong = public.student_activity_progress.total_wrong + excluded.total_wrong,
        last_played_at = excluded.last_played_at,
        updated_at = now();
  end if;

  -- Mission adaptative : le dernier niveau atteint devient le niveau mémorisé
  -- de cette activité. On ne mélange pas pour autant les compteurs de Mission
  -- avec les statistiques d'Exploration : seuls current_level et last_played_at
  -- sont mis à jour ici. Une tentative interrompue peut donc reprendre plus tard
  -- au niveau qu'elle avait réellement atteint.
  if v_run.context = 'mission'
     and v_run.questions_count > 0
     and v_run.mission_id is not null
     and v_run.mission_step_id is not null
     and exists (
       select 1
       from public.mission_steps ms
       where ms.id = v_run.mission_step_id
         and ms.mission_id = v_run.mission_id
         and ms.difficulty_mode = 'adaptive'
     ) then
    insert into public.student_activity_progress (
      student_id,
      catalog_activity_id,
      current_level,
      total_sessions,
      total_questions,
      total_correct,
      total_wrong,
      last_played_at
    ) values (
      v_run.student_id,
      v_run.catalog_activity_id,
      v_run.ended_level,
      0,
      0,
      0,
      0,
      coalesce(v_run.ended_at, now())
    )
    on conflict (student_id, catalog_activity_id) do update
    set current_level = excluded.current_level,
        last_played_at = excluded.last_played_at,
        updated_at = now();
  end if;

  -- Mission : une étape terminée est mémorisée indépendamment de l'historique.
  if v_run.context = 'mission'
     and v_run.status = 'completed'
     and v_run.mission_id is not null
     and v_run.mission_step_id is not null
     and exists (
       select 1
       from public.mission_steps ms
       where ms.id = v_run.mission_step_id
         and ms.mission_id = v_run.mission_id
     ) then
    insert into public.student_mission_step_progress (
      student_id,
      mission_id,
      mission_step_id,
      completed_at,
      last_attempt_id
    ) values (
      v_run.student_id,
      v_run.mission_id,
      v_run.mission_step_id,
      coalesce(v_run.ended_at, now()),
      v_run.id
    )
    on conflict (student_id, mission_step_id) do update
    set mission_id = excluded.mission_id,
        last_attempt_id = excluded.last_attempt_id,
        updated_at = now();
  end if;

  -- Aventure : comportement du patch 31 conservé à l'identique.
  if v_run.context = 'adventure' then
    select sap.* into v_passage
    from public.student_adventure_passages sap
    join public.student_adventure_days sad on sad.id = sap.adventure_day_id
    where sap.activity_attempt_id = v_run.id
      and sad.student_id = v_run.student_id
    for update of sap;

    if found then
      if v_run.status = 'completed' then
        select ca.pedagogical_node_id, ca.adventure_tier
          into v_grade_folder_id, v_adventure_tier
        from public.catalog_activities ca
        where ca.id = v_run.catalog_activity_id;

        if v_grade_folder_id is null or v_adventure_tier is null then
          raise exception 'Activité Aventure sans dossier de niveau ou palier.' using errcode = '22023';
        end if;

        insert into public.student_adventure_tier_progress (
          student_id,
          grade_folder_id,
          adventure_tier,
          gauge_value,
          total_passages,
          total_questions,
          total_correct,
          total_wrong,
          first_encountered_at,
          last_practiced_at
        ) values (
          v_run.student_id,
          v_grade_folder_id,
          v_adventure_tier,
          0,
          1,
          0,
          0,
          0,
          coalesce(v_run.started_at, now()),
          coalesce(v_run.ended_at, now())
        )
        on conflict (student_id, grade_folder_id, adventure_tier) do update
        set total_passages = public.student_adventure_tier_progress.total_passages + 1,
            last_practiced_at = coalesce(excluded.last_practiced_at, now()),
            updated_at = now();

        update public.student_adventure_passages
        set status = 'completed',
            started_at = coalesce(started_at, v_run.started_at, now()),
            completed_at = coalesce(completed_at, v_run.ended_at, now()),
            adventure_tier = coalesce(adventure_tier, v_adventure_tier)
        where id = v_passage.id;

        select
          count(*) filter (where sap.passage_type = 'required'),
          count(*) filter (where sap.passage_type = 'required' and sap.status = 'completed')
          into v_required_count, v_required_completed
        from public.student_adventure_passages sap
        where sap.adventure_day_id = v_passage.adventure_day_id;

        -- MVP rentrée : les 4 adaptatifs sont différés. Dès que les six
        -- obligatoires sont terminés, ils sont explicitement ignorés.
        if v_required_count = 6 and v_required_completed = 6 then
          update public.student_adventure_passages
          set status = 'skipped',
              completed_at = coalesce(completed_at, now())
          where adventure_day_id = v_passage.adventure_day_id
            and passage_type = 'adaptive'
            and status in ('pending', 'interrupted');

          update public.student_adventure_days
          set status = 'completed',
              completed_at = coalesce(completed_at, now())
          where id = v_passage.adventure_day_id
            and status <> 'completed';
        end if;
      else
        update public.student_adventure_passages
        set status = 'interrupted',
            started_at = coalesce(started_at, v_run.started_at, now()),
            completed_at = null
        where id = v_passage.id
          and status <> 'completed';
      end if;
    end if;
  end if;

  update public.student_activity_sessions
  set progress_applied = true
  where id = p_session_id;
end;
$$;

revoke all on function public.apply_activity_attempt_progress(uuid) from public, anon, authenticated;
