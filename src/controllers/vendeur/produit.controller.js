const VendeurProduitService = require('../../services/vendeur/produit.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const { BadRequestError, NotFoundError } = require('../../errors/AppError');

exports.soumettre = asyncHandler(async (req, res) => {
  const result = await VendeurProduitService.soumettreProduit(req.user.id, req.body, req.files);
  if (!result.success) throw new BadRequestError(result.message);
  return created(res, { produit: result.produit }, result.message);
});

exports.getMesProduits = asyncHandler(async (req, res) => {
  const result = await VendeurProduitService.getMesProduits(req.user.id, req.query);
  return ok(res, { produits: result.produits, pagination: result.pagination }, 'Mes produits');
});

exports.getOne = asyncHandler(async (req, res) => {
  const result = await VendeurProduitService.getProduitById(req.user.id, req.params.id);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { produit: result.produit }, 'Produit');
});

exports.update = asyncHandler(async (req, res) => {
  const result = await VendeurProduitService.updateProduit(
    req.user.id,
    req.params.id,
    req.body,
    req.files
  );
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { produit: result.produit }, result.message);
});

exports.updateStock = asyncHandler(async (req, res) => {
  const { stock, stockAlloue } = req.body;
  const result = await VendeurProduitService.updateStock(
    req.user.id,
    req.params.id,
    stock,
    stockAlloue
  );
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, { produit: result.produit }, result.message);
});

exports.supprimer = asyncHandler(async (req, res) => {
  const result = await VendeurProduitService.supprimerProduit(req.user.id, req.params.id);
  if (!result.success) throw new BadRequestError(result.message);
  return ok(res, {}, result.message);
});

exports.getStats = asyncHandler(async (req, res) => {
  const result = await VendeurProduitService.getStats(req.user.id);
  return ok(res, { stats: result.stats }, 'Statistiques');
});
