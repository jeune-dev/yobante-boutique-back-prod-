// ─────────────────────────────────────────────────────────────
// services/admin/promotion.service.js
// ─────────────────────────────────────────────────────────────
const { Op } = require('sequelize');
const { Promotion, Produit, Categorie, BlocPromo } = require('../../models');
const paginate = require('../../utils/paginate');
const { SECTION_PROMOTION } = require('../../constants');

const vide = (v) => v === undefined || v === null || v === '';

const LIBELLE_SECTION = Object.freeze({
  nos_promos_du_moment: 'Nos promos du moment',
  a_ne_pas_rater: 'À ne pas rater',
  nos_promos_a_venir: 'Nos promos à venir',
});

/** Bornes d'une période ; une borne absente est ouverte. */
const bornes = (p) => ({
  debut: p.dateDebut ? new Date(p.dateDebut).getTime() : -Infinity,
  fin: p.dateFin ? new Date(p.dateFin).getTime() : Infinity,
});

/** Emplacement lisible : « À ne pas rater › Ramadan ». */
const emplacement = (p) =>
  [LIBELLE_SECTION[p.section] ?? p.section, p.blocPromo?.titre].filter(Boolean).join(' › ');

class PromotionService {
  static async getAll({ page, limit, section, isActive, blocPromoId, produitId, enCours } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);
    const where = {};
    if (section) where.section = section;
    // Promotions d'un produit (contrôle « déjà en promotion ailleurs »).
    if (produitId) where.produitId = produitId;
    // En cours ou à venir : ni désactivées, ni terminées.
    if (enCours === true || enCours === 'true') {
      where.isActive = true;
      where[Op.or] = [{ dateFin: null }, { dateFin: { [Op.gte]: new Date() } }];
    }
    // Permet à l'écran d'une sous-section de ne lister que ses produits.
    if (blocPromoId) where.blocPromoId = blocPromoId;
    if (isActive !== undefined) where.isActive = isActive === 'true' || isActive === true;

    const { count, rows } = await Promotion.findAndCountAll({
      where,
      include: [
        {
          model: Produit,
          as: 'produit',
          include: [{ model: Categorie, as: 'categorie', attributes: ['id', 'nom'] }],
        },
        { model: BlocPromo, as: 'blocPromo', attributes: ['id', 'titre'], required: false },
      ],
      order: [
        ['section', 'ASC'],
        ['ordre', 'ASC'],
      ],
      limit: l,
      offset,
      distinct: true,
    });

    return {
      success: true,
      promotions: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async getById(id) {
    const promo = await Promotion.findByPk(id, {
      include: [{ model: Produit, as: 'produit' }],
    });
    if (!promo) return { success: false, message: 'Promotion introuvable' };
    return { success: true, promotion: promo };
  }

  static _validerChampsPrix(data, produit) {
    if (data.prixPromo !== undefined) {
      const prixPromo = Number(data.prixPromo);
      const prixOriginal = Number(produit.prix);
      if (prixPromo <= 0) return 'Le prix promotionnel doit être positif';
      if (prixPromo >= prixOriginal)
        return `Le prix promotionnel (${prixPromo}) doit être inférieur au prix original (${prixOriginal})`;
    }
    if (data.pourcentageReduction !== undefined) {
      const pct = Number(data.pourcentageReduction);
      if (pct <= 0 || pct > 100) return 'Le pourcentage de réduction doit être entre 1 et 100';
    }
    return null;
  }

  /**
   * Remise et prix promo décrivent la même chose : l'admin saisit l'un, le
   * serveur calcule l'autre à partir du prix du produit. Le prix promo fait
   * foi (c'est lui qui est facturé) ; le pourcentage affiché en découle.
   * Renvoie une copie de `data` complétée.
   */
  static _completerRemise(data, produit) {
    const prix = Number(produit.prix);
    const out = { ...data };
    if (!(prix > 0)) return out;
    const pct = Number(out.pourcentageReduction);
    if (vide(out.prixPromo) && !vide(out.pourcentageReduction) && pct > 0 && pct < 100) {
      out.prixPromo = Math.round(prix * (1 - pct / 100));
    }
    // Un prix promo supérieur au prix normal est laissé tel quel : la
    // validation le refuse ensuite avec un message clair.
    const promo = Number(out.prixPromo);
    if (!vide(out.prixPromo) && promo > 0 && promo < prix) {
      out.pourcentageReduction = Number(((1 - promo / prix) * 100).toFixed(2));
    }
    return out;
  }

  /**
   * « Nos promos du moment » ne montre que de vraies promotions : une remise
   * et une date de fin sont obligatoires. Passé cette date, la promotion
   * disparaît de l'application et le produit reprend son prix normal.
   */
  static _validerPromoDuMoment(data) {
    if (data.section !== SECTION_PROMOTION.NOS_PROMOS_DU_MOMENT) return null;
    if (vide(data.prixPromo) || !(Number(data.prixPromo) > 0)) {
      return 'Indiquez la remise (en % ou en prix promotionnel)';
    }
    if (vide(data.dateFin)) return 'Indiquez la date de fin de la promotion';
    const fin = new Date(data.dateFin);
    if (Number.isNaN(fin.getTime())) return 'Date de fin invalide';
    if (fin.getTime() <= Date.now()) return 'La date de fin doit être dans le futur';
    if (!vide(data.dateDebut) && new Date(data.dateDebut).getTime() > fin.getTime()) {
      return 'La date de fin précède la date de début';
    }
    return null;
  }

  /**
   * Un produit peut figurer dans plusieurs sections, mais avec une seule
   * remise : deux promotions qui se chevauchent dans le temps doivent avoir le
   * même prix promo. Sinon le client verrait deux prix pour le même produit.
   *
   * Renvoie les promotions en conflit avec [cible] (prixPromo, dates).
   */
  static async _conflitsDeRemise(produitId, cible, { saufId } = {}) {
    const autres = await Promotion.findAll({
      where: {
        produitId,
        isActive: true,
        ...(saufId ? { id: { [Op.ne]: saufId } } : {}),
        [Op.or]: [{ dateFin: null }, { dateFin: { [Op.gte]: new Date() } }],
      },
      include: [
        { model: BlocPromo, as: 'blocPromo', attributes: ['id', 'titre'], required: false },
      ],
    });
    const prix = Math.round(Number(cible.prixPromo) || 0);
    const b = bornes(cible);
    return autres.filter((a) => {
      const autrePrix = Math.round(Number(a.prixPromo) || 0);
      // Une mise en avant sans remise n'est pas une promotion concurrente.
      if (!(autrePrix > 0) || autrePrix === prix) return false;
      const ba = bornes(a);
      return ba.debut <= b.fin && b.debut <= ba.fin;
    });
  }

  static _messageConflit(conflits, produit) {
    const c = conflits[0];
    const fin = c.dateFin ? ` jusqu'au ${new Date(c.dateFin).toLocaleDateString('fr-FR')}` : '';
    const pct = Math.round(Number(c.pourcentageReduction) || 0);
    return (
      `${produit?.nom ?? 'Ce produit'} est déjà en promotion dans « ${emplacement(c)} »` +
      ` à ${Math.round(Number(c.prixPromo)).toLocaleString('fr-FR')} FCFA` +
      `${pct ? ` (−${pct} %)` : ''}${fin}. Un produit garde la même remise dans toutes les sections.`
    );
  }

  static async create(donnees) {
    const produit = await Produit.findByPk(donnees.produitId);
    if (!produit) return { success: false, message: 'Produit introuvable' };

    const data = PromotionService._completerRemise(donnees, produit);
    const erreur =
      PromotionService._validerChampsPrix(data, produit) ||
      PromotionService._validerPromoDuMoment(data);
    if (erreur) return { success: false, message: erreur };

    const conflits = await PromotionService._conflitsDeRemise(produit.id, data);
    if (conflits.length) {
      return { success: false, message: PromotionService._messageConflit(conflits, produit) };
    }

    const promo = await Promotion.create(data);
    return { success: true, message: 'Promotion créée', promotion: promo };
  }

  static async update(id, { appliquerPartout, ...donnees } = {}) {
    const promo = await Promotion.findByPk(id, { include: [{ model: Produit, as: 'produit' }] });
    if (!promo) return { success: false, message: 'Promotion introuvable' };

    let data = donnees;
    let aAligner = [];
    if (promo.produit) {
      // Seule la remise a changé : le prix promo est recalculé, et inversement.
      const remiseModifiee = !vide(donnees.pourcentageReduction) || !vide(donnees.prixPromo);
      if (remiseModifiee && vide(donnees.prixPromo)) data = { ...donnees, prixPromo: null };
      data = PromotionService._completerRemise(data, promo.produit);
      if (vide(data.prixPromo)) delete data.prixPromo;
      const erreur =
        PromotionService._validerChampsPrix(data, promo.produit) ||
        PromotionService._validerPromoDuMoment({
          section: data.section ?? promo.section,
          prixPromo: data.prixPromo ?? promo.prixPromo,
          dateDebut: 'dateDebut' in data ? data.dateDebut : promo.dateDebut,
          dateFin: 'dateFin' in data ? data.dateFin : promo.dateFin,
        });
      if (erreur) return { success: false, message: erreur };

      // Remise différente de celle du même produit dans une autre section :
      // refusée, sauf si l'admin a choisi d'appliquer la nouvelle partout.
      const conflits = await PromotionService._conflitsDeRemise(
        promo.produitId,
        {
          prixPromo: data.prixPromo ?? promo.prixPromo,
          dateDebut: 'dateDebut' in data ? data.dateDebut : promo.dateDebut,
          dateFin: 'dateFin' in data ? data.dateFin : promo.dateFin,
        },
        { saufId: promo.id }
      );
      if (conflits.length && !appliquerPartout) {
        return {
          success: false,
          message: PromotionService._messageConflit(conflits, promo.produit),
        };
      }
      aAligner = conflits;
    }

    await promo.update(data);
    // Même remise dans toutes les sections où le produit est en promotion.
    for (const autre of aAligner) {
      await autre.update({
        prixPromo: promo.prixPromo,
        pourcentageReduction: promo.pourcentageReduction,
      });
    }
    return {
      success: true,
      message: aAligner.length
        ? `Promotion mise à jour, et nouvelle remise appliquée dans ${aAligner.length} autre(s) section(s)`
        : 'Promotion mise à jour',
      promotion: promo,
    };
  }

  static async remove(id) {
    const promo = await Promotion.findByPk(id);
    if (!promo) return { success: false, message: 'Promotion introuvable' };

    await promo.destroy();
    return { success: true, message: 'Promotion supprimée' };
  }

  static async toggleActive(id) {
    const promo = await Promotion.findByPk(id);
    if (!promo) return { success: false, message: 'Promotion introuvable' };

    promo.isActive = !promo.isActive;
    await promo.save();
    return { success: true, promotion: promo };
  }

  /**
   * Réordonne les produits d'une sous-section : [{ id, ordre }].
   * C'est l'ordre dans lequel le client les verra.
   */
  static async reordonner(elements = []) {
    if (!Array.isArray(elements) || !elements.length) {
      return { success: false, message: 'Aucun ordre fourni' };
    }
    await Promise.all(
      elements
        .filter((e) => e && e.id)
        .map((e) => Promotion.update({ ordre: Number(e.ordre) || 0 }, { where: { id: e.id } }))
    );
    return { success: true, message: 'Ordre mis à jour' };
  }

  static async creerPromotion(
    produitId,
    { section, pourcentageReduction, dateDebut, dateFin, titre }
  ) {
    const produit = await Produit.findByPk(produitId);
    if (!produit) return { success: false, message: 'Produit introuvable' };

    const prixPromo = parseFloat((produit.prix * (1 - pourcentageReduction / 100)).toFixed(2));
    const now = new Date();
    const debut = new Date(dateDebut);
    const isActive = debut <= now;

    // Désactiver les anciennes promos du même produit pour la même section
    await Promotion.update({ isActive: false }, { where: { produitId, section, isActive: true } });

    const promo = await Promotion.create({
      produitId,
      section,
      titre: titre || `Promo ${section}`,
      prixPromo,
      pourcentageReduction,
      dateDebut: debut,
      dateFin: new Date(dateFin),
      isActive,
    });

    // Le prix promo reste porté par la promotion seule : l'écrire sur la fiche
    // produit le laissait en vigueur après la date de fin.

    return { success: true, message: 'Promotion créée', promo };
  }

  /** Retourne les promotions regroupées par section (pour le dashboard admin) */
  static async getParSection() {
    const now = new Date();
    const sections = ['nos_promos_du_moment', 'a_ne_pas_rater', 'nos_promos_a_venir'];
    const result = {};

    for (const section of sections) {
      result[section] = await Promotion.findAll({
        where: {
          section,
          isActive: true,
          [Op.or]: [{ dateFin: null }, { dateFin: { [Op.gte]: now } }],
        },
        include: [{ model: Produit, as: 'produit' }],
        order: [['ordre', 'ASC']],
      });
    }

    return { success: true, sections: result };
  }
}

module.exports = PromotionService;
