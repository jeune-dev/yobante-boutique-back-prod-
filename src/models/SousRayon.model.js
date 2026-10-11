const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const SousRayon = sequelize.define(
  'SousRayon',
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    nom: { type: DataTypes.STRING(100), allowNull: false },
    slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    image: { type: DataTypes.STRING(500), allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    rayonId: { type: DataTypes.UUID, allowNull: false },
    // Ordre d'affichage dans son rayon ; à égalité, le nom départage.
    ordre: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  },
  { tableName: 'sous_rayons', timestamps: true }
);

module.exports = SousRayon;
