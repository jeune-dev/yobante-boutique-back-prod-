'use strict';

/**
 * Date de livraison souhaitée par le client, saisie au checkout de
 * l'application mobile (le backend l'ignorait jusqu'ici).
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const description = await queryInterface.describeTable('commandes');
    if (!description.dateLivraisonSouhaitee) {
      await queryInterface.addColumn('commandes', 'dateLivraisonSouhaitee', {
        type: Sequelize.DATEONLY,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('commandes', 'dateLivraisonSouhaitee');
  },
};
