const router = require('express').Router();
const vendeurMiddleware = require('../../middlewares/vendeur.middleware');
const ctrl = require('../../controllers/vendeur/commande.controller');

router.use(vendeurMiddleware);

router.get('/ventes', ctrl.getVentes);
// Avant `/:id` : « acceptation » n'est pas un identifiant de commande.
router.get('/acceptation', ctrl.getTauxAcceptation);
router.get('/', ctrl.getMesCommandes);
router.get('/:id', ctrl.getOne);
router.patch('/:id/accepter', ctrl.accepter);
router.patch('/:id/refuser', ctrl.refuser);

module.exports = router;
