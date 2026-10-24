// ─────────────────────────────────────────────────────────────
// controllers/admin/produit.controller.js
// ─────────────────────────────────────────────────────────────
const GestionProduitService = require('../../services/admin/produit.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');

exports.create = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.createProduit(req.body, req.files);
  if (!result.success) throw new BadRequestError(result.message);
  return created(res, { produit: result.produit }, result.message);
});

exports.getAll = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.getAllProduits(req.query);
  return ok(res, { produits: result.produits, pagination: result.pagination }, result.message);
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.getProduitById(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { produit: result.produit }, 'Produit récupéré');
});

exports.update = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.updateProduit(req.params.id, req.body, req.files);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { produit: result.produit }, result.message);
});

exports.remove = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.deleteProduit(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, {}, result.message);
});

exports.updateStock = asyncHandler(async (req, res) => {
  // L'auteur vient du jeton vérifié par `adminMiddleware`, jamais du corps :
  // l'historique ne doit pas pouvoir être signé au nom d'un autre compte.
  const result = await GestionProduitService.updateStock(req.params.id, {
    quantite: req.body.quantite,
    motif: req.body.motif,
    commentaire: req.body.commentaire,
    auteurId: req.user && req.user.id,
  });
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { produit: result.produit, mouvement: result.mouvement }, result.message);
});

exports.getMouvementsStock = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.getMouvementsStock(req.params.id, req.query);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(
    res,
    {
      mouvements: result.mouvements,
      indicateurs: result.indicateurs,
      periode: result.periode,
      pagination: result.pagination,
    },
    result.message
  );
});

exports.getCommandesDuProduit = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.getCommandesDuProduit(req.params.id, req.query);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { lignes: result.lignes, pagination: result.pagination }, result.message);
});

exports.toggleFeatured = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.toggleFeatured(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { produit: result.produit }, result.message);
});

exports.toggleVisibilite = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.toggleVisibilite(req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { produit: result.produit }, result.message);
});

exports.validerStep1 = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.validerProduitStep1(req.params.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { produit: result.produit }, result.message);
});

exports.validerStep2 = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.validerProduitStep2(req.params.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { produit: result.produit }, result.message);
});

exports.rejeter = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.rejeterProduit(req.params.id, req.body.motif);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { produit: result.produit }, result.message);
});

exports.getAValider = asyncHandler(async (req, res) => {
  const result = await GestionProduitService.getProduitsAValider();
  return ok(
    res,
    { produits: result.produits, total: result.total },
    'Produits en attente de validation'
  );
});
