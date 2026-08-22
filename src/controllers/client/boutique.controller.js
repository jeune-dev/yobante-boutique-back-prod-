const BoutiqueClientService = require('../../services/client/boutique.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');

exports.liste = asyncHandler(async (req, res) => {
  const result = await BoutiqueClientService.listeBoutiques();
  return ok(res, { boutiques: result.boutiques }, 'Boutiques');
});

exports.proches = asyncHandler(async (req, res) => {
  const { lat, lng, rayon } = req.query;
  const result = await BoutiqueClientService.boutiquesProches({ lat, lng, rayon });
  return ok(res, { boutiques: result.boutiques }, 'Boutiques proches');
});
