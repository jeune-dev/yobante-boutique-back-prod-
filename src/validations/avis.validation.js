// ─────────────────────────────────────────────────────────────
// validations/avis.validation.js — Schémas Joi pour les avis
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const avisSchema = Joi.object({
  produitId: Joi.string().uuid().required(),
  note: Joi.number().integer().min(1).max(5).required(),
  commentaire: Joi.string().trim().max(1000).allow('', null).optional(),
});

const reponseAvisSchema = Joi.object({
  reponse: Joi.string().trim().min(1).max(1000).required(),
});

const updateAvisSchema = Joi.object({
  note: Joi.number().integer().min(1).max(5).optional(),
  commentaire: Joi.string().trim().max(1000).allow('', null).optional(),
}).min(1);

module.exports = { avisSchema, updateAvisSchema, reponseAvisSchema };
