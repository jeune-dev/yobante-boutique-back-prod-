// ─────────────────────────────────────────────────────────────
// validations/produit.validation.js — Schémas Joi pour les produits
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

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

const updateStockSchema = Joi.object({
  quantite: Joi.number().integer().min(0).required(),
});

module.exports = { createProduitSchema, updateProduitSchema, updateStockSchema };
