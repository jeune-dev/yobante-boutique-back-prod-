// ─────────────────────────────────────────────────────────────
// validations/banniere.validation.js — Bannières (admin)
// ─────────────────────────────────────────────────────────────
const Joi = require('joi');

const listeOrdre = Joi.array()
  .items(
    Joi.object({
      id: Joi.string().uuid().required(),
      ordre: Joi.number().integer().min(0).required(),
    })
  )
  .min(1);

// `ordres` est le nom historique ; `elements` est celui des autres écrans de
// réordonnancement (promotions, blocs promo). Les deux sont acceptés.
const reordonnerBannieresSchema = Joi.object({ ordres: listeOrdre, elements: listeOrdre })
  .xor('ordres', 'elements')
  .messages({ 'object.missing': 'La liste des éléments à réordonner est obligatoire' });

module.exports = { reordonnerBannieresSchema };
