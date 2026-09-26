// ─────────────────────────────────────────────────────────────
// validations/promotion.validation.js — Promotions créées par un vendeur
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const dateIso = Joi.date().iso();

// Contrat mobile : { produitId, titre, description, prixPromo, dateDebut, dateFin }.
const creerPromotionVendeurSchema = Joi.object({
  produitId: Joi.string().uuid().required().messages({ 'string.guid': 'Produit invalide' }),
  titre: Joi.string().trim().max(200).allow('', null).optional(),
  description: Joi.string().trim().max(2000).allow('', null).optional(),
  prixPromo: Joi.number().positive().required().messages({
    'number.positive': 'Le prix promotionnel doit être positif',
    'any.required': 'Le prix promotionnel est obligatoire',
  }),
  dateDebut: dateIso.required(),
  dateFin: dateIso.greater(Joi.ref('dateDebut')).required().messages({
    'date.greater': 'La date de fin doit être postérieure à la date de début',
  }),
});

const modifierPromotionVendeurSchema = Joi.object({
  titre: Joi.string().trim().max(200).allow('', null).optional(),
  description: Joi.string().trim().max(2000).allow('', null).optional(),
  prixPromo: Joi.number().positive().optional(),
  dateDebut: dateIso.optional(),
  dateFin: dateIso.optional(),
}).min(1);

// Admin — POST /admin/promotions/produit/:produitId (écran Produits du
// dashboard) : { section, pourcentageReduction, dateDebut, dateFin, titre? }.
// Le prix promotionnel est calculé par le backend à partir du prix réel.
const creerPromotionProduitSchema = Joi.object({
  section: Joi.string()
    .valid('nos_promos_du_moment', 'a_ne_pas_rater', 'nos_promos_a_venir')
    .required()
    .messages({
      'any.only': 'Section de promotion invalide',
      'any.required': 'La section est obligatoire',
    }),
  pourcentageReduction: Joi.number().greater(0).max(100).required().messages({
    'number.base': 'Le pourcentage de réduction doit être un nombre',
    'number.greater': 'Le pourcentage de réduction doit être entre 1 et 100',
    'number.max': 'Le pourcentage de réduction doit être entre 1 et 100',
    'any.required': 'Le pourcentage de réduction est obligatoire',
  }),
  dateDebut: dateIso.required().messages({ 'any.required': 'La date de début est obligatoire' }),
  dateFin: dateIso.greater(Joi.ref('dateDebut')).required().messages({
    'date.greater': 'La date de fin doit être postérieure à la date de début',
    'any.required': 'La date de fin est obligatoire',
  }),
  titre: Joi.string().trim().max(200).allow('', null).optional(),
});

module.exports = {
  creerPromotionVendeurSchema,
  modifierPromotionVendeurSchema,
  creerPromotionProduitSchema,
};
