// ─────────────────────────────────────────────────────────────
// services/client/promotion.service.js
// ─────────────────────────────────────────────────────────────
const { Op } = require('sequelize');
const { Promotion, Produit, Categorie, Rayon, SousRayon, BlocPromo } = require('../../models');
const ProduitService = require('./produit.service');

// Produit d'une promotion, au format du catalogue : vendeur et boutique
// inclus. Sans eux, les cartes de l'application n'affichent ni le nom de la
// boutique ni sa ville.
const PRODUIT_PROMO = () => ({
  model: Produit,
  as: 'produit',
  required: true,
  where: ProduitService.VISIBLE_AU_PUBLIC,
  attributes: { exclude: ['prixAchat'] },
  include: [
    ...ProduitService.CATALOGUE_INCLUDE,
    { model: Rayon, as: 'rayon', attributes: ['id', 'nom'] },
    { model: SousRayon, as: 'sousRayon', attributes: ['id', 'nom'] },
  ],
});

class PromotionClientService {
  /**
   * Blocs (sous-sections) affichés en tête des sections de l'accueil.
   *
   * Seuls les blocs actifs sont exposés, dans l'ordre défini par
   * l'administration. Une section peut en porter plusieurs.
   */
  static async getBlocs() {
    const blocs = await BlocPromo.findAll({
      where: { isActive: true },
      order: [
        ['section', 'ASC'],
        ['ordre', 'ASC'],
      ],
    });
    return { success: true, blocs };
  }

  /**
   * Produits en promotion d'une sous-section.
   *
   * Une promotion dont la période est passée disparaît d'elle-même : c'est la
   * durée choisie par l'administration qui pilote l'affichage, sans qu'aucune
   * tâche n'ait à la désactiver.
   */
  static async getProduitsDuBloc(blocPromoId) {
    const bloc = await BlocPromo.findByPk(blocPromoId);
    if (!bloc || !bloc.isActive) {
      return { success: false, message: 'Sous-section introuvable' };
    }

    const now = new Date();
    const promotions = await Promotion.findAll({
      where: {
        blocPromoId,
        isActive: true,
        [Op.and]: [
          { [Op.or]: [{ dateDebut: null }, { dateDebut: { [Op.lte]: now } }] },
          { [Op.or]: [{ dateFin: null }, { dateFin: { [Op.gte]: now } }] },
        ],
      },
      // Produits entièrement validés uniquement, comme le reste du catalogue.
      include: [PRODUIT_PROMO()],
      order: [['ordre', 'ASC']],
    });

    return { success: true, bloc, promotions };
  }

  /** Retourne les 3 sections promotionnelles pour la page Promotions de l'app */
  static async getSections() {
    const now = new Date();

    const baseWhere = (section) => ({
      section,
      isActive: true,
      [Op.or]: [{ dateDebut: null }, { dateDebut: { [Op.lte]: now } }],
      [Op.and]: [
        {
          [Op.or]: [{ dateFin: null }, { dateFin: { [Op.gte]: now } }],
        },
      ],
    });

    const includeProduct = [
      {
        model: Produit,
        as: 'produit',
        where: { isActive: true, statutValidation: 'valide' },
        include: [{ model: Categorie, as: 'categorie', attributes: ['id', 'nom', 'slug'] }],
      },
    ];

    const [nosPromos, aNePasRater, nosPromosAVenir] = await Promise.all([
      Promotion.findAll({
        where: baseWhere('nos_promos_du_moment'),
        include: includeProduct,
        order: [['ordre', 'ASC']],
      }),
      Promotion.findAll({
        where: baseWhere('a_ne_pas_rater'),
        include: includeProduct,
        order: [['ordre', 'ASC']],
      }),
      Promotion.findAll({
        where: {
          section: 'nos_promos_a_venir',
          isActive: true,
          [Op.or]: [{ dateFin: null }, { dateFin: { [Op.gte]: now } }],
        },
        include: includeProduct,
        order: [['dateDebut', 'ASC']],
      }),
    ]);

    return {
      success: true,
      sections: {
        nos_promos_du_moment: nosPromos,
        a_ne_pas_rater: aNePasRater,
        nos_promos_a_venir: nosPromosAVenir,
      },
    };
  }

  /** Liste plate de toutes les promotions actives (toutes sections confondues). */
  static async getActives() {
    const now = new Date();
    const promotions = await Promotion.findAll({
      where: {
        isActive: true,
        [Op.or]: [{ dateDebut: null }, { dateDebut: { [Op.lte]: now } }],
        [Op.and]: [
          {
            [Op.or]: [{ dateFin: null }, { dateFin: { [Op.gte]: now } }],
          },
        ],
      },
      include: [PRODUIT_PROMO()],
      order: [['ordre', 'ASC']],
    });

    return { success: true, promotions };
  }

  static async getPromotionsGroupees() {
    const sections = ['nos_promos_du_moment', 'a_ne_pas_rater', 'nos_promos_a_venir'];
    const result = {};
    for (const section of sections) {
      const promos = await Promotion.findAll({
        where: { section, isActive: true },
        include: [
          {
            model: Produit,
            as: 'produit',
            required: true,
            where: { isActive: true, statutValidation: 'valide' },
            include: [
              { model: Rayon, as: 'rayon', attributes: ['id', 'nom'] },
              { model: SousRayon, as: 'sousRayon', attributes: ['id', 'nom'] },
            ],
          },
        ],
        order: [['ordre', 'ASC']],
      });
      result[section] = promos;
    }
    return { success: true, promotions: result };
  }

  static async getSection(section) {
    const now = new Date();
    const periode = [{ [Op.or]: [{ dateFin: null }, { dateFin: { [Op.gte]: now } }] }];
    // Seule la section « à venir » montre des promotions pas encore commencées.
    if (section !== 'nos_promos_a_venir') {
      periode.push({ [Op.or]: [{ dateDebut: null }, { dateDebut: { [Op.lte]: now } }] });
    }
    const promotions = await Promotion.findAll({
      where: { section, isActive: true, [Op.and]: periode },
      include: [PRODUIT_PROMO()],
      order: [['ordre', 'ASC']],
    });

    return { success: true, promotions };
  }
}

module.exports = PromotionClientService;
