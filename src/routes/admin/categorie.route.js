// ─────────────────────────────────────────────────────────────
// routes/admin/categorie.route.js   — Préfixe : /api/admin/categories
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/admin/categorie.controller');
const adminMiddleware = require('../../middlewares/admin.middleware');
const upload = require('../../middlewares/upload.middleware');
const uploadHandler = require('../../middlewares/uploadHandler');
const validate = require('../../middlewares/validate.middleware');
const {
  createCategorieSchema,
  updateCategorieSchema,
} = require('../../validations/categorie.validation');

router.get('/', adminMiddleware, ctrl.getAll);
router.post(
  '/',
  adminMiddleware,
  uploadHandler.singleFile(upload.single('image'), 5),
  validate(createCategorieSchema),
  ctrl.create
);
router.get('/:id', adminMiddleware, ctrl.getOne);
router.put(
  '/:id',
  adminMiddleware,
  uploadHandler.singleFile(upload.single('image'), 5),
  validate(updateCategorieSchema),
  ctrl.update
);
router.delete('/:id', adminMiddleware, ctrl.remove);

module.exports = router;
