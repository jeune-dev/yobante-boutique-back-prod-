// ─────────────────────────────────────────────────────────────
// routes/admin/index.js   — Préfixe : /api/admin
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const sessionCtrl = require('../../controllers/admin/session.controller');

// Session du dashboard : le front l'appelle à chaque ouverture pour vérifier,
// côté serveur, que le jeton stocké appartient bien à un administrateur actif
// (la chaîne auth → motDePasseChange → adminMiddleware de app.js s'applique).
router.get('/me', sessionCtrl.me);

router.use('/auth', require('./auth.route'));
router.use('/categories', require('./categorie.route'));
router.use('/produits', require('./produit.route'));
router.use('/commandes', require('./commande.route'));
router.use('/paiements', require('./paiement.route'));
router.use('/avis', require('./avis.route'));
router.use('/dashboard', require('./dashboard.route'));
router.use('/users', require('./user.route'));
router.use('/vendeurs', require('./vendeur.route'));
router.use('/bannieres', require('./banniere.route'));
router.use('/promotions', require('./promotion.route'));
router.use('/blocs-promo', require('./blocPromo.route'));
router.use('/frais-livraison', require('./frais-livraison.route'));
router.use('/rayons', require('./rayon.route'));
router.use('/signalements', require('./signalement.route'));

module.exports = router;
