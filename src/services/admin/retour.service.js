const { Op } = require('sequelize');
const { Retour, Commande, CommandeItem, Produit, User, sequelize } = require('../../models');
const paginate = require('../../utils/paginate');
const logger = require('../../config/logger');
const { MOTIF_RETOUR, STATUT_RETOUR, STATUT_COMMANDE, RESPONSABILITE } = require('../../constants');
const { tracerMouvementRetour } = require('../mouvementStock.service');

/**
 * Retours produits côté administration.
 *
 * Le mobile n'expose aucun parcours de retour : les retours sont saisis par
 * l'administration à partir de ce que le client signale. Le service reste donc
 * permissif sur l'origine, mais strict sur la cohérence — l'article doit
 * appartenir à la commande, et la quantité ne peut pas excéder ce qui a été
 * livré ni ce qui reste à retourner.
 */
class RetourService {
  /**
   * Quantité déjà retournée pour une ligne de commande, hors retours refusés.
   * Empêche de retourner 5 unités d'un article commandé en 3 exemplaires.
   */
  static async _quantiteDejaRetournee(commandeItemId, exclureId = null) {
    const where = {
      commandeItemId,
      statut: { [Op.ne]: STATUT_RETOUR.REFUSE },
    };
    if (exclureId) where.id = { [Op.ne]: exclureId };

    const total = await Retour.sum('quantite', { where });
    return Number(total) || 0;
  }

  static async creerRetour({
    commandeId,
    commandeItemId,
    quantite = 1,
    motif,
    motifDetail,
    responsabilite,
    vendeurResponsableId,
    remisEnStock = false,
    adminId,
  }) {
    if (!Object.values(MOTIF_RETOUR).includes(motif)) {
      return { success: false, message: 'Motif de retour inconnu' };
    }
    // Un motif « autre » sans précision rend les statistiques inexploitables.
    if (motif === MOTIF_RETOUR.AUTRE && !motifDetail?.trim()) {
      return { success: false, message: 'Le motif « autre » exige une précision' };
    }

    const item = await CommandeItem.findByPk(commandeItemId, {
      include: [
        { model: Commande, as: 'commande', attributes: ['id', 'userId', 'statut'] },
        {
          model: Produit.scope('administration'),
          as: 'produit',
          attributes: ['id', 'vendeurId'],
        },
      ],
    });

    if (!item) return { success: false, message: 'Article de commande introuvable' };
    if (item.commandeId !== commandeId) {
      return { success: false, message: "Cet article n'appartient pas à la commande indiquée" };
    }
    // On ne retourne pas un article qui n'est jamais parti.
    if (item.commande?.statut !== STATUT_COMMANDE.LIVREE) {
      return { success: false, message: 'Seule une commande livrée peut faire un retour' };
    }

    const dejaRetournee = await RetourService._quantiteDejaRetournee(commandeItemId);
    const restante = Number(item.quantite) - dejaRetournee;
    if (quantite > restante) {
      return {
        success: false,
        message: `Quantité trop élevée : ${restante} unité(s) retournable(s) sur cet article`,
      };
    }

    // Responsabilité vendeur sans vendeur nommé : on retombe sur le vendeur du
    // produit, seule information dont on dispose à coup sûr.
    const responsable =
      responsabilite === RESPONSABILITE.VENDEUR
        ? vendeurResponsableId || item.produit?.vendeurId || null
        : vendeurResponsableId || null;

    const retour = await Retour.create({
      commandeId,
      commandeItemId,
      produitId: item.produitId,
      userId: item.commande?.userId || null,
      quantite,
      motif,
      motifDetail: motifDetail?.trim() || null,
      statut: STATUT_RETOUR.DEMANDE,
      responsabilite: responsabilite || null,
      vendeurResponsableId: responsable,
      remisEnStock: false,
      traitePar: adminId || null,
    });

    // La remise en stock demandée dès la création passe par le même chemin
    // qu'un traitement : un seul endroit touche au stock.
    if (remisEnStock) {
      return RetourService.traiterRetour(retour.id, {
        statut: STATUT_RETOUR.ACCEPTE,
        remisEnStock: true,
        adminId,
      });
    }

    return { success: true, message: 'Retour enregistré', retour };
  }

  /**
   * Fait avancer un retour. La remise en stock est idempotente : repasser un
   * retour déjà remis en stock ne recrédite pas le produit une seconde fois.
   */
  static async traiterRetour(
    id,
    { statut, montantRembourse, remisEnStock, responsabilite, adminId } = {}
  ) {
    if (statut && !Object.values(STATUT_RETOUR).includes(statut)) {
      return { success: false, message: 'Statut de retour inconnu' };
    }

    return await sequelize.transaction(async (transaction) => {
      const retour = await Retour.findByPk(id, { transaction });
      if (!retour) return { success: false, message: 'Retour introuvable' };

      const doitRemettreEnStock = remisEnStock === true && !retour.remisEnStock;
      const doitRetirerDuStock = remisEnStock === false && retour.remisEnStock;

      if (doitRemettreEnStock || doitRetirerDuStock) {
        const produit = await Produit.findByPk(retour.produitId, { transaction });
        if (produit) {
          const delta = doitRemettreEnStock ? retour.quantite : -retour.quantite;
          await produit.increment('stock', { by: delta, transaction });
          // Journal du stock, dans la même transaction que l'incrément : le
          // retour est le seul chemin où le stock bouge après la livraison.
          await tracerMouvementRetour(
            { retour, remiseEnStock: doitRemettreEnStock, auteurId: adminId || null },
            transaction
          );
        } else {
          logger.warn('[Retour] Produit absent, stock non ajusté', { retourId: id });
        }
      }

      await retour.update(
        {
          ...(statut ? { statut } : {}),
          ...(montantRembourse !== undefined ? { montantRembourse } : {}),
          ...(remisEnStock !== undefined ? { remisEnStock } : {}),
          ...(responsabilite !== undefined ? { responsabilite } : {}),
          traitePar: adminId || retour.traitePar,
        },
        { transaction }
      );

      return { success: true, message: 'Retour mis à jour', retour };
    });
  }

  static async listerRetours({
    page,
    limit,
    statut,
    motif,
    produitId,
    commandeId,
    vendeurId,
  } = {}) {
    const { page: p, limit: l, offset } = paginate(page, limit);

    const where = {};
    if (statut) where.statut = statut;
    if (motif) where.motif = motif;
    if (produitId) where.produitId = produitId;
    if (commandeId) where.commandeId = commandeId;
    if (vendeurId) where.vendeurResponsableId = vendeurId;

    const { count, rows } = await Retour.findAndCountAll({
      where,
      include: [
        { model: Commande, as: 'commande', attributes: ['id', 'reference', 'createdAt'] },
        {
          model: Produit.scope('administration'),
          as: 'produit',
          attributes: ['id', 'nom', 'slug', 'images'],
        },
        { model: User, as: 'client', attributes: ['id', 'nom', 'prenom', 'email'] },
        { model: User, as: 'vendeurResponsable', attributes: ['id', 'nom', 'prenom'] },
        { model: CommandeItem, as: 'commandeItem', attributes: ['id', 'quantite', 'prixUnitaire'] },
      ],
      order: [['createdAt', 'DESC']],
      limit: l,
      offset,
    });

    return {
      success: true,
      retours: rows,
      pagination: { total: count, totalPages: Math.ceil(count / l), page: p, limit: l },
    };
  }

  /**
   * KPI des retours : volume, taux et répartition par motif.
   *
   * Le taux rapporte les quantités retournées aux quantités **livrées** sur la
   * même période, pas au nombre de commandes : retourner 2 articles sur une
   * commande de 10 n'est pas un taux de 100 %.
   */
  static async getKpiRetours({ debut, fin } = {}) {
    const bornes = {
      debut: debut ? new Date(debut).toISOString() : null,
      fin: fin ? new Date(new Date(fin).setHours(23, 59, 59, 999)).toISOString() : null,
    };

    const [volumes, livrees, parMotif] = await Promise.all([
      sequelize.query(
        `
        SELECT
          COUNT(*)                             AS "nombreRetours",
          COALESCE(SUM(quantite), 0)           AS "quantiteRetournee",
          COALESCE(SUM("montantRembourse"), 0) AS "montantRembourse"
        FROM retours
        WHERE statut <> :refuse
          AND (CAST(:debut AS timestamptz) IS NULL OR "createdAt" >= CAST(:debut AS timestamptz))
          AND (CAST(:fin   AS timestamptz) IS NULL OR "createdAt" <= CAST(:fin   AS timestamptz))
        `,
        {
          replacements: { refuse: STATUT_RETOUR.REFUSE, ...bornes },
          type: sequelize.QueryTypes.SELECT,
        }
      ),
      sequelize.query(
        `
        SELECT COALESCE(SUM(ci.quantite), 0) AS "quantiteLivree"
        FROM commande_items ci
        JOIN commandes c ON c.id = ci."commandeId"
        WHERE c.statut = :livree
          AND (CAST(:debut AS timestamptz) IS NULL OR c."createdAt" >= CAST(:debut AS timestamptz))
          AND (CAST(:fin   AS timestamptz) IS NULL OR c."createdAt" <= CAST(:fin   AS timestamptz))
        `,
        {
          replacements: { livree: STATUT_COMMANDE.LIVREE, ...bornes },
          type: sequelize.QueryTypes.SELECT,
        }
      ),
      sequelize.query(
        `
        SELECT
          motif,
          COUNT(*)                   AS "nombre",
          COALESCE(SUM(quantite), 0) AS "quantite"
        FROM retours
        WHERE statut <> :refuse
          AND (CAST(:debut AS timestamptz) IS NULL OR "createdAt" >= CAST(:debut AS timestamptz))
          AND (CAST(:fin   AS timestamptz) IS NULL OR "createdAt" <= CAST(:fin   AS timestamptz))
        GROUP BY motif
        ORDER BY 2 DESC
        `,
        {
          replacements: { refuse: STATUT_RETOUR.REFUSE, ...bornes },
          type: sequelize.QueryTypes.SELECT,
        }
      ),
    ]);

    const quantiteRetournee = Number(volumes[0].quantiteRetournee) || 0;
    const quantiteLivree = Number(livrees[0].quantiteLivree) || 0;

    return {
      success: true,
      kpi: {
        nombreRetours: Number(volumes[0].nombreRetours) || 0,
        quantiteRetournee,
        quantiteLivree,
        montantRembourse: Number(volumes[0].montantRembourse) || 0,
        tauxRetour: quantiteLivree
          ? Number(((quantiteRetournee / quantiteLivree) * 100).toFixed(1))
          : 0,
        formuleTauxRetour: 'quantité retournée / quantité livrée sur la période',
      },
      // Tous les motifs sont présents, même à zéro : un graphique dont la
      // légende change à chaque rafraîchissement est illisible.
      parMotif: Object.values(MOTIF_RETOUR).map((m) => {
        const ligne = parMotif.find((r) => r.motif === m);
        return {
          motif: m,
          nombre: Number(ligne?.nombre) || 0,
          quantite: Number(ligne?.quantite) || 0,
        };
      }),
    };
  }
}

module.exports = RetourService;
