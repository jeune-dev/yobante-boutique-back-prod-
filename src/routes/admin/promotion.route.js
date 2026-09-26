const router = require('express').Router();
const adminMiddleware = require('../../middlewares/admin.middleware');
const ctrl = require('../../controllers/admin/promotion.controller');
const validate = require('../../middlewares/validate.middleware');
const { creerPromotionProduitSchema } = require('../../validations/promotion.validation');

router.use(adminMiddleware);

router.get('/sections', ctrl.getParSection);
// Déclaré avant '/:id' pour ne pas être pris pour un identifiant.
router.post('/reordonner', ctrl.reordonner);
router.get('/', ctrl.getAll);
router.post('/', ctrl.create);
router.get('/:id', ctrl.getById);
router.put('/:id', ctrl.update);
router.delete('/:id', ctrl.remove);
router.patch('/:id/toggle', ctrl.toggleActive);
router.post('/produit/:produitId', validate(creerPromotionProduitSchema), ctrl.creer);

module.exports = router;
