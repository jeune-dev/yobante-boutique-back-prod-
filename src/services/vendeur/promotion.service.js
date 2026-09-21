// ─────────────────────────────────────────────────────────────
// services/vendeur/promotion.service.js — Promotions d'un vendeur sur ses produits
// ─────────────────────────────────────────────────────────────
const { Promotion, Produit } = require('../../models');
const { STATUT_VALIDATION_PRODUIT } = require('../../constants');

const PRODUIT_ATTRS = ['id', 'nom', 'slug', 'prix', 'prixPromo', 'images', 'stock', 'vendeurId'];

/** Section d'accueil déduite des dates : à venir tant que la promo n'a pas commencé. */
const sectionPour = (dateDebut) =>
  new Date(dateDebut) > new Date() ? 'nos_promos_a_venir' : 'nos_promos_du_moment';

const pourcentage = (prix, prixPromo) =>
  Number((((Number(prix) - Number(prixPromo)) / Number(prix)) * 100).toFixed(2));

const estEnCours = (promo) => {
  const maintenant = new Date();
  return (
    promo.isActive &&
    (!promo.dateDebut || new Date(promo.dateDebut) <= maintenant) &&
    (!promo.dateFin || new Date(promo.dateFin) >= maintenant)
  );
};

class VendeurPromotionService {
  /** Promotion du vendeur (le produit doit lui appartenir), ou null. */
  static #trouver(vendeurId, id) {
    return Promotion.findOne({
      where: { id },
      include: [
        {
          model: Produit,
          as: 'produit',
          attributes: PRODUIT_ATTRS,
          where: { vendeurId },
          required: true,
        },
      ],
    });
  }

  /** Répercute (ou retire) le prix promo sur le produit selon que la promo court. */
  static async #synchroniserProduit(promo) {
    const produit = promo.produit || (await Produit.findByPk(promo.produitId));
    if (!produit) return;
    if (estEnCours(promo)) {
      await produit.update({ prixPromo: promo.prixPromo });
    } else if (Number(produit.prixPromo) === Number(promo.prixPromo)) {
      await produit.update({ prixPromo: null });
    }
  }

  static async mesPromotions(vendeurId) {
    const promotions = await Promotion.findAll({
      include: [
        {
          model: Produit,
          as: 'produit',
          attributes: PRODUIT_ATTRS,
          where: { vendeurId },
          required: true,
        },
      ],
      order: [['createdAt', 'DESC']],
    });
    return { success: true, promotions };
  }

  static async creer(vendeurId, { produitId, titre, description, prixPromo, dateDebut, dateFin }) {
    const produit = await Produit.findOne({ where: { id: produitId, vendeurId } });
    if (!produit) return { success: false, status: 404, message: 'Produit introuvable' };
    if (produit.statutValidation !== STATUT_VALIDATION_PRODUIT.VALIDE) {
      return {
        success: false,
        status: 400,
        message: 'Seul un produit validé par l’administration peut être mis en promotion',
      };
    }
    if (Number(prixPromo) >= Number(produit.prix)) {
      return {
        success: false,
        status: 400,
        message: `Le prix promotionnel doit être inférieur au prix actuel (${produit.prix})`,
      };
    }

    const promo = await Promotion.create({
      produitId,
      section: sectionPour(dateDebut),
      titre: titre || `Promo ${produit.nom}`,
      description: description || null,
      prixPromo,
      pourcentageReduction: pourcentage(produit.prix, prixPromo),
      dateDebut,
      dateFin,
      isActive: true,
    });
    promo.produit = produit;
    await this.#synchroniserProduit(promo);

    const cree = await this.#trouver(vendeurId, promo.id);
    return { success: true, message: 'Promotion créée', promotion: cree || promo };
  }

  static async modifier(vendeurId, id, data) {
    const promo = await this.#trouver(vendeurId, id);
    if (!promo) return { success: false, status: 404, message: 'Promotion introuvable' };

    const prixPromo = data.prixPromo !== undefined ? data.prixPromo : promo.prixPromo;
    if (Number(prixPromo) >= Number(promo.produit.prix)) {
      return {
        success: false,
        status: 400,
        message: `Le prix promotionnel doit être inférieur au prix actuel (${promo.produit.prix})`,
      };
    }
    const dateDebut = data.dateDebut || promo.dateDebut;
    const dateFin = data.dateFin || promo.dateFin;
    if (dateDebut && dateFin && new Date(dateFin) <= new Date(dateDebut)) {
      return {
        success: false,
        status: 400,
        message: 'La date de fin doit être postérieure à la date de début',
      };
    }

    await promo.update({
      ...data,
      prixPromo,
      pourcentageReduction: pourcentage(promo.produit.prix, prixPromo),
      section: sectionPour(dateDebut),
    });
    await this.#synchroniserProduit(promo);
    return { success: true, message: 'Promotion mise à jour', promotion: promo };
  }

  static async supprimer(vendeurId, id) {
    const promo = await this.#trouver(vendeurId, id);
    if (!promo) return { success: false, status: 404, message: 'Promotion introuvable' };

    // Le prix affiché du produit ne doit plus refléter une promo supprimée.
    if (Number(promo.produit.prixPromo) === Number(promo.prixPromo)) {
      await promo.produit.update({ prixPromo: null });
    }
    await promo.destroy();
    return { success: true, message: 'Promotion supprimée' };
  }
}

module.exports = VendeurPromotionService;
