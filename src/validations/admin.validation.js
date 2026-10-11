// ─────────────────────────────────────────────────────────────
// validations/admin.validation.js — Schémas Joi pour la gestion des admins
//
// Aucun champ `password` : le mot de passe temporaire est généré par le
// backend et envoyé par email, comme pour les vendeurs.
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const { PAGES_ADMIN } = require('../constants/accesAdmin');

// Pages du dashboard autorisées ; null = accès complet.
const permissions = Joi.array()
  .items(Joi.string().valid(...PAGES_ADMIN))
  .unique()
  .allow(null)
  .optional()
  .messages({ 'any.only': 'Page inconnue' });

const creerAdminSchema = Joi.object({
  nom: Joi.string().trim().max(100).required().messages({
    'any.required': 'Le nom est obligatoire',
    'string.empty': 'Le nom est obligatoire',
  }),
  prenom: Joi.string().trim().max(100).required().messages({
    'any.required': 'Le prénom est obligatoire',
    'string.empty': 'Le prénom est obligatoire',
  }),
  email: Joi.string().trim().email().max(255).required().messages({
    'any.required': "L'email est obligatoire",
    'string.empty': "L'email est obligatoire",
    'string.email': "L'email est invalide",
  }),
  telephone: Joi.string().trim().max(20).optional().allow('', null),
  permissions,
});

const modifierAdminSchema = Joi.object({
  nom: Joi.string().trim().max(100).optional(),
  prenom: Joi.string().trim().max(100).optional(),
  email: Joi.string().trim().email().max(255).optional().messages({
    'string.email': "L'email est invalide",
  }),
  telephone: Joi.string().trim().max(20).optional().allow('', null),
  permissions,
}).min(1);

module.exports = { creerAdminSchema, modifierAdminSchema };
