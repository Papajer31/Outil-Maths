# Backlog consolidé

Dernière mise à jour : 2026-06-27.

## Priorités proches

- Finaliser la création/édition de Missions après enrichissement et stabilisation du Catalogue.
- Stabiliser le parcours Banques personnelles / Banques système dans l’explorateur.
- Tester et documenter la duplication d’une banque système vers les banques personnelles : la fonction existe dans le code, mais le parcours doit rester vérifié en usage réel.
- Améliorer progressivement le guidage enseignant, façon découverte progressive des possibilités.

## Catalogue

- Décider si les outils actifs absents du catalogue de secours doivent être ajoutés à `shared/catalogue.js` ou rester uniquement alimentés par Supabase / les banques.
- Vérifier régulièrement la cohérence entre `tools/registry.js`, `shared/catalogue.js` et les activités réellement présentes dans Supabase.

## Tableau

- Continuer le polish des widgets.
- Tester le widget Grille en usage réel.
- Vérifier que le widget système Arrière-plan ne perturbe ni la sélection ni la projection.

## Outils élèves

- Garder l’approche MVP : un outil simple, fonctionnel, puis amélioration.
- Éviter les outils trop génériques dont l’action élève devient floue.
- Ne pas restaurer `operations-trous` : l’outil a été supprimé du registre legacy.
- Factoriser en priorité les familles dont les fichiers sont quasi identiques : représentations décimales, opérations à trous, droites numériques.

## Dette à surveiller

- Nettoyer progressivement les références mortes restantes dans la documentation.
- Factoriser seulement quand plusieurs outils stabilisés montrent une duplication réelle.
- Ne pas rejouer les SQL historiques sans migration propre.
- Remplacer les confirmations natives restantes par des modales/toasts maison quand le parcours utilisateur le justifie.


## Idée à conserver — Système super-admin d’enregistrement audio

Prévoir dans l’onglet super-admin un outil d’enregistrement audio intégré. Objectif : enregistrer une voix humaine directement depuis l’interface, nommer automatiquement le fichier selon le contexte, puis l’associer au texte concerné. Le système devra couvrir les textes fixes du site ainsi que les contenus des outils : consignes, énoncés, corrections et réponses audio éventuelles. Cette piste est privilégiée au TTS pour garantir une prononciation contrôlée, naturelle et adaptée aux élèves.


## Découpage restant de Monnaie

`monnaie-representation` couvre maintenant Lire une somme et Composer une somme. Les modes encore à extraire depuis le legacy `monnaie` sont : comparer des sommes, acheter des objets, trouver plusieurs façons et rendre la monnaie.
