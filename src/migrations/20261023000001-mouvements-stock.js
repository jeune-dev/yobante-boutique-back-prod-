'use strict';

/**
 * Journal des mouvements de stock (table `mouvements_stock`).
 *
 * Nouvelle migration : aucune migration déjà appliquée n'est modifiée.
 * La création est idempotente — la table peut déjà exister sur une base
 * alignée par `utils/schemaReconciliation.js`.
 *
 * Les index couvrent les filtres de l'historique côté admin (produit +
 * période, type, utilisateur, commande, client) et portent l'unicité de la
 * clé d'idempotence.
 */
async function creerTableSiAbsente(queryInterface, nom, definition, indexes = []) {
  const tables = await queryInterface.showAllTables();
  if (tables.includes(nom)) return;
  await queryInterface.createTable(nom, definition);
  for (const index of indexes) {
    const { fields, ...options } = index;
    await queryInterface.addIndex(nom, fields, options);
  }
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await creerTableSiAbsente(
      queryInterface,
      'mouvements_stock',
      {
        id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
        produitId: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'produits', key: 'id' },
          onDelete: 'CASCADE',
        },
        type: {
          type: Sequelize.ENUM(
            'entree',
            'sortie',
            'ajustement_positif',
            'ajustement_negatif',
            'ajustement_neutre',
            'retour'
          ),
          allowNull: false,
        },
        source: { type: Sequelize.STRING(40), allowNull: false },
        ancienneQuantite: { type: Sequelize.INTEGER, allowNull: false },
        nouvelleQuantite: { type: Sequelize.INTEGER, allowNull: false },
        difference: { type: Sequelize.INTEGER, allowNull: false },
        motif: { type: Sequelize.STRING(255), allowNull: true },
        commentaire: { type: Sequelize.TEXT, allowNull: true },
        // L'historique survit à la suppression des comptes et des commandes :
        // SET NULL partout, sinon la trace disparaîtrait avec eux.
        auteurId: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },
        commandeId: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'commandes', key: 'id' },
          onDelete: 'SET NULL',
        },
        clientId: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'users', key: 'id' },
          onDelete: 'SET NULL',
        },
        cleIdempotence: { type: Sequelize.STRING(150), allowNull: true },
        createdAt: { type: Sequelize.DATE, allowNull: false },
        updatedAt: { type: Sequelize.DATE, allowNull: false },
      },
      [
        { fields: ['produitId', 'createdAt'] },
        { fields: ['auteurId'] },
        { fields: ['type'] },
        { fields: ['commandeId'] },
        { fields: ['clientId'] },
        { fields: ['cleIdempotence'], unique: true },
      ]
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mouvements_stock');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_mouvements_stock_type"');
  },
};
