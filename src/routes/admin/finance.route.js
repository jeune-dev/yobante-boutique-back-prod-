// ─────────────────────────────────────────────────────────────
// routes/admin/finance.route.js   — Préfixe : /api/v1/admin/finance
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/admin/finance.controller');
const adminMiddleware = require('../../middlewares/admin.middleware');
const { NotFoundError } = require('../../errors/AppError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.param('id', (_req, _res, next, id) =>
  UUID.test(id) ? next() : next(new NotFoundError('Ressource introuvable'))
);

// Lectures : `debut` et `fin` (AAAA-MM-JJ) bornent la période ; sans elles,
// totaux historiques.
router.get('/synthese', adminMiddleware, ctrl.getSynthese);
router.get('/comptes-vendeurs', adminMiddleware, ctrl.getComptesVendeurs);
router.get('/reversements', adminMiddleware, ctrl.listerReversements);

router.post('/reversements', adminMiddleware, ctrl.creerReversement);
router.patch('/reversements/:id/statut', adminMiddleware, ctrl.changerStatutReversement);
router.patch('/vendeurs/:id/taux-commission', adminMiddleware, ctrl.definirTauxCommission);

module.exports = router;
