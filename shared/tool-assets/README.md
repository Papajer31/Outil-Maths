# Assets système des outils

Ce dossier contient les ressources système partagées par les outils, notamment pour les futurs QCM multimédias.

Structure retenue :

```text
shared/tool-assets/
├─ manifest.json
├─ tool-assets.js
├─ images/
│  └─ ...
└─ audio/
   └─ ...
```

## Images

Les images doivent être déposées dans :

```text
shared/tool-assets/images/...
```

Exemples :

```text
shared/tool-assets/images/imagier-cp/animaux/chat.webp
shared/tool-assets/images/imagier-cp/objets/ballon.webp
shared/tool-assets/images/maths/collections/3-pommes.webp
```

Conventions recommandées :

- utiliser de préférence le format `.webp` ;
- utiliser des noms simples en minuscules ;
- séparer les mots par des tirets ;
- éviter les espaces dans les noms de fichiers ;
- organiser les images par dossiers pédagogiques.

Le navigateur ne peut pas explorer automatiquement un dossier. L'interface lit donc `manifest.json` pour afficher la bibliothèque.

## Manifest

Le manifest référence les assets disponibles. Exemple :

```json
{
  "id": "imagier-cp-animaux-chat",
  "type": "image",
  "src": "images/imagier-cp/animaux/chat.webp",
  "label": "chat",
  "alt": "chat",
  "category": "imagier-cp / animaux",
  "tags": ["imagier-cp", "animaux"]
}
```

Pour le moment, le manifest peut rester minimal. Les champs vraiment importants sont :

- `id`
- `type`
- `src`
- `label`
- `alt`

Les autres champs servent à faciliter la recherche dans l'interface.
