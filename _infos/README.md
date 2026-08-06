# _infos — index documentaire

Dernière mise à jour : 2026-07-30.

Ce dossier sert de mémoire courte et fiable du projet. Il ne doit pas contenir plusieurs documents concurrents racontant des états différents.

## Ordre de lecture conseillé

1. `etat-projet.md` : état fonctionnel actuel.
2. `architecture.md` : découpage technique et règles structurantes.
3. `aventure.md` : contrat pédagogique et fonctionnel du mode Aventure.
4. `patch-arborescence-dossiers-niveau.md` : ordre de déploiement et tests du mini-patch.
5. `backlog.md` : décisions en attente et prochaines évolutions.
6. `outils.md` : état des outils et widgets.
7. `tableau.md` : logique du Tableau projetable.
8. `supabase.md` : modèle Supabase actuel et prudences SQL.
9. `legacy.md` : éléments supprimés ou explicitement à ne pas réactiver.
10. `audit-suppression-banques.md` : bilan de la suppression définitive des anciennes banques.

## Règle de maintenance

Quand une idée devient une décision, elle quitte `backlog.md` pour rejoindre le document de référence correspondant. Une note devenue obsolète doit être corrigée ou archivée, pas conservée dans un résumé concurrent.

Les fichiers SQL numérotés sont historiques et ne doivent jamais être rejoués comme un lot. Les scripts hors numérotation sont documentés individuellement dans `_infos/sql/README.md`.
