'use strict';

/**
 * Accès d'un administrateur, page par page.
 * null = accès complet : les administrateurs existants gardent tout.
 * Idempotente : la colonne n'est ajoutée que si elle manque.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    const colonnes = await queryInterface.describeTable('users');
    if (!colonnes.permissions) {
      await queryInterface.addColumn('users', 'permissions', {
        type: Sequelize.JSONB,
        allowNull: true,
      });
    }
  },

  async down(queryInterface) {
    const colonnes = await queryInterface.describeTable('users');
    if (colonnes.permissions) await queryInterface.removeColumn('users', 'permissions');
  },
};
