// ─────────────────────────────────────────────────────────────
// routes/client/message.route.js — Préfixe : /api/v1/messages
// Messagerie 1:1 acheteur ↔ vendeur (authentification requise)
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/client/message.controller');
const auth = require('../../middlewares/auth.middleware');
const checkActiveUser = require('../../middlewares/checkActiveUser.middleware');
const validate = require('../../middlewares/validate.middleware');
const { envoyerMessageSchema } = require('../../validations/message.validation');

router.use(auth, checkActiveUser);

router.post('/', validate(envoyerMessageSchema), ctrl.envoyer);
router.get('/conversations', ctrl.conversations);
router.get('/non-lus', ctrl.nombreNonLus);
router.get('/:userId', ctrl.historique);
router.put('/:messageId/lire', ctrl.marquerLu);

module.exports = router;
