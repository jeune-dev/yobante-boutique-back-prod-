// ─────────────────────────────────────────────────────────────
// services/client/produit.service.js
// ─────────────────────────────────────────────────────────────
const { Op } = require('sequelize');
const { Produit, Categorie, Avis, User, ProfilVendeur } = require('../../models');
const paginate = require('../../utils/paginate');

// Include commun : catégorie + vendeur (avec sa boutique) pour enrichir les
// produits renvoyés au client (nom boutique, localisation, contact vendeur).
const CATALOGUE_INCLUDE = [
  { model: Categorie, as: 'categorie' },
  {
    model: User,
    as: 'vendeur',
    attributes: ['id', 'nom', 'prenom', 'telephone'],
    include: [{ model: ProfilVendeur, as: 'profilVendeur' }],
  },
];

class ProduitService {
  static async getProduits({
    page,
    limit,
    categorieId,
    vendeurId,
    prixMin,
    prixMax,
    search,
    tri,
  } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);

    const where = { isActive: true };
    if (categorieId) where.categorieId = categorieId;
    // Produits d'une boutique : `vendeurId` est l'identifiant utilisateur du
    // vendeur (`boutique.vendeur.id` côté mobile).
    if (vendeurId) where.vendeurId = vendeurId;
    if (prixMin || prixMax) {
      where.prix = {};
      if (prixMin) where.prix[Op.gte] = prixMin;
      if (prixMax) where.prix[Op.lte] = prixMax;
    }
    if (search) {
      where[Op.or] = [
        { nom: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const order = {
      prix_asc: [['prix', 'ASC']],
      prix_desc: [['prix', 'DESC']],
      recent: [['createdAt', 'DESC']],
    }[tri] || [['createdAt', 'DESC']];

    const { count, rows } = await Produit.findAndCountAll({
      where,
      include: CATALOGUE_INCLUDE,
      attributes: { exclude: ['prixAchat'] },
      order,
      limit: l,
      offset,
    });

    return {
      success: true,
      produits: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async getProduitBySlug(slug) {
    const produit = await Produit.findOne({
      where: { slug, isActive: true },
      attributes: { exclude: ['prixAchat'] },
      include: [
        { model: Categorie, as: 'categorie' },
        {
          model: Avis,
          as: 'avis',
          where: { isApproved: true },
          required: false,
          include: [{ model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'avatar'] }],
        },
      ],
    });

    if (!produit) {
      return { success: false, message: 'Produit introuvable' };
    }

    const avisApprouves = produit.avis || [];
    const noteMoyenne = avisApprouves.length
      ? avisApprouves.reduce((sum, a) => sum + a.note, 0) / avisApprouves.length
      : 0;

    return { success: true, produit, noteMoyenne };
  }

  static async getProduitsFeatured() {
    const produits = await Produit.findAll({
      where: { isFeatured: true, isActive: true },
      attributes: { exclude: ['prixAchat'] },
      include: CATALOGUE_INCLUDE,
      limit: 10,
      order: [['createdAt', 'DESC']],
    });

    return { success: true, produits };
  }

  static async getProduitsByCategorie(slug, { page, limit } = {}) {
    const categorie = await Categorie.findOne({ where: { slug, isActive: true } });
    if (!categorie) {
      return { success: false, message: 'Catégorie introuvable' };
    }

    const { page: p, limit: l, offset } = paginate(page, limit);

    const { count, rows } = await Produit.findAndCountAll({
      where: { categorieId: categorie.id, isActive: true },
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
    });

    return {
      success: true,
      categorie,
      produits: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async rechercherProduits({ query, page, limit } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);

    const { count, rows } = await Produit.findAndCountAll({
      where: {
        isActive: true,
        [Op.or]: [
          { nom: { [Op.iLike]: `%${query}%` } },
          { description: { [Op.iLike]: `%${query}%` } },
        ],
      },
      include: CATALOGUE_INCLUDE,
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
    });

    return {
      success: true,
      produits: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async getProduitsRecommandes(produitId, limit = 6) {
    const produit = await Produit.findByPk(produitId);
    if (!produit) {
      return { success: false, message: 'Produit introuvable' };
    }

    const produits = await Produit.findAll({
      where: {
        categorieId: produit.categorieId,
        isActive: true,
        id: { [Op.ne]: produitId },
      },
      limit,
      order: [['createdAt', 'DESC']],
    });

    return { success: true, produits };
  }
}

module.exports = ProduitService;
