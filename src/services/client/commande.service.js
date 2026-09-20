const { Op } = require('sequelize');
const {
  Commande,
  CommandeItem,
  Panier,
  Produit,
  Adresse,
  Paiement,
  FraisLivraison,
  User,
  sequelize,
} = require('../../models');
const { FRAIS_LIVRAISON_DEFAUT, STATUT_COMMANDE } = require('../../constants');
const { sousTotal: calcSousTotal, round2 } = require('../../utils/money');
const paginate = require('../../utils/paginate');
const { sendCommandeConfirmation } = require('../../utils/mailer');
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

class CommandeService {
  /**
   * Passage de commande protégé contre la double-soumission.
   * Un advisory lock PostgreSQL par userId empêche deux commandes simultanées
   * du même utilisateur. La décrémention de stock est atomique (WHERE stock >= quantite).
   */
  static async passerCommande(
    userId,
    { adresseId, note, methode, items = [], dateLivraisonSouhaitee = null }
  ) {
    // ── Advisory lock : un seul passage de commande à la fois par utilisateur ──
    const lockKey = await acquire(`commande:${userId}`);
    try {
      const adresse = await Adresse.findOne({ where: { id: adresseId, userId } });
      if (!adresse) return { success: false, message: 'Adresse introuvable' };

      // Le panier est passé du client (stocké localement), pas de la BD
      let lignesPanier = [];

      // Si items sont envoyés du client, les utiliser
      if (items && items.length > 0) {
        lignesPanier = await Promise.all(
          items.map(async (item) => {
            const produit = await Produit.findByPk(item.produitId);
            if (!produit) throw new Error(`Produit ${item.produitId} introuvable`);
            return { produitId: item.produitId, quantite: item.quantite, produit };
          })
        );
      } else {
        // Fallback : chercher dans la table Panier (pour compatibilité)
        lignesPanier = await Panier.findAll({
          where: { userId },
          include: [{ model: Produit, as: 'produit' }],
        });
      }

      if (!lignesPanier.length)
        return { success: false, message: 'Sélectionnez au moins un article à commander' };

      for (const ligne of lignesPanier) {
        if (!ligne.produit.isActive) {
          return { success: false, message: `"${ligne.produit.nom}" n'est plus disponible` };
        }
      }

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
            dateLivraisonSouhaitee,
          },
          { transaction: t }
        );

        const items = [];
        for (const ligne of lignesPanier) {
          const quantite = Number(ligne.quantite);

          // Décrémentation atomique : WHERE stock >= quantite évite le stock négatif
          const [nbLignesAffectees] = await Produit.update(
            { stock: sequelize.literal(`stock - ${quantite}`) },
            { where: { id: ligne.produitId, stock: { [Op.gte]: quantite } }, transaction: t }
          );

          if (nbLignesAffectees === 0) {
            await t.rollback();
            return { success: false, message: `Stock insuffisant pour "${ligne.produit.nom}"` };
          }

          items.push({
            commandeId: commande.id,
            produitId: ligne.produitId,
            quantite,
            prixUnitaire: ligne.produit.prix,
            sousTotal: calcSousTotal(ligne.produit.prix, quantite),
          });
        }

        await CommandeItem.bulkCreate(items, { transaction: t });

        await Paiement.create(
          {
            commandeId: commande.id,
            userId,
            montant: commande.montantTotal,
            methode,
          },
          { transaction: t }
        );

        await Panier.destroy({ where: { userId }, transaction: t });
        await t.commit();

        const commandeComplete = await Commande.findByPk(commande.id, {
          include: [
            { model: CommandeItem, as: 'items', include: [{ model: Produit, as: 'produit' }] },
            { model: Paiement, as: 'paiement' },
          ],
        });

        const user = await User.findByPk(userId, { attributes: ['email'] });
        if (user) await sendCommandeConfirmation(user.email, commandeComplete);

        // Les vendeurs concernés sont prévenus qu'une commande porte sur leurs
        // produits. Émission « au mieux » : la commande est déjà validée, une
        // notification en échec ne doit pas la remettre en cause.
        await NotificationService.emettre({
          userIds: commandeComplete.items.map((i) => i.produit?.vendeurId),
          titre: 'Nouvelle commande',
          message: `La commande ${commandeComplete.reference} contient vos produits.`,
          type: 'commande',
          donnees: { commandeId: commandeComplete.id },
        });

        return {
          success: true,
          message: 'Commande passée avec succès',
          commande: commandeComplete,
        };
      } catch (err) {
        await t.rollback();
        throw err;
      }
    } finally {
      await release(lockKey);
    }
  }

  static async getMesCommandes(userId, { page, limit } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);

    const { count, rows } = await Commande.findAndCountAll({
      where: { userId },
      include: [{ model: CommandeItem, as: 'items', include: [{ model: Produit, as: 'produit' }] }],
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

  static async getCommandeDetail(userId, commandeId) {
    const commande = await Commande.findByPk(commandeId, {
      include: [
        { model: CommandeItem, as: 'items', include: [{ model: Produit, as: 'produit' }] },
        { model: Adresse, as: 'adresse' },
        { model: Paiement, as: 'paiement' },
      ],
    });

    if (!commande) return { success: false, status: 404, message: 'Commande introuvable' };
    if (commande.userId !== userId)
      return { success: false, status: 403, message: 'Cette commande ne vous appartient pas' };

    return { success: true, commande };
  }

  static async annulerCommande(userId, commandeId) {
    const commande = await Commande.findByPk(commandeId, {
      include: [{ model: CommandeItem, as: 'items' }],
    });

    if (!commande) return { success: false, status: 404, message: 'Commande introuvable' };
    if (commande.userId !== userId)
      return { success: false, status: 403, message: 'Cette commande ne vous appartient pas' };
    if (commande.statut !== STATUT_COMMANDE.EN_ATTENTE) {
      return {
        success: false,
        status: 400,
        message: 'Seule une commande en attente peut être annulée',
      };
    }

    const t = await sequelize.transaction();
    try {
      await Promise.all(
        commande.items.map((item) =>
          Produit.increment('stock', {
            by: item.quantite,
            where: { id: item.produitId },
            transaction: t,
          })
        )
      );
      await commande.update({ statut: STATUT_COMMANDE.ANNULEE }, { transaction: t });
      await t.commit();
      return { success: true, message: 'Commande annulée avec succès', commande };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }

  static async validerCommande(commandeId) {
    const commande = await Commande.findByPk(commandeId);
    if (!commande) {
      return { success: false, status: 404, message: 'Commande introuvable' };
    }
    if (commande.statut !== STATUT_COMMANDE.EN_ATTENTE) {
      return {
        success: false,
        status: 400,
        message: 'Seule une commande en attente peut être validée',
      };
    }

    await commande.update({ statut: STATUT_COMMANDE.VALIDEE });
    const commandeComplete = await Commande.findByPk(commandeId, {
      include: [
        { model: CommandeItem, as: 'items', include: [{ model: Produit, as: 'produit' }] },
        { model: Paiement, as: 'paiement' },
      ],
    });

    return { success: true, message: 'Commande validée avec succès', commande: commandeComplete };
  }

  static async rejeterCommande(commandeId, { motif } = {}) {
    const commande = await Commande.findByPk(commandeId, {
      include: [{ model: CommandeItem, as: 'items' }],
    });

    if (!commande) {
      return { success: false, status: 404, message: 'Commande introuvable' };
    }
    if (commande.statut !== STATUT_COMMANDE.EN_ATTENTE) {
      return {
        success: false,
        status: 400,
        message: 'Seule une commande en attente peut être rejetée',
      };
    }

    const t = await sequelize.transaction();
    try {
      // Restaurer le stock des produits rejetés
      await Promise.all(
        commande.items.map((item) =>
          Produit.increment('stock', {
            by: item.quantite,
            where: { id: item.produitId },
            transaction: t,
          })
        )
      );

      await commande.update(
        { statut: STATUT_COMMANDE.REJETEE, motifRejet: motif || null },
        { transaction: t }
      );
      await t.commit();

      const commandeComplete = await Commande.findByPk(commandeId, {
        include: [
          { model: CommandeItem, as: 'items', include: [{ model: Produit, as: 'produit' }] },
          { model: Paiement, as: 'paiement' },
        ],
      });

      return { success: true, message: 'Commande rejetée avec succès', commande: commandeComplete };
    } catch (err) {
      await t.rollback();
      throw err;
    }
  }
}

module.exports = CommandeService;
