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

module.exports = { creerPromotionVendeurSchema, modifierPromotionVendeurSchema };
