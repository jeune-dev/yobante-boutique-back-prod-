// ─────────────────────────────────────────────────────────────
// validations/retour.validation.js — Schémas Joi pour les retours produits
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');
const { MOTIF_RETOUR, STATUT_RETOUR, RESPONSABILITE } = require('../constants');

const MOTIFS = Object.values(MOTIF_RETOUR);
const STATUTS = Object.values(STATUT_RETOUR);
const RESPONSABILITES = Object.values(RESPONSABILITE);

const creerRetourSchema = Joi.object({
  commandeId: Joi.string().uuid().required(),
  commandeItemId: Joi.string().uuid().required().messages({
    'any.required': "Indiquez l'article concerné par le retour",
  }),
  quantite: Joi.number().integer().min(1).default(1),
  motif: Joi.string()
    .valid(...MOTIFS)
    .required()
    .messages({ 'any.only': `Motif attendu : ${MOTIFS.join(', ')}` }),
  // Redondant avec le contrôle du service, mais rejeté ici avant d'atteindre
  // la base : un motif « autre » sans texte rend les statistiques inutiles.
  motifDetail: Joi.string()
    .trim()
    .max(500)
    .when('motif', {
      is: MOTIF_RETOUR.AUTRE,
      then: Joi.required().messages({ 'any.required': 'Précisez le motif « autre »' }),
      otherwise: Joi.allow('', null).optional(),
    }),
  responsabilite: Joi.string()
    .valid(...RESPONSABILITES)
    .optional(),
  vendeurResponsableId: Joi.string().uuid().allow(null).optional(),
  remisEnStock: Joi.boolean().default(false),
});

const traiterRetourSchema = Joi.object({
  statut: Joi.string()
    .valid(...STATUTS)
    .optional()
    .messages({ 'any.only': `Statut attendu : ${STATUTS.join(', ')}` }),
  montantRembourse: Joi.number().min(0).allow(null).optional(),
  remisEnStock: Joi.boolean().optional(),
  responsabilite: Joi.string()
    .valid(...RESPONSABILITES)
    .allow(null)
    .optional(),
})
  .or('statut', 'montantRembourse', 'remisEnStock', 'responsabilite')
  .messages({ 'object.missing': 'Indiquez au moins un champ à mettre à jour' });

module.exports = { creerRetourSchema, traiterRetourSchema };
