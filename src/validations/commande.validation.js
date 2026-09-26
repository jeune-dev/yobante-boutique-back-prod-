// ─────────────────────────────────────────────────────────────
// validations/commande.validation.js — Schémas Joi pour les commandes
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const passerCommandeSchema = Joi.object({
  adresseId: Joi.string().uuid().required(),
  methode: Joi.string().valid('wave', 'orange_money', 'carte', 'cash_livraison').required(),
  items: Joi.array()
    .items(
      Joi.object({
        produitId: Joi.string().uuid().required(),
        quantite: Joi.number().integer().min(1).required(),
      })
    )
    .optional(),
  note: Joi.string().trim().max(500).allow('', null).optional(),
  // `YYYY-MM-DD` ; le mobile l'envoie sans heure.
  dateLivraisonSouhaitee: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .allow(null)
    .optional()
    .messages({ 'string.pattern.base': 'Date de livraison invalide (AAAA-MM-JJ attendu)' }),
});

// Le dashboard envoie `motif` (enregistré dans `motifRejet`, affiché au client
// par le mobile). `raison`, l'ancien nom, reste accepté comme alias.
const texteMotif = Joi.string().trim().max(500).messages({
  'string.base': 'Le motif du rejet doit être un texte',
  'string.empty': 'Le motif du rejet est obligatoire',
  'string.max': 'Le motif du rejet ne doit pas dépasser 500 caractères',
});
const rejeterCommandeSchema = Joi.object({
  motif: texteMotif,
  raison: texteMotif,
})
  .or('motif', 'raison')
  .messages({ 'object.missing': 'Le motif du rejet est obligatoire' });

// Création par l'admin : quantités strictement entières (une chaîne « 2 » ou
// un décimal « 1.5 » est refusé, pas converti). Les prix ne sont pas acceptés :
// le backend les relit en base.
const creerCommandeAdminSchema = Joi.object({
  userId: Joi.string().uuid().required().messages({
    'any.required': 'Veuillez sélectionner un client.',
    'string.guid': 'Client invalide',
    'string.empty': 'Veuillez sélectionner un client.',
  }),
  adresseId: Joi.string().uuid().required().messages({
    'any.required': 'Veuillez sélectionner une adresse de livraison.',
    'string.guid': 'Adresse invalide',
    'string.empty': 'Veuillez sélectionner une adresse de livraison.',
  }),
  methode: Joi.string()
    .valid('wave', 'orange_money', 'carte', 'cash_livraison')
    .default('cash_livraison')
    .messages({ 'any.only': 'Méthode de paiement invalide' }),
  items: Joi.array()
    .items(
      Joi.object({
        produitId: Joi.string().uuid().required().messages({
          'string.guid': 'Produit invalide',
          'any.required': 'Produit manquant',
        }),
        quantite: Joi.number().strict().integer().min(1).max(10000).required().messages({
          'number.base': 'La quantité doit être un nombre entier',
          'number.integer': 'La quantité doit être un nombre entier',
          'number.min': 'La quantité doit être au moins 1',
          'number.max': 'Quantité trop élevée',
          'any.required': 'Quantité manquante',
        }),
      })
    )
    .min(1)
    .max(100)
    .required()
    .messages({
      'array.min': 'Veuillez ajouter au moins un produit à la commande.',
      'any.required': 'Veuillez ajouter au moins un produit à la commande.',
      'array.base': 'Veuillez ajouter au moins un produit à la commande.',
    }),
  note: Joi.string().trim().max(500).allow('', null).optional(),
  dateLivraisonSouhaitee: Joi.string()
    .pattern(/^\d{4}-\d{2}-\d{2}$/)
    .allow(null, '')
    .optional()
    .messages({ 'string.pattern.base': 'Date de livraison invalide (AAAA-MM-JJ attendu)' }),
});

module.exports = { passerCommandeSchema, rejeterCommandeSchema, creerCommandeAdminSchema };
