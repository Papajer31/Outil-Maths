# SQL historiques

Ces fichiers sont des traces d’évolution du modèle Supabase.

Ils ne constituent pas une migration propre et ne doivent pas être rejoués sans audit préalable.

Règle de patch : ne modifier ces fichiers que sur demande explicite.

## Migration actuelle

Pour ajouter la consigne globale aux banques existantes, exécuter une fois :

```text
06_question_bank_instruction.sql
```

## Ajout Quiz + Ressources

Pour créer la persistance Supabase des Quiz, des dossiers de ressources et le bucket privé associé, exécuter une fois :

```text
07_quizzes_resources.sql
```

Ce script est additif et ne modifie pas les tables des anciennes banques.

