-- =========================================================
-- PATCH 08 — RESSOURCES DE QUIZ DANS LE RUNTIME ÉLÈVE
-- À exécuter UNE FOIS dans le SQL Editor Supabase.
--
-- Le bucket teacher-resources reste privé. Cette règle n’ouvre aux
-- visiteurs anonymes que les ressources effectivement référencées par
-- un quiz utilisé dans une activité du Catalogue publiée.
-- =========================================================

begin;

-- Une politique RLS ne peut pas consulter directement quiz_resources et
-- quizzes ici : leurs propres RLS masquent ces tables au rôle anon. Les deux
-- fonctions ci-dessous effectuent uniquement cette vérification, en tant que
-- propriétaire des tables, sans exposer aucune donnée.
create or replace function public.is_public_catalog_quiz_resource(p_resource_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.quiz_resources qr
    join public.quizzes q on q.id = qr.quiz_id
    join public.catalog_activities ca
      on ca.status = 'published'
     and ca.tool_id = 'quiz'
    cross join lateral jsonb_each(ca.levels_json) as level(level_key, level_value)
    where qr.resource_id = p_resource_id
      and (level.level_value #>> '{settings,quizId}') = q.id::text
  );
$$;

create or replace function public.is_public_catalog_quiz_storage_object(
  p_bucket text,
  p_path text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.resources r
    where r.storage_bucket = p_bucket
      and r.storage_path = p_path
      and public.is_public_catalog_quiz_resource(r.id)
  );
$$;

revoke all on function public.is_public_catalog_quiz_resource(uuid) from public;
revoke all on function public.is_public_catalog_quiz_storage_object(text, text) from public;
grant execute on function public.is_public_catalog_quiz_resource(uuid) to anon, authenticated;
grant execute on function public.is_public_catalog_quiz_storage_object(text, text) to anon, authenticated;

-- L’application élève doit d’abord lire les métadonnées de la ressource
-- afin de demander une URL signée au bucket privé.
drop policy if exists resources_select_public_catalog_quiz on public.resources;
create policy resources_select_public_catalog_quiz
on public.resources
for select
to anon
using (
  public.is_public_catalog_quiz_resource(resources.id)
);

-- createSignedUrl vérifie les droits SELECT sur storage.objects. L’objet
-- reste privé : seul le lien signé, temporaire, est remis au navigateur.
drop policy if exists teacher_resources_select_public_catalog_quiz on storage.objects;
create policy teacher_resources_select_public_catalog_quiz
on storage.objects
for select
to anon
using (
  bucket_id = 'teacher-resources'
  and public.is_public_catalog_quiz_storage_object(bucket_id, name)
);

grant select on public.resources to anon;

commit;
