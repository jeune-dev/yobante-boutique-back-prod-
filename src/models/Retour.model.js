const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const { MOTIF_RETOUR, STATUT_RETOUR, RESPONSABILITE } = require('../constants');

/**
 * Retour d'un article livré.
 *
 * La maille est la ligne de commande, pas la commande : le taux de retour par
 * produit n'a de sens qu'article par article. `produitId` est dénormalisé
 * depuis la ligne pour que les statistiques par produit tiennent en une
 * requête, et pour que le retour reste exploitable si la ligne disparaît.
 */
const Retour = sequelize.define(
  'Retour',
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
    commandeItemId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    produitId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Client qui retourne — sert au suivi des retours par client',
    },
    quantite: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: { min: 1 },
    },
    motif: {
      type: DataTypes.ENUM(...Object.values(MOTIF_RETOUR)),
      allowNull: false,
    },
    motifDetail: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Précision libre, obligatoire quand le motif est « autre »',
    },
    statut: {
      type: DataTypes.ENUM(...Object.values(STATUT_RETOUR)),
      allowNull: false,
      defaultValue: STATUT_RETOUR.DEMANDE,
    },
    responsabilite: {
      type: DataTypes.ENUM(...Object.values(RESPONSABILITE)),
      allowNull: true,
    },
    vendeurResponsableId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    montantRembourse: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    remisEnStock: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      comment: 'Un produit abîmé ne retourne pas en stock, un non conforme si',
    },
    traitePar: {
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
    tableName: 'retours',
    indexes: [
      { fields: ['commandeId'] },
      { fields: ['commandeItemId'] },
      { fields: ['produitId'] },
      { fields: ['statut'] },
      { fields: ['motif'] },
      { fields: ['createdAt'] },
      { fields: ['responsabilite', 'vendeurResponsableId'] },
    ],
  }
);

module.exports = Retour;
