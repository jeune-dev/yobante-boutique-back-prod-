const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const CommandeItem = sequelize.define(
  'CommandeItem',
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
    produitId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    quantite: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    },
    prixUnitaire: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    sousTotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    // Produit déclaré en rupture de stock par l'administration (après refus
    // du vendeur) : la ligne reste visible du client, avec le motif, mais
    // n'est plus facturée ni livrée.
    enRupture: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
    motifRupture: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    ruptureLe: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    timestamps: false,
    tableName: 'commande_items',
    indexes: [{ fields: ['commandeId'] }, { fields: ['produitId'] }],
  }
);

module.exports = CommandeItem;
