const PromotionClientService = require('../../services/client/promotion.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');

exports.getSections = asyncHandler(async (req, res) => {
  const result = await PromotionClientService.getSections();
  return ok(res, { sections: result.sections }, 'Sections promotionnelles');
});

exports.getActives = asyncHandler(async (req, res) => {
  const result = await PromotionClientService.getActives();
  // Tableau renvoyé directement dans `data` (format attendu par l'app mobile).
  return ok(res, { promotions: result.promotions }, 'Promotions actives');
});

/**
 * Blocs des sections, pilotés depuis le dashboard.
 * Le mobile s'en sert pour l'image et le titre de chaque sous-section.
 */
exports.getBlocs = asyncHandler(async (req, res) => {
  const result = await PromotionClientService.getBlocs();
  return ok(res, { blocs: result.blocs }, 'Blocs promo');
});

/** Produits d'une sous-section, les promotions expirées étant déjà écartées. */
exports.getProduitsDuBloc = asyncHandler(async (req, res) => {
  const result = await PromotionClientService.getProduitsDuBloc(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(
    res,
    { bloc: result.bloc, promotions: result.promotions },
    'Produits de la sous-section'
  );
});

exports.getGroupees = asyncHandler(async (req, res) => {
  const result = await PromotionClientService.getPromotionsGroupees();
  return ok(res, { promotions: result.promotions }, 'Promotions récupérées');
});

exports.getSection = asyncHandler(async (req, res) => {
  const sections = ['nos_promos_du_moment', 'a_ne_pas_rater', 'nos_promos_a_venir'];
  if (!sections.includes(req.params.section)) {
    throw new BadRequestError(`Section invalide. Valeurs acceptées : ${sections.join(', ')}`);
  }
  const result = await PromotionClientService.getSection(req.params.section);
  return ok(res, { promotions: result.promotions }, `Promotions : ${req.params.section}`);
});
