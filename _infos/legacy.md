# Legacy — ce qui ne doit plus piloter le projet

Dernière mise à jour : 2026-06-27.

## Ancien éditeur d’activités personnelles

L’ancien modèle `activity_configs` / `activity_folders` n’est plus le modèle produit actif. Le dashboard actuel s’appuie sur Catalogue, Missions, Banques, Tableau et Admin.

Dans cette vague de nettoyage, le gros bloc HTML `editorView` et les anciens modules JS d’édition personnelle ont été retirés du code actif.

## API legacy

Les fonctions exportées depuis `teacher-api.js` pour manipuler les anciennes activités personnelles ont été retirées afin d’éviter une fausse compatibilité qui inviterait à rebrancher l’ancien modèle.

## Outils legacy

- `monnaie` reste temporairement listé comme outil legacy de réserve. La partie Lire une somme / Composer une somme a été extraite dans `monnaie-representation`.
- `operations-trous` a été supprimé du registre legacy et du dossier `tools/`.

## Règle

Un élément legacy peut rester documenté pour mémoire, mais il ne doit pas être utilisé comme point d’appui pour les nouveaux développements.


## Monnaie

Depuis le patch `monnaie-representation`, l’ancien outil `monnaie` ne doit plus être considéré comme un bloc à réactiver tel quel. Il sert de réserve pour les modes non encore migrés : comparer des sommes, acheter des objets, trouver plusieurs façons et rendre la monnaie.
