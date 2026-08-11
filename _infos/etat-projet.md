# État actuel du projet — Site d’outils

Dernière mise à jour : 2026-08-07.

## Intention générale

Le site est une plateforme web d’outils pédagogiques pour la classe.

- Côté élève : Exploration, Aventure et Missions.
- Côté enseignant : Classe, Aventure, Exploration, Missions, Quiz, Ressources et Tableau.
- Côté super-admin : les mêmes écrans, enrichis des actions de création, publication, import et organisation des contenus système.

Il n’existe plus d’onglet Admin ni d’onglet Banques.

La logique produit reste **tools-first** : un outil correspond à une action élève claire. Une activité d’Exploration configure un outil ; une Mission assemble des activités ; un Quiz stocke directement ses questions et widgets.

## Arborescence pédagogique

La structure active est :

```text
Discipline
    Domaine
        Thème
            Objectif d’apprentissage
                Dossier de niveau
                    Activités
```

Les activités héritent du niveau `CP`, `CE1`, `CE2`, `CM1` ou `CM2` du dossier qui les contient. Le script contrôlé `_infos/sql/seed_pedagogical_tree_cp_cm2.sql` reconstruit cette arborescence depuis les référentiels Français et Mathématiques ; il ne doit jamais être lancé avec l’ensemble des SQL historiques.

## Exploration

Tous les enseignants utilisent le même explorateur. Ils peuvent consulter, tester et régler la visibilité des activités. Le super-admin dispose en plus de la création, de l’édition, de la publication, de la suppression et de la réorganisation.

`shared/catalogue.js` fournit un secours local de 26 activités lorsque Supabase n’est pas disponible. Le registre réel comprend 32 outils ; six ne possèdent pas d’activité dans ce secours local : `reperage-graphemes`, `dictee-muette`, `nuage-lettres`, `nombres-lettres`, `conjugaison` et `quiz`.

## Aventure

L’écran enseignant des 34 menus par niveau est opérationnel. Les fondations du moteur définissent le curseur Menu/Jour par classe et par niveau, les jauges par palier, les journées figées et les dix passages reprenables. Le branchement complet de l’interface élève reste le chantier prioritaire. Voir `aventure.md`.

## Historique des activités

Exploration, Missions et le futur contexte Aventure partagent un contrat de tentative. Chaque question peut enregistrer son niveau, son résultat, sa durée et des instantanés compacts de la question, de la réponse et de la correction. Voir `historique-activites.md`.

## Quiz

Les Quiz personnels appartiennent à leur espace enseignant. Les Quiz système sont visibles par tous et modifiables uniquement par le super-admin.

Le document du Quiz contient directement ses questions, variantes et widgets. Il ne dépend d’aucune banque de questions. Les images et audios sont référencés par UUID de ressource.

## Ressources

Toutes les ressources pédagogiques, système comme personnelles, vivent dans Supabase et son Storage. Il n’existe plus de `manifest.json` de ressources statiques.

- Les ressources personnelles utilisent `resources`, `resource_folders` et le bucket privé `teacher-resources`.
- Les images pédagogiques système utilisent `image_assets`, une ressource système liée et le bucket public `images`.
- L’importateur super-admin accepte un préfixe technique, un dossier de destination et la recréation des sous-dossiers.
- Le nom visible reprend le nom du fichier sans majuscule ajoutée automatiquement.
- Le super-admin peut classer, renommer et supprimer une image importée ; la suppression est bloquée si un Quiz la référence.
- Le dossier `À classer` est masqué lorsqu’il est vide.

`shared/tool-assets/` conserve uniquement les personnages, la monnaie, les représentations et quelques modules techniques chargés explicitement par les outils. Ces fichiers n’apparaissent jamais dans Ressources.

Les émojis pédagogiques sont chargés depuis Supabase avec des slugs `emoji_*`. Les outils de collections utilisent une liste blanche afin d’exclure les images inadaptées.

## Tableau

Le Tableau compose une scène avec des widgets projetables. L’arrière-plan est un widget système obligatoire : visible dans la liste, mais non supprimable, non duplicable et non projeté comme cadre indépendant.

## Éléments supprimés

Les anciennes activités personnelles, les banques de questions et les cinq outils qui en dépendaient ne font plus partie du produit. Voir `legacy.md`.
