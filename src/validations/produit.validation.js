// ─────────────────────────────────────────────────────────────
// validations/produit.validation.js — Schémas Joi pour les produits
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');
const {
  MOTIF_AJUSTEMENT_STOCK,
  TYPE_MOUVEMENT_STOCK,
  SOURCE_MOUVEMENT_STOCK,
} = require('../constants');

// La catégorie a été retirée du formulaire produit : le classement se fait
// exclusivement par rayon puis sous-rayon. Un `categorieId` encore envoyé par
// un ancien client est simplement ignoré (`stripUnknown` côté middleware) : la
// mise à jour ne casse aucun appelant existant.
const createProduitSchema = Joi.object({
  nom: Joi.string().trim().max(100).required(),
  description: Joi.string().trim().allow('', null).optional(),
  prix: Joi.number().min(0).required(),
  prixPromo: Joi.number().min(0).allow(null).optional(),
  prixAchat: Joi.number()
    .min(0)
    .allow(null)
    .optional()
    .messages({ 'number.base': "Le prix d'achat doit être un nombre" }),
  stock: Joi.number().integer().min(0).default(0),
  images: Joi.array().items(Joi.string().trim()).optional(),
  // Le rangement en rayon commande la navigation de l'accueil mobile : un
  // produit sans rayon n'y apparaît nulle part, d'où l'obligation à la création.
  rayonId: Joi.string().uuid().required().messages({
    'any.required': 'Le rayon est obligatoire',
    'string.guid': 'Rayon invalide',
  }),
  sousRayonId: Joi.string().uuid().required().messages({
    'any.required': 'Le sous-rayon est obligatoire',
    'string.guid': 'Sous-rayon invalide',
  }),
  poids: Joi.number().min(0).allow(null).optional(),
  reference: Joi.string().trim().allow('', null).optional(),
  isFeatured: Joi.boolean().optional(),
  venduAuPoids: Joi.boolean().optional(),
  etat: Joi.string().valid('neuf', 'reconditionne').optional(),
});

const updateProduitSchema = Joi.object({
  nom: Joi.string().trim().max(100).optional(),
  description: Joi.string().trim().allow('', null).optional(),
  prix: Joi.number().min(0).optional(),
  prixPromo: Joi.number().min(0).allow(null).optional(),
  prixAchat: Joi.number()
    .min(0)
    .allow(null)
    .optional()
    .messages({ 'number.base': "Le prix d'achat doit être un nombre" }),
  stock: Joi.number().integer().min(0).optional(),
  images: Joi.array().items(Joi.string().trim()).optional(),
  // Facultatifs en modification : on ne réimpose pas le rangement à chaque
  // édition partielle. `null` est accepté afin de pouvoir retirer un produit
  // d'un rayon ou d'un sous-rayon depuis l'écran de rangement.
  rayonId: Joi.string().uuid().allow(null).optional(),
  sousRayonId: Joi.string().uuid().allow(null).optional(),
  poids: Joi.number().min(0).allow(null).optional(),
  reference: Joi.string().trim().allow('', null).optional(),
  isFeatured: Joi.boolean().optional(),
  isActive: Joi.boolean().optional(),
  venduAuPoids: Joi.boolean().optional(),
  etat: Joi.string().valid('neuf', 'reconditionne').optional(),
}).min(1);

// Ajustement manuel du stock par l'administration. `quantite` reste la
// quantité ABSOLUE visée (convention déjà portée par l'endpoint), et le motif
// est désormais obligatoire : chaque ajustement laisse une trace explicable
// dans `mouvements_stock`. Refusé ici même si le formulaire l'a laissé passer
// — un appel direct à l'API sans motif est rejeté de la même façon.
//
// Le motif est choisi dans une liste fermée pour rester filtrable ;
// « autre » impose alors une précision libre, contrôlée ici aussi.
const updateStockSchema = Joi.object({
  quantite: Joi.number().integer().min(0).required().messages({
    'number.base': 'La quantité doit être un nombre entier',
    'number.integer': 'La quantité doit être un nombre entier',
    'number.min': 'La quantité ne peut pas être négative',
    'any.required': 'La quantité est obligatoire',
  }),
  motif: Joi.string()
    .valid(...Object.values(MOTIF_AJUSTEMENT_STOCK))
    .required()
    .messages({
      'any.only': 'Choisissez un motif dans la liste proposée',
      'string.base': 'Le motif est obligatoire',
      'string.empty': 'Le motif est obligatoire',
      'any.required': 'Le motif est obligatoire',
    }),
  commentaire: Joi.when('motif', {
    is: MOTIF_AJUSTEMENT_STOCK.AUTRE,
    then: Joi.string().trim().min(3).max(1000).required().messages({
      'string.empty': 'Précisez le motif',
      'string.min': 'La précision doit contenir au moins 3 caractères',
      'string.max': 'La précision ne doit pas dépasser 1000 caractères',
      'any.required': 'Précisez le motif',
    }),
    otherwise: Joi.string().trim().max(1000).allow('', null).optional().messages({
      'string.max': 'Le commentaire ne doit pas dépasser 1000 caractères',
    }),
  }),
});

// Filtres de lecture de l'historique. Tout est facultatif ; une valeur hors
// liste est refusée plutôt qu'ignorée silencieusement.
const mouvementsStockQuerySchema = Joi.object({
  page: Joi.number().integer().min(1).optional(),
  limit: Joi.number().integer().min(1).max(100).optional(),
  dateDebut: Joi.date().iso().optional().messages({ 'date.base': 'Date de début invalide' }),
  dateFin: Joi.date().iso().optional().messages({ 'date.base': 'Date de fin invalide' }),
  type: Joi.string()
    .valid(...Object.values(TYPE_MOUVEMENT_STOCK))
    .optional()
    .messages({ 'any.only': 'Type de mouvement inconnu' }),
  source: Joi.string()
    .valid(...Object.values(SOURCE_MOUVEMENT_STOCK))
    .optional()
    .messages({ 'any.only': 'Origine de mouvement inconnue' }),
  auteurId: Joi.string().uuid().optional().messages({ 'string.guid': 'Utilisateur invalide' }),
  clientId: Joi.string().uuid().optional().messages({ 'string.guid': 'Client invalide' }),
  motif: Joi.string()
    .valid(...Object.values(MOTIF_AJUSTEMENT_STOCK))
    .optional()
    .messages({ 'any.only': 'Motif inconnu' }),
  search: Joi.string().trim().max(100).allow('').optional(),
});

module.exports = {
  createProduitSchema,
  updateProduitSchema,
  updateStockSchema,
  mouvementsStockQuerySchema,
};
