'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      // Ajouter colonne montantPaye pour tracker les paiements partiels
      await queryInterface.addColumn(
        'paiements',
        'montantPaye',
        {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          defaultValue: 0,
          comment: 'Montant réellement payé (peut être partiel)',
        },
        { transaction }
      );

      // Ajouter colonne pour les tentatives échouées
      await queryInterface.addColumn(
        'paiements',
        'tentatives',
        {
          type: Sequelize.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: 'Nombre de tentatives de paiement',
        },
        { transaction }
      );

      // Ajouter colonne pour le code erreur du fournisseur
      await queryInterface.addColumn(
        'paiements',
        'codeErreur',
        {
          type: Sequelize.STRING(50),
          allowNull: true,
          comment: 'Code erreur retourné par le fournisseur',
        },
        { transaction }
      );

      // Ajouter colonne pour tracer les tentatives de remboursement
      await queryInterface.addColumn(
        'paiements',
        'montantRemboursePaye',
        {
          type: Sequelize.DECIMAL(10, 2),
          allowNull: true,
          defaultValue: 0,
          comment: 'Montant remboursé réellement',
        },
        { transaction }
      );

      // Index pour les recherches de paiements partiels
      await queryInterface.addIndex('paiements', ['statut', 'montant', 'montantPaye'], {
        name: 'idx_paiements_montants',
        transaction,
      });
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (transaction) => {
      await queryInterface.removeIndex('paiements', 'idx_paiements_montants', { transaction });
      await queryInterface.removeColumn('paiements', 'montantRemboursePaye', { transaction });
      await queryInterface.removeColumn('paiements', 'codeErreur', { transaction });
      await queryInterface.removeColumn('paiements', 'tentatives', { transaction });
      await queryInterface.removeColumn('paiements', 'montantPaye', { transaction });
    });
  },
};
