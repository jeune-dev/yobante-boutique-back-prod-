// ─────────────────────────────────────────────────────────────
// services/admin/commande.service.js
// ─────────────────────────────────────────────────────────────
const { Op } = require('sequelize');
const {
  Commande,
  CommandeItem,
  Produit,
  User,
  Adresse,
  Paiement,
  sequelize,
  Panier,
  FraisLivraison,
} = require('../../models');
const paginate = require('../../utils/paginate');
const { sendCommandeStatut, sendCommandeConfirmation } = require('../../utils/mailer');
const { toCsv } = require('../../utils/csv');
const { sousTotal: calcSousTotal, round2 } = require('../../utils/money');
const { FRAIS_LIVRAISON_DEFAUT } = require('../../constants');
const { acquire, release } = require('../../utils/advisoryLock');
const NotificationService = require('../notification');

function _genererReference() {
  return `CMD-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

async function _getFraisLivraison(ville) {
  if (ville) {
    const tarif = await FraisLivraison.findOne({ where: { ville, isActive: true } });
    if (tarif) return Number(tarif.montant);
  }
  return FRAIS_LIVRAISON_DEFAUT;
}

const TRANSITIONS = {
  validee: 'en_attente',
  en_preparation: 'validee',
  expediee: 'en_preparation',
  livree: 'expediee',
};

class GestionCommandeService {
  static async creerCommandeAdmin(
    userId,
    { adresseId, note, methode, items = [], dateLivraisonSouhaitee = null }
  ) {
    const lockKey = await acquire(`commande:${userId}`);
    try {
      const adresse = await Adresse.findOne({ where: { id: adresseId, userId } });
      if (!adresse) return { success: false, message: 'Adresse introuvable' };

      const lignesPanier = await Promise.all(
        items.map(async (item) => {
          const produit = await Produit.findByPk(item.produitId);
          if (!produit) throw new Error(`Produit ${item.produitId} introuvable`);
          return { produitId: item.produitId, quantite: item.quantite, produit };
        })
      );

      if (!lignesPanier.length)
        return { success: false, message: 'Sélectionnez au moins un article' };

      const fraisLivraison = await _getFraisLivraison(adresse.ville);

      const t = await sequelize.transaction();
      try {
        const lignesTotal = round2(
          lignesPanier.reduce(
            (sum, l) => sum + Math.round(Number(l.produit.prix) * 100) * l.quantite,
            0
          ) / 100
        );

        const commande = await Commande.create(
          {
            reference: _genererReference(),
            userId,
            adresseId,
            montantTotal: round2(lignesTotal + fraisLivraison),
            fraisLivraison,
            note,
            statut: 'validee',
            dateLivraisonSouhaitee,
          },
          { transaction: t }
        );

        const commandeItems = [];
        for (const ligne of lignesPanier) {
          const quantite = Number(ligne.quantite);
          const [nbLignesAffectees] = await Produit.update(
            { stock: sequelize.literal(`stock - ${quantite}`) },
            { where: { id: ligne.produitId, stock: { [Op.gte]: quantite } }, transaction: t }
          );

          if (nbLignesAffectees === 0) {
            await t.rollback();
            return { success: false, message: `Stock insuffisant pour "${ligne.produit.nom}"` };
          }

          commandeItems.push({
            commandeId: commande.id,
            produitId: ligne.produitId,
            quantite,
            prixUnitaire: ligne.produit.prix,
            sousTotal: calcSousTotal(ligne.produit.prix, quantite),
          });
        }

        await CommandeItem.bulkCreate(commandeItems, { transaction: t });
        await Paiement.create(
          {
            commandeId: commande.id,
            userId,
            montant: commande.montantTotal,
            methode,
            statut: 'succes',
          },
          { transaction: t }
        );

        await t.commit();
        return { success: true, message: 'Commande créée avec succès', commandeId: commande.id };
      } catch (err) {
        await t.rollback();
        throw err;
      }
    } finally {
      await release(lockKey);
    }
  }

  static async getAllCommandes({ page, limit, statut, userId, reference } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);

    const where = {};
    if (statut) where.statut = statut;
    if (userId) where.userId = userId;
    if (reference) where.reference = reference;

    const { count, rows } = await Commande.findAndCountAll({
      where,
      include: [
        { model: User, as: 'user', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: CommandeItem, as: 'items', include: [{ model: Produit, as: 'produit' }] },
      ],
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
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
        { model: User, as: 'user' },
        { model: Adresse, as: 'adresse' },
        { model: CommandeItem, as: 'items', include: [{ model: Produit, as: 'produit' }] },
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

  static async rejeterCommande(id, raison) {
    const commande = await Commande.findByPk(id, {
      include: [
        { model: CommandeItem, as: 'items' },
        { model: User, as: 'user' },
      ],
    });

    if (!commande) {
      return { success: false, message: 'Commande introuvable' };
    }

    if (['livree', 'annulee'].includes(commande.statut)) {
      return { success: false, message: 'Cette commande ne peut plus être annulée' };
    }

    const t = await sequelize.transaction();
    try {
      for (const item of commande.items) {
        await Produit.increment('stock', {
          by: item.quantite,
          where: { id: item.produitId },
          transaction: t,
        });
      }

      await commande.update({ statut: 'annulee', noteAdmin: raison }, { transaction: t });
      await t.commit();

      if (commande.user) await sendCommandeStatut(commande.user.email, commande, 'annulee');

      return { success: true, message: 'Commande rejetée avec succès', commande };
    } catch (err) {
      await t.rollback();
      throw err;
    }
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
    const [total, enAttente, validees, annulees, livrees, ca] = await Promise.all([
      Commande.count(),
      Commande.count({ where: { statut: 'en_attente' } }),
      Commande.count({ where: { statut: 'validee' } }),
      Commande.count({ where: { statut: 'annulee' } }),
      Commande.count({ where: { statut: 'livree' } }),
      Commande.sum('montantTotal', { where: { statut: 'livree' } }),
    ]);
    return {
      success: true,
      kpi: { total, enAttente, validees, annulees, livrees, chiffreAffaires: ca || 0 },
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
