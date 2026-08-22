'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.addColumn(
        'profils_vendeurs',
        'latitude',
        {
          type: Sequelize.DECIMAL(10, 7),
          allowNull: true,
          comment: 'Latitude de la boutique, pour la recherche "boutiques proches"',
        },
        { transaction }
      );
      await queryInterface.addColumn(
        'profils_vendeurs',
        'longitude',
        {
          type: Sequelize.DECIMAL(10, 7),
          allowNull: true,
          comment: 'Longitude de la boutique, pour la recherche "boutiques proches"',
        },
        { transaction }
      );
      await queryInterface.addIndex('profils_vendeurs', ['latitude', 'longitude'], {
        name: 'idx_profils_vendeurs_geoloc',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex('profils_vendeurs', 'idx_profils_vendeurs_geoloc', {
        transaction,
      });
      await queryInterface.removeColumn('profils_vendeurs', 'longitude', { transaction });
      await queryInterface.removeColumn('profils_vendeurs', 'latitude', { transaction });
    });
  },
};
