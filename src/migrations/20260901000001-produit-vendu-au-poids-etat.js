'use strict';

/**
 * Ajoute au produit :
 * - `venduAuPoids` : si vrai, le champ `prix` existant est interprété comme
 *   un prix au kg (prix à la pesée) plutôt qu'un prix à l'unité.
 * - `etat` : neuf ou reconditionné.
 */
async function ajouterColonneSiAbsente(queryInterface, table, colonne, definition) {
  const description = await queryInterface.describeTable(table);
  if (!description[colonne]) await queryInterface.addColumn(table, colonne, definition);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await ajouterColonneSiAbsente(queryInterface, 'produits', 'venduAuPoids', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await ajouterColonneSiAbsente(queryInterface, 'produits', 'etat', {
      type: Sequelize.ENUM('neuf', 'reconditionne'),
      allowNull: false,
      defaultValue: 'neuf',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('produits', 'venduAuPoids');
    await queryInterface.removeColumn('produits', 'etat');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_produits_etat"');
  },
};
