const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

/**
 * Décision d'un vendeur sur une commande le concernant.
 *
 * Une commande pouvant contenir les produits de plusieurs vendeurs, la
 * décision porte sur le couple (commande, vendeur) et non sur la commande.
 *
 * L'absence de ligne vaut « en attente » : on n'enregistre que les décisions
 * prises, et le volume soumis se déduit des lignes de commande.
 */
const AcceptationCommande = sequelize.define(
  'AcceptationCommande',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    commandeId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    vendeurId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    statut: {
      type: DataTypes.ENUM('acceptee', 'refusee'),
      allowNull: false,
    },
    motifRefus: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    decideLe: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      allowNull: false,
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
    tableName: 'acceptations_commande',
    indexes: [
      { unique: true, fields: ['commandeId', 'vendeurId'] },
      { fields: ['vendeurId', 'statut'] },
    ],
  }
);

module.exports = AcceptationCommande;
