# Contrat d’exécution et historique des activités

Dernière mise à jour : 2026-08-30.

## Périmètre du premier socle

Le runtime élève produit désormais un historique commun pour les activités individuelles lancées depuis :

- `exploration` ;
- `mission` ;
- `adventure` lorsque ce mode sera activé plus tard.

Le mode Aventure n’est pas encore affiché et aucun calcul de jauge de compétence n’est réalisé dans ce patch. Le champ `points_awarded` existe déjà mais vaut donc `0` pour le moment.

Les séances de groupe, les tests Catalogue, les projections et les sessions partagées ne créent pas encore de détail individuel : l’attribution fiable à un élève devra être traitée séparément.

## Tentative d’activité

Une tentative correspond au lancement d’une activité Catalogue pour un élève identifié.

Elle contient notamment :

- l’activité et son contexte de lancement ;
- l’étape de Mission éventuelle ;
- l’outil exécuté ;
- le niveau de départ et le niveau final ;
- le nombre de questions répondues, justes et fausses ;
- la durée active ;
- un instantané compact des réglages de passation ;
- un statut : `running`, `completed`, `interrupted` ou `abandoned`.

Les statuts ont le sens suivant :

- `running` : tentative ouverte ;
- `completed` : fin normale de l’activité, y compris fin par temps prévu ;
- `abandoned` : l’élève a explicitement choisi de quitter ou de changer d’activité avant la fin ;
- `interrupted` : coupure non volontaire ou tentative laissée ouverte. Une ancienne tentative `running` est automatiquement classée `interrupted` au prochain lancement de l’élève.

Un identifiant client UUID rend l’ouverture idempotente et évite de créer deux tentatives si une même requête est rejouée.

## Résultat d’une question

Chaque question produit une ligne indépendante contenant :

- son index dans la tentative ;
- le niveau réellement présenté ;
- le niveau obtenu après la réponse ;
- le résultat `correct`, `incorrect` ou `unanswered` ;
- les points attribués ;
- le temps actif de réponse, hors correction et hors pause explicite ;
- un instantané de la question ;
- un instantané de la réponse de l’élève ;
- un instantané de la correction.

Le niveau est propre au couple élève–activité et enregistré après chaque réponse. Si la dernière question est ratée, la baisse est sauvegardée immédiatement et devient le niveau de départ de la prochaine tentative de cette même activité. Un autre outil ou une autre activité conserve son propre niveau indépendant.

Une question abandonnée avant validation est enregistrée `unanswered` et ne modifie pas le niveau.

## Instantanés

Le contrat runtime accepte un hook optionnel :

```js
getHistorySnapshot(stage, container, context)
```

`stage` vaut `question`, `answer` ou `correction`.

Un outil peut ainsi retourner un objet sémantique correspondant exactement à ses données générées. Sans hook spécifique, le moteur utilise un repli DOM compact qui conserve :

- le texte visible ;
- les champs et valeurs ;
- les choix et leurs états ;
- les métadonnées des images et audios ;
- les dimensions des canevas.

Aucun HTML complet, fichier binaire, image en base64, URL temporaire signée ou capture d’écran n’est conservé. Chaque instantané et chaque configuration sont limités en taille pour protéger la base.

Les outils très graphiques pourront progressivement ajouter leur hook sémantique sans changer le schéma ni le moteur commun.

## Écriture et résilience

L’ordre d’écriture est garanti pour une tentative :

1. ouverture de la tentative ;
2. enregistrement séquentiel de chaque question ;
3. finalisation de la tentative.

La progression d’Exploration est mise à jour à chaque question juste ou fausse, sans attendre la fermeture de l’activité. Les compteurs cumulés sont appliqués une seule fois lors de la finalisation, ou lors du classement automatique d’une tentative interrompue.

Une tentative Mission est acceptée uniquement si :

- la Mission est active ;
- l’étape correspond à l’activité lancée ;
- la Mission appartient au même espace enseignant ;
- elle est attribuée à l’élève ou à sa classe.

## Tables et RPC

Tables actives :

- `student_activity_sessions` : une ligne par tentative ;
- `student_activity_session_questions` : une ligne par question ;
- `student_activity_progress` : niveau courant et compteurs légers d’Exploration.

RPC publiques :

- `start_student_activity_attempt` ;
- `record_student_activity_attempt_question` ;
- `finish_student_activity_attempt`.

L’ancienne RPC `record_student_activity_session` est conservée uniquement pour sécuriser le déploiement d’un ancien onglet déjà ouvert. Le nouveau client ne l’utilise plus.

## Consultation enseignant

L’onglet `Classe` exploite désormais cet historique directement : un clic sur un élève remplace l’ancien placeholder de notes par une chronologie de ses tentatives. La liste peut être filtrée par période, mode, discipline et activité. Un clic sur une tentative déplie, dans le même écran, le détail question / réponse de l’élève / correction. Les anciennes tentatives qui ne possèdent que le résumé léger restent visibles mais sont signalées comme dépourvues de détail par question.

L’interface lit les instantanés sauvegardés au moment de l’exécution et ne reconstruit jamais les anciennes questions à partir de la configuration actuelle de l’activité.

## Étapes ultérieures

Ce socle ne comprend pas encore :

- l’archivage des anciens détails ;
- la purge annuelle ;
- les scores et jauges Aventure décrits dans `aventure.md` ;
- la matrice exacte de points et le vieillissement ;
- l’attribution détaillée en séance de groupe ;
- les hooks sémantiques particuliers des outils qui en auront besoin.
