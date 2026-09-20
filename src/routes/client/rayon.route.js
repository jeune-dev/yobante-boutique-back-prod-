'use strict';
const router = require('express').Router();
const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const { Rayon, SousRayon, Produit, User, ProfilVendeur } = require('../../models');

// Même forme de produit que le catalogue (`GET /produits`) : le mobile lit
// `vendeur` (nom, téléphone WhatsApp) et `rayon`/`sousRayon` sur chaque carte.
const PRODUIT_INCLUDE = [
  { model: SousRayon, as: 'sousRayon', attributes: ['id', 'nom'] },
  { model: Rayon, as: 'rayon', attributes: ['id', 'nom'] },
  {
    model: User,
    as: 'vendeur',
    attributes: ['id', 'nom', 'prenom', 'telephone'],
    include: [{ model: ProfilVendeur, as: 'profilVendeur' }],
  },
];
const { Op } = require('sequelize');

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const rayons = await Rayon.findAll({
      where: { isActive: true },
      include: [
        {
          model: SousRayon,
          as: 'sousRayons',
          where: { isActive: true },
          required: false,
          attributes: ['id', 'nom', 'slug', 'image'],
        },
      ],
      order: [['nom', 'ASC']],
    });
    return ok(res, { rayons }, 'Rayons récupérés');
  })
);

router.get(
  '/:id/sous-rayons',
  asyncHandler(async (req, res) => {
    const sousRayons = await SousRayon.findAll({
      where: { rayonId: req.params.id, isActive: true },
      order: [['nom', 'ASC']],
    });
    return ok(res, { sousRayons }, 'Sous-rayons récupérés');
  })
);

router.get(
  '/:id/produits',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, sousRayonId, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = { rayonId: req.params.id, isActive: true, statutValidation: 'valide' };
    if (sousRayonId) where.sousRayonId = sousRayonId;
    if (search) where.nom = { [Op.iLike]: `%${search}%` };
    const { count, rows } = await Produit.findAndCountAll({
      where,
      include: PRODUIT_INCLUDE,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    return ok(res, {
      produits: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  })
);

router.get(
  '/sous-rayons/:id/produits',
  asyncHandler(async (req, res) => {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const where = { sousRayonId: req.params.id, isActive: true, statutValidation: 'valide' };
    if (search) where.nom = { [Op.iLike]: `%${search}%` };
    const { count, rows } = await Produit.findAndCountAll({
      where,
      include: PRODUIT_INCLUDE,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset,
    });
    return ok(res, {
      produits: rows,
      pagination: {
        total: count,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(count / parseInt(limit)),
      },
    });
  })
);

module.exports = router;
