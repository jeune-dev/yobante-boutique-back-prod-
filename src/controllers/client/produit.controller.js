/**
 * Produit Controller (Client)
 * Gère la consultation du catalogue de produits
 */
const ProduitService = require('../../services/client/produit.service');
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { NotFoundError } = require('../../errors/AppError');

/**
 * GET /api/produits
 * Récupérer tous les produits avec filtres, recherche, pagination
 */
exports.getCatalogue = asyncHandler(async (req, res) => {
  const result = await ProduitService.getProduits(req.query);
  return ok(
    res,
    { produits: result.produits, pagination: result.pagination },
    'Catalogue récupéré'
  );
});

/**
 * GET /api/produits/:slug
 * Récupérer un produit par son slug avec ses avis
 */
exports.getOne = asyncHandler(async (req, res) => {
  const result = await ProduitService.getProduitBySlug(req.params.slug);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { produit: result.produit, noteMoyenne: result.noteMoyenne }, 'Produit récupéré');
});

/**
 * GET /api/produits/disponibilites?ids=a,b,c
 * Stock actuel des produits du panier.
 */
exports.getDisponibilites = asyncHandler(async (req, res) => {
  const brut = req.query.ids;
  const ids = (Array.isArray(brut) ? brut.join(',') : String(brut ?? ''))
    .split(',')
    .filter(Boolean);
  const result = await ProduitService.getDisponibilites(ids);
  return ok(res, { disponibilites: result.disponibilites }, 'Disponibilités des produits');
});

/**
 * GET /api/produits/featured
 * Récupérer les produits en vedette
 */
exports.getFeatured = asyncHandler(async (req, res) => {
  const result = await ProduitService.getProduitsFeatured();
  return ok(res, { produits: result.produits }, 'Produits vedettes récupérés');
});

/**
 * GET /api/produits/categorie/:slug
 * Récupérer les produits d'une catégorie
 */
exports.getByCategorie = asyncHandler(async (req, res) => {
  const result = await ProduitService.getProduitsByCategorie(req.params.slug, req.query);
  if (!result.success) throw new NotFoundError(result.message);
  return ok(
    res,
    { categorie: result.categorie, produits: result.produits, pagination: result.pagination },
    'Produits de la catégorie récupérés'
  );
});

/**
 * GET /api/produits/search?q=...
 * Rechercher des produits par nom
 */
exports.rechercher = asyncHandler(async (req, res) => {
  const result = await ProduitService.rechercherProduits({
    query: req.query.q,
    page: req.query.page,
    limit: req.query.limit,
  });
  return ok(
    res,
    { produits: result.produits, pagination: result.pagination },
    'Recherche effectuée'
  );
});

/**
 * GET /api/produits/:id/recommandes
 * Récupérer les produits recommandés pour un produit
 */
exports.getRecommandes = asyncHandler(async (req, res) => {
  const result = await ProduitService.getProduitsRecommandes(
    req.params.id,
    req.query.limit ? Number(req.query.limit) : 6
  );
  if (!result.success) throw new NotFoundError(result.message);
  return ok(res, { produits: result.produits }, 'Produits recommandés récupérés');
});
