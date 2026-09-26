/**
 * Commande Controller (Client)
 * Gère les commandes des clients
 */
const CommandeService = require('../../services/client/commande.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError, ForbiddenError } = require('../../errors/AppError');

/**
 * POST /api/commandes (protégé)
 * Créer une nouvelle commande à partir du panier
 */
exports.passer = asyncHandler(async (req, res) => {
  const result = await CommandeService.passerCommande(req.user.id, req.body);
  if (!result.success) throw new BadRequestError(result.message);
  return created(res, { commande: result.commande }, result.message);
});

/**
 * GET /api/commandes (protégé)
 * Récupérer toutes les commandes de l'utilisateur
 */
exports.getMes = asyncHandler(async (req, res) => {
  const result = await CommandeService.getMesCommandes(req.user.id, req.query);
  return ok(
    res,
    { commandes: result.commandes, pagination: result.pagination },
    'Commandes récupérées'
  );
});

/**
 * GET /api/commandes/:id (protégé)
 * Récupérer le détail d'une commande
 */
exports.getOne = asyncHandler(async (req, res) => {
  const result = await CommandeService.getCommandeDetail(req.user.id, req.params.id);
  if (!result.success) {
    const statusCode = result.status || 404;
    if (statusCode === 403) throw new ForbiddenError(result.message);
    if (statusCode === 404) throw new NotFoundError(result.message);
    throw new BadRequestError(result.message);
  }
  return ok(res, { commande: result.commande }, 'Commande récupérée');
});

/**
 * DELETE /api/commandes/:id (protégé)
 * Annuler une commande (si en attente)
 */
exports.annuler = asyncHandler(async (req, res) => {
  const result = await CommandeService.annulerCommande(req.user.id, req.params.id);
  if (!result.success) {
    const statusCode = result.status || 400;
    if (statusCode === 403) throw new ForbiddenError(result.message);
    if (statusCode === 404) throw new NotFoundError(result.message);
    throw new BadRequestError(result.message);
  }
  return ok(res, { commande: result.commande }, result.message);
});
