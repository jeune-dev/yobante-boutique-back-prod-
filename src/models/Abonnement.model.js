const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Abonnement mensuel d'un vendeur à la plateforme. Une ligne par période
// payée ; la période courante est celle dont `dateFin` est la plus tardive.
const Abonnement = sequelize.define(
  'Abonnement',
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
    type: {
      type: DataTypes.STRING(30),
      allowNull: false,
      defaultValue: 'mensuel',
    },
    montant: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    dateDebut: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    dateFin: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    statut: {
      type: DataTypes.ENUM('actif', 'expire', 'annule'),
      allowNull: false,
      defaultValue: 'actif',
    },
  },
  {
    timestamps: true,
    tableName: 'abonnements',
    indexes: [{ fields: ['vendeurId'] }],
  }
);

module.exports = Abonnement;
