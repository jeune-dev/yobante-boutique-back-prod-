const VendeurAvisService = require('../../services/vendeur/avis.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { NotFoundError } = require('../../errors/AppError');

/** GET /api/v1/vendeur/avis — avis reçus sur mes produits */
exports.getMesAvisRecus = asyncHandler(async (req, res) => {
  const result = await VendeurAvisService.getMesAvisRecus(req.user.id);
  return ok(res, { avis: result.avis }, 'Avis reçus');
});

/** POST /api/v1/vendeur/avis/:id/repondre — { reponse } */
exports.repondre = asyncHandler(async (req, res) => {
  const result = await VendeurAvisService.repondre(req.user.id, req.params.id, req.body.reponse);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { avis: result.avis }, result.message);
});
