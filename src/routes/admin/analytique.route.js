// ─────────────────────────────────────────────────────────────
// routes/admin/analytique.route.js   — Préfixe : /api/v1/admin/analytique
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/admin/analytique.controller');
const adminMiddleware = require('../../middlewares/admin.middleware');

// Toutes ces routes acceptent `debut` et `fin` (AAAA-MM-JJ) ; sans bornes,
// elles renvoient les totaux historiques.
router.get('/accueil', adminMiddleware, ctrl.getKpiAccueil);
router.get('/alertes', adminMiddleware, ctrl.getAlertes);
router.get('/ca-par-rayon', adminMiddleware, ctrl.getCaParRayon);
router.get('/top-produits', adminMiddleware, ctrl.getTopProduits);
router.get('/clients', adminMiddleware, ctrl.getIndicateursClients);
router.get('/stock', adminMiddleware, ctrl.getIndicateursStock);
router.get('/livraison', adminMiddleware, ctrl.getIndicateursLivraison);
router.get('/vendeurs', adminMiddleware, ctrl.getTableauVendeurs);

module.exports = router;
