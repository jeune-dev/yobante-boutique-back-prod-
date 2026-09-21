// ─────────────────────────────────────────────────────────────
// validations/signalement.validation.js — Signalements (mobile)
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

// Contrat mobile : { type, raison, description, cibleId }.
const creerSignalementSchema = Joi.object({
  type: Joi.string().valid('produit', 'boutique').required().messages({
    'any.only': 'Le type doit être « produit » ou « boutique »',
  }),
  cibleId: Joi.string().uuid().required().messages({
    'string.guid': 'Cible invalide',
  }),
  raison: Joi.string().trim().min(3).max(200).required().messages({
    'string.min': 'La raison doit contenir au moins 3 caractères',
    'any.required': 'La raison est obligatoire',
  }),
  description: Joi.string().trim().max(2000).allow('', null).optional(),
});

// Traitement par l'administration.
const traiterSignalementSchema = Joi.object({
  statut: Joi.string().valid('en_attente', 'traite', 'rejete').required(),
  reponseAdmin: Joi.string().trim().max(2000).allow('', null).optional(),
});

module.exports = { creerSignalementSchema, traiterSignalementSchema };
