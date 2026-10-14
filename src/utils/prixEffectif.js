// ─────────────────────────────────────────────────────────────
// utils/prixEffectif.js
// Prix réellement facturé pour un produit : promotion en cours comprise.
// ─────────────────────────────────────────────────────────────
//
// Le client voit le prix promotionnel dans l'application (carte, fiche,
// panier). La commande, elle, était calculée sur le prix catalogue : il payait
// donc plus que le prix affiché. Ce module fixe une règle unique :
//
//   prix facturé = le plus bas entre
//     · le prix catalogue,
//     · le prix promo du produit (`Produit.prixPromo`), s'il est inférieur,
//     · le prix promo de chaque promotion EN COURS sur le produit
//       (active, date de début passée ou absente, date de fin future ou absente).
//
// Une promotion « à venir » (date de début future) ne s'applique pas encore.

const { Op } = require('sequelize');

const nombre = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Condition Sequelize des promotions en cours à l'instant [maintenant].
 */
const conditionPromotionEnCours = (maintenant = new Date()) => ({
  isActive: true,
  [Op.and]: [
    { [Op.or]: [{ dateDebut: null }, { dateDebut: { [Op.lte]: maintenant } }] },
    { [Op.or]: [{ dateFin: null }, { dateFin: { [Op.gte]: maintenant } }] },
  ],
});

/**
 * Prix facturé d'un produit, à partir de son prix, de son prix promo et des
 * prix des promotions en cours (fonction pure, testable sans base).
 */
function calculerPrixEffectif(produit, prixPromotions = []) {
  const prix = nombre(produit.prix);
  let meilleur = prix;
  const candidats = [produit.prixPromo, ...prixPromotions].map(nombre);
  for (const c of candidats) {
    if (c > 0 && c < meilleur) meilleur = c;
  }
  return meilleur;
}

/**
 * Prix facturés de plusieurs produits.
 *
 * @param {object} Promotion — modèle Sequelize
 * @param {Array<{id, prix, prixPromo}>} produits
 * @param {object} [options] — { transaction, maintenant }
 * @returns {Promise<Map<string, number>>} id produit → prix facturé
 */
async function prixEffectifs(Promotion, produits, { transaction, maintenant } = {}) {
  const ids = produits.map((p) => p.id);
  const promotions = ids.length
    ? await Promotion.findAll({
        attributes: ['produitId', 'prixPromo'],
        where: { produitId: { [Op.in]: ids }, ...conditionPromotionEnCours(maintenant) },
        transaction,
        raw: true,
      })
    : [];

  const parProduit = new Map();
  for (const promo of promotions) {
    if (!parProduit.has(promo.produitId)) parProduit.set(promo.produitId, []);
    parProduit.get(promo.produitId).push(promo.prixPromo);
  }

  return new Map(produits.map((p) => [p.id, calculerPrixEffectif(p, parProduit.get(p.id) || [])]));
}

module.exports = { prixEffectifs, calculerPrixEffectif, conditionPromotionEnCours };
