# SQL historiques

Dernière mise à jour : 2026-08-04.

Les fichiers numérotés retracent l’évolution du modèle Supabase. Ils sont conservés comme historique du projet et ne doivent pas être rejoués en bloc sur la base actuelle. Le fichier non numéroté `seed_pedagogical_tree_cp_cm2.sql` est un script contrôlé distinct, documenté plus bas.

## Suppression des anciennes banques

`10_remove_question_banks.sql` a été exécuté avec succès le 24 juillet 2026.

Il a supprimé définitivement :

- `question_bank_items` ;
- `question_banks` ;
- `question_bank_folders` ;
- les RPC, fonctions, politiques, triggers, contraintes et index exclusivement liés à ces tables.

Le fichier reste conservé pour documenter la suppression.

## Scripts obsolètes liés aux banques

Les parties relatives aux banques dans les anciens scripts, notamment :

- `01_first_request.sql` ;
- `05_superadmin_resources_banks_delete.sql` ;
- `06_question_bank_instruction.sql` ;

sont historiques et ne doivent plus être exécutées sur la base actuelle.

## Quiz et ressources personnelles

Les scripts `07`, `08` et `09` documentent la mise en place du modèle Quiz et de ses ressources. Ils ne dépendent pas des anciennes banques.

## 11_resource_recordings_folder.sql

Ajoute une métadonnée JSON aux dossiers de ressources et un rôle interne unique par espace enseignant. Le rôle `recordings` permet de retrouver le dossier automatique des enregistrements audio même s’il est renommé ou déplacé. Cette migration doit être exécutée avant le patch de gestion centralisée des enregistrements audio.


## 12_activity_attempt_history.sql

Étend l’historique léger d’Exploration pour créer le contrat commun de tentative d’activité et le détail par question. La migration ajoute les contextes `exploration`, `mission` et `adventure`, les statuts de tentative, les instantanés question/réponse/correction et les trois RPC publiques d’écriture. Elle doit être exécutée avant le patch applicatif « Contrat d’exécution et historique ».

## 13_catalog_pedagogical_tree.sql

Déplace l’arborescence historique d’Exploration dans `catalog_folders` sans modifier les identifiants ni les activités existantes. Les nœuds sont typés (`domain`, `subject`, `program_element`, `competency`), peuvent hériter d’une portée de niveaux CP à CM2 et sont modifiables uniquement par le super-admin. Cette migration doit être exécutée avant le patch d’administration de l’arborescence pédagogique.


## 14_pedagogical_tree_naming.sql

Transforme sans perte l’ancienne nomenclature de l’arborescence : `catalog_folders` devient `pedagogical_nodes`, `catalog_activities.category_id` devient `pedagogical_node_id`, et les types deviennent `discipline`, `domain`, `theme`, `learning_objective`. La migration conserve les identifiants, les parents, l’ordre, les niveaux, les activités et les politiques RLS. Elle doit être exécutée après `13_catalog_pedagogical_tree.sql` et avant le patch applicatif correspondant.


## 15_adventure_objective_registry.sql

Crée le premier registre global qui associait chaque dossier de niveau CP à CM2 au futur mode Aventure. Ce modèle est conservé comme historique : l’écran enseignant ne l’utilise plus depuis le patch 16, car l’ordre et l’activation sont désormais propres à chaque espace enseignant. Cette migration doit avoir été exécutée après `seed_pedagogical_tree_cp_cm2.sql`.

## 16_teacher_adventure_objectives.sql

Ajoute la configuration Aventure propre à chaque espace enseignant. Pour chaque dossier de niveau, elle conserve l’ordre personnalisé et l’activation choisie par le propriétaire du compte. En l’absence de réglage enregistré, l’interface reprend l’ordre de l’arborescence générale et active tous les OdApp. Cette migration doit être exécutée après le patch 15.

## 17_catalog_activity_tiers.sql

Ajoute à chaque activité système un `adventure_tier` positif, fixé à `1` pour toutes les activités existantes. `display_order` devient l’ordre de l’activité à l’intérieur de son palier. L’interface Exploration affiche les activités d’un OdApp dans des panneaux de paliers et le super-admin peut les réordonner ou les déplacer entre paliers par glisser-déposer. Cette migration doit être exécutée après le patch 16.

## 18_student_code_keypad.sql

Ajoute une RPC publique qui fournit, pour l’élève sélectionné, les dix touches du mini-clavier : les caractères de son code et des distracteurs alphanumériques mélangés. Elle doit être exécutée avant le déploiement de l’interface du mini-clavier.


## seed_pedagogical_tree_cp_cm2.sql

Script hors numérotation officielle. Il ne constitue pas une migration historique à rejouer en lot.

Il :

- remplace la portée de niveaux héritée par un cinquième nœud `grade_level` ;
- reconstruit l’arborescence Français et Mathématiques depuis `_infos/referentiels/` ;
- injecte les graphèmes de base dans `Lecture > Étude du code` avec des dossiers CP et CE1 ;
- sauvegarde les anciens nœuds et les anciens rattachements d’activités ;
- reclasse les 26 activités du catalogue local historique ;
- conserve toute activité inconnue dans une branche inactive « À reclasser (migration) » ;
- impose qu’une activité cible toujours un dossier CP, CE1, CE2, CM1 ou CM2.

Il doit être exécuté seul, après déploiement du mini-patch applicatif correspondant et après sauvegarde Supabase.

## 19_adventure_weekly_menus.sql

Crée les 34 menus hebdomadaires du mode Aventure pour chaque niveau. Chaque menu contient quatre jours de six cases obligatoires pouvant cibler un OdApp ou une activité précise. Les menus système sont enregistrés par le super-admin ; les enseignants peuvent stocker des exceptions propres à leur espace, y compris une case volontairement vide. Cette migration doit être exécutée après le patch 17.

## 20_adventure_engine_foundations.sql

Crée les fondations du moteur élève Aventure : curseur Menu/Jour par classe et par niveau, jauges 0–50 propres à chaque palier, journées et passages figés pour la reprise, ainsi que les RPC publiques sécurisées `open_student_adventure_day` et `get_student_adventure_progress`. La migration renforce aussi la validation des cases visant une activité précise : l’activité doit être publiée. Elle doit être exécutée après `19_adventure_weekly_menus.sql`.

## 21_phonology_words_import.sql

Garantit l’existence de la table `phonology_words` et ajoute la fonction super-admin utilisée par l’importateur de la banque phonologique. Le fichier texte est validé dans le navigateur, puis les mots sont ajoutés ou mis à jour en une seule synchronisation. Les mots absents du fichier peuvent être désactivés sans être supprimés. À exécuter une seule fois après `03_superadmin_catalogue.sql`.

## 22_system_image_assets_import.sql

Crée ou configure le bucket public `images`, réserve l’écriture du dossier `bank/` au super-admin et ajoute les métadonnées techniques nécessaires à l’import en masse de `image_assets`. À exécuter une seule fois après `21_phonology_words_import.sql`.

## 23_system_image_resources_explorer.sql

Relie chaque ligne de `image_assets` à une ressource système stable, migre automatiquement les images déjà importées dans `Ressources système > Images > À classer`, puis ajoute la fonction transactionnelle utilisée par les futurs imports. Les déplacements et renommages effectués dans l’explorateur ne modifient ni le slug ni le chemin Storage. À exécuter une seule fois après `22_system_image_assets_import.sql`.
