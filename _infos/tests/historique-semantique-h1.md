# Test manuel — Historique sémantique H1

Date : 2026-10-10

## Préparation

1. Déployer les fichiers du patch H1.
2. Exécuter `_infos/sql/64_history_semantic_table_reset.sql` une seule fois.
3. Vérifier que l’historique des élèves est vide après la migration.

## Nombres en lettres

Créer ou utiliser une activité Catalogue « Nombres en lettres » puis lancer au moins trois questions avec un élève :

- une bonne réponse ;
- une mauvaise réponse ;
- si possible une question abandonnée/sans réponse.

Dans `Classe > élève > Historique`, ouvrir la tentative.

Attendus :

- un seul tableau compact ;
- colonne fine sans titre à gauche : 1, 2, 3… ;
- colonnes `Question`, `Réponse de l’élève`, `Attendu`, `Temps` ;
- réponse correcte sur fond vert discret ;
- réponse incorrecte sur fond rouge discret ;
- sans réponse en état neutre ;
- aucune colonne `Résultat` ;
- aucun texte technique (`schemaVersion`, `kind`, `direction`, etc.) ;
- aucune donnée parasite provenant du clavier ou du DOM.

Tester les deux sens :

- Nombre → Lettres ;
- Lettres → Nombre.

## Outil non encore raccordé

Lancer une activité d’un autre outil encore non migré.

Attendu :

- la tentative apparaît dans la chronologie ;
- son résumé (score, durée, contexte) reste visible ;
- au dépliage : `Historique détaillé non disponible pour cet outil.` ;
- aucune capture générique du DOM n’est enregistrée ou affichée.

## Régression générale

Vérifier qu’une activité :

- démarre et se termine normalement ;
- met toujours à jour ses compteurs/progressions ;
- reste visible dans l’historique sous forme de tentative ;
- ne produit aucune erreur console liée à l’historique.
