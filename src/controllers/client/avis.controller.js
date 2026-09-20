/**
 * Avis Controller (Client)
 * Gère les avis et évaluations des produits
 */
const AvisService = require('../../services/client/avis.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');

/**
 * POST /api/avis (protégé)
 * Créer un nouvel avis sur un produit
 */
exports.create = asyncHandler(async (req, res) => {
  const result = await AvisService.createAvis(req.user.id, req.body);
  if (!result.success) throw new BadRequestError(result.message);
  return created(res, { avis: result.avis }, result.message);
});

/**
 * GET /api/avis/produit/:produitId (public)
 * Avis approuvés d'un produit
 */
exports.getParProduit = asyncHandler(async (req, res) => {
  const result = await AvisService.getAvisProduit(req.params.produitId);
  return ok(res, { avis: result.avis }, 'Avis du produit');
});

/**
 * GET /api/avis (protégé)
 * Récupérer mes avis
 */
exports.getMes = asyncHandler(async (req, res) => {
  const result = await AvisService.getMesAvis(req.user.id);
  return ok(res, { avis: result.avis }, 'Avis récupérés');
});

/**
 * PUT /api/avis/:id (protégé)
 * Mettre à jour un avis
 */
exports.update = asyncHandler(async (req, res) => {
  const result = await AvisService.updateAvis(req.user.id, req.params.id, req.body);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { avis: result.avis }, result.message);
});

/**
 * DELETE /api/avis/:id (protégé)
 * Supprimer un avis
 */
exports.remove = asyncHandler(async (req, res) => {
  const result = await AvisService.deleteAvis(req.user.id, req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, {}, result.message);
});
