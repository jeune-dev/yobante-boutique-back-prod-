// ─────────────────────────────────────────────────────────────
// routes/client/signalement.route.js — Préfixe : /api/v1/signalements
// Signalement d'un produit ou d'une boutique depuis l'application mobile.
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/client/signalement.controller');
const auth = require('../../middlewares/auth.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { creerSignalementSchema } = require('../../validations/signalement.validation');

router.use(auth, checkActiveUser);

router.post('/', validate(creerSignalementSchema), ctrl.creer);
router.get('/mes-signalements', ctrl.mesSignalements);

module.exports = router;
