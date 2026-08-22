'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('messages', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      expediteurId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      destinataireId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      contenu: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      lu: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
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

    await queryInterface.addIndex('messages', ['expediteurId'], {
      name: 'idx_messages_expediteur',
    });
    await queryInterface.addIndex('messages', ['destinataireId'], {
      name: 'idx_messages_destinataire',
    });
    await queryInterface.addIndex('messages', ['destinataireId', 'lu'], {
      name: 'idx_messages_destinataire_lu',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('messages');
  },
};
