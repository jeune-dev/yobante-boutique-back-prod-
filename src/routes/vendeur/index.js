// ─────────────────────────────────────────────────────────────
// routes/vendeur/index.js   — Préfixe : /api/vendeur
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();

router.use('/produits', require('./produit.route'));
router.use('/commandes', require('./commande.route'));
router.use('/profil', require('./profil.route'));
router.use('/avis', require('./avis.route'));

module.exports = router;
