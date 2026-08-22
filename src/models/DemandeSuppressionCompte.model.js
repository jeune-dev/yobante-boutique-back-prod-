const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Demande de suppression de compte soumise via le formulaire public
// admin.yobanterek.com/suppression-compte (exigence Google Play).
// Traitement manuel par un admin — pas de suppression automatique du compte.
const DemandeSuppressionCompte = sequelize.define(
  'DemandeSuppressionCompte',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    objet: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    statut: {
      type: DataTypes.ENUM('en_attente', 'traitee'),
      allowNull: false,
      defaultValue: 'en_attente',
    },
  },
  {
    timestamps: true,
    tableName: 'demandes_suppression_compte',
    indexes: [{ fields: ['email'] }, { fields: ['statut'] }],
  }
);

module.exports = DemandeSuppressionCompte;
