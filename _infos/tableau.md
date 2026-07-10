# Tableau projetable

Dernière mise à jour : 2026-06-27.

## Principe

Le Tableau permet de composer une scène projetable avec des widgets. L’enseignant contrôle la scène depuis le dashboard, et la fenêtre de projection reçoit un état filtré.

## Arrière-plan

L’arrière-plan est désormais un widget système obligatoire :

- toujours présent dans la liste des widgets ;
- sélectionnable pour accéder aux contrôles ;
- non supprimable ;
- non duplicable ;
- non verrouillable/déverrouillable manuellement ;
- non déplaçable ;
- non projeté comme widget indépendant.

Son état réel reste dans `scene.background` afin de ne pas créer un faux cadre d’arrière-plan dans la projection.

## Projection

La projection reçoit uniquement les widgets manipulables. Les widgets système sont filtrés lors de la synchronisation.
