// ─────────────────────────────────────────────────────────────
// controllers/admin/retour.controller.js — Retours produits
// ─────────────────────────────────────────────────────────────
const RetourService = require('../../services/admin/retour.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');

exports.getKpi = asyncHandler(async (req, res) => {
  const result = await RetourService.getKpiRetours(req.query);
  return ok(res, { kpi: result.kpi, parMotif: result.parMotif }, 'KPI des retours');
});

exports.getAll = asyncHandler(async (req, res) => {
  const result = await RetourService.listerRetours(req.query);
  return ok(res, { retours: result.retours, pagination: result.pagination }, 'Retours récupérés');
});

exports.creer = asyncHandler(async (req, res) => {
  const result = await RetourService.creerRetour({ ...req.body, adminId: req.user?.id });
  if (!result.success) {
    // « introuvable » est la seule famille d'erreurs du service qui n'est pas
    // une faute de saisie : elle doit ressortir en 404, pas en 400.
    if (/introuvable/i.test(result.message)) throw new NotFoundError(result.message);
    throw new BadRequestError(result.message);
  }
  return created(res, { retour: result.retour }, result.message);
});

exports.traiter = asyncHandler(async (req, res) => {
  const result = await RetourService.traiterRetour(req.params.id, {
    ...req.body,
    adminId: req.user?.id,
  });
  if (!result.success) {
    if (/introuvable/i.test(result.message)) throw new NotFoundError(result.message);
    throw new BadRequestError(result.message);
  }
  return ok(res, { retour: result.retour }, result.message);
});
