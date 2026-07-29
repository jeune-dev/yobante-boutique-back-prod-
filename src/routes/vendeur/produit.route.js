const router = require('express').Router();
const vendeurMiddleware = require('../../middlewares/vendeur.middleware');
const upload = require('../../middlewares/upload.middleware');
const uploadHandler = require('../../middlewares/uploadHandler');
const ctrl = require('../../controllers/vendeur/produit.controller');

router.use(vendeurMiddleware);

router.get('/stats', ctrl.getStats);
router.get('/', ctrl.getMesProduits);
router.post('/', uploadHandler.multipleFiles(upload.array('images', 5), 5), ctrl.soumettre);
router.get('/:id', ctrl.getOne);
router.put('/:id', uploadHandler.multipleFiles(upload.array('images', 5), 5), ctrl.update);
router.patch('/:id/stock', ctrl.updateStock);
router.delete('/:id', ctrl.supprimer);

module.exports = router;
