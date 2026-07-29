// ─────────────────────────────────────────────────────────────
// routes/client/paiement.route.js   — Préfixe : /api/v1/paiements
//
// Routes publiques : elles sont appelées par le fournisseur de paiement, pas
// par l'application. L'authentification repose sur la signature du callback.
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/client/paiement.controller');
const asyncHandler = require('../../utils/asyncHandler');

// Callback génériques pour tous les fournisseurs (Wave, Orange Money, etc.)
router.post('/callback', ctrl.callback);

// URLs de retour après paiement (redirige l'utilisateur au mobile app)
router.get(
  '/wave/return/:reference',
  asyncHandler((req, res) => {
    const { reference } = req.params;
    const returnUrl = process.env.MOBILE_APP_RETURN_URL || 'yobante://paiement/succes';
    res.redirect(`${returnUrl}?reference=${reference}`);
  })
);

router.get(
  '/orange/return/:reference',
  asyncHandler((req, res) => {
    const { reference } = req.params;
    const returnUrl = process.env.MOBILE_APP_RETURN_URL || 'yobante://paiement/succes';
    res.redirect(`${returnUrl}?reference=${reference}`);
  })
);

module.exports = router;
