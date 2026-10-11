'use strict';
const { Op } = require('sequelize');
const { Rayon, SousRayon } = require('../../models');
const paginate = require('../../utils/paginate');
const { slugifier: toSlug, SLUG_RAYON_PROMOTIONS } = require('../../seeders/rayons.data');

// Ordre du catalogue : `ordre` croissant, puis le nom.
const ORDRE = [
  ['ordre', 'ASC'],
  ['nom', 'ASC'],
];

/**
 * Slug d'un sous-rayon, préfixé par son rayon : « Chaussures » peut exister
 * dans Sport et dans Mode sans collision d'unicité.
 */
const slugSousRayon = (rayon, nom) => `${rayon.slug}-${toSlug(nom)}`;

class RayonService {
  static async lister({ page, limit, search, actif } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);
    const where = {};
    if (actif !== undefined) where.isActive = actif === 'true' || actif === true;
    if (search) where.nom = { [Op.iLike]: `%${search}%` };
    const { count, rows } = await Rayon.findAndCountAll({
      where,
      include: [
        {
          model: SousRayon,
          as: 'sousRayons',
          required: false,
          attributes: ['id', 'nom', 'slug', 'isActive', 'image', 'ordre'],
        },
      ],
      order: [
        ...ORDRE,
        [{ model: SousRayon, as: 'sousRayons' }, 'ordre', 'ASC'],
        [{ model: SousRayon, as: 'sousRayons' }, 'nom', 'ASC'],
      ],
      limit: l,
      offset,
      // Sans cela, le compte porte sur les lignes jointes : 15 rayons ayant
      // 55 sous-rayons étaient annoncés comme 55 résultats, d'où une
      // pagination fantôme dans le dashboard.
      distinct: true,
    });
    return {
      success: true,
      rayons: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async getById(id) {
    const rayon = await Rayon.findByPk(id, {
      include: [{ model: SousRayon, as: 'sousRayons' }],
      order: [
        [{ model: SousRayon, as: 'sousRayons' }, 'ordre', 'ASC'],
        [{ model: SousRayon, as: 'sousRayons' }, 'nom', 'ASC'],
      ],
    });
    if (!rayon) return { success: false, message: 'Rayon introuvable' };
    return { success: true, rayon };
  }

  static async creer({ nom, description, image, ordre }) {
    const slug = toSlug(nom);
    const exist = await Rayon.findOne({ where: { slug } });
    if (exist) return { success: false, message: 'Un rayon avec ce nom existe déjà' };
    // Sans ordre précisé, le nouveau rayon se place à la fin.
    const rang = ordre ?? ((await Rayon.max('ordre')) || 0) + 1;
    const rayon = await Rayon.create({ nom, slug, description, image, ordre: rang });
    return { success: true, message: 'Rayon créé', rayon };
  }

  static async modifier(id, data) {
    const rayon = await Rayon.findByPk(id);
    if (!rayon) return { success: false, message: 'Rayon introuvable' };
    // Le rayon « Promotions » est reconnu par son slug dans l'application :
    // le renommer ne doit pas le lui faire perdre.
    if (data.nom && rayon.slug !== SLUG_RAYON_PROMOTIONS) data.slug = toSlug(data.nom);
    await rayon.update(data);
    return { success: true, message: 'Rayon modifié', rayon };
  }

  static async archiver(id) {
    const rayon = await Rayon.findByPk(id);
    if (!rayon) return { success: false, message: 'Rayon introuvable' };
    await rayon.update({ isActive: !rayon.isActive });
    return { success: true, message: rayon.isActive ? 'Rayon archivé' : 'Rayon restauré', rayon };
  }

  // Sous-rayons
  static async listerSousRayons(rayonId, { page, limit, search } = {}) {
    const rayon = await Rayon.findByPk(rayonId);
    if (!rayon) return { success: false, message: 'Rayon introuvable' };
    const { page: p, limit: l, offset } = paginate(page, limit);
    const where = { rayonId };
    if (search) where.nom = { [Op.iLike]: `%${search}%` };
    const { count, rows } = await SousRayon.findAndCountAll({
      where,
      order: ORDRE,
      limit: l,
      offset,
    });
    return {
      success: true,
      sousRayons: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async creerSousRayon(rayonId, { nom, description, image, ordre }) {
    const rayon = await Rayon.findByPk(rayonId);
    if (!rayon) return { success: false, message: 'Rayon introuvable' };
    const slug = slugSousRayon(rayon, nom);
    const exist = await SousRayon.findOne({ where: { slug } });
    if (exist) return { success: false, message: 'Ce sous-rayon existe déjà dans ce rayon' };
    const rang = ordre ?? ((await SousRayon.max('ordre', { where: { rayonId } })) || 0) + 1;
    const sousRayon = await SousRayon.create({
      nom,
      slug,
      description,
      image,
      rayonId,
      ordre: rang,
    });
    return { success: true, message: 'Sous-rayon créé', sousRayon };
  }

  static async modifierSousRayon(id, data) {
    const sr = await SousRayon.findByPk(id, { include: [{ model: Rayon, as: 'rayon' }] });
    if (!sr) return { success: false, message: 'Sous-rayon introuvable' };
    if (data.nom) data.slug = sr.rayon ? slugSousRayon(sr.rayon, data.nom) : toSlug(data.nom);
    await sr.update(data);
    return { success: true, message: 'Sous-rayon modifié', sousRayon: sr };
  }

  static async archiverSousRayon(id) {
    const sr = await SousRayon.findByPk(id);
    if (!sr) return { success: false, message: 'Sous-rayon introuvable' };
    await sr.update({ isActive: !sr.isActive });
    return {
      success: true,
      message: sr.isActive ? 'Sous-rayon archivé' : 'Sous-rayon restauré',
      sousRayon: sr,
    };
  }
}

module.exports = RayonService;
