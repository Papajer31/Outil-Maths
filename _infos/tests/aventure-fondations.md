# Validation — fondations du mode Aventure

Date : 2026-08-04.

## 1. Déploiement SQL

1. Sauvegarder la base Supabase.
2. Vérifier que `19_adventure_weekly_menus.sql` a déjà été exécuté.
3. Exécuter uniquement `20_adventure_engine_foundations.sql`.
4. Vérifier l’absence d’erreur et la présence des tables :
   - `adventure_class_cursors` ;
   - `student_adventure_tier_progress` ;
   - `student_adventure_days` ;
   - `student_adventure_passages`.
5. Vérifier la présence des RPC :
   - `open_student_adventure_day` ;
   - `get_student_adventure_progress`.

## 2. Curseur enseignant et super-admin

Effectuer d’abord ces tests avec un compte enseignant ordinaire, puis les répéter avec le compte super-admin :

1. Ouvrir l’onglet Aventure.
2. Vérifier l’affichage du sélecteur de classe au-dessus des quatre jours.
3. Sélectionner un niveau scolaire.
4. Cliquer sur le drapeau du Menu 1, Jour 1.
5. Recharger la page : le curseur doit rester sur Menu 1, Jour 1.
6. Utiliser la flèche suivante : le curseur doit passer au Jour 2.
7. Depuis le Jour 4, utiliser la flèche suivante : le curseur doit passer au Menu suivant, Jour 1.
8. Utiliser la flèche précédente au Menu 1, Jour 1 : le curseur ne doit pas sortir de la plage.
9. Désactiver puis réactiver Aventure : la position doit être conservée.
10. Changer de niveau : chaque niveau doit posséder son propre curseur.
11. Avec deux classes, vérifier que chaque classe possède son propre curseur.

Avec le compte super-admin, vérifier en plus :

1. Le libellé du bouton reste exactement `Enregistrer`.
2. Une modification de case est immédiatement conservée comme personnalisation enseignant, comme avec un compte ordinaire.
3. Le bouton `Enregistrer` devient actif si les menus affichés diffèrent des menus système.
4. Changer de niveau sans cliquer sur `Enregistrer` reste possible : la personnalisation enseignant ne doit pas être perdue.
5. Cliquer sur `Enregistrer` publie l’ensemble des menus affichés du niveau comme menus système.
6. Après publication, le bouton redevient inactif et les personnalisations super-admin devenues identiques aux valeurs système sont supprimées.
7. Recharger la page : la classe, le curseur et les menus publiés doivent rester cohérents.

## 3. Menus incomplets

1. Ouvrir un jour contenant moins de six cases valides.
2. Appeler `open_student_adventure_day` avec un élève du bon niveau.
3. Vérifier :
   - `availability = "menu_incomplete"` ;
   - aucun enregistrement dans `student_adventure_days` ;
   - aucun passage créé.

## 4. Niveau élève manquant

1. Choisir un élève dont `grade_level` est vide.
2. Appeler la RPC.
3. Vérifier `availability = "missing_grade"`.

## 5. Aventure désactivée

1. Désactiver Aventure pour la classe et le niveau de l’élève.
2. Appeler la RPC.
3. Vérifier `availability = "disabled"`.

## 6. Création d’une journée complète

Préparer six cases valides, puis :

1. Appeler `open_student_adventure_day`.
2. Vérifier `availability = "ready"`.
3. Vérifier la création d’une seule ligne dans `student_adventure_days`.
4. Vérifier dix lignes dans `student_adventure_passages` :
   - passages 1 à 6 : `required` ;
   - passages 7 à 10 : `adaptive` ;
   - tous en statut `pending`.
5. Vérifier que les cases Objectif ont seulement `grade_folder_id`.
6. Vérifier que les cases Activité ont seulement `catalog_activity_id`.

## 7. Reprise et idempotence

1. Appeler plusieurs fois la RPC pour le même élève et le même jour.
2. Vérifier que le même `day_id` est renvoyé.
3. Vérifier qu’il existe toujours une seule journée et dix passages.
4. Modifier ensuite une case du menu enseignant.
5. Rappeler la RPC : les passages déjà figés ne doivent pas changer.

## 8. Changement de jour

1. Avancer le curseur enseignant.
2. Appeler la RPC pour le même élève.
3. Vérifier la création d’une nouvelle journée.
4. Revenir à l’ancien jour.
5. Vérifier que l’ancienne journée est reprise, sans duplication.

## 9. Sécurité

1. Avec un enseignant A, tenter de lire ou modifier le curseur d’une classe appartenant à un enseignant B : refus RLS attendu.
2. Tenter une RPC avec un mauvais code élève : erreur d’authentification attendue.
3. Tenter une RPC avec le bon élève mais un mauvais code de classe : erreur attendue.
4. Vérifier qu’un client anonyme ne peut pas lire directement les tables de progression.

## 10. Validation de non-régression

- Connexion enseignant.
- Gestion des élèves.
- Menus Aventure existants.
- Exploration enseignant et élève.
- Lancement d’une activité Exploration.
- Missions existantes.
- Quiz et Ressources.

Le Patch 20 ne doit encore ni lancer une activité Aventure ni modifier une jauge : ces fonctions appartiennent au patch suivant.
