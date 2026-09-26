// ─────────────────────────────────────────────────────────────
// routes/client/commande.route.js   — Préfixe : /api/commandes
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/client/commande.controller');
const paiementCtrl = require('../../controllers/client/paiement.controller');
const auth = require('../../middlewares/auth.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { passerCommandeSchema } = require('../../validations/commande.validation');

router.use(auth, checkActiveUser);

router.get('/', ctrl.getMes);
router.post('/', validate(passerCommandeSchema), ctrl.passer);
router.get('/:id', ctrl.getOne);
router.patch('/:id/annuler', ctrl.annuler);

// Valider / rejeter une commande : réservé à l'admin, via
// /api/v1/admin/commandes/:id/{valider,rejeter} (adminMiddleware).

// Paiement de la commande
router.post('/:id/payer', paiementCtrl.payer);
router.get('/:id/paiement', paiementCtrl.statut);

module.exports = router;
