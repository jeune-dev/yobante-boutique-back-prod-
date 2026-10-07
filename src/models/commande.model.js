const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Commande = sequelize.define(
  'Commande',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    reference: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    adresseId: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    statut: {
      type: DataTypes.ENUM(
        'en_attente',
        'validee',
        'en_preparation',
        'expediee',
        'livree',
        'annulee',
        'rejetee'
      ),
      defaultValue: 'en_attente',
      allowNull: false,
    },
    montantTotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
    },
    fraisLivraison: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0,
    },
    note: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // Date de livraison souhaitée par le client (choisie au checkout mobile).
    dateLivraisonSouhaitee: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
    noteAdmin: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    motifRejet: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    // ── Annulation ───────────────────────────────────────────────
    // Distinct de `motifRejet` : un rejet refuse une commande en attente,
    // une annulation interrompt une commande déjà engagée.
    motifAnnulation: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    annulePar: {
      type: DataTypes.ENUM('client', 'admin', 'vendeur'),
      allowNull: true,
    },
    // Renseigné uniquement quand l'incident est imputable à quelqu'un.
    // `vendeur` + `vendeurResponsableId` alimentent le score de fiabilité.
    responsabiliteAnnulation: {
      type: DataTypes.ENUM('vendeur', 'client', 'transport', 'autre'),
      allowNull: true,
    },
    vendeurResponsableId: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    annuleeAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // ── Modification ─────────────────────────────────────────────
    modifieeAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    modifieePar: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    // Journal des retouches : [{ date, parQui, motif, responsabilite,
    // changements: [{ champ, avant, apres }] }]. Conservé pour le suivi
    // de fiabilité et pour justifier un écart de montant auprès du client.
    historiqueModifications: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: [],
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
    tableName: 'commandes',
    // Champs d'attribution interne, jamais destinés au client : le journal des
    // retouches contient des motifs rédigés en interne et des identifiants
    // d'administrateurs, et la responsabilité d'un incident ne regarde pas
    // l'acheteur. Même protection que `prixAchat` sur le produit : exclus par
    // défaut, réincluus explicitement via `Commande.scope('administration')`.
    //
    // `motifAnnulation` en fait partie : le client est averti que sa commande
    // est annulée, jamais de la raison réelle, qui peut mettre en cause un
    // vendeur. Restent visibles, parce qu'ils le concernent sans rien
    // divulguer : `annulePar`, `annuleeAt`, `modifieeAt`.
    defaultScope: {
      attributes: {
        exclude: [
          'motifAnnulation',
          'historiqueModifications',
          'modifieePar',
          'vendeurResponsableId',
          'responsabiliteAnnulation',
        ],
      },
    },
    scopes: { administration: {} },
    indexes: [
      { fields: ['userId'] },
      { fields: ['adresseId'] },
      { fields: ['statut'] },
      { unique: true, fields: ['reference'] },
      { fields: ['createdAt'] }, // ✅ PERF: Index pour filtres temporels
      { fields: ['createdAt', 'statut'] }, // ✅ PERF: Index composite pour dashboards
    ],
  }
);

module.exports = Commande;
