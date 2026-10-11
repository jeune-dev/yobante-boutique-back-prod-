// ─────────────────────────────────────────────────────────────
// validations/rayon.validation.js — Rayons et sous-rayons (admin)
// Le dashboard envoie { nom, description, image } (image : URL, peut être vide).
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const nom = Joi.string().trim().min(1).max(100).messages({
  'any.required': 'Le nom est obligatoire',
  'string.empty': 'Le nom est obligatoire',
  'string.max': 'Le nom ne doit pas dépasser 100 caractères',
});
const description = Joi.string().trim().max(2000).allow('', null);
const image = Joi.string().trim().max(1000).allow('', null);

// Rang d'affichage (croissant) dans le catalogue ou dans le rayon.
const ordre = Joi.number().integer().min(0).max(10000);

const creerRayonSchema = Joi.object({ nom: nom.required(), description, image, ordre });
const modifierRayonSchema = Joi.object({ nom, description, image, ordre })
  .min(1)
  .messages({ 'object.min': 'Aucune modification fournie' });

module.exports = { creerRayonSchema, modifierRayonSchema };
