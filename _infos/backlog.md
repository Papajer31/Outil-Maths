# Backlog consolidé

Dernière mise à jour : 2026-08-04.

## Priorités proches

- Exécuter et valider `20_adventure_engine_foundations.sql`.
- Brancher un premier passage obligatoire Aventure de bout en bout.
- Ajouter ensuite la sélection par Objectif, la matrice lente et la reprise des six passages.
- Générer les quatre passages adaptatifs seulement après stabilisation des passages obligatoires.
- Construire l’interface élève Aventure complète avant la rentrée.
- Remplir au minimum les premiers menus réellement nécessaires ; les suivants pourront être complétés semaine après semaine.
- Reporter Missions, l’étude du code, les audios système et les extensions du Tableau tant que le MVP Aventure n’est pas fiable.

## Aventure

### Patch 20 — fondations

- [x] Curseur Menu/Jour par classe et par niveau.
- [x] Jauge 0–50 propre à chaque palier d’un OdApp.
- [x] Journée élève unique par niveau, menu et jour.
- [x] Six passages obligatoires figés à la première ouverture.
- [x] Quatre emplacements adaptatifs figés pour la reprise.
- [x] RPC publique sécurisée d’ouverture/reprise.
- [x] Lecture publique sécurisée des jauges de l’élève.

### À enchaîner avant la rentrée

- [ ] Sélectionner et lancer une activité précise depuis un passage obligatoire.
- [ ] Sélectionner une activité compatible avec le palier pour une case Objectif.
- [ ] Séparer le niveau de difficulté Aventure de celui d’Exploration et de Missions.
- [ ] Appliquer la matrice lente question par question, y compris les retraits.
- [ ] Relier une tentative d’historique à son passage Aventure.
- [ ] Finaliser un passage sans double comptage.
- [ ] Reprendre automatiquement le premier passage non terminé.
- [ ] Terminer une journée après dix passages.
- [ ] Générer les quatre adaptatives uniquement depuis les OdApp déjà rencontrés.
- [ ] Remplacer la tuile élève « Bientôt » par l’interface Aventure.
- [ ] Tester classes multi-niveaux, changements de curseur et rechargements.

### Après stabilisation du MVP

- [ ] Vieillissement au-dessus de 40 avec plancher 30.
- [ ] Rangs de maîtrise et reconfirmations.
- [ ] Reporting enseignant.
- [ ] Réglages super-admin de la matrice et des seuils.

## Quiz

- Réintroduire le comportement Flash directement dans l’Atelier Quiz.
- Ajouter deux éléments explicites pour l’utilisateur : **Texte flash** et **Image flash**.
- Réutiliser en interne les moteurs Texte et Image existants avec un comportement Flash, sans créer de nouveaux formats de données ni de second éditeur.
- Conserver l’élément Audio normal ; ne pas créer d’« Audio flash » tant qu’un besoin clair n’est pas défini.

## Catalogue

- Vérifier régulièrement la cohérence entre `tools/registry.js`, `shared/catalogue.js` et les activités réellement présentes dans Supabase.
- Décider si `nombres-lettres`, `conjugaison` ou `quiz` doivent un jour recevoir une activité dans le catalogue local de secours.

## Ressources

- Conserver temporairement les ressources système locales alignées sur `shared/tool-assets/manifest.json` pendant leur migration progressive.
- Les images pédagogiques importées dans `image_assets` sont visibles et classables dans les ressources système Supabase ; migrer ensuite chaque consommateur avant de supprimer ses fichiers statiques.
- Conserver les ressources personnelles dans Supabase avec leur quota.
- Les imports `phonology_words` et `image_assets` sont disponibles dans le tableau de bord super-admin. Il reste à prévoir l’outil technique pour `vocabulary_default_words`.

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
