# _infos — index documentaire

Dernière mise à jour : 2026-06-27.

Ce dossier sert de mémoire courte et fiable du projet. Il ne doit plus contenir plusieurs documents concurrents qui racontent la même chose.

## Ordre de lecture conseillé

1. `etat-projet.md` : état fonctionnel actuel.
2. `architecture.md` : découpage technique et règles structurantes.
3. `backlog.md` : choses à faire, arbitrées ou en attente.
4. `outils.md` : état des outils/widgets.
5. `tableau.md` : logique du Tableau projetable.
6. `supabase.md` : modèle Supabase actuel et prudences SQL.
7. `legacy.md` : ce qui est ancien, archivé ou explicitement à ne pas réactiver.

## Règle de maintenance

Quand une idée devient une décision, elle doit quitter `backlog.md` pour rejoindre le document de référence correspondant. Quand une note devient obsolète, elle va dans `archive/`, pas dans un deuxième résumé parallèle.

Les fichiers SQL sont historiques : ne pas les rejouer comme une migration propre sans vérification.
