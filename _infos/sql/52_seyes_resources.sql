-- Autorise les documents propriétaires de la mini-app Seyès dans Mes ressources.

alter table public.resources
  drop constraint if exists resources_resource_type_check;

alter table public.resources
  add constraint resources_resource_type_check
  check (resource_type in ('image', 'audio', 'seyes'));
