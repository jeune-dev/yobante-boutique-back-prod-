const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Paiement = sequelize.define(
  'Paiement',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    commandeId: {
      type: DataTypes.UUID,
      unique: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    montant: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    methode: {
      type: DataTypes.ENUM('wave', 'orange_money', 'carte', 'cash_livraison'),
      allowNull: false,
    },
    statut: {
      type: DataTypes.ENUM('en_attente', 'succes', 'echoue', 'rembourse'),
      defaultValue: 'en_attente',
      allowNull: false,
    },
    transactionId: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Référence de la transaction chez le fournisseur',
    },
    fournisseur: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Fournisseur ayant traité le paiement (wave, orange_money, cash_livraison)',
    },
    urlPaiement: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'URL à ouvrir pour finaliser le paiement, le cas échéant',
    },
    derniereErreur: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Motif du dernier échec, affiché au client pour réessayer',
    },
    montantPaye: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Montant réellement payé (peut être partiel)',
    },
    tentatives: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Nombre de tentatives de paiement',
    },
    codeErreur: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Code erreur retourné par le fournisseur',
    },
    montantRemboursePaye: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      defaultValue: 0,
      comment: 'Montant remboursé réellement',
    },
    payeAt: {
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
    tableName: 'paiements',
    indexes: [
      { unique: true, fields: ['commandeId'] },
      { fields: ['userId'] },
      { fields: ['statut'] },
      { fields: ['createdAt'] },
      { fields: ['statut', 'createdAt'] },
      { fields: ['statut', 'montant', 'montantPaye'] }, // ✅ Index pour montants
    ],
  }
);

module.exports = Paiement;
