// ─────────────────────────────────────────────────────────────
// controllers/admin/commande.controller.js
// ─────────────────────────────────────────────────────────────
const GestionCommandeService = require('../../services/admin/commande.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.getAllCommandes(req.query);
  return ok(
    res,
    { commandes: result.commandes, pagination: result.pagination },
    'Commandes récupérées'
  );
});

exports.exportCsv = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.exportCommandes(req.query);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="commandes-${Date.now()}.csv"`);
  return res.status(200).send(result.csv);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.getCommandeById(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { commande: result.commande }, 'Commande récupérée');
});

exports.valider = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.validerCommande(req.params.id, req.body.noteAdmin);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { commande: result.commande }, result.message);
});

exports.rejeter = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.rejeterCommande(req.params.id, req.body.raison);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { commande: result.commande }, result.message);
});

exports.mettreEnPreparation = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.mettreEnPreparation(req.params.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { commande: result.commande }, result.message);
});

exports.marquerExpediee = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.marquerExpediee(req.params.id, req.body.trackingInfo);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { commande: result.commande }, result.message);
});

exports.marquerLivree = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.marquerLivree(req.params.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { commande: result.commande }, result.message);
});

exports.getKpi = asyncHandler(async (req, res) => {
  const result = await GestionCommandeService.getKpiCommandes();
  return ok(res, result.kpi, 'KPI commandes');
});
exports.creer = asyncHandler(async (req, res) => { const GestionCommandeService = require("../../services/admin/commande.service"); const { ok } = require("../../utils/response"); const { BadRequestError } = require("../../errors/AppError"); const { userId, adresseId, note, methode, items, dateLivraisonSouhaitee } = req.body; const result = await GestionCommandeService.creerCommandeAdmin(userId, { adresseId, note, methode, items, dateLivraisonSouhaitee }); if (!result.success) throw new BadRequestError(result.message); return ok(res, { commandeId: result.commandeId }, result.message); });
