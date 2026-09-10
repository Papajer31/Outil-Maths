# Test manuel — Aventure : passages adaptatifs 7 à 10 (patch 43)

## Préparation

- appliquer `43_adventure_adaptive_passages.sql` après le patch 42 ;
- utiliser une journée valide de 6 passages obligatoires ;
- choisir un élève ayant déjà rencontré au moins deux OdApp Aventure ;
- idéalement, préparer des jauges différentes pour rendre l’ordre attendu visible.

## Scénario principal — enchainement 10 passages

1. Ouvrir et jouer normalement les passages 1 à 6.
2. Après le sixième, revenir sur Aventure.
3. Vérifier qu’un passage 7/10 est proposé au lieu de terminer la journée.
4. Terminer les passages 7, 8, 9 puis 10.
5. Vérifier que chaque passage adaptatif contient une activité publiée du palier courant de l’OdApp choisi.
6. Après le passage 10, vérifier l’écran « Aventure du jour terminée » et l’état `completed` de la journée.

## Faiblesse et diversification

1. Préparer au moins quatre OdApp déjà rencontrés avec des jauges distinctes, par exemple 4, 9, 15 et 22.
2. Vérifier que le passage 7 cible l’OdApp à jauge la plus faible.
3. Après sa fin, vérifier que le passage 8 est recalculé avec les nouvelles jauges.
4. Tant qu’au moins quatre OdApp sont disponibles, vérifier que les passages 7 à 10 privilégient quatre OdApp différents.
5. Avec seulement deux OdApp déjà rencontrés, vérifier qu’ils peuvent être réutilisés après avoir chacun été sélectionnés une première fois.

## Recalcul entre deux adaptatifs

1. Mettre deux OdApp à des jauges proches.
2. Faire progresser fortement le premier pendant le passage 7.
3. Revenir sur Aventure.
4. Vérifier que le passage 8 tient compte de la nouvelle jauge et n’utilise pas un choix préfigé avant le passage 7.

## Changement de palier

1. Placer le palier courant d’un OdApp à proximité de 50.
2. Le faire atteindre 50 pendant un adaptatif.
3. Si ce même OdApp est repris plus tard, vérifier que son nouveau palier courant est sélectionné.

## Reprise

1. Démarrer un passage adaptatif puis interrompre la session.
2. Revenir sur Aventure.
3. Vérifier que le même OdApp, le même palier et la même activité sont conservés.

## Garde-fou

- un OdApp jamais rencontré ne doit pas être introduit par les passages 7 à 10 ;
- une activité dépubliée ne doit pas être choisie ;
- si aucun OdApp déjà rencontré n’est encore jouable, la journée ne doit pas rester bloquée : les adaptatifs restants peuvent être `skipped`.

## Régressions

- les 6 passages programmés doivent rester identiques au patch 42 ;
- les cases Objectif doivent toujours être résolues au dernier moment ;
- une case Activité doit toujours imposer son activité ;
- la matrice lente et le niveau Aventure propre à chaque activité doivent rester inchangés ;
- Exploration et Missions ne doivent pas être affectées.
