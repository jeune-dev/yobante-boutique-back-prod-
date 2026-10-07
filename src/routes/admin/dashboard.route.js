// ─────────────────────────────────────────────────────────────
// routes/admin/dashboard.route.js   — Préfixe : /api/admin/dashboard
// ─────────────────────────────────────────────────────────────
const router = require('express').Router();
const ctrl = require('../../controllers/admin/dashboard.controller');
const adminMiddleware = require('../../middlewares/admin.middleware');

router.get('/stats', adminMiddleware, ctrl.getStats);
router.get('/overview', adminMiddleware, ctrl.getOverview);
router.get('/commandes-statut', adminMiddleware, ctrl.getCommandesParStatut);
router.get('/revenus', adminMiddleware, ctrl.getRevenus);
router.get('/top-produits', adminMiddleware, ctrl.getProduitsPlusVendus);
router.get('/clients-actifs', adminMiddleware, ctrl.getClientsActifs);
router.get('/commandes-recentes', adminMiddleware, ctrl.getCommandesRecentes);
router.get('/stock-alertes', adminMiddleware, ctrl.getStockAlertes);
router.get('/kpi-stocks', adminMiddleware, ctrl.getKpiStocks);
router.get('/stats-vendeurs', adminMiddleware, ctrl.getStatsVendeurs);
router.get('/kpi-complet', adminMiddleware, ctrl.getKpiComplet);
router.get('/kpi-ventes', adminMiddleware, ctrl.getKpiVentes);
router.get('/inscriptions', adminMiddleware, ctrl.getInscriptions);

module.exports = router;
