const BanniereService = require('../../services/admin/banniere.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');

exports.getAll = asyncHandler(async (req, res) => {
  const result = await BanniereService.getAll();
  return ok(res, { bannieres: result.bannieres }, 'Liste des bannières');
});

exports.create = asyncHandler(async (req, res) => {
  const result = await BanniereService.create(req.body, req.file);
  if (!result.success) throw new BadRequestError(result.message);
  return created(res, { banniere: result.banniere }, result.message);
});

exports.update = asyncHandler(async (req, res) => {
  const result = await BanniereService.update(req.params.id, req.body, req.file);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { banniere: result.banniere }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await BanniereService.remove(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, {}, result.message);
});

exports.toggleActive = asyncHandler(async (req, res) => {
  const result = await BanniereService.toggleActive(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { banniere: result.banniere }, 'Statut mis à jour');
});

exports.reordonner = asyncHandler(async (req, res) => {
  const result = await BanniereService.reordonner(req.body.ordres || req.body.elements);
  return ok(res, {}, result.message);
});

exports.ajouterProduit = asyncHandler(async (req, res) => {
  const result = await BanniereService.ajouterProduit(req.params.id, req.body);
  if (!result.success) throw new BadRequestError(result.message);
  return created(res, { item: result.item }, result.message);
});

exports.retirerProduit = asyncHandler(async (req, res) => {
  const result = await BanniereService.retirerProduit(req.params.id, req.params.produitId);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, {}, result.message);
});
