const BanniereClientService = require('../../services/client/banniere.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { NotFoundError } = require('../../errors/AppError');

exports.getActives = asyncHandler(async (req, res) => {
  const result = await BanniereClientService.getActives();
  return ok(res, { bannieres: result.bannieres }, 'Bannières');
});

exports.getProduits = asyncHandler(async (req, res) => {
  const result = await BanniereClientService.getProduits(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(
    res,
    { banniere: result.banniere, produits: result.produits },
    'Produits de la bannière'
  );
});
