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

const rejeterCommandeSchema = Joi.object({
  raison: Joi.string().trim().max(500).required(),
});

module.exports = { passerCommandeSchema, rejeterCommandeSchema };
