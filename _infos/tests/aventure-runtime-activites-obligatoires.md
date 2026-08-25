# Validation — runtime MVP Aventure / activités obligatoires

Date : 2026-08-22.

Ce test concerne uniquement le patch SQL `31_adventure_required_activity_runtime.sql`. Le client élève n’est pas encore branché par ce patch : les RPC peuvent être testées depuis Supabase ou depuis un appel manuel.

## 1. Déploiement

1. Sauvegarder la base.
2. Vérifier que les migrations historiques jusqu’aux fondations Aventure sont déjà présentes.
3. Exécuter uniquement `31_adventure_required_activity_runtime.sql`.
4. Vérifier l’absence d’erreur SQL.
5. Vérifier que `student_activity_session_questions.points_awarded` accepte désormais les valeurs négatives.

## 2. Menu MVP

1. Préparer un jour avec six activités publiées précises du bon niveau.
2. Activer Aventure et positionner le curseur sur ce jour.
3. Appeler `open_student_adventure_day`.
4. Vérifier `availability = "ready"`.
5. Vérifier six passages `required/activity`, puis quatre passages `adaptive`.
6. Vérifier que chaque passage obligatoire contient `adventure_tier` et `started_level = 2` si l’activité n’a jamais été faite en Aventure.

Préparer ensuite un nouveau jour contenant au moins une case `objective` : pour un élève qui n’a pas encore ouvert ce jour, la RPC doit répondre `availability = "menu_requires_activities"`.

## 3. Gel réel d’une journée

1. Ouvrir une journée valide pour un élève et relever son `day_id` et ses six activités.
2. Modifier ensuite le menu enseignant correspondant, y compris en vidant une case.
3. Rappeler `open_student_adventure_day` pour le même élève sans changer le curseur.
4. Vérifier que la RPC renvoie toujours le même `day_id` et exactement les mêmes passages figés.

## 4. Première tentative Aventure

Pour le passage 1, appeler `start_student_activity_attempt` avec :

- `context = 'adventure'` ;
- l’activité du passage ;
- `metadata_json = {"adventure_passage_id":"<id passage 1>"}`.

Vérifier :

- la tentative est créée avec `started_level = 2` et `ended_level = 2` ;
- le passage passe à `running` ;
- `activity_attempt_id` pointe vers la tentative ;
- une ligne `student_adventure_tier_progress` existe pour élève + dossier de niveau + palier, avec jauge `0`.

Un lancement Aventure sans `adventure_passage_id`, avec le passage d’un autre élève ou avec une autre activité doit être refusé.

## 5. Matrice lente — exemples minimaux

Sur une jauge initiale `0` :

1. enregistrer une bonne réponse présentée au niveau 2 ;
2. vérifier `points_awarded = 2` dans la question et jauge `2` ;
3. vérifier que `ended_level = 3` dans la tentative ;
4. renvoyer exactement la même question avec le même `question_index` ;
5. vérifier que la jauge reste `2` et que les compteurs ne doublent pas.

Poursuivre avec des questions permettant de contrôler au moins un cas de chaque tranche :

- jauge 0–10 ;
- 11–20 ;
- 21–30 avec erreur niveau 1 = `-1` ;
- 31–40 avec erreur niveau 1 = `-2` et niveau 2 = `-1` ;
- 41–50 avec erreur niveau 1 = `-3`, niveau 2 = `-2`, niveau 3 = `-1`.

Vérifier aussi le bornage : aucune jauge sous `0` ni au-dessus de `50` ; `points_awarded` doit représenter la variation réellement appliquée après bornage.

## 6. Niveau de question imposé par le serveur

1. Après une bonne réponse N2, la tentative doit être au niveau 3.
2. Tenter d’enregistrer la question suivante comme si elle avait été présentée au niveau 4 : refus attendu.
3. Enregistrer correctement une erreur N3 : `ended_level` doit devenir 2.
4. Terminer/interrompre la tentative.
5. Rappeler `open_student_adventure_day` : `started_level` de cette activité doit désormais valoir 2.

Le niveau Exploration de la même activité ne doit jamais intervenir.

## 7. Interruption et reprise du passage

1. Démarrer un passage et enregistrer au moins une question.
2. Finaliser la tentative en `interrupted` ou démarrer une autre tentative pour forcer l’interruption de la précédente.
3. Vérifier que le passage devient `interrupted`, sans incrémenter `total_passages`.
4. Relancer le même passage avec un nouvel identifiant de tentative.
5. Vérifier que le nouveau niveau initial correspond au dernier `ended_level` Aventure sauvegardé.

## 8. Passage terminé

1. Finaliser une tentative en `completed`.
2. Vérifier le passage en `completed` avec `completed_at`.
3. Vérifier `total_passages + 1` une seule fois.
4. Répéter l’appel de finalisation : aucun double comptage.

## 9. Fin de journée MVP

1. Terminer successivement les six passages obligatoires.
2. Après le cinquième, la journée reste `in_progress`.
3. Après le sixième :
   - les quatre passages adaptatifs passent à `skipped` ;
   - la journée passe à `completed` ;
   - `completed_at` est renseigné.
4. Rappeler `open_student_adventure_day` : la même journée terminée doit être renvoyée, sans recréation.

## 10. Non-régression

Après déploiement du SQL 31, vérifier au minimum :

- une activité Exploration démarre et conserve sa progression habituelle ;
- l’historique détaillé Exploration continue de fonctionner ;
- une Mission continue de démarrer et d’enregistrer ses questions ;
- aucune jauge Aventure n’est modifiée par Exploration ou Mission.
