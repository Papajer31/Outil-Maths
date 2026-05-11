# PROJET — Plateforme / Portail d’outils pédagogiques web

## 1) Objectif global

Construire une plateforme pédagogique web pensée pour un usage réel en classe, avec :
- un espace enseignant pour organiser élèves, dossiers, banques et activités ;
- un espace élève / projection pour lancer les séances ;
- un moteur de session partagé ;
- des outils configurables, réutilisables et reconstruits dans une architecture `tools-first`.

Le cap actuel est clairement **tools-first** :
- le coeur actif du projet vit autour d’un registre d’outils ;
- chaque nouvel outil doit être autonome ;
- l’ancien monde `modules/` n’est plus présent dans le dépôt courant : le flux actif passe par `tools/`, `tools/registry.js` et `shared/tool-root-runtime.js`.

---

## 2) État produit réel actuel

### A. Espace enseignant

Le dashboard enseignant fonctionne avec :
- connexion enseignant ;
- gestion de l’espace enseignant et du code d’accès ;
- gestion des élèves ;
- gestion des activités et des dossiers ;
- éditeur de configuration intégré ;
- onglet **Banques** pour les banques de contenus ;
- partage d’activité ;
- lancement et suivi de projection.

L’onglet **Banques** est une partie active du produit. Il permet de gérer des contenus réutilisables pour les outils de questions :
- texte ;
- QCM ;
- sélection de mots dans un énoncé.

### B. Espace élève

Le flow élève fonctionne avec :
- entrée par code ;
- navigation par vues hash ;
- choix du mode d’activité ;
- choix des élèves selon le mode ;
- navigation dans les dossiers d’activités ;
- écran de démarrage de séance ;
- moteur de session élève / projection.

Routes élève visibles dans le dépôt :
- `#/home` ;
- `#/selectmode` ;
- `#/selectstudents` ;
- `#/activities` ;
- `#/sessionchoice` ;
- `#/sessionstart` ;
- `#/session`.

`#/sessionchoice` sert surtout de point d’entrée / redirection pour les liens de séance partagée ou projetée.

### C. Modes actifs et projection

Les modes pédagogiques actifs sont désormais :
- `individual` ;
- `group`.

`projection` n’est plus un mode d’activité stocké dans `activity_mode`.
La projection est une **action de lancement** / un contexte d’exécution. Elle ne modifie pas le mode de passation : elle respecte `activity_mode`, `response_ui` et `progress_mode`.

Le contexte technique de projection est porté par le runtime, notamment via `runMode = "projected-teacher"`.

Le cadrage retenu pour une activité est désormais : **une activité = un mode de passation général**.
Ce mode de passation repose sur trois critères conceptuels :
- mode social : `individual` / `group` ;
- interface de réponse : `boxed` / `free` ;
- progression : `evaluated` / `practice`.

État actuel du dépôt :
- les trois critères sont persistés dans `config_json` via `activity_mode`, `response_ui` et `progress_mode` ;
- l’éditeur affiche une tuile déployable **Mode de passation général** dans le panneau gauche ;
- cette tuile remplace l’ancienne pill de mode située dans l’en-tête ;
- le contrôle segmenté `Activité individuelle` / `Activité collective` modifie le vrai `activity_mode` de l’activité ;
- les contrôles `Réponse saisie` / `Réponse non saisie` et `Situation d’évaluation` / `Situation d’entrainement` modifient les vrais champs `response_ui` et `progress_mode` ;
- le runtime élève / projection reçoit ce profil de passation et utilise `response_ui` comme source unique de vérité pour choisir entre réponse encadrée et réponse libre ;
- le profil interdit `individual + free + evaluated` est bloqué par l’éditeur ;
- la bascule du profil reste bloquée pendant une projection ou un enregistrement ;
- avant changement, l’éditeur vérifie la compatibilité de tous les outils de la séquence avec le profil cible ;
- si un outil est incompatible, le changement est refusé et un message explicite est affiché ;
- si le changement est accepté, l’éditeur se réadapte immédiatement au profil cible et l’activité doit être enregistrée pour conserver ces changements.

Les réglages propres aux outils ne sont pas détruits par une bascule de mode : ils peuvent être masqués ou ignorés par l’UI/runtime selon le mode, mais restent conservés autant que possible dans la configuration.

---

## 3) État réel du pivot tools-first

### Ce qui est vrai dans le dépôt courant

- la racine active des outils est `tools/` ;
- le registre actif est `tools/registry.js` ;
- le runtime racine des outils est `shared/tool-root-runtime.js` ;
- le dashboard et le coeur élève chargent directement ce runtime ;
- les anciens fichiers de façade `shared/module-registry.js` et `shared/module-factory.js` ne sont pas présents dans le zip fourni.

### Ce qui reste transitoire

- le champ Supabase `activity_configs.module_key` existe toujours ;
- plusieurs variables du front gardent encore des noms historiques comme `moduleKey` ou `moduleRuntime` ;
- la valeur logique active attendue reste généralement `tools` ;
- les anciens fichiers de façade `shared/module-registry.js`, `shared/module-factory.js` et la racine historique `modules/` ne sont pas présents dans le dépôt courant.

Conclusion :
- le projet est **réellement tools-first dans le flux actif** ;
- la transition historique survit surtout dans quelques noms de variables et dans le champ `module_key` en base, pas dans une racine runtime encore active.

---

## 4) État technique réellement atteint dans le dépôt actuel

### 4.1. Contrat outil actif

`shared/tool-contract.js` est la base du contrat fonctionnel des outils modernes.

Le contrat gère notamment :
- `defineTool(...)` ;
- les modes d’activité ;
- les capacités runtime ;
- la projection comme contexte d’exécution, avec UI `boxed/free` dérivée du mode pédagogique ;
- `buildRuntimeConfig(...)` ;
- `createActivity(...)` ;
- la résolution d’une consigne via `resolveToolInstruction(...)` ;
- le support de la validation shell ;
- le support optionnel du toggle shell “Voir ma réponse / Voir la correction”.

Hooks runtime importants aujourd’hui :
- `supportsShellValidation(...)` ;
- `canValidate(...)` ;
- `validate(...)` ;
- `getShellAnswerDisplayState(...)` ;
- `setShellAnswerDisplayMode(...)`.

### 4.2. Registre actif des outils

`tools/registry.js` déclare aujourd’hui une racine logique `tools / Outils` contenant **douze outils actifs** :
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

### 4.3. Runtime racine des outils

`shared/tool-root-runtime.js` fournit :
- le chargement du catalogue d’outils depuis `tools/registry.js` ;
- le chargement dynamique d’un outil ;
- le rendu, le binding et la lecture des réglages communs ;
- l’estimation de durée d’activité ;
- l’exposition de la consigne personnalisée commune ;
- l’exposition des réglages de questions (`fixed`, `unlimited`, `successGoal`) ;
- l’exposition de la durée maximale optionnelle propre à chaque outil.

### 4.4. Couche commune réellement exposée aujourd’hui

Dans le flux actif actuel, la couche commune gère :
- `questionCount` ;
- `questionFlowMode`, affiché dans l’UI comme un contrôle segmenté `Questions` : `Nombre fixe`, `Illimitées`, et `Objectif de réussite` quand `response_ui = boxed` et `progress_mode = evaluated` ;
- `timePerQ` ;
- `answerTime` ;
- leurs variantes infinies ;
- `questionTransitionSec` ;
- `questionTransitionInfinite` ;
- `toolMaxTimeMin` ;
- `toolMaxTimeInfinite` ;
- la **consigne personnalisée** ;
- les réglages d’**objectif de réussite** quand `questionFlowMode = successGoal` :
  - `successGoalCorrectCount` (`Objectif`, en réponses correctes) ;
  - `successGoalSafetyMilestones` (`Paliers de sécurité`).

`questionTransitionSec` et `questionTransitionInfinite` sont portés par le draft de chaque item de séquence : chaque outil peut donc définir son propre temps entre deux questions.

`toolMaxTimeMin` et `toolMaxTimeInfinite` sont eux aussi portés par le draft de chaque item de séquence : chaque outil peut donc avoir sa propre durée maximale. Dans l’éditeur, ce réglage apparait dans le widget commun comme quatrième champ temporel, après `Temps entre les questions`. Dans le runtime élève, une pill de compte à rebours peut s’afficher en bas à droite pour l’outil courant.

La durée totale d’activité reste un réglage global via `activityTotalTimeEnabled` et `activityTotalTimeSec`. Quand elle est activée, le dernier outil de la séquence est forcé en `questionFlowMode = unlimited`, afin que la séance puisse occuper la durée globale demandée. Cette règle ne force jamais l’objectif de réussite.

La variante de réponse en projection n’est plus un réglage enseignant global : la projection respecte le profil de passation sauvegardé (`activity_mode`, `response_ui`, `progress_mode`) et reste un contexte d’exécution.

La projection reste un contexte d’exécution, pas un mode d’activité.

---

## 5) Outils actifs réellement présents

## 5.1. `Opérations`

L’outil couvre aujourd’hui :
- additions ;
- soustractions ;
- multiplications ;
- divisions uniquement prévues / désactivées dans l’UI actuelle.

État réel :
- la configuration moderne est branchée pour additions, soustractions et multiplications ;
- les divisions apparaissent comme “bientôt” et restent désactivées dans le sélecteur ;
- additions : génération aléatoire, liste fixe, mode spécial `doubles`, retenues, nombre de termes, règles communes/spécifiques, contrainte de résultat ;
- soustractions : génération aléatoire, liste fixe, mode spécial passage à la dizaine inférieure, retenues, règles communes/spécifiques, contrainte de résultat ;
- multiplications : profil `tables` ou `calcul posé`, tables sélectionnables, multiplicateurs, ordre, position du facteur, génération aléatoire ou liste fixe, contrainte de résultat ;
- en runtime, l’outil est aligné sur le shell moderne :
  - validation shell ;
  - réponse boxed à droite de l’opération après `=` ;
  - toggle correction / réponse élève.

## 5.2. `Nombre cible`

L’outil couvre trois familles d’exercices :
- `Boites à jetons` ;
- `Calculs ciblés` ;
- `Défi des 6 nombres`.

État réel :
- outil moderne sous `tools/nombre-cible/` ;
- modes pédagogiques `individual` et `group` supportés ;
- projection possible comme contexte d’exécution, en respectant `response_ui` ;
- validation shell supportée ;
- toggle correction / réponse élève supporté ;
- layout outil en mode `stretch`.

Réglages principaux :
- boites à jetons : nombre de boites, nombre minimal de solutions à trouver, bornes des valeurs de jetons, borne du nombre cible ;
- calculs ciblés : 4 ou 5 nombres, limite maximale du nombre cible ;
- défi des 6 nombres : limite maximale du nombre cible, nombres spéciaux autorisés, division exacte optionnelle.

## 5.3. `Monnaie`

L’outil couvre actuellement :
- lire une somme ;
- composer une somme ;
- comparer des sommes.

Options prévues mais désactivées dans l’UI actuelle :
- acheter des objets ;
- trouver plusieurs façons ;
- rendre la monnaie.

État réel :
- outil moderne sous `tools/monnaie/` ;
- assets locaux pour les pièces et billets dans `tools/monnaie/assets/` ;
- modes pédagogiques `individual` et `group` supportés ;
- projection possible comme contexte d’exécution, en respectant `response_ui` ;
- validation shell supportée ;
- toggle correction / réponse élève supporté ;
- layout outil en mode `stretch`.

Réglages principaux :
- choix des pièces et billets autorisés ;
- format d’affichage `12,06 €` ou `12 € 06 c` ;
- bornes des sommes ;
- pour `Composer une somme` : option “utiliser le minimum de pièces et billets” ;
- pour `Comparer des sommes` : question “plus”, “moins” ou “les deux”, et 2 à 4 éléments à comparer.

## 5.4. `Opérations à trous`

L’outil couvre :
- additions à trous ;
- soustractions à trous ;
- multiplications à trous.

État réel :
- outil moderne sous `tools/operations-trous/` ;
- modes pédagogiques `individual` et `group` supportés ;
- projection possible comme contexte d’exécution, en respectant `response_ui` ;
- validation shell supportée ;
- toggle correction / réponse élève supporté.

Réglages principaux :
- génération aléatoire ou liste fixe ;
- position du trou : premier terme, second terme ou les deux ;
- retenues pour additions et soustractions ;
- règle commune ou règles spécifiques pour les termes ;
- contrainte de résultat.

## 5.5. `Représentation décimale`

L’outil couvre :
- `Représentation → Nombre` ;
- `Nombre → Représentation`.

Thèmes actifs :
- Picbille ;
- Dédé ;
- petits carrés bleus base 10 ;
- tuiles textuelles.

État réel :
- rendu SVG dynamique ;
- panel blanc fixe ;
- panneau d’assets ;
- bouton `Organiser` ;
- fusions automatiques ;
- correction différentielle ;
- validation shell ;
- toggle correction / réponse élève.

## 5.6. `Ordre alphabétique`

L’outil couvre :
- tri de lettres ;
- tri de mots ;
- drag-and-drop ;
- réponses boxed/free selon le mode.

État réel :
- outil modernisé sous `tools/` ;
- banque de mots enseignant ;
- consigne personnalisée supportée ;
- validation shell supportée.

## 5.7. `Encodage`

L’outil couvre :
- encodage phonographique ;
- bibliothèque de graphèmes ;
- mode `libre` ;
- mode `cases` ;
- presets enseignant ;
- projection comme contexte d’exécution.

État réel :
- outil modernisé sous `tools/` ;
- dépendances enseignant chargées dynamiquement dans la config ;
- correction colorée pendant l’interaction ;
- réponse canonique en phase answer ;
- validation shell ;
- toggle correction / réponse élève.

Particularité projection :
- la projection reste un contexte d’exécution, pas un mode d’activité ;
- si le mode de réponse de l’outil est `libre`, l’exécution projetée utilise une UI `free` ;
- sinon, l’exécution projetée utilise une UI `boxed`.

## 5.8. `Nombres en lettres`

L’outil couvre :
- `nombre → écriture` ;
- `écriture → nombre` ;
- `mixte` ;
- plage MVP `0–999` ;
- rendu Seyès dynamique ;
- police BelleAllureGS ;
- correction stricte.

État réel :
- plus d’assets de mots ;
- génération dynamique du texte ;
- vraie réponse élève en individuel et en projection d’une activité individuelle (`boxed`) ;
- toggle shell pour revoir la réponse élève.

## 5.9. `Repérage numérique`

L’outil couvre :
- lecture d’un nombre sur repère ;
- placement d’un nombre sur repère ;
- frise Picbille ;
- droite simple ;
- droite complète.

État réel :
- types de questions `numberToGraduation` et `graduationToNumber` ;
- réglages de type de ligne, positions des repères, valeurs des repères, écart entre repères ;
- réglage spécifique du nombre de boites pour la frise Picbille ;
- validation shell ;
- toggle correction / réponse élève.

## 5.10. `Question/Réponse`

L’outil couvre :
- questions à réponse textuelle courte issues d’une banque `text_answer` ;
- réponse principale ;
- réponses acceptées ;
- explication.

État réel :
- outil branché sur les banques de contenus ;
- tirage dans l’ordre ou aléatoire ;
- validation shell ;
- toggle correction / réponse élève.

## 5.11. `QCM`

L’outil couvre :
- questions à choix unique issues d’une banque `qcm` ;
- réponse correcte ;
- distracteurs ;
- explication.

État réel :
- outil branché sur les banques de contenus ;
- tirage dans l’ordre ou aléatoire ;
- mélange optionnel des choix ;
- nombre maximal de choix configurable, de 2 à 6 ;
- validation shell.

Remarque :
- dans le dépôt courant, le QCM ne déclare pas les hooks de toggle correction / réponse élève, contrairement à plusieurs autres outils.

## 5.12. `Sélection`

L’outil couvre :
- sélection de mots dans un énoncé issu d’une banque `selection` ;
- stockage des mots attendus par indices de tokens ;
- affichage continu de la sélection et de la correction.

État réel :
- outil branché sur les banques de contenus ;
- tirage dans l’ordre ou aléatoire ;
- validation shell ;
- toggle correction / réponse élève.

---

## 6) Session élève : état réel du shell

Le shell `#/session` a maintenant un rôle central.

### Géométrie logique

La session est pensée comme une scène logique shrinkée de :
- `1920 × 1080`.

La structure de référence est :
- bande haute : `70 px` ;
- bande centrale : `930 px` ;
- bande basse : `80 px`.

Dans la bande centrale :
- réserve gauche : `150 px` ;
- zone outil : `1620 px` ;
- réserve droite : `150 px`.

Donc la zone utile de référence des outils dans `#/session` est :
- **`1620 × 930`**.

### Répartition du shell

En haut :
- retour ;
- pause ;
- timer.

En bas :
- commandes globales de séance ;
- commandes de projection ;
- bouton `Valider` quand le shell pilote la validation ;
- toggle `Voir ma réponse / Voir la correction` quand l’outil le supporte ;
- pill de compte à rebours de l’outil courant quand sa durée maximale est finie.

La pill de durée maximale est placée en bas à droite. Elle affiche seulement le temps restant au format `MM:SS`, reste masquée quand l’outil n’a pas de limite de temps et pulse à `00:00`.

### Overlays

Les overlays de pause / transition / messages sont dans la scène shrinkée et recouvrent visuellement la scène.

### Jauge / compteur d’évaluation

La réserve droite accueille l’affichage d’évaluation quand `response_ui = boxed` et `progress_mode = evaluated` :
- `Nombre fixe` → jauge segmentée ;
- `Illimitées` → compteur `Questions posées` / `Réponses correctes` ;
- `Objectif de réussite` → jauge continue avec paliers.

En `individual`, le joueur est l’élève. En `group + boxed + evaluated`, le joueur est le groupe / collectif.

---

## 7) Banques de contenus

Le dashboard possède un onglet **Banques**.

Types actifs :
- `text_answer` → outil `question-reponse` ;
- `qcm` → outil `qcm` ;
- `selection` → outil `selection`.

Le front enseignant sait :
- lister les banques personnelles et système ;
- créer une banque ;
- modifier ses métadonnées ;
- supprimer une banque personnelle ;
- lister ses items ;
- remplacer les items ;
- copier une banque système ou source vers l’espace enseignant.

Le runtime élève lit les items de banque via une RPC publique contrôlée par code d’accès.

---

## 8) Philosophie de travail retenue

La ligne directrice reste :
- ne pas casser le runtime existant ;
- ne pas refactorer tout le projet pour le plaisir ;
- concentrer les changements dans les outils réellement actifs ;
- garder l’UI/UX validée quand elle est bonne ;
- faire évoluer le coeur métier par étapes.

En pratique, cela signifie aujourd’hui :
- consolider les outils actifs plutôt que rouvrir une ancienne architecture runtime ;
- stabiliser le shell `#/session` avant de multiplier les raffinements visuels ;
- homogénéiser la validation shell et le toggle correction/réponse ;
- fiabiliser les outils de banques (`question-reponse`, `qcm`, `selection`) au même niveau que les outils déjà stabilisés ;
- continuer l’ajout des nouveaux outils uniquement dans `tools/`.

---

## 9) Priorité de travail actuelle

La priorité concrète est maintenant :
1. stabiliser le shell de `#/session` ;
2. homogénéiser les outils vis-à-vis de la validation shell et du toggle correction/réponse ;
3. consolider les nouveaux outils mathématiques (`nombre-cible`, `monnaie`, `operations-trous`) ;
4. fiabiliser l’onglet **Banques** et les trois outils qui en dépendent ;
5. faire les réglages fins d’UI des outils actifs ;
6. seulement ensuite poursuivre l’assainissement global du vocabulaire hérité.
---

## Aide contextuelle

Une aide contextuelle commune est prévue pour accompagner les réglages de l’interface enseignant.

Le bouton `?` principal du tableau de bord reste toujours visible et ouvre une popup dédiée. Cette popup contient :
- un bouton `Tutoriel`, conservé comme entrée future ;
- un master switch **Icônes d’aide** permettant d’afficher ou masquer les petits boutons `?` contextuels.

Les contenus d’aide généraux sont centralisés dans `shared/help-content.js`. Les aides propres aux outils pourront être ajoutées dans des fichiers `tools/<tool-id>/help.js`.
