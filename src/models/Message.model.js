const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Message 1:1 entre deux utilisateurs (acheteur ↔ vendeur).
const Message = sequelize.define(
  'Message',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    expediteurId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    destinataireId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    contenu: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    lu: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    },
  },
  {
    timestamps: true,
    tableName: 'messages',
    indexes: [
      { fields: ['expediteurId'] },
      { fields: ['destinataireId'] },
      { fields: ['destinataireId', 'lu'] },
    ],
  }
);

module.exports = Message;
