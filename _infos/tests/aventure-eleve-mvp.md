# Test rapide — Aventure élève MVP

Pré-requis :
- patch SQL 31 déjà exécuté ;
- Aventure activée pour la classe et le niveau de l'élève ;
- curseur placé sur un jour contenant exactement 6 cases de type « Activité » valides.

## Test principal

1. Ouvrir le site élève, choisir le mode individuel, l'élève puis saisir son code.
2. Vérifier que la planète « Aventure » est cliquable.
3. Cliquer sur « Aventure » : l'écran doit proposer « Commencer · 1/6 » avec le nom de l'activité prévue.
4. Lancer l'activité via l'écran fusée puis la terminer.
5. Cliquer sur « Retour aux activités » : l'écran Aventure doit maintenant proposer « Commencer · 2/6 » et afficher « 1 activité terminée sur 6 ».
6. Terminer les 5 passages suivants.
7. Après le sixième, vérifier le message « Ton Aventure du jour est terminée. ».

## Reprise

1. Sur un nouveau jour ou avec un autre élève, commencer le passage 1.
2. Quitter l'activité en cours et confirmer l'abandon.
3. Revenir dans Aventure : le même passage doit être proposé avec « Reprendre ».
4. Le relancer : son niveau de départ doit reprendre le dernier niveau atteint dans cette activité en contexte Aventure.

## Vérifications utiles dans Supabase

Après quelques réponses, contrôler si besoin :
- `student_activity_sessions.context = 'adventure'` ;
- le passage courant dans `student_adventure_passages` passe de `pending` à `running`, puis `completed` ;
- `student_adventure_tier_progress.gauge_value` évolue et reste entre 0 et 50 ;
- après 6 activités, la journée est `completed` et les passages 7 à 10 sont `skipped`.
