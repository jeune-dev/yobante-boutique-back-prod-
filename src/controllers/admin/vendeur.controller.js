const GestionVendeurService = require('../../services/admin/vendeur.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');

exports.creerVendeur = asyncHandler(async (req, res) => {
  const result = await GestionVendeurService.creerVendeur(req.body);
  if (!result.success) throw new BadRequestError(result.message);
  return created(res, { vendeur: result.vendeur, emailEnvoye: result.emailEnvoye }, result.message);
});

exports.listerVendeurs = asyncHandler(async (req, res) => {
  const result = await GestionVendeurService.listerVendeurs(req.query);
  return ok(res, result, 'Liste des vendeurs');
});

exports.getVendeur = asyncHandler(async (req, res) => {
  const result = await GestionVendeurService.getVendeur(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { vendeur: result.vendeur }, 'Vendeur');
});

exports.getStatut = asyncHandler(async (req, res) => {
  const result = await GestionVendeurService.getStatut(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { statut: result.statut, isBlocked: result.isBlocked }, result.message);
});

exports.bloquerVendeur = asyncHandler(async (req, res) => {
  const result = await GestionVendeurService.bloquerVendeur(req.params.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { statut: result.statut, isBlocked: result.isBlocked }, result.message);
});

exports.debloquerVendeur = asyncHandler(async (req, res) => {
  const result = await GestionVendeurService.debloquerVendeur(req.params.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { statut: result.statut, isBlocked: result.isBlocked }, result.message);
});

exports.renvoyerIdentifiants = asyncHandler(async (req, res) => {
  const result = await GestionVendeurService.renvoyerIdentifiants(req.params.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, result, result.message);
});

exports.updateProfil = asyncHandler(async (req, res) => {
  const result = await GestionVendeurService.updateProfil(req.params.id, req.body);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { vendeur: result.vendeur }, result.message);
});
