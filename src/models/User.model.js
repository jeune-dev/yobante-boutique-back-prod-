const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define(
  'User',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    nom: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    prenom: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    telephone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    role: {
      type: DataTypes.ENUM('CLIENT', 'ADMIN', 'VENDEUR'),
      defaultValue: 'CLIENT',
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    avatar: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    mustChangePassword: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Compte supprimé par l'administration : anonymisé et fermé, conservé
    // pour l'historique des commandes (voir SuppressionCompteService).
    supprimeLe: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Administrateurs : pages du dashboard autorisées (constants/accesAdmin.js).
    // null = accès complet.
    permissions: {
      type: DataTypes.JSONB,
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
    tableName: 'users',
    indexes: [{ unique: true, fields: ['email'] }, { fields: ['role'] }, { fields: ['isActive'] }],
  }
);

module.exports = User;
