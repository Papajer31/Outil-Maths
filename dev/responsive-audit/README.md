# Audit responsive local

Ce dossier ajoute un outil de développement pour tester automatiquement le runtime élève sur les profils viewport officiels.

Il ne modifie pas le site élève, les outils, les moteurs drag, les moteurs de tracé, ni les CSS de production.

## Ce que fait l'audit

Le script :

1. lance un petit serveur local sur le projet ;
2. ouvre Chromium avec Playwright ;
3. charge chaque outil en mode `catalogTest` ;
4. teste les 6 profils officiels du runtime ;
5. prend une capture d'écran par outil et par profil ;
6. mesure les débordements DOM : scroll global, éléments hors viewport, éléments rognés ;
7. génère un rapport `HTML`, `JSON` et `CSV`.

## Lancement simple sous Windows

Depuis l'explorateur Windows :

1. ouvrir le dossier `dev/responsive-audit` ;
2. double-cliquer sur `audit-responsive.cmd` ;
3. attendre la fin de l'audit ;
4. zipper le dossier `responsive-audit-output` créé à la racine du projet ;
5. renvoyer ce zip dans ChatGPT.

Le premier lancement peut être plus long car il installe Playwright et Chromium.

## Lancement en ligne de commande

Depuis `dev/responsive-audit` :

```bash
npm install
npx playwright install chromium
npm run audit
```

## Lancer seulement un outil

```bash
npm run audit -- --tools=addition
```

## Lancer seulement un profil

```bash
npm run audit -- --profiles=compact-1366x768
```

## Lancer un outil et un profil

```bash
npm run audit -- --tools=addition --profiles=compact-1366x768
```

## Voir le navigateur pendant l'audit

```bash
npm run audit:headed
```

ou :

```bash
npm run audit -- --headed
```

## Fichiers générés

À la racine du projet :

```text
responsive-audit-output/
  report.html
  report.json
  cases.csv
  screenshots/
  README.txt
```

Le fichier le plus important pour ChatGPT est `report.json`, mais les captures dans `screenshots/` sont indispensables pour vérifier visuellement les cas douteux.

## Configuration

La configuration est dans :

```text
responsive-audit.config.json
```

Paramètres utiles :

- `profiles`: `official` ou une liste d'identifiants de profils ;
- `tools`: `all` ou une liste d'identifiants d'outils ;
- `headless`: `true` ou `false` ;
- `screenshot`: `true` ou `false` ;
- `waitMsAfterLoad`: attente après le chargement de chaque outil ;
- `timeoutMs`: délai maximal de chargement par cas.

## Limites connues

Cet audit détecte les problèmes visuels probables, mais ne remplace pas complètement un test humain :

- confort de lecture ;
- confort tactile ;
- qualité pédagogique de l'espace ;
- exactitude fine des gestes drag/tracé.

Il sert à réduire fortement la liste des vérifications manuelles.
