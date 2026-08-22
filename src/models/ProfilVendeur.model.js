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
    indexes: [
      { unique: true, fields: ['userId'] },
      { fields: ['isActive'] },
      { fields: ['isValidatedStep1', 'isValidatedStep2'] },
    ],
  }
);

module.exports = ProfilVendeur;
