'use strict';

/**
 * Ordre d'affichage des rayons et sous-rayons.
 *
 * Ils étaient triés par nom : impossible de placer « Promotions » en tête ou de
 * suivre l'ordre du catalogue. `ordre` est réglé par l'administration ; à
 * égalité, le nom départage.
 *
 * Idempotente : chaque colonne n'est ajoutée que si elle manque.
 */
module.exports = {
  async up(queryInterface, Sequelize) {
    for (const table of ['rayons', 'sous_rayons']) {
      const colonnes = await queryInterface.describeTable(table);
      if (!colonnes.ordre) {
        await queryInterface.addColumn(table, 'ordre', {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
        });
      }
    }
  },

  async down(queryInterface) {
    for (const table of ['rayons', 'sous_rayons']) {
      const colonnes = await queryInterface.describeTable(table);
      if (colonnes.ordre) await queryInterface.removeColumn(table, 'ordre');
    }
  },
};
