'use strict';

/**
 * La catégorie disparaît du formulaire produit : le classement du catalogue se
 * fait désormais uniquement par rayon puis sous-rayon.
 *
 * La colonne `categorieId` est conservée (l'historique et la navigation client
 * par catégorie s'appuient encore dessus) mais devient facultative, sans quoi
 * toute création de produit échouerait sur la contrainte NOT NULL.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('produits', 'categorieId', {
      type: Sequelize.UUID,
      allowNull: true,
    });
  },

  async down(queryInterface, Sequelize) {
    // Retour arrière : impossible de réimposer NOT NULL tant que des produits
    // créés après cette migration n'ont pas de catégorie. On les rattache à la
    // première catégorie existante, faute de quoi le ALTER échouerait.
    await queryInterface.sequelize.query(`
      UPDATE "produits"
         SET "categorieId" = (SELECT "id" FROM "categories" ORDER BY "createdAt" ASC LIMIT 1)
       WHERE "categorieId" IS NULL
    `);

    await queryInterface.changeColumn('produits', 'categorieId', {
      type: Sequelize.UUID,
      allowNull: false,
    });
  },
};
