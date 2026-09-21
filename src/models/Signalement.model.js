const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Signalement d'un produit ou d'une boutique par un utilisateur de
// l'application mobile. Traité par un administrateur.
const Signalement = sequelize.define(
  'Signalement',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM('produit', 'boutique'),
      allowNull: false,
    },
    cibleId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'Identifiant du produit ou du profil vendeur (boutique) signalé',
    },
    raison: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    statut: {
      type: DataTypes.ENUM('en_attente', 'traite', 'rejete'),
      allowNull: false,
      defaultValue: 'en_attente',
    },
    reponseAdmin: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: 'signalements',
    indexes: [{ fields: ['userId'] }, { fields: ['statut'] }, { fields: ['type', 'cibleId'] }],
  }
);

module.exports = Signalement;
