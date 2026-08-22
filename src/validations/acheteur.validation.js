// ─────────────────────────────────────────────────────────────
// validations/acheteur.validation.js — Schéma Joi pour les endpoints acheteurs
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const boutiquesProchesSchema = Joi.object({
  lat: Joi.number().min(-90).max(90).required(),
  lng: Joi.number().min(-180).max(180).required(),
  rayon: Joi.number().min(0.1).max(100).default(5),
});

module.exports = { boutiquesProchesSchema };
