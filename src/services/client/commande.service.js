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
const {
  FRAIS_LIVRAISON_DEFAUT,
  STATUT_COMMANDE,
  STATUT_VALIDATION_PRODUIT,
} = require('../../constants');
const { sousTotal: calcSousTotal, round2 } = require('../../utils/money');
const paginate = require('../../utils/paginate');
const { sendCommandeConfirmation } = require('../../utils/mailer');
const { acquireXact } = require('../../utils/advisoryLock');
const logger = require('../../config/logger');
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

// Le prix d'achat est réservé à l'administration : jamais renvoyé au client
// (et toute requête qui le sélectionne échoue tant que sa migration n'est pas
// appliquée).
const PRODUIT_PUBLIC = { exclude: ['prixAchat'] };

/**
 * Regroupe les lignes portant sur un même produit : un produit n'apparaît
 * qu'une fois dans la commande, avec la somme des quantités demandées.
 */
function _regrouperItems(items) {
  const quantites = new Map();
  for (const { produitId, quantite } of items) {
    quantites.set(produitId, (quantites.get(produitId) || 0) + Number(quantite));
  }
  return quantites;
}

class CommandeService {
  /**
   * Création d'une commande — logique unique partagée par le mobile
   * (`passerCommande`) et le dashboard admin (`creerCommandeAdmin`).
   *
   * - prix relus en base (aucun prix envoyé par l'appelant n'est utilisé) ;
   * - frais de livraison selon la ville de l'adresse ;
   * - verrou advisory de transaction par userId : deux créations simultanées
   *   pour le même client sont refusées (double-soumission) ;
   * - décrémentation de stock atomique (WHERE stock >= quantite) ;
   * - commande, lignes, paiement et stock dans une seule transaction.
   *
   * Options :
   * - depuisPanier : sans `items`, reprendre le panier stocké en base ;
   * - viderPanier  : vider ce panier après création ;
   * - origine / auteurId : journalisation (qui a créé la commande, et d'où).
   *
   * @returns {{ success, status?, message, commande? }}
   */
  static async creerCommande(
    userId,
    { adresseId, note, methode, items = [], dateLivraisonSouhaitee = null },
    { depuisPanier = true, viderPanier = true, origine = 'mobile', auteurId = userId } = {}
  ) {
    const adresse = await Adresse.findOne({ where: { id: adresseId, userId } });
    if (!adresse) return { success: false, status: 400, message: 'Adresse introuvable' };

    let lignesPanier = [];
    if (items && items.length > 0) {
      const quantites = _regrouperItems(items);
      const produits = await Produit.findAll({
        where: { id: [...quantites.keys()] },
        attributes: ['id', 'nom', 'prix', 'stock', 'isActive', 'statutValidation', 'vendeurId'],
      });
      const parId = new Map(produits.map((p) => [p.id, p]));
      for (const produitId of quantites.keys()) {
        if (!parId.has(produitId)) {
          return { success: false, status: 404, message: `Produit ${produitId} introuvable` };
        }
      }
      lignesPanier = [...quantites].map(([produitId, quantite]) => ({
        produitId,
        quantite,
        produit: parId.get(produitId),
      }));
    } else if (depuisPanier) {
      // Fallback : chercher dans la table Panier (pour compatibilité)
      lignesPanier = await Panier.findAll({
        where: { userId },
        include: [{ model: Produit, as: 'produit', attributes: PRODUIT_PUBLIC }],
      });
    }

    if (!lignesPanier.length)
      return {
        success: false,
        status: 400,
        message: 'Sélectionnez au moins un article à commander',
      };

    for (const ligne of lignesPanier) {
      // Même règle que le catalogue : actif ET entièrement validé (un produit
      // devient actif dès l'étape 1 de validation, avant d'être publié).
      if (
        !ligne.produit.isActive ||
        ligne.produit.statutValidation !== STATUT_VALIDATION_PRODUIT.VALIDE
      ) {
        return {
          success: false,
          status: 400,
          message: `"${ligne.produit.nom}" n'est plus disponible`,
        };
      }
    }

    const fraisLivraison = await _getFraisLivraison(adresse.ville);

    const t = await sequelize.transaction();
    let commande;
    try {
      // Libéré par PostgreSQL au COMMIT / ROLLBACK.
      await acquireXact(`commande:${userId}`, t);

      const lignesTotal = round2(
        lignesPanier.reduce(
          (sum, l) => sum + Math.round(Number(l.produit.prix) * 100) * l.quantite,
          0
        ) / 100
      );

      commande = await Commande.create(
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

      const lignes = [];
      for (const ligne of lignesPanier) {
        const quantite = Number(ligne.quantite);

        // Décrémentation atomique : WHERE stock >= quantite évite le stock négatif
        const [nbLignesAffectees] = await Produit.update(
          { stock: sequelize.literal(`stock - ${quantite}`) },
          { where: { id: ligne.produitId, stock: { [Op.gte]: quantite } }, transaction: t }
        );

        if (nbLignesAffectees === 0) {
          await t.rollback();
          const actuel = await Produit.findByPk(ligne.produitId, { attributes: ['stock'] });
          const disponible = Math.max(0, Number(actuel ? actuel.stock : ligne.produit.stock) || 0);
          return {
            success: false,
            status: 400,
            message: `Stock insuffisant pour "${ligne.produit.nom}" (disponible : ${disponible}, demandé : ${quantite})`,
          };
        }

        lignes.push({
          commandeId: commande.id,
          produitId: ligne.produitId,
          quantite,
          prixUnitaire: ligne.produit.prix,
          sousTotal: calcSousTotal(ligne.produit.prix, quantite),
        });
      }

      await CommandeItem.bulkCreate(lignes, { transaction: t });

      await Paiement.create(
        {
          commandeId: commande.id,
          userId,
          montant: commande.montantTotal,
          methode,
        },
        { transaction: t }
      );

      if (viderPanier) await Panier.destroy({ where: { userId }, transaction: t });
      await t.commit();
    } catch (err) {
      if (!t.finished) await t.rollback();
      throw err;
    }

    logger.info('Commande créée', {
      commandeId: commande.id,
      reference: commande.reference,
      userId,
      origine,
      auteurId,
      montantTotal: commande.montantTotal,
    });

    const commandeComplete = await Commande.findByPk(commande.id, {
      include: [
        {
          model: CommandeItem,
          as: 'items',
          include: [{ model: Produit, as: 'produit', attributes: PRODUIT_PUBLIC }],
        },
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
  }

  /** Passage de commande par le client (application mobile). */
  static passerCommande(userId, data) {
    return CommandeService.creerCommande(userId, data);
  }

  static async getMesCommandes(userId, { page, limit, statut } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);
    // `?statut=` est envoyé par le mobile (filtre de l'écran Mes commandes) ;
    // il était ignoré. Une valeur hors énumération ne filtre rien.
    const where = { userId };
    if (Object.values(STATUT_COMMANDE).includes(statut)) where.statut = statut;

    const { count, rows } = await Commande.findAndCountAll({
      where,
      include: [
        {
          model: CommandeItem,
          as: 'items',
          include: [{ model: Produit, as: 'produit', attributes: PRODUIT_PUBLIC }],
        },
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

  static async getCommandeDetail(userId, commandeId) {
    const commande = await Commande.findByPk(commandeId, {
      include: [
        {
          model: CommandeItem,
          as: 'items',
          include: [{ model: Produit, as: 'produit', attributes: PRODUIT_PUBLIC }],
        },
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
      // Passage conditionnel : si un autre rejet (double clic) a déjà changé le
      // statut, rien n'est modifié et le stock n'est pas restauré deux fois.
      const [modifiees] = await Commande.update(
        { statut: STATUT_COMMANDE.REJETEE, motifRejet: motif || null },
        { where: { id: commandeId, statut: STATUT_COMMANDE.EN_ATTENTE }, transaction: t }
      );
      if (modifiees === 0) {
        await t.rollback();
        return {
          success: false,
          status: 400,
          message: 'Seule une commande en attente peut être rejetée',
        };
      }

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
