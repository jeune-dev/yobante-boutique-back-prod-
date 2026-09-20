// ─────────────────────────────────────────────────────────────
// services/vendeur/avis.service.js — Avis reçus sur mes produits
// ─────────────────────────────────────────────────────────────
const { Avis, Produit, User } = require('../../models');

const INCLUDE = [
  { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'avatar'] },
  { model: Produit, as: 'produit', attributes: ['id', 'nom', 'slug', 'images', 'vendeurId'] },
];

class VendeurAvisService {
  /** Avis approuvés laissés sur les produits du vendeur. */
  static async getMesAvisRecus(vendeurId) {
    const avis = await Avis.findAll({
      where: { isApproved: true },
      include: [INCLUDE[0], { ...INCLUDE[1], where: { vendeurId }, required: true }],
      order: [['createdAt', 'DESC']],
    });
    return { success: true, avis };
  }

  /** Réponse publique du vendeur à un avis portant sur l'un de ses produits. */
  static async repondre(vendeurId, avisId, reponse) {
    const avis = await Avis.findOne({
      where: { id: avisId },
      include: [INCLUDE[0], { ...INCLUDE[1], where: { vendeurId }, required: true }],
    });
    if (!avis) return { success: false, message: 'Avis introuvable' };

    await avis.update({ reponseVendeur: reponse, reponduAt: new Date() });
    return { success: true, message: 'Réponse enregistrée', avis };
  }
}

module.exports = VendeurAvisService;
