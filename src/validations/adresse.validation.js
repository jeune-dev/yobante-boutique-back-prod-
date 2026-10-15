// ─────────────────────────────────────────────────────────────
// validations/adresse.validation.js — Schémas Joi pour les adresses
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const adresseSchema = Joi.object({
  // Nom de l'adresse (« Chez papa »), facultatif.
  libelle: Joi.string().trim().max(60).allow('', null).optional(),
  // false : adresse utilisée pour une commande sans l'enregistrer.
  enregistrer: Joi.boolean().optional(),
  nomComplet: Joi.string().trim().max(100).required(),
  telephone: Joi.string().trim().required(),
  rue: Joi.string().trim().required(),
  // Ville facultative : une adresse saisie d'un seul tenant depuis le profil
  // (« Rue 10, Médina ») n'en précise pas toujours une.
  ville: Joi.string().trim().allow('').default(''),
  region: Joi.string().trim().allow('', null).optional(),
  pays: Joi.string().trim().default('Sénégal'),
  codePostal: Joi.string().trim().allow('', null).optional(),
  isDefault: Joi.boolean().default(false),
});

const updateAdresseSchema = adresseSchema
  .fork(['nomComplet', 'telephone', 'rue', 'pays'], (schema) => schema.optional())
  .min(1);

module.exports = { adresseSchema, updateAdresseSchema };
