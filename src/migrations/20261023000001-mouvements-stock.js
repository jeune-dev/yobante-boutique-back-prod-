'use strict';

/**
 * Journal des mouvements de stock (table `mouvements_stock`).
 *
 * Nouvelle table : aucune migration déjà appliquée n'est modifiée. Aucune
 * table d'historique de stock n'existait jusqu'ici — les retours ont la leur
 * (`retours`), qui décrit la demande du client, pas le mouvement de quantité.
 *
 * Idempotente : la table peut déjà exister sur une base alignée par
 * `utils/schemaReconciliation.js`, qui crée les tables manquantes au
 * démarrage à partir des modèles.
 *
 * Les index couvrent les filtres de l'historique côté admin (produit +
 * période, type, origine, utilisateur, commande, retour, client) et portent
 * l'unicité de la clé d'idempotence.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    if (tables.includes('mouvements_stock')) return;

    await queryInterface.createTable('mouvements_stock', {
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
      // L'historique survit à la suppression des comptes, des commandes et
      // des retours : SET NULL partout, sinon la trace partirait avec eux.
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
      retourId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'retours', key: 'id' },
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
    });

    await queryInterface.addIndex('mouvements_stock', ['produitId', 'createdAt']);
    await queryInterface.addIndex('mouvements_stock', ['auteurId']);
    await queryInterface.addIndex('mouvements_stock', ['type']);
    await queryInterface.addIndex('mouvements_stock', ['source']);
    await queryInterface.addIndex('mouvements_stock', ['commandeId']);
    await queryInterface.addIndex('mouvements_stock', ['retourId']);
    await queryInterface.addIndex('mouvements_stock', ['clientId']);
    await queryInterface.addIndex('mouvements_stock', ['cleIdempotence'], { unique: true });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('mouvements_stock');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_mouvements_stock_type"');
  },
};
