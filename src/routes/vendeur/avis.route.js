// ─────────────────────────────────────────────────────────────
// routes/vendeur/avis.route.js   — Préfixe : /api/v1/vendeur/avis
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/vendeur/avis.controller');
const vendeurMiddleware = require('../../middlewares/vendeur.middleware');
const validate = require('../../middlewares/validate.middleware');
const { reponseAvisSchema } = require('../../validations/avis.validation');

router.use(vendeurMiddleware);

router.get('/', ctrl.getMesAvisRecus);
router.post('/:id/repondre', validate(reponseAvisSchema), ctrl.repondre);

module.exports = router;
