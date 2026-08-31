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
};
