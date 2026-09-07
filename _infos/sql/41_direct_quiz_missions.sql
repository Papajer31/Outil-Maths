-- =========================================================
-- PATCH 41 — QUIZ ATTRIBUABLES DIRECTEMENT EN MISSION
-- À exécuter UNE FOIS dans le SQL Editor Supabase.
--
-- Objectif :
-- - conserver la création d'activités du Catalogue au super-admin ;
-- - permettre à un Quiz enseignant d'être une étape de Mission sans créer
--   d'activité Catalogue visible ;
-- - conserver un catalog_activity_id réel pour l'historique/progression ;
-- - autoriser les ressources du snapshot d'un Quiz dans une Mission active.
-- =========================================================

begin;

-- Support technique volontairement invisible dans l'arborescence publique.
insert into public.pedagogical_nodes (id, parent_id, name, node_type, display_order, is_active)
values ('system-runtime', null, 'Système', 'discipline', 9999, false)
on conflict (id) do update set is_active = false;

insert into public.pedagogical_nodes (id, parent_id, name, node_type, display_order, is_active)
values ('system-runtime.d.quiz', 'system-runtime', 'Quiz', 'domain', 0, false)
on conflict (id) do update set parent_id = excluded.parent_id, is_active = false;

insert into public.pedagogical_nodes (id, parent_id, name, node_type, display_order, is_active)
values ('system-runtime.t.quiz', 'system-runtime.d.quiz', 'Runtime', 'theme', 0, false)
on conflict (id) do update set parent_id = excluded.parent_id, is_active = false;

insert into public.pedagogical_nodes (id, parent_id, name, node_type, display_order, is_active)
values ('system-runtime.o.quiz-direct', 'system-runtime.t.quiz', 'Quiz direct', 'learning_objective', 0, false)
on conflict (id) do update set parent_id = excluded.parent_id, is_active = false;

insert into public.pedagogical_nodes (id, parent_id, name, node_type, display_order, is_active)
values ('system-runtime.o.quiz-direct.ce1', 'system-runtime.o.quiz-direct', 'CE1', 'grade_level', 0, false)
on conflict (id) do update set parent_id = excluded.parent_id, is_active = false;

insert into public.catalog_activities (
  id,
  pedagogical_node_id,
  tool_id,
  title,
  description,
  adventure_tier,
  display_order,
  status,
  default_visible,
  levels_json
)
values (
  'system.quiz.direct',
  'system-runtime.o.quiz-direct.ce1',
  'quiz',
  'Quiz direct (runtime)',
  'Support technique des Quiz attribués directement dans une Mission.',
  1,
  0,
  'published',
  false,
  '{"1":{"settings":{}},"2":{"settings":{}},"3":{"settings":{}},"4":{"settings":{}},"5":{"settings":{}}}'::jsonb
)
on conflict (id) do update set
  pedagogical_node_id = excluded.pedagogical_node_id,
  tool_id = excluded.tool_id,
  title = excluded.title,
  description = excluded.description,
  status = 'published',
  default_visible = false,
  updated_at = now();

-- Étend l'accès élève aux ressources explicitement figées dans une étape
-- de Quiz direct appartenant à une Mission active. Le contrôle de propriétaire
-- empêche un enseignant d'exposer la ressource privée d'un autre espace.
create or replace function public.is_public_catalog_quiz_resource(p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.quiz_resources qr
      join public.quizzes q on q.id = qr.quiz_id
      join public.catalog_activities ca
        on ca.status = 'published'
       and ca.tool_id = 'quiz'
      cross join lateral jsonb_each(ca.levels_json) as level(level_key, level_value)
      where qr.resource_id = p_resource_id
        and (level.level_value #>> '{settings,quizId}') = q.id::text
    )
    or
    exists (
      select 1
      from public.mission_steps ms
      join public.missions m on m.id = ms.mission_id
      join public.resources r on r.id = p_resource_id
      where ms.catalog_activity_id = 'system.quiz.direct'
        and m.status = 'active'
        and jsonb_typeof(ms.step_options_json #> '{direct_quiz,resource_ids}') = 'array'
        and (ms.step_options_json #> '{direct_quiz,resource_ids}') ? p_resource_id::text
        and (
          r.is_system = true
          or r.teacher_space_id = m.teacher_space_id
        )
    );
$$;

revoke all on function public.is_public_catalog_quiz_resource(uuid) from public;
grant execute on function public.is_public_catalog_quiz_resource(uuid) to anon, authenticated;

commit;
