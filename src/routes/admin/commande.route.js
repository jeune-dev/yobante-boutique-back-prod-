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
  annulerCommandeSchema,
  modifierCommandeSchema,
  marquerRuptureSchema,
  changerStatutSchema,
} = require('../../validations/commande.validation');
const { NotFoundError } = require('../../errors/AppError');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Un identifiant qui n'est pas un UUID (ex. « nouveau ») ne peut désigner
// aucune commande : 404 immédiat, au lieu d'une erreur SQL remontée en 500.
router.param('id', (_req, _res, next, id) =>
  UUID.test(id) ? next() : next(new NotFoundError('Commande introuvable'))
);

router.get('/kpi', adminMiddleware, ctrl.getKpi);
// Avant `/:id` : « fiabilite-vendeurs » n'est pas un identifiant de commande.
router.get('/fiabilite-vendeurs', adminMiddleware, ctrl.getFiabiliteVendeurs);
// `:userId` et non `:id` : le garde UUID ci-dessus ne s'applique qu'à `id`, et
// ce segment désigne un client, pas une commande.
router.get('/client/:userId', adminMiddleware, ctrl.getParClient);
router.get('/', adminMiddleware, ctrl.getAll);
router.get('/export', adminMiddleware, ctrl.exportCsv);
router.get('/:id', adminMiddleware, ctrl.getOne);
router.patch('/:id/valider', adminMiddleware, ctrl.valider);
// Changement de statut depuis la fiche commande (client notifié).
router.patch('/:id/statut', adminMiddleware, validate(changerStatutSchema), ctrl.changerStatut);
router.patch('/:id/rejeter', adminMiddleware, validate(rejeterCommandeSchema), ctrl.rejeter);
router.patch('/:id/preparation', adminMiddleware, ctrl.mettreEnPreparation);
router.patch('/:id/expedier', adminMiddleware, ctrl.marquerExpediee);
router.patch('/:id/livrer', adminMiddleware, ctrl.marquerLivree);
router.patch('/:id/annuler', adminMiddleware, validate(annulerCommandeSchema), ctrl.annuler);
router.patch('/:id/modifier', adminMiddleware, validate(modifierCommandeSchema), ctrl.modifier);
// Produits en rupture de stock (après refus du vendeur) : le client est notifié.
router.patch('/:id/rupture', adminMiddleware, validate(marquerRuptureSchema), ctrl.marquerRupture);
router.post('/', adminMiddleware, validate(creerCommandeAdminSchema), ctrl.creer);

module.exports = router;
