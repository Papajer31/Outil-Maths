# Historique des activités — contrat sémantique

Dernière mise à jour : 2026-10-10.

## Principe

L’historique détaillé ne cherche plus à déduire ce qui s’est passé à partir du DOM de l’outil.
Chaque outil choisit explicitement les informations pédagogiques qu’il souhaite conserver et les envoie au moteur commun sous forme de cellules typées.

Il n’existe volontairement :

- aucun repli DOM ;
- aucun renderer spécifique par outil dans le dashboard ;
- aucune rétrocompatibilité avec les anciens snapshots détaillés.

Le patch SQL `64_history_semantic_table_reset.sql` supprime les anciennes tentatives et verrouille la base sur ce nouveau contrat. La progression Exploration existante est figée en baseline avant la purge ; les états Aventure et Missions ne sont pas remis à zéro.

## Contrat d’un outil

Le runtime peut exposer :

```js
getHistorySnapshot(stage, container, context)
```

`stage` vaut `question`, `answer` ou `correction`.

Le snapshot attendu possède uniquement une clé racine `history` :

```js
{
  history: {
    columns: [
      { key: "question", label: "Question" },
      { key: "answer", label: "Réponse de l’élève", role: "answer" },
      { key: "expected", label: "Attendu" }
    ],
    cells: {
      question: { type: "text", value: "68" }
    }
  }
}
```

Les colonnes sont généralement déclarées au stade `question`. Les stades `answer` et `correction` peuvent n’envoyer que les cellules qui leur appartiennent. Le renderer enseignant fusionne les trois snapshots pour produire une ligne unique. Une colonne peut aussi fournir une petite `legend` structurée dans son en-tête lorsque le sens des états visuels doit rester lisible sans ajouter une colonne dédiée.

## Colonnes communes

Le moteur ajoute automatiquement :

- à gauche : une colonne fine sans en-tête avec le numéro de la question ;
- à droite : la durée active de la question.

Toutes les colonnes intermédiaires sont définies par l’outil.

Une colonne portant `role: "answer"` est automatiquement colorée selon l’issue réelle enregistrée par le runtime :

- vert : `correct` ;
- rouge : `incorrect` ;
- neutre : `unanswered`.

L’outil ne renvoie donc jamais lui-même un ✓/✗ uniquement pour colorer sa réponse.

## Types de cellules disponibles

Le moteur commun connaît actuellement :

- `text` : texte ou nombre rendu comme texte ;
- `tokens` : suite d’éléments courts, avec tonalités optionnelles `accent`, `muted`, `correct`, `incorrect` ;
- `image` : image avec `src`, `alt` et libellé facultatif ;
- `audio` : source audio avec lecteur compact ;
- `result` : ✓ / ✗ lorsque l’outil a réellement besoin d’un résultat binaire comme donnée autonome ;
- `sequence` : suite ordonnée d’éléments reproduisant leur écriture (`script` / `cursive`) et un état visuel éventuel (`correct`, `missed`, `wrong`, `neutral`).

Un nouveau type ne doit être ajouté que lorsqu’un outil concret en a réellement besoin.

## Affichage enseignant

Une tentative reste affichée sous forme de carte compacte avec :

- date et heure ;
- contexte (Exploration / Aventure / Mission) ;
- nom de l’activité ;
- score ;
- durée totale.

À l’ouverture, le détail devient un tableau unique et compact. Il n’y a plus une carte séparée « Question / Réponse / Correction » pour chaque question.

Si un outil n’a pas encore été raccordé au nouveau contrat, la tentative peut être enregistrée mais son détail affiche simplement :

> Historique détaillé non disponible pour cet outil.

## Premier outil raccordé

`Nombres en lettres` est l’outil pilote du nouveau système.

Son tableau est :

|  | Question | Réponse de l’élève | Attendu | Temps |
|---:|---|---|---|---:|
| 1 | 68 | soixante-huit | soixante-huit | 9 s |
| 2 | 47 | quarante sept | quarante-sept | 17 s |

La cellule « Réponse de l’élève » porte seule la coloration de réussite/erreur.

## Stockage

Les tables restent :

- `student_activity_sessions` : une ligne par tentative ;
- `student_activity_session_questions` : une ligne par question ;
- `student_activity_progress` : progression Exploration courante ;
- `student_activity_progress_baseline` : part de progression antérieure aux tentatives actuellement conservées.

Chaque question conserve encore trois JSON séparés :

- `question_snapshot` ;
- `answer_snapshot` ;
- `correction_snapshot`.

Ce découpage permet de capturer les données exactement au bon moment tout en affichant ensuite une seule ligne fusionnée.

## Méthode de migration des outils

Les outils sont raccordés un par un.

Pour chaque outil, on décide d’abord pédagogiquement :

1. quelles colonnes l’enseignant doit voir ;
2. quelle donnée remplit chaque colonne ;
3. quel type de cellule convient ;
4. quelle colonne joue le rôle de réponse de l’élève.

Ensuite seulement le hook `getHistorySnapshot()` est adapté. Aucun code d’affichage spécifique à l’outil ne doit être ajouté dans le dashboard.

## Jauges

L’historique et les jauges restent deux couches distinctes :

- l’historique répond à « qu’a fait l’élève ? » ;
- la jauge répond à « où en est l’élève sur cet objectif/palier ? ».

La refonte des jauges d’évaluation viendra après le raccordement fiable des outils, afin que toute évolution d’une jauge puisse être expliquée par des traces lisibles.
