# Backlog consolidé

Dernière mise à jour : 2026-07-24.

## Priorités proches

- Finaliser et stabiliser la création/édition de Missions.
- Continuer les tests de bout en bout du Catalogue et de l’Atelier Quiz.
- Améliorer progressivement le guidage enseignant, avec une découverte simple des possibilités.
- Créer plus tard un outil technique indépendant pour importer les données système dans Supabase.

## Quiz

- Réintroduire le comportement Flash directement dans l’Atelier Quiz.
- Ajouter deux éléments explicites pour l’utilisateur : **Texte flash** et **Image flash**.
- Réutiliser en interne les moteurs Texte et Image existants avec un comportement Flash, sans créer de nouveaux formats de données ni de second éditeur.
- Conserver l’élément Audio normal ; ne pas créer d’« Audio flash » tant qu’un besoin clair n’est pas défini.

## Catalogue

- Vérifier régulièrement la cohérence entre `tools/registry.js`, `shared/catalogue.js` et les activités réellement présentes dans Supabase.
- Décider si `nombres-lettres`, `conjugaison` ou `quiz` doivent un jour recevoir une activité dans le catalogue local de secours.

## Ressources

- Conserver les ressources système locales et alignées sur `shared/tool-assets/manifest.json`.
- Conserver les ressources personnelles dans Supabase avec leur quota.
- Prévoir un outil technique hors dashboard pour gérer les imports dans `image_assets`, `phonology_words` et `vocabulary_default_words`.

## Tableau

- Continuer le polish des widgets.
- Tester le widget Grille en usage réel.
- Vérifier que le widget système Arrière-plan ne perturbe ni la sélection ni la projection.

## Outils élèves

- Garder l’approche MVP : un outil simple et fonctionnel, puis amélioration.
- Éviter les outils trop génériques dont l’action élève devient floue.
- Factoriser seulement lorsque plusieurs outils stabilisés montrent une duplication réelle.

## Dette à surveiller

- Maintenir la documentation au même état que le code.
- Ne pas rejouer les SQL historiques sans migration propre.
- Remplacer les confirmations natives restantes par des modales ou toasts maison lorsque le parcours le justifie.

## Idée à conserver — enregistrement audio système

Prévoir un outil technique d’enregistrement audio humain : nommage automatique selon le contexte, association aux textes fixes et aux contenus pédagogiques, puis sauvegarde ou téléchargement immédiat. Cette piste reste privilégiée au TTS pour garantir une prononciation contrôlée et adaptée aux élèves.

## Découpage restant de Monnaie

`monnaie-representation` couvre Lire une somme et Composer une somme. Les modes restant éventuellement à créer comme outils autonomes sont : comparer des sommes, acheter des objets, trouver plusieurs façons et rendre la monnaie.
