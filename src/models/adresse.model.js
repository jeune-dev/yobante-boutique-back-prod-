const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Adresse = sequelize.define(
  'Adresse',
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
    nomComplet: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    telephone: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    rue: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    ville: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    region: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    pays: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    codePostal: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    // Adresse par défaut = domicile (« Chez moi »), une seule par client.
    isDefault: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    // Nom donné par le client (« Chez papa », « Bureau »), facultatif.
    libelle: {
      type: DataTypes.STRING(60),
      allowNull: true,
    },
    // Faux : adresse d'une seule commande (le client n'a pas voulu la garder)
    // ou ancienne version conservée pour l'historique des commandes. Elle
    // n'apparaît pas dans le carnet d'adresses.
    estEnregistree: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
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
    tableName: 'adresses',
    indexes: [
      { fields: ['userId'] },
      { fields: ['userId', 'isDefault'] },
      { fields: ['isDefault'] }, // ✅ PERF: Index sur isDefault
    ],
  }
);

module.exports = Adresse;
