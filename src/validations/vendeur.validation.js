// ─────────────────────────────────────────────────────────────
// validations/vendeur.validation.js — Schémas Joi pour la gestion
// des comptes vendeurs par l'administration.
//
// Le mot de passe est choisi par l'administrateur à la création, avec les
// mêmes règles que l'inscription (8 caractères, une majuscule, un
// chiffre), puis envoyé au vendeur par email avec son identifiant.
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
  password: Joi.string()
    .min(8)
    .max(72)
    .pattern(/^(?=.*[A-Z])(?=.*\d).+$/)
    .required()
    .messages({
      'any.required': 'Le mot de passe est obligatoire',
      'string.empty': 'Le mot de passe est obligatoire',
      'string.min': 'Le mot de passe doit contenir au moins 8 caractères',
      'string.max': 'Le mot de passe ne doit pas dépasser 72 caractères',
      'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule et un chiffre',
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
