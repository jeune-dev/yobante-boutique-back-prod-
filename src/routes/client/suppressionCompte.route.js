// ─────────────────────────────────────────────────────────────
// routes/client/suppressionCompte.route.js — Préfixe : /api/v1/suppression-compte
// Route publique (sans authentification) — formulaire admin.yobanterek.com/suppression-compte
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/client/suppressionCompte.controller');
const validate = require('../../middlewares/validate.middleware');
const {
  demandeSuppressionCompteSchema,
} = require('../../validations/suppressionCompte.validation');

router.post('/', validate(demandeSuppressionCompteSchema), ctrl.creer);

module.exports = router;
