const router = require('express').Router();
const adminMiddleware = require('../../middlewares/admin.middleware');
const upload = require('../../middlewares/upload.middleware');
const uploadHandler = require('../../middlewares/uploadHandler');
const ctrl = require('../../controllers/admin/banniere.controller');

router.use(adminMiddleware);

router.get('/', ctrl.getAll);
router.post('/', uploadHandler.singleFile(upload.single('image'), 5), ctrl.create);
router.put('/:id', uploadHandler.singleFile(upload.single('image'), 5), ctrl.update);
router.delete('/:id', ctrl.remove);
router.patch('/:id/toggle', ctrl.toggleActive);
router.post('/reordonner', ctrl.reordonner);
router.post('/:id/produits', ctrl.ajouterProduit);
router.delete('/:id/produits/:produitId', ctrl.retirerProduit);

module.exports = router;
