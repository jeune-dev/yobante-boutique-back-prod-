// ─────────────────────────────────────────────────────────────
// validations/abonnement.validation.js — Paiement de l'abonnement vendeur
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const numeroTelephone = Joi.string()
  .trim()
  .pattern(/^\+?[0-9]{8,15}$/)
  .messages({ 'string.pattern.base': 'Numéro de téléphone invalide' });

// POST /vendeur/abonnement/payer : le mobile envoie le montant affiché, mais
// c'est le tarif serveur qui fait foi (le champ est accepté et ignoré).
const payerAbonnementSchema = Joi.object({
  methode: Joi.string().valid('wave', 'orange_money').required().messages({
    'any.only': 'Méthode de paiement non supportée (wave ou orange_money)',
  }),
  numeroTelephone: numeroTelephone.required(),
  montant: Joi.number().min(0).optional(),
});

// POST /vendeur/abonnement/renouveler : tout est facultatif (numéro du profil).
const renouvelerAbonnementSchema = Joi.object({
  methode: Joi.string().valid('wave', 'orange_money').default('wave'),
  numeroTelephone: numeroTelephone.optional(),
  montant: Joi.number().min(0).optional(),
});

module.exports = { payerAbonnementSchema, renouvelerAbonnementSchema };
