'use strict';

/**
 * Rupture de stock d'un produit dans une commande, déclarée par
 * l'administration après le refus d'un vendeur : la ligne reste visible du
 * client avec le motif, mais n'est plus facturée.
 *
 * Idempotente : chaque colonne n'est ajoutée que si elle manque.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const colonnes = await queryInterface.describeTable('commande_items');
    if (!colonnes.enRupture) {
      await queryInterface.addColumn('commande_items', 'enRupture', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
    if (!colonnes.motifRupture) {
      await queryInterface.addColumn('commande_items', 'motifRupture', {
        type: Sequelize.TEXT,
        allowNull: true,
      });
    }
    if (!colonnes.ruptureLe) {
      await queryInterface.addColumn('commande_items', 'ruptureLe', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const colonnes = await queryInterface.describeTable('commande_items');
    for (const c of ['enRupture', 'motifRupture', 'ruptureLe']) {
      if (colonnes[c]) await queryInterface.removeColumn('commande_items', c);
    }
  },
};
