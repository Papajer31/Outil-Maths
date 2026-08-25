# Validation — Réglages super-admin de la projection Exploration

Aucun SQL supplémentaire n’est nécessaire : ce patch utilise les colonnes ajoutées par `30_student_exploration_projection.sql`.

## 1. Présence des réglages

1. Ouvrir **Exploration** avec un compte super-admin.
2. Ouvrir **Arborescence**.
3. Sélectionner successivement une Discipline, un Domaine, un Thème et un Objectif d’apprentissage.
4. Vérifier que le panneau de droite contient :
   - **Nom pour les élèves** ;
   - **Afficher cette étape dans Exploration**.
5. Sélectionner un dossier CP/CE1/CE2/CM1/CM2.
6. Vérifier que ces deux réglages n’apparaissent pas : les dossiers de niveau sont toujours transparents côté élève.

## 2. Libellé élève

1. Choisir un nœud visible dans Exploration.
2. Saisir un libellé court dans **Nom pour les élèves** puis cliquer **Enregistrer**.
3. Ouvrir Exploration côté élève et vérifier que le libellé court est affiché.
4. Revenir dans l’arborescence, vider complètement le champ puis enregistrer.
5. Vérifier côté élève que le nom pédagogique officiel est de nouveau utilisé.
6. Vérifier côté enseignant/super-admin que le nom pédagogique officiel n’a jamais été modifié par le libellé élève.

## 3. Étape transparente

1. Choisir un Domaine ou un Thème possédant plusieurs descendants.
2. Décocher **Afficher cette étape dans Exploration** puis enregistrer.
3. Côté élève, vérifier que ce nœud a disparu.
4. Vérifier que ses enfants sont remontés au premier ancêtre visible, dans le bon ordre.
5. Vérifier que les activités restent accessibles.
6. Recocher l’option et enregistrer.
7. Vérifier que l’étape réapparaît au même endroit.

## 4. Plusieurs niveaux transparents consécutifs

1. Rendre un Domaine puis un de ses Thèmes transparents.
2. Vérifier côté élève que l’Objectif remonte directement sous la Discipline.
3. Vérifier que le fil d’Ariane ne contient aucun des deux nœuds masqués.
4. Vérifier que l’ordre avec les frères visibles reste cohérent.

## 5. Non-régression pédagogique

Après les tests précédents :

- ouvrir l’arborescence super-admin et vérifier que les `parent_id` n’ont pas changé visuellement ;
- vérifier qu’Aventure affiche toujours les mêmes Domaines, Thèmes et Objectifs ;
- vérifier que les activités restent dans leurs dossiers de niveau réels ;
- vérifier qu’un nœud rendu transparent peut toujours être renommé, déplacé, activé/désactivé et réordonné normalement côté admin.

## Résultat attendu

La projection élève devient configurable sans créer de deuxième taxonomie : les noms pédagogiques et les relations parent/enfant restent la source de vérité unique.
