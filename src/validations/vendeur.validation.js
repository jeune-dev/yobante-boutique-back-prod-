// ─────────────────────────────────────────────────────────────
// validations/vendeur.validation.js — Schémas Joi pour la gestion
// des comptes vendeurs par l'administration.
//
// Aucun champ `password` : le mot de passe temporaire est généré par
// le backend et envoyé par email. Le laisser passer depuis le client
// rouvrirait la porte à un mot de passe faible choisi côté admin.
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const creerVendeurSchema = Joi.object({
  nom: Joi.string().trim().max(100).required().messages({
    'any.required': 'Le nom est obligatoire',
    'string.empty': 'Le nom est obligatoire',
  }),
  prenom: Joi.string().trim().max(100).required().messages({
    'any.required': 'Le prénom est obligatoire',
    'string.empty': 'Le prénom est obligatoire',
  }),
  email: Joi.string().trim().email().required().messages({
    'any.required': "L'email est obligatoire",
    'string.email': "L'email est invalide",
  }),
  telephone: Joi.string().trim().max(20).allow('', null).optional(),
  phoneCountryCode: Joi.string().trim().length(2).uppercase().optional(),
  phoneNationalNumber: Joi.string().trim().max(15).optional(),
  nomBoutique: Joi.string().trim().max(200).required().messages({
    'any.required': 'Le nom de la boutique est obligatoire',
    'string.empty': 'Le nom de la boutique est obligatoire',
  }),
  adresseBoutique: Joi.string().trim().max(500).allow('', null).optional(),
  description: Joi.string().trim().allow('', null).optional(),
  infoLegale: Joi.string().trim().allow('', null).optional(),
});

const updateProfilVendeurSchema = Joi.object({
  nom: Joi.string().trim().max(100).optional(),
  prenom: Joi.string().trim().max(100).optional(),
  email: Joi.string().trim().email().optional(),
  telephone: Joi.string().trim().max(20).allow('', null).optional(),
  phoneCountryCode: Joi.string().trim().length(2).uppercase().optional(),
  phoneNationalNumber: Joi.string().trim().max(15).optional(),
  nomBoutique: Joi.string().trim().max(200).optional(),
  adresseBoutique: Joi.string().trim().max(500).allow('', null).optional(),
  description: Joi.string().trim().allow('', null).optional(),
  infoLegale: Joi.string().trim().allow('', null).optional(),
  latitude: Joi.number().min(-90).max(90).allow(null).optional(),
  longitude: Joi.number().min(-180).max(180).allow(null).optional(),
}).min(1);

module.exports = { creerVendeurSchema, updateProfilVendeurSchema };
