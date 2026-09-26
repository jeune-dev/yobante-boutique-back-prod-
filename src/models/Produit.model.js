const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Produit = sequelize.define(
  'Produit',
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
    slug: {
      type: DataTypes.STRING(100),
      unique: true,
      allowNull: false,
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    prix: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    prixPromo: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
    },
    prixAchat: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: "Prix d'achat du produit — réservé à l'admin, jamais exposé au client",
    },
    stock: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    stockAlloue: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Stock réservé / alloué aux commandes en cours',
    },
    infoLegale: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    noteMoyenne: {
      type: DataTypes.DECIMAL(3, 2),
      defaultValue: 0,
    },
    nombreAvis: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    statutValidation: {
      type: DataTypes.ENUM('en_attente', 'valide_step1', 'valide', 'rejete'),
      defaultValue: 'valide',
    },
    messageVendeur: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Message libre du vendeur à l'attention de qui relit sa demande",
    },
    motifRejet: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Motif du rejet, restitué au vendeur dans le suivi de sa demande',
    },
    vendeurId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    images: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isFeatured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    poids: {
      type: DataTypes.DECIMAL(8, 2),
      allowNull: true,
    },
    reference: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: true,
    },
    venduAuPoids: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      comment: 'Si vrai, le champ prix représente le prix au kg',
    },
    etat: {
      type: DataTypes.ENUM('neuf', 'reconditionne'),
      defaultValue: 'neuf',
    },
    // Le rangement du catalogue se fait désormais par rayon / sous-rayon.
    // La colonne reste en base pour l'historique et la navigation client
    // existante, mais n’est plus renseignée à la création d'un produit.
    categorieId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    rayonId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    sousRayonId: {
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
    tableName: 'produits',
    // Le prix d'achat n'est jamais lu, sauf demande explicite : il ne peut
    // plus fuiter par une requête ou un `include` qui oublie de l'exclure
    // (il était renvoyé à tous, sans authentification, par les promotions,
    // les rayons, la recherche…). Écrit normalement ; lecture réservée à
    // l'administration via `Produit.scope('administration')`.
    defaultScope: { attributes: { exclude: ['prixAchat'] } },
    scopes: { administration: {} },
    indexes: [
      { fields: ['categorieId'] },
      { fields: ['vendeurId'] },
      { fields: ['statutValidation'] },
      { fields: ['isActive'] },
      { fields: ['isFeatured'] },
      { fields: ['slug'], unique: true },
      {
        fields: ['reference'],
        unique: true,
        where: { reference: { [require('sequelize').Op.ne]: null } },
      },
    ],
  }
);

module.exports = Produit;
