const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const { TYPE_MOUVEMENT_STOCK } = require('../constants');

/**
 * Journal de TOUS les changements de quantité en stock d'un produit :
 * ajustements manuels de l'administration, sorties à la création d'une
 * commande, retours en stock à son annulation ou à son rejet.
 *
 * Une ligne par produit et par événement. Les quantités avant / après sont
 * recopiées plutôt que recalculées : l'historique doit rester lisible même
 * si le produit change ensuite par un autre chemin.
 *
 * `cleIdempotence` porte l'unicité métier d'un événement
 * (`commande:<id>:creation:<produitId>` par exemple) : rejouer la même
 * opération — retry réseau, double clic — ne crée pas un second mouvement.
 * Elle reste nulle pour un ajustement manuel, chaque ajustement étant un
 * acte volontaire distinct ; en PostgreSQL un index unique ignore les NULL,
 * plusieurs lignes sans clé coexistent donc sans conflit.
 *
 * L'historique n'est jamais réécrit ni supprimé : aucun service n'expose de
 * mise à jour ni de suppression d'un mouvement.
 */
const MouvementStock = sequelize.define(
  'MouvementStock',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    produitId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM(...Object.values(TYPE_MOUVEMENT_STOCK)),
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING(40),
      allowNull: false,
      comment: 'Chemin à l’origine du mouvement : ajustement_admin, commande_creation…',
    },
    ancienneQuantite: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    nouvelleQuantite: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    difference: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'nouvelleQuantite - ancienneQuantite : négatif pour un retrait',
    },
    motif: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Obligatoire pour un ajustement manuel, nul pour un mouvement de commande',
    },
    commentaire: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    auteurId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: "Utilisateur à l'origine du mouvement — null si le compte a été supprimé",
    },
    commandeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    clientId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Client de la commande concernée, le cas échéant',
    },
    cleIdempotence: {
      type: DataTypes.STRING(150),
      allowNull: true,
      unique: true,
    },
  },
  {
    // `createdAt` fait foi comme horodatage du mouvement : il est posé par
    // Sequelize au moment de l'écriture, jamais transmis par un client.
    timestamps: true,
    tableName: 'mouvements_stock',
    indexes: [
      { fields: ['produitId', 'createdAt'] },
      { fields: ['auteurId'] },
      { fields: ['type'] },
      { fields: ['commandeId'] },
      { fields: ['clientId'] },
      { fields: ['cleIdempotence'], unique: true },
    ],
  }
);

module.exports = MouvementStock;
