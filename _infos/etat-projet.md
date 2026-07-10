# État actuel du projet — Site d’outils

Dernière mise à jour : 2026-07-04.

## Intention générale

Le site est une plateforme web d’outils pédagogiques pour la classe.

- Côté élève : accès simple à des activités lisibles, manipulables et adaptées.
- Côté enseignant : Catalogue, Missions, Banques, Classe et Tableau projetable.
- Côté super-admin : création et maintenance des activités, ressources et banques système.

La logique produit actuelle est **tools-first** : un outil visible doit correspondre à une action élève claire. Les activités du Catalogue sont des configurations ciblées de ces outils. Les Missions assemblent ensuite des activités du Catalogue dans un parcours attribuable.

## Vocabulaire produit

Côté élève :

- **Exploration** : accès libre aux activités visibles du Catalogue.
- **Aventure** : progression adaptative personnelle, individuelle, avec code élève.
- **Mission** : parcours attribué explicitement par l’enseignant.

Côté enseignant :

- **Classe** : élèves, niveaux, codes et informations de classe.
- **Catalogue** : activités système consultables, testables et visibles/masquées dans Exploration.
- **Missions** : parcours attribuables.
- **Banques** : contenus réutilisables personnels ou système.
- **Tableau** : widgets projetables.
- **Admin** : gestion système réservée au super-admin.

## Catalogue

Le Catalogue est le socle prêt à l’emploi du site.

Un enseignant normal peut consulter, tester, afficher ou masquer une activité. Le super-admin peut créer, modifier ou supprimer les activités système.

Chaque activité peut comporter cinq niveaux fonctionnels : grande difficulté, petite difficulté, normal, réussite, grande réussite. Le niveau 3 est le point de départ normal. Ces niveaux ne sont pas affichés à l’élève.

### Catalogue de secours

Le fichier `shared/catalogue.js` contient un catalogue de secours local (`CATALOG_ACTIVITIES`). Il ne remplace pas Supabase : il sert de réserve si la table `catalog_activities` n’est pas encore disponible ou pour un usage hors Supabase.

État au 2026-07-05 : 22 activités locales pour 29 outils actifs. Les outils `nombres-lettres`, `conjugaison`, `question-reponse`, `qcm`, `flash-texte`, `flash-qcm` et `selection` sont actifs dans `tools/registry.js`, mais ne sont pas représentés dans ce catalogue de secours.

## Exploration

Exploration utilise les activités visibles du Catalogue. Les réglages de référence sont :

- nombre fixe de questions : 5 ;
- temps par question : infini ;
- temps d’affichage de réponse : infini ou réglage explicite ;
- temps entre questions : 0 ;
- durée maximale : infini ;
- consigne : priorité à la consigne de niveau, puis générale, puis défaut outil.

## Missions

Une Mission est un parcours construit par l’enseignant à partir d’activités du Catalogue. Elle n’est pas une ancienne activité personnelle renommée.

État transitoire : l’arborescence et les références Catalogue existent, mais la création de nouvelles Missions reste volontairement encadrée pour éviter de reconstruire trop tôt un ancien éditeur libre.

## Banques

Deux racines métier doivent rester distinctes :

- **Banques personnelles** : modifiables par l’enseignant.
- **Banques système** : protégées en écriture, duplicables dans les banques personnelles.

Types actuels : Texte, QCM, Sélection. Les outils Flash réutilisent les banques Texte et QCM, sans créer de type de banque supplémentaire.

## Tableau

Le Tableau fonctionne avec des widgets. L’arrière-plan est désormais traité comme un widget système obligatoire : il apparait dans la colonne des widgets, mais n’est ni supprimable, ni duplicable, ni projeté comme un cadre manipulable.


## Dernier patch métier : Monnaie — Représentation

Un nouvel outil actif `monnaie-representation` extrait du legacy `monnaie` les modes Lire une somme et Composer une somme. Il est branché au registre actif et au catalogue de secours. L’ancien outil `monnaie` reste dans le registre legacy pour les autres modes à découper plus tard.

Un nouvel outil actif `plus-moins-autant` a été ajouté pour comparer deux collections par correspondance terme à terme. Il utilise des objets rouges/bleus déplaçables librement, avec réponse Rouge / Autant / Bleu et correction animée par mise en paires.
