# Ressources système des outils

Ce dossier contient les images et sons système partagés par les outils et les Quiz.

L’interface s’appuie sur `manifest.json` ; elle ne parcourt pas directement les sous-dossiers.

- `images/` : images système ;
- `audio/` : sons système ;
- `tool-assets.js` : chargement et résolution ;
- `asset-picker.js` / `.css` : sélecteur visuel partagé.

Le manifest peut être régénéré avec :

```bash
node _dev/generate-tool-assets-manifest.mjs
```
