# Mini-patch — arborescence avec dossiers de niveau

Date : 2026-07-30.

## Objectif

Remplacer l’ancien système de portée de niveaux héritée par la structure définitive :

```text
Discipline
    Domaine
        Thème
            Objectif d’apprentissage
                Dossier CP / CE1 / CE2 / CM1 / CM2
                    Activités
```

## Fichiers applicatifs concernés

- `shared/catalogue.js`
- `shared/public-api.js`
- `teacher/js/teacher-api.js`
- `teacher/js/dashboard/activities-view.js`
- `teacher/js/dashboard/catalog-admin-view.js`
- `teacher/js/dashboard/catalog-tree-admin-dialog.js`
- `teacher/css/dashboard.css`

## Ordre de déploiement

1. Sauvegarder la base Supabase.
2. Déployer les fichiers applicatifs du mini-patch.
3. Exécuter seul `_infos/sql/seed_pedagogical_tree_cp_cm2.sql`.
4. Ouvrir Exploration en super-admin.
5. Vérifier la branche inactive `À reclasser (migration)`.
6. Déplacer les éventuelles activités inconnues dans leur véritable dossier de niveau.
7. Tester Exploration avec un élève CP, CE1, CE2, CM1 et CM2.

Le script SQL ne doit pas être lancé avec les migrations numérotées. Le détail du reclassement automatique est conservé dans `_infos/referentiels/reclassement-activites-historiques.md`.

## Effets du script SQL

- sauvegarde les anciens nœuds dans `pedagogical_nodes_backup_before_level_folders_20260730` ;
- sauvegarde les anciens liens dans `catalog_activity_node_backup_before_level_folders_20260730` ;
- supprime les colonnes obsolètes `grade_scope_mode` et `grade_levels` ;
- ajoute le type `grade_level` ;
- reconstruit le référentiel Français/Mathématiques ;
- reclasse les 26 activités historiques connues ;
- conserve les autres activités dans une branche inactive ;
- impose par trigger qu’une activité soit toujours rattachée à un dossier de niveau.

## Vérifications minimales

### Arborescence

- une discipline ne peut contenir que des domaines ;
- un domaine ne peut contenir que des thèmes ;
- un thème ne peut contenir que des objectifs ;
- un objectif ne peut contenir que des dossiers de niveau ;
- un dossier de niveau ne peut pas contenir de sous-dossier ;
- deux dossiers `CE1` ne peuvent pas exister sous le même objectif.

### Création d’activité

- le bouton de création est désactivé hors d’un dossier de niveau ;
- le sélecteur d’adresse pédagogique ne propose que les dossiers de niveau ;
- une activité enregistrée apparaît sous le bon niveau.

### Filtrage élève

- un élève CE1 ne voit que les activités rangées sous `CE1` ;
- les parents vides disparaissent ;
- un dossier inactif et ses descendants disparaissent ;
- le secours local continue à fonctionner si Supabase est indisponible.

## Hors périmètre

Ce mini-patch ne crée pas encore :

- les jauges Aventure ;
- la fenêtre active ;
- le vieillissement ;
- l’onglet Aventure enseignant ;
- les blocs et presets propres à l’étude du code.

Ces éléments sont cadrés dans `_infos/aventure.md`.

## Correctif de pagination de l’arborescence

Le référentiel complet contient plus de 1 000 nœuds. Les lectures de `pedagogical_nodes` doivent donc être paginées côté enseignant comme côté public. Sans cette pagination, la première page contient l’arborescence française puis seulement le début des mathématiques, ce qui donne l’impression que les thèmes mathématiques ne possèdent aucun objectif d’apprentissage.
