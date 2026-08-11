# `_infos` — documentation du projet

Dernière mise à jour : 2026-08-07.

Ce dossier conserve uniquement les informations utiles pour comprendre, déployer et poursuivre le projet. Les comptes rendus de patch terminés ne doivent plus s’accumuler à la racine : leur conclusion est intégrée au document de référence concerné ou à `legacy.md`.

## Documents courants

1. `etat-projet.md` — photographie fonctionnelle du projet.
2. `architecture.md` — règles techniques et découpage des modules.
3. `aventure.md` — contrat du mode Aventure.
4. `historique-activites.md` — contrat de tentative et d’enregistrement des réponses.
5. `outils.md` — registre des outils, Quiz, Tableau et assets.
6. `supabase.md` — modèle de données et Storage.
7. `backlog.md` — chantiers encore ouverts et idées conservées.
8. `legacy.md` — éléments supprimés ou migrations achevées à ne pas réactiver.

## Sous-dossiers

- `referentiels/` — sources pédagogiques et linguistiques volumineuses.
- `sql/` — historique SQL ; lire impérativement `sql/README.md` avant toute exécution.
- `tests/` — procédures de validation encore utiles.

## Règles de maintenance

- Une décision stabilisée quitte `backlog.md` et rejoint son document de référence.
- Un patch terminé ne crée pas durablement un nouveau fichier à la racine de `_infos`.
- Les ressources pédagogiques sont dans Supabase ; `shared/tool-assets/` ne contient que des dépendances techniques des outils.
- Les SQL numérotés ne constituent pas un lot rejouable sur la base actuelle.
