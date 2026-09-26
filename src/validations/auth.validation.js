// ─────────────────────────────────────────────────────────────
// validations/auth.validation.js — Schémas Joi pour l'auth
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const motDePasse = Joi.string()
  .min(8)
  .pattern(/^(?=.*[A-Z])(?=.*\d).+$/)
  .messages({
    'string.pattern.base': 'Le mot de passe doit contenir au moins une majuscule et un chiffre',
  });

const registerSchema = Joi.object({
  nom: Joi.string().trim().max(100).required(),
  prenom: Joi.string().trim().max(100).required(),
  email: Joi.string().trim().email().required(),
  password: motDePasse.required(),
  telephone: Joi.string().trim().optional().allow('', null),
  adresse: Joi.object({
    nomComplet: Joi.string().trim().max(200).optional().allow('', null),
    telephone: Joi.string().trim().max(20).optional().allow('', null),
    rue: Joi.string().trim().max(500).optional().allow('', null),
    ville: Joi.string().trim().max(100).optional().allow('', null),
    region: Joi.string().trim().max(100).optional().allow('', null),
    pays: Joi.string().trim().max(100).optional().allow('', null),
    codePostal: Joi.string().trim().max(20).optional().allow('', null),
  }).optional(),
});

const loginSchema = Joi.object({
  identifiant: Joi.string().trim().required(),
  password: Joi.string().required(),
});

const refreshSchema = Joi.object({
  refreshToken: Joi.string().required(),
});

const logoutSchema = Joi.object({
  refreshToken: Joi.string().optional().allow('', null),
});

const forgotPasswordSchema = Joi.object({
  email: Joi.string().trim().email().required(),
});

const verifyResetCodeSchema = Joi.object({
  email: Joi.string().trim().email().required(),
  code: Joi.string().trim().min(6).max(6).required(),
});

const resetPasswordSchema = Joi.object({
  resetToken: Joi.string().required(),
  newPassword: motDePasse.required(),
});

const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: motDePasse.required(),
});

// Premier changement du mot de passe temporaire (admin, vendeur) — les
// règles fines (confirmation, longueur) restent dans le service, qui renvoie
// déjà des messages attendus par le mobile et le dashboard.
const changerPremierMdpSchema = Joi.object({
  ancienPassword: Joi.string().required().messages({
    'any.required': 'Le mot de passe temporaire est obligatoire',
    'string.empty': 'Le mot de passe temporaire est obligatoire',
  }),
  nouveauPassword: Joi.string().required().messages({
    'any.required': 'Le nouveau mot de passe est obligatoire',
    'string.empty': 'Le nouveau mot de passe est obligatoire',
  }),
  confirmPassword: Joi.string().required().messages({
    'any.required': 'La confirmation du mot de passe est obligatoire',
    'string.empty': 'La confirmation du mot de passe est obligatoire',
  }),
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  logoutSchema,
  forgotPasswordSchema,
  // Absent de cette liste, `verifyResetCodeSchema` arrivait à `validate()`
  // sous la forme `undefined` : la route POST /auth/verify-reset-code
  // répondait 500 à CHAQUE appel, et la réinitialisation du mot de passe
  // était impossible pour tous les utilisateurs.
  verifyResetCodeSchema,
  resetPasswordSchema,
  changePasswordSchema,
  changerPremierMdpSchema,
};
