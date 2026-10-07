// ─────────────────────────────────────────────────────────────
// controllers/admin/finance.controller.js — Commissions et reversements
// ─────────────────────────────────────────────────────────────
const FinanceService = require('../../services/admin/finance.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');

const remonter = (result) => {
  if (result.status === 404) throw new NotFoundError(result.message);
  throw new BadRequestError(result.message);
};

exports.getSynthese = asyncHandler(async (req, res) => {
  const r = await FinanceService.getSynthese(req.query);
  return ok(res, { synthese: r.synthese, periode: r.periode }, 'Synthèse financière');
});

exports.getComptesVendeurs = asyncHandler(async (req, res) => {
  const r = await FinanceService.getComptesVendeurs(req.query);
  return ok(res, { comptes: r.comptes, periode: r.periode }, 'Comptes vendeurs');
});

exports.listerReversements = asyncHandler(async (req, res) => {
  const r = await FinanceService.listerReversements(req.query);
  return ok(res, { reversements: r.reversements, pagination: r.pagination }, 'Reversements');
});

exports.creerReversement = asyncHandler(async (req, res) => {
  const r = await FinanceService.creerReversement({ ...req.body, adminId: req.user?.id });
  if (!r.success) remonter(r);
  return created(res, { reversement: r.reversement }, r.message);
});

exports.changerStatutReversement = asyncHandler(async (req, res) => {
  const r = await FinanceService.changerStatutReversement(req.params.id, {
    statut: req.body.statut,
    adminId: req.user?.id,
  });
  if (!r.success) remonter(r);
  return ok(res, { reversement: r.reversement }, r.message);
});

exports.definirTauxCommission = asyncHandler(async (req, res) => {
  const r = await FinanceService.definirTauxCommission(req.params.id, req.body.taux);
  if (!r.success) remonter(r);
  return ok(res, { tauxCommission: r.tauxCommission }, r.message);
});
