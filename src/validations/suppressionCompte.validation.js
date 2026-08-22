// ─────────────────────────────────────────────────────────────
// validations/suppressionCompte.validation.js — Schéma Joi pour le
// formulaire public de demande de suppression de compte
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const demandeSuppressionCompteSchema = Joi.object({
  email: Joi.string().trim().email().max(255).required(),
  objet: Joi.string().trim().min(5).max(2000).required(),
});

module.exports = { demandeSuppressionCompteSchema };
