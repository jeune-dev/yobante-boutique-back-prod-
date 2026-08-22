'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('demandes_suppression_compte', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      email: {
        type: Sequelize.STRING,
        allowNull: false,
      },
      objet: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      statut: {
        type: Sequelize.ENUM('en_attente', 'traitee'),
        allowNull: false,
        defaultValue: 'en_attente',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });

    await queryInterface.addIndex('demandes_suppression_compte', ['email'], {
      name: 'idx_demandes_suppression_compte_email',
    });
    await queryInterface.addIndex('demandes_suppression_compte', ['statut'], {
      name: 'idx_demandes_suppression_compte_statut',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('demandes_suppression_compte');
  },
};
