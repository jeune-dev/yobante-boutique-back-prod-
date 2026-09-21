// ─────────────────────────────────────────────────────────────
// routes/vendeur/promotion.route.js — Préfixe : /api/v1/vendeur/promotions
// Promotions qu'un vendeur crée sur ses propres produits (mobile).
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/vendeur/promotion.controller');
const vendeurMiddleware = require('../../middlewares/vendeur.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  creerPromotionVendeurSchema,
  modifierPromotionVendeurSchema,
} = require('../../validations/promotion.validation');

router.use(vendeurMiddleware);

router.get('/', ctrl.mesPromotions);
router.post('/', validate(creerPromotionVendeurSchema), ctrl.creer);
router.put('/:id', validate(modifierPromotionVendeurSchema), ctrl.modifier);
router.delete('/:id', ctrl.supprimer);

module.exports = router;
