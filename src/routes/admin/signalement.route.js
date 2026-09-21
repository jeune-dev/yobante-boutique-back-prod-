// ─────────────────────────────────────────────────────────────
// routes/admin/signalement.route.js — Préfixe : /api/v1/admin/signalements
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/admin/signalement.controller');
const adminMiddleware = require('../../middlewares/admin.middleware');
const validate = require('../../middlewares/validate.middleware');
const { traiterSignalementSchema } = require('../../validations/signalement.validation');

router.use(adminMiddleware);

router.get('/', ctrl.getAll);
router.patch('/:id', validate(traiterSignalementSchema), ctrl.traiter);

module.exports = router;
