// ─────────────────────────────────────────────────────────────
// routes/admin/produit.route.js   — Préfixe : /api/admin/produits
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/admin/produit.controller');
const adminMiddleware = require('../../middlewares/admin.middleware');
const upload = require('../../middlewares/upload.middleware');
const uploadHandler = require('../../middlewares/uploadHandler');
const validate = require('../../middlewares/validate.middleware');
const {
  createProduitSchema,
  updateProduitSchema,
  updateStockSchema,
} = require('../../validations/produit.validation');

router.get('/', adminMiddleware, ctrl.getAll);
router.post(
  '/',
  adminMiddleware,
  uploadHandler.multipleFiles(upload.array('images', 5), 5),
  validate(createProduitSchema),
  ctrl.create
);
router.get('/:id', adminMiddleware, ctrl.getOne);
router.put(
  '/:id',
  adminMiddleware,
  uploadHandler.multipleFiles(upload.array('images', 5), 5),
  validate(updateProduitSchema),
  ctrl.update
);
router.delete('/:id', adminMiddleware, ctrl.remove);
router.patch('/:id/stock', adminMiddleware, validate(updateStockSchema), ctrl.updateStock);
router.patch('/:id/featured', adminMiddleware, ctrl.toggleFeatured);
router.patch('/:id/visibilite', adminMiddleware, ctrl.toggleVisibilite);
router.get('/validation/liste', adminMiddleware, ctrl.getAValider);
router.patch('/:id/valider-step1', adminMiddleware, ctrl.validerStep1);
router.patch('/:id/valider-step2', adminMiddleware, ctrl.validerStep2);
router.patch('/:id/rejeter', adminMiddleware, ctrl.rejeter);

module.exports = router;
