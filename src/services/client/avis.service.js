const { Avis, Produit, User } = require('../../models');
const { recalculerNoteMoyenne } = require('../../utils/avisHelper');

/** Auteur d'un avis tel qu'exposé publiquement (jamais l'email). */
const AUTEUR_INCLUDE = { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'avatar'] };

class AvisService {
  /**
   * Avis approuvés d'un produit, visibles par tous (fiche produit mobile).
   */
  static async getAvisProduit(produitId) {
    const avis = await Avis.findAll({
      where: { produitId, isApproved: true },
      include: [AUTEUR_INCLUDE],
      order: [['createdAt', 'DESC']],
    });
    return { success: true, avis };
  }

  /**
   * Création d'avis protégée contre la double-soumission.
   * findOrCreate + index unique (userId, produitId) garantissent l'unicité
   * même si deux requêtes arrivent simultanément.
   */
  static async createAvis(userId, { produitId, note, commentaire }) {
    const produit = await Produit.findOne({
      where: { id: produitId, isActive: true },
      attributes: ['id'],
    });
    if (!produit) return { success: false, message: 'Produit introuvable' };

    const [avis, created] = await Avis.findOrCreate({
      where: { userId, produitId },
      defaults: { userId, produitId, note, commentaire, isApproved: false },
    });

    if (!created) {
      return { success: false, message: 'Vous avez déjà laissé un avis sur ce produit' };
    }

    return { success: true, message: 'Avis envoyé, en attente de modération', avis };
  }

  static async getMesAvis(userId) {
    const avis = await Avis.findAll({
      where: { userId },
      include: [
        {
          model: Produit,
          as: 'produit',
          attributes: ['id', 'nom', 'slug', 'images', 'noteMoyenne'],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
    return { success: true, avis };
  }

  static async updateAvis(userId, avisId, { note, commentaire }) {
    const avis = await Avis.findOne({ where: { id: avisId, userId } });
    if (!avis) return { success: false, message: 'Avis introuvable' };

    const updates = { isApproved: false };
    if (note !== undefined) updates.note = note;
    if (commentaire !== undefined) updates.commentaire = commentaire;
    await avis.update(updates);

    return { success: true, message: 'Avis mis à jour, en attente de modération', avis };
  }

  static async deleteAvis(userId, avisId) {
    const avis = await Avis.findOne({ where: { id: avisId, userId } });
    if (!avis) return { success: false, message: 'Avis introuvable' };

    const { produitId } = avis;
    await avis.destroy();
    await recalculerNoteMoyenne(produitId);

    return { success: true, message: 'Avis supprimé avec succès' };
  }
}

module.exports = AvisService;
