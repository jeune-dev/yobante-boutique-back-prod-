const VendeurPromotionService = require('../../services/vendeur/promotion.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { NotFoundError, BadRequestError } = require('../../errors/AppError');

const lever = (resultat) => {
  if (resultat.status === 404) throw new NotFoundError(resultat.message);
  throw new BadRequestError(resultat.message);
};

/** GET /api/v1/vendeur/promotions */
exports.mesPromotions = asyncHandler(async (req, res) => {
  const resultat = await VendeurPromotionService.mesPromotions(req.user.id);
  return ok(res, { promotions: resultat.promotions }, 'Mes promotions');
});

/** POST /api/v1/vendeur/promotions */
exports.creer = asyncHandler(async (req, res) => {
  const resultat = await VendeurPromotionService.creer(req.user.id, req.body);
  if (!resultat.success) lever(resultat);
  return created(res, { promotion: resultat.promotion }, resultat.message);
});

/** PUT /api/v1/vendeur/promotions/:id */
exports.modifier = asyncHandler(async (req, res) => {
  const resultat = await VendeurPromotionService.modifier(req.user.id, req.params.id, req.body);
  if (!resultat.success) lever(resultat);
  return ok(res, { promotion: resultat.promotion }, resultat.message);
});

/** DELETE /api/v1/vendeur/promotions/:id */
exports.supprimer = asyncHandler(async (req, res) => {
  const resultat = await VendeurPromotionService.supprimer(req.user.id, req.params.id);
  if (!resultat.success) lever(resultat);
  return ok(res, {}, resultat.message);
});
