const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Paiement d'un abonnement vendeur (mobile money). Distinct de `Paiement`,
// qui est rattaché à une commande client.
const PaiementAbonnement = sequelize.define(
  'PaiementAbonnement',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    vendeurId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    abonnementId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Période d'abonnement créée ou prolongée par ce paiement (renseigné au succès)",
    },
    montant: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    methode: {
      type: DataTypes.ENUM('wave', 'orange_money'),
      allowNull: false,
    },
    numeroTelephone: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    statut: {
      type: DataTypes.ENUM('en_attente', 'succes', 'echoue'),
      allowNull: false,
      defaultValue: 'en_attente',
    },
    transactionId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      unique: true,
    },
    fournisseur: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    urlPaiement: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    derniereErreur: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    payeAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: 'paiements_abonnement',
    indexes: [{ fields: ['vendeurId'] }, { fields: ['statut'] }],
  }
);

module.exports = PaiementAbonnement;
