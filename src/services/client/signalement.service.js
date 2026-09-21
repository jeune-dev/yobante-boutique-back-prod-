// ─────────────────────────────────────────────────────────────
// services/client/signalement.service.js — Signalements (mobile + admin)
// ─────────────────────────────────────────────────────────────
const { Signalement, Produit, ProfilVendeur, User } = require('../../models');
const paginate = require('../../utils/paginate');

const AUTEUR_INCLUDE = { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] };

class SignalementService {
  /**
   * Signalement d'un produit ou d'une boutique (profil vendeur). La cible
   * doit exister : on ne stocke pas de signalement orphelin.
   */
  static async creer(userId, { type, cibleId, raison, description }) {
    const cible =
      type === 'produit'
        ? await Produit.findByPk(cibleId, { attributes: ['id'] })
        : await ProfilVendeur.findByPk(cibleId, { attributes: ['id'] });
    if (!cible) {
      return {
        success: false,
        status: 404,
        message: type === 'produit' ? 'Produit introuvable' : 'Boutique introuvable',
      };
    }

    // Un même utilisateur ne signale pas deux fois la même cible tant que le
    // premier signalement n'a pas été traité.
    const existant = await Signalement.findOne({
      where: { userId, type, cibleId, statut: 'en_attente' },
    });
    if (existant) {
      return {
        success: false,
        status: 409,
        message: 'Vous avez déjà signalé cet élément ; il est en cours de traitement.',
      };
    }

    const signalement = await Signalement.create({
      userId,
      type,
      cibleId,
      raison,
      description: description || null,
    });
    return { success: true, message: 'Signalement envoyé', signalement };
  }

  /** Signalements de l'utilisateur connecté, du plus récent au plus ancien. */
  static async mesSignalements(userId) {
    const signalements = await Signalement.findAll({
      where: { userId },
      order: [['createdAt', 'DESC']],
    });
    return { success: true, signalements };
  }

  // ── Administration ─────────────────────────────────────────

  static async lister({ page, limit, statut, type } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);
    const where = {};
    if (statut) where.statut = statut;
    if (type) where.type = type;

    const { count, rows } = await Signalement.findAndCountAll({
      where,
      include: [AUTEUR_INCLUDE],
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
    });
    return {
      success: true,
      signalements: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async traiter(id, { statut, reponseAdmin }) {
    const signalement = await Signalement.findByPk(id, { include: [AUTEUR_INCLUDE] });
    if (!signalement) return { success: false, status: 404, message: 'Signalement introuvable' };

    await signalement.update({ statut, reponseAdmin: reponseAdmin || null });
    return { success: true, message: 'Signalement mis à jour', signalement };
  }
}

module.exports = SignalementService;
