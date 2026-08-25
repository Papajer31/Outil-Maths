# Aventure — contrat fonctionnel et technique

Dernière mise à jour : 2026-08-22.

## Objectif de rentrée

Le mode Aventure complet doit être utilisable côté enseignant et côté élève avant la rentrée. Les 34 menus de chaque niveau n’ont pas besoin d’être remplis dès le premier jour : seules les journées effectivement ouvertes aux élèves doivent être complètes et valides.

Jusqu’à stabilisation du moteur, Aventure est le chantier prioritaire. Missions, les nouveaux outils d’étude du code, les audios système et les extensions du Tableau passent après.

## Séparation des modes

- **Aventure** : progression durable pilotée par les menus et les jauges.
- **Exploration** : navigation libre.
- **Missions** : parcours temporaires attribués.

Exploration et Missions utilisent le même contrat d’exécution, mais leurs résultats ne modifient jamais les jauges Aventure.

## Architecture pédagogique

```text
Discipline
    Domaine
        Thème
            Objectif d’apprentissage (OdApp)
                Dossier de niveau
                    Paliers
                        Activités
                            Niveaux de question 1 à 5
```

Les paliers sont portés par `catalog_activities.adventure_tier`. Ils ne sont pas des nœuds supplémentaires de l’arborescence.

## Jauges multi-paliers

Chaque palier possède son propre cycle de jauge de `0` à `50`.

```text
OdApp à 1 palier : maximum 50
OdApp à 2 paliers : maximum cumulé 100
OdApp à 5 paliers : maximum cumulé 250
```

La matrice lente est répétée dans chaque palier. Le moteur considère comme palier courant le premier palier réellement disponible dont la jauge n’a pas atteint 50. Une case **Objectif** laisse l’élève progresser librement dans les paliers. Une case **Activité** impose l’activité et donc implicitement son palier. Aucun plafond de palier n’est enregistré dans les menus.

## Menus hebdomadaires

Chaque niveau possède 34 menus. Un menu correspond à quatre jours.

Chaque jour contient :

```text
6 passages obligatoires planifiés
+ 4 passages adaptatifs automatiques
```

Une case obligatoire cible soit :

- un dossier de niveau d’un OdApp (`objective`) ;
- une activité précise (`activity`).

Les menus système sont définis par le super-admin. Les enseignants enregistrent uniquement leurs exceptions locales, y compris une case volontairement vide.

## Curseur Menu/Jour

Le jour ouvert est piloté manuellement par l’enseignant. Il n’est pas encore déduit du calendrier scolaire.

Le curseur est enregistré pour :

```text
classe + niveau scolaire
```

Une classe multi-niveaux peut donc avoir, par exemple, un curseur CE1 et un curseur CE2 indépendants.

Le mode peut être désactivé temporairement pour une classe et un niveau sans perdre la position enregistrée.

## Gel et reprise d’une journée élève

À la première ouverture d’une journée par un élève :

1. le moteur vérifie son code et son niveau ;
2. il lit le curseur de sa classe et de son niveau ;
3. il résout les exceptions enseignant par-dessus le menu système ;
4. il vérifie que les six cases obligatoires sont présentes et valides ;
5. il crée une journée élève ;
6. il copie les six cibles obligatoires dans six passages figés ;
7. il crée quatre passages adaptatifs encore sans cible.

Les ouvertures suivantes reprennent la même journée et les mêmes passages. Une modification ultérieure du menu enseignant ne transforme pas une journée déjà commencée.

## Sélection d’une activité

### Case Objectif

Le moteur devra :

1. identifier le palier courant ;
2. choisir une activité publiée de ce palier ;
3. éviter autant que possible une répétition immédiate ;
4. reprendre le niveau de question propre à cette activité dans le contexte Aventure.

### Case Activité

L’activité est imposée. Son `adventure_tier` fixe le palier dont la jauge sera modifiée.

### Passage adaptatif

Un passage adaptatif ne peut jamais introduire un OdApp inconnu. Son pool est limité aux OdApp possédant déjà une progression Aventure pour l’élève. La priorité va aux jauges les plus faibles, avec diversification entre les quatre passages.

## Matrice lente

### Bonnes réponses

| Jauge du palier | N1 | N2 | N3 | N4 | N5 |
|---|---:|---:|---:|---:|---:|
| 0–10 | +1 | +2 | +3 | +4 | +5 |
| 11–20 | 0 | +1 | +2 | +3 | +4 |
| 21–30 | 0 | 0 | +1 | +2 | +3 |
| 31–40 | 0 | 0 | 0 | +2 | +3 |
| 41–50 | 0 | 0 | 0 | +1 | +2 |

### Erreurs

| Jauge du palier | N1 | N2 | N3 | N4 | N5 |
|---|---:|---:|---:|---:|---:|
| 0–10 | 0 | 0 | 0 | 0 | 0 |
| 11–20 | 0 | 0 | 0 | 0 | 0 |
| 21–30 | −1 | 0 | 0 | 0 | 0 |
| 31–40 | −2 | −1 | 0 | 0 | 0 |
| 41–50 | −3 | −2 | −1 | 0 | 0 |

La jauge est bornée entre 0 et 50 et évolue question par question.

## Niveaux de question

- niveau initial d’une activité : `2` ;
- bonne réponse : niveau `+1` ;
- erreur : niveau `−1` ;
- le niveau final devient le niveau initial de la tentative Aventure suivante pour cette activité ;
- une baisse provoquée par la dernière question est conservée.

La séparation des contextes doit être respectée : le niveau atteint en Exploration ou en Mission ne détermine pas celui d’Aventure.

## Tables actives ou introduites

### Contenus et menus

- `catalog_activities.adventure_tier`
- `adventure_default_menu_slots`
- `teacher_adventure_menu_slots`

### Fondations moteur

- `adventure_class_cursors`
- `student_adventure_tier_progress`
- `student_adventure_days`
- `student_adventure_passages`

### RPC publiques

- `open_student_adventure_day`
- `get_student_adventure_progress`

Les anciennes tables `adventure_objective_registry` et `teacher_adventure_objectives` sont historiques et ne sont plus utilisées par l’écran des menus.

## MVP rentrée — état après le patch SQL 31

Le premier parcours élève est volontairement réduit aux **six passages obligatoires de type `activity`**. Pour ouvrir une nouvelle journée dans ce MVP, les six cases du jour doivent donc cibler des activités précises. Les cases `objective` restent dans les menus et seront réactivées dès que leur résolution automatique sera branchée.

Le patch SQL `31_adventure_required_activity_runtime.sql` prépare le runtime serveur :

- niveau initial Aventure d’une activité = `2` ;
- reprise du dernier `ended_level` de cette même activité en contexte `adventure` ;
- liaison tentative ↔ passage via `metadata_json.adventure_passage_id` ;
- matrice lente calculée côté serveur à chaque question ;
- variation réellement appliquée stockée dans `student_activity_session_questions.points_awarded` ;
- jauge bornée entre `0` et `50` ;
- retries d’une même question idempotents ;
- passage terminé lorsque la tentative est terminée ;
- après les six obligatoires, passages 7 à 10 temporairement `skipped` et journée `completed` ;
- une journée déjà figée reste reprenable même si le menu enseignant est ensuite modifié.

`open_student_adventure_day` renvoie désormais `started_level` pour chaque passage possédant une activité. Le prochain patch client doit utiliser ce niveau pour construire la configuration d’exécution et fournir l’identifiant du passage dans les métadonnées de la tentative.

## Ordre de réalisation restant

1. Appliquer et valider `31_adventure_required_activity_runtime.sql`.
2. Activer l’entrée Aventure côté élève et ouvrir/reprendre le jour courant.
3. Lancer le premier passage `activity` avec son `started_level` et son `adventure_passage_id`.
4. Revenir automatiquement à Aventure après l’activité et enchainer jusqu’au passage 6.
5. Tester jauges, niveaux, interruption/reprise, retries et fin de journée avec plusieurs élèves.
6. Réactiver les cases Objectif par sélection automatique du palier et de l’activité.
7. Générer ensuite les quatre passages adaptatifs.
8. Ajouter enfin vieillissement, rangs de maîtrise et reporting.
