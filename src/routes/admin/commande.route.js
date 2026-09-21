// ─────────────────────────────────────────────────────────────
// routes/admin/commande.route.js   — Préfixe : /api/admin/commandes
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/admin/commande.controller');
const adminMiddleware = require('../../middlewares/admin.middleware');
const validate = require('../../middlewares/validate.middleware');
const { rejeterCommandeSchema } = require('../../validations/commande.validation');

router.get('/kpi', adminMiddleware, ctrl.getKpi);
router.get('/', adminMiddleware, ctrl.getAll);
router.get('/export', adminMiddleware, ctrl.exportCsv);
router.get('/:id', adminMiddleware, ctrl.getOne);
router.patch('/:id/valider', adminMiddleware, ctrl.valider);
router.patch('/:id/rejeter', adminMiddleware, validate(rejeterCommandeSchema), ctrl.rejeter);
router.patch('/:id/preparation', adminMiddleware, ctrl.mettreEnPreparation);
router.patch('/:id/expedier', adminMiddleware, ctrl.marquerExpediee);
router.patch('/:id/livrer', adminMiddleware, ctrl.marquerLivree);
router.post('/', adminMiddleware, ctrl.creer);

module.exports = router;
