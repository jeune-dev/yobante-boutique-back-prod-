'use strict';

/**
 * Tables des fonctionnalités mobiles jusque-là sans backend :
 * signalements (produit / boutique), abonnements vendeur et leurs paiements.
 */
async function creerTableSiAbsente(queryInterface, nom, definition, indexes = []) {
  const tables = await queryInterface.showAllTables();
  if (tables.includes(nom)) return;
  await queryInterface.createTable(nom, definition);
  for (const champs of indexes) await queryInterface.addIndex(nom, champs);
}

module.exports = {
  async up(queryInterface, Sequelize) {
    const horodatage = {
      createdAt: { type: Sequelize.DATE, allowNull: false },
      updatedAt: { type: Sequelize.DATE, allowNull: false },
    };
    const id = { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true };

    await creerTableSiAbsente(
      queryInterface,
      'signalements',
      {
        id,
        userId: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        type: { type: Sequelize.ENUM('produit', 'boutique'), allowNull: false },
        cibleId: { type: Sequelize.UUID, allowNull: false },
        raison: { type: Sequelize.STRING(200), allowNull: false },
        description: { type: Sequelize.TEXT, allowNull: true },
        statut: {
          type: Sequelize.ENUM('en_attente', 'traite', 'rejete'),
          allowNull: false,
          defaultValue: 'en_attente',
        },
        reponseAdmin: { type: Sequelize.TEXT, allowNull: true },
        ...horodatage,
      },
      [['userId'], ['statut'], ['type', 'cibleId']]
    );

    await creerTableSiAbsente(
      queryInterface,
      'abonnements',
      {
        id,
        vendeurId: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        type: { type: Sequelize.STRING(30), allowNull: false, defaultValue: 'mensuel' },
        montant: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        dateDebut: { type: Sequelize.DATE, allowNull: false },
        dateFin: { type: Sequelize.DATE, allowNull: false },
        statut: {
          type: Sequelize.ENUM('actif', 'expire', 'annule'),
          allowNull: false,
          defaultValue: 'actif',
        },
        ...horodatage,
      },
      [['vendeurId']]
    );

    await creerTableSiAbsente(
      queryInterface,
      'paiements_abonnement',
      {
        id,
        vendeurId: {
          type: Sequelize.UUID,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onDelete: 'CASCADE',
        },
        abonnementId: {
          type: Sequelize.UUID,
          allowNull: true,
          references: { model: 'abonnements', key: 'id' },
          onDelete: 'SET NULL',
        },
        montant: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
        methode: { type: Sequelize.ENUM('wave', 'orange_money'), allowNull: false },
        numeroTelephone: { type: Sequelize.STRING(30), allowNull: true },
        statut: {
          type: Sequelize.ENUM('en_attente', 'succes', 'echoue'),
          allowNull: false,
          defaultValue: 'en_attente',
        },
        transactionId: { type: Sequelize.STRING(100), allowNull: true, unique: true },
        fournisseur: { type: Sequelize.STRING(50), allowNull: true },
        urlPaiement: { type: Sequelize.TEXT, allowNull: true },
        derniereErreur: { type: Sequelize.TEXT, allowNull: true },
        payeAt: { type: Sequelize.DATE, allowNull: true },
        ...horodatage,
      },
      [['vendeurId'], ['statut']]
    );
  },

  async down(queryInterface) {
    await queryInterface.dropTable('paiements_abonnement');
    await queryInterface.dropTable('abonnements');
    await queryInterface.dropTable('signalements');
    for (const type of [
      'enum_signalements_type',
      'enum_signalements_statut',
      'enum_abonnements_statut',
      'enum_paiements_abonnement_methode',
      'enum_paiements_abonnement_statut',
    ]) {
      await queryInterface.sequelize.query(`DROP TYPE IF EXISTS "${type}"`);
    }
  },
};
