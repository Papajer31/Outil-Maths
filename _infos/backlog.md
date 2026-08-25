# Backlog consolidé

Dernière mise à jour : 2026-08-14.

## Priorité principale — Aventure

- [ ] Confirmer le déploiement et la validation des fondations SQL en production.
- [ ] Lancer un passage obligatoire visant une activité précise.
- [ ] Sélectionner une activité adaptée pour une case Objectif.
- [ ] Séparer complètement le niveau Aventure des niveaux Exploration et Missions.
- [ ] Appliquer la matrice lente question par question.
- [ ] Relier chaque tentative à son passage Aventure et empêcher le double comptage.
- [ ] Reprendre automatiquement le premier passage non terminé.
- [ ] Enchaîner les six passages obligatoires puis les quatre adaptatifs.
- [ ] Remplacer la tuile élève « Bientôt » par l’interface complète.
- [ ] Tester les classes multi-niveaux, rechargements et changements de curseur.

Après le MVP : vieillissement au-dessus de 40, rangs de maîtrise, reporting enseignant et réglages super-admin de la matrice.

## Étude du code et images

- [ ] Refaire l’outil Encodage sur une base propre.
- [ ] Stabiliser `reperage-graphemes`, `dictee-muette` et `nuage-lettres` puis créer leurs activités d’Exploration.
- [ ] Continuer l’enrichissement de `phonology_words` et des banques d’images sans redéploiement.
- [ ] Étendre les listes blanches d’images propres à chaque outil lorsque nécessaire.
- [ ] Prévoir l’interface technique pour `vocabulary_default_words`.

## Quiz

- [ ] Ajouter **Texte flash** et **Image flash** en réutilisant les moteurs existants.
- [ ] Conserver l’Audio normal ; ne pas créer d’Audio flash sans besoin clair.

## Exploration et catalogue de secours

- [x] Ajouter la projection élève sans dupliquer l’arborescence : libellé court, nœuds transparents et dossiers de niveau masqués automatiquement.
- [x] Ajouter les réglages super-admin `Nom pour les élèves` et `Afficher cette étape dans Exploration`.
- [ ] Vérifier régulièrement la cohérence entre `tools/registry.js`, `shared/catalogue.js` et Supabase.
- [ ] Décider si `reperage-graphemes`, `dictee-muette`, `nuage-lettres`, `nombres-lettres`, `conjugaison` ou `quiz` doivent rejoindre le secours local.

## Tableau

- [ ] Continuer le polish des widgets.
- [ ] Tester le widget Grille en usage réel.
- [ ] Choisir la police générale d’une scène.
- [ ] Sauvegarder des scènes dans l’espace enseignant.
- [ ] Piloter davantage les widgets depuis la scène.
- [ ] Ajouter des pages de scène.

## Évolutions générales

- Modifier le mot de passe depuis le dashboard.
- Enregistrer des configurations favorites et archiver des activités.
- Partager une activité par lien.
- Mélanger les outils d’une séquence pendant une session.
- Ajouter un écran Outils pour les réglages par défaut et les tags.
- Créer des profils de calibration physique d’écran pour les outils de mesure.
- Ajouter des ressources textuelles partagées dans Supabase avec singulier, pluriel, genre, ordre et activation.
- Prévoir un outil d’enregistrement audio humain pour les contenus système.
- Remplacer progressivement les confirmations natives restantes par l’UI du site.

## Idées d’outils conservées

- Calculs `10 + 10 + 10 + N`, avec variantes `5 + 5`.
- Dénombrement par tracé de traits.
- Calculs avec représentations Picbille ou Dédé.
- Balance mathématique.
- Droite graduée à placement continu.
- Vocabulaire entre deux mots repères.
- Manipulation enseignant : monnaie, centaines-dizaines-unités, étiquettes-mots et tirage de phrases.
- Système de tickets pour la planète des jeux.

## Monnaie

`monnaie-representation` couvre Lire une somme et Composer une somme. Les usages Comparer, Acheter, Trouver plusieurs façons et Rendre la monnaie devront rester des outils distincts si leur besoin est confirmé.
