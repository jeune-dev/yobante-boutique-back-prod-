// ─────────────────────────────────────────────────────────────
// constants/index.js — Constantes partagées de l'application
// ─────────────────────────────────────────────────────────────

const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  CLIENT: 'CLIENT',
  VENDEUR: 'VENDEUR',
});

const STATUT_COMMANDE = Object.freeze({
  EN_ATTENTE: 'en_attente',
  // Interne à l'administration (avant la validation) : jamais montré au client
  // ni au vendeur, qui voient « en_attente ». Voir utils/statutCommande.js.
  EN_MODIFICATION: 'en_modification',
  VALIDEE: 'validee',
  EN_PREPARATION: 'en_preparation',
  EXPEDIEE: 'expediee',
  LIVREE: 'livree',
  ANNULEE: 'annulee',
  REJETEE: 'rejetee',
});

const STATUT_PAIEMENT = Object.freeze({
  EN_ATTENTE: 'en_attente',
  SUCCES: 'succes',
  ECHOUE: 'echoue',
  REMBOURSE: 'rembourse',
});

const METHODE_PAIEMENT = Object.freeze({
  WAVE: 'wave',
  ORANGE_MONEY: 'orange_money',
  CARTE: 'carte',
  CASH_LIVRAISON: 'cash_livraison',
});

const STATUT_VALIDATION_PRODUIT = Object.freeze({
  EN_ATTENTE: 'en_attente',
  VALIDE_STEP1: 'valide_step1',
  VALIDE: 'valide',
  REJETE: 'rejete',
});

// Statut d'un compte vendeur. Le circuit de validation en deux etapes a ete
// retire : un vendeur cree par un administrateur est actif immediatement, et
// seul un blocage explicite le desactive.
const STATUT_VENDEUR = Object.freeze({
  ACTIF: 'actif',
  BLOQUE: 'bloque',
});

const SECTION_PROMOTION = Object.freeze({
  NOS_PROMOS_DU_MOMENT: 'nos_promos_du_moment',
  A_NE_PAS_RATER: 'a_ne_pas_rater',
  NOS_PROMOS_A_VENIR: 'nos_promos_a_venir',
});

const TYPE_OTP = Object.freeze({
  EMAIL_VERIFICATION: 'email_verification',
  RESET_PASSWORD: 'reset_password',
});

// Frais de livraison forfaitaire par défaut (fallback si aucun tarif configuré en DB)
// Valeur en EUR — peut être surchargée par la table frais_livraisons
const FRAIS_LIVRAISON_DEFAUT = Number(process.env.FRAIS_LIVRAISON_DEFAUT) || 15;

const PAGINATION = Object.freeze({
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
});

const UPLOAD = Object.freeze({
  MAX_FILE_SIZE_MB: 5,
  ALLOWED_MIME_TYPES: ['image/png', 'image/jpeg', 'image/webp'],
  FOLDERS: {
    PRODUITS: 'produits',
    AVATARS: 'avatars',
    BANNIERES: 'bannieres',
    VENDEURS: 'vendeurs',
    CATEGORIES: 'categories',
  },
});

// ── Niveaux d'alerte de stock ──────────────────────────────────
// Quatre paliers demandés par la boutique : vert / orange / rouge / noir.
// Les seuils sont réglables sans redéploiement (un primeur et un vendeur
// d'électroménager n'ont pas la même notion de « stock faible »).
const NIVEAU_STOCK = Object.freeze({
  NORMAL: 'normal',
  FAIBLE: 'faible',
  RUPTURE_IMMINENTE: 'rupture_imminente',
  RUPTURE: 'rupture',
});

const SEUILS_STOCK = Object.freeze({
  RUPTURE_IMMINENTE: Number(process.env.SEUIL_RUPTURE_IMMINENTE) || 2,
  FAIBLE: Number(process.env.SEUIL_STOCK_FAIBLE) || 5,
});

// Nombre de jours de ventes servant à calculer la couverture de stock.
const FENETRE_COUVERTURE_JOURS = Number(process.env.FENETRE_COUVERTURE_JOURS) || 30;

// Qui est à l'origine d'une modification ou d'une annulation de commande.
const ORIGINE_ACTION = Object.freeze({
  CLIENT: 'client',
  ADMIN: 'admin',
  VENDEUR: 'vendeur',
});

// À qui l'incident est imputable. Sert au suivi de fiabilité des vendeurs :
// une annulation « responsabilité vendeur » (stock annoncé à tort, par
// exemple) pèse sur son score, pas un changement d'avis du client.
const RESPONSABILITE = Object.freeze({
  VENDEUR: 'vendeur',
  CLIENT: 'client',
  TRANSPORT: 'transport',
  AUTRE: 'autre',
});

const MOTIF_RETOUR = Object.freeze({
  PRODUIT_ABIME: 'produit_abime',
  NON_CONFORME: 'non_conforme',
  ERREUR_ARTICLE: 'erreur_article',
  STOCK_INEXISTANT: 'stock_inexistant',
  RETARD_LIVRAISON: 'retard_livraison',
  CHANGEMENT_AVIS: 'changement_avis',
  AUTRE: 'autre',
});

// Taux prélevé par la plateforme sur une vente marketplace, en pourcentage.
// Un vendeur peut avoir un taux négocié sur son profil, qui prime sur celui-ci.
const TAUX_COMMISSION_DEFAUT = Number(process.env.TAUX_COMMISSION_DEFAUT) || 10;

const STATUT_REVERSEMENT = Object.freeze({
  EN_ATTENTE: 'en_attente',
  PAYE: 'paye',
  ANNULE: 'annule',
});

const STATUT_RETOUR = Object.freeze({
  DEMANDE: 'demande',
  ACCEPTE: 'accepte',
  REFUSE: 'refuse',
  REMBOURSE: 'rembourse',
});

module.exports = {
  ROLES,
  STATUT_COMMANDE,
  STATUT_PAIEMENT,
  METHODE_PAIEMENT,
  STATUT_VALIDATION_PRODUIT,
  STATUT_VENDEUR,
  SECTION_PROMOTION,
  TYPE_OTP,
  FRAIS_LIVRAISON_DEFAUT,
  PAGINATION,
  UPLOAD,
  NIVEAU_STOCK,
  SEUILS_STOCK,
  FENETRE_COUVERTURE_JOURS,
  ORIGINE_ACTION,
  RESPONSABILITE,
  MOTIF_RETOUR,
  STATUT_RETOUR,
  TAUX_COMMISSION_DEFAUT,
  STATUT_REVERSEMENT,
};
