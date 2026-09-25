'use strict';

/**
 * Ajoute au produit `prixAchat` : prix d'achat réservé à l'administration,
 * jamais exposé au client.
 *
 * La colonne avait été ajoutée au modèle sans migration : en prod, la liste
 * admin des produits (qui sélectionne toutes les colonnes du modèle) échouait
 * en 500 sur « column Produit.prixAchat does not exist », alors que le
 * catalogue client, qui exclut ce champ, fonctionnait.
 */
async function ajouterColonneSiAbsente(queryInterface, table, colonne, definition) {
  const description = await queryInterface.describeTable(table);
  if (!description[colonne]) await queryInterface.addColumn(table, colonne, definition);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    await ajouterColonneSiAbsente(queryInterface, 'produits', 'prixAchat', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('produits', 'prixAchat');
  },
};
