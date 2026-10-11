'use strict';

/**
 * Suppression de compte (client ou vendeur) par l'administration.
 *
 * Le compte n'est pas effacé de la base : ses commandes, paiements et
 * reversements doivent rester pour la comptabilité. Il est anonymisé et
 * fermé, et `supprimeLe` le retire des listes du dashboard.
 *
 * Idempotente : la colonne n'est ajoutée que si elle manque.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const colonnes = await queryInterface.describeTable('users');
    if (!colonnes.supprimeLe) {
      await queryInterface.addColumn('users', 'supprimeLe', {
        type: Sequelize.DATE,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const colonnes = await queryInterface.describeTable('users');
    if (colonnes.supprimeLe) await queryInterface.removeColumn('users', 'supprimeLe');
  },
};
