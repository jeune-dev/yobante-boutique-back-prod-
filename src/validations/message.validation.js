// ─────────────────────────────────────────────────────────────
// validations/message.validation.js — Schémas Joi pour la messagerie
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const envoyerMessageSchema = Joi.object({
  destinataireId: Joi.string().uuid().required(),
  contenu: Joi.string().trim().min(1).max(2000).required(),
});

module.exports = { envoyerMessageSchema };
