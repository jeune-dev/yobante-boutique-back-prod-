// ─────────────────────────────────────────────────────────────
// services/admin/commande.service.js
// ─────────────────────────────────────────────────────────────
const { Op } = require('sequelize');
const { Commande, CommandeItem, Produit, User, Adresse, Paiement } = require('../../models');
const paginate = require('../../utils/paginate');
const { sendCommandeStatut } = require('../../utils/mailer');
const { toCsv } = require('../../utils/csv');
const { ROLES, STATUT_COMMANDE } = require('../../constants');
const CommandeService = require('../client/commande.service');

// La liste n'affiche que ces champs du produit : inutile de charger toute la
// fiche (description, images…) pour chaque ligne de chaque commande.
const PRODUIT_LISTE = ['id', 'nom', 'prix', 'reference'];

const TRANSITIONS = {
  validee: 'en_attente',
  en_preparation: 'validee',
  expediee: 'en_preparation',
  livree: 'expediee',
};

class GestionCommandeService {
  /**
   * Création d'une commande par un administrateur pour le compte d'un client.
   * Seules les vérifications propres à l'admin sont ici (le client existe, est
   * un CLIENT actif) ; tout le reste — prix, stock, frais, statut initial,
   * paiement, transaction — est la logique commune de CommandeService.
   * Le panier en base du client n'est ni lu ni vidé.
   */
  static async creerCommandeAdmin(adminId, { userId, ...donnees }) {
    const client = await User.findOne({
      where: { id: userId, role: ROLES.CLIENT },
      attributes: ['id', 'isActive'],
    });
    if (!client) return { success: false, status: 404, message: 'Client introuvable' };
    if (!client.isActive) {
      return {
        success: false,
        status: 400,
        message: 'Ce client est désactivé : impossible de lui créer une commande',
      };
    }

    const result = await CommandeService.creerCommande(userId, donnees, {
      depuisPanier: false,
      viderPanier: false,
      origine: 'admin',
      auteurId: adminId,
    });
    if (result.success) result.message = 'Commande créée avec succès';
    return result;
  }

  static async getAllCommandes({ page, limit, statut, userId, reference, search } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);

    const where = {};
    if (statut) where.statut = statut;
    if (userId) where.userId = userId;
    if (reference) where.reference = reference;
    // Le champ « Rechercher » de l'écran Commandes envoie `search`.
    if (search && String(search).trim()) {
      where.reference = { [Op.iLike]: `%${String(search).trim()}%` };
    }

    const { count, rows } = await Commande.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] },
        {
          model: CommandeItem,
          as: 'items',
          include: [{ model: Produit, as: 'produit', attributes: PRODUIT_LISTE }],
        },
      ],
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
      // Sans `distinct`, le total compte les lignes jointes (une par article).
      distinct: true,
    });

    return {
      success: true,
      commandes: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  static async getCommandeById(id) {
    const commande = await Commande.findByPk(id, {
      include: [
        // Jamais le hash du mot de passe dans une réponse.
        { model: User, as: 'user', attributes: { exclude: ['password'] } },
        { model: Adresse, as: 'adresse' },
        {
          model: CommandeItem,
          as: 'items',
          include: [{ model: Produit, as: 'produit', attributes: { exclude: ['prixAchat'] } }],
        },
        { model: Paiement, as: 'paiement' },
      ],
    });

    if (!commande) {
      return { success: false, message: 'Commande introuvable' };
    }

    return { success: true, commande };
  }

  static async _transition(id, statutAttendu, nouveauStatut, extra = {}) {
    const commande = await Commande.findByPk(id, { include: [{ model: User, as: 'user' }] });
    if (!commande) {
      return { success: false, message: 'Commande introuvable' };
    }

    if (statutAttendu && commande.statut !== statutAttendu) {
      return {
        success: false,
        message: `La commande doit être en statut "${statutAttendu}" pour cette action`,
      };
    }

    await commande.update({ statut: nouveauStatut, ...extra });

    if (commande.user) {
      await sendCommandeStatut(commande.user.email, commande, nouveauStatut);
    }

    return { success: true, message: 'Commande mise à jour avec succès', commande };
  }

  static validerCommande(id, noteAdmin) {
    return GestionCommandeService._transition(
      id,
      'en_attente',
      'validee',
      noteAdmin ? { noteAdmin } : {}
    );
  }

  /**
   * Même règle métier que CommandeService.rejeterCommande : seule une commande
   * en attente peut être rejetée ; elle passe en `rejetee`, le motif va dans
   * `motifRejet` (affiché au client par le mobile) et le stock est restauré.
   */
  static async rejeterCommande(id, motif) {
    const result = await CommandeService.rejeterCommande(id, { motif });
    if (!result.success) return result;

    const user = await User.findByPk(result.commande.userId, { attributes: ['email'] });
    if (user) await sendCommandeStatut(user.email, result.commande, STATUT_COMMANDE.REJETEE);

    return result;
  }

  static mettreEnPreparation(id) {
    return GestionCommandeService._transition(id, 'validee', 'en_preparation');
  }

  static marquerExpediee(id, trackingInfo) {
    return GestionCommandeService._transition(
      id,
      'en_preparation',
      'expediee',
      trackingInfo ? { noteAdmin: trackingInfo } : {}
    );
  }

  static marquerLivree(id) {
    return GestionCommandeService._transition(id, 'expediee', 'livree');
  }

  static async getCommandesParClient(userId) {
    const commandes = await Commande.findAll({
      where: { userId },
      include: [{ model: CommandeItem, as: 'items', include: [{ model: Produit, as: 'produit' }] }],
      order: [['createdAt', 'DESC']],
    });

    return { success: true, commandes };
  }
  static async getKpiCommandes() {
    const [total, enAttente, validees, annulees, rejetees, livrees, ca] = await Promise.all([
      Commande.count(),
      Commande.count({ where: { statut: 'en_attente' } }),
      Commande.count({ where: { statut: 'validee' } }),
      Commande.count({ where: { statut: 'annulee' } }),
      Commande.count({ where: { statut: STATUT_COMMANDE.REJETEE } }),
      Commande.count({ where: { statut: 'livree' } }),
      Commande.sum('montantTotal', { where: { statut: 'livree' } }),
    ]);
    return {
      success: true,
      kpi: { total, enAttente, validees, annulees, rejetees, livrees, chiffreAffaires: ca || 0 },
    };
  }

  static async exportCommandes({ statut, userId, reference } = {}) {
    const where = {};
    if (statut) where.statut = statut;
    if (userId) where.userId = userId;
    if (reference) where.reference = reference;

    const commandes = await Commande.findAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['nom', 'prenom', 'email'] },
        { model: CommandeItem, as: 'items' },
      ],
      order: [['createdAt', 'DESC']],
    });

    const rows = commandes.map((c) => ({
      reference: c.reference,
      date: c.createdAt.toISOString().slice(0, 10),
      client: c.user ? `${c.user.prenom} ${c.user.nom}` : '',
      email: c.user ? c.user.email : '',
      statut: c.statut,
      nbArticles: c.items.reduce((sum, i) => sum + i.quantite, 0),
      montantTotal: c.montantTotal,
      fraisLivraison: c.fraisLivraison,
    }));

    const csv = toCsv(rows, [
      { key: 'reference', label: 'Référence' },
      { key: 'date', label: 'Date' },
      { key: 'client', label: 'Client' },
      { key: 'email', label: 'Email' },
      { key: 'statut', label: 'Statut' },
      { key: 'nbArticles', label: 'Nb articles' },
      { key: 'montantTotal', label: 'Montant total' },
      { key: 'fraisLivraison', label: 'Frais livraison' },
    ]);

    return { success: true, csv };
  }
}

module.exports = GestionCommandeService;
