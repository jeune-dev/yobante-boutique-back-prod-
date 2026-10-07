const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ProfilVendeur = sequelize.define(
  'ProfilVendeur',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    // Taux prelevé par la plateforme sur les ventes de ce vendeur.
    // Nul = on applique le taux par defaut de la plateforme, ce qui evite
    // de devoir renseigner chaque profil pour demarrer.
    tauxCommission: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
      validate: { min: 0, max: 100 },
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
    },
    nomBoutique: {
      type: DataTypes.STRING(200),
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    infoLegale: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'SIRET, RCS, numéro TVA intracommunautaire, etc.',
    },
    adresseBoutique: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    telephone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    logo: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
      comment: 'Pour la recherche "boutiques proches"',
    },
    longitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: true,
      comment: 'Pour la recherche "boutiques proches"',
    },
    isValidatedStep1: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Première validation admin',
    },
    isValidatedStep2: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Deuxième validation admin (validation finale)',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Actif uniquement après double validation',
    },
    noteStep1By: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Admin ayant effectué la 1re validation',
    },
    noteStep2By: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Admin ayant effectué la 2e validation',
    },
    motifRejet: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: 'profils_vendeurs',
    // Le taux de commission est une donnée commerciale interne : il ressortait
    // dans le catalogue public (listes de produits, recherche, rayons), donc
    // visible de tout client et de tout vendeur concurrent. Même protection
    // que `prixAchat` sur le produit : exclu par défaut, réintégré
    // explicitement via `ProfilVendeur.scope('administration')`.
    defaultScope: { attributes: { exclude: ['tauxCommission'] } },
    scopes: { administration: {} },
    indexes: [
      { unique: true, fields: ['userId'] },
      { fields: ['isActive'] },
      { fields: ['isValidatedStep1', 'isValidatedStep2'] },
    ],
  }
);

module.exports = ProfilVendeur;
