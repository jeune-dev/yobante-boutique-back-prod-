// ─────────────────────────────────────────────────────────────
// controllers/admin/analytique.controller.js — Indicateurs du dashboard
// ─────────────────────────────────────────────────────────────
const AnalytiqueService = require('../../services/admin/analytique.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.getKpiAccueil = asyncHandler(async (req, res) => {
  const r = await AnalytiqueService.getKpiAccueil(req.query);
  return ok(res, { kpi: r.kpi, periode: r.periode }, "Indicateurs d'accueil");
});

exports.getAlertes = asyncHandler(async (req, res) => {
  const r = await AnalytiqueService.getAlertes(req.query);
  return ok(
    res,
    { alertes: r.alertes, synthese: r.synthese, indisponibles: r.indisponibles },
    'Points à surveiller'
  );
});

exports.getCaParRayon = asyncHandler(async (req, res) => {
  const r = await AnalytiqueService.getCaParRayon(req.query);
  return ok(res, { total: r.total, rayons: r.rayons }, 'CA par rayon');
});

exports.getTopProduits = asyncHandler(async (req, res) => {
  const r = await AnalytiqueService.getTopProduits(req.query);
  return ok(res, { produits: r.produits }, 'Meilleures ventes');
});

exports.getIndicateursClients = asyncHandler(async (req, res) => {
  const r = await AnalytiqueService.getIndicateursClients(req.query);
  return ok(res, { clients: r.clients, periode: r.periode }, 'Indicateurs clients');
});

exports.getIndicateursStock = asyncHandler(async (req, res) => {
  const r = await AnalytiqueService.getIndicateursStock(req.query);
  return ok(
    res,
    { synthese: r.synthese, produits: r.produits, fenetreJours: r.fenetreJours },
    'Indicateurs de stock'
  );
});

exports.getIndicateursLivraison = asyncHandler(async (req, res) => {
  const r = await AnalytiqueService.getIndicateursLivraison(req.query);
  return ok(
    res,
    { instantT: r.instantT, surLaPeriode: r.surLaPeriode, periode: r.periode },
    'Indicateurs de livraison'
  );
});

exports.getTableauVendeurs = asyncHandler(async (req, res) => {
  const r = await AnalytiqueService.getTableauVendeurs(req.query);
  return ok(res, { vendeurs: r.vendeurs, periode: r.periode }, 'Tableau des vendeurs');
});
