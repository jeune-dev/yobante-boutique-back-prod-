'use strict';

/**
 * Réponse publique du vendeur à un avis (fonctionnalité « Avis reçus » de
 * l'application mobile).
 */
async function ajouterColonneSiAbsente(queryInterface, table, colonne, definition) {
  const description = await queryInterface.describeTable(table);
  if (!description[colonne]) await queryInterface.addColumn(table, colonne, definition);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await ajouterColonneSiAbsente(queryInterface, 'avis', 'reponseVendeur', {
      type: Sequelize.TEXT,
      allowNull: true,
    });
    await ajouterColonneSiAbsente(queryInterface, 'avis', 'reponduAt', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('avis', 'reponseVendeur');
    await queryInterface.removeColumn('avis', 'reponduAt');
  },
};
