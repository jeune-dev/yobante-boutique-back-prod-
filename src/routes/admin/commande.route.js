// ─────────────────────────────────────────────────────────────
// routes/admin/commande.route.js   — Préfixe : /api/admin/commandes
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/admin/commande.controller');
const adminMiddleware = require('../../middlewares/admin.middleware');
const validate = require('../../middlewares/validate.middleware');
const {
  rejeterCommandeSchema,
  creerCommandeAdminSchema,
} = require('../../validations/commande.validation');
const { NotFoundError } = require('../../errors/AppError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Un identifiant qui n'est pas un UUID (ex. « nouveau ») ne peut désigner
// aucune commande : 404 immédiat, au lieu d'une erreur SQL remontée en 500.
router.param('id', (_req, _res, next, id) =>
  UUID.test(id) ? next() : next(new NotFoundError('Commande introuvable'))
);

router.get('/kpi', adminMiddleware, ctrl.getKpi);
router.get('/', adminMiddleware, ctrl.getAll);
router.get('/export', adminMiddleware, ctrl.exportCsv);
router.get('/:id', adminMiddleware, ctrl.getOne);
router.patch('/:id/valider', adminMiddleware, ctrl.valider);
router.patch('/:id/rejeter', adminMiddleware, validate(rejeterCommandeSchema), ctrl.rejeter);
router.patch('/:id/preparation', adminMiddleware, ctrl.mettreEnPreparation);
router.patch('/:id/expedier', adminMiddleware, ctrl.marquerExpediee);
router.patch('/:id/livrer', adminMiddleware, ctrl.marquerLivree);
router.post('/', adminMiddleware, validate(creerCommandeAdminSchema), ctrl.creer);

module.exports = router;
