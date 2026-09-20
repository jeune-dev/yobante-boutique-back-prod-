const FavoriClientService = require('../../services/client/favori.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError } = require('../../errors/AppError');

exports.mesFavoris = asyncHandler(async (req, res) => {
  const result = await FavoriClientService.mesFavoris(req.user.id);
  // Tableau renvoyé directement dans `data` (format attendu par l'app mobile).
  return ok(res, { boutiques: result.boutiques }, 'Mes favoris');
});

exports.ajouter = asyncHandler(async (req, res) => {
  const result = await FavoriClientService.ajouter(req.user.id, req.body.boutiqueId);
  if (!result.success) throw new BadRequestError(result.message);
  return created(res, {}, result.message);
});

exports.supprimer = asyncHandler(async (req, res) => {
  const result = await FavoriClientService.supprimer(req.user.id, req.params.boutiqueId);
  return ok(res, {}, result.message);
});
