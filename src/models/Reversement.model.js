const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Versement effectué à un vendeur marketplace.
 *
 * Aucun solde n'est stocké : le montant encore dû se recalcule depuis les
 * ventes livrées moins la commission moins les reversements déjà payés. Un
 * solde enregistré finirait par diverger du réel au premier retour, à la
 * première annulation ou au premier changement de taux.
 */
const Reversement = sequelize.define(
  'Reversement',
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
    reference: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    montant: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: { min: 0 },
    },
    statut: {
      type: DataTypes.ENUM('en_attente', 'paye', 'annule'),
      allowNull: false,
      defaultValue: 'en_attente',
    },
    methode: {
      type: DataTypes.ENUM('wave', 'orange_money', 'virement', 'especes', 'autre'),
      allowNull: true,
    },
    periodeDebut: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    periodeFin: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    payeLe: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    creePar: {
      type: DataTypes.UUID,
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
    tableName: 'reversements',
    indexes: [
      { fields: ['vendeurId'] },
      { fields: ['statut'] },
      { fields: ['createdAt'] },
      { unique: true, fields: ['reference'] },
    ],
  }
);

module.exports = Reversement;
