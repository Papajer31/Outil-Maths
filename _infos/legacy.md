# Historique et éléments supprimés

Dernière mise à jour : 2026-08-07.

Ce fichier résume les choix abandonnés et les migrations achevées. Ils ne doivent plus piloter les nouveaux développements.

## Activités personnelles historiques

Le modèle `activity_configs` / `activity_folders` n’est plus le modèle produit. Le dashboard repose sur Exploration, Missions et Quiz.

## Anciennes banques de questions

Les tables `question_banks`, `question_bank_items` et `question_bank_folders`, leurs API et leurs politiques ont été supprimées le 24 juillet 2026 avec `10_remove_question_banks.sql`.

Les anciens outils `question-reponse`, `qcm`, `selection`, `flash-question-reponse` et `flash-qcm` ont également été retirés. Le QCM texte et la sélection de mots ont été recréés comme éléments internes au Quiz. Aucune rétrocompatibilité n’est prévue.

## Ancienne portée de niveaux

`grade_scope_mode`, `grade_levels` et l’héritage depuis les parents ont été remplacés par un nœud terminal `grade_level` sous chaque objectif d’apprentissage. La migration contrôlée a sauvegardé les anciens nœuds et rattachements avant reconstruction.

## Ancien registre Aventure

`adventure_objective_registry` et `teacher_adventure_objectives` documentent une étape intermédiaire. Les menus hebdomadaires et les curseurs de classe portent désormais le fonctionnement actif.

## Anciennes ressources statiques

Le catalogue `shared/tool-assets/manifest.json` et son chargeur ont été supprimés en août 2026. Toutes les ressources pédagogiques vivent désormais dans Supabase. Les fichiers locaux conservés sont exclusivement des assets techniques explicitement chargés par les outils.

## Monnaie

L’ancien outil monolithique `monnaie` a été remplacé par `monnaie-representation`. Les autres situations devront être créées sous forme d’outils autonomes.

## SQL historiques

Les SQL restent conservés pour retracer l’évolution de la base. Les scripts qui créaient les banques ou d’anciens modèles ne doivent jamais être rejoués sur la base actuelle. Voir `sql/README.md`.
