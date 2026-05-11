# ARCHITECTURE — Plateforme / Portail d’outils pédagogiques web

## 1) Rôle de ce fichier

Ce document décrit l’architecture **réellement active** du dépôt dans son état actuel.

Point essentiel :
- le projet est centré sur une logique **tools-first** ;
- les nouveaux développements vivent dans `tools/` ;
- le runtime racine actif est `shared/tool-root-runtime.js` ;
- le runtime élève moderne est structuré autour d’un **shell de session commun** piloté par `shared/student-core.js` et `student/views/session-view.js` ;
- l’ancienne façade `shared/module-registry.js` / `shared/module-factory.js` n’est plus présente dans le zip fourni.

Attention au vocabulaire :
- le champ Supabase `module_key` existe toujours ;
- certaines variables front s’appellent encore `moduleKey` ou `moduleRuntime` ;
- dans le flux actif, cette couche pointe vers la racine logique `tools`.

---

## 2) Grandes zones du dépôt

### 2.1. `teacher/`

Contient l’espace enseignant :
- dashboard ;
- éditeur de configuration ;
- gestion élèves / activités / dossiers ;
- onglet **Banques** ;
- partage ;
- projection ;
- intégration de l’éditeur tools-first dans le dashboard.

Le dashboard est découpé en contrôleurs sous `teacher/js/dashboard/`, notamment :
- `activities-view.js` ;
- `activity-drag.js` ;
- `activity-overlays.js` ;
- `activity-tree.js` ;
- `editor-controller.js` ;
- `header-popups.js` ;
- `question-banks-view.js` ;
- `share-manager.js` ;
- `student-controller.js` ;
- `text-utils.js`.

### 2.2. `student/`

Contient l’espace élève :
- routeur ;
- vues ;
- état ;
- session ;
- projection ;
- shell visuel élève ;
- rendu de la jauge / du compteur d’évaluation ;
- affichage des contrôles globaux de séance ;
- étoiles / décor global.

Routes actives :
- `#/home` ;
- `#/selectmode` ;
- `#/selectstudents` ;
- `#/activities` ;
- `#/sessionchoice` ;
- `#/sessionstart` ;
- `#/session`.

`#/sessionchoice` joue un rôle particulier pour les entrées directes de séance partagée ou projetée : le routeur la redirige vers le démarrage de séance ou vers le flow de sélection attendu.

### 2.3. `shared/`

Contient les briques communes actives :
- `tool-contract.js` ;
- `tool-root-runtime.js` ;
- `activity-config.js` ;
- `activity-duration.js` ;
- `activity-modes.js` ;
- `config-widgets.js` ;
- `api-common.js` ;
- `public-api.js` ;
- `student-core.js` ;
- `simple-markup.js` / `simple-markup.css` ;
- `selection-text.js` / `selection-text.css` ;
- `tool-instruction.js` / `tool-instruction.css` ;
- `value-constraints.js` ;
- helpers divers.

Dans le zip courant, `shared/module-registry.js` et `shared/module-factory.js` ne sont pas présents. Les anciennes mentions de ces fichiers dans la documentation sont donc obsolètes.

### 2.4. `tools/`

Racine active des outils modernes.

Contenu actif :
- `tools/registry.js` ;
- `tools/operations/` ;
- `tools/nombre-cible/` ;
- `tools/monnaie/` ;
- `tools/operations-trous/` ;
- `tools/representation-decimale/` ;
- `tools/ordre-alphabetique/` ;
- `tools/encodage/` ;
- `tools/nombres-lettres/` ;
- `tools/reperage-numerique/` ;
- `tools/question-reponse/` ;
- `tools/qcm/` ;
- `tools/selection/`.

### 2.5. Ancienne racine `modules/`

La racine historique `modules/` n’est pas présente dans le dépôt courant.

Statut actuel :
- le flux actif ne charge plus que les outils déclarés dans `tools/registry.js` ;
- les anciennes façades `shared/module-registry.js` et `shared/module-factory.js` ne sont pas présentes ;
- les noms `moduleKey` / `moduleRuntime` restent des traces lexicales de transition, mais ne désignent plus une architecture de modules chargeable.

---

## 3) Entrée active réelle des outils

### 3.1. Registre source

Le registre source des outils actifs est :
- `tools/registry.js`.

Il expose :
- une méta-racine logique `tools / Outils` ;
- la liste des outils actifs.

À ce jour, douze outils sont déclarés :
- `operations` ;
- `nombre-cible` ;
- `monnaie` ;
- `operations-trous` ;
- `representation-decimale` ;
- `ordre-alphabetique` ;
- `encodage` ;
- `nombres-lettres` ;
- `reperage-numerique` ;
- `question-reponse` ;
- `qcm` ;
- `selection`.

### 3.2. Runtime racine

Le runtime racine des nouveaux outils est :
- `shared/tool-root-runtime.js`.

Il sait :
- charger le catalogue ;
- charger dynamiquement un outil ;
- rendre / binder / lire les réglages communs de flux ;
- estimer la durée d’une activité ;
- exposer la consigne personnalisée commune ;
- exposer les réglages communs de jauge infinie ;
- exposer la durée maximale optionnelle propre à chaque outil.

### 3.3. Branchement réel dans l’app

Le runtime racine est chargé directement par :
- `teacher/js/config-editor.js` ;
- `teacher/js/dashboard.js` ;
- `shared/student-core.js`.

Le nom `moduleKey` reste dans plusieurs signatures parce que le stockage Supabase conserve `module_key`, mais le chemin actif est désormais `tools` → `tool-root-runtime` → `tools/registry.js` → outil.

---

## 4) Contrat outil actif

Le contrat outil repose sur :
- `shared/tool-contract.js`.

### 4.1. Ce qu’il gère aujourd’hui

Le contrat gère notamment :
- `defineTool(...)` ;
- la normalisation du contrat ;
- les modes pédagogiques `individual / group` ;
- les capacités runtime ;
- le support de la projection comme contexte d’exécution, avec UI déduite du mode pédagogique ;
- la création d’activité via `createActivity(...)` ;
- la résolution de la consigne via `resolveToolInstruction(...)` ;
- le wrapper des runtimes modernes et legacy ;
- le branchement optionnel du **toggle shell** permettant d’alterner entre correction et réponse élève.

### 4.2. Champs utiles aujourd’hui

Les champs utilisés dans les outils modernes sont notamment :
- `id` ;
- `label` ;
- `version` ;
- `description` ;
- `tags` ;
- `defaultInstruction` ;
- `supportsCustomInstruction` ;
- `workAreaLayout` sur certains outils ;
- `buildRuntimeConfig(...)` ;
- `getActivityModeProfile(...)` ;
- `getRuntimeCapabilities(...)` ;
- `createActivity(...)`.

### 4.3. Validation shell

Le runtime outil peut s’aligner sur une logique de **validation pilotée par le shell**.

Cette logique implique :
- le shell possède le bouton `Valider` dans les modes concernés ;
- l’outil expose sa compatibilité via `supportsShellValidation(...)` ;
- l’outil expose l’état runtime `canValidate(...)` ;
- le shell appelle ensuite `validate(...)` côté outil.

La validation shell dépend maintenant du profil de passation :
- `response_ui = boxed` → le shell peut afficher `Valider` si l’outil supporte la validation ;
- `response_ui = free` → aucune réponse formelle n’est attendue et le shell ne propose pas `Valider`.

### 4.4. Toggle shell “Voir ma réponse / Voir la correction”

Le contrat supporte un mécanisme optionnel pour les outils capables d’alterner entre :
- la correction affichée par défaut ;
- la réponse de l’élève mémorisée.

Les hooks runtime concernés sont :
- `getShellAnswerDisplayState(...)` ;
- `setShellAnswerDisplayMode(...)`.

Quand ces hooks sont absents, le shell masque naturellement ce toggle.

### 4.5. Consigne personnalisée

La consigne personnalisée est supportée côté contrat, côté configuration commune et côté runtime :
- elle apparait dans le widget commun ;
- elle peut être activée/désactivée par activité ou item de séquence ;
- elle est résolue par le runtime outil question par question.

---

## 5) Couche commune de configuration active

La couche commune active est portée par :
- `shared/activity-config.js` ;
- `shared/tool-root-runtime.js` ;
- `teacher/js/config-editor.js`.

Dans l’éditeur, le mode de passation général est présenté dans une tuile déployable du panneau gauche, au-dessus de la tuile `Durée` :
- le résumé visible affiche les trois critères de passation, par exemple `Individuel - Avec réponse - Évaluation` ;
- la tuile contient trois contrôles segmentés pleine largeur ;
- `Activité individuelle` / `Activité collective` est branché sur le vrai `activity_mode` ;
- `Réponse saisie` / `Réponse non saisie` est branché sur `response_ui` ;
- `Situation d’évaluation` / `Situation d’entrainement` est branché sur `progress_mode` ;
- le changement modifie le vrai profil de passation sauvegardé, pas un override temporaire ;
- la bascule est interdite pendant une projection ou un enregistrement ;
- avant bascule, `teacher/js/config-editor.js` charge les contrats des outils de la séquence et vérifie leur compatibilité via `getToolPassationProfileSupport(...)` ;
- en cas d’incompatibilité, la bascule est refusée et l’éditeur affiche le ou les outils bloquants ;
- en cas de réussite, les métadonnées, la liste des outils compatibles, le panneau de réglages courant et l’estimation de durée sont recalculés selon le nouveau mode.

La bascule ne supprime pas volontairement les réglages spécifiques des outils : l’éditeur les conserve dans les drafts et laisse chaque outil adapter son UI au mode courant.

Le bouton d’ajout d’outil n’est plus placé dans l’en-tête du panneau gauche : il est rendu comme une fausse tuile `+ Ajouter un outil` en fin de séquence. Quand un outil est ajouté, cette tuile se décale naturellement sous la nouvelle tuile outil.

### 5.1. Réglages communs par item de séquence

Chaque item de séquence porte un draft commun normalisé avec notamment :
- `enabled` ;
- `timePerQ` ;
- `questionCount` ;
- `answerTime` ;
- `questionTransitionSec` ;
- `questionTransitionInfinite` ;
- `toolMaxTimeMin` ;
- `toolMaxTimeInfinite` ;
- `infiniteTimePerQ` ;
- `questionFlowMode` (`fixed`, `unlimited`, `successGoal`) ;
- `successGoalCorrectCount` ;
- `successGoalSafetyMilestones` ;
- `infiniteAnswerTime` ;
- `settings`.

### 5.2. Réglages communs exposés dans l’UI

Le widget commun gère :
- `Questions`, sous forme de contrôle segmenté :
  - `Nombre fixe` → `questionFlowMode = fixed` et champ `questionCount`, affiché comme “questions posées” ;
  - `Illimitées` → `questionFlowMode = unlimited`, sans champ complémentaire ;
  - `Objectif de réussite` → `questionFlowMode = successGoal`, visible quand `response_ui = boxed` et `progress_mode = evaluated` ;
- `Temps par question` ;
- `Temps d’affichage réponse` ;
- `Temps entre les questions` ;
- `Durée maximale` ;
- leurs boutons `∞` quand le réglage concerné reste temporel ;
- `Consigne personnalisée` ;
- les réglages de **jauge infinie / objectif de réussite** uniquement quand `Objectif de réussite` est sélectionné :
  - `Objectif` → nombre de réponses correctes requises ;
  - `Paliers de sécurité`.

### 5.3. Réglages globaux d’activité

Les globals actifs exposés dans l’UI sont :
- `activityTotalTimeEnabled` ;
- `activityTotalTimeSec`.

Le temps entre deux questions n’est plus un global : `questionTransitionSec` et `questionTransitionInfinite` sont des réglages communs portés par chaque item de séquence, afin que chaque outil puisse avoir son propre rythme.

La durée maximale n’est pas un global non plus : `toolMaxTimeMin` et `toolMaxTimeInfinite` sont des réglages communs portés par chaque item de séquence. Ils alimentent le compte à rebours runtime propre à l’outil courant et permettent au moteur de savoir quand la limite de l’outil est atteinte.

La variante de réponse en projection n’est plus un réglage enseignant : la projection respecte le profil de passation sauvegardé (`activity_mode`, `response_ui`, `progress_mode`) et reste un contexte d’exécution.

`activityTotalTimeEnabled` et `activityTotalTimeSec` pilotent la durée totale optionnelle d’une activité. Quand la durée totale est activée, le dernier outil de la séquence est forcé en `questionFlowMode = unlimited`, afin que la séance puisse remplir la durée globale fixée. Cette règle ne force jamais `successGoal`.

La projection reste un contexte d’exécution et utilise le même profil de passation que la séance élève ; elle ne réintroduit pas de mode d’activité `projection`.

### 5.4. Réglages communs d’objectif de réussite

Le coeur commun gère des valeurs normalisées pour `questionFlowMode = successGoal` :
- `successGoalCorrectCount` ;
- `successGoalSafetyMilestones`.

Valeurs par défaut actuelles :
- `successGoalCorrectCount = 10` ;
- `successGoalSafetyMilestones = 3`.

`successGoal` est disponible quand le profil de passation est évalué avec réponse saisie : `response_ui = boxed` et `progress_mode = evaluated`. Il fonctionne aussi bien pour un joueur individuel que pour un joueur collectif.

### 5.5. Séquence d’activité

Une activité stocke une **séquence ordonnée** d’outils :
- `config_json.sequence`.

Chaque item contient :
- `instanceId` ;
- `toolId` ;
- `draft`.

---

## 6) Shell élève actif sur `#/session`

### 6.1. Portée

Le shrink-to-fit et le shell géométrique fixe concernent **uniquement `#/session`**.

Les autres vues élève restent en logique responsive plus classique.

### 6.2. Scène logique

La session utilise une scène logique complète de :
- `1920 × 1080`.

Cette scène est shrinkée de façon homothétique pour tenir dans le viewport disponible.

### 6.3. Chrome de session

La scène `#/session` est structurée en trois bandes :
- bande haute : `70 px` ;
- bande centrale : `930 px` ;
- bande basse : `80 px`.

La bande centrale est structurée en :
- réserve gauche : `150 px` ;
- zone outil : `1620 px` ;
- réserve droite : `150 px`.

Donc la zone utile de référence pour les outils dans `#/session` est :
- **`1620 × 930`**.

### 6.4. Contenu du chrome

En haut :
- bouton retour ;
- bouton pause ;
- timer.

En bas :
- commandes globales de séance ;
- commandes de projection ;
- bouton shell `Valider` quand applicable ;
- toggle shell `Voir ma réponse / Voir la correction` quand applicable ;
- pill de compte à rebours de l’outil courant quand sa durée maximale est finie.

La pill de durée maximale :
- est placée dans la zone basse, à droite ;
- affiche uniquement le temps restant au format `MM:SS` ;
- reste masquée quand `toolMaxTimeInfinite` est vrai ;
- pulse par effet de `scale` quand le compteur atteint `00:00`.

### 6.5. Réserve droite

La réserve droite accueille l’affichage d’évaluation quand le profil le demande :
- `boxed + evaluated + fixed` → jauge segmentée ;
- `boxed + evaluated + unlimited` → compteur `Questions posées` / `Réponses correctes` ;
- `boxed + evaluated + successGoal` → jauge continue avec paliers.

Elle reste dans le shell de la scène shrinkée, donc elle shrinke avec le reste.

### 6.6. Overlays

Les overlays de pause / transition / messages :
- vivent dans la scène shrinkée ;
- couvrent visuellement la scène ;
- ne sont pas rendus hors shell.

---

## 7) Jauge et compteur d’évaluation de session

### 7.1. Périmètre

L’affichage latéral d’évaluation vit dans le shell de `#/session` et n’est affiché que lorsque :
- `response_ui = boxed` ;
- `progress_mode = evaluated` ;
- le runtime n’est pas en projection enseignante.

En mode `individual`, le joueur est l’élève. En mode `group`, le joueur est le groupe / collectif.

### 7.2. `questionFlowMode = successGoal`

La jauge est continue avec paliers de sécurité :
- bonne réponse → progression augmente ;
- mauvaise réponse → retour au dernier palier franchi ;
- objectif atteint → réussite de l’outil.

### 7.3. `questionFlowMode = fixed`

La jauge est segmentée :
- un segment = une question ;
- vert = réponse correcte ;
- rouge = réponse incorrecte ;
- vide = question non jouée.

### 7.4. `questionFlowMode = unlimited`

Il n’y a pas de jauge, car il n’y a ni total ni objectif. La réserve droite affiche un compteur :
- `Questions posées` ;
- `Réponses correctes`.

### 7.5. Assets

La jauge utilise les assets shell :
- `shared/ui-assets/rocket-off.svg` ;
- `shared/ui-assets/rocket-on.svg`.

---

## 8) Structure cible d’un outil actif

Chaque outil reconstruit vit sous :
- `tools/<tool-id>/`.

Structure effectivement utilisée :
- `tool.js` ;
- `config.js` ;
- `model.js` ;
- `activity.js` ;
- `activity.css` ;
- éventuellement `config.css` et des `assets/` locaux si l’outil en a besoin.

### Répartition des responsabilités

- `tool.js` : contrat, métadonnées, branchement global ;
- `config.js` : UI enseignant spécifique à l’outil ;
- `model.js` : logique métier, normalisation, génération, validation, renderers si utile ;
- `activity.js` : runtime élève / projection et rendu interactif ;
- `activity.css` : styles spécifiques ;
- `assets/` : aides visuelles locales de l’outil, pas réponses précalculées massives.

---

## 9) Outils actifs réellement présents

## 9.1. `tools/operations/`

L’outil couvre :
- additions ;
- soustractions ;
- multiplications ;
- divisions prévues mais non activées dans l’UI.

État actuel :
- configuration moderne branchée pour additions, soustractions et multiplications ;
- divisions visibles comme “bientôt” mais désactivées ;
- runtime boxed/free réaligné avec le shell moderne ;
- réponse à droite de l’opération, après `=` ;
- validation shell ;
- toggle shell correction / réponse élève.

## 9.2. `tools/nombre-cible/`

L’outil couvre :
- boites à jetons ;
- calculs ciblés ;
- défi des 6 nombres.

État actuel :
- outil moderne avec layout `stretch` ;
- configuration dédiée aux trois types d’exercices ;
- génération de questions côté modèle ;
- projection possible comme contexte d’exécution, en respectant `response_ui` ;
- validation shell ;
- toggle shell correction / réponse élève.

## 9.3. `tools/monnaie/`

L’outil couvre :
- lire une somme ;
- composer une somme ;
- comparer des sommes.

État actuel :
- outil moderne avec layout `stretch` ;
- assets locaux de pièces et billets ;
- choix des dénominations autorisées ;
- format d’affichage configurable ;
- bornes de sommes avec widget min/max avancé ;
- options futures affichées mais désactivées pour acheter des objets, trouver plusieurs façons et rendre la monnaie ;
- projection possible comme contexte d’exécution, en respectant `response_ui` ;
- validation shell ;
- toggle shell correction / réponse élève.

## 9.4. `tools/operations-trous/`

L’outil couvre :
- additions à trous ;
- soustractions à trous ;
- multiplications à trous.

État actuel :
- configuration moderne avec génération aléatoire ou liste fixe ;
- position du trou configurable ;
- retenues pour additions et soustractions ;
- règles communes ou spécifiques pour les termes ;
- contrainte de résultat ;
- projection possible comme contexte d’exécution, en respectant `response_ui` ;
- validation shell ;
- toggle shell correction / réponse élève.

## 9.5. `tools/representation-decimale/`

L’outil gère :
- `Représentation → Nombre` ;
- `Nombre → Représentation`.

Thèmes actifs :
- `picbille` ;
- `dede` ;
- `blocs_bleus_base10` ;
- `blocs_textuels`.

État actuel :
- rendu SVG dynamique ;
- panneau d’assets ;
- bouton `Organiser` ;
- fusions automatiques ;
- correction différentielle ;
- validation shell ;
- toggle shell correction / réponse élève.

## 9.6. `tools/ordre-alphabetique/`

L’outil gère :
- tri de lettres ;
- tri de mots ;
- réponses boxed/free selon le mode ;
- drag-and-drop ;
- correction animée.

État actuel :
- vrai outil `tools/` moderne ;
- banque de mots enseignant via vocabulaire ;
- consigne personnalisée supportée ;
- validation shell supportée.

## 9.7. `tools/encodage/`

L’outil gère :
- bibliothèque de graphèmes ;
- réponses `libre` ou `cases` ;
- presets enseignant phonologie ;
- évaluation phonographique ;
- projection.

État actuel :
- outil modernisé sous `tools/` ;
- dépendances enseignant chargées dynamiquement dans la config ;
- correction colorée + réponse canonique en phase answer ;
- validation shell ;
- toggle shell correction / réponse élève ;
- support de projection comme contexte d’exécution, limité selon le mode de réponse (`libre` → `free`, sinon `boxed`).

## 9.8. `tools/nombres-lettres/`

L’outil gère :
- `nombre → écriture` ;
- `écriture → nombre` ;
- `mixte` ;
- plage MVP `0–999` ;
- rendu dynamique du Seyès ;
- police `BelleAllureGS` ;
- réponse stricte avec simple `trim()`.

État actuel :
- plus d’assets de mots ;
- génération dynamique du texte ;
- réponse élève réelle en individuel et en projection d’une activité individuelle (`boxed`) ;
- toggle shell pour revoir la réponse élève.

## 9.9. `tools/reperage-numerique/`

L’outil gère :
- `numberToGraduation` ;
- `graduationToNumber` ;
- frise Picbille ;
- droite simple ;
- droite complète.

État actuel :
- rendu dynamique des repères ;
- réglages de type de ligne, positions, valeurs, écarts ;
- réglage `picbilleBoxCount` ;
- validation shell ;
- toggle correction / réponse élève.

## 9.10. `tools/question-reponse/`

L’outil gère :
- questions à réponse textuelle courte ;
- banque `text_answer` ;
- réponse principale ;
- réponses acceptées ;
- explication ;
- tirage dans l’ordre ou aléatoire.

État actuel :
- branché sur les banques Supabase ;
- validation shell ;
- toggle correction / réponse élève.

## 9.11. `tools/qcm/`

L’outil gère :
- banque `qcm` ;
- réponse correcte ;
- distracteurs ;
- explication ;
- tirage dans l’ordre ou aléatoire ;
- mélange optionnel des choix ;
- nombre maximal de choix configurable de 2 à 6.

État actuel :
- branché sur les banques Supabase ;
- validation shell ;
- projection possible comme contexte d’exécution, en respectant `response_ui` ;
- pas de toggle correction/réponse déclaré dans le runtime actuel.

## 9.12. `tools/selection/`

L’outil gère :
- banque `selection` ;
- énoncé tokenisé ;
- indices de mots attendus ;
- sélection continue ;
- explication ;
- tirage dans l’ordre ou aléatoire.

État actuel :
- branché sur les banques Supabase ;
- validation shell ;
- toggle correction / réponse élève.

---

## 10) Banques de contenus

Les banques de contenus sont branchées à trois niveaux :

### A. Dashboard enseignant

Fichiers principaux :
- `teacher/js/dashboard/question-banks-view.js` ;
- `teacher/css/question-banks.css` ;
- intégration dans `teacher/dashboard.html` ;
- import du contrôleur dans `teacher/js/dashboard.js`.

Types éditables actuellement :
- `text_answer` ;
- `qcm` ;
- `selection`.

### B. API enseignante

`teacher/js/teacher-api.js` sait :
- lister les banques ;
- créer une banque ;
- modifier une banque ;
- supprimer une banque ;
- lister les items ;
- remplacer les items via RPC ;
- copier une banque vers l’espace enseignant.

### C. API publique élève

`shared/public-api.js` lit les items via :
- `get_question_bank_items_for_space`.

Cette RPC permet au runtime élève de charger uniquement les items actifs accessibles par le code d’accès.

---

## 11) Backend et stockage

Le backend reste porté par Supabase.

Points importants :
- les activités sont stockées dans `activity_configs.config_json` ;
- le champ `module_key` existe encore en base ;
- dans le flux actif, la clé logique attendue est `tools` ;
- les banques utilisent `question_banks` et `question_bank_items` ;
- les nouveaux outils (`nombre-cible`, `monnaie`, `operations-trous`) n’ajoutent pas de table dédiée visible dans le front courant : ils vivent dans les réglages JSON d’activité, sauf assets locaux de `monnaie`.

---

## 12) Règle de reconstruction retenue

Pour les anciens outils :
- la vraie cible de reconstruction reste `tools/` ;
- aucune nouvelle fonctionnalité ne doit recréer une racine runtime parallèle ;
- les traces lexicales historiques peuvent être nettoyées progressivement, sans refactor massif gratuit.

Règle pratique :
- ne pas casser l’UI/UX enseignant déjà validée ;
- ne pas casser le runtime déjà utilisable ;
- concentrer les changements sur le branchement métier et la cohérence interne ;
- quand un comportement devient global au shell (`Valider`, toggle correction/réponse, jauge, chrome de session), le traiter au niveau du shell plutôt qu’outil par outil.

---

## 13) Priorité technique utile

L’état actuel appelle plutôt :
1. stabilisation du shell `#/session` et de ses contrôles globaux ;
2. homogénéisation des outils vis-à-vis de la validation shell et du toggle correction/réponse ;
3. consolidation des nouveaux outils mathématiques (`nombre-cible`, `monnaie`, `operations-trous`) ;
4. consolidation des banques de contenus et des outils `question-reponse`, `qcm`, `selection` ;
5. réglages fins d’UI sur les outils actifs ;
6. poursuite progressive de l’assainissement du vocabulaire hérité.
---

## Aide contextuelle commune

Le projet possède une brique commune d’aide contextuelle :
- `shared/help-popover.js` ;
- `shared/help-popover.css` ;
- `shared/help-content.js`.

Le bouton `?` principal situé à côté du titre **Tableau de bord** reste un bouton spécial toujours visible. Sa popup contient :
- le bouton `Tutoriel`, conservé comme point d’entrée futur ;
- le master switch **Icônes d’aide**, branché sur `localStorage` via la clé `teacher.helpBubblesEnabled`.

Les futurs boutons d’aide contextuelle peuvent utiliser `data-help-id`. Ils sont soumis au master switch, sauf si `data-help-contextual="false"` est explicitement défini.

Les textes généraux vivent dans `shared/help-content.js`. Les textes propres aux outils pourront vivre plus tard dans `tools/<tool-id>/help.js` et être enregistrés via le système commun.

