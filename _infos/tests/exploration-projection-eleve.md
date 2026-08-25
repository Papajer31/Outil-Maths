# Tests — Patch 30 : projection élève d’Exploration

Date : 14 août 2026.

## Déploiement

1. Sauvegarder la base Supabase.
2. Exécuter uniquement `_infos/sql/30_student_exploration_projection.sql`.
3. Déployer les fichiers applicatifs du patch.
4. Faire un rechargement complet du navigateur.

## Tests obligatoires

### 1. Exploration avec un élève d’un niveau unique

- Entrer avec une classe contenant au moins un élève.
- Choisir un seul élève, par exemple CE2.
- Ouvrir Exploration.
- Vérifier que le dossier `CE2` n’apparaît plus comme étape cliquable.
- Vérifier que les activités CE2 qui étaient sous ce dossier apparaissent directement sous l’OdApp correspondant.
- Vérifier qu’aucune activité CP, CE1, CM1 ou CM2 ne remonte avec elles.

### 2. Navigation et retour

- Entrer dans plusieurs dossiers visibles.
- Vérifier le fil d’Ariane.
- Utiliser le bouton Retour.
- Vérifier qu’aucun dossier de niveau masqué n’apparaît dans le fil d’Ariane ou lors du retour.

### 3. Lancement d’activité

- Lancer une activité remontée depuis un dossier de niveau transparent.
- Vérifier que l’activité ouverte est la bonne.
- Terminer ou quitter l’activité puis revenir dans Exploration.
- Vérifier que la navigation reste fonctionnelle.

### 4. Classe multi-niveaux

- Sélectionner plusieurs élèves de niveaux différents.
- Vérifier que le comportement de filtrage existant reste inchangé : seuls les chemins compatibles avec toute la sélection doivent rester proposés.
- Vérifier qu’aucun dossier `grade_level` n’est affiché.

### 5. Compatibilité avant migration SQL

Ce test est facultatif si la migration a déjà été exécutée. Le code sait retenter la lecture de l’arborescence sans les deux nouvelles colonnes si Supabase signale qu’elles n’existent pas. Cela évite qu’un déploiement des fichiers quelques secondes avant le SQL fasse basculer Exploration sur le petit secours local.

## Test manuel avancé du mode transparent

Le Patch B ajoutera l’interface super-admin. Pour vérifier dès maintenant le moteur de projection, on peut temporairement modifier un nœud depuis le SQL Editor :

```sql
update public.pedagogical_nodes
set student_navigation_mode = 'transparent'
where id = '<id_du_noeud>';
```

Ses enfants doivent remonter au premier ancêtre visible sans modifier son `parent_id` réel. Pour annuler :

```sql
update public.pedagogical_nodes
set student_navigation_mode = 'folder'
where id = '<id_du_noeud>';
```

On peut aussi tester un libellé court :

```sql
update public.pedagogical_nodes
set student_label = 'Les nombres'
where id = '<id_du_noeud>';
```

Puis revenir au nom officiel avec :

```sql
update public.pedagogical_nodes
set student_label = null
where id = '<id_du_noeud>';
```
