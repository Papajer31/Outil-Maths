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
- l’ancien monde `modules/` reste présent comme héritage / archive de code consultable, mais il n’est plus l’entrée active des outils modernes et ne doit pas être considéré comme chargeable tel quel.

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
- réponses textuelles ;
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
La projection est une **action de lancement** / un contexte d’exécution :
- une activité `individual` projetée garde une UI de réponse `boxed` ;
- une activité `group` projetée garde une UI libre `free`.

Le contexte technique de projection est porté par le runtime, notamment via `runMode = "projected-teacher"`.

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
- le dossier `modules/` existe encore avec deux anciens modules : `maths` et `production-ecrit` ;
- ces anciens modules sont à considérer comme une archive de code, pas comme une cible chargeable telle quelle, car l’ancienne façade `shared/module-factory.js` n’est plus présente dans le zip courant.

Conclusion :
- le projet est **réellement tools-first dans le flux actif** ;
- la transition historique survit surtout dans le vocabulaire de certaines variables, dans le champ `module_key` en base et dans le dossier legacy `modules/`, qui sert désormais de réserve consultable plutôt que de runtime actif.

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
- l’exposition des réglages de jauge infinie.

### 4.4. Couche commune réellement exposée aujourd’hui

Dans le flux actif actuel, la couche commune gère :
- `questionCount` ;
- `timePerQ` ;
- `answerTime` ;
- leurs variantes infinies ;
- `questionTransitionSec` ;
- `questionTransitionInfinite` ;
- la **consigne personnalisée** ;
- les réglages de **jauge infinie** :
  - `Nombre de paliers` ;
  - `Réponses requises`.

`questionTransitionSec` et `questionTransitionInfinite` sont portés par le draft de chaque item de séquence : chaque outil peut donc définir son propre temps entre deux questions.

La durée totale d’activité reste un réglage global via `activityTotalTimeEnabled` et `activityTotalTimeSec`. Quand elle est activée, l’éditeur traite le dernier outil de la séquence comme un **défi final** : son nombre de questions est forcé à `∞`, afin que la séance puisse occuper la durée globale demandée.

La variante de réponse en projection n’est plus un réglage enseignant global : elle est automatiquement déduite du mode pédagogique de l’activité (`individual` → `boxed`, `group` → `free`).

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
- projection possible comme contexte d’exécution (`individual` → `boxed`, `group` → `free`) ;
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
- projection possible comme contexte d’exécution (`individual` → `boxed`, `group` → `free`) ;
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
- projection possible comme contexte d’exécution (`individual` → `boxed`, `group` → `free`) ;
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
- toggle `Voir ma réponse / Voir la correction` quand l’outil le supporte.

### Overlays

Les overlays de pause / transition / messages sont dans la scène shrinkée et recouvrent visuellement la scène.

### Jauge individuelle

La réserve droite accueille la jauge individuelle :
- seulement en mode individuel ;
- mode infini : progression continue + paliers + fusée ;
- mode fini : segments colorés de bas en haut.

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
- consolider les outils actifs plutôt que rouvrir l’ancien monde `modules/` ;
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
6. seulement ensuite poursuivre l’assainissement global de la transition depuis `modules/`.
