const router = require('express').Router();
const vendeurMiddleware = require('../../middlewares/vendeur.middleware');
const upload = require('../../middlewares/upload.middleware');
const uploadHandler = require('../../middlewares/uploadHandler');
const ctrl = require('../../controllers/vendeur/profil.controller');

router.use(vendeurMiddleware);

router.get('/', ctrl.getProfil);
router.put('/', ctrl.updateProfil);
router.put('/logo', uploadHandler.singleFile(upload.single('logo'), 5), ctrl.updateLogo);

module.exports = router;
