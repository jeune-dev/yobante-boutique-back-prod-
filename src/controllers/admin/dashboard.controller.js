// ─────────────────────────────────────────────────────────────
// controllers/admin/dashboard.controller.js
// ─────────────────────────────────────────────────────────────
const DashboardService = require('../../services/admin/dashboard.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.getStats = asyncHandler(async (req, res) => {
  const result = await DashboardService.getStatsGlobales();
  return ok(
    res,
    {
      totalClients: result.totalClients,
      totalVendeurs: result.totalVendeurs,
      totalCategories: result.totalCategories,
      totalProduits: result.totalProduits,
      totalCommandes: result.totalCommandes,
      chiffreAffaires: result.chiffreAffaires,
    },
    'Statistiques récupérées'
  );
});

exports.getOverview = asyncHandler(async (req, res) => {
  const [stats, kpiResult, topProduitsResult, clientsActifsResult] = await Promise.all([
    DashboardService.getStatsGlobales(),
    DashboardService.getKpiStocks(),
    DashboardService.getProduitsPlusVendus(5),
    DashboardService.getClientsActifs(5),
  ]);
  return ok(
    res,
    {
      totalClients: stats.totalClients,
      totalVendeurs: stats.totalVendeurs,
      totalCategories: stats.totalCategories,
      totalProduits: stats.totalProduits,
      totalCommandes: stats.totalCommandes,
      chiffreAffaires: stats.chiffreAffaires,
      produitsEnAttente: kpiResult.kpi.produitsEnAttente,
      produitsEnRupture: kpiResult.kpi.produitsEnRupture,
      stockFaible: kpiResult.kpi.stockFaible,
      topProduits: topProduitsResult.produits,
      clientsActifs: clientsActifsResult.clients,
    },
    "Vue d'ensemble récupérée"
  );
});

exports.getCommandesParStatut = asyncHandler(async (req, res) => {
  const result = await DashboardService.getCommandesParStatut();
  return ok(res, { stats: result.stats }, 'Répartition des commandes récupérée');
});

exports.getRevenus = asyncHandler(async (req, res) => {
  const annee = req.query.annee ? Number(req.query.annee) : undefined;
  const result = await DashboardService.getRevenusParMois(annee);
  return ok(res, { revenus: result.revenus }, 'Revenus récupérés');
});

exports.getProduitsPlusVendus = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const result = await DashboardService.getProduitsPlusVendus(limit);
  return ok(res, { produits: result.produits }, 'Produits les plus vendus récupérés');
});

exports.getClientsActifs = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const result = await DashboardService.getClientsActifs(limit);
  return ok(res, { clients: result.clients }, 'Clients les plus actifs récupérés');
});

exports.getCommandesRecentes = asyncHandler(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 10;
  const result = await DashboardService.getCommandesRecentes(limit);
  return ok(res, { commandes: result.commandes }, 'Commandes récentes récupérées');
});

exports.getStockAlertes = asyncHandler(async (req, res) => {
  const seuil = req.query.seuil ? Number(req.query.seuil) : 5;
  const result = await DashboardService.getStockAlertes(seuil);
  return ok(res, { produits: result.produits }, 'Alertes stock récupérées');
});

exports.getKpiStocks = asyncHandler(async (req, res) => {
  const result = await DashboardService.getKpiStocks();
  return ok(res, { kpi: result.kpi, produitsRupture: result.produitsRupture }, 'KPI stocks');
});

exports.getStatsVendeurs = asyncHandler(async (req, res) => {
  const result = await DashboardService.getStatsVendeurs();
  return ok(res, { stats: result.stats }, 'Stats vendeurs');
});

exports.getKpiComplet = asyncHandler(async (req, res) => {
  // `periode`, `debut` et `fin` ne pilotent que les KPI de ventes ; les
  // totaux globaux et les stocks restent à l'instant présent.
  const result = await DashboardService.getKpiComplet(req.query);
  return ok(res, result, 'KPI complet');
});

exports.getKpiVentes = asyncHandler(async (req, res) => {
  const result = await DashboardService.getKpiVentes(req.query);
  return ok(res, { kpi: result.kpi, periode: result.periode }, 'KPI de ventes');
});

exports.getInscriptions = asyncHandler(async (req, res) => {
  const result = await DashboardService.getInscriptionsParPeriode(req.query);
  return ok(
    res,
    { pas: result.pas, inscriptions: result.inscriptions },
    'Inscriptions par période'
  );
});
