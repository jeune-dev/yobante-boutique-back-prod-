const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Avis = sequelize.define(
  'Avis',
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
    produitId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    note: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: 1,
        max: 5,
      },
    },
    commentaire: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Réponse publique du vendeur du produit (facultative).
    reponseVendeur: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    reponduAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: true,
    tableName: 'avis',
    indexes: [
      { fields: ['userId'] },
      { fields: ['produitId'] },
      { fields: ['isApproved'] },
      { unique: true, fields: ['userId', 'produitId'] },
    ],
  }
);

module.exports = Avis;
