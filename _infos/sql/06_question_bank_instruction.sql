-- HISTORIQUE UNIQUEMENT — NE PAS REJOUER SUR LA BASE ACTUELLE.
-- La table question_banks a été supprimée le 24/07/2026.
-- Ajoute une consigne globale obligatoire au niveau applicatif pour toutes les banques.
-- Les banques existantes reçoivent temporairement une chaîne vide et devront être
-- complétées lors de leur prochain enregistrement dans l’éditeur.

alter table public.question_banks
add column if not exists instruction text not null default '';
