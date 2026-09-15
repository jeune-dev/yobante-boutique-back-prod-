# Import des rayons/sous-rayons (rayonnage.xlsx)

Procédure pour intégrer les rayons et sous-rayons du fichier `rayonnage.xlsx`
dans la base PostgreSQL **déjà déployée en production**, via le script
[`import-rayonnage.sql`](import-rayonnage.sql).

## Ce que fait le script

- Insère 24 rayons et 132 sous-rayons dans les tables `rayons` / `sous_rayons`.
- Idempotent : `ON CONFLICT (slug) DO NOTHING` — rejouable sans créer de
  doublons, même si certains rayons existent déjà (ex. `boissons`, `bebe`
  déjà présents via `src/seeders/rayons.data.js`).
- Transactionnel (`BEGIN` / `COMMIT`) — si une ligne échoue, rien n'est
  appliqué.
- Uniquement des `INSERT`, aucun `UPDATE`/`DELETE` : les données existantes
  (produits déjà liés à un rayon, etc.) ne sont pas touchées.
- La ligne « PROMOTIONS » du fichier source a été exclue : ce n'est pas un
  rayon produit mais une section descriptive (compte à rebours des promos).

## Procédure (base hébergée sur Render)

La base est une instance PostgreSQL managée Render. Pas de Docker ni de SSH
serveur ici : tout se fait depuis ta machine, en te connectant à l'URL
externe fournie par Render.

### 0. Récupérer l'URL de connexion externe

Dans le dashboard Render → ta base PostgreSQL → onglet **Info** → copier
la valeur **External Database URL** (commence par `postgres://...`, avec
`?sslmode=require` en général). Elle a la forme :

```
postgres://<user>:<password>@<host>.render.com/<database>
```

⚠️ L'**Internal Database URL** ne fonctionne que depuis un autre service
Render — inutile depuis ta machine, utilise bien l'External.

### 1. Backup de la base avant toute modification

Render fait des backups automatiques (selon le plan), mais avant une
modification manuelle il vaut mieux avoir ton propre point de restauration
immédiat :

```bash
pg_dump "postgres://<user>:<password>@<host>.render.com/<database>?sslmode=require" \
  | gzip > boutique_$(date +%Y%m%d_%H%M%S).sql.gz
```

(nécessite `pg_dump` installé localement — même version majeure que Postgres
sur Render de préférence).

### 2. Exécuter le script d'import

```bash
psql "postgres://<user>:<password>@<host>.render.com/<database>?sslmode=require" \
  -f scripts/import-rayonnage.sql
```

### 3. Vérifier le résultat

```sql
SELECT count(*) FROM rayons;

SELECT r.nom, count(sr.id) AS nb_sous_rayons
FROM rayons r
LEFT JOIN sous_rayons sr ON sr."rayonId" = r.id
GROUP BY r.nom
ORDER BY r.nom;
```

Tu peux lancer ces deux requêtes directement via `psql "<External URL>" -c "..."`,
ou depuis l'onglet **Shell**/**Connect** du dashboard Render s'il propose un
client SQL intégré.

### 4. En cas de problème

Restaurer depuis le backup fait à l'étape 1 :

```bash
gunzip -c boutique_<TIMESTAMP>.sql.gz | psql "postgres://<user>:<password>@<host>.render.com/<database>?sslmode=require"
```

Ou utiliser un backup automatique Render (dashboard → base → **Backups**),
si le plan en conserve.

## Points de vigilance

- Les rayons du fichier Excel utilisent une nomenclature différente de celle
  déjà en base (`src/seeders/rayons.data.js`, 15 rayons type « Bébé,
  Dépannage... »). Comme les slugs sont générés à partir du nom (accents et
  casse ignorés), un rayon de même sens mais nommé différemment créera une
  **entrée séparée** plutôt qu'une fusion (ex. « Boissons » et « Bébé »
  partagent le même slug dans les deux listes donc ne dupliquent pas, mais
  d'autres rayons n'ont pas d'équivalent direct et s'ajouteront tels quels).
- Vérifier après import que la liste de rayons affichée côté application
  (mobile/admin) correspond à ce qui est attendu — un rayon existant peut
  avoir des sous-rayons différents de ceux du fichier Excel si son slug était
  déjà pris.
