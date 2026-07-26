# _infos — index documentaire

Dernière mise à jour : 2026-07-24.

Ce dossier sert de mémoire courte et fiable du projet. Il ne doit pas contenir plusieurs documents concurrents racontant des états différents.

## Ordre de lecture conseillé

1. `etat-projet.md` : état fonctionnel actuel.
2. `architecture.md` : découpage technique et règles structurantes.
3. `backlog.md` : décisions en attente et prochaines évolutions.
4. `outils.md` : état des outils et widgets.
5. `tableau.md` : logique du Tableau projetable.
6. `supabase.md` : modèle Supabase actuel et prudences SQL.
7. `legacy.md` : éléments supprimés ou explicitement à ne pas réactiver.
8. `audit-suppression-banques.md` : bilan de la suppression définitive des anciennes banques.

## Règle de maintenance

Quand une idée devient une décision, elle quitte `backlog.md` pour rejoindre le document de référence correspondant. Une note devenue obsolète doit être corrigée ou archivée, pas conservée dans un résumé concurrent.

Les fichiers SQL sont historiques. Ils ne doivent jamais être rejoués comme un lot de migrations sans audit préalable.
