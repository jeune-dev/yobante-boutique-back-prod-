/**
 * Réconciliation du schéma (utils/schemaReconciliation.js) — PostgreSQL réel.
 *
 * Reproduit la dérive de la production (colonnes, table, valeur d'ENUM
 * absentes alors que les modèles les déclarent), vérifie que l'analyse la
 * détecte, que la réparation la corrige sans perdre de données, et qu'une
 * seconde exécution ne fait rien.
 *
 *   DB_IT=1 DB_HOST=localhost DB_PORT=55432 DB_USER=postgres DB_PASSWORD=
 *   DB_NAME=yobante_it npx jest tests/integration/schema.reconciliation.db
 */
const actif = process.env.DB_IT === '1';
const decrire = actif ? describe : describe.skip;

jest.setTimeout(120000);

decrire('Réconciliation du schéma — PostgreSQL réel', () => {
  let m, analyserSchema, reconcilierSchema;
  const q = (sql) => m.sequelize.query(sql);

  beforeAll(async () => {
    m = require('../../src/models');
    ({ analyserSchema, reconcilierSchema } = require('../../src/utils/schemaReconciliation'));
    await m.sequelize.sync();
    const tables = Object.values(m.sequelize.models).map((x) => `"${x.getTableName()}"`);
    await q(`TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE`);
  });

  afterAll(async () => {
    if (m) await m.sequelize.close();
  });

  it('base alignée : aucun écart', async () => {
    const e = await analyserSchema(m.sequelize);
    expect(e).toEqual({ tablesManquantes: [], colonnesManquantes: [], valeursEnumManquantes: [] });
  });

  it('détecte puis répare colonnes, table et valeur d’ENUM manquantes, sans perte de données', async () => {
    // Une ligne existante : les colonnes NOT NULL sans défaut doivent rester ajoutables.
    const vendeur = await m.User.create({ nom: 'V', prenom: 'V', email: 'v@yobante-test.sn', password: 'x'.repeat(60), role: 'VENDEUR' });
    await m.Produit.create({ nom: 'Riz', slug: 'riz', prix: 5000, vendeurId: vendeur.id });

    // Dérive de la production.
    await q('ALTER TABLE produits DROP COLUMN "prixAchat", DROP COLUMN "messageVendeur", DROP COLUMN "motifRejet"');
    await q('ALTER TABLE promotions DROP COLUMN "blocPromoId"');
    await q('ALTER TABLE paiements DROP COLUMN "montantPaye"');
    await q('DROP TABLE banniere_produits');
    // Valeur d'ENUM absente : on recrée le type sans « rejetee ».
    await q(`ALTER TABLE commandes ALTER COLUMN statut DROP DEFAULT, ALTER COLUMN statut TYPE text`);
    await q(`DROP TYPE "enum_commandes_statut"`);
    await q(`CREATE TYPE "enum_commandes_statut" AS ENUM ('en_attente','validee','en_preparation','expediee','livree','annulee')`);
    await q(`ALTER TABLE commandes ALTER COLUMN statut TYPE "enum_commandes_statut" USING statut::"enum_commandes_statut", ALTER COLUMN statut SET DEFAULT 'en_attente'`);

    const avant = await analyserSchema(m.sequelize);
    expect(avant.tablesManquantes).toEqual(['banniere_produits']);
    expect(avant.colonnesManquantes.map((c) => `${c.table}.${c.colonne}`).sort()).toEqual(
      ['paiements.montantPaye', 'produits.messageVendeur', 'produits.motifRejet', 'produits.prixAchat', 'promotions.blocPromoId'].sort()
    );
    expect(avant.valeursEnumManquantes.map((v) => v.valeur)).toEqual(['rejetee']);

    // La requête de la page Produits échoue tant que la base n'est pas réparée.
    await expect(m.Produit.findAll()).rejects.toThrow(/does not exist/);

    const ajoutes = await reconcilierSchema(m.sequelize);
    expect(ajoutes.tables).toEqual(['banniere_produits']);
    expect(ajoutes.colonnes).toHaveLength(5);
    expect(ajoutes.valeursEnum).toEqual(['commandes.statut += rejetee']);

    expect(await analyserSchema(m.sequelize)).toEqual({ tablesManquantes: [], colonnesManquantes: [], valeursEnumManquantes: [] });
    // Données conservées, requêtes de nouveau fonctionnelles.
    const produits = await m.Produit.findAll();
    expect(produits.map((p) => p.nom)).toEqual(['Riz']);
    expect(await m.Promotion.findAll()).toEqual([]);
  });

  it('idempotente : une seconde exécution n’ajoute rien', async () => {
    const ajoutes = await reconcilierSchema(m.sequelize);
    expect(ajoutes).toEqual({ tables: [], colonnes: [], valeursEnum: [], avertissements: [] });
  });
});
