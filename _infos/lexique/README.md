# Banque lexicale

## Principe

La banque lexicale est le futur référentiel commun des outils utilisant des mots. Sa source humaine courante est `banque-lexicale-v6.xlsx`.

À ce stade :

- elle contient 3 210 entrées ;
- elle utilise uniquement les niveaux lexicaux **1, 2 et 3** ;
- la table Supabase définitive est `public.lexical_entries` ;
- `Ressources > Ressources système > Mots` permet son import, son export et son administration ;
- les entrées actives sont lisibles par les clients anonymes et authentifiés ;
- **aucun outil élève n'est encore rebranché sur cette table dans le patch 1**.

La migration de création est `_infos/sql/46_lexical_entries.sql`. Elle supprime l'ancienne table provisoire `lexical_entries_v1` : aucune couche legacy n'est conservée.

## Format humain

Une ligne = une entrée lexicale.

Colonnes :

1. `entrée`
2. `catégorie`
3. `niveau_lexical`
4. `phono`
5. `syllabes`
6. `introducteurs`
7. `masc_sing`
8. `fem_sing`
9. `masc_plur`
10. `fem_plur`

`niveau_lexical` doit être strictement égal à `1`, `2` ou `3`.

Les valeurs multiples dans `phono`, `syllabes` et `introducteurs` sont séparées par `;`.

Une variante grammaticale peut être déclarée même si elle n'a pas encore sa propre ligne dans la banque. Cela permet d'enrichir le corpus progressivement.

## Import dans Supabase

Après exécution de la migration 46 :

1. ouvrir `Ressources > Ressources système > Mots` ;
2. utiliser `Importer XLSX` ;
3. sélectionner `banque-lexicale-v6.xlsx`.

Sur une table nouvellement créée, l'import de la V6 doit produire **3 210 entrées**.

L'import est actuellement un merge par `entry_key` : les entrées présentes sont ajoutées ou mises à jour. Les mots absents du classeur ne sont pas supprimés automatiquement.

Le format XLSX attendu reste strictement :

`entrée | catégorie | niveau_lexical | phono | syllabes | introducteurs | masc_sing | fem_sing | masc_plur | fem_plur`

Les listes dans une cellule (`phono`, `syllabes`, `introducteurs`) sont stockées comme tableaux `text[]` dans Supabase.

## Étape suivante

Le patch suivant créera l'adaptateur de lecture commun des outils et remplacera progressivement l'ancienne banque phonologique. Les outils ne doivent pas lire directement le fichier XLSX.

## Nettoyage des anciennes banques

Après la bascule des outils, `_infos/sql/47_remove_legacy_lexical_banks.sql` supprime définitivement `phonology_words` et `vocabulary_default_words`. La seule banque lexicale système runtime est alors `lexical_entries`.
