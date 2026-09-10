# Test manuel — Aventure : cases Objectif (patch 42)

## Préparation

- appliquer `42_adventure_objective_resolution.sql` ;
- choisir un niveau avec une journée de 6 passages valides ;
- mettre au moins une case `Objectif` et une case `Activité` ;
- pour l’OdApp testé, disposer idéalement de deux activités publiées dans le même palier.

## Scénario principal

1. Ouvrir Aventure avec un élève n’ayant jamais rencontré l’OdApp.
2. Vérifier que la journée s’ouvre sans erreur `menu_requires_activities`.
3. Lorsque la case Objectif devient le prochain passage, vérifier qu’une activité de son palier 1 est proposée.
4. Démarrer l’activité : elle doit démarrer au niveau de question N1 lors de la première rencontre de cette activité.
5. Quitter/interrompre puis revenir : le même passage doit conserver la même activité résolue.
6. Terminer le passage puis revenir sur Aventure : le passage suivant doit être résolu seulement à ce moment-là.

## Diversification

1. Mettre deux cases Objectif du même OdApp dans la journée.
2. Disposer d’au moins deux activités publiées dans le palier courant.
3. Terminer la première case.
4. Vérifier que la seconde évite l’activité immédiatement précédente quand une alternative existe.

## Changement de palier

1. Placer la jauge du palier 1 à proximité de 50.
2. Jouer un passage qui la fait atteindre 50.
3. Ouvrir le passage Objectif suivant du même OdApp.
4. Vérifier que le moteur sélectionne alors une activité du palier 2 s’il existe.

## Régression

- une case Activité précise doit continuer à lancer exactement l’activité choisie ;
- la limite Questions/Temps de chaque case doit être conservée ;
- la matrice lente doit continuer à modifier la jauge du palier réellement joué ;
- après le sixième obligatoire, les passages 7 à 10 restent pour l’instant `skipped` et la journée se clôt comme avant.
