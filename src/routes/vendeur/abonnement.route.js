// ─────────────────────────────────────────────────────────────
// routes/vendeur/abonnement.route.js — Préfixe : /api/v1/vendeur/abonnement
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/vendeur/abonnement.controller');
const vendeurMiddleware = require('../../middlewares/vendeur.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  payerAbonnementSchema,
  renouvelerAbonnementSchema,
} = require('../../validations/abonnement.validation');

router.use(vendeurMiddleware);

router.get('/', ctrl.monAbonnement);
router.post('/payer', validate(payerAbonnementSchema), ctrl.payer);
router.post('/renouveler', validate(renouvelerAbonnementSchema), ctrl.payer);
router.get('/paiements', ctrl.historiquePaiements);
router.get('/paiements/:id', ctrl.getPaiement);

module.exports = router;
