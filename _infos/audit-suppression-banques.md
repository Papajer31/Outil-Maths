# Audit final — suppression des anciennes banques

Date : 2026-07-24.

## Résultat

La fonctionnalité Banques a été supprimée de bout en bout :

- aucun onglet Banques ;
- aucun onglet Admin ;
- aucune API cliente des banques ;
- aucun éditeur ou explorateur de banques ;
- aucun runtime dépendant des banques ;
- aucune table Supabase du modèle `question_banks`.

## Outils supprimés

- `question-reponse`
- `qcm`
- `selection`
- `flash-question-reponse`
- `flash-qcm`

Les fonctionnalités QCM texte et Sélection de mots existent désormais comme éléments internes à l’Atelier Quiz et ne dépendent d’aucune banque.

## Nettoyage final du code

Fichiers orphelins supprimés :

- `shared/selection-text.js` — ancien moteur de sélection non importé ;
- `shared/tool-ui/question-auto-fit.js` — ancien auto-ajustement des runtimes Question/Réponse, QCM et Flash, non importé ;
- `teacher/js/dashboard/resources-local-store.js` — ancien stockage local de secours des ressources, non importé.

Nettoyages complémentaires :

- suppression des styles de configuration Flash inutilisés ;
- suppression d’un style de navigation réservé à l’ancien lien Admin ;
- suppression de callbacks vides hérités de l’ancien cache d’activités personnelles ;
- suppression de l’API de registre legacy vide et inutilisée.

## Supabase

`10_remove_question_banks.sql` a été exécuté avec succès le 24 juillet 2026.

Les anciens SQL ne sont pas supprimés. Ils sont conservés comme historique et marqués comme obsolètes lorsque nécessaire.

## Contrôles réalisés

- 243 fichiers JavaScript passent la vérification syntaxique ;
- les 29 modules d’outils actifs sont importables avec un environnement navigateur simulé ;
- les 89 feuilles CSS sont syntaxiquement valides ;
- aucun import JavaScript relatif n’est cassé ;
- aucun fichier local référencé par les pages HTML ne manque ;
- aucun identifiant HTML n’est dupliqué ;
- aucun identifiant d’ancien outil n’est présent dans le registre actif ;
- aucune référence applicative à `question_banks`, `question_bank_items` ou `question_bank_folders` ne subsiste.

Les parcours réels avec Supabase et le navigateur doivent rester couverts par les tests fonctionnels du projet. Le code ne contient plus d’appel aux anciennes tables.
