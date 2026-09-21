// ─────────────────────────────────────────────────────────────
// models/index.js — Initialisation Sequelize et associations
// ─────────────────────────────────────────────────────────────

const sequelize = require('../config/db');
const User = require('./User.model');
const Categorie = require('./Categorie.model');
const Produit = require('./Produit.model');
const Commande = require('./commande.model');
const CommandeItem = require('./commandeItem.model');
const Paiement = require('./paiement.model');
const Adresse = require('./adresse.model');
const Panier = require('./panier.model');
const Avis = require('./avis.model');
const RefreshToken = require('./refreshToken.model');
const UserOtp = require('./userOtp.model');
const ProfilVendeur = require('./ProfilVendeur.model');
const Banniere = require('./Banniere.model');
const Promotion = require('./Promotion.model');
const FraisLivraison = require('./FraisLivraison.model');
const Favori = require('./Favori.model');
const BlocPromo = require('./BlocPromo.model');
const Notification = require('./Notification.model');
const DeviceToken = require('./DeviceToken.model');
const Rayon = require('./Rayon.model');
const SousRayon = require('./SousRayon.model');
const BanniereProduit = require('./BanniereProduit.model');
const DemandeSuppressionCompte = require('./DemandeSuppressionCompte.model');
const Message = require('./Message.model');
const Signalement = require('./Signalement.model');
const Abonnement = require('./Abonnement.model');
const PaiementAbonnement = require('./PaiementAbonnement.model');
const AdminPasswordReset = require('./AdminPasswordReset.model');
const PasswordResetToken = require('./PasswordResetToken.model');

// ── User associations ──────────────────────────────────────────
User.hasMany(Commande, { foreignKey: 'userId', as: 'commandes', onDelete: 'CASCADE' });
User.hasMany(Message, { foreignKey: 'expediteurId', as: 'messagesEnvoyes', onDelete: 'CASCADE' });
User.hasMany(Message, {
  foreignKey: 'destinataireId',
  as: 'messagesRecus',
  onDelete: 'CASCADE',
});
Message.belongsTo(User, { foreignKey: 'expediteurId', as: 'expediteur' });
Message.belongsTo(User, { foreignKey: 'destinataireId', as: 'destinataire' });
User.hasMany(Adresse, { foreignKey: 'userId', as: 'adresses', onDelete: 'CASCADE' });
User.hasMany(Panier, { foreignKey: 'userId', as: 'panier', onDelete: 'CASCADE' });
User.hasMany(Avis, { foreignKey: 'userId', as: 'avis', onDelete: 'CASCADE' });
User.hasMany(RefreshToken, { foreignKey: 'userId', as: 'refreshTokens', onDelete: 'CASCADE' });
User.hasMany(UserOtp, { foreignKey: 'userId', as: 'otps', onDelete: 'CASCADE' });
User.hasMany(Paiement, { foreignKey: 'userId', as: 'paiements', onDelete: 'CASCADE' });
User.hasOne(ProfilVendeur, { foreignKey: 'userId', as: 'profilVendeur', onDelete: 'CASCADE' });
User.hasMany(Produit, { foreignKey: 'vendeurId', as: 'produits', onDelete: 'SET NULL' });

// ── Categorie associations ─────────────────────────────────────
Categorie.hasMany(Produit, { foreignKey: 'categorieId', as: 'produits', onDelete: 'CASCADE' });
Categorie.hasMany(Categorie, { as: 'sousCategories', foreignKey: 'parentId', onDelete: 'CASCADE' });
Categorie.belongsTo(Categorie, { as: 'parentCategorie', foreignKey: 'parentId' });
Categorie.hasMany(Banniere, { foreignKey: 'categorieId', as: 'bannieres' });

// ── Produit associations ───────────────────────────────────────
Produit.belongsTo(Categorie, { foreignKey: 'categorieId', as: 'categorie' });
Produit.belongsTo(User, { foreignKey: 'vendeurId', as: 'vendeur' });
Produit.hasMany(CommandeItem, {
  foreignKey: 'produitId',
  as: 'commandeItems',
  onDelete: 'CASCADE',
});
Produit.hasMany(Panier, { foreignKey: 'produitId', as: 'paniers', onDelete: 'CASCADE' });
Produit.hasMany(Avis, { foreignKey: 'produitId', as: 'avis', onDelete: 'CASCADE' });
Produit.hasMany(Promotion, { foreignKey: 'produitId', as: 'promotions', onDelete: 'CASCADE' });

// ── Commande associations ──────────────────────────────────────
Commande.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Commande.belongsTo(Adresse, { foreignKey: 'adresseId', as: 'adresse' });
Commande.hasMany(CommandeItem, { foreignKey: 'commandeId', as: 'items', onDelete: 'CASCADE' });
Commande.hasOne(Paiement, { foreignKey: 'commandeId', as: 'paiement', onDelete: 'CASCADE' });

// ── CommandeItem associations ──────────────────────────────────
CommandeItem.belongsTo(Commande, { foreignKey: 'commandeId', as: 'commande' });
CommandeItem.belongsTo(Produit, { foreignKey: 'produitId', as: 'produit' });

// ── Paiement associations ──────────────────────────────────────
Paiement.belongsTo(Commande, { foreignKey: 'commandeId', as: 'commande' });
Paiement.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ── Adresse associations ───────────────────────────────────────
Adresse.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Adresse.hasMany(Commande, { foreignKey: 'adresseId', as: 'commandes', onDelete: 'SET NULL' });

// ── Panier associations ────────────────────────────────────────
Panier.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Panier.belongsTo(Produit, { foreignKey: 'produitId', as: 'produit' });

// ── Avis associations ──────────────────────────────────────────
Avis.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Avis.belongsTo(Produit, { foreignKey: 'produitId', as: 'produit' });

// ── RefreshToken associations ──────────────────────────────────
RefreshToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ── UserOtp associations ───────────────────────────────────────
UserOtp.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ── ProfilVendeur associations ─────────────────────────────────
ProfilVendeur.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ── Favori associations ────────────────────────────────────────
User.hasMany(Favori, { foreignKey: 'userId', as: 'favoris', onDelete: 'CASCADE' });
Favori.belongsTo(User, { foreignKey: 'userId', as: 'user' });
ProfilVendeur.hasMany(Favori, {
  foreignKey: 'profilVendeurId',
  as: 'favoris',
  onDelete: 'CASCADE',
});
Favori.belongsTo(ProfilVendeur, { foreignKey: 'profilVendeurId', as: 'boutique' });

// ── Banniere associations ──────────────────────────────────────
Banniere.belongsTo(Categorie, { foreignKey: 'categorieId', as: 'categorie' });

// ── Promotion associations ─────────────────────────────────────
Promotion.belongsTo(Produit, { foreignKey: 'produitId', as: 'produit' });

// Une sous-section d'accueil porte ses propres produits en promotion.
// onDelete SET NULL : supprimer une sous-section ne doit pas faire disparaître
// la promotion, qui reste valable au niveau de sa section.
BlocPromo.hasMany(Promotion, {
  foreignKey: 'blocPromoId',
  as: 'promotions',
  onDelete: 'SET NULL',
});
Promotion.belongsTo(BlocPromo, { foreignKey: 'blocPromoId', as: 'blocPromo' });

// ── Notification associations ──────────────────────────────────
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications', onDelete: 'CASCADE' });
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(DeviceToken, { foreignKey: 'userId', as: 'appareils', onDelete: 'CASCADE' });
DeviceToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ── Rayon / SousRayon associations ─────────────────────────────
Rayon.hasMany(SousRayon, { foreignKey: 'rayonId', as: 'sousRayons' });
SousRayon.belongsTo(Rayon, { foreignKey: 'rayonId', as: 'rayon' });
Rayon.hasMany(Produit, { foreignKey: 'rayonId', as: 'produits' });
Produit.belongsTo(Rayon, { foreignKey: 'rayonId', as: 'rayon' });
SousRayon.hasMany(Produit, { foreignKey: 'sousRayonId', as: 'produits' });
Produit.belongsTo(SousRayon, { foreignKey: 'sousRayonId', as: 'sousRayon' });

// ── Bannière <-> Produit associations ──────────────────────────
Banniere.belongsToMany(Produit, {
  through: BanniereProduit,
  foreignKey: 'banniereId',
  as: 'produits',
});
Produit.belongsToMany(Banniere, {
  through: BanniereProduit,
  foreignKey: 'produitId',
  as: 'bannieres',
});

// ── Signalement associations ───────────────────────────────────
User.hasMany(Signalement, { foreignKey: 'userId', as: 'signalements', onDelete: 'CASCADE' });
Signalement.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// ── Abonnement vendeur associations ────────────────────────────
User.hasMany(Abonnement, { foreignKey: 'vendeurId', as: 'abonnements', onDelete: 'CASCADE' });
Abonnement.belongsTo(User, { foreignKey: 'vendeurId', as: 'vendeur' });
User.hasMany(PaiementAbonnement, {
  foreignKey: 'vendeurId',
  as: 'paiementsAbonnement',
  onDelete: 'CASCADE',
});
PaiementAbonnement.belongsTo(User, { foreignKey: 'vendeurId', as: 'vendeur' });
Abonnement.hasMany(PaiementAbonnement, { foreignKey: 'abonnementId', as: 'paiements' });
PaiementAbonnement.belongsTo(Abonnement, { foreignKey: 'abonnementId', as: 'abonnement' });

// ── Admin Password Reset associations ──────────────────────────
AdminPasswordReset.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(AdminPasswordReset, { foreignKey: 'userId', as: 'adminPasswordResets', onDelete: 'CASCADE' });

// ── Password Reset Token associations ──────────────────────────
PasswordResetToken.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(PasswordResetToken, { foreignKey: 'userId', as: 'passwordResetTokens', onDelete: 'CASCADE' });

// ── Export all models ──────────────────────────────────────────
module.exports = {
  sequelize,
  User,
  Categorie,
  Produit,
  Commande,
  CommandeItem,
  Paiement,
  Adresse,
  Panier,
  Avis,
  RefreshToken,
  UserOtp,
  ProfilVendeur,
  Banniere,
  Promotion,
  FraisLivraison,
  Favori,
  BlocPromo,
  Notification,
  DeviceToken,
  Rayon,
  SousRayon,
  BanniereProduit,
  DemandeSuppressionCompte,
  Message,
  Signalement,
  Abonnement,
  PaiementAbonnement,
  AdminPasswordReset,
  PasswordResetToken,
};
