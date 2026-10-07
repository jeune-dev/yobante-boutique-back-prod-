// ─────────────────────────────────────────────────────────────
// routes/admin/retour.route.js   — Préfixe : /api/v1/admin/retours
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/admin/retour.controller');
const adminMiddleware = require('../../middlewares/admin.middleware');
const validate = require('../../middlewares/validate.middleware');
const { creerRetourSchema, traiterRetourSchema } = require('../../validations/retour.validation');
const { NotFoundError } = require('../../errors/AppError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Même garde que les commandes : un identifiant qui n'est pas un UUID ne peut
// désigner aucun retour, autant répondre 404 qu'échouer en 500 côté SQL.
router.param('id', (_req, _res, next, id) =>
  UUID.test(id) ? next() : next(new NotFoundError('Retour introuvable'))
);

// `/kpi` avant `/:id` : sinon « kpi » serait interprété comme un identifiant.
router.get('/kpi', adminMiddleware, ctrl.getKpi);
router.get('/', adminMiddleware, ctrl.getAll);
router.post('/', adminMiddleware, validate(creerRetourSchema), ctrl.creer);
router.patch('/:id', adminMiddleware, validate(traiterRetourSchema), ctrl.traiter);

module.exports = router;
